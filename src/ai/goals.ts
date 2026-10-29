// Objectives and goals (docs/spec/40-ai.md section 4): what each marker is worth to this seat, who is winning it in a given
// (overlay) state, and where each unit is heading. Contest and secure verdicts come from the engine (`contestingUnits`,
// `securedBy`), so a rules change in the engine changes the AI with it.
import { bd, colourOf, contests, contestingUnits, heldAssets, inAnyPolygon, labelOf, markersOf } from '@/engine/battle'
import type { GameState, ObjectiveMarker, Seat, Unit, Vec2 } from '@/engine'
import { alive, dist, leaderPos, maxRange, otherSeat, hash32, onTable, typicalRange } from './eval'
import type { AiCtx } from './tiers'

export interface Goal {
  pos: Vec2
  /** stop approaching once the leader is this close (centre to centre) */
  stand: number
  /** points per inch of progress, before the stall breaker */
  weight: number
  markerId: string | null
}

const lastRound = (s: GameState): number => s.origin.setup.options?.maxRounds ?? 5

/** Scoring End phases still ahead (rounds 2 to the last; this one included). */
export function scoringLeft(s: GameState): number {
  return Math.max(1, lastRound(s) - Math.max(s.round, 2) + 1)
}

interface ScoreRow {
  vp?: number
  count?: {
    state?: string
    territory?: string
    tokens?: { label?: string; tag?: string; notTag?: string; enemyOf?: string }
  }
}

/** Victory points per End phase the loaded Objective card gives `seat` for this marker, read from the card's scoring rows. */
function cardVp(state: GameState, seat: Seat, m: ObjectiveMarker): number {
  const card = state.data.battleCards[bd(state).objective] as { scoring?: ScoreRow[] } | undefined
  const own = inAnyPolygon(m.pos, bd(state).territories[seat] ?? [])
  let vp = 0
  for (const row of card?.scoring ?? []) {
    const t = row.count?.tokens
    if (!t || !row.vp) continue
    if (t.label && !m.tags.includes(`label:${t.label}`)) continue
    if (t.tag && !m.tags.includes(t.tag)) continue
    if (t.notTag && m.tags.includes(t.notTag)) continue
    if (t.enemyOf === 'scorer' && !m.tags.includes(`enemyOf:${colourOf(state, seat)}`)) continue
    if (row.count?.territory === 'notAllied' && own) continue
    // holding scores every End phase; destroying a marker is a one-off that takes wounds, so it counts for half
    vp += row.vp * (row.count?.state === 'secured' ? 1 : row.count?.state === 'destroyedThisPhase' ? 0.5 : 0)
  }
  return vp
}

/**
 * What a marker is worth to `seat` in victory points per End phase: what securing it scores for us plus most of what it would
 * score for the enemy (taking it denies them). Read from the mission's scoring rows (`battle/recon/objectives.json`).
 */
export function markerVp(state: GameState, seat: Seat, m: ObjectiveMarker): number {
  if (m.kind !== 'poi') return 0
  return cardVp(state, seat, m) + 0.8 * cardVp(state, otherSeat(seat), m)
}

export function markerValue(ctx: AiCtx, state: GameState, seat: Seat, m: ObjectiveMarker): number {
  const vp = markerVp(state, seat, m)
  if (vp <= 0) return 0
  return ctx.w.objective * ctx.params.objectives * vp * (1 + 0.35 * (scoringLeft(state) - 1))
}

export function pocketMarkers(state: GameState): ObjectiveMarker[] {
  return markersOf(state, 'poi')
}

/**
 * The mission's value of a state for `seat`: markers secured, contested, or lost (engine contest rules). Only `unitId` differs
 * from the view, so the contests of everyone else are counted once per decision and the engine's `contests` is asked about
 * that one unit (skipped when the unit is far beyond any contest distance).
 */
export function objectiveScore(ctx: AiCtx, state: GameState, seat: Seat, unitId: string): number {
  let base = ctx.cache.get('contestBase') as Map<string, Record<Seat, Set<string>>> | undefined
  const real = ctx.view
  if (!base) {
    base = new Map()
    for (const m of pocketMarkers(real)) {
      const c = contestingUnits(real, m)
      base.set(m.id, { A: new Set(c.A.map((u) => u.id)), B: new Set(c.B.map((u) => u.id)) })
    }
    ctx.cache.set('contestBase', base)
  }
  const unit = state.units[unitId]!
  const near = Math.max(state.data.constants.rangeBand, state.data.constants.halfRange) + 2
  let v = 0
  for (const m of pocketMarkers(state)) {
    const val = markerValue(ctx, state, seat, m)
    if (val <= 0) continue
    const b = base.get(m.id)!
    let a = b.A.size - (b.A.has(unitId) ? 1 : 0)
    let c = b.B.size - (b.B.has(unitId) ? 1 : 0)
    if (unit.location === 'table' && dist(leaderPos(unit), m.pos) <= near && contests(state, unit, m)) {
      if (unit.seat === 'A') a++
      else c++
    }
    const mine = seat === 'A' ? a : c
    const theirs = seat === 'A' ? c : a
    v += val * (mine > theirs ? 1 : theirs > mine ? -1 : mine > 0 ? 0.25 : 0)
  }
  return v
}

