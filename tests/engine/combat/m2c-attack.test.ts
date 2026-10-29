// M2c review findings 19 to 21 and 31: Observation tokens, Overwhelm without a hit, spends that only a keyword reads (Aim for
// Duelist / Overwhelm, Dodge for Duelist), and Suppressive staying behind the base token.
import { afterEach, describe, expect, it } from 'vitest'
import { resetFireCounts } from '../../../src/engine/code-hooks'
import { canContest } from '../../../src/engine/battle'
import { checkTarget } from '../../../src/engine/query'
import { atk, beginAttack, choose, def, eventsOf, game, menu, ok, optionIds, script, u, unit, uninstallModules } from './harness'

afterEach(() => {
  uninstallModules()
  resetFireCounts()
})

const RT = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3], [-1.5, 3.5], [1.5, 3.5], [0, 4.5]], ...over })
const ST = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5], [1.5, -5.5], [0, -6.5]], ...over })
const sniper = () => {
  const sst = unit({ id: 'SN', seat: 'A', data: 'emp.u.scout-strike-team', at: [[0, -10]], upgrades: ['emp.up.dlt19x-sniper'] })
  sst.minis[0]!.weaponIds = ['emp.w.dlt19x']
  sst.minis[0]!.upgradeId = 'emp.up.dlt19x-sniper'
  return sst
}
const POOL = 'pool:ranged:all'

describe('M2c Observation (review 19)', () => {
  it('RVW-19 the defender\'s Observation tokens each reroll one attack die, in Reroll Dice, spent one at a time', () => {
    let r = beginAttack(game([ST(), RT({ tokens: { observation: 2 } })]), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'blank', 'blank', 'blank', 'blank'))))
    expect(r.pending!.kind).toBe('attack.spend')
    expect(r.pending!.context['step']).toBe('reroll')
    expect(r.pending!.context['observation']).toBe(2)
    expect(optionIds(r.state)).toContain('observe:blank')
    // no Aim: the Observation options are the only rerolls
    expect(optionIds(r.state).filter((id) => id.startsWith('reroll:') && id !== 'reroll:done')).toEqual([])
    r = ok(choose(r.state, 'observe:blank', script(atk('white', 'hit'))))
    expect(u(r.state, 'RT').tokens['observation']).toBe(1)
    expect(eventsOf(r, 'Rerolled')[0]).toMatchObject({ faces: ['hit'] })
    // the second token may reroll the same die again
    expect(r.pending!.context['observation']).toBe(1)
    r = ok(choose(r.state, 'observe:blank', script(atk('white', 'hit'), def('white', 'blank', 'blank'))))
    expect(u(r.state, 'RT').tokens['observation'] ?? 0).toBe(0)
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 2 })
  })

  it('RVW-19 Aim and Observation may be spent in any order, and a defender without tokens offers no Observation', () => {
    let r = beginAttack(game([ST({ tokens: { aim: 1 } }), RT({ tokens: { observation: 1 } })]), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'blank', 'blank', 'blank', 'blank'))))
    expect(optionIds(r.state)).toContain('observe:blank')
    expect(optionIds(r.state).some((id) => id.startsWith('reroll:blank'))).toBe(true)
    r = ok(choose(r.state, 'observe:blank', script(atk('white', 'blank'))))
    expect(r.pending!.context['aim']).toBe(1)
    expect(optionIds(r.state).some((id) => id.startsWith('observe:'))).toBe(false)
    const none = ok(choose(beginAttack(game([ST(), RT()]), 'ST', 'RT').state, POOL, script(atk('white', 'blank', 'blank', 'blank', 'blank'), def('white', 'blank'))))
    expect(none.pending!.kind).not.toBe('attack.spend')
  })
})

