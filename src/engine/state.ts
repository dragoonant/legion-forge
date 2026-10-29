// State helpers: units, minis, seats, order pool, immutable updates, canonical hashing.
import { round3 } from './geometry'
import { fnv1a } from './rng'
import type { GameState, Mini, RuleConstants, Seat, Unit, Vec2, Vec3 } from './types'

export class EngineInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngineInvariantError'
  }
}

export const SEATS: readonly Seat[] = ['A', 'B']

export function otherSeat(seat: Seat): Seat {
  return seat === 'A' ? 'B' : 'A'
}

export function getUnit(state: GameState, id: string): Unit {
  const u = state.units[id]
  if (!u) throw new EngineInvariantError(`unknown unit ${id}`)
  return u
}

export function allUnits(state: GameState): Unit[] {
  return Object.values(state.units)
}

/** Units deployed on the table (not in reserve, not defeated). */
export function unitsOnTable(state: GameState): Unit[] {
  return allUnits(state).filter((u) => u.location === 'table')
}

export function seatUnits(state: GameState, seat: Seat): Unit[] {
  return allUnits(state).filter((u) => u.seat === seat && u.location !== 'defeated')
}

export function enemiesOf(state: GameState, unit: { seat: Seat }): Unit[] {
  return unitsOnTable(state).filter((u) => u.seat !== unit.seat)
}

export function aliveMinis(unit: Unit): Mini[] {
  return unit.minis.filter((m) => m.alive)
}

export function leaderOf(unit: Unit): Mini {
  const m = unit.minis.find((x) => x.id === unit.leaderId)
  if (!m) throw new EngineInvariantError(`unit ${unit.id} has no leader ${unit.leaderId}`)
  return m
}

export function miniById(unit: Unit, miniId: string): Mini {
  const m = unit.minis.find((x) => x.id === miniId)
  if (!m) throw new EngineInvariantError(`unit ${unit.id} has no mini ${miniId}`)
  return m
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function centreOf(m: { pos: Vec3 }): Vec2 {
  return { x: m.pos.x, z: m.pos.z }
}

/** The rule constants of the snapshot (core/constants.json `values`). */
export function constants(state: GameState): RuleConstants {
  return state.data.constants
}

/** Token counter helpers (open union: aim, dodge, standby, surge, keyword tokens). */
export function tokenCount(unit: Unit, kind: string): number {
  return unit.tokens[kind] ?? 0
}

/** Order pool rank counts (what `view` exposes instead of the token order). */
export function poolCounts(tokens: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const t of tokens) counts[t] = (counts[t] ?? 0) + 1
  // keys in sorted order: the insertion order would leak the order of the pool
  const out: Record<string, number> = {}
  for (const k of Object.keys(counts).sort()) out[k] = counts[k]!
  return out
}

/** Positions and lengths are canonical to 1/1000 inch after every placement (00 section 7.1). */
export function roundVec3(v: Vec3): Vec3 {
  return { x: round3(v.x), y: round3(v.y), z: round3(v.z) }
}

// ---------------------------------------------------------------------------
// Cloning and hashing
// ---------------------------------------------------------------------------

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(value as Record<string, unknown>)) {
    out[k] = deepClone((value as Record<string, unknown>)[k])
  }
  return out as T
}

/** Structural copy of a state. `data` and `origin` are immutable and shared by reference, as is `table.def`. */
export function cloneState(state: GameState): GameState {
  const src = state as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(src)) {
    if (k === 'data' || k === 'origin') out[k] = src[k]
    else if (k === 'log') out[k] = state.log.slice()
    else if (k === 'table') {
      const { def, ...dynamic } = state.table
      out[k] = { def, ...(deepClone(dynamic) as object) }
    } else out[k] = deepClone(src[k])
  }
  return out as unknown as GameState
}

const keyJson = new Map<string, string>()
function keyString(k: string): string {
  let j = keyJson.get(k)
  if (j === undefined) {
    j = JSON.stringify(k)
    if (keyJson.size < 20_000) keyJson.set(k, j)
  }
  return j
}

/** Canonical JSON: sorted keys, undefined skipped. */
export function canon(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? String(value) : 'null'
    case 'boolean':
      return value ? 'true' : 'false'
    case 'string':
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) {
        let out = '['
        for (let i = 0; i < value.length; i++) {
          const v = value[i]
          if (i > 0) out += ','
          out += v === undefined ? 'null' : canon(v)
        }
        return out + ']'
      }
      const rec = value as Record<string, unknown>
      const keys = Object.keys(rec)
      if (keys.length > 1) keys.sort()
      let out = '{'
      let first = true
      for (const k of keys) {
        const v = rec[k]
        if (v === undefined) continue
        if (!first) out += ','
        first = false
        out += keyString(k) + ':' + canon(v)
      }
      return out + '}'
    }
    default:
      return 'null'
  }
}

const HASH_EXCLUDED = new Set(['data', 'origin', 'log', 'hash'])

/** fnv1a of the canonical state minus the log, the static data/origin, the compiled table definition and the hash itself. */
export function hashState(state: GameState): string {
  const src = state as unknown as Record<string, unknown>
  const keys = Object.keys(src)
    .filter((k) => !HASH_EXCLUDED.has(k))
    .sort()
  const parts: string[] = []
  for (const k of keys) {
    let v = src[k]
    if (v === undefined) continue
    if (k === 'table') {
      const { def: _def, ...dynamic } = state.table
      v = dynamic
    }
    parts.push(JSON.stringify(k) + ':' + canon(v))
  }
  return fnv1a('{' + parts.join(',') + '}')
}
