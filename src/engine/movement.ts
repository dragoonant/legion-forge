// MOV move.*: the hinged-tool Move (R-6), trooper placement in cohesion (R-7), entering from the edge (R-6.6), difficult
// terrain, Climb and Withdraw. A Move is two decisions: `move.tool` (a pose of the tool and where the leader ends, the single
// legality test is tool.ts `validateToolPose`) then `move.troopers` (the rest of the unit; pass accepts the engine placement).
// Moving into melee (base contact with an enemy) belongs to melee.ts: the leader here may not end in contact (`canEngage` false).
import { unitData } from './bundle'
import { deploySpans, flowOf, markersOf, markerFootprint, openWindow } from './battle'
import { afterMoveFinished, raiseStandby } from './activation'
import { footprintInsidePolygon, type Footprint } from './footprint'
import { round3 } from './geometry'
import { runHook } from './hooks'
import { miniLosBody, type LosBody } from './los'
import { makeAction } from './actions'
import { inBaseContact, miniBody, refreshEngagement } from './measure'
import { canMoveIntoMelee, placeIntoContact } from './melee'
import { refreshPanic } from './morale'
import { reject, type Ctx, type Handled, type ModuleDef } from './registry'
import { aliveMinis, constants, EngineInvariantError, leaderOf, unitsOnTable } from './state'
import { piecesOverlapping } from './table'
import {
  checkBasePlacement,
  checkCohesion,
  deployPoseAt,
  findCohesionSpot,
  poseAt,
  fitTool,
  nearestLegalSpot,
  toolShape,
  troopersDifficultCheck,
  validateToolPose,
  type DeployStart,
  type Mover,
  type Obstacle,
  type ToolVerdict,
  type ToolWorld,
} from './tool'
import type {
  Action,
  GameState,
  Mini,
  MoveFrame,
  PendingDecision,
  Pose2,
  Seat,
  ToolPose,
  TrooperPlacement,
  Unit,
  Vec2,
} from './types'

// ---------------------------------------------------------------------------
// Speed, world, mover
// ---------------------------------------------------------------------------

/** The unit's speed: printed speed plus `move.speed` hook deltas, 1 to 3 (R-6.1). */
export function unitSpeed(state: GameState, unit: Unit): number {
  const base = unitData(state.data, unit.unitTypeId).speed
  const delta = runHook('move.speed', { seat: unit.seat, state, unitId: unit.id }).reduce((n, r) => n + (r.delta ?? 0), 0)
  return Math.max(1, Math.min(3, base + delta))
}

/** The cohesion distance of a unit: the constant (3"), or its own `cohesionRange` (Squad upgrades: 6"). */
export function cohesionOf(state: GameState, unit: Unit): number {
  const own = unit.flags.cohesionRange
  return typeof own === 'number' ? own : constants(state).cohesionDistance
}

/** Every base other than the mover's own unit, POIs as footprints. */
export function worldFor(state: GameState, seat: Seat, excludeUnitId: string | null, extra: readonly Obstacle[] = []): ToolWorld {
  const others: Obstacle[] = []
  for (const u of unitsOnTable(state)) {
    if (u.id === excludeUnitId) continue
    for (const m of u.minis) {
      if (!m.alive) continue
      others.push({ id: m.id, pos: { x: m.pos.x, z: m.pos.z }, baseRadius: miniBody(state, m).baseRadius, enemy: u.seat !== seat, unitId: u.id })
    }
  }
  const pois = markersOf(state, 'poi').map((m) => markerFootprint(state, m))
  return { table: state.table.def, tool: state.data.tool, constants: state.data.constants, others: [...others, ...extra], pois }
}

function silhouetteHeight(state: GameState, unit: Unit): number {
  const base = state.data.bases[unit.minis[0]!.baseSize]!
  return state.data.silhouettes[base.silhouette]!.height
}

export function moverFor(state: GameState, unit: Unit, frame: MoveFrame): Mover {
  const leader = leaderOf(unit)
  const body = miniBody(state, leader)
  const deploying = unit.location !== 'table'
  const startsInDifficult = !deploying && unit.minis.some((m) => m.alive && piecesOverlapping(state.table.def, miniBody(state, m)).some((p) => p.movement === 'difficult'))
  return {
    pos: deploying ? { x: 0, z: 0 } : { x: leader.pos.x, z: leader.pos.z },
    y: deploying ? 0 : leader.pos.y,
    baseRadius: body.baseRadius,
    silhouetteHeight: silhouetteHeight(state, unit),
    maxSpeed: frame.kind === 'climb' || frame.kind === 'withdraw' ? 1 : frame.maxSpeed,
    // a unit with a melee weapon may end its Move in base contact with an enemy, unless it Withdrew this activation (CRB p28, p29)
    canEngage: frame.kind !== 'withdraw' && frame.kind !== 'controlled' && canMoveIntoMelee(state, unit) && !withdrewThisActivation(state, unit),
    startsInDifficult,
    ...(frame.ignoreDifficult ? { ignoreDifficult: true } : {}),
    ...(frame.jumpHeight !== undefined ? { jumpHeight: frame.jumpHeight } : {}),
  }
}

