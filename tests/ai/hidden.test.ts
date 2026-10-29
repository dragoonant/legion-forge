import { describe, expect, it } from 'vitest'
import { view, type GameState, type Seat } from '@/engine'
import { createAiDecider } from '../../src/ai/decider'
import { play } from './helpers'

const FORBIDDEN = new Set(['rng', 'log', 'seed', 'hash'])

/** A view that throws when the decider touches a field the view must not expose, or opens a hidden value. */
function guard<T>(value: T, path = 'view', root = true): T {
  if (value === null || typeof value !== 'object') return value
  const hidden = (value as { hidden?: unknown }).hidden === true
  return new Proxy(value as object, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver)
      if (root && FORBIDDEN.has(prop)) throw new Error(`the AI read ${path}.${prop}`)
      if (hidden && prop !== 'hidden') throw new Error(`the AI opened a hidden value at ${path}.${prop}`)
      return guard(Reflect.get(target, prop, receiver), `${path}.${prop}`, false)
    },
  }) as T
}

describe('AI sees only view(state, seat)', () => {
  it('AI-009 the guard itself catches a read of rng or a hidden pick', () => {
    const r = play(2, { A: 'random', B: 'random' }, 20)
    const v = guard(view(r.state, 'A')) as unknown as Record<string, unknown>
    expect(() => v.rng).toThrow(/rng/)
    expect(() => (v.command as { picks: Record<string, { cardId: string }> }).picks.B?.cardId).not.toThrow()
    const hidden = guard({ hidden: true as const }, 'x', false) as unknown as { cardId?: string }
    expect(() => hidden.cardId).toThrow(/hidden/)
  })

  it('AI-010 never reads rng, log, seed, hash or a hidden value', () => {
    let checked = 0
    play(2, { A: 'normal', B: 'normal' }, 160, (s) => {
      if (s.state.seq % 9 !== 0 && s.pending.kind !== 'command.pick') return
      const v = guard(view(s.state, s.seat))
      createAiDecider('normal', { seed: 'g' }).decideSync(v, s.pending, s.legal)
      checked++
    })
    expect(checked).toBeGreaterThan(10)
  }, 120_000)

  it('AI-011 answers the same when only hidden facts differ (the other seat\'s pick, the pool order, the rng)', () => {
    let compared = 0
    play(4, { A: 'normal', B: 'normal' }, 200, (s) => {
      if (s.state.seq % 7 !== 0) return
      const other: Seat = s.seat === 'A' ? 'B' : 'A'
      const twin: GameState = structuredClone(s.state)
      // change everything the seat may not see
      twin.rng = { s: [1, 2, 3, 4] }
      twin.log = []
      twin.players[other].pool.tokens = [...twin.players[other].pool.tokens].reverse()
      if (twin.command.picks[other] && !twin.command.revealed) {
        const alt = twin.players[other].hand.find((c) => c !== twin.command.picks[other])
        if (alt) twin.command.picks[other] = alt
      }
      const v1 = view(s.state, s.seat)
      const v2 = view(twin, s.seat)
      expect(JSON.stringify(v2.players)).toBe(JSON.stringify(v1.players))
      expect(JSON.stringify(v2.command)).toBe(JSON.stringify(v1.command))
      // a frozen clock leaves only the deterministic work cap: under CPU load the wall-clock hard stop cut one of the two
      // searches short and the answers differed for reasons unrelated to hidden information
      const a1 = createAiDecider('normal', { seed: 'h', now: () => 0 }).decideSync(v1, s.pending, s.legal).action
      const a2 = createAiDecider('normal', { seed: 'h', now: () => 0 }).decideSync(v2, s.pending, s.legal).action
      expect(a2).toEqual(a1)
      compared++
    })
    expect(compared).toBeGreaterThan(10)
  }, 120_000)
})
