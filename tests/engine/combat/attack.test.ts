// ATK-, DICE-, COVER-, WND-: the attack pipeline (R-11 to R-14) on real slice data with forced dice.
import { afterEach, describe, expect, it } from 'vitest'
import { applyShifts } from '../../../src/engine/attack'
import { createCtx } from '../../../src/engine/registry'
import { backupHits, checkTarget, poolCandidates, poolOptions, attackTargets } from '../../../src/engine/query'
import { step } from '../../../src/engine'
import type { Action, GameState, Seat } from '../../../src/engine/types'
import { blankPool } from '../../../src/engine/query'
import { box } from '../fixtures'
import { DATA, atk, beginAttack, choose, def, eventsOf, game, menu, ok, optionIds, passIt, script, u, unit, uninstallModules } from './harness'

afterEach(uninstallModules)

const ST = (over: Partial<Parameters<typeof unit>[0]> = {}) =>
  unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5], [1.5, -5.5], [0, -6.5]], ...over })
const RT = (over: Partial<Parameters<typeof unit>[0]> = {}) =>
  unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3], [-1.5, 3.5], [1.5, 3.5], [0, 4.5]], ...over })
const POOL = 'pool:ranged:all'
const stubRng = { int: () => 0, d6: () => 1, serialize: () => null }

