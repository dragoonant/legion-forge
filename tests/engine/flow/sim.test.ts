import { describe, expect, it } from 'vitest'
import { runSim } from '../../../tools/sim-core'
import { simBundle, simSetupFor } from '../../../tools/sim-setup'

describe('sim gate', () => {
  it('two random-legal bots finish Recon games with no violations, rejections or leaks (60-testing G4, short; real attacks)', () => {
    const bundle = simBundle()
    const report = runSim({ games: 3, seed: 'gate', setupFor: simSetupFor(bundle, { matchup: 'all' }), bundle })
    expect(report.failing.map((g) => g.violations)).toEqual([])
    expect(report.completed).toBe(3)
    expect(report.rejections).toBe(0)
    // attacks are real: pools roll, wounds land, windows fire keywords
    expect(report.stats.attacks).toBeGreaterThan(0)
    expect(report.stats.woundsAssigned).toBeGreaterThan(0)
    expect(report.stats.keywordFires).toBeGreaterThan(0)
    expect(report.summaries.every((s) => s.rounds === 5 || s.reason === 'battle')).toBe(true)
  })
})
