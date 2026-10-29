// M2 integration: the flow modules (setup, command, activation, movement, battle, end phase) and the combat modules (attack,
// morale, keywords, command cards) run together on the real Recon data. Each test names the seam it proves.
import { describe, expect, it } from 'vitest'
import { createGame, type GameState, type Seat, type StepResult } from '../../../src/engine'
import { RULESET } from '../../../src/engine/bundle'
import { rosterFromList } from '../../../src/engine/setup'
import { afterEndWindow, actionMenu, hasAttackSeam } from '../../../src/engine/activation'
import { defeatUnit } from '../../../src/engine/attack'
import { getWindowOpener } from '../../../src/engine/hooks'
import { addEffect } from '../../../src/engine/effects'
import { actionsFor } from '../../../src/engine/morale'
import { ScriptedRng, CLOSE, GENERIC_A, GENERIC_B, advance, ctxFor, edit, events, hasOption, must, newGame, optionAction, pick, place, realBundle, unitBy } from './helpers'

const CARDS = ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.cunning-deployment', 'rec.adv.fortified-position']

function firstTurn(): StepResult {
  const g = newGame({ generic: true, cards: CARDS, options: { autoDeploy: true } })
  return advance(pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.push' }), (p) => p.kind === 'activation.choose')
}

const act = (state: GameState, seat: Seat, id: string) => ({ type: 'activation.choose' as const, seat, decisionId: state.pending!.id, payload: { unitId: id } })

function ready(state: GameState, unitId: string, at: [number, number] | null, patch: (s: GameState) => void = () => undefined): GameState {
  return edit(state, (s) => {
    const u = s.units[unitId]!
    if (u.order.state === 'pool') {
      const pool = s.players[u.seat].pool.tokens
      pool.splice(pool.indexOf(u.rank), 1)
    }
    u.order.state = 'faceUp'
    if (at) place(u, at[0], at[1])
    patch(s)
  })
}

const startOf = (state: GameState, unitId: string, rng?: ScriptedRng): StepResult => {
  const u = state.units[unitId]!
  const s = edit(state, (x) => {
    const p = x.pending!
    x.pending = { ...p, seat: u.seat, options: [{ id: `unit:${unitId}`, labelKey: 'activation.order', action: act(x, u.seat, unitId) }] }
  })
  return must(s, act(s, u.seat, unitId), rng)
}

/** A's Stormtroopers at (-14, -14) with B's Rebel Troopers `distance` inches away: both in the open, in line of sight. */
function duel(distance: number): { state: GameState; atk: string; def: string } {
  const r = firstTurn()
  const atk = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
  const def = unitBy(r.state, 'B', 'reb.u.rebel-troopers', 0).id
  const state = ready(r.state, atk, [-14, -14], (x) => {
    // every other model is moved out of the way so the duel is the only fight on the table
    Object.values(x.units).filter((u) => u.location === 'table' && u.id !== atk && u.id !== def).forEach((u, i) => place(u, 16, 16 - 3.5 * i))
    place(x.units[def]!, -14, -14 + distance)
  })
  return { state, atk, def }
}


describe('flow and combat together', () => {
  it('INT-001 the attack module registers the Attack action seam and the window opener runs the keyword interpreter', () => {
    expect(hasAttackSeam()).toBe(true)
    expect(getWindowOpener()).not.toBeNull()
  })

  it('INT-002 the Attack action: Attack is offered with a target in range, runs the real pipeline and the activation continues with one action left', () => {
    const d = duel(6)
    let r = startOf(d.state, d.atk, new ScriptedRng([5]))
    expect(hasOption(r.state, 'attack')).toBe(true)
    r = must(r.state, optionAction(r.state, 'attack'))
    expect(r.pending!.kind).toBe('attack.defender')
    expect(r.pending!.options!.map((o) => o.id)).toEqual([`unit:${d.def}`])
    r = advance(must(r.state, optionAction(r.state, `unit:${d.def}`)), (p) => p.kind === 'action.choose')
    expect(r.pending!.kind).toBe('action.choose')
    expect(events(r, 'AttackEnded')).toHaveLength(1)
    expect(r.state.activation.current!.performed.map((p) => p.action)).toEqual(['attack'])
    expect(r.state.activation.current!.actionsLeft).toBe(1)
    expect(hasOption(r.state, 'attack')).toBe(false)
    expect(r.state.attack).toBeNull()
  })

  it('INT-003 an attack with no legal target is never offered; a Standby attack may only name the triggering unit', () => {
    const far = duel(30)
    const st = startOf(far.state, far.atk, new ScriptedRng([5]))
    expect(hasOption(st.state, 'attack')).toBe(false)
    expect((st.pending!.context.withheld as { action: string; whyNot: string }[]).find((w) => w.action === 'attack')).toMatchObject({ whyNot: 'noTarget' })
    // B's watcher holds Standby 6" from A's trooper: its free attack is offered and is forced onto the mover
    const near = duel(6)
    const armed = edit(near.state, (s) => void (s.units[near.def]!.tokens.standby = 1))
    let r = startOf(armed, near.atk, new ScriptedRng([5]))
    r = must(r.state, optionAction(r.state, 'aim'))
    expect(r.pending!.kind).toBe('activation.standby')
    expect(r.pending!.options!.map((o) => o.id)).toContain(`${near.def}:attack`)
    r = must(r.state, optionAction(r.state, `${near.def}:attack`))
    expect(r.pending!.kind).toBe('attack.defender')
    expect(r.pending!.seat).toBe('B')
    expect(r.pending!.options!.map((o) => o.id)).toEqual([`unit:${near.atk}`])
  })

  it('INT-004 a defeated unit drops its order token from the pool and its Standby token (WND-008)', () => {
    const r = firstTurn()
    const victim = unitBy(r.state, 'B', 'reb.u.rebel-troopers', 1)
    expect(victim.order.state).toBe('pool')
    const before = r.state.players.B.pool.tokens.length
    const ctx = ctxFor(edit(r.state, (s) => void (s.units[victim.id]!.tokens.standby = 1)))
    const u = ctx.state.units[victim.id]!
    u.minis.forEach((m) => (m.alive = false))
    defeatUnit(ctx, u)
    expect(ctx.state.players.B.pool.tokens).toHaveLength(before - 1)
    expect(u.order.state).toBe('none')
    expect(u.tokens.standby ?? 0).toBe(0)
    expect(ctx.events.some((e) => e.type === 'PoolTokenRemoved' && e.reason === 'unitDefeated')).toBe(true)
  })

  it('INT-005 a unit that returned its order token to the pool (Implacable) is not marked activated at the end of its activation', () => {
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const s = startOf(ready(r.state, id, [0, -10]), id, new ScriptedRng([5])).state
    const ctx = ctxFor(s)
    const u = ctx.state.units[id]!
    u.order.state = 'pool'
    u.activated = false
    u.flags.returnedToPool = true
    ctx.state.players.A.pool.tokens.push(u.rank)
    afterEndWindow(ctx)
    expect(u.activated).toBe(false)
    expect(u.order.state).toBe('pool')
    expect(u.flags.returnedToPool).toBeUndefined()
    expect(ctx.state.players.A.pool.tokens.filter((t) => t === u.rank).length).toBeGreaterThan(0)
  })

  it('INT-006 a start-of-actions free Move (Compel) is the only menu item, cannot be skipped, costs no action and is spent when taken', () => {
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const s = ready(r.state, id, [0, -10])
    const ctx = ctxFor(s)
    const eff = addEffect(ctx, { source: 'kw.compel', seat: 'A', kind: 'freeAction', unitId: id, expires: 'activation', data: { action: 'core.action.move', startOfActions: true, source: 'kw.compel' } })
    // the effect is placed as the activation begins, so install it on the state the activation starts from
    const withEffect = edit(s, (x) => void (x.effects = ctx.state.effects))
    void eff
    let st = startOf(withEffect, id, new ScriptedRng([5]))
    expect(st.pending!.kind).toBe('action.choose')
    expect(st.pending!.options!.map((o) => o.id)).toEqual([`free:${eff.id}`])
    expect(st.pending!.canPass).toBe(false)
    expect(st.state.activation.current!.actionsLeft).toBe(2)
    st = advance(must(st.state, optionAction(st.state, `free:${eff.id}`)), (p) => p.kind === 'action.choose')
    expect(st.state.effects.some((e) => e.id === eff.id)).toBe(false)
    expect(st.state.activation.current!.actionsLeft).toBe(2)
    expect(st.state.activation.current!.performed).toEqual([{ action: 'free.move', free: true, move: true }])
    expect(hasOption(st.state, 'move')).toBe(true)
    expect(hasOption(st.state, 'end')).toBe(true)
  })

  it('INT-007 a granted free Attack costs no action but is still the unit\'s one Attack action for the turn (CRB p30, M2c review 7)', () => {
    const d = duel(6)
    const ctx = ctxFor(d.state)
    const eff = addEffect(ctx, { source: 'test', seat: 'A', kind: 'freeAction', unitId: d.atk, expires: 'activation', data: { action: 'core.action.attack', weapons: 'ranged', source: 'test' } })
    const s = edit(d.state, (x) => void (x.effects = ctx.state.effects))
    let r = startOf(s, d.atk, new ScriptedRng([5]))
    expect(hasOption(r.state, `free:${eff.id}`)).toBe(true)
    expect(hasOption(r.state, 'attack')).toBe(true)
    r = must(r.state, optionAction(r.state, `free:${eff.id}`))
    expect(r.pending!.kind).toBe('attack.defender')
    r = advance(must(r.state, optionAction(r.state, `unit:${d.def}`)), (p) => p.kind === 'action.choose')
    expect(r.state.activation.current!.performed).toEqual([{ action: 'free.attack', free: true }])
    expect(r.state.activation.current!.actionsLeft).toBe(2)
    expect(hasOption(r.state, 'attack')).toBe(false)
  })

  it('INT-008 extra and fewer actions from effects change the allowance (morale.actionsFor)', () => {
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const ctx = ctxFor(ready(r.state, id, [0, -10]))
    expect(actionsFor(ctx.state, ctx.state.units[id]!)).toBe(2)
    addEffect(ctx, { source: 'x', seat: 'A', kind: 'extraAction', unitId: id, expires: 'activation', data: { n: 1 } })
    expect(actionsFor(ctx.state, ctx.state.units[id]!)).toBe(3)
    addEffect(ctx, { source: 'y', seat: 'A', kind: 'fewerActions', unitId: id, expires: 'activation', data: { n: 2 } })
    expect(actionsFor(ctx.state, ctx.state.units[id]!)).toBe(1)
    const s = edit(ctx.state, () => undefined)
    const st = startOf(ready(s, id, null), id, new ScriptedRng([5]))
    expect(st.state.activation.current!.actionsLeft).toBe(1)
  })

  it('INT-009 Prepared Position grants exactly one Dodge token (setup grants it; the keyword does not grant it again)', () => {
    const bundle = realBundle()
    const A = rosterFromList(bundle.data, 'emp.list.recon-a')
    const B = rosterFromList(bundle.data, 'reb.list.recon-a')
    A.units = [{ unit: 'emp.u.darth-vader-dlots', upgrades: [] }, { unit: 'emp.u.stormtroopers', upgrades: [] }, { unit: 'emp.u.stormtroopers', upgrades: [] }, { unit: 'emp.u.scout-strike-team', upgrades: [] }]
    B.units = [{ unit: 'reb.u.luke-hotr', upgrades: [] }, { unit: 'reb.u.rebel-troopers', upgrades: [] }, { unit: 'reb.u.rebel-troopers', upgrades: [] }, { unit: 'reb.u.commando-strike-team', upgrades: [] }]
    A.commandHand = [...GENERIC_A]
    B.commandHand = [...GENERIC_B]
    const g = createGame({ ruleset: RULESET, format: 'recon', battle: { cards: CLOSE }, armies: { A, B }, blue: 'A', options: { autoDeploy: true } }, 'pp', bundle)
    const r = must(g.state, optionAction(g.state, 'edge:zMax'))
    const pp = Object.values(r.state.units).filter((u) => u.keywords.some((k) => k.id === 'kw.prepared-position'))
    expect(pp.length).toBeGreaterThanOrEqual(2)
    for (const u of pp) {
      expect(u.location).toBe('table')
      expect(u.tokens.dodge).toBe(1)
    }
  })

  it('INT-010 Force Push: the upgrade action is on the menu, the chosen enemy trooper makes a speed-1 Move its opponent controls, then the activation goes on', () => {
    const bundle = realBundle()
    const A = rosterFromList(bundle.data, 'emp.list.recon-a')
    const B = rosterFromList(bundle.data, 'reb.list.recon-a')
    B.units = [{ unit: 'reb.u.luke-hotr', upgrades: ['neu.up.force-push'] }, { unit: 'reb.u.rebel-troopers', upgrades: [] }, { unit: 'reb.u.rebel-troopers', upgrades: [] }]
    A.commandHand = [...GENERIC_A]
    B.commandHand = [...GENERIC_B]
    const g0 = createGame({ ruleset: RULESET, format: 'recon', battle: { cards: CLOSE }, armies: { A, B }, blue: 'A', options: { autoDeploy: true } }, 'fp', bundle)
    const g = must(g0.state, optionAction(g0.state, 'edge:zMax'))
    const first = advance(pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.push' }), (p) => p.kind === 'activation.choose')
    const luke = unitBy(first.state, 'B', 'reb.u.luke-hotr').id
    const target = Object.values(first.state.units).find((u) => u.seat === 'A' && u.rank === 'corps')!.id
    const s = ready(first.state, luke, [0, 0], (x) => {
      Object.values(x.units).filter((u) => u.location === 'table' && u.id !== luke && u.id !== target).forEach((u, i) => place(u, 16, 16 - 3.5 * i))
      place(x.units[target]!, 0, 2.2)
    })
    let r = startOf(s, luke, new ScriptedRng([5]))
    expect(r.state.activation.current!.unitId).toBe(luke)
    const push = r.pending!.options!.find((o) => o.id === 'card:neu.act.force-push')
    expect(push).toBeDefined()
    expect(push!.data).toMatchObject({ free: true })
    r = must(r.state, push!.action)
    // the keyword interpreter may ask which trooper (one candidate: automatic) and then the opponent places the tool
    r = advance(r, (p) => p.kind === 'move.tool')
    expect(r.pending!.kind).toBe('move.tool')
    expect(r.pending!.seat).toBe('B')
    expect(r.pending!.context).toMatchObject({ unitId: target, kind: 'controlled', free: true })
    expect(r.state.effects.some((e) => e.kind === 'controlledMove')).toBe(false)
    r = advance(r, (p) => p.kind === 'action.choose')
    expect(r.pending!.seat).toBe('B')
    expect(r.state.activation.current!.unitId).toBe(luke)
    expect(r.state.activation.current!.actionsLeft).toBe(2)
    expect(r.state.activation.current!.performed.map((p) => p.action)).toEqual(['neu.act.force-push'])
    expect(r.state.units[luke]!.flags.exhausted).toEqual(['neu.up.force-push'])
  })
})