describe('ATK declare and pool (R-12.2 to R-12.4)', () => {
  it('ATK-001 an enemy out of range or out of line of sight is not offered; a forced answer names the reason', () => {
    const far = unit({ id: 'FAR', seat: 'B', data: 'reb.u.rebel-troopers', at: [[30, 3]] })
    const hidden = unit({ id: 'HID', seat: 'B', data: 'reb.u.rebel-troopers', at: [[-8, 3]] })
    const near = RT()
    const s = game([ST(), near, far, hidden], { pieces: [box('wall', -12, -1, -4, 0, { heightIn: 6, cover: 'heavy' })] })
    const t = attackTargets(s, 'ST')
    expect(t.find((x) => x.unitId === 'FAR')).toMatchObject({ ok: false, reason: 'outOfRange' })
    expect(t.find((x) => x.unitId === 'HID')).toMatchObject({ ok: false, reason: 'noLos' })
    expect(t.find((x) => x.unitId === 'RT')!.ok).toBe(true)
    const r = ok(menu(s, { action: 'attack', unitId: 'ST' }))
    expect(optionIds(r.state)).toEqual(['unit:RT'])
    const bad = (id: string): Action => ({ type: 'attack.defender', seat: 'A', decisionId: r.state.pending!.id, payload: { unitId: id } })
    expect(step(r.state, bad('FAR')).rejection?.code).toBe('E_INVALID_TARGET')
    expect(step(r.state, bad('HID')).rejection?.code).toBe('E_NOT_VISIBLE')
  })

  it('ATK-001 with no legal defender the attack is skipped and the caller resumes', () => {
    const s = game([ST(), unit({ id: 'FAR', seat: 'B', data: 'reb.u.rebel-troopers', at: [[30, 3]] })])
    const r = ok(menu(s, { action: 'attack', unitId: 'ST' }))
    expect(eventsOf(r, 'AttackSkipped')).toHaveLength(1)
    expect(r.state.attack).toBeNull()
    expect(r.pending!.kind).toBe('action.choose')
  })

  it('ATK-002 only models with line of sight to the defender may add a weapon', () => {
    const s = game([ST(), RT()], { pieces: [box('wall', 0.6, -4.5, 2.4, -4.3, { heightIn: 6, cover: 'none' })] })
    const cands = poolCandidates(s, 'ST', 'RT', 'ranged')
    expect(cands.map((c) => c.miniId).sort()).toEqual(['ST.1', 'ST.2', 'ST.4'])
  })

  it('ATK-003 melee and ranged weapons cannot share a pool; a mixed answer is refused', () => {
    const s = game([ST(), RT()])
    const r = beginAttack(s, 'ST', 'RT')
    const mixed: Action = { type: 'attack.pool', seat: 'A', decisionId: r.state.pending!.id, payload: { weaponIds: { 'ST.1': 'emp.w.e11', 'ST.2': 'emp.w.bludgeon' } } }
    expect(step(r.state, mixed).rejection?.code).toBe('E_ACTION_RESTRICTED')
    // an engaged pair offers melee pools only
    const close = game([ST({ at: [[0, 0]] }), unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633]] })])
    const k = checkTarget(close, 'ST', 'E')
    expect(k.kinds).toEqual(['melee'])
  })

  it('ATK-004 same-named weapons stay together: every offered pool takes all users of a weapon or none', () => {
    const st = ST({ upgrades: ['emp.up.dlt19-stormtrooper'], extra: [{ at: [0.0, -7.5], weapon: 'emp.w.dlt19', upgradeId: 'emp.up.dlt19-stormtrooper' }] })
    const s = game([st, RT()])
    const opts = poolOptions(s, 'ST', 'RT')
    expect(opts.map((o) => o.id).sort()).toEqual(['pool:ranged:all', 'pool:ranged:only:emp.w.dlt19', 'pool:ranged:only:emp.w.e11'].sort())
    const e11Users = ['ST.1', 'ST.2', 'ST.3', 'ST.4']
    for (const o of opts) {
      const users = o.weapons.filter((w) => w.weaponId === 'emp.w.e11').map((w) => w.miniId)
      expect(users.length === 0 || users.length === e11Users.length).toBe(true)
    }
    // a pool that takes only some E-11 users is not an offered option and the explain path refuses it
    const r = beginAttack(s, 'ST', 'RT')
    const split: Action = { type: 'attack.pool', seat: 'A', decisionId: r.state.pending!.id, payload: { weaponIds: { 'ST.1': 'emp.w.e11' } } }
    expect(step(r.state, split).rejection?.code).toBe('E_ACTION_RESTRICTED')
  })

  it('ATK-005 a ranged weapon cannot be added against a unit in melee with the attacker', () => {
    const close = game([ST({ at: [[0, 0], [0, -2]] }), unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633]] }), RT()])
    expect(checkTarget(close, 'ST', 'E').kinds).toEqual(['melee'])
    // an engaged unit cannot shoot anyone else either (R-16.3)
    expect(checkTarget(close, 'ST', 'RT').ok).toBe(false)
    expect(checkTarget(close, 'ST', 'RT').reason).toBe('engaged')
  })

  it('ATK-006 an upgrade model uses its own weapon in addition to the unit card\'s (CRB p17) and base models cannot borrow the upgrade weapon', () => {
    const st = ST({ upgrades: ['emp.up.dlt19-stormtrooper'], extra: [{ at: [0, -7.5], weapon: 'emp.w.dlt19', upgradeId: 'emp.up.dlt19-stormtrooper' }] })
    const s = game([st, RT()])
    const c = poolCandidates(s, 'ST', 'RT', 'ranged')
    expect(c.find((x) => x.miniId === 'ST.u1')!.weapons).toEqual(['emp.w.dlt19', 'emp.w.e11'])
    expect(c.find((x) => x.miniId === 'ST.1')!.weapons).toEqual(['emp.w.e11'])
    const r = beginAttack(s, 'ST', 'RT')
    const steal: Action = { type: 'attack.pool', seat: 'A', decisionId: r.state.pending!.id, payload: { weaponIds: { 'ST.1': 'emp.w.dlt19' } } }
    expect(step(r.state, steal).rejection?.code).toBe('E_ACTION_RESTRICTED')
  })

  it('ATK-007 a second pool targets a different enemy unit with models and weapons not yet used', () => {
    const st = ST({ upgrades: ['emp.up.dlt19-stormtrooper'], extra: [{ at: [0, -7.5], weapon: 'emp.w.dlt19', upgradeId: 'emp.up.dlt19-stormtrooper' }] })
    const rt2 = unit({ id: 'RT2', seat: 'B', data: 'reb.u.rebel-troopers', at: [[6, 3], [7.5, 3.5]] })
    const s = game([st, RT(), rt2])
    let r = beginAttack(s, 'ST', 'RT')
    r = ok(choose(r.state, 'pool:ranged:only:emp.w.dlt19'))
    expect(r.pending!.kind).toBe('attack.extraDefender')
    expect(optionIds(r.state).sort()).toEqual(['done', 'unit:RT2'])
    r = ok(choose(r.state, 'unit:RT2'))
    expect(r.pending!.kind).toBe('attack.pool')
    // the DLT-19 and its model are gone from the second pool; the four E-11 models remain
    const second = poolOptions(r.state, 'ST', 'RT2', { usedMinis: ['ST.u1'], usedWeapons: ['emp.w.dlt19'] })
    expect(second.map((o) => o.id)).toEqual(['pool:ranged:all'])
    expect(second[0]!.weapons.map((w) => w.miniId).sort()).toEqual(['ST.1', 'ST.2', 'ST.3', 'ST.4'])
    // no enemy unit is left to target, so the pools resolve at once: DLT-19 (2 red) all blank, E-11 (4 white) all blank
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('red', 'blank', 'blank'), atk('white', 'blank', 'blank', 'blank', 'blank'))))
    expect(eventsOf(r, 'AttackRolled')).toHaveLength(2)
    expect(r.pending!.kind).toBe('action.choose')
  })

  it('ATK-007 the first pool is cancelled with a pass before anything resolved', () => {
    const s = game([ST(), RT()])
    const r0 = ok(menu(s, { action: 'attack', unitId: 'ST' }))
    const r = ok(passIt(r0.state))
    expect(eventsOf(r, 'AttackSkipped')[0]!.reason).toBe('cancelled')
    expect(r.pending!.kind).toBe('action.choose')
  })
})

