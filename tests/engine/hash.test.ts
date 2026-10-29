// HASH-: the streaming state hash is exactly the fnv1a of the canonical string the earlier version built, so recorded hashes
// and saves stay valid, and it is stable under key order.
import { describe, expect, it } from 'vitest'
import '../../src/engine'
import { fnv1a } from '../../src/engine/rng'
import { canon, hashState } from '../../src/engine/state'
import type { GameState } from '../../src/engine'
import { newGame } from './flow/helpers'

/** The string-building reference implementation the streaming hash replaced. */
function reference(state: GameState): string {
  const src = state as unknown as Record<string, unknown>
  const excluded = new Set(['data', 'origin', 'log', 'hash'])
  const parts: string[] = []
  for (const k of Object.keys(src).filter((x) => !excluded.has(x)).sort()) {
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

describe('state hash', () => {
  it('HASH-001 equals the fnv1a of the canonical string on a real game state, and ignores key order', () => {
    const g = newGame({ options: { autoDeploy: true } })
    expect(hashState(g.state)).toBe(reference(g.state))
    expect(hashState(g.state)).toBe(g.state.hash)
    // the same content in another key order hashes the same
    const shuffled = { ...g.state, units: Object.fromEntries(Object.entries(g.state.units).reverse()) } as GameState
    expect(hashState(shuffled)).toBe(hashState(g.state))
    // a changed value changes it
    const moved = JSON.parse(JSON.stringify({ ...g.state, data: undefined, origin: undefined })) as GameState
    moved.data = g.state.data
    moved.origin = g.state.origin
    moved.table.def = g.state.table.def
    const first = Object.values(moved.units)[0]!
    first.suppression += 1
    expect(hashState(moved)).not.toBe(hashState(g.state))
  })
})
