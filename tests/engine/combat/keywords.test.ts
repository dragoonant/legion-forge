// KEY-: every keyword of the slice fires at its window in a game-like state (14-armies section 4). K ids are the survey ids.
import { afterEach, describe, expect, it } from 'vitest'
import { hookFireCount, resetFireCounts } from '../../../src/engine/code-hooks'
import { modValues, foldBool, foldNumber, fireWindow, actionDelta, unitKeywords } from '../../../src/engine/keywords'
import { checkTarget, attackTargets, poolOptions } from '../../../src/engine/query'
import { createCtx } from '../../../src/engine/registry'
import { atk, beginAttack, choose, def, eventsOf, game, menu, ok, optionIds, script, u, unit, uninstallModules } from './harness'
import { box } from '../fixtures'
import type { GameState } from '../../../src/engine/types'

afterEach(() => {
  uninstallModules()
  resetFireCounts()
})

const RT = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3], [-1.5, 3.5], [1.5, 3.5], [0, 4.5]], ...over })
const ST = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5], [1.5, -5.5], [0, -6.5]], ...over })
const fire = (s: GameState, window: string, info: Record<string, unknown> = {}, resume = true) => ok(menu(s, { action: 'fire', window, info, resume }))
const eff = (s: GameState, kind: string, unitId?: string) => s.effects.filter((e) => e.kind === kind && (!unitId || e.unitId === unitId))

/** A Wookiee unit with the Battle Shield upgrade model (Defensive side: Armor 1). */
const shieldWookiees = () =>
  unit({ id: 'W', seat: 'B', data: 'reb.u.wookiee-warriors-ff', at: [[0, 3]], upgrades: ['reb.up.battle-shield-wookiee'], extra: [{ at: [1.5, 3.5], weapon: 'reb.w.battle-shield-defensive', upgradeId: 'reb.up.battle-shield-wookiee' }] })