describe('ATK roll, aim, surges (R-12.5)', () => {
  it('ATK-008 attacker downgrades apply before upgrades (a white die cannot go lower, then the upgrade lands)', () => {
    const s = game([ST(), RT()])
    const pf = blankPool('RT', 'ranged', [])
    pf.dice = [
      { colour: 'white', face: 'blank', weaponId: 'emp.w.e11', changedBy: [] },
      { colour: 'white', face: 'blank', weaponId: 'emp.w.e11', changedBy: [] },
    ]
    pf.shifts = [
      { effectId: 'up', party: 'attacker', dir: 1, count: 1 },
      { effectId: 'down', party: 'attacker', dir: -1, count: 1 },
    ]
    const c = createCtx(s, stubRng, null, 0)
    applyShifts(c, pf)
    expect(pf.dice.map((d) => d.colour)).toEqual(['black', 'white'])
    // one effect changes a die at most once
    pf.shifts = [{ effectId: 'up2', party: 'attacker', dir: 1, count: 3 }]
    applyShifts(c, pf)
    expect(pf.dice.map((d) => d.colour)).toEqual(['red', 'black'])
  })

  it('ATK-009 one Aim rerolls at most 2 dice (3 with Precise 1); a second Aim may reroll a rerolled die', () => {
    const s = game([ST({ tokens: { aim: 2 } }), RT()])
    let r = beginAttack(s, 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'blank', 'blank', 'blank', 'blank'))))
    expect(r.pending!.context['perAim']).toBe(3)
    const first = r.pending!.options![0]!
    expect((first.data as { faces: string[] }).faces).toHaveLength(3)
    // reroll three: blank, blank, hit -> one blank (the die that was not rerolled) + two rerolled blanks remain
    r = ok(choose(r.state, first.id, script(atk('white', 'blank', 'blank', 'hit'))))
    expect(u(r.state, 'ST').tokens['aim']).toBe(1)
    // ATK-010: the second decision is raised only now, after the first reroll's results are known
    expect(r.pending!.kind).toBe('attack.spend')
    expect(r.pending!.context['dice']).toEqual(expect.arrayContaining(['hit', 'blank']))
    const again = r.pending!.options![0]!
    expect((again.data as { faces: string[] }).faces).toEqual(['blank', 'blank', 'blank'])
  })

  it('ATK-010 aim tokens are spent one at a time and a player may stop with tokens left', () => {
    const s = game([ST({ tokens: { aim: 2 } }), RT()])
    let r = beginAttack(s, 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'blank', 'blank', 'hit', 'hit'))))
    r = ok(choose(r.state, 'reroll:done', script(def('white', 'blank', 'blank'))))
    expect(u(r.state, 'ST').tokens['aim']).toBe(2)
    expect(eventsOf(r, 'Rerolled')).toHaveLength(0)
  })

  it('ATK-011 a surge-to-hit chart turns every surge into a hit; with no chart surges are blanks', () => {
    const s = game([ST(), RT()])
    let r = beginAttack(s, 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'surge', 'surge', 'blank', 'blank'), def('white', 'blank', 'blank'))))
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 2, crits: 0 })
    // Rebel Commandos have a surge-to-hit chart, Rebel Troopers none: the A280 is one black die
    const rt = unit({ id: 'RT3', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, -5]] })
    const e = unit({ id: 'E', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 2]] })
    const s2 = game([rt, e])
    let q = beginAttack(s2, 'RT3', 'E')
    q = ok(choose(q.state, POOL, script(atk('black', 'surge'))))
    expect(eventsOf(q, 'Compared')).toHaveLength(0 + 1)
    expect(eventsOf(q, 'Compared')[0]).toMatchObject({ hits: 0, wounds: 0 })
    expect(q.state.units['E']!.suppression).toBe(0)
  })

  it('ATK-012 with no chart each spent Surge token turns one surge into a hit; unspent surges are blanks', () => {
    const sc = unit({ id: 'SC', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, -1]], tokens: { surge: 1 } })
    const s = game([sc, RT()])
    let r = beginAttack(s, 'SC', 'RT')
    r = ok(choose(r.state, POOL, script(atk('black', 'surge', 'surge'))))
    expect(r.pending!.context['step']).toBe('surgeTokens')
    expect(optionIds(r.state)).toEqual(['surge:1', 'surge:0'])
    r = ok(choose(r.state, 'surge:1', script(def('white', 'blank'))))
    expect(u(r.state, 'SC').tokens['surge'] ?? 0).toBe(0)
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 1, wounds: 1 })
  })
})