describe('M2c Overwhelm, Suppressive and the spends keywords read (review 20, 21, 31)', () => {
  it('RVW-20 Overwhelm gives its Suppression token whenever an Aim was spent in Reroll Dice, even when the attack has no hit', () => {
    const snipe = sniper()
    snipe.tokens['aim'] = 1
    let r = beginAttack(game([snipe, RT()]), 'SN', 'RT')
    r = ok(choose(r.state, POOL, script(atk('red', 'blank', 'blank'), atk('black', 'blank'))))
    r = ok(choose(r.state, r.pending!.options![0]!.id, script(atk('red', 'blank', 'blank'), atk('black', 'blank'))))
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 0, crits: 0 })
    // no hit, so no base token; the Overwhelm token still lands
    expect(u(r.state, 'RT').suppression).toBe(1)
  })

  it('RVW-20 without an Aim spent there is no Overwhelm token, and a hit gives only the base token', () => {
    let r = beginAttack(game([sniper(), RT()]), 'SN', 'RT')
    r = ok(choose(r.state, POOL, script(atk('red', 'hit', 'blank'), atk('black', 'blank'))))
    r = ok(choose(r.state, 'sniper:keep', script(def('white', 'blank'))))
    expect(u(r.state, 'RT').suppression).toBe(1)
  })

  it('RVW-21 an Aim may be spent on a pool whose dice are all good when Overwhelm reads it: reroll no dice, 2 tokens in all', () => {
    const snipe = sniper()
    snipe.tokens['aim'] = 1
    let r = beginAttack(game([snipe, RT()]), 'SN', 'RT')
    r = ok(choose(r.state, POOL, script(atk('red', 'hit', 'hit'), atk('black', 'hit'))))
    expect(r.pending!.context['step']).toBe('reroll')
    expect(optionIds(r.state)).toContain('reroll:none')
    r = ok(choose(r.state, 'reroll:none'))
    expect(u(r.state, 'SN').tokens['aim'] ?? 0).toBe(0)
    r = ok(choose(r.state, 'sniper:keep', script(def('white', 'blank', 'blank', 'blank'))))
    // base token for the hits plus the Overwhelm token
    expect(u(r.state, 'RT').suppression).toBe(2)
  })

  it('RVW-21 Duelist: an Aim is offered in melee with no die to reroll, and spending it gives the pool Pierce 1', () => {
    const w = unit({ id: 'W', seat: 'A', data: 'reb.u.wookiee-warriors-ff', at: [[0, 0]], tokens: { aim: 1 } })
    const e = unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633]] })
    let r = beginAttack(game([w, e]), 'W', 'E')
    r = ok(choose(r.state, 'pool:melee:all', script(atk('black', 'hit', 'hit'))))
    expect(optionIds(r.state)).toContain('reroll:none')
    r = ok(choose(r.state, 'reroll:none', script(def('white', 'block', 'block'))))
    expect(eventsOf(r, 'ResultsCancelled').find((x) => x.source === 'kw.pierce')).toMatchObject({ n: 1, result: 'block' })
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 2, blocks: 1, wounds: 1 })
  })

  it('RVW-21 Duelist: a Dodge is offered to a melee defender with no hit to cancel (it grants Immune: Pierce); an ordinary unit is not asked', () => {
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const w = unit({ id: 'W', seat: 'B', data: 'reb.u.wookiee-warriors-ff', at: [[0, 1.0633]], tokens: { dodge: 1 } })
    let r = beginAttack(game([vader, w]), 'V', 'W')
    r = ok(choose(r.state, 'pool:melee:all', script(atk('red', 'blank', 'blank', 'blank', 'blank', 'blank', 'blank'))))
    expect(r.pending!.kind).toBe('attack.spend')
    expect(r.pending!.context['step']).toBe('dodge')
    expect(optionIds(r.state)).toContain('dodge:1')
    const trooper = unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633]], tokens: { dodge: 1 } })
    const q = ok(choose(beginAttack(game([vader, trooper]), 'V', 'E').state, 'pool:melee:all', script(atk('red', 'blank', 'blank', 'blank', 'blank', 'blank', 'blank'))))
    expect(q.pending!.context['step']).not.toBe('dodge')
  })

  it('RVW-31 Suppressive adds its token on top of the base one and gives nothing when the attack gave none (RULING, Port choice)', () => {
    const lg = unit({ id: 'LG', seat: 'A', data: 'reb.u.rebel-troopers', at: [[0, -5]], upgrades: [], extra: [{ at: [1.5, -5.5], weapon: 'reb.w.long-gun' }] })
    const hit = (faces: string[]) => {
      let r = beginAttack(game([lg, unit({ id: 'D', seat: 'B', data: 'emp.u.stormtroopers', at: [[0, 3]] })]), 'LG', 'D')
      r = ok(choose(r.state, 'pool:ranged:only:reb.w.long-gun', script(atk('black', ...faces), def('white', 'blank', 'blank'))))
      return u(r.state, 'D').suppression
    }
    expect(hit(['hit', 'hit'])).toBe(2)
    expect(hit(['blank', 'blank'])).toBe(0)
  })
})

