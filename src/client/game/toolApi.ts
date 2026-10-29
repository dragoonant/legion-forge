// Live movement-tool preview for the client (docs/spec/50 section 4, `move.tool`). Until `query.toolPreview` exists this composes
// the engine's own solver (`fitTool`, `poseFromHinge`, `validateToolPose` through `validate`) so what the ghost shows is exactly what
// `validate` accepts. The client never computes a rules number: every verdict, path and placement below is the engine's.
import { act, validate, type Action, type GameState, type PendingDecision, type Pose2, type Seat, type ToolPose, type Vec2 } from '@/engine'
import { moverFor, planMove, planTroopers, worldFor, defaultTarget } from '@/engine/movement'
import { flowOf } from '@/engine/battle'
import { fitTool, nearestLegalSpot, poseFromHinge, toolShape, type ToolShape } from '@/engine/tool'
import { leaderOf } from '@/engine/state'
import { inBaseContact, miniBody } from '@/engine/measure'

export interface ToolPreview {
  ok: boolean
  /** why validate would reject (check text from the engine) */
  reason: string | null
  pose: ToolPose | null
  leader: Pose2 | null
  shape: ToolShape | null
  /** the hinge point, for the drag handle */
  hinge: Vec2 | null
  speed: number | null
  /** the engine's tool path rounded for display: start, hinge, tip */
  path: Vec2[]
  /** troopers around the new leader spot (cohesion preview), or [] */
  troopers: { miniId: string; x: number; z: number; outOfCohesion: boolean }[]
  /** the answer to send when ok */
  action: Action | null
  /** inches of tool used (sum of segments) for the readout, from the data */
  toolLength: number | null
  /** the most speed the unit may use here after difficult terrain, when known */
  effectiveSpeed: number | null
}

const EMPTY: ToolPreview = { ok: false, reason: null, pose: null, leader: null, shape: null, hinge: null, speed: null, path: [], troopers: [], action: null, toolLength: null, effectiveSpeed: null }

export const moveUnitId = (state: GameState, pending: PendingDecision): string | null => (typeof pending.context.unitId === 'string' ? pending.context.unitId : flowOf(state).move?.unitId ?? null)

function build(state: GameState, pending: PendingDecision, seat: Seat, pose: ToolPose, leader: Pose2, unitId: string): ToolPreview {
  const action = act.tool(pending, pose, leader)
  const rej = validate(state, action)
  const shape = toolShape(state.data.tool, pose)
  const sp = state.data.tool.speeds[String(pose.speed) as '1' | '2' | '3']
  const unit = state.units[unitId]!
  let troopers: ToolPreview['troopers'] = []
  if (!rej && unit.location === 'table' && unit.minis.filter((m) => m.alive).length > 1) {
    try {
      const lead = leaderOf(unit)
      const dx = leader.x - lead.pos.x
      const dz = leader.z - lead.pos.z
      const old = new Map(unit.minis.map((m) => [m.id, { x: m.pos.x, z: m.pos.z }]))
      const plan = planTroopers(state, unit, { leader: { x: leader.x, y: lead.pos.y, z: leader.z }, prefer: (id) => ({ x: old.get(id)!.x + dx, z: old.get(id)!.z + dz }) })
      troopers = plan.placements.map((p) => ({ miniId: p.miniId, x: p.x, z: p.z, outOfCohesion: p.outOfCohesion }))
    } catch {
      troopers = []
    }
  }
  void seat
  return {
    ok: !rej,
    reason: rej ? rej.reason : null,
    pose,
    leader,
    shape,
    hinge: shape.hinge,
    speed: pose.speed,
    path: shape.path,
    troopers,
    action: rej ? null : action,
    toolLength: sp ? sp.segments[0] + sp.segments[1] : null,
    effectiveSpeed: null,
  }
}