describe('ATK cover, dodge, defence, compare, suppression (R-12.6 to R-12.11)', () => {
  it('ATK-013 each Dodge cancels one hit and never a crit; Dodge can be spent with no hits left when it matters', () => {
    const sc = unit({ id: 'SC', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, -1]] })
    const rt = RT({ tokens: { dodge: 2 } })
    let r = beginAttack(game([sc, rt]), 'SC', 'RT')
    r = ok(choose(r.state, POOL, script(atk('black', 'hit', 'crit'))))
    expect(r.pending!.context['step']).toBe('dodge')
    expect(optionIds(r.state)).toEqual(['dodge:1', 'dodge:0'])
    r = ok(choose(r.state, 'dodge:1', script(def('white', 'blank'))))
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 0, crits: 1, wounds: 1 })
    // Luke has Block: with only a crit rolled, one Dodge is still offered, and it turns his defence surges into blocks
    const sc2 = unit({ id: 'SC', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, -1]] })
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 3]], tokens: { dodge: 1 } })
    let q = beginAttack(game([sc2, luke]), 'SC', 'L')
    q = ok(choose(q.state, POOL, script(atk('black', 'crit', 'blank'))))
    expect(optionIds(q.state)).toEqual(['dodge:1', 'dodge:0'])
    q = ok(choose(q.state, 'dodge:1', script(def('red', 'surge'))))
    expect(eventsOf(q, 'Compared')[0]).toMatchObject({ blocks: 1, wounds: 0 })
  })

  it('ATK-014 the cover pool is rolled and applied before Dodge is offered', () => {
    const rt = RT({ tokens: { dodge: 1 } })
    const s = game([ST(), rt], { pieces: [box('crate', -4, 0, 4, 1, { heightIn: 1, cover: 'light' })] })
    let r = beginAttack(s, 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'hit', 'blank', 'blank'), def('white', 'block', 'blank'))))
    expect(eventsOf(r, 'CoverRolled')[0]).toMatchObject({ level: 'light', cancelled: 1 })
    expect(r.pending!.context).toMatchObject({ step: 'dodge', hits: 1 })
  })

  it('ATK-015 defence dice equal the remaining hits plus crits in the defender colour', () => {
    const s = game([ST(), unit({ id: 'V', seat: 'B', data: 'emp.u.darth-vader-dlots', at: [[0, 3]] })])
    let r = beginAttack(s, 'ST', 'V')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'crit', 'hit', 'blank'), def('red', 'block', 'blank', 'blank'))))
    expect(eventsOf(r, 'DefenceRolled')[0]!.faces).toHaveLength(3)
    expect(eventsOf(r, 'DiceRolled').filter((e) => e.die === 'def:red')).toHaveLength(1)
  })

  it('ATK-016 a defence surge becomes a block only with a chart or a spent Surge token; otherwise a blank', () => {
    // Rebel Troopers have a block chart
    let r = beginAttack(game([ST(), RT()]), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'blank', 'blank', 'blank'), def('white', 'surge'))))
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ blocks: 1, wounds: 0 })
    // Stormtroopers have none: the surge is offered a token
    const rtShooter = unit({ id: 'R', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3]] })
    const stDef = unit({ id: 'D', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5]], tokens: { surge: 1 } })
    let q = beginAttack(game([rtShooter, stDef]), 'R', 'D')
    q = ok(choose(q.state, POOL, script(atk('black', 'hit'), def('red', 'surge'))))
    expect(q.pending!.context['step']).toBe('defSurgeTokens')
    q = ok(choose(q.state, 'defSurge:1'))
    expect(eventsOf(q, 'Compared')[0]).toMatchObject({ blocks: 1, wounds: 0 })
    expect(u(q.state, 'D').tokens['surge'] ?? 0).toBe(0)
  })

  it('ATK-017 wounds are hits plus crits minus blocks and never below zero', () => {
    let r = beginAttack(game([ST(), RT()]), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'blank', 'blank', 'blank'), def('white', 'block'))))
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 1, crits: 0, blocks: 1, wounds: 0 })
    expect(eventsOf(r, 'WoundsAssigned')).toHaveLength(0)
  })

  it('ATK-018 a ranged attack with a hit after surge conversion suppresses a surviving defender even when every hit is cancelled', () => {
    let r = beginAttack(game([ST(), RT()]), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'blank', 'blank', 'blank'), def('white', 'block'))))
    expect(u(r.state, 'RT').suppression).toBe(1)
    expect(eventsOf(r, 'SuppressionChanged')[0]).toMatchObject({ from: 0, to: 1, reason: 'attack' })
  })

  it('ATK-019 a ranged attack that rolled only blanks (surge converted to blank) gives no suppression', () => {
    const rt = RT()
    let r = beginAttack(game([unit({ id: 'SC', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, -1]] }), rt]), 'SC', 'RT')
    r = ok(choose(r.state, POOL, script(atk('black', 'surge', 'blank'))))
    expect(u(r.state, 'RT').suppression).toBe(0)
    expect(eventsOf(r, 'SuppressionChanged')).toHaveLength(0)
  })

  it('ATK-020 a melee attack gives no suppression, and a wiped-out defender gains none', () => {
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const rt = unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633], [1.0633, 0]] })
    let r = beginAttack(game([vader, rt]), 'V', 'E')
    expect(r.pending!.options!.map((o) => o.id)).toEqual(['pool:melee:all'])
    r = ok(choose(r.state, 'pool:melee:all', script(atk('red', 'hit', 'hit', 'hit', 'blank', 'blank', 'blank'), def('white', 'blank', 'blank', 'blank'))))
    expect(eventsOf(r, 'SuppressionChanged')).toHaveLength(0)
    expect(eventsOf(r, 'CoverApplied')).toHaveLength(0)
    expect(u(r.state, 'E').location).toBe('defeated')
  })

  it('ATK-021 every optional spend is a decision: no Aim, Dodge or Surge token is used without an answer', () => {
    const rt = RT({ tokens: { dodge: 1 } })
    let r = beginAttack(game([ST({ tokens: { aim: 1 } }), rt]), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'blank', 'blank', 'blank', 'hit'))))
    expect(u(r.state, 'ST').tokens['aim']).toBe(1)
    expect(r.pending!.kind).toBe('attack.spend')
    const a = r.pending!.options!.find((o) => (o.data as { auto?: boolean }).auto)!
    r = ok(choose(r.state, a.id, script(atk('white', 'hit', 'hit', 'hit'))))
    expect(r.pending!.context['step']).toBe('dodge')
    expect(u(r.state, 'RT').tokens['dodge']).toBe(1)
  })
})