function withdrewThisActivation(state: GameState, unit: Unit): boolean {
  const act = state.activation.current
  return !!act && act.unitId === unit.id && act.performed.some((p) => p.action === 'withdraw')
}

function deployStarts(state: GameState, seat: Seat): DeployStart[] {
  return deploySpans(state, seat).map((s) => ({ edge: s.edge, inward: s.inward }))
}

/** `validateToolPose`, trying every allied edge span when the unit is entering from reserve. */
function validatePose(state: GameState, unit: Unit, frame: MoveFrame, pose: ToolPose, leader: Pose2): ToolVerdict {
  const world = worldFor(state, unit.seat, unit.id)
  const mover = moverFor(state, unit, frame)
  if (unit.location === 'table') return validateToolPose(world, mover, pose, leader)
  const spans = deployStarts(state, unit.seat)
  let first: ToolVerdict | null = null
  for (const sp of spans) {
    const v = validateToolPose(world, mover, pose, leader, sp)
    if (v.ok) return v
    first ??= v
  }
  return first ?? { ok: false, code: 'E_OFF_TOOL', reason: 'there is no allied edge to enter from', check: 0 }
}

// ---------------------------------------------------------------------------
// Planning a move (suggest, the bot and the AI use this; the client uses query.toolPreview over the same code)
// ---------------------------------------------------------------------------

/** Where a unit wants to go when nobody says: the nearest objective it does not hold, else the nearest enemy, else the middle. */
export function defaultTarget(state: GameState, unit: Unit): Vec2 {
  const from = unit.location === 'table' ? { x: leaderOf(unit).pos.x, z: leaderOf(unit).pos.z } : { x: 0, z: 0 }
  let best: { d: number; p: Vec2 } | null = null
  const consider = (p: Vec2, stand: number) => {
    const d = Math.hypot(p.x - from.x, p.z - from.z)
    if (d < stand) return
    if (!best || d < best.d) {
      const f = (d - stand) / d
      best = { d, p: { x: round3(from.x + (p.x - from.x) * f), z: round3(from.z + (p.z - from.z) * f) } }
    }
  }
  for (const m of markersOf(state, 'poi')) consider(m.pos, 2.4)
  if (!best) {
    for (const u of unitsOnTable(state)) if (u.seat !== unit.seat) consider({ x: leaderOf(u).pos.x, z: leaderOf(u).pos.z }, 2.5)
  }
  return best ? (best as { p: Vec2 }).p : { x: 0, z: 0 }
}

export interface MovePlan {
  pose: ToolPose
  leader: Pose2
}

const BENDS = [0, 0.5, -0.5, 1.0, -1.0]

/** Cheap pass: straight and gently bent tools toward `t`, shortest tool first (R-6.5 without the full angle search). */
function quickFit(world: ToolWorld, mover: Mover, t: Vec2, climb: boolean): MovePlan | null {
  const theta = Math.atan2(t.x - mover.pos.x, t.z - mover.pos.z)
  const dist = Math.hypot(t.x - mover.pos.x, t.z - mover.pos.z)
  const leader: Pose2 = { x: round3(t.x), z: round3(t.z), yaw: theta }
  for (let speed = 1; speed <= (climb ? 1 : mover.maxSpeed); speed++) {
    const sp = world.tool.speeds[String(speed) as '1' | '2' | '3']
    if (dist > mover.baseRadius * 2 + sp.segments[0] + sp.segments[1] + 0.01) continue
    for (const bend of BENDS) {
      const pose = poseAt(mover, speed, theta, bend, climb)
      const v = validateToolPose(world, mover, pose, leader)
      if (v.ok) return { pose, leader }
    }
  }
  return null
}

/**
 * A legal tool pose and leader spot toward `target` (null: the default target), or null when none exists. `quick` stops at the
 * first cheap fit (the bots and the "can this unit enter" probe); otherwise the full search of R-6.5 (`fitTool`) backs it up.
 */
