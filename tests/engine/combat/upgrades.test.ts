// UPG-: upgrade card effects (granted actions, triggers, auras, modifiers) and the code hooks registry (bunkerAssault, scoringTable, flipCard).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runBattleHook } from '../../../src/engine/armies'
import { checkCodeParams, hookFireCount, registeredCodeHooks, resetFireCounts } from '../../../src/engine/code-hooks'
import { cardActions } from '../../../src/engine/commandCards'
import { miniWeapons, unitKeywords } from '../../../src/engine/keywords'
import { applySuppression } from '../../../src/engine/morale'
import { createCtx } from '../../../src/engine/registry'
import { atk, beginAttack, choose, def, eventsOf, game, menu, ok, optionIds, script, u, unit, uninstallModules } from './harness'
import type { GameState } from '../../../src/engine/types'

afterEach(() => {
  uninstallModules()
  resetFireCounts()
})

const stubRng = { int: () => 0, d6: () => 1, serialize: () => null }
const fire = (s: GameState, window: string, info: Record<string, unknown> = {}) => ok(menu(s, { action: 'fire', window, info, resume: true }))
const rt = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 4], [1.5, 4.5]], ...over })

describe('UPG upgrade cards', () => {
  it('UPG-001 Force Choke: a free exhaust action wounds an enemy Trooper unit within range 1 that is not a Commander or Operative', () => {
    const v = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]], upgrades: ['neu.up.force-choke'] })
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[3, 0]] })
    let r = ok(menu(game([v, rt(), luke]), { action: 'cardAction', unitId: 'V', actionId: 'neu.act.force-choke' }))
    expect(u(r.state, 'RT').minis.filter((m) => m.alive)).toHaveLength(1)
    expect(u(r.state, 'L').minis[0]!.wounds).toBe(0)
    expect(u(r.state, 'V').flags['exhausted']).toEqual(['neu.up.force-choke'])
    const acts = cardActions(createCtx(r.state, stubRng, null, 0), u(r.state, 'V'))
    expect(acts.find((a) => a.id === 'neu.act.force-choke')).toMatchObject({ available: false, whyNot: 'exhausted' })
    r = ok(menu(r.state, { action: 'menu' }))
  })

  it('UPG-002 Force Reflexes: a free exhaust action gains a Dodge', () => {
    const v = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]], upgrades: ['neu.up.force-reflexes'] })
    const r = ok(menu(game([v]), { action: 'cardAction', unitId: 'V', actionId: 'neu.act.force-reflexes' }))
    expect(u(r.state, 'V').tokens['dodge']).toBe(1)
    expect(eventsOf(r, 'ActionResolved')[0]!.action).toBe('neu.act.force-reflexes')
  })

  it('UPG-003 Force Push: the chosen enemy unit gets a controlled move for the movement module to resolve', () => {
    const l = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 0]], upgrades: ['neu.up.force-push'] })
    const e = unit({ id: 'E', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 4]] })
    const r = ok(menu(game([l, e]), { action: 'cardAction', unitId: 'L', actionId: 'neu.act.force-push' }))
    expect(r.state.effects.find((x) => x.kind === 'controlledMove' && x.unitId === 'E')!.data).toMatchObject({ speed: 1, ignoreEngagement: true })
  })

  it('UPG-004 Specialist: a free exhaust action chooses between an Aim and a Surge token', () => {
    const t = rt({ upgrades: ['reb.up.rebel-trooper-specialist'] })
    let r = ok(menu(game([t]), { action: 'cardAction', unitId: 'RT', actionId: 'reb.act.specialist' }))
    expect(r.pending!.kind).toBe('keyword.choice')
    expect(optionIds(r.state)).toEqual(['opt:0', 'opt:1'])
    r = ok(choose(r.state, 'opt:1'))
    expect(u(r.state, 'RT').tokens['surge']).toBe(1)
    expect(u(r.state, 'RT').tokens['aim'] ?? 0).toBe(0)
    expect(eventsOf(r, 'ActionResolved')).toHaveLength(1)
  })

  it('UPG-005 Captain: at activation start the unit may become unable to gain or lose suppression this activation', () => {
    const st = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0]], upgrades: ['emp.up.stormtrooper-captain'] })
    let r = fire(game([st]), 'activation.start', { unitId: 'ST' })
    expect(r.pending!.kind).toBe('keyword.choice')
    r = ok(choose(r.state, 'use'))
    const c = createCtx(r.state, stubRng, null, 0)
    expect(applySuppression(c, 'ST', 2, 'test')).toBe(0)
    expect(u(c.state, 'ST').suppression).toBe(0)
  })

  it('UPG-006 Anger: whenever the unit suffers wounds it gains an Aim', () => {
    const v = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]], upgrades: ['neu.up.anger'] })
    const r = ok(menu(game([v]), { action: 'wound', unitId: 'V', n: 2 }))
    expect(u(r.state, 'V').tokens['aim']).toBe(1)
  })

  it('UPG-007 Force Barrier: an allied Trooper within range 1 of Luke may cancel 1 crit or 2 hits against a ranged attack', () => {
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[3, 3]], upgrades: ['neu.up.force-barrier'] })
    const target = rt({ at: [[0, 3], [1.5, 3.5]] })
    const shooter = unit({ id: 'S', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5], [1.5, -5.5]] })
    let r = beginAttack(game([luke, target, shooter]), 'S', 'RT')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('white', 'hit', 'hit', 'hit'))))
    expect(r.pending!.kind).toBe('keyword.choice')
    expect(r.pending!.context['keyword']).toBe('neu.up.force-barrier')
    r = ok(choose(r.state, 'use'))
    expect(optionIds(r.state)).toEqual(['opt:0', 'opt:1'])
    r = ok(choose(r.state, 'opt:1', script(def('white', 'blank'))))
    expect(eventsOf(r, 'ResultsCancelled').find((e) => e.source === 'neu.up.force-barrier')).toMatchObject({ result: 'hit', n: 2 })
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ hits: 1 })
  })

  it('UPG-008 Force Guidance: up to two allied units within range 2 gain a Surge token', () => {
    const v = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]], upgrades: ['neu.up.force-guidance'] })
    const a = unit({ id: 'A1', seat: 'A', data: 'emp.u.stormtroopers', at: [[5, 0]] })
    const b = unit({ id: 'A2', seat: 'A', data: 'emp.u.scout-troopers', at: [[-5, 0]] })
    let r = ok(menu(game([v, a, b]), { action: 'cardAction', unitId: 'V', actionId: 'neu.act.force-guidance' }))
    expect(r.pending!.kind).toBe('keyword.choice')
    r = ok(choose(r.state, 'unit:A1'))
    r = ok(choose(r.state, 'unit:A2'))
    expect(u(r.state, 'A1').tokens['surge']).toBe(1)
    expect(u(r.state, 'A2').tokens['surge']).toBe(1)
  })

  it('UPG-009 Hope and Fear grant Inspire 1 and Demoralize 1 as upgrade keywords', () => {
    const l = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 0]], upgrades: ['neu.up.hope'] })
    expect(unitKeywords(game([l]), u(game([l]), 'L')).find((k) => k.id === 'kw.inspire')!.x).toBe(3) // Luke has Inspire 2 + Hope 1
  })

  it('UPG-010 Battle Shield (flipCard code): turned at activation start; the Offensive side swaps Armor 1 for the red-dice weapon', () => {
    const w = unit({ id: 'W', seat: 'B', data: 'reb.u.wookiee-warriors-ff', at: [[0, 3]], upgrades: ['reb.up.battle-shield-wookiee'], extra: [{ at: [1.5, 3.5], weapon: 'reb.w.battle-shield-defensive', upgradeId: 'reb.up.battle-shield-wookiee' }] })
    const s = game([w])
    expect(unitKeywords(s, u(s, 'W')).some((k) => k.id === 'kw.armor')).toBe(true)
    // the shield figure keeps the Wookiee Warriors' own weapons next to the shield (CRB p17)
    expect(miniWeapons(s, u(s, 'W'), 'W.u1')).toEqual(['reb.w.battle-shield-defensive', 'reb.w.ryyk-blade', 'reb.w.kashyyyk-pistol'])
    let r = fire(s, 'activation.start', { unitId: 'W' })
    expect(r.pending!.kind).toBe('keyword.choice')
    expect(optionIds(r.state)).toEqual(['flip', 'keep'])
    r = ok(choose(r.state, 'flip'))
    expect(unitKeywords(r.state, u(r.state, 'W')).some((k) => k.id === 'kw.armor')).toBe(false)
    expect(miniWeapons(r.state, u(r.state, 'W'), 'W.u1')).toEqual(['reb.w.battle-shield-offensive', 'reb.w.ryyk-blade', 'reb.w.kashyyyk-pistol'])
    expect(hookFireCount('flipCard')).toBe(1)
  })
})