describe('KEY unit keywords on declarative windows', () => {
  it('KEY-K01 Agile X: after a Standard Move the unit gains X Dodge tokens (not after a Climb)', () => {
    const s = game([RT()])
    const r = fire(game([RT()]), 'move.ended', { unitId: 'RT', moveKind: 'standard' })
    expect(u(r.state, 'RT').tokens['dodge']).toBe(1)
    const c = fire(s, 'move.ended', { unitId: 'RT', moveKind: 'climb' })
    expect(u(c.state, 'RT').tokens['dodge'] ?? 0).toBe(0)
  })

  it('KEY-K02 Armor X: the defender cancels up to X hits in Modify Attack Dice (never crits)', () => {
    let r = beginAttack(game([ST(), shieldWookiees()]), 'ST', 'W')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('white', 'hit', 'hit', 'crit', 'blank'), def('white', 'blank', 'blank'))))
    const cancelled = eventsOf(r, 'ResultsCancelled').find((e) => e.source === 'kw.armor')!
    expect(cancelled).toMatchObject({ result: 'hit', n: 1 })
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 1, crits: 1 })
  })

  it('KEY-K36 Impact X: against Armor the attacker changes up to X hits to crits before Armor cancels hits', () => {
    const st = ST({ upgrades: ['emp.up.dlt19-stormtrooper'], extra: [{ at: [0, -7.5], weapon: 'emp.w.dlt19', upgradeId: 'emp.up.dlt19-stormtrooper' }] })
    let r = beginAttack(game([st, shieldWookiees()]), 'ST', 'W')
    r = ok(choose(r.state, 'pool:ranged:only:emp.w.dlt19', script(atk('red', 'hit', 'hit'), def('white', 'blank'))))
    expect(eventsOf(r, 'ResultsChanged')[0]).toMatchObject({ source: 'kw.impact', from: 'hit', to: 'crit', n: 1 })
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 0, crits: 1 })
  })

  it('KEY-K03 Block: with a Dodge spent the defence surges become blocks for that attack', () => {
    const sc = unit({ id: 'SC', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, -1]] })
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 3]], tokens: { dodge: 1 } })
    let r = beginAttack(game([sc, luke]), 'SC', 'L')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('black', 'hit', 'blank'))))
    r = ok(choose(r.state, 'dodge:0', script(def('red', 'surge'))))
    // without the Dodge spent a Luke surge is a blank
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ blocks: 0, wounds: 1 })
    let q = beginAttack(game([sc, unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 3]], tokens: { dodge: 1 } })]), 'SC', 'L')
    q = ok(choose(q.state, 'pool:ranged:all', script(atk('black', 'crit', 'hit'))))
    q = ok(choose(q.state, 'dodge:1', script(def('red', 'surge'))))
    expect(eventsOf(q, 'Compared')[0]).toMatchObject({ blocks: 1, wounds: 0 })
  })

  it('KEY-K04 Charge: after a Move that starts a melee the unit may make a free melee-only Attack', () => {
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 0]] })
    const s = game([luke, unit({ id: 'E', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 1.0633]] })])
    let r = fire(s, 'melee.charged', { unitId: 'L', startedMelee: true })
    expect(r.pending!.kind).toBe('keyword.choice')
    expect(r.pending!.context['keyword']).toBe('kw.charge')
    r = ok(choose(r.state, 'use'))
    const grant = eff(r.state, 'freeAction', 'L')[0]!
    expect(grant.data).toMatchObject({ action: 'core.action.attack', weapons: 'melee', target: 'engaged' })
    expect(r.pending!.kind).toBe('action.choose')
  })

  it('KEY-K05 Compel (code): a Suppressed allied Corps unit within range 2 that rallied may take 1 suppression for a free Move', () => {
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const st = ST({ at: [[6, 0]], suppression: 1 })
    let r = fire(game([vader, st]), 'activation.rallied', { unitId: 'ST' })
    expect(r.pending!.kind).toBe('keyword.choice')
    expect(optionIds(r.state)).toEqual(['accept', 'decline'])
    expect(r.pending!.seat).toBe('A')
    r = ok(choose(r.state, 'accept'))
    expect(u(r.state, 'ST').suppression).toBe(2)
    expect(eff(r.state, 'freeAction', 'ST')[0]!.data).toMatchObject({ action: 'core.action.move', startOfActions: true })
    expect(hookFireCount('compel')).toBe(1)
    // an unsuppressed unit or one beyond range 2 is not offered anything
    const none = fire(game([unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] }), ST({ at: [[6, 0]] })]), 'activation.rallied', { unitId: 'ST' })
    expect(none.pending!.kind).toBe('action.choose')
    const far = fire(game([unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] }), ST({ at: [[20, 0]], suppression: 1 })]), 'activation.rallied', { unitId: 'ST' })
    expect(far.pending!.kind).toBe('action.choose')
  })

  it('KEY-K06 Deflect (code): the chart gains surge -> block and the attacker suffers 1 wound when a surge is rolled', () => {
    const vader = unit({ id: 'V', seat: 'B', data: 'emp.u.darth-vader-dlots', at: [[0, 3]] })
    const shooter = unit({ id: 'R', seat: 'A', data: 'reb.u.rebel-troopers', at: [[0, -5], [-1.5, -5.5]] })
    let r = beginAttack(game([shooter, vader]), 'R', 'V')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('black', 'hit', 'hit'), def('red', 'surge', 'blank'))))
    expect(hookFireCount('deflect')).toBe(1)
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ blocks: 1, wounds: 1 })
    expect(eventsOf(r, 'WoundsSuffered').find((e) => e.source === 'kw.deflect')).toMatchObject({ unitId: 'R', n: 1 })
    expect(u(r.state, 'R').minis.filter((m) => !m.alive)).toHaveLength(1)
  })

  it('KEY-K07 Demoralize X: after it rallies, add up to X suppression to enemy units within range 2', () => {
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]], upgrades: ['neu.up.fear'] })
    const a = unit({ id: 'A1', seat: 'B', data: 'reb.u.rebel-troopers', at: [[6, 0]] })
    const b = unit({ id: 'A2', seat: 'B', data: 'reb.u.rebel-commandos', at: [[-6, 0]] })
    let r = fire(game([vader, a, b]), 'activation.rallied', { unitId: 'V' })
    expect(r.pending!.context['keyword']).toBe('kw.demoralize')
    r = ok(choose(r.state, 'use'))
    expect(optionIds(r.state).sort()).toEqual(['done', 'unit:A1', 'unit:A2'])
    r = ok(choose(r.state, 'unit:A2'))
    expect(u(r.state, 'A2').suppression).toBe(1)
    expect(u(r.state, 'A1').suppression).toBe(0)
  })

  it('KEY-K09 Duelist: an Aim spent rerolling in melee gives the pool Pierce 1', () => {
    const w = unit({ id: 'W', seat: 'A', data: 'reb.u.wookiee-warriors-ff', at: [[0, 0]], tokens: { aim: 1 } })
    const rt = unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633]] })
    let r = beginAttack(game([w, rt]), 'W', 'E')
    r = ok(choose(r.state, 'pool:melee:all', script(atk('black', 'hit', 'blank'))))
    r = ok(choose(r.state, r.pending!.options![0]!.id, script(atk('black', 'hit'), def('white', 'block', 'block'))))
    expect(eventsOf(r, 'ResultsCancelled').find((e) => e.source === 'kw.pierce')).toMatchObject({ n: 1, result: 'block' })
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 2, blocks: 1, wounds: 1 })
  })

  it('KEY-K09 Duelist: defending in melee with a Dodge spent gives the unit Immune: Pierce for that attack', () => {
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const w = unit({ id: 'W', seat: 'B', data: 'reb.u.wookiee-warriors-ff', at: [[0, 1.0633]], tokens: { dodge: 1 } })
    let r = beginAttack(game([vader, w]), 'V', 'W')
    r = ok(choose(r.state, 'pool:melee:all', script(atk('red', 'hit', 'hit', 'hit', 'hit', 'hit', 'blank'))))
    r = ok(choose(r.state, 'dodge:1', script(def('white', 'block', 'block', 'block', 'block'))))
    // Pierce 3 and Impact would have stripped the blocks; the granted Immune: Pierce keeps all four
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 4, blocks: 4, wounds: 0 })
  })

  it('KEY-K11 Immune: Pierce: attackers cannot use Pierce against the unit', () => {
    const wb = unit({ id: 'W', seat: 'A', data: 'reb.u.wookiee-warriors-ff', at: [[0, -5]], upgrades: ['reb.up.bowcaster-wookiee'], extra: [{ at: [1.5, -5.5], weapon: 'reb.w.bowcaster', upgradeId: 'reb.up.bowcaster-wookiee' }] })
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 3]] })
    const rt = RT({ id: 'RT2' } as never)
    void rt
    let r = beginAttack(game([wb, luke]), 'W', 'L')
    r = ok(choose(r.state, 'pool:ranged:only:reb.w.bowcaster', script(atk('red', 'hit'), atk('white', 'hit'), def('red', 'block', 'block'))))
    expect(eventsOf(r, 'ResultsCancelled').filter((e) => e.source === 'kw.pierce')).toHaveLength(0)
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ blocks: 2, wounds: 0 })
  })

  it('KEY-K12 Incognito: cannot be attacked from beyond range 1; the keyword is lost when it attacks or defends', () => {
    const sst = unit({ id: 'SS', seat: 'A', data: 'emp.u.scout-strike-team', at: [[0, -12]] })
    const near = unit({ id: 'N', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, -8]] })
    const far = unit({ id: 'F', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, -2]] })
    const s = game([sst, near, far])
    expect(checkTarget(s, 'F', 'SS')).toMatchObject({ ok: false, reason: 'incognito' })
    expect(checkTarget(s, 'N', 'SS').ok).toBe(true)
    expect(foldBool(true, modValues(s, u(s, 'SS'), 'canContest'))).toBe(false)
    expect(foldBool(true, modValues(s, u(s, 'SS'), 'canBackup'))).toBe(false)
    let r = beginAttack(s, 'N', 'SS')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('black', 'blank'))))
    expect(unitKeywords(r.state, u(r.state, 'SS')).some((k) => k.id === 'kw.incognito')).toBe(false)
    expect(eventsOf(r, 'KeywordFired').map((e) => e.keyword)).toContain('kw.incognito')
  })

  it('KEY-K15 Inspire X: at the end of its activation it removes up to X suppression from other allied units within range 2', () => {
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 0]] })
    const rt = RT({ at: [[5, 0]], suppression: 2 })
    let r = fire(game([luke, rt]), 'activation.end', { unitId: 'L' })
    expect(r.pending!.context['keyword']).toBe('kw.inspire')
    r = ok(choose(r.state, 'use'))
    expect(u(r.state, 'RT').suppression).toBe(0)
  })

  it('KEY-K18 Low Profile: one fewer cover die and one automatic block in the cover pool', () => {
    const sc = unit({ id: 'SC', seat: 'B', data: 'emp.u.scout-troopers', at: [[0, 3], [-1.5, 3.5], [1.5, 3.5], [0, 4.5]] })
    const shooter = unit({ id: 'R', seat: 'A', data: 'reb.u.rebel-troopers', at: [[0, -5], [-1.5, -5.5], [1.5, -5.5]] })
    const s = game([shooter, sc], { pieces: [box('crate', -4, 0, 4, 1, { heightIn: 1, cover: 'light' })] })
    let r = beginAttack(s, 'R', 'SC')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('black', 'hit', 'hit', 'hit'), def('white', 'blank', 'blank'), def('white', 'blank', 'blank'))))
    const c = eventsOf(r, 'CoverRolled')[0]!
    expect(c.dice).toHaveLength(2) // 3 hits - 1
    expect(c.cancelled).toBe(1) // the automatic block
  })

  it('KEY-K19 Master of the Force X: at the end of its activation it readies up to X exhausted Force upgrades', () => {
    const v = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]], upgrades: ['neu.up.force-reflexes'] })
    v.flags['exhausted'] = ['neu.up.force-reflexes']
    const r = fire(game([v]), 'activation.end', { unitId: 'V' })
    expect(u(r.state, 'V').flags['exhausted']).toEqual([])
  })

  it('KEY-K22 Prepared Position: gains 1 Dodge when deployed in setup', () => {
    const ss = unit({ id: 'SS', seat: 'A', data: 'emp.u.scout-strike-team', at: [[0, -12]] })
    const r = fire(game([ss]), 'setup.deploy', { unitId: 'SS' })
    expect(u(r.state, 'SS').tokens['dodge']).toBe(1)
  })

  it('KEY-K23 Relentless: after a Move action it may make a free Attack action', () => {
    const v = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    let r = fire(game([v]), 'action.resolved', { unitId: 'V', action: 'core.action.move' })
    expect(r.pending!.context['keyword']).toBe('kw.relentless')
    r = ok(choose(r.state, 'use'))
    expect(eff(r.state, 'freeAction', 'V')[0]!.data).toMatchObject({ action: 'core.action.attack' })
    // after an Attack action nothing is offered
    const none = fire(game([unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })]), 'action.resolved', { unitId: 'V', action: 'core.action.attack' })
    expect(none.pending!.kind).toBe('action.choose')
  })

  it('KEY-K24 Reliable X: gains X Surge tokens at the start of the Activation phase', () => {
    const v = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    v.keywords = [{ id: 'kw.reliable', x: 2 }]
    const r = fire(game([v]), 'activation.phaseStart', { unitId: 'V' })
    expect(u(r.state, 'V').tokens['surge']).toBe(2)
  })

  it('KEY-K25 Scale: climbs up to height 2 and difficult terrain never reduces its Speed', () => {
    const s = game([unit({ id: 'W', seat: 'B', data: 'reb.u.wookiee-warriors-ff', at: [[0, 0]] })])
    expect(foldNumber(1, modValues(s, u(s, 'W'), 'climbHeight').map((m) => ({ ...m, value: Number(m.value) })))).toBe(2)
    expect(foldBool(true, modValues(s, u(s, 'W'), 'difficultTerrain'))).toBe(false)
  })

  it('KEY-K27 Sharpshooter X: subtracts X from the defender cover value (light cover becomes none)', () => {
    const sc = unit({ id: 'SC', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, -1]] })
    const rt = RT()
    const s = game([sc, rt], { pieces: [box('crate', -4, 1, 4, 2, { heightIn: 1, cover: 'light' })] })
    let r = beginAttack(s, 'SC', 'RT')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('black', 'hit', 'hit'), def('white', 'blank', 'blank'))))
    expect(eventsOf(r, 'CoverApplied')[0]!.cover).toBe('none')
    expect(eventsOf(r, 'CoverRolled')).toHaveLength(0)
  })

  it('KEY-K21 Precise X: each Aim rerolls X more dice', () => {
    const s = game([ST({ tokens: { aim: 1 } }), RT()])
    let r = beginAttack(s, 'ST', 'RT')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('white', 'blank', 'blank', 'blank', 'blank'))))
    expect(r.pending!.context['perAim']).toBe(3)
  })

  it('KEY-K20 Nimble: after defending, if it spent a Dodge in that attack, gain 1 Dodge', () => {
    const st = ST()
    const rt = RT({ tokens: { dodge: 1 } })
    let r = beginAttack(game([st, rt]), 'ST', 'RT')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('white', 'hit', 'blank', 'blank', 'blank'))))
    r = ok(choose(r.state, 'dodge:1'))
    expect(u(r.state, 'RT').tokens['dodge']).toBe(1)
    expect(eventsOf(r, 'KeywordFired').map((e) => e.keyword)).toContain('kw.nimble')
  })
})

