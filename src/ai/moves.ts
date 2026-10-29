// Tool sampling (docs/spec/40-ai.md section 5, step 2): propose end points for a Move, rank them cheaply with the position value,
// and fit the best of them to a legal pose of the engine's hinged movement tool. `validateToolPose` is the only judge of
// legality; the AI never decides where a base may stand.
import { act, validate } from '@/engine'
import type { Action } from '@/engine'
import { moverFor, planMove, worldFor } from '@/engine/movement'
import { canMoveIntoMelee } from '@/engine/melee'
import { cardActions } from '@/engine/commandCards'
import { miniBody } from '@/engine/measure'
import { leaderOf } from '@/engine/state'
import { poseAt, validateToolPose } from '@/engine/tool'
import { round3 } from '@/engine/geometry'
import type { GameState, MoveFrame, Pose2, ToolPose, Unit, Vec2 } from '@/engine'
import { dist, leaderPos, maxRange, meleeValue, overlay, tieBreak, typicalValue } from './eval'
import { approachCost, goalsFor, objectiveScore, quietRounds, unitPos } from './goals'
import { enemiesOf, losBlocked, threatAt } from './threat'
import { COST, spend, exhausted, type AiCtx } from './tiers'

export interface Spot {
  pose: ToolPose
  leader: Pose2
  speed: number
  /** cheap value of standing here (position value plus a shot proxy) */
  value: number
  /** the enemy unit this spot puts the leader in base contact with (a charge, R-16.1) */
  melee?: string
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

/** Where the leader would stand touching `enemy`'s leader, seen from `from`: straight on, and a quarter turn either way round it. */
function contactPoints(state: GameState, u: Unit, enemy: Unit, from: Vec2): Vec2[] {
  const e = leaderPos(enemy)
  const gap = miniBody(state, leaderOf(u)).baseRadius + miniBody(state, leaderOf(enemy)).baseRadius + 0.0005
  const base = Math.atan2(from.x - e.x, from.z - e.z)
  return [0, 0.6, -0.6].map((da) => ({ x: round3(e.x + Math.sin(base + da) * gap), z: round3(e.z + Math.cos(base + da) * gap) }))
}

/** The contact spots of a unit whose leader may move into melee: the nearest enemies within a move's reach (at most three). */
function proposeContacts(ctx: AiCtx, state: GameState, u: Unit, reach: number): { p: Vec2; enemy: string }[] {
  if (u.location !== 'table' || !canMoveIntoMelee(state, u)) return []
  const from = leaderPos(u)
  const out: { p: Vec2; enemy: string }[] = []
  const near = enemiesOf(ctx)
    .map((e) => ({ e, d: dist(e.pos, from) }))
    .filter((x) => x.d <= reach + 0.2)
    .sort((a, b) => a.d - b.d || (a.e.unit.id < b.e.unit.id ? -1 : 1))
    .slice(0, 3)
  for (const { e } of near) for (const p of contactPoints(state, u, e.unit, from)) out.push({ p, enemy: e.unit.id })
  return out
}

/** Cheap-ranked, legal end spots for a Move of `unit` (up to `limit`), best first (`worst` first for a push on an enemy). */
export function proposeSpots(ctx: AiCtx, unit: Unit, kind: MoveFrame['kind'], maxSpeed: number, limit: number, extra: Partial<MoveFrame> = {}, worst = false): Spot[] {
  const state = ctx.view
  const frame: MoveFrame = { unitId: unit.id, seat: unit.seat, kind, maxSpeed, free: false, ...extra }
  const deploying = unit.location !== 'table'
  const world = worldFor(state, unit.seat, unit.id)
  const mover = moverFor(state, unit, frame)
  const climb = kind === 'climb'
  const tool = state.data.tool.speeds
  const longest = Math.min(3, climb || kind === 'withdraw' ? 1 : maxSpeed)
  const reach = mover.baseRadius * 2 + tool[String(longest) as '1' | '2' | '3'].segments[0] + tool[String(longest) as '1' | '2' | '3'].segments[1]
  const targets = deploying ? deployTargets(ctx, state, unit) : proposeTargets(ctx, state, unit, reach)
  const contacts = deploying || worst || kind !== 'move' ? [] : proposeContacts(ctx, state, unit, reach)
  const contactOf = new Map<string, string>()
  for (const c of contacts) {
    targets.push(c.p)
    contactOf.set(`${c.p.x},${c.p.z}`, c.enemy)
  }
  const scored = targets.map((t) => {
    const ov = overlay(state, unit.id, { leaderAt: t, moved: true })
    const melee = contactOf.get(`${t.x},${t.z}`)
    // a charge is priced by what the melee would deal (exact odds on open ground), as a shot is by shotProxy
    const meleeProxy = melee ? meleeValue(ctx, state, unit, state.units[melee]!) * 0.7 : 0
    return { t, melee, v: stateValue(ctx, ov, unit.id) + shotProxy(ctx, ov, unit, t) + meleeProxy + tieBreak(`${unit.id}:${t.x},${t.z}`) }
  })
  scored.sort((a, b) => (worst ? a.v - b.v : b.v - a.v))
  const spots: Spot[] = []
  const take = scored.slice(0, Math.max(ctx.params.samples, limit))
  // a charge is always among the candidates when one is possible (the planner prices it against shooting)
  const firstContact = scored.find((x) => x.melee && !take.includes(x))
  if (firstContact && !worst) take.push(firstContact)
  for (const { t, v, melee } of take) {
    if (spots.length >= limit + (firstContact ? 1 : 0) || exhausted(ctx)) break
    if (spots.some((s) => dist(s.leader, t) < (melee ? 0.2 : 0.9))) continue
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
          fit = { pose, leader, speed, value: v, ...(melee ? { melee } : {}) }
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

/** What a Jump card action adds to its Move (difficult terrain ignored, terrain up to X high stood on or crossed), from the card chosen. */
export function jumpExtra(state: GameState, unit: Unit, chosen: string | null | undefined): Partial<MoveFrame> {
  if (!chosen || !chosen.startsWith('card:')) return {}
  const a = cardActions({ state }, unit).find((x) => `card:${x.id}` === chosen)
  return a?.jump !== undefined ? { ignoreDifficult: true, jumpHeight: a.jump } : {}
}

/**
 * Force Push: our Move of an enemy unit (speed X, engaged or not). Place it where it hurts that unit most: off the markers it holds,
 * away from the goal it is walking to and into our fire. Scored with the enemy's own value function (the seat flipped), lowest first.
 */
function bestPush(ctx: AiCtx, unit: Unit, maxSpeed: number): { sp: Spot; v: number; here: number } | null {
  const s = ctx.view
  const flipped: AiCtx = { ...ctx, seat: unit.seat, cache: new Map() }
  const here = stateValue(flipped, s, unit.id)
  let best: { sp: Spot; v: number; here: number } | null = null
  for (const sp of proposeSpots(flipped, unit, 'controlled', maxSpeed, 4, {}, true)) {
    const v = stateValue(flipped, overlay(s, unit.id, { leaderAt: sp.leader, yaw: sp.leader.yaw, moved: true }), unit.id) - here
    if (!best || v < best.v) best = { sp, v, here }
  }
  return best
}

/** Points the best Force Push (a speed-1 Move we place) takes off `enemy`'s position, as its own value function sees it. */
export function bestPushGain(ctx: AiCtx, enemy: Unit): number {
  const b = bestPush(ctx, enemy, 1)
  return b ? -b.v : 0
}

function pushEnemy(ctx: AiCtx, unit: Unit, maxSpeed: number): Action | null {
  const p = ctx.pending
  const b = bestPush(ctx, unit, maxSpeed)
  if (b) {
    const a = act.tool(p, b.sp.pose, b.sp.leader)
    if (validate(ctx.view, a) === null) return a
  }
  return p.canPass ? act.pass(p, p.seat === 'all' ? ctx.seat : p.seat) : null
}

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
  if (kind === 'controlled' && unit.seat !== ctx.seat) return pushEnemy(ctx, unit, maxSpeed)
  const extra = it && it.unitId === unitId ? jumpExtra(s, unit, it.chosen) : {}
  const spots = proposeSpots(ctx, unit, kind, maxSpeed, 4, extra)
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
