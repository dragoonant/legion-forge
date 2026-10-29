// Values in points (docs/spec/40-ai.md section 4): what a unit is worth, what an attack is worth, the range and reach a unit
// has, and the hypothetical states ("overlays") the planner scores. An overlay is a shallow copy of the view with one unit
// moved or one token added; the real view is never mutated. Every probability and expected wound comes from `query.*`.
import { unitPoints } from '@/engine/bundle'
import { miniBody } from '@/engine/measure'
import * as query from '@/engine/query'
import { aliveMinis, leaderOf, unitsOnTable } from '@/engine/state'
import { miniWeapons, unitRank, weaponDef } from '@/engine/keywords'
import { unitSpeed } from '@/engine/movement'
import type { GameState, Mini, Seat, Unit, Vec2 } from '@/engine'
import { COST, spend, spendTypical, type AiCtx } from './tiers'

export const otherSeat = (s: Seat): Seat => (s === 'A' ? 'B' : 'A')

/** Wounds left on the unit and its wounds when fresh. */
export function woundsLeft(unit: Unit): number {
  let n = 0
  for (const m of unit.minis) if (m.alive) n += m.maxWounds - m.wounds
  return n
}
export function woundsTotal(unit: Unit): number {
  let n = 0
  for (const m of unit.minis) n += m.maxWounds
  return Math.max(1, n)
}

/** Points the unit is worth now: its points cost scaled by the wounds it has left (0 once defeated). */
export function worthOf(state: GameState, unit: Unit): number {
  if (unit.location === 'defeated') return 0
  return (unitPoints(state, unit.id) * woundsLeft(unit)) / woundsTotal(unit)
}

/** Points per wound of the unit when fresh. */
export function woundValue(state: GameState, unit: Unit): number {
  return unitPoints(state, unit.id) / woundsTotal(unit)
}

export function modelCount(unit: Unit): number {
  return Math.max(1, unit.minis.length)
}

/** The distance a leader can travel with the unit's fastest tool (centre to centre), inches. */
export function reachOf(state: GameState, unit: Unit): number {
  const speed = unitSpeed(state, unit)
  const sp = state.data.tool.speeds[String(speed) as '1' | '2' | '3']
  const r = miniBody(state, leaderOf(unit)).baseRadius
  return 2 * r + sp.segments[0] + sp.segments[1]
}

/** Longest ranged weapon the unit's models carry, inches (0 = melee only). */
export function maxRange(state: GameState, unit: Unit): number {
  const band = state.data.constants.rangeBand
  let best = 0
  for (const m of aliveMinis(unit)) {
    for (const wid of miniWeapons(state, unit, m.id)) {
      const w = weaponDef(state, wid)
      const max = (w.range as { max?: number } | undefined)?.max ?? 1
      if (max > 0) best = Math.max(best, max * band)
    }
  }
  return best
}

/** The range band most of the unit's firepower shares (max band of the best weapon by dice), inches; 0 for melee-only units. */
export function typicalRange(state: GameState, unit: Unit): number {
  const band = state.data.constants.rangeBand
  const bands: number[] = []
  for (const m of aliveMinis(unit)) {
    for (const wid of miniWeapons(state, unit, m.id)) {
      const w = weaponDef(state, wid)
      const max = (w.range as { max?: number } | undefined)?.max ?? 1
      if (max > 0) bands.push(max)
    }
  }
  if (bands.length === 0) return 0
  bands.sort((a, b) => a - b)
  return bands[Math.floor((bands.length - 1) / 2)]! * band
}