describe('KEY weapon keywords', () => {
  const sab = (extra: Partial<Parameters<typeof unit>[0]> = {}) =>
    unit({ id: 'SC', seat: 'A', data: 'emp.u.scout-troopers', at: [[0, 0], [-1.5, -0.5]], upgrades: ['emp.up.sonic-charge-saboteur'], extra: [{ at: [1.5, -0.5], weapon: 'emp.w.sonic-charge', upgradeId: 'emp.up.sonic-charge-saboteur' }], ...extra })

  it('KEY-K31 Assault X: a Saboteur gives the other ranged weapons Assault 1, upgrading one of their dice at range 1', () => {
    const rt = RT({ at: [[0, 5]] })
    let r = beginAttack(game([sab(), rt]), 'SC', 'RT')
    // 2 EC-17 (black x2 each) + Sonic Charge (red, 2 black, white)
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('red', 'blank', 'blank', 'blank'), atk('black', 'blank', 'blank', 'blank', 'blank', 'blank', 'blank'), atk('white', 'blank'))))
    const shifts = eventsOf(r, 'DiceShifted')
    expect(shifts.reduce((n, e) => n + e.n, 0)).toBe(2) // one die per EC-17 instance
    const rolled = eventsOf(r, 'DiceRolled').filter((e) => e.purpose === 'attack')
    expect(rolled.map((e) => [e.die, e.faces.length])).toEqual([['atk:red', 3], ['atk:black', 4], ['atk:white', 1]])
  })

  it('KEY-K32 Blast: cover cannot cancel hits from this pool; KEY-K41 Suppressive: the defender gains 1 extra suppression', () => {
    const rt = RT({ at: [[0, 5], [-1.5, 5.5], [1.5, 5.5], [0, 6.5]] })
    const s = game([sab(), rt], { pieces: [box('crate', -4, 2.4, 4, 3.4, { heightIn: 1, cover: 'heavy' })] })
    let r = beginAttack(s, 'SC', 'RT')
    r = ok(choose(r.state, 'pool:ranged:only:emp.w.sonic-charge', script(atk('red', 'hit'), atk('black', 'hit', 'hit'), atk('white', 'hit'), def('white', 'block', 'block', 'block', 'blank'))))
    // heavy terrain, minus the Scout Troopers' Sharpshooter 1
    expect(eventsOf(r, 'CoverApplied')[0]!.cover).toBe('light')
    expect(eventsOf(r, 'CoverRolled')).toHaveLength(0) // Blast
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 4 })
    // 1 for the hit plus 1 for Suppressive
    expect(u(r.state, 'RT').suppression).toBe(2)
    expect(eventsOf(r, 'SuppressionChanged').map((e) => [e.from, e.to])).toEqual([[0, 1], [1, 2]])
  })

  it('KEY-K33 Critical X: converts up to X surges to crits before the chart converts the rest', () => {
    const st = ST({ upgrades: ['emp.up.t21-stormtrooper'], extra: [{ at: [0, -7.5], weapon: 'emp.w.t21', upgradeId: 'emp.up.t21-stormtrooper' }] })
    let r = beginAttack(game([st, RT()]), 'ST', 'RT')
    r = ok(choose(r.state, 'pool:ranged:only:emp.w.t21', script(atk('white', 'surge', 'surge', 'surge', 'blank'), def('white', 'blank', 'blank', 'blank'))))
    expect(eventsOf(r, 'ResultsChanged')[0]).toMatchObject({ source: 'kw.critical', to: 'crit', n: 2 })
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 1, crits: 2 })
  })

  it('KEY-K34 Cumbersome: each die is downgraded when the unit moved this activation', () => {
    const st = ST({ upgrades: ['emp.up.hh12-stormtrooper'], extra: [{ at: [0, -7.5], weapon: 'emp.w.hh12', upgradeId: 'emp.up.hh12-stormtrooper' }] })
    const rt = RT({ at: [[0, 8]] })
    const moved = game([st, rt])
    u(moved, 'ST').flags['movedThisActivation'] = true
    let r = beginAttack(moved, 'ST', 'RT')
    r = ok(choose(r.state, 'pool:ranged:only:emp.w.hh12', script(atk('white', 'blank', 'blank', 'blank'))))
    expect(eventsOf(r, 'DiceShifted')[0]).toMatchObject({ dir: -1, n: 3 })
    expect(eventsOf(r, 'DiceRolled').find((e) => e.purpose === 'attack')!.die).toBe('atk:white')
    // not moved: black dice
    const still = game([ST({ upgrades: ['emp.up.hh12-stormtrooper'], extra: [{ at: [0, -7.5], weapon: 'emp.w.hh12', upgradeId: 'emp.up.hh12-stormtrooper' }] }), RT({ at: [[0, 8]] })])
    let q = beginAttack(still, 'ST', 'RT')
    q = ok(choose(q.state, 'pool:ranged:only:emp.w.hh12', script(atk('black', 'blank', 'blank', 'blank'))))
    expect(eventsOf(q, 'DiceRolled').find((e) => e.purpose === 'attack')!.die).toBe('atk:black')
  })

  const sniper = (side: 'A' | 'B' = 'A') => {
    const sst = unit({ id: 'SN', seat: side, data: 'emp.u.scout-strike-team', at: [[0, -10]], upgrades: ['emp.up.dlt19x-sniper'] })
    sst.minis[0]!.weaponIds = ['emp.w.dlt19x']
    sst.minis[0]!.upgradeId = 'emp.up.dlt19x-sniper'
    return sst
  }

  it('KEY-K40 Sniper Team (code): an unmoved unit upgrades the pool dice and may cancel the whole pool, dealing 1 wound if a crit was cancelled', () => {
    const rt = RT({ tokens: { dodge: 1 } })
    let r = beginAttack(game([sniper(), rt]), 'SN', 'RT')
    // upgraded: black x2 -> red x2, white -> black (red rolled first, then black)
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('red', 'crit', 'blank'), atk('black', 'blank'))))
    expect(hookFireCount('sniperTeam')).toBe(1)
    expect(r.pending!.context['step']).toBe('sniper')
    expect(optionIds(r.state)).toEqual(['sniper:cancel', 'sniper:keep'])
    r = ok(choose(r.state, 'sniper:cancel'))
    expect(eventsOf(r, 'WoundsSuffered').find((e) => e.source === 'kw.sniper-team')).toMatchObject({ unitId: 'RT', n: 1 })
    expect(u(r.state, 'RT').suppression).toBe(1)
    expect(eventsOf(r, 'Compared')).toHaveLength(0)
  })

  it('KEY-K35 High Velocity: with only High Velocity weapons the defender cannot spend Dodge', () => {
    const rt = RT({ tokens: { dodge: 2 } })
    let r = beginAttack(game([sniper(), rt]), 'SN', 'RT')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('red', 'hit', 'blank'), atk('black', 'blank'))))
    r = ok(choose(r.state, 'sniper:keep', script(def('white', 'blank'))))
    expect(r.pending!.kind).toBe('action.choose') // no dodge decision was raised
    expect(u(r.state, 'RT').tokens['dodge']).toBe(2)
  })

  it('KEY-K38 Overwhelm: an Aim spent rerolling gives the defender 1 extra suppression', () => {
    const snipe = sniper()
    snipe.tokens['aim'] = 1
    const rt = RT()
    let r = beginAttack(game([snipe, rt]), 'SN', 'RT')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('red', 'hit', 'blank'), atk('black', 'blank'))))
    r = ok(choose(r.state, r.pending!.options![0]!.id, script(atk('red', 'blank'), atk('black', 'blank'))))
    r = ok(choose(r.state, 'sniper:keep', script(def('white', 'blank'))))
    expect(u(r.state, 'RT').suppression).toBe(2)
  })

  it('KEY-K37 Long Shot: before choosing the defender it may spend 1 Aim to extend the range by 1 band', () => {
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 0]], tokens: { aim: 1 } })
    const far = unit({ id: 'F', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 14]] })
    const s = game([luke, far])
    expect(attackTargets(s, 'L').find((t) => t.unitId === 'F')!.ok).toBe(false)
    let r = ok(menu(s, { action: 'attack', unitId: 'L' }))
    expect(r.pending!.kind).toBe('keyword.choice')
    expect(r.pending!.context['keyword']).toBe('kw.long-shot')
    r = ok(choose(r.state, 'use'))
    expect(u(r.state, 'L').tokens['aim'] ?? 0).toBe(0)
    expect(r.pending!.kind).toBe('attack.defender')
    expect(optionIds(r.state)).toEqual(['unit:F'])
  })

  it('KEY-K39 Pierce X: cancels up to X blocks in Modify Defence Dice', () => {
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const rt = unit({ id: 'E', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 1.0633]] })
    let r = beginAttack(game([vader, rt]), 'V', 'E')
    r = ok(choose(r.state, 'pool:melee:all', script(atk('red', 'hit', 'hit', 'hit', 'hit', 'blank', 'blank'), def('white', 'block', 'block', 'block', 'block'))))
    // Impact only matters against Armor; Pierce 3 cancels three of the four blocks
    expect(eventsOf(r, 'ResultsCancelled').find((e) => e.source === 'kw.pierce')).toMatchObject({ n: 3 })
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 4, blocks: 1, wounds: 3 })
  })

  it('KEY-ION an unimplemented effect throws when it is reached (Ion is out of every playable list)', () => {
    const rt = unit({ id: 'R', seat: 'A', data: 'reb.u.rebel-troopers', at: [[0, -5]], upgrades: ['reb.up.mpl57-ion-trooper'], extra: [{ at: [1.5, -5.5], weapon: 'reb.w.mpl57', upgradeId: 'reb.up.mpl57-ion-trooper' }] })
    const e = unit({ id: 'E', seat: 'B', data: 'emp.u.stormtroopers', at: [[0, 3]] })
    const r = beginAttack(game([rt, e]), 'R', 'E')
    expect(() => choose(r.state, 'pool:ranged:only:reb.w.mpl57')).toThrow(/unimplemented/)
  })
})