export function planMove(state: GameState, frame: MoveFrame, target: Vec2 | null, quick = false): MovePlan | null {
  const unit = state.units[frame.unitId]!
  const aim = target ?? defaultTarget(state, unit)
  if (unit.location !== 'table') return planDeploy(state, unit, frame, aim, quick)
  const world = worldFor(state, unit.seat, unit.id)
  const mover = moverFor(state, unit, frame)
  const climb = frame.kind === 'climb'
  const tries: Vec2[] = [aim]
  for (const r of [1.2, 2.4, 3.6]) for (let i = 0; i < 8; i++) tries.push({ x: round3(aim.x + Math.sin((i * Math.PI) / 4) * r), z: round3(aim.z + Math.cos((i * Math.PI) / 4) * r) })
  for (const t of tries) {
    const q = quickFit(world, mover, t, climb)
    if (q) return q
  }
  // closer along the way to the aim
  const dist = Math.hypot(aim.x - mover.pos.x, aim.z - mover.pos.z)
  for (let d = Math.min(dist, 9.5); d > mover.baseRadius * 2 + 0.5; d -= 0.5) {
    const t = { x: round3(mover.pos.x + ((aim.x - mover.pos.x) / dist) * d), z: round3(mover.pos.z + ((aim.z - mover.pos.z) / dist) * d) }
    const q = quickFit(world, mover, t, climb)
    if (q) return q
  }
  // crowded or walled in: any reachable spot on rings around the leader, nearest the aim first
  const ring: Vec2[] = []
  for (const r of [1.6, 3, 4.5, 6, 7.5]) {
    for (let i = 0; i < 16; i++) ring.push({ x: round3(mover.pos.x + Math.sin((i * Math.PI) / 8) * r), z: round3(mover.pos.z + Math.cos((i * Math.PI) / 8) * r) })
  }
  ring.sort((a, b) => Math.hypot(a.x - aim.x, a.z - aim.z) - Math.hypot(b.x - aim.x, b.z - aim.z))
  for (const t of ring) {
    const q = quickFit(world, mover, t, climb)
    if (q) return q
  }
  if (quick) return null
  for (const t of tries) {
    const fit = fitTool(world, mover, t, { maxSpeed: mover.maxSpeed, climb })
    if (fit.ok) return { pose: fit.pose, leader: fit.leader }
  }
  const near = nearestLegalSpot(world, mover, aim, { maxSpeed: mover.maxSpeed, climb })
  if (near) return { pose: near.spot.pose, leader: near.spot.leader }
  for (const t of ring) {
    const fit = fitTool(world, mover, t, { maxSpeed: mover.maxSpeed, climb })
    if (fit.ok) return { pose: fit.pose, leader: fit.leader }
  }
  return null
}

const HINGES = [0, 0.5, -0.5, 1.0, -1.0]
const SPAN_T = [0.5, 0.25, 0.75, 0.1, 0.9]

function planDeploy(state: GameState, unit: Unit, frame: MoveFrame, aim: Vec2, quick: boolean): MovePlan | null {
  const world = worldFor(state, unit.seat, unit.id)
  const mover = moverFor(state, unit, frame)
  const spans = deployStarts(state, unit.seat)
  let best: { plan: MovePlan; d: number } | null = null
  for (const sp of spans) {
    for (let speed = mover.maxSpeed; speed >= 1; speed--) {
      for (const t of SPAN_T) {
        for (const h of HINGES) {
          const pose = deployPoseAt(sp, speed, t, h)
          const shape = toolShape(world.tool, pose)
          const [, hinge, tip] = shape.path
          const yaw = Math.atan2(tip.x - hinge.x, tip.z - hinge.z)
          for (const back of [0, 0.8, 1.6]) {
            const len = Math.hypot(tip.x - hinge.x, tip.z - hinge.z) || 1
            const spot = { x: round3(tip.x - ((tip.x - hinge.x) / len) * back), z: round3(tip.z - ((tip.z - hinge.z) / len) * back), yaw }
            const v = validateToolPose(world, mover, pose, spot, sp)
            if (!v.ok) continue
            const d = Math.hypot(spot.x - aim.x, spot.z - aim.z)
            if (!best || d < best.d) best = { plan: { pose, leader: spot }, d }
            if (quick) return best.plan
          }
        }
      }
    }
  }
  return best?.plan ?? null
}

/** The `move.tool` answer the engine would give toward `target` (a bot's way of picking where to go). */
export function suggestToolToward(state: GameState, pending: PendingDecision | null, seat: Seat, unitId: string, target: Vec2 | null, quick = false): Action | null {
  const frame = flowOf(state).move ?? ({ unitId, seat, kind: 'move', maxSpeed: unitSpeed(state, state.units[unitId]!), free: false } as MoveFrame)
  const plan = planMove(state, frame, target, quick)
  if (!plan) return null
  const id = pending?.id ?? `d:${state.nextDecision}`
  return makeAction('move.tool', { id, seat }, { ...plan.pose, leader: plan.leader }, seat)
}

// ---------------------------------------------------------------------------
// Trooper placement (R-7)
// ---------------------------------------------------------------------------

export interface TrooperPlan {
  placements: (TrooperPlacement & { y: number; outOfCohesion: boolean })[]
  anyDifficult: boolean
}

interface TrooperOpts {
  /** the leader's final pose */
  leader: { x: number; y: number; z: number }
  /** where each trooper would like to be (formation kept); defaults to the leader's spot */
  prefer?: (miniId: string) => Vec2 | undefined
  /** every trooper must lie completely inside one of these (Prepared Position) */
  region?: readonly (readonly Vec2[])[]
  /** keep the models out of difficult terrain (the tool used would not fit the reduced speed) */
  avoidDifficult?: boolean
  /** the leader ended in base contact with this enemy unit: the other models go into base contact with it too (CRB p28 step 1) */
  melee?: string
}

const TOUCH = 0.0003

/**
 * A legal spot for a model of a unit Moving into Melee: in base contact with a model of the enemy unit, in cohesion with the
 * leader, never touching a second enemy unit; the one nearest `prefer`. Null when none exists.
 */