describe('M2c windows and limits (review 22 to 27)', () => {
  it('RVW-22 Sniper Team upgrades its pool and offers the cancel only during the unit\'s own Activation, not in a Standby shot', () => {
    const run = (standby: boolean) => {
      let r = ok(menu(game([sniper(), RT()]), { action: 'attack', unitId: 'SN', standby }))
      r = ok(choose(r.state, 'unit:RT'))
      return ok(choose(r.state, POOL, script(atk('red', 'hit', 'blank'), atk('black', 'blank'), def('white', 'blank'))))
    }
    expect(run(false).pending!.context['step']).toBe('sniper')
    expect(run(true).pending!.context['step']).not.toBe('sniper')
  })

  it('RVW-23 Incognito: a unit is within range 1 when any one of its models is, not only the attacking leader', () => {
    const sst = unit({ id: 'CS', seat: 'B', data: 'reb.u.commando-strike-team', at: [[0, 3]] })
    // the leader stands in band 2, another model of the unit within band 1 of the Incognito unit
    const far = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5.5], [0, -1.5]] })
    const s = game([far, sst])
    expect(checkTarget(s, 'ST', 'CS')).toMatchObject({ band: 2, ok: true })
    // every model beyond band 1: still protected
    const away = unit({ id: 'ST2', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5.5], [0, -6.5]] })
    expect(checkTarget(game([away, sst]), 'ST2', 'CS')).toMatchObject({ ok: false, reason: 'incognito' })
  })

  it('RVW-24 a Strike Team that lost Incognito contests objectives again', () => {
    const sst = unit({ id: 'CS', seat: 'B', data: 'reb.u.commando-strike-team', at: [[0, 3]] })
    const s = game([sst])
    expect(canContest(s, u(s, 'CS'))).toBe(false)
    u(s, 'CS').flags['removedKeywords'] = ['kw.incognito']
    expect(canContest(s, u(s, 'CS'))).toBe(true)
  })

  it('RVW-25 attack.resolved runs for every defender of the attack: both Rebel Troopers units get Nimble\'s Dodge', () => {
    const st = ST({ upgrades: ['emp.up.dlt19-stormtrooper'], extra: [{ at: [0, -7.5], weapon: 'emp.w.dlt19', upgradeId: 'emp.up.dlt19-stormtrooper' }] })
    const rt = RT({ tokens: { dodge: 2 } })
    const rt2 = unit({ id: 'RT2', seat: 'B', data: 'reb.u.rebel-troopers', at: [[6, 3], [7.5, 3.5]], tokens: { dodge: 2 } })
    let r = beginAttack(game([st, rt, rt2]), 'ST', 'RT')
    r = ok(choose(r.state, 'pool:ranged:only:emp.w.dlt19'))
    r = ok(choose(r.state, 'unit:RT2'))
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('red', 'hit', 'blank'))))
    expect(r.pending!.context['step']).toBe('dodge')
    r = ok(choose(r.state, 'dodge:1', script(atk('white', 'hit', 'blank', 'blank', 'blank'))))
    expect(r.pending!.context['step']).toBe('dodge')
    r = ok(choose(r.state, 'dodge:1'))
    expect(u(r.state, 'RT').tokens['dodge']).toBe(2)
    expect(u(r.state, 'RT2').tokens['dodge']).toBe(2)
  })

  it('RVW-26 Son of Skywalker is offered after Luke\'s first attack only; declining it spends the card for the round', () => {
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 0]] })
    const target = unit({ id: 'T', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 4], [1.5, 4.5]] })
    let s = ok(menu(game([luke, target]), { action: 'activateCard', seat: 'B', cardId: 'reb.cc.son-of-skywalker' })).state
    let r = ok(menu(s, { action: 'attack', unitId: 'L' }))
    r = ok(choose(r.state, 'unit:T'))
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('red', 'blank'), atk('black', 'blank', 'blank', 'blank'))))
    expect(r.pending!.kind).toBe('card.choice')
    expect(optionIds(r.state)).toEqual(['use', 'skip'])
    r = ok(choose(r.state, 'skip'))
    expect(r.pending!.kind).toBe('action.choose')
    s = r.state
    r = ok(menu(s, { action: 'attack', unitId: 'L' }))
    r = ok(choose(r.state, 'unit:T'))
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('red', 'blank'), atk('black', 'blank', 'blank', 'blank'))))
    expect(r.pending!.kind).toBe('action.choose')
  })

  it('RVW-27 Coordinated Fire is offered once, after the attack is resolved, to an Corps unit that spent an Aim', () => {
    const al = unit({ id: 'AL', seat: 'A', data: 'emp.u.stormtroopers', at: [[4, -5], [5.5, -5.5]] })
    const s0 = ok(menu(game([ST({ tokens: { aim: 1 } }), al, RT()]), { action: 'activateCard', seat: 'A', cardId: 'emp.cc.coordinated-fire' })).state
    let r = beginAttack(s0, 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'blank', 'blank', 'blank', 'blank'))))
    expect(r.pending!.context['step']).toBe('reroll')
    r = ok(choose(r.state, r.pending!.options![0]!.id, script(atk('white', 'blank', 'blank', 'blank'), def('white', 'blank'))))
    // the card does not interrupt the reroll step any more: it comes once the attack is resolved
    expect(r.pending!.kind).toBe('card.choice')
    expect(eventsOf(r, 'Compared')).toHaveLength(1)
    r = ok(choose(r.state, 'use'))
    expect(u(r.state, 'AL').tokens['aim']).toBe(1)
    expect(r.pending!.kind).toBe('action.choose')
  })
})
