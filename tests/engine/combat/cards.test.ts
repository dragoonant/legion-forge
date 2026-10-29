// CC-: the 20 slice command cards (14-armies sections 2.4 and 3.4): declarative effects through the interpreter and the code
// hooks (implacable, vadersMight, darknessDescends, orderTokenToPool), plus orders, restrictions and the Standing Orders rules.
import { afterEach, describe, expect, it } from 'vitest'
import { hookFireCount, resetFireCounts } from '../../../src/engine/code-hooks'
import { activateCard, cardActions, cardIsPermanent, cardPips, cardPlayable, cardReturnsToHand, divulgeCard, orderSpec, orderTargets } from '../../../src/engine/commandCards'
import { actionDelta, orderLimit, unitKeywords } from '../../../src/engine/keywords'
import { createCtx } from '../../../src/engine/registry'
import { atk, beginAttack, choose, def, eventsOf, game, menu, ok, optionIds, script, u, unit, uninstallModules } from './harness'
import type { GameState } from '../../../src/engine/types'

afterEach(() => {
  uninstallModules()
  resetFireCounts()
})

const stubRng = { int: () => 0, d6: () => 1, serialize: () => null }
const play = (s: GameState, seat: 'A' | 'B', cardId: string) => ok(menu(s, { action: 'activateCard', seat, cardId }))
const fire = (s: GameState, window: string, info: Record<string, unknown> = {}) => ok(menu(s, { action: 'fire', window, info, resume: true }))
const vader = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]], ...over })
const luke = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[0, 0]], ...over })
const rt = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 4], [1.5, 4.5]], ...over })
const st = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -5], [-1.5, -5.5]], ...over })