function contactSpot(
  state: GameState,
  world: ToolWorld,
  leader: LosBody,
  tr: LosBody,
  enemy: Unit,
  c: { prefer: Vec2; fromY: number; height: number; avoidDifficult?: boolean },
): { pos: Vec2; y: number } | null {
  let best: { pos: Vec2; y: number; score: number } | null = null
  const targets = aliveMinis(enemy)
    .map((m) => ({ m, d: Math.hypot(m.pos.x - c.prefer.x, m.pos.z - c.prefer.z) }))
    .sort((a, b) => a.d - b.d)
  // every enemy figure is a candidate, nearest first: the engine's suggestion and the check of a player's answer must agree on
  // whether a contact spot exists, whatever the figure's own position
  for (const { m: t } of targets) {
    const dist = tr.baseRadius + miniBody(state, t).baseRadius + TOUCH
    for (let k = 0; k < 36; k++) {
      const a = (2 * Math.PI * k) / 36
      const pos = { x: round3(t.pos.x + Math.sin(a) * dist), z: round3(t.pos.z + Math.cos(a) * dist) }
      const score = Math.hypot(pos.x - c.prefer.x, pos.z - c.prefer.z)
      if (best && score >= best.score) continue
      const placed = checkBasePlacement(world, { pos, baseRadius: tr.baseRadius }, { fromY: c.fromY, silhouetteHeight: c.height, climb: false, canEngage: true })
      if (!placed.ok || placed.info.touchingEnemies.some((id) => !enemy.minis.some((m) => m.id === id))) continue
      if (c.avoidDifficult && placed.info.difficult) continue
      if (!checkCohesion(world.table, world.constants, leader, { ...tr, pos: { x: pos.x, y: placed.info.surface, z: pos.z } }).ok) continue
      best = { pos, y: placed.info.surface, score }
    }
  }
  return best ? { pos: best.pos, y: best.y } : null
}

function trooperWorld(state: GameState, unit: Unit, leaderPos: Vec2, placed: readonly Obstacle[]): ToolWorld {
  const leader = leaderOf(unit)
  const lead: Obstacle = { id: leader.id, pos: leaderPos, baseRadius: miniBody(state, leader).baseRadius, enemy: false }
  const base = worldFor(state, unit.seat, unit.id, [lead, ...placed])
  return { ...base, constants: { ...base.constants, cohesionDistance: cohesionOf(state, unit) } }
}

function leaderBody(state: GameState, unit: Unit, leader: { x: number; y: number; z: number }): LosBody {
  return { ...miniLosBody(state, leaderOf(unit)), pos: { x: leader.x, y: leader.y, z: leader.z } }
}

/** Ring search for a legal spot in cohesion that satisfies the extra constraints; null when none within ~6" of the leader. */
function searchSpot(
  world: ToolWorld,
  leader: LosBody,
  tr: LosBody,
  c: { region?: readonly (readonly Vec2[])[]; avoidDifficult: boolean; prefer: Vec2; fromY: number; height: number },
): { pos: Vec2; y: number } | null {
  let best: { pos: Vec2; y: number; score: number } | null = null
  const first = leader.baseRadius + tr.baseRadius
  for (let k = 0; k <= 24; k++) {
    const rho = first + 0.05 + k * 0.25
    const steps = Math.max(12, Math.ceil((2 * Math.PI * rho) / 0.35))
    for (let i = 0; i < steps; i++) {
      const a = (2 * Math.PI * i) / steps
      const pos = { x: round3(leader.pos.x + Math.sin(a) * rho), z: round3(leader.pos.z + Math.cos(a) * rho) }
      const score = Math.hypot(pos.x - c.prefer.x, pos.z - c.prefer.z)
      if (best && score >= best.score) continue
      const f: Footprint = { pos, baseRadius: tr.baseRadius }
      if (c.region && !c.region.some((poly) => footprintInsidePolygon(f, poly as Vec2[]))) continue
      const placed = checkBasePlacement(world, f, { fromY: c.fromY, silhouetteHeight: c.height, climb: false, canEngage: false })
      if (!placed.ok || (c.avoidDifficult && placed.info.difficult)) continue
      const v = checkCohesion(world.table, world.constants, leader, { ...tr, pos: { x: pos.x, y: placed.info.surface, z: pos.z } })
      if (!v.ok) continue
      best = { pos, y: placed.info.surface, score }
    }
    if (best && k > 2) break
  }
  return best
}

