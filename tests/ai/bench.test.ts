import { describe, expect, it } from 'vitest'
import { createAiDecider } from '../../src/ai/decider'
import { playMatch } from '../../tools/ai-match'
import { simBundle, simSetupFor } from '../../tools/sim-setup'

describe('AI bench harness', () => {
  it('AI-050 a match reports the behaviour counters and finishes with zero rejections, fallbacks and stalls', () => {
    const bundle = simBundle()
    const setup = simSetupFor(bundle, { matchup: 'main', rounds: 2 })(3)
    const a = createAiDecider('normal', { seed: 'b:A' })
    const b = createAiDecider('random', { seed: 'b:B' })
    const m = playMatch(setup, bundle, 'bench-3', { A: a, B: b })
    expect(m.ended).toBe(true)
    expect(m.stalled).toBe(false)
    expect(m.seats.A.rejections + m.seats.B.rejections).toBe(0)
    expect(m.seats.A.fallbacks).toBe(0)
    expect(m.seats.A.activations).toBeGreaterThan(0)
    expect(m.behaviour.A.attacks + m.behaviour.A.tokens.aim.gained + m.behaviour.A.tokens.dodge.gained).toBeGreaterThan(0)
    expect(Object.keys(m.kinds)).toContain('action.choose')
    expect(a.memory.stats.behaviour.activations).toBeGreaterThan(0)
  }, 120_000)
})