describe('CC command cards', () => {
  it('CC-001 Implacable: Vader gains a Dodge at each activation start; after the first he may wound himself to return his order token; the second activation has one fewer action', () => {
    let r = play(game([vader({ order: 'spent' })]), 'A', 'emp.cc.implacable')
    r = fire(r.state, 'activation.start', { unitId: 'V' })
    expect(u(r.state, 'V').tokens['dodge']).toBe(1)
    r = fire(r.state, 'activation.end', { unitId: 'V' })
    expect(r.pending!.kind).toBe('card.choice')
    expect(optionIds(r.state)).toEqual(['accept', 'decline'])
    r = ok(choose(r.state, 'accept'))
    expect(u(r.state, 'V').minis[0]!.wounds).toBe(1)
    expect(u(r.state, 'V').order.state).toBe('pool')
    expect(r.state.players.A.pool.tokens).toEqual(['commander'])
    expect(u(r.state, 'V').activated).toBe(false)
    r = fire(r.state, 'activation.start', { unitId: 'V' })
    expect(u(r.state, 'V').tokens['dodge']).toBe(2)
    expect(actionDelta(r.state, 'V')).toBe(-1)
    // no second offer at the end of the second activation
    r = fire(r.state, 'activation.end', { unitId: 'V' })
    expect(r.pending!.kind).toBe('action.choose')
    expect(hookFireCount('implacable')).toBeGreaterThan(0)
  })

  it('CC-002 Vader\'s Might: a free card action moves a non-Heavy unit within range 1 and an enemy rolls a white die per figure, a wound per block or surge', () => {
    const enemy = rt()
    let r = play(game([vader(), enemy]), 'A', 'emp.cc.vaders-might')
    const acts = cardActions(createCtx(r.state, stubRng, null, 0), u(r.state, 'V'))
    expect(acts.map((a) => a.id)).toContain('emp.act.vaders-might')
    r = ok(menu(r.state, { action: 'cardAction', unitId: 'V', actionId: 'emp.act.vaders-might' }))
    expect(r.pending!.kind).toBe('card.choice')
    expect(optionIds(r.state)).toEqual(['unit:RT', 'cancel'])
    r = ok(choose(r.state, 'unit:RT'))
    const dest = optionIds(r.state).find((id) => id === 'to:0,1.5')!
    expect(dest).toBeDefined()
    r = ok(choose(r.state, dest, script(def('white', 'block', 'blank'))))
    expect(u(r.state, 'RT').minis.map((m) => m.pos.z)).toEqual([5.5, 6])
    expect(eventsOf(r, 'UnitMoved')).toHaveLength(1)
    expect(u(r.state, 'RT').minis.filter((m) => m.alive)).toHaveLength(1)
    expect(hookFireCount('vadersMight')).toBe(1)
    // once per activation
    expect(cardActions(createCtx(r.state, stubRng, null, 0), u(r.state, 'V')).find((a) => a.id === 'emp.act.vaders-might')!.available).toBe(false)
  })

  it('CC-003 New Ways to Motivate Them: an allied Trooper other than Vader may suffer 1 wound at activation start for one extra action', () => {
    let r = play(game([vader({ order: 'faceUp' }), st({ order: 'faceUp' })]), 'A', 'emp.cc.new-ways')
    const noVader = fire(r.state, 'activation.start', { unitId: 'V' })
    expect(noVader.pending!.kind).toBe('action.choose')
    r = fire(r.state, 'activation.start', { unitId: 'ST' })
    expect(r.pending!.kind).toBe('card.choice')
    expect(r.pending!.context['cardId']).toBe('emp.cc.new-ways')
    r = ok(choose(r.state, 'use'))
    expect(u(r.state, 'ST').minis.filter((m) => m.alive)).toHaveLength(1)
    expect(actionDelta(r.state, 'ST')).toBe(1)
  })

  it('CC-004 Fear and Dead Men: when an enemy attack wounds Vader the attacking unit suffers the same number of wounds', () => {
    const shooter = unit({ id: 'R', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 5], [1.5, 5.5], [-1.5, 5.5]] })
    let r = play(game([vader(), shooter]), 'A', 'emp.cc.fear-and-dead-men')
    r = beginAttack(r.state, 'R', 'V')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('black', 'hit', 'hit', 'blank'), def('red', 'blank', 'blank'))))
    expect(u(r.state, 'V').minis[0]!.wounds).toBe(2)
    expect(eventsOf(r, 'CardEffect').some((e) => e.cardId === 'emp.cc.fear-and-dead-men')).toBe(true)
    expect(u(r.state, 'R').minis.filter((m) => !m.alive)).toHaveLength(2)
  })

  it('CC-005 Master of Evil: Vader gains a Dodge when ordered with it; at his next activation enemy Troopers within range 2 gain 3 suppression (once per round)', () => {
    const e1 = rt({ id: 'E1', at: [[6, 0]] })
    let r = play(game([vader(), e1]), 'A', 'emp.cc.master-of-evil')
    r = fire(r.state, 'OrderIssued', { unitId: 'V', byCard: 'emp.cc.master-of-evil', byCommandCard: true })
    expect(u(r.state, 'V').tokens['dodge']).toBe(1)
    r = fire(r.state, 'activation.start', { unitId: 'V' })
    expect(u(r.state, 'E1').suppression).toBe(3)
    r = fire(r.state, 'activation.start', { unitId: 'V' })
    expect(u(r.state, 'E1').suppression).toBe(3)
  })

  it('CC-006 Darkness Descends: Permanent, Vader gains Reliable 2 unless Divulged; Divulge gives Infiltrate and no Reliable', () => {
    const s = game([vader()])
    const c = createCtx(s, stubRng, null, 0)
    expect(cardIsPermanent(c.state, 'emp.cc.darkness-descends')).toBe(true)
    activateCard(c, 'A', 'emp.cc.darkness-descends')
    expect(unitKeywords(c.state, u(c.state, 'V')).find((k) => k.id === 'kw.reliable')!.x).toBe(2)
    expect(c.state.effects.find((e) => e.kind === 'cardEffect')!.expires).toBe('game')
    expect(hookFireCount('darknessDescends')).toBe(1)
    // divulged at setup: Infiltrate, and playing the card later does not give Reliable
    const d = createCtx(game([vader()]), stubRng, null, 0)
    divulgeCard(d, 'A', 'emp.cc.darkness-descends')
    activateCard(d, 'A', 'emp.cc.darkness-descends')
    const kws = unitKeywords(d.state, u(d.state, 'V')).map((k) => k.id)
    expect(kws).toContain('kw.infiltrate')
    expect(kws).not.toContain('kw.reliable')
  })

  it('CC-007 Covert Observation: each enemy unit issued an order through a command card gains 1 suppression', () => {
    let r = play(game([vader(), rt()]), 'A', 'emp.cc.covert-observation')
    r = fire(r.state, 'OrderIssued', { unitId: 'RT', byCard: 'neu.cc.push', byCommandCard: true })
    expect(u(r.state, 'RT').suppression).toBe(1)
    r = fire(r.state, 'OrderIssued', { unitId: 'V', byCard: 'neu.cc.push', byCommandCard: true })
    expect(u(r.state, 'V').suppression).toBe(0)
    r = fire(r.state, 'OrderIssued', { unitId: 'RT', byCommandCard: false })
    expect(u(r.state, 'RT').suppression).toBe(1)
  })

  it('CC-008 Pinned Down (code): after an allied Support unit attacks a unit with a face-up order, that order token returns to the pool', () => {
    const sst = unit({ id: 'SS', seat: 'A', data: 'emp.u.scout-strike-team', at: [[0, -5]] })
    const target = rt({ order: 'faceUp' })
    let r = play(game([sst, target]), 'A', 'emp.cc.pinned-down')
    r = beginAttack(r.state, 'SS', 'RT')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('black', 'blank', 'blank'))))
    expect(u(r.state, 'RT').order.state).toBe('pool')
    expect(r.state.players.B.pool.tokens).toEqual(['corps'])
    expect(hookFireCount('orderTokenToPool')).toBe(1)
  })

  it('CC-009 Coordinated Fire: after an allied Corps unit spends an Aim on a ranged attack another allied unit within range 2 may gain 1 Aim', () => {
    const friend = unit({ id: 'F', seat: 'A', data: 'emp.u.scout-troopers', at: [[3, -5]] })
    let r = play(game([st({ tokens: { aim: 1 } }), friend, rt()]), 'A', 'emp.cc.coordinated-fire')
    r = beginAttack(r.state, 'ST', 'RT')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('white', 'blank', 'blank'))))
    r = ok(choose(r.state, r.pending!.options![0]!.id, script(atk('white', 'blank', 'blank'))))
    expect(r.pending!.kind).toBe('card.choice')
    expect(r.pending!.context['cardId']).toBe('emp.cc.coordinated-fire')
    r = ok(choose(r.state, 'use'))
    expect(u(r.state, 'F').tokens['aim']).toBe(1)
  })

  it('CC-010 Son of Skywalker: after Luke\'s first attack resolves he may make a free Attack action even if he already attacked', () => {
    const target = unit({ id: 'E', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 6]] })
    let r = play(game([luke(), target]), 'B', 'reb.cc.son-of-skywalker')
    r = beginAttack(r.state, 'L', 'E')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('red', 'blank'), atk('black', 'blank', 'blank', 'blank'))))
    expect(r.pending!.kind).toBe('card.choice')
    r = ok(choose(r.state, 'use'))
    expect(r.state.effects.find((e) => e.kind === 'freeAction' && e.unitId === 'L')!.data).toMatchObject({ action: 'core.action.attack', ignoreAttackLimit: true })
  })

  it('CC-011 My Ally Is the Force: each unit ordered with this card gains 1 Dodge', () => {
    let r = play(game([luke(), rt()]), 'B', 'reb.cc.my-ally-is-the-force')
    r = fire(r.state, 'OrderIssued', { unitId: 'RT', byCard: 'reb.cc.my-ally-is-the-force', byCommandCard: true })
    r = fire(r.state, 'OrderIssued', { unitId: 'L', byCard: 'reb.cc.my-ally-is-the-force', byCommandCard: true })
    expect(u(r.state, 'RT').tokens['dodge']).toBe(1)
    expect(u(r.state, 'L').tokens['dodge']).toBe(1)
    r = fire(r.state, 'OrderIssued', { unitId: 'RT', byCard: 'neu.cc.push', byCommandCard: true })
    expect(u(r.state, 'RT').tokens['dodge']).toBe(1)
  })

  it('CC-012 Full of Surprises: Luke gains a Dodge when ordered; when he defends he rolls extra white dice equal to courage minus suppression', () => {
    const shooter = unit({ id: 'S', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -6]] })
    let r = play(game([luke({ at: [[0, 0]], suppression: 1 }), shooter]), 'B', 'reb.cc.full-of-surprises')
    r = fire(r.state, 'OrderIssued', { unitId: 'L', byCard: 'reb.cc.full-of-surprises', byCommandCard: true })
    expect(u(r.state, 'L').tokens['dodge']).toBe(1)
    r = beginAttack(r.state, 'S', 'L')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('white', 'hit'))))
    r = ok(choose(r.state, 'dodge:0', script(def('red', 'blank'), def('white', 'block', 'blank'))))
    expect(eventsOf(r, 'DiceRolled').filter((e) => e.purpose === 'defence.extra')[0]!.faces).toHaveLength(2) // courage 3 - 1 suppression
    expect(eventsOf(r, 'Compared')[0]).toMatchObject({ blocks: 0 + 1 })
  })

  it('CC-013 Return of the Jedi: Luke gains a Dodge when ordered; at his next activation allied Troopers within range 3 may remove 1 suppression', () => {
    const friend = rt({ at: [[5, 0]], suppression: 2 })
    let r = play(game([luke(), friend]), 'B', 'reb.cc.return-of-the-jedi')
    r = fire(r.state, 'OrderIssued', { unitId: 'L', byCard: 'reb.cc.return-of-the-jedi', byCommandCard: true })
    expect(u(r.state, 'L').tokens['dodge']).toBe(1)
    r = fire(r.state, 'activation.start', { unitId: 'L' })
    expect(r.pending!.kind).toBe('card.choice')
    r = ok(choose(r.state, 'use'))
    expect(u(r.state, 'RT').suppression).toBe(1)
  })

  it('CC-014 Sabotaged Communications: an opponent who issues orders through a command card may issue only 1 order with it', () => {
    const s = game([luke(), vader()])
    const r = play(s, 'B', 'reb.cc.sabotaged-communications')
    expect(orderLimit(r.state, 'A')).toBe(1)
    expect(orderLimit(r.state, 'B')).toBe(Infinity)
  })

  it('CC-015 Turning the Tide: allied Support and Heavy units gain Inspire 2 this round', () => {
    const support = unit({ id: 'CS', seat: 'B', data: 'reb.u.commando-strike-team', at: [[0, 5]] })
    let r = play(game([luke(), support, rt()]), 'B', 'reb.cc.turning-the-tide')
    r = fire(r.state, 'command.ordersIssued')
    expect(unitKeywords(r.state, u(r.state, 'CS')).find((k) => k.id === 'kw.inspire')!.x).toBe(2)
    expect(unitKeywords(r.state, u(r.state, 'RT')).some((k) => k.id === 'kw.inspire')).toBe(false)
    expect(r.state.effects.filter((e) => e.kind === 'keyword').every((e) => e.expires === 'round')).toBe(true)
  })

  it('CC-016 Covering Fire: after an allied Corps ranged attack resolves another allied unit within range 2 may gain 1 Dodge', () => {
    const friend = unit({ id: 'F', seat: 'B', data: 'reb.u.rebel-commandos', at: [[3, 5]] })
    const shooter = rt({ id: 'R', at: [[0, 4]] })
    const target = unit({ id: 'E', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -3], [1.5, -3.5], [-1.5, -3.5]] })
    let r = play(game([shooter, friend, target]), 'B', 'reb.cc.covering-fire')
    r = beginAttack(r.state, 'R', 'E')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('black', 'blank'))))
    expect(r.pending!.kind).toBe('card.choice')
    r = ok(choose(r.state, 'use'))
    expect(u(r.state, 'F').tokens['dodge']).toBe(1)
  })

  it('CC-017 Ambush, Push, Assault and Standing Orders carry only orders; Standing Orders returns to the hand', () => {
    const s = game([vader(), st(), rt()])
    expect(['neu.cc.ambush', 'neu.cc.push', 'neu.cc.assault', 'neu.cc.standing-orders'].map((id) => cardPips(s, id))).toEqual([1, 2, 3, 4])
    expect(orderSpec(s, 'A', 'neu.cc.assault').total).toBe(3)
    expect(orderSpec(s, 'A', 'neu.cc.push').total).toBe(2)
    expect(cardReturnsToHand(s, 'neu.cc.standing-orders')).toBe(true)
    expect(cardReturnsToHand(s, 'neu.cc.push')).toBe(false)
    expect(s.data.cards['neu.cc.push']!.effects).toEqual([])
  })

  it('CC-018 character cards need their named unit in play and order only the allowed ranks and types', () => {
    const s = game([vader(), st(), rt()])
    expect(cardPlayable(s, 'A', 'emp.cc.implacable')).toBe(true)
    expect(cardPlayable(s, 'B', 'emp.cc.implacable')).toBe(false) // seat B has no such unit
    const gone = game([st(), rt()])
    expect(cardPlayable(gone, 'A', 'emp.cc.implacable')).toBe(false)
    expect(orderSpec(s, 'A', 'emp.cc.master-of-evil')).toMatchObject({ named: ['V'], count: 2, total: 3 })
    expect(orderTargets(s, 'A', 'emp.cc.covert-observation')).toEqual([]) // needs an Operative or Special Forces unit
    expect(orderTargets(s, 'A', 'emp.cc.coordinated-fire')).toEqual(['ST']) // Corps only
    expect(orderTargets(s, 'A', 'neu.cc.push', ['ST'])).toEqual(['V'])
  })
})