/** The engine's placement of the rest of the unit around its leader (R-7.1, R-7.2). */
export function planTroopers(state: GameState, unit: Unit, opts: TrooperOpts): TrooperPlan {
  const lp: Vec2 = { x: opts.leader.x, z: opts.leader.z }
  const placedObs: Obstacle[] = []
  const placements: TrooperPlan['placements'] = []
  let anyDifficult = false
  const height = silhouetteHeight(state, unit)
  for (const m of unit.minis) {
    if (!m.alive || m.id === unit.leaderId) continue
    const world = trooperWorld(state, unit, lp, placedObs)
    const lb = leaderBody(state, unit, opts.leader)
    const body = miniLosBody(state, m)
    const prefer = opts.prefer?.(m.id) ?? lp
    let pos: Vec2
    let y: number
    let cohesive: boolean
    const foe = opts.melee ? state.units[opts.melee] : undefined
    const contact = foe ? contactSpot(state, world, lb, body, foe, { prefer, fromY: opts.leader.y, height, avoidDifficult: opts.avoidDifficult === true }) : null
    const found = contact ?? searchSpot(world, lb, body, { ...(opts.region ? { region: opts.region } : {}), avoidDifficult: opts.avoidDifficult === true, prefer, fromY: opts.leader.y, height })
    if (found) {
      pos = found.pos
      y = found.y
      cohesive = true
    } else if (opts.region) {
      throw new EngineInvariantError(`no legal deployment spot for ${m.id} inside the Territory`)
    } else {
      const spot = findCohesionSpot(world, lb, { baseRadius: body.baseRadius, height: body.height, samples: body.samples }, { silhouetteHeight: height, fromY: opts.leader.y }, prefer)
      if (!spot) throw new EngineInvariantError(`no legal spot within 12" of the leader for ${m.id}`)
      pos = spot.pos
      y = spot.y
      cohesive = spot.inCohesion
    }
    const f: Footprint = { pos, baseRadius: body.baseRadius }
    if (piecesOverlapping(state.table.def, f).some((p) => p.movement === 'difficult')) anyDifficult = true
    placedObs.push({ id: m.id, pos, baseRadius: body.baseRadius, enemy: false })
    placements.push({ miniId: m.id, x: pos.x, z: pos.z, yaw: m.yaw, y, outOfCohesion: !cohesive })
  }
  return { placements, anyDifficult }
}

export type TrooperCheck = ({ ok: true } & TrooperPlan) | { ok: false; code: 'E_OVERLAP' | 'E_TERRAIN' | 'E_COHESION' | 'E_OUT_OF_RANGE' | 'E_SCHEMA' | 'E_ENGAGED'; reason: string }

/** Validate a player's placement of the rest of the unit: legal bases, in cohesion unless no spot in cohesion exists (R-7.2). */
export function checkTroopers(state: GameState, unit: Unit, placements: readonly TrooperPlacement[], opts: TrooperOpts): TrooperCheck {
  const want = unit.minis.filter((m) => m.alive && m.id !== unit.leaderId).map((m) => m.id)
  const got = placements.map((p) => p.miniId)
  if (want.length !== got.length || want.some((id) => !got.includes(id)) || new Set(got).size !== got.length) {
    return { ok: false, code: 'E_SCHEMA', reason: 'place every other model of the unit exactly once' }
  }
  const lp: Vec2 = { x: opts.leader.x, z: opts.leader.z }
  const height = silhouetteHeight(state, unit)
  const placedObs: Obstacle[] = []
  const out: TrooperPlan['placements'] = []
  let anyDifficult = false
  for (const p of placements) {
    if (![p.x, p.z, p.yaw].every(Number.isFinite)) return { ok: false, code: 'E_SCHEMA', reason: 'malformed placement' }
    const m = unit.minis.find((x) => x.id === p.miniId)!
    const world = trooperWorld(state, unit, lp, placedObs)
    const body = miniLosBody(state, m)
    const pos = { x: round3(p.x), z: round3(p.z) }
    const f: Footprint = { pos, baseRadius: body.baseRadius }
    if (opts.region && !opts.region.some((poly) => footprintInsidePolygon(f, poly as Vec2[]))) {
      return { ok: false, code: 'E_OUT_OF_RANGE', reason: 'a deploying model must lie completely inside the allied Territory' }
    }
    const placed = checkBasePlacement(world, f, { fromY: opts.leader.y, silhouetteHeight: height, climb: false, canEngage: opts.melee !== undefined })
    if (!placed.ok) return { ok: false, code: placed.code as 'E_OVERLAP', reason: placed.reason }
    const lb = leaderBody(state, unit, opts.leader)
    const foe = opts.melee ? state.units[opts.melee] : undefined
    if (foe) {
      // Moving into Melee (CRB p28): every model goes into base contact with the enemy unit when it can, and never touches a second one
      if (placed.info.touchingEnemies.some((id) => !foe.minis.some((m) => m.id === id))) {
        return { ok: false, code: 'E_ENGAGED', reason: 'a model may never end in base contact with models of two enemy units' }
      }
      if (placed.info.touchingEnemies.length === 0 && contactSpot(state, world, lb, body, foe, { prefer: pos, fromY: opts.leader.y, height, avoidDifficult: opts.avoidDifficult === true })) {
        return { ok: false, code: 'E_COHESION', reason: `${m.id} can be placed in base contact with the enemy unit in cohesion, so it must be` }
      }
    }
    const verdict = checkCohesion(world.table, world.constants, lb, { ...body, pos: { x: pos.x, y: placed.info.surface, z: pos.z } })
    let outOfCohesion = false
    if (!verdict.ok) {
      const spot = findCohesionSpot(world, lb, { baseRadius: body.baseRadius, height: body.height, samples: body.samples }, { silhouetteHeight: height, fromY: opts.leader.y }, pos)
      if (spot?.inCohesion) return { ok: false, code: 'E_COHESION', reason: `a model must be placed in cohesion (${verdict.failure} fails, ${verdict.distance}")` }
      outOfCohesion = true
    }
    if (placed.info.difficult) anyDifficult = true
    placedObs.push({ id: m.id, pos, baseRadius: body.baseRadius, enemy: false })
    out.push({ miniId: m.id, x: pos.x, z: pos.z, yaw: p.yaw, y: placed.info.surface, outOfCohesion })
  }
  return { ok: true, placements: out, anyDifficult }
}

