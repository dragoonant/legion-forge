// Tool sampling (docs/spec/40-ai.md section 5, step 2): propose end points for a Move, rank them cheaply with the position value,
// and fit the best of them to a legal pose of the engine's hinged movement tool. `validateToolPose` is the only judge of
// legality; the AI never decides where a base may stand.
import { act, validate } from '@/engine'
import type { Action } from '@/engine'
import { moverFor, planMove, worldFor } from '@/engine/movement'
import { poseAt, validateToolPose } from '@/engine/tool'
import { round3 } from '@/engine/geometry'
import type { GameState, MoveFrame, Pose2, ToolPose, Unit, Vec2 } from '@/engine'
import { dist, leaderPos, maxRange, overlay, tieBreak, typicalValue } from './eval'
import { approachCost, goalsFor, objectiveScore, quietRounds, unitPos } from './goals'
import { enemiesOf, losBlocked, threatAt } from './threat'
import { COST, spend, exhausted, type AiCtx } from './tiers'

export interface Spot {
  pose: ToolPose
  leader: Pose2
  speed: number
  /** cheap value of standing here (position value plus a shot proxy) */
  value: number
}

const BENDS = [0, 0.5, -0.5, 1.0, -1.0]

/** Friends close enough to cover each other's flanks and carry the Commander's courage. */
function support(ctx: AiCtx, state: GameState, u: Unit): number {
  let n = 0
  const at = leaderPos(u)
  for (const o of Object.values(state.units)) {
    if (o.id === u.id || o.seat !== u.seat || o.location !== 'table') continue
    if (dist(leaderPos(o), at) <= 6) n++
  }
  return Math.min(2, n) * ctx.w.cohesion
}

/** The value of the board for this seat if `unitId` ends its activation as it stands in `state` (before attacks). */
export function stateValue(ctx: AiCtx, state: GameState, unitId: string): number {
  const u = state.units[unitId]!
  let v = objectiveScore(ctx, state, ctx.seat, unitId)
  v -= threatAt(ctx, state, u)
  const goal = goalsFor(ctx).get(unitId)
  if (goal) v -= approachCost(ctx, goal, unitPos(state, u), quietRounds(ctx))
  v += support(ctx, state, u)
  return v
}

/** A shot proxy for ranking end points: the best open-ground value of the unit against an enemy it could reach from here. */
export function shotProxy(ctx: AiCtx, state: GameState, u: Unit, at: Vec2): number {
  const range = maxRange(state, u)
  if (range <= 0) return 0
  let best = 0
  for (const e of enemiesOf(ctx)) {
    if (dist(e.pos, at) > range + 2.5) continue
    let v = typicalValue(ctx, state, u, e.unit)
    if (losBlocked(state, at, e.pos)) v *= 0.3
    best = Math.max(best, v)
  }
  return best * 0.7
}