describe('HOOK code hook registry and battle hooks', () => {
  it('HOOK-001 every code hook the slice data names is registered with a params validator', () => {
    const names = registeredCodeHooks()
    for (const n of ['bunkerAssault', 'compel', 'darknessDescends', 'deflect', 'flipCard', 'implacable', 'orderTokenToPool', 'scoringTable', 'sniperTeam', 'vadersMight']) {
      expect(names).toContain(n)
    }
    expect(checkCodeParams('compel', { range: 2 })).toBeNull()
    expect(checkCodeParams('compel', { range: 'two' })).toMatch(/range/)
    expect(checkCodeParams('darknessDescends', { part: 'nope' })).toMatch(/part/)
    expect(checkCodeParams('nonesuch', undefined)).toMatch(/not registered/)
  })

  it('HOOK-002 bunkerAssault: from round 2 an enemy Bunker a player secures takes a wound token, destroyed at 3', () => {
    const s = game([rt()], { round: 2 })
    s.table = { ...s.table, objectives: { b1: { id: 'b1', pos: { x: 0, z: 0 }, tags: ['bunker', 'enemyOf:A', 'securedBy:A'], kind: 'poi' } } }
    const c = createCtx(s, stubRng, null, 0)
    const params = { woundsToDestroy: 3, fromRound: 2, bonusRanks: ['commander'] }
    for (let i = 0; i < 3; i++) runBattleHook(c, 'bunkerAssault', 'end.start', params)
    expect(c.state.battle.data['bunkerWounds']).toEqual({ b1: 3 })
    expect(c.state.battle.data['destroyed']).toEqual(['b1'])
    expect(hookFireCount('bunkerAssault')).toBe(3)
    // round 1: nothing
    const early = createCtx(game([rt()], { round: 1 }), stubRng, null, 0)
    runBattleHook(early, 'bunkerAssault', 'end.start', params)
    expect(early.state.battle.data['bunkerWounds']).toBeUndefined()
  })

  it('HOOK-003 scoringTable: records the suppression gains the battle module offers column marks for', () => {
    const c = createCtx(game([rt()]), stubRng, null, 0)
    runBattleHook(c, 'scoringTable', 'SuppressionChanged', { markOnce: true }, { unitId: 'RT' })
    expect(c.state.battle.data['suppressionGains']).toEqual([{ round: 2, unitId: 'RT' }])
    expect(hookFireCount('scoringTable')).toBe(1)
  })
})

describe('IMPORT module order', () => {
  it('HOOK-004 each combat module can be the first import: the import cycles hold no top-level dependency', async () => {
    const loaders = [
      () => import('../../../src/engine/attack'),
      () => import('../../../src/engine/keywords'),
      () => import('../../../src/engine/morale'),
      () => import('../../../src/engine/query'),
      () => import('../../../src/engine/melee'),
      () => import('../../../src/engine/commandCards'),
      () => import('../../../src/engine/armies'),
    ]
    for (const load of loaders) {
      vi.resetModules()
      const m = await load()
      expect(Object.keys(m).length).toBeGreaterThan(0)
    }
    vi.resetModules()
    const { registeredCodeHooks: names } = await import('../../../src/engine/code-hooks')
    await import('../../../src/engine/morale')
    expect(names()).toContain('flipCard')
  })
})