// ---------------------------------------------------------------------------
// Beginning and finishing a Move
// ---------------------------------------------------------------------------

/** Raise `move.tool` for the frame's unit; the frame is kept in the flow state until the Move resolves or is cancelled. */
export function beginMove(ctx: Ctx, frame: MoveFrame): void {
  const s = ctx.state
  const unit = s.units[frame.unitId]
  if (!unit) throw new EngineInvariantError(`move of unknown unit ${frame.unitId}`)
  flowOf(s).move = frame
  const deploying = unit.location !== 'table'
  const maxSpeed = frame.kind === 'climb' || frame.kind === 'withdraw' ? 1 : frame.maxSpeed
  ctx.raise({
    kind: 'move.tool',
    seat: frame.seat,
    window: 'move.started',
    context: {
      unitId: unit.id,
      kind: frame.kind,
      maxSpeed,
      deploying,
      climb: frame.kind === 'climb',
      free: frame.free,
      ...(deploying ? { spans: deploySpans(s, unit.seat) } : {}),
    },
    constraints: { kind: 'tool', unitId: unit.id, maxSpeed, cohesion: { distance: cohesionOf(s, unit), vertical: silhouetteHeight(s, unit) } },
    canPass: true,
  })
}

function poseOf(p: Action & { type: 'move.tool' }, frame: MoveFrame): { pose: ToolPose; leader: Pose2 } {
  const { leader, speed, start, heading, hinges } = p.payload
  const pose: ToolPose = { speed, start, heading, hinges }
  if (frame.kind === 'climb') pose.climb = true
  return { pose, leader }
}

function snapshot(unit: Unit) {
  return unit.minis.filter((m) => m.alive).map((m) => ({ miniId: m.id, pos: { x: m.pos.x, y: m.pos.y, z: m.pos.z }, yaw: m.yaw }))
}

/** Everything is placed: events, deployment, hand back to the activation (or the Standby response). */
function finishMove(ctx: Ctx, unit: Unit, info: { toolSpeed: number; toolPath: Vec2[]; leaderFrom: { x: number; y: number; z: number } }): void {
  const wasReserve = unit.location !== 'table'
  if (wasReserve) unit.location = 'table'
  ctx.emit({ type: 'UnitMoved', unitId: unit.id, speed: info.toolSpeed, toolPath: info.toolPath, leaderFrom: info.leaderFrom, leaderTo: { ...leaderOf(unit).pos }, minis: snapshot(unit) }, unit.seat)
  if (wasReserve) ctx.emit({ type: 'UnitDeployed', unitId: unit.id, minis: snapshot(unit) }, unit.seat)
  // Cumbersome / Sniper Team read this; the activation clears it. Allied Commander range may have changed: re-derive Panicked.
  if (ctx.state.activation.current?.unitId === unit.id) unit.flags.movedThisActivation = true
  const frame = flowOf(ctx.state).move
  // a leader that ends in base contact with an enemy has Moved into Melee: the enemy unit places its models (CRB p28 steps 2 and 3)
  const foe = frame ? contactEnemy(ctx.state, unit) : null
  if (foe) {
    resolveMeleeEntry(ctx, unit, foe)
    refreshEngagement(ctx)
    frame!.meleeWith = foe.id
  }
  refreshPanic(ctx)
  // Standby tokens are spent before any effect that triggers after a Move is resolved (CRB p37)
  const activationMove = !!frame && frame.kind !== 'standby' && frame.kind !== 'controlled' && ctx.state.activation.current?.unitId === unit.id
  if (activationMove && raiseStandby(ctx, 'move.ended')) return
  moveEndedWindow(ctx)
}

/**
 * The `move.ended` window (keywords and cards); the frame stays until the window is done. The window carries what the
 * declarative triggers read: the kind of Move ('standard' for a Move or Withdraw, 'climb', 'forced' for a Move another
 * player controls) and whether it was made as an action or free action.
 */
export function moveEndedWindow(ctx: Ctx): void {
  const frame = flowOf(ctx.state).move
  if (!frame) throw new EngineInvariantError('move.ended with no Move in progress')
  const info = { unitId: frame.unitId, moveKind: frame.kind === 'climb' ? 'climb' : frame.kind === 'controlled' ? 'forced' : 'standard', fromAction: frame.kind !== 'controlled' }
  if (openWindow(ctx, 'move.ended', info, `m${ctx.state.seq}`, 'move.ended')) return
  afterMoveEndedWindow(ctx)
}