describe('COVER through the pipeline (R-11.3, R-11.4)', () => {
  const crate = (cover: 'light' | 'heavy') => box('crate', -4, 0, 4, 1, { heightIn: 1, cover })

  it('COVER-007 a Suppressed defender improves cover one step (light becomes heavy)', () => {
    const rt = RT({ suppression: 1 })
    let r = beginAttack(game([ST(), rt], { pieces: [crate('light')] }), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'hit', 'blank', 'blank'), def('white', 'surge', 'blank'), def('white', 'blank'))))
    expect(eventsOf(r, 'CoverRolled')[0]).toMatchObject({ level: 'heavy', cancelled: 1 })
  })

  it('COVER-008 light cover rolls one white die per hit (crits never) and cancels on blocks only', () => {
    let r = beginAttack(game([ST(), RT()], { pieces: [crate('light')] }), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'hit', 'crit', 'blank'), def('white', 'surge', 'blank'), def('white', 'blank', 'blank', 'blank'))))
    const c = eventsOf(r, 'CoverRolled')[0]!
    expect(c.dice).toEqual(['surge', 'blank'])
    expect(c.cancelled).toBe(0)
  })

  it('COVER-009 heavy cover cancels one hit per block and per surge', () => {
    let r = beginAttack(game([ST(), RT()], { pieces: [crate('heavy')] }), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'hit', 'hit', 'blank'), def('white', 'block', 'surge', 'blank'), def('white', 'blank'))))
    expect(eventsOf(r, 'CoverRolled')[0]).toMatchObject({ level: 'heavy', cancelled: 2 })
  })

  it('COVER-012 a melee attack rolls no cover pool even with heavy terrain between the units', () => {
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const rt = unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633]] })
    let r = beginAttack(game([vader, rt], { pieces: [crate('heavy')] }), 'V', 'E')
    r = ok(choose(r.state, 'pool:melee:all', script(atk('red', 'hit', 'blank', 'blank', 'blank', 'blank', 'blank'), def('white', 'block'))))
    expect(eventsOf(r, 'CoverRolled')).toHaveLength(0)
    expect(eventsOf(r, 'CoverApplied')).toHaveLength(0)
  })
})

