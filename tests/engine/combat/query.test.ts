// QRY-: query.* numbers are exact and agree with the steps they preview; determinism and serialisability of the attack state.
import { afterEach, describe, expect, it } from 'vitest'
import { step } from '../../../src/engine'
import { attackOdds, attackPool, attackTargets, coverVerdict, defenceOdds, distanceBetween, engagedWith, inRange, keywordsOf, losCover, poolHitDistribution, rallyOdds, rangeBandBetween } from '../../../src/engine/query'
import { canon } from '../../../src/engine/state'
import { box } from '../fixtures'
import { DATA, atk, beginAttack, choose, def, eventsOf, game, ok, script, u, unit, uninstallModules } from './harness'

afterEach(uninstallModules)

const ST = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5], [1.5, -5.5], [0, -6.5]], ...over })
const RT = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3], [-1.5, 3.5], [1.5, 3.5], [0, 4.5]], ...over })

describe('QRY exact odds', () => {
  it('DICE-007 attackOdds for 4 white dice with surge-to-hit equals the exact face-table distribution (P(no hit or crit) = (5/8)^4)', () => {
    const s = game([ST(), RT()])
    const o = attackOdds(s, 'ST', 'RT')
    expect(o.dice).toEqual({ red: 0, black: 0, white: 4 })
    expect(1 - o.pAnyHit).toBeCloseTo(Math.pow(5 / 8, 4), 12)
    expect(o.pHits.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    expect(o.woundDist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    expect(o.killDist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    expect(o.exact).toBe(true)
  })

  it('QRY-001 one black die against a red defender: P(wound) = P(hit or crit) x P(no block) exactly', () => {
    const shooter = unit({ id: 'R', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3]] })
    const target = unit({ id: 'E', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5]] })
    const o = attackOdds(game([shooter, target]), 'R', 'E')
    expect(o.expectedWounds).toBeCloseTo((4 / 8) * (1 / 2), 12)
    expect(o.woundDist[1]).toBeCloseTo(0.25, 12)
  })

  it('QRY-002 an Aim token rerolls the dice that failed: one black die, one Aim -> P(success) = 3/4', () => {
    const shooter = unit({ id: 'R', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3]], tokens: { aim: 1 } })
    const target = unit({ id: 'E', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5]] })
    const o = attackOdds(game([shooter, target]), 'R', 'E')
    expect(o.pAnyHit).toBeCloseTo(0.75, 12)
    expect(o.explain).toContain('aim:1x2')
  })

  it('QRY-003 cover, Dodge and Armor lower the expected wounds; Pierce raises them', () => {
    const open = attackOdds(game([ST(), RT()]), 'ST', 'RT')
    const covered = attackOdds(game([ST(), RT()], { pieces: [box('crate', -4, 0, 4, 1, { heightIn: 1, cover: 'heavy' })] }), 'ST', 'RT')
    expect(covered.cover).toBe('heavy')
    expect(covered.expectedWounds).toBeLessThan(open.expectedWounds)
    const dodged = attackOdds(game([ST(), RT({ tokens: { dodge: 2 } })]), 'ST', 'RT')
    expect(dodged.expectedWounds).toBeLessThan(open.expectedWounds)
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const target = unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633], [3, 1]] })
    const melee = attackOdds(game([vader, target]), 'V', 'E')
    expect(melee.kind).toBe('melee')
    expect(melee.dice).toEqual({ red: 6, black: 0, white: 0 })
    expect(melee.suppressionAdded).toBe(0)
  })

  it('QRY-004 the numbers shown before an attack match the cover verdict the attack step applies (LOS-008)', () => {
    const s = game([ST(), RT()], { pieces: [box('crate', -4, 0, 4, 1, { heightIn: 1, cover: 'light' })] })
    const lc = losCover(s, 'ST', 'RT')
    expect(lc.level).toBe('light')
    expect(coverVerdict(s, u(s, 'ST'), u(s, 'RT')).level).toBe(lc.level)
    let r = beginAttack(s, 'ST', 'RT')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('white', 'blank', 'blank', 'blank', 'blank'))))
    expect(eventsOf(r, 'CoverApplied')[0]!.cover).toBe(lc.level)
    expect(eventsOf(r, 'CoverApplied')[0]!.byTerrainId).toEqual(lc.scan.byTerrainId)
    expect(attackTargets(s, 'ST').find((t) => t.unitId === 'RT')!.cover).toBe('light')
  })

  it('QRY-005 defenceOdds, rallyOdds and keywordsOf report engine numbers with data names', () => {
    const s = game([ST(), RT({ suppression: 2 })])
    const d = defenceOdds(s, 'RT', 3)
    expect(d.colour).toBe('white')
    // white die with a block chart: block or surge = 2/6 per die
    expect(d.expectedBlocks).toBeCloseTo(3 * (2 / 6), 12)
    expect(defenceOdds(s, 'RT', 3, { pierce: 1 }).expectedBlocks).toBeLessThan(d.expectedBlocks)
    expect(rallyOdds(s, 'RT').expectedRemoved).toBeCloseTo(2 * (1 / 3), 12)
    expect(keywordsOf(s, 'RT').map((k) => k.name)).toEqual(['Agile', 'Nimble'])
  })

  it('QRY-006 poolHitDistribution with rerolls is a probability distribution and never worse than no rerolls', () => {
    const none = poolHitDistribution(DATA.dice, ['red', 'black', 'white'], 'hit', 0)
    const aim = poolHitDistribution(DATA.dice, ['red', 'black', 'white'], 'hit', 2)
    const sum = (d: typeof none) => d.p.flat().reduce((a, b) => a + b, 0)
    expect(sum(none)).toBeCloseTo(1, 12)
    expect(sum(aim)).toBeCloseTo(1, 12)
    expect(1 - aim.p[0]![0]!).toBeGreaterThan(1 - none.p[0]![0]!)
  })

  it('QRY-007 attackTargets for a 10 against 10 board stays inside the budget', () => {
    const mine = Array.from({ length: 10 }, (_, i) => unit({ id: `A${i}`, seat: 'A', data: 'emp.u.stormtroopers', at: [[-30 + i * 3, -10], [-30 + i * 3 + 1.2, -10.8], [-30 + i * 3 - 1.2, -10.8], [-30 + i * 3, -12]] }))
    const theirs = Array.from({ length: 10 }, (_, i) => unit({ id: `B${i}`, seat: 'B', data: 'reb.u.rebel-troopers', at: [[-30 + i * 3, 4], [-30 + i * 3 + 1.2, 4.8], [-30 + i * 3 - 1.2, 4.8], [-30 + i * 3, 6]] }))
    const s = game([...mine, ...theirs])
    const t0 = performance.now()
    const t = attackTargets(s, 'A4')
    const ms = performance.now() - t0
    expect(t.filter((x) => x.ok).length).toBeGreaterThan(0)
    expect(ms).toBeLessThan(250) // spec budget is 10 ms on the target machine; CI headroom
  })
})