/** Charge: a Move action during the unit's Activation that put it in base contact with an enemy opens `melee.charged` (CRB p47). */
export function afterMoveEndedWindow(ctx: Ctx): void {
  const frame = flowOf(ctx.state).move
  if (frame?.meleeWith && frame.kind !== 'standby' && frame.kind !== 'controlled' && ctx.state.activation.current?.unitId === frame.unitId) {
    const info = { unitId: frame.unitId, targetId: frame.meleeWith, startedMelee: true, fromAction: true }
    if (openWindow(ctx, 'melee.charged', info, `c${ctx.state.seq}`, 'move.charged')) return
  }
  resumeAfterMove(ctx)
}

/** The enemy unit with a model in base contact with the unit's leader, if any. */
function contactEnemy(state: GameState, unit: Unit): Unit | null {
  const c = constants(state)
  const lead = miniBody(state, leaderOf(unit))
  for (const o of unitsOnTable(state)) {
    if (o.seat === unit.seat) continue
    if (aliveMinis(o).some((m) => inBaseContact(lead, miniBody(state, m), c))) return o
  }
  return null
}

/**
 * Steps 2 and 3 of a Move into Melee (CRB p28): if the enemy leader is not in base contact it is placed into contact with
 * the mover; then every other enemy model that is out of contact or out of cohesion goes into contact with the mover's unit.
 * RULING Port choice: the opponent's placements are made by the engine (the nearest legal spot to where the model stands,
 * never touching a third unit); a model that cannot reach contact stays put and is flagged out of cohesion.
 */
function resolveMeleeEntry(ctx: Ctx, mover: Unit, foe: Unit): void {
  const s = ctx.state
  const c = constants(s)
  const touching = (m: Mini, other: Unit): boolean => aliveMinis(other).some((o) => inBaseContact(miniBody(s, m), miniBody(s, o), c))
  const moved: { miniId: string; pos: { x: number; y: number; z: number } }[] = []
  const place = (m: Mini): void => {
    const pl = placeIntoContact(s, foe, [m], mover).placements[0]
    if (!pl) return
    m.pos = { x: pl.x, y: m.pos.y, z: pl.z }
    moved.push({ miniId: m.id, pos: { ...m.pos } })
  }
  const lead = leaderOf(foe)
  if (!touching(lead, mover)) place(lead)
  const cohesion = { cohesionDistance: cohesionOf(s, foe) }
  const cohesive = (m: Mini): boolean => checkCohesion(s.table.def, cohesion, miniLosBody(s, lead), miniLosBody(s, m)).ok
  for (const m of aliveMinis(foe)) {
    if (m.id === foe.leaderId) continue
    if (!touching(m, mover) || !cohesive(m)) place(m)
  }
  for (const m of aliveMinis(foe)) {
    if (m.id === foe.leaderId) continue
    if (cohesive(m)) delete m.outOfCohesion
    else m.outOfCohesion = true
  }
  if (moved.length > 0) ctx.emit({ type: 'MeleeContact', unitId: foe.id, targetId: mover.id, minis: moved }, foe.seat)
}

/** The `move.ended` window is done: hand back to the activation (or the Standby response). */
export function resumeAfterMove(ctx: Ctx): void {
  const flow = flowOf(ctx.state)
  const frame = flow.move
  if (!frame) throw new EngineInvariantError('resumeAfterMove with no Move in progress')
  flow.move = null
  afterMoveFinished(ctx, frame.kind, 'finished')
}

function applyTroopers(ctx: Ctx, unit: Unit, plan: TrooperPlan): void {
  for (const p of plan.placements) {
    const m = unit.minis.find((x) => x.id === p.miniId)!
    m.pos = { x: p.x, y: p.y, z: p.z }
    m.yaw = p.yaw
    if (p.outOfCohesion) m.outOfCohesion = true
    else delete m.outOfCohesion
  }
  ctx.emit({ type: 'TroopersPlaced', unitId: unit.id, minis: plan.placements.map((p) => ({ miniId: p.miniId, pos: { x: p.x, y: p.y, z: p.z }, yaw: p.yaw, ...(p.outOfCohesion ? { outOfCohesion: true } : {}) })) }, unit.seat)
}