describe('KEY native effects and bookkeeping', () => {
  it('KEY-NATIVE the native keywords (Detachment, Heavy Weapon Team, Infiltrate, Jump, Leader, Scout, Permanent, Divulge) are inert in windows: the setup and movement modules own them', () => {
    const v = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    v.keywords = ['kw.detachment', 'kw.heavy-weapon-team', 'kw.infiltrate', 'kw.jump', 'kw.leader', 'kw.scout', 'kw.permanent', 'kw.divulge'].map((id) => ({ id, x: 1 }))
    const s = game([v])
    for (const w of ['activation.start', 'activation.rallied', 'move.ended', 'activation.end', 'setup.deploy']) {
      const r = fire(s, w, { unitId: 'V' })
      expect(r.pending!.kind).toBe('action.choose')
    }
  })

  it('KEY-DELTA extra and fewer actions from effects add up for the activation', () => {
    const s = game([RT()])
    const c = createCtx(s, { int: () => 0, d6: () => 1, serialize: () => null }, null, 0)
    c.state.effects.push({ id: 'e1', source: 'x', seat: 'B', kind: 'extraAction', unitId: 'RT', expires: 'activation', data: { n: 1 } })
    c.state.effects.push({ id: 'e2', source: 'y', seat: 'B', kind: 'fewerActions', unitId: 'RT', expires: 'activation', data: { n: 2 } })
    expect(actionDelta(c.state, 'RT')).toBe(-1)
    void fireWindow
    void poolOptions
  })
})