/** The tool toward a clicked destination: the engine's own fit (R-6.5), or the reason nothing fits (with the nearest legal spot as a hint). */
export function previewToward(state: GameState, pending: PendingDecision, target: Vec2): ToolPreview {
  const unitId = moveUnitId(state, pending)
  const frame = flowOf(state).move
  if (!unitId || !frame) return EMPTY
  const unit = state.units[unitId]!
  const seat = unit.seat
  if (unit.location !== 'table') {
    const plan = planMove(state, frame, target, false)
    if (!plan) return { ...EMPTY, reason: 'No tool placement enters the table near there.' }
    return build(state, pending, seat, plan.pose, plan.leader, unitId)
  }
  const world = worldFor(state, seat, unitId)
  const mover = moverFor(state, unit, frame)
  const climb = frame.kind === 'climb'
  const fit = fitTool(world, mover, target, { maxSpeed: mover.maxSpeed, climb })
  if (fit.ok) return build(state, pending, seat, fit.pose, fit.leader, unitId)
  // not reachable: show the failure at the click, so the player sees why; the nearest reachable spot is returned as a hint
  const near = nearestLegalSpot(world, mover, target, { maxSpeed: mover.maxSpeed, climb })
  const hint = near ? build(state, pending, seat, near.spot.pose, near.spot.leader, unitId) : null
  return { ...(hint ?? EMPTY), ok: false, action: null, reason: fit.reason, leader: hint?.leader ?? null }
}

/** The tool with its hinge dragged to `hingePoint`, re-solved toward `target` (the current destination). */
export function previewHinge(state: GameState, pending: PendingDecision, speed: number, hingePoint: Vec2, target: Vec2): ToolPreview {
  const unitId = moveUnitId(state, pending)
  const frame = flowOf(state).move
  if (!unitId || !frame) return EMPTY
  const unit = state.units[unitId]!
  if (unit.location !== 'table') return EMPTY
  const world = worldFor(state, unit.seat, unitId)
  const mover = moverFor(state, unit, frame)
  const { pose } = poseFromHinge(world, mover, speed, hingePoint, target)
  const sp = world.tool.speeds[String(speed) as '1' | '2' | '3']
  const shape = toolShape(world.tool, pose)
  // the leader ends at the tool's tip, as far as the target lies along the second segment
  const tip = shape.path[2]
  const hinge = shape.path[1]
  const seg2 = Math.hypot(tip.x - hinge.x, tip.z - hinge.z)
  const want = Math.min(seg2, Math.max(0, Math.hypot(target.x - hinge.x, target.z - hinge.z)))
  const f = seg2 > 0 ? want / seg2 : 0
  const spot = { x: hinge.x + (tip.x - hinge.x) * f, z: hinge.z + (tip.z - hinge.z) * f }
  const leader: Pose2 = { x: Math.round(spot.x * 1000) / 1000, z: Math.round(spot.z * 1000) / 1000, yaw: Math.atan2(tip.x - hinge.x, tip.z - hinge.z) }
  void sp
  return build(state, pending, unit.seat, pose, leader, unitId)
}

/** Where a unit would head by default (the nearest objective or enemy): the starting point of the ghost before any hover. */
export function startingTarget(state: GameState, pending: PendingDecision): Vec2 | null {
  const unitId = moveUnitId(state, pending)
  const unit = unitId ? state.units[unitId] : null
  return unit ? defaultTarget(state, unit) : null
}

/** The enemy unit a Move ending with the leader at `leader` would touch (a charge, R-16.1), by the engine's own base-contact test. */
export function chargeTarget(state: GameState, unitId: string, leader: Pose2): string | null {
  const unit = state.units[unitId]
  if (!unit || unit.location !== 'table') return null
  const body = { ...miniBody(state, leaderOf(unit)), pos: { x: leader.x, z: leader.z } }
  for (const o of Object.values(state.units)) {
    if (o.seat === unit.seat || o.location !== 'table') continue
    for (const m of o.minis) {
      if (m.alive && inBaseContact(body, miniBody(state, m), state.data.constants)) return o.id
    }
  }
  return null
}