export const movementModule: ModuleDef = {
  id: 'movement',
  namespaces: ['move'],

  handle(state: GameState, action: Action, pending: PendingDecision): Handled {
    const frame = flowOf(state).move
    if (!frame) return reject('E_WRONG_DECISION', 'no Move is in progress')
    const unit = state.units[frame.unitId]!

    if (pending.kind === 'move.tool') {
      if (action.type === 'pass') {
        // cancel before anything resolved: no action is spent
        return {
          run(ctx) {
            flowOf(ctx.state).move = null
            afterMoveFinished(ctx, frame.kind, 'cancelled')
          },
        }
      }
      if (action.type !== 'move.tool') return reject('E_WRONG_DECISION', 'expected a tool placement')
      const { pose, leader } = poseOf(action, frame)
      const v = validatePose(state, unit, frame, pose, leader)
      if (!v.ok) return { rejection: { code: v.code, reason: v.reason, details: { check: v.check, ...(v.details ?? {}) } } }
      return {
        run(ctx) {
          const u = ctx.state.units[frame.unitId]!
          const lead = leaderOf(u)
          const deploying = u.location !== 'table'
          const from = deploying ? { x: pose.start.x, y: 0, z: pose.start.z } : { x: lead.pos.x, y: lead.pos.y, z: lead.pos.z }
          const startedDifficult = !deploying && moverFor(ctx.state, u, frame).startsInDifficult === true
          lead.pos = { x: v.leader.x, y: v.leader.y, z: v.leader.z }
          lead.yaw = v.leader.yaw
          const info = { toolSpeed: v.speed, toolPath: v.toolPath, leaderFrom: from }
          const rest = u.minis.filter((m) => m.alive && m.id !== u.leaderId)
          if (rest.length === 0) return finishMove(ctx, u, info)
          const delta = { x: lead.pos.x - from.x, z: lead.pos.z - from.z }
          const oldPos = new Map(rest.map((m) => [m.id, { x: m.pos.x, z: m.pos.z }]))
          const maxSp = frame.kind === 'climb' || frame.kind === 'withdraw' ? 1 : frame.maxSpeed
          const diffAlready = v.touchesDifficult || v.endsInDifficult || startedDifficult
          const foeUnit = v.touchingEnemies.length > 0 ? unitsOnTable(ctx.state).find((o) => o.minis.some((m) => m.id === v.touchingEnemies[0])) : undefined
          const plan = planTroopers(ctx.state, u, {
            leader: lead.pos,
            ...(foeUnit ? { melee: foeUnit.id } : {}),
            avoidDifficult: !frame.ignoreDifficult && !diffAlready && frame.kind !== 'climb' && v.speed > Math.max(1, maxSp - 1),
            ...(deploying ? {} : { prefer: (id: string) => ({ x: oldPos.get(id)!.x + delta.x, z: oldPos.get(id)!.z + delta.z }) }),
          })
          ctx.raise({
            kind: 'move.troopers',
            seat: u.seat,
            window: 'move.ended',
            context: {
              unitId: u.id,
              toolSpeed: v.speed,
              maxSpeed: frame.kind === 'climb' || frame.kind === 'withdraw' ? 1 : frame.maxSpeed,
              touchesDifficult: v.touchesDifficult,
              endsInDifficult: v.endsInDifficult,
              startedDifficult,
              toolPath: v.toolPath,
              leaderFrom: from,
              suggestion: plan.placements.map(({ miniId, x, z, yaw }) => ({ miniId, x, z, yaw })),
              ...(foeUnit ? { meleeEnemyId: foeUnit.id } : {}),
              avoidDifficult: !frame.ignoreDifficult && !diffAlready && frame.kind !== 'climb' && v.speed > Math.max(1, maxSp - 1),
            },
            constraints: { kind: 'troopers', unitId: u.id, cohesion: { distance: cohesionOf(ctx.state, u), vertical: silhouetteHeight(ctx.state, u) } },
            canPass: true,
          })
        },
      }
    }

    // move.troopers
    const ctxInfo = pending.context as {
      toolSpeed: number
      maxSpeed: number
      touchesDifficult: boolean
      endsInDifficult: boolean
      startedDifficult: boolean
      toolPath: Vec2[]
      leaderFrom: { x: number; y: number; z: number }
      suggestion: TrooperPlacement[]
      meleeEnemyId?: string
      avoidDifficult?: boolean
    }
    const lead = leaderOf(unit)
    const opts: TrooperOpts = { leader: { x: lead.pos.x, y: lead.pos.y, z: lead.pos.z }, ...(ctxInfo.meleeEnemyId ? { melee: ctxInfo.meleeEnemyId } : {}), ...(ctxInfo.avoidDifficult ? { avoidDifficult: true } : {}) }
    const placements = action.type === 'pass' ? ctxInfo.suggestion : action.type === 'move.troopers' ? action.payload.placements : null
    if (!placements) return reject('E_WRONG_DECISION', 'expected trooper placements')
    const check = checkTroopers(state, unit, placements, opts)
    if (!check.ok) return reject(check.code, check.reason)
    const difficult = check.anyDifficult || ctxInfo.touchesDifficult || ctxInfo.endsInDifficult || ctxInfo.startedDifficult
    if (frame.kind !== 'climb' && !frame.ignoreDifficult) {
      const d = troopersDifficultCheck(ctxInfo.maxSpeed, ctxInfo.toolSpeed, difficult)
      if (!d.ok) return reject(d.code, d.reason)
    }
    return {
      run(ctx) {
        const u = ctx.state.units[frame.unitId]!
        applyTroopers(ctx, u, check)
        finishMove(ctx, u, { toolSpeed: ctxInfo.toolSpeed, toolPath: ctxInfo.toolPath, leaderFrom: ctxInfo.leaderFrom })
      },
    }
  },

  suggest(state, pending, seat) {
    if (pending.kind === 'move.troopers') {
      return makeAction('move.troopers', pending, { placements: pending.context.suggestion as TrooperPlacement[] }, seat)
    }
    if (pending.kind === 'move.tool') {
      const frame = flowOf(state).move
      if (!frame) return null
      return suggestToolToward(state, pending, seat, frame.unitId, null)
    }
    return null
  },
}