describe('QRY distances and pools', () => {
  it('QRY-013 distance, range band, in-range, engagement and the pool preview come from one place', () => {
    const s = game([ST(), RT(), unit({ id: 'TOUCH', seat: 'B', data: 'reb.u.rebel-troopers', at: [[20, -5]] })])
    expect(distanceBetween(s, 'ST', 'RT')).toBeCloseTo(8 - 2 * 0.5315, 2)
    expect(rangeBandBetween(s, 'ST', 'RT')).toBe(2)
    expect(inRange(s, 'ST', 'RT', 2)).toBe(true)
    expect(inRange(s, 'ST', 'RT', 1)).toBe(false)
    expect(engagedWith(s, 'ST')).toEqual([])
    const p = attackPool(s, 'ST', 'RT')
    expect(p).toMatchObject({ kind: 'ranged', dice: { red: 0, black: 0, white: 4 }, keywords: [] })
    const touching = game([ST({ at: [[0, 0]] }), unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633]] })])
    expect(engagedWith(touching, 'ST')).toEqual(['E'])
    expect(attackPool(touching, 'ST', 'E').kind).toBe('melee')
  })
})

describe('QRY pool shifts in the odds', () => {
  it('QRY-011 Cumbersome downgrades the odds when the unit moved, exactly as the attack step does', () => {
    const mk = () => ST({ upgrades: ['emp.up.hh12-stormtrooper'], extra: [{ at: [0, -7.5], weapon: 'emp.w.hh12', upgradeId: 'emp.up.hh12-stormtrooper' }] })
    const w = [{ miniId: 'ST.u1', weaponId: 'emp.w.hh12' }]
    const still = attackOdds(game([mk(), RT({ at: [[0, 8]] })]), 'ST', 'RT', { weapons: w })
    const movedState = game([mk(), RT({ at: [[0, 8]] })])
    u(movedState, 'ST').flags['movedThisActivation'] = true
    const moved = attackOdds(movedState, 'ST', 'RT', { weapons: w })
    // Stormtroopers turn surges into hits: a black die succeeds on 3 hit + 1 crit + 1 surge of 8, a white die on 1 + 1 + 1
    expect(1 - still.pAnyHit).toBeCloseTo(Math.pow(3 / 8, 3), 12)
    expect(1 - moved.pAnyHit).toBeCloseTo(Math.pow(5 / 8, 3), 12)
    expect(moved.pAnyHit).toBeLessThan(still.pAnyHit)
    expect(moved.explain).toContain('moved')
  })

  it('QRY-012 Sniper Team odds use the upgraded dice (the surge-to-hit chart does not apply to Scout surges)', () => {
    const sn = unit({ id: 'SN', seat: 'A', data: 'emp.u.scout-strike-team', at: [[0, -10]], upgrades: ['emp.up.dlt19x-sniper'] })
    sn.minis[0]!.weaponIds = ['emp.w.dlt19x']
    sn.minis[0]!.upgradeId = 'emp.up.dlt19x-sniper'
    const o = attackOdds(game([sn, RT()]), 'SN', 'RT')
    expect(o.explain).toContain('sniper')
    // black x2, white x1 upgraded: red x2, black x1; scout strike team surge chart attack = crit
    const redOk = 6 / 8 + 1 / 8 // hit + crit + surge->crit
    const blackOk = 3 / 8 + 1 / 8 + 1 / 8
    expect(1 - o.pAnyHit).toBeCloseTo((1 - redOk) ** 2 * (1 - blackOk), 12)
  })
})