/** Raw end points for the leader: rings around it, toward each goal, onto markers in reach and onto nearby cover. */
function proposeTargets(ctx: AiCtx, state: GameState, u: Unit, reach: number): Vec2[] {
  const from = leaderPos(u)
  const out: Vec2[] = []
  const add = (p: Vec2) => {
    const b = state.table.def.bounds
    const q = { x: Math.max(b.minX + 1, Math.min(b.maxX - 1, p.x)), z: Math.max(b.minZ + 1, Math.min(b.maxZ - 1, p.z)) }
    if (dist(q, from) < 0.4) return
    if (out.some((o) => dist(o, q) < 0.7)) return
    out.push({ x: round3(q.x), z: round3(q.z) })
  }
  const ringN = ctx.tier === 'easy' ? 8 : 12
  for (const f of [1, 0.62, 0.3]) for (let i = 0; i < ringN; i++) add({ x: from.x + Math.sin((2 * Math.PI * i) / ringN) * reach * f, z: from.z + Math.cos((2 * Math.PI * i) / ringN) * reach * f })
  const goal = goalsFor(ctx).get(u.id)
  const toward = (g: Vec2, stand: number) => {
    const d = dist(from, g)
    if (d < 0.5) return
    const ux = (g.x - from.x) / d
    const uz = (g.z - from.z) / d
    const go = Math.min(reach, Math.max(0.6, d - stand))
    for (const a of [0, 0.35, -0.35, 0.7, -0.7]) {
      const c = Math.cos(a)
      const s = Math.sin(a)
      add({ x: from.x + (ux * c - uz * s) * go, z: from.z + (uz * c + ux * s) * go })
    }
    // the spot beside the goal itself when it is within reach
    if (d - stand <= reach) add({ x: g.x - ux * stand, z: g.z - uz * stand })
  }
  if (goal) toward(goal.pos, goal.stand)
  for (const e of enemiesOf(ctx)) {
    if (e.range > 0) toward(e.pos, Math.max(e.range * 0.5, 4))
  }
  // cover within reach: the middle of a covering piece and the spot just inside its edge toward us
  for (const p of state.table.def.pieces) {
    if (p.cover === 'none' || p.movement === 'impassable') continue
    const cx = (p.bbox.minX + p.bbox.maxX) / 2
    const cz = (p.bbox.minZ + p.bbox.maxZ) / 2
    if (dist({ x: cx, z: cz }, from) <= reach + 1) add({ x: cx, z: cz })
  }
  return out
}

/** Cheap-ranked, legal end spots for a Move of `unit` (up to `limit`), best first. */
export function proposeSpots(ctx: AiCtx, unit: Unit, kind: MoveFrame['kind'], maxSpeed: number, limit: number): Spot[] {
  const state = ctx.view
  const frame: MoveFrame = { unitId: unit.id, seat: unit.seat, kind, maxSpeed, free: false }
  const deploying = unit.location !== 'table'
  const world = worldFor(state, unit.seat, unit.id)
  const mover = moverFor(state, unit, frame)
  const climb = kind === 'climb'
  const tool = state.data.tool.speeds
  const longest = Math.min(3, climb || kind === 'withdraw' ? 1 : maxSpeed)
  const reach = mover.baseRadius * 2 + tool[String(longest) as '1' | '2' | '3'].segments[0] + tool[String(longest) as '1' | '2' | '3'].segments[1]
  const targets = deploying ? deployTargets(ctx, state, unit) : proposeTargets(ctx, state, unit, reach)
  const scored = targets.map((t) => {
    const ov = overlay(state, unit.id, { leaderAt: t, moved: true })
    return { t, v: stateValue(ctx, ov, unit.id) + shotProxy(ctx, ov, unit, t) + tieBreak(`${unit.id}:${t.x},${t.z}`) }
  })
  scored.sort((a, b) => b.v - a.v)
  const spots: Spot[] = []
  for (const { t, v } of scored.slice(0, Math.max(ctx.params.samples, limit))) {
    if (spots.length >= limit || exhausted(ctx)) break
    if (spots.some((s) => dist(s.leader, t) < 0.9)) continue
    if (deploying) {
      if (!spend(ctx, COST.plan)) break
      const plan = planMove(state, frame, t, true)
      if (!plan) continue
      spots.push({ pose: plan.pose, leader: plan.leader, speed: plan.pose.speed, value: v })
      continue
    }
    const theta = Math.atan2(t.x - mover.pos.x, t.z - mover.pos.z)
    const d = Math.hypot(t.x - mover.pos.x, t.z - mover.pos.z)
    const leader: Pose2 = { x: round3(t.x), z: round3(t.z), yaw: theta }
    let fit: Spot | null = null
    for (let speed = 1; speed <= longest && !fit; speed++) {
      const sp = tool[String(speed) as '1' | '2' | '3']
      if (d > mover.baseRadius * 2 + sp.segments[0] + sp.segments[1] + 0.01) continue
      for (const bend of BENDS) {
        if (!spend(ctx, COST.tool)) break
        const pose = poseAt(mover, speed, theta, bend, climb)
        const verdict = validateToolPose(world, mover, pose, leader)
        if (verdict.ok) {
          fit = { pose, leader, speed, value: v }
          break
        }
      }
    }
    if (fit) spots.push(fit)
  }
  return spots
}