/** Rounds since a wound was dealt or a point scored (the stall breaker input). */
export function quietRounds(ctx: AiCtx): number {
  const s = ctx.view
  let wounds = 0
  for (const u of Object.values(s.units)) for (const m of u.minis) wounds += m.wounds + (m.alive ? 0 : 1)
  const points = s.players.A.points + s.players.B.points
  const mem = ctx.memory
  if (wounds !== mem.woundsSeen || points !== mem.pointsSeen) {
    mem.woundsSeen = wounds
    mem.pointsSeen = points
    mem.lastEventRound = s.round
  }
  return Math.max(0, s.round - mem.lastEventRound)
}

/** Where a unit still in reserve will enter: the middle of the first allied Territory. */
function entryPoint(state: GameState, seat: Seat): Vec2 {
  const polys = bd(state).territories[seat] ?? []
  const p = polys[0]
  if (!p || p.length === 0) return { x: 0, z: seat === 'A' ? 15 : -15 }
  let x = 0
  let z = 0
  for (const q of p) {
    x += q.x
    z += q.z
  }
  return { x: x / p.length, z: z / p.length }
}

export function unitPos(state: GameState, u: Unit): Vec2 {
  return u.location === 'table' ? leaderPos(u) : entryPoint(state, u.seat)
}

/**
 * One goal per unit of the seat: a marker worth holding (spread so that each marker gets the units it needs), else the nearest
 * enemy at a good firing distance. Cached for the decision.
 */
export function goalsFor(ctx: AiCtx): Map<string, Goal> {
  const hit = ctx.cache.get('goals') as Map<string, Goal> | undefined
  if (hit) return hit
  const s = ctx.view
  const seat = ctx.seat
  const out = new Map<string, Goal>()
  const mine = alive(s, seat)
  const markers = pocketMarkers(s).filter((m) => markerValue(ctx, s, seat, m) > 0)
  const load = new Map<string, number>()
  const need = new Map<string, number>()
  for (const m of markers) {
    const c = contestingUnits(s, m)
    need.set(m.id, Math.min(3, Math.max(1, c[otherSeat(seat)].length + 1)))
  }
  // pairs sorted by value per distance; each unit takes its best marker that still needs hands
  const pairs: { u: Unit; m: ObjectiveMarker; score: number }[] = []
  for (const u of mine) {
    const at = unitPos(s, u)
    for (const m of markers) pairs.push({ u, m, score: markerValue(ctx, s, seat, m) / (8 + dist(at, m.pos)) + hash32(`${u.id}${m.id}`) * 1e-12 })
  }
  pairs.sort((a, b) => b.score - a.score)
  // a unit carrying an Asset (a Scanner) scores for being out of its own Territory: it takes markers elsewhere, else the middle
  const carrying = (u: Unit) => heldAssets(s, u.id).length > 0
  const territory = bd(s).territories[seat] ?? []
  for (const p of pairs) {
    if (out.has(p.u.id)) continue
    if (carrying(p.u) && inAnyPolygon(p.m.pos, territory)) continue
    if ((load.get(p.m.id) ?? 0) >= (need.get(p.m.id) ?? 1)) continue
    load.set(p.m.id, (load.get(p.m.id) ?? 0) + 1)
    // long-range support units cover a marker from a distance rather than stand on it
    const support = maxRange(s, p.u) >= 18 && p.u.rank !== 'commander'
    out.set(p.u.id, { pos: p.m.pos, stand: support ? 7 : 1.8, weight: support ? 0.5 : 1, markerId: p.m.id })
  }
  const enemies = onTable(s, otherSeat(seat))
  for (const u of mine) {
    if (out.has(u.id)) continue
    const at = unitPos(s, u)
    if (carrying(u)) {
      out.set(u.id, { pos: { x: 0, z: 0 }, stand: 4, weight: 0.6, markerId: null })
      continue
    }
    let best: Unit | null = null
    let bd2 = Infinity
    for (const e of enemies) {
      const d = dist(at, leaderPos(e))
      if (d < bd2 - 1e-9 || (Math.abs(d - bd2) < 1e-9 && best && e.id < best.id)) {
        best = e
        bd2 = d
      }
    }
    if (best) out.set(u.id, { pos: leaderPos(best), stand: Math.max(typicalRange(s, u) * 0.8, 1.5), weight: 0.55, markerId: null })
    else out.set(u.id, { pos: { x: 0, z: 0 }, stand: 3, weight: 0.4, markerId: null })
  }
  ctx.cache.set('goals', out)
  return out
}

/** Points lost per the distance left to the goal, with the stall breaker. */
export function approachCost(ctx: AiCtx, goal: Goal, from: Vec2, quiet: number): number {
  const left = Math.max(0, dist(from, goal.pos) - goal.stand)
  return ctx.w.approach * goal.weight * left * (1 + ctx.w.patience * quiet) * (goal.markerId ? ctx.params.objectives * 0.5 + 0.5 : 1)
}

export { labelOf }