export function leaderPos(unit: Unit): Vec2 {
  const l = leaderOf(unit)
  return { x: l.pos.x, z: l.pos.z }
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Stable 32-bit hash of a string (FNV-1a), for deterministic tie-breaks that do not depend on list order. */
export function hash32(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A tie-break epsilon in [0, 1e-6) from a stable id. */
export function tieBreak(id: string): number {
  return (hash32(id) / 4294967296) * 1e-6
}

/** Units of `seat` that count in play (on the table, or still to enter). */
export function alive(state: GameState, seat: Seat): Unit[] {
  return Object.values(state.units).filter((u) => u.seat === seat && u.location !== 'defeated' && u.minis.some((m) => m.alive))
}

export function onTable(state: GameState, seat: Seat): Unit[] {
  return unitsOnTable(state).filter((u) => u.seat === seat)
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

export interface OverlayPatch {
  /** move the whole unit rigidly so its leader stands here (a unit still in reserve gets a formation around it) */
  leaderAt?: Vec2
  yaw?: number
  /** tokens to add (aim, dodge, standby) */
  addTokens?: Record<string, number>
  /** mark the unit as having moved this activation (Cumbersome, Sniper Team); false clears the mark */
  moved?: boolean
  /** replace the suppression count */
  suppression?: number
}

/** Positions of a unit's models around a leader spot: a tight spiral, so reserve units and big moves get a plausible shape. */
export function formation(state: GameState, unit: Unit, at: Vec2, _yaw: number): Map<string, Vec2> {
  const out = new Map<string, Vec2>()
  const leader = leaderOf(unit)
  out.set(leader.id, at)
  const r = miniBody(state, leader).baseRadius * 2 + 0.15
  let k = 0
  for (const m of unit.minis) {
    if (!m.alive || m.id === leader.id) continue
    const ring = 1 + Math.floor(k / 6)
    const a = (2 * Math.PI * (k % 6)) / 6 + ring * 0.5
    out.set(m.id, { x: at.x + Math.cos(a) * r * ring, z: at.z + Math.sin(a) * r * ring })
    k++
  }
  return out
}

/** The state with `unitId` changed as the patch says. */
export function overlay(state: GameState, unitId: string, patch: OverlayPatch): GameState {
  const u = state.units[unitId]!
  let minis: Mini[] = u.minis
  if (patch.leaderAt) {
    const lead = leaderOf(u)
    if (u.location === 'table') {
      const dx = patch.leaderAt.x - lead.pos.x
      const dz = patch.leaderAt.z - lead.pos.z
      minis = u.minis.map((m) => (m.alive ? { ...m, pos: { x: m.pos.x + dx, y: m.pos.y, z: m.pos.z + dz }, ...(patch.yaw !== undefined ? { yaw: patch.yaw } : {}) } : m))
    } else {
      const f = formation(state, u, patch.leaderAt, patch.yaw ?? 0)
      minis = u.minis.map((m) => {
        const p = f.get(m.id)
        return m.alive && p ? { ...m, pos: { x: p.x, y: 0, z: p.z }, ...(patch.yaw !== undefined ? { yaw: patch.yaw } : {}) } : m
      })
    }
  }
  const tokens = { ...u.tokens }
  for (const [k, n] of Object.entries(patch.addTokens ?? {})) tokens[k] = (tokens[k] ?? 0) + n
  let flags = u.flags
  if (patch.moved) flags = { ...u.flags, movedThisActivation: true }
  else if (patch.moved === false && u.flags.movedThisActivation) {
    flags = { ...u.flags }
    delete flags.movedThisActivation
  }
  const unit: Unit = {
    ...u,
    minis,
    tokens,
    flags,
    location: u.location === 'table' || !patch.leaderAt ? u.location : 'table',
    suppression: patch.suppression ?? u.suppression,
    engagedWith: u.engagedWith,
  }
  return { ...state, units: { ...state.units, [unitId]: unit } }
}

/** The table without terrain, for "typical engagement" odds that must not depend on where the enemy happens to stand. */
export function openGround(state: GameState): GameState {
  return { ...state, table: { ...state.table, def: { ...state.table.def, pieces: [] } } }
}

// ---------------------------------------------------------------------------
// Attack values
// ---------------------------------------------------------------------------

export interface OddsLite {
  expectedWounds: number
  expectedKills?: number
  pDefeat: number
  pAnyHit: number
  suppressionAdded?: number
}

/** Points an attack is worth against `def` from its odds (wounds as points, a share of the kill, suppression). */
export function damageValue(ctx: AiCtx, state: GameState, def: Unit, o: OddsLite): number {
  const worth = worthOf(state, def)
  if (worth <= 0) return 0
  const wv = woundValue(state, def)
  const dealt = Math.min(worth, o.expectedWounds * wv)
  const supp = (o.suppressionAdded ?? o.pAnyHit) * ctx.w.suppression * worth
  return ctx.w.damage * (dealt + 0.25 * o.pDefeat * worth) + supp
}

/** Exact odds for one attack from the (overlay) state; null when the budget is spent or the target is not attackable. */
export function attackFrom(ctx: AiCtx, state: GameState, atk: Unit, def: Unit, aim: number, key: string): { value: number; odds: query.AttackOdds } | null {
  const hit = ctx.cache.get(key) as { value: number; odds: query.AttackOdds } | null | undefined
  if (hit !== undefined) return hit
  // across decisions: the same shot from the same spots with the same wounds and tokens has the same odds
  const lead = leaderPos(atk)
  const tgt = leaderPos(def)
  const long = `${atk.id}@${Math.round(lead.x * 8)},${Math.round(lead.z * 8)}|${aim}|${atk.flags.movedThisActivation ? 'm' : 's'}|${def.id}@${Math.round(tgt.x * 8)},${Math.round(tgt.z * 8)}|${woundsLeft(atk)}/${woundsLeft(def)}|${def.suppression}|${def.tokens.dodge ?? 0}|${atk.suppression}`
  const mem = ctx.memory.exact
  const seen = mem.get(long)
  if (seen !== undefined) {
    const out = seen === null ? null : { value: damageValue(ctx, state, def, seen), odds: seen }
    ctx.cache.set(key, out)
    return out
  }
  if (!spend(ctx, COST.target)) return null
  let out: { value: number; odds: query.AttackOdds } | null = null
  const check = query.checkTarget(state, atk.id, def.id)
  if (check.ok) {
    if (!spend(ctx, COST.odds)) return null
    const odds = query.attackOdds(state, atk.id, def.id, { aim })
    out = { value: damageValue(ctx, state, def, odds), odds }
  }
  ctx.cache.set(key, out)
  if (mem.size > 6000) mem.clear()
  mem.set(long, out ? out.odds : null)
  return out
}

/**
 * What `atk` would deal to `def` in the open at the unit's typical firing distance, in points: the attack half of the threat
 * map and the "is anything worth shooting" half of the activation order. Cached across decisions per wound counts.
 */
export function typicalValue(ctx: AiCtx, state: GameState, atk: Unit, def: Unit, dodge = 0): number {
  const mem = ctx.memory.typical
  const key = `${atk.id}>${def.id}|${woundsLeft(atk)}|${woundsLeft(def)}|${dodge}|${def.suppression}|${atk.suppression}`
  const hit = mem.get(key)
  if (hit !== undefined) return hit
  if (!spendTypical(ctx, COST.odds + 0.5)) return 0
  const range = typicalRange(state, atk)
  const lead = leaderPos(atk)
  const target = leaderPos(def)
  const d = Math.max(0.1, dist(lead, target))
  const gap = range > 0 ? Math.max(1, range * 0.8) + 1.6 : miniBody(state, leaderOf(atk)).baseRadius + miniBody(state, leaderOf(def)).baseRadius + 0.01
  const f = gap / d
  // the attacker stands `gap` from the defender on the line toward where it is now
  const at = { x: target.x + (lead.x - target.x) * f, z: target.z + (lead.z - target.z) * f }
  let ov = overlay(openGround(state), atk.id, { leaderAt: at, moved: false })
  const defU = ov.units[def.id]!
  if (dodge > 0) ov = { ...ov, units: { ...ov.units, [def.id]: { ...defU, tokens: { ...defU.tokens, dodge } } } }
  let value = 0
  try {
    const odds = query.attackOdds(ov, atk.id, def.id, { aim: 0, dodge, ...(range === 0 ? { kind: 'melee' as const } : {}) })
    value = damageValue(ctx, ov, ov.units[def.id]!, odds)
  } catch {
    value = 0
  }
  // a unit still in reserve is only a stand-in at a candidate spot: its number is not worth keeping for the game
  if (ctx.view.units[atk.id]?.location === 'table' && ctx.view.units[def.id]?.location === 'table') {
    if (mem.size > 4000) mem.clear()
    mem.set(key, value)
  }
  return value
}

/**
 * What `atk` would deal to `def` in melee with its leader in base contact, in points (a charge's payoff, and what an engaged enemy
 * threatens): exact engine odds on open ground, cached across decisions per wound counts. 0 when it has no melee weapon.
 */
export function meleeValue(ctx: AiCtx, state: GameState, atk: Unit, def: Unit): number {
  const mem = ctx.memory.typical
  const key = `M|${atk.id}>${def.id}|${woundsLeft(atk)}|${woundsLeft(def)}|${def.suppression}|${atk.suppression}`
  const hit = mem.get(key)
  if (hit !== undefined) return hit
  if (!spendTypical(ctx, COST.odds + 0.5)) return 0
  const lead = leaderPos(atk)
  const target = leaderPos(def)
  const gap = miniBody(state, leaderOf(atk)).baseRadius + miniBody(state, leaderOf(def)).baseRadius + 0.0003
  const d = Math.max(0.1, dist(lead, target))
  const f = gap / d
  const at = { x: target.x + (lead.x - target.x) * f, z: target.z + (lead.z - target.z) * f }
  const ov = overlay(openGround(state), atk.id, { leaderAt: at, moved: false })
  let value = 0
  try {
    const odds = query.attackOdds(ov, atk.id, def.id, { aim: 0, kind: 'melee' })
    value = damageValue(ctx, ov, ov.units[def.id]!, odds)
  } catch {
    value = 0
  }
  if (ctx.view.units[atk.id]?.location === 'table' && ctx.view.units[def.id]?.location === 'table') {
    if (mem.size > 4000) mem.clear()
    mem.set(key, value)
  }
  return value
}

/** Rank key of a unit ('commander', 'corps'...). */
export const rankOf = (u: Unit): string => unitRank(u)