/** Aims for units entering from reserve: markers, cover and the front of the Territory (the engine finds the tool). */
function deployTargets(ctx: AiCtx, state: GameState, unit: Unit): Vec2[] {
  const out: Vec2[] = []
  const add = (p: Vec2) => {
    if (!out.some((o) => dist(o, p) < 2)) out.push({ x: round3(p.x), z: round3(p.z) })
  }
  const goal = goalsFor(ctx).get(unit.id)
  const at = unitPos(state, unit)
  if (goal) {
    add(goal.pos)
    const d = dist(at, goal.pos)
    if (d > 1) add({ x: at.x + ((goal.pos.x - at.x) / d) * Math.min(d, 8), z: at.z + ((goal.pos.z - at.z) / d) * Math.min(d, 8) })
  }
  for (const p of state.table.def.pieces) if (p.cover !== 'none') add({ x: (p.bbox.minX + p.bbox.maxX) / 2, z: (p.bbox.minZ + p.bbox.maxZ) / 2 })
  for (const e of enemiesOf(ctx)) add(e.pos)
  add({ x: 0, z: 0 })
  for (const dx of [-9, -3, 3, 9]) add({ x: at.x + dx, z: at.z + (at.z > 0 ? -7 : 7) })
  return out.slice(0, 10)
}


// ---------------------------------------------------------------------------
// move.tool and move.troopers
// ---------------------------------------------------------------------------

/** `move.tool`: the pose chosen at the Move action when it is still legal, else the best spot found now, else the engine's own fit. */
export function moveTool(ctx: AiCtx): Action | null {
  const p = ctx.pending
  const s = ctx.view
  const unitId = p.constraints?.unitId
  const unit = unitId ? s.units[unitId] : undefined
  if (!unitId || !unit) return null
  const it = ctx.memory.intent
  const fresh = (pose: ToolPose, leader: Pose2): Action | null => {
    const a = act.tool(p, pose, leader)
    return validate(s, a) === null ? a : null
  }
  if (it && it.unitId === unitId && it.move) {
    const m = it.move as { pose: ToolPose; leader: Pose2 }
    const a = fresh(m.pose, m.leader)
    if (a) return a
  }
  const kind = String(p.context.kind ?? 'move') as MoveFrame['kind']
  const maxSpeed = Number(p.context.maxSpeed ?? p.constraints?.maxSpeed ?? 2)
  const spots = proposeSpots(ctx, unit, kind, maxSpeed, 4)
  for (const sp of spots) {
    const a = fresh(sp.pose, sp.leader)
    if (a) return a
  }
  // nothing fitted: the engine's own fit toward the unit's goal, else give the action back
  const goal = goalsFor(ctx).get(unitId)
  const frame: MoveFrame = { unitId, seat: unit.seat, kind, maxSpeed, free: false }
  const plan = planMove(s, frame, goal ? goal.pos : null, false)
  if (plan) {
    const a = fresh(plan.pose, plan.leader)
    if (a) return a
  }
  if (it && it.unitId === unitId && it.chosen) it.banned.push(it.chosen)
  return p.canPass ? act.pass(p, p.seat === 'all' ? ctx.seat : p.seat) : null
}

/** `move.troopers`: the engine's placement around the new leader spot (formation kept, cohesion met). */
export function moveTroopers(ctx: AiCtx): Action | null {
  const p = ctx.pending
  const sug = p.context.suggestion as { miniId: string; x: number; z: number; yaw: number }[] | undefined
  if (sug && sug.length > 0) {
    const a = act.troopers(p, sug)
    if (validate(ctx.view, a) === null) return a
  }
  return p.canPass ? act.pass(p) : null
}