describe('DICE in the pipeline (R-13)', () => {
  it('DICE-005 a pool die of a weapon is upgraded white -> black and a red die cannot go up (no-op)', () => {
    const s = game([ST(), RT()])
    const c = createCtx(s, stubRng, null, 0)
    const pf = blankPool('RT', 'ranged', [])
    pf.dice = [
      { colour: 'red', face: 'blank', weaponId: 'w', changedBy: [] },
      { colour: 'white', face: 'blank', weaponId: 'w', changedBy: [] },
    ]
    pf.shifts = [{ effectId: 'u', party: 'attacker', dir: 1, count: 2 }]
    applyShifts(c, pf)
    expect(pf.dice.map((d) => d.colour)).toEqual(['red', 'black'])
  })

  it('DICE-008 the engine rolls the face tables of the data: forced face indexes appear as the rolled faces', () => {
    let r = beginAttack(game([ST(), RT()]), 'ST', 'RT')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'crit', 'surge', 'blank'), def('white', 'blank', 'blank', 'blank'))))
    expect(eventsOf(r, 'AttackRolled')[0]!.faces).toEqual(['hit', 'crit', 'surge', 'blank'])
    expect(DATA.dice.attack.white).toHaveLength(8)
  })
})

describe('WND wounds, defeat, leader, Backup (R-14)', () => {
  const wookiees = (wounds?: number[]) => unit({ id: 'W', seat: 'B', data: 'reb.u.wookiee-warriors-ff', at: [[0, 0], [2, 0], [4, 0]], ...(wounds ? { wounds } : {}) })

  it('WND-001 3 wounds on a unit of 1-wound models defeat 3 models', () => {
    const r = ok(menu(game([RT()]), { action: 'wound', unitId: 'RT', n: 3 }))
    expect(eventsOf(r, 'MiniDefeated')).toHaveLength(3)
    expect(u(r.state, 'RT').minis.filter((m) => m.alive).map((m) => m.id)).toEqual(['RT.1'])
  })

  it('WND-002 4 wounds on 3 unwounded 3-wound models: one dies, the 4th wound goes to a non-leader', () => {
    const r = ok(menu(game([wookiees()]), { action: 'wound', unitId: 'W', n: 4 }))
    const w = u(r.state, 'W')
    expect(w.minis.map((m) => [m.wounds, m.alive])).toEqual([[0, true], [3, false], [1, true]])
  })

  it('WND-003 a model already carrying wounds takes the next wounds before any other', () => {
    const r = ok(menu(game([wookiees([0, 0, 2])]), { action: 'wound', unitId: 'W', n: 1 }))
    expect(u(r.state, 'W').minis.map((m) => m.wounds)).toEqual([0, 0, 3])
    expect(u(r.state, 'W').minis[2]!.alive).toBe(false)
  })

  it('WND-004 the leader takes no wounds while any other model lives', () => {
    const r = ok(menu(game([wookiees()]), { action: 'wound', unitId: 'W', n: 6 }))
    const w = u(r.state, 'W')
    expect(w.minis[0]!.wounds).toBe(0)
    expect(w.minis.filter((m) => !m.alive)).toHaveLength(2)
    const r2 = ok(menu(r.state, { action: 'wound', unitId: 'W', n: 1 }))
    expect(u(r2.state, 'W').minis[0]!.wounds).toBe(1)
  })

  it('WND-005 allocation is automatic among identical models and raises attack.allocate when they differ', () => {
    const st = (): ReturnType<typeof unit> => unit({ id: 'D', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5], [1.5, -5.5]], upgrades: ['emp.up.dlt19-stormtrooper'], extra: [{ at: [0, -7.5], weapon: 'emp.w.dlt19', upgradeId: 'emp.up.dlt19-stormtrooper' }] })
    const shooter = unit({ id: 'R', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3], [-1.5, 3.5], [1.5, 3.5], [0, 4.5]] })
    let r = beginAttack(game([shooter, st()]), 'R', 'D')
    r = ok(choose(r.state, POOL, script(atk('black', 'hit', 'hit', 'blank', 'blank'), def('red', 'blank', 'blank'))))
    expect(r.pending!.kind).toBe('attack.allocate')
    expect(r.pending!.seat).toBe('A')
    const ids = optionIds(r.state)
    expect(ids).toHaveLength(2)
    // the auto option is the cheapest-to-lose model (a plain E-11 trooper), not the DLT-19
    expect(r.pending!.options![0]!.data).toMatchObject({ auto: true, weapons: expect.arrayContaining(['emp.w.e11']) })
    r = ok(choose(r.state, ids[1]!))
    expect(eventsOf(r, 'MiniDefeated')[0]!.miniId).toBe('D.u1')
  })

  it('WND-006 the attacker sees only some defenders: 4 net wounds defeat only the models it can see', () => {
    // two defenders sit behind a tall wall, two are in the open: the ranged cap is the thresholds of the two seen models
    const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3], [-6, 3.5], [-6.5, 4.8], [3, 3]] })
    const s = game([ST(), rt], { pieces: [box('wall', -9, 1.5, -3, 2.5, { heightIn: 8, cover: 'none' })] })
    let r = beginAttack(s, 'ST', 'RT')
    expect(poolCandidates(s, 'ST', 'RT', 'ranged').length).toBe(4)
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'hit', 'hit', 'hit'), def('white', 'blank', 'blank', 'blank', 'blank'), def('white', 'blank', 'blank', 'blank', 'blank'))))
    expect(eventsOf(r, 'Compared')[0]!.wounds).toBe(4)
    expect(eventsOf(r, 'MiniDefeated')).toHaveLength(2)
  })

  it('WND-007 a leader defeated while others remain is replaced at once; the unit keeps its order', () => {
    const rt = RT()
    let r = ok(menu(game([rt]), { action: 'woundMini', unitId: 'RT', miniId: 'RT.1', n: 1 }))
    const t = u(r.state, 'RT')
    expect(t.leaderId).not.toBe('RT.1')
    expect(t.minis.find((m) => m.id === t.leaderId)!.alive).toBe(true)
    expect(t.minis.filter((m) => m.isLeader)).toHaveLength(1)
    expect(eventsOf(r, 'LeaderReplaced')).toHaveLength(1)
    r = ok(menu(r.state, { action: 'wound', unitId: 'RT', n: 1 }))
    expect(u(r.state, 'RT').location).toBe('table')
  })

  it('WND-008 defeating the last model defeats the unit and removes its order token from the pool', () => {
    const rt = RT({ order: 'pool' })
    const s = game([rt])
    s.players.B.pool.tokens = ['corps', 'special-forces']
    const r = ok(menu(s, { action: 'wound', unitId: 'RT', n: 9 }))
    expect(eventsOf(r, 'UnitDefeated').map((e) => e.unitId)).toEqual(['RT'])
    expect(u(r.state, 'RT').location).toBe('defeated')
    expect(u(r.state, 'RT').order.state).toBe('none')
    expect(r.state.players.B.pool.tokens).toEqual(['special-forces'])
  })

  it('WND-009 Luke shot from range 3 with an unsuppressed allied Corps leader within 3" and in LOS may cancel up to 2 hits', () => {
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 12]] })
    const corps = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[2, 13]] })
    const shooter = unit({ id: 'SC', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, -2]] })
    const s = game([luke, corps, shooter])
    expect(backupHits(s, shooter, luke, 'ranged')).toBe(2)
    // the pipeline applies it: 3 hits in, 2 cancelled before the defence roll
    const sc2 = unit({ id: 'S2', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -2], [1, -2], [-1, -2]] })
    const s2 = game([luke, corps, sc2])
    let r = beginAttack(s2, 'S2', 'L')
    r = ok(choose(r.state, POOL, script(atk('white', 'hit', 'hit', 'hit'), def('red', 'blank'))))
    expect(eventsOf(r, 'ResultsCancelled').find((e) => e.source === 'backup')).toMatchObject({ n: 2 })
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 1 })
  })

  it('WND-010 no Backup within range 2 of the attacking leader, when the Corps unit is Suppressed, or for a Corps defender', () => {
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 12]] })
    const near = unit({ id: 'S', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, 3]] })
    const corps = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[2, 13]] })
    expect(backupHits(game([luke, corps, near]), near, luke, 'ranged')).toBe(0)
    const far = unit({ id: 'S', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, -2]] })
    const supp = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[2, 13]], suppression: 1 })
    expect(backupHits(game([luke, supp, far]), far, luke, 'ranged')).toBe(0)
    const corpsDef = unit({ id: 'RT2', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 12]] })
    expect(backupHits(game([corpsDef, corps, far]), far, corpsDef, 'ranged')).toBe(0)
  })
})

export type _Unused = GameState | Seat