describe('QRY determinism', () => {
  it('QRY-008 the same state and the same seed give the same attack, event for event and hash for hash', () => {
    const play = () => {
      const s = game([ST({ tokens: { aim: 1 } }), RT({ tokens: { dodge: 1 } })], { seed: 'det' })
      let r = beginAttack(s, 'ST', 'RT')
      r = ok(choose(r.state, 'pool:ranged:all', script(atk('white', 'hit', 'blank', 'blank', 'blank'))))
      r = ok(choose(r.state, r.pending!.options![0]!.id, script(atk('white', 'hit', 'hit', 'crit'))))
      r = ok(choose(r.state, 'dodge:1', script(def('white', 'blank', 'blank', 'surge'))))
      return r
    }
    const a = play()
    const b = play()
    expect(a.state.hash).toBe(b.state.hash)
    expect(a.events.map((e) => e.type)).toEqual(b.events.map((e) => e.type))
  })

  it('QRY-009 every state the attack machine passes through survives a JSON round trip unchanged (no functions, no undefined)', () => {
    const s = game([ST({ tokens: { aim: 1 } }), RT({ tokens: { dodge: 1 } })])
    let r = beginAttack(s, 'ST', 'RT')
    const check = (state: typeof r.state) => expect(canon(JSON.parse(JSON.stringify(state)))).toBe(canon(state))
    check(r.state)
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('white', 'hit', 'blank', 'blank', 'blank'))))
    check(r.state)
    expect(r.state.attack).not.toBeNull()
    r = ok(choose(r.state, r.pending!.options![0]!.id, script(atk('white', 'hit', 'hit', 'hit'))))
    check(r.state)
    r = ok(choose(r.state, 'dodge:1', script(def('white', 'blank', 'blank', 'blank'))))
    check(r.state)
    expect(r.state.attack).toBeNull()
  })

  it('QRY-010 a rejected answer returns the same state reference and leaves the pending decision unchanged', () => {
    const s = game([ST(), RT()])
    const r = beginAttack(s, 'ST', 'RT')
    const bad = { type: 'attack.pool' as const, seat: 'B' as const, decisionId: r.state.pending!.id, payload: { weaponIds: {} } }
    const rej = step(r.state, bad)
    expect(rej.rejection?.code).toBe('E_WRONG_SEAT')
    expect(rej.state).toBe(r.state)
  })
})
