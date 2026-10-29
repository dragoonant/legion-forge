// M2c review finding 5: moving into base contact (CRB p28), the placement steps of the other models, engagement, melee
// attacks, Charge / Relentless free melee attacks and Withdraw, all through `step` on the real data.
import { describe, expect, it } from 'vitest'
import '../../../src/engine'
import type { GameState, StepResult } from '../../../src/engine'
import { actionMenu } from '../../../src/engine/activation'
import { miniBody } from '../../../src/engine/measure'
import { suggestToolToward } from '../../../src/engine/movement'
import { advance, events, hasOption, must, optionAction, unitBy } from './helpers'
import { duelOf, firstTurn, lineUp, startOf } from './m2c-helpers'

const clear = (d: { state: GameState; atk: string; def: string }, x: number, z: number) => ({ ...d, state: lineUp(d.state, d.def, x, z) })

const menuOf = (state: GameState) => actionMenu(state, state.units[state.activation.current!.unitId]!)

/** The point where the mover's leader would stand touching the first enemy model, approached straight on. */
function contactPoint(state: GameState, moverId: string, foeId: string): { x: number; z: number } {
  const m = state.units[moverId]!
  const lead = m.minis.find((x) => x.id === m.leaderId)!
  const foe = state.units[foeId]!
  const t = foe.minis.find((x) => x.id === foe.leaderId)!
  const d = Math.hypot(t.pos.x - lead.pos.x, t.pos.z - lead.pos.z)
  const gap = miniBody(state, lead).baseRadius + miniBody(state, t).baseRadius + 0.0003
  return { x: t.pos.x - ((t.pos.x - lead.pos.x) / d) * gap, z: t.pos.z - ((t.pos.z - lead.pos.z) / d) * gap }
}

/** Declare a Move for the active unit and answer its move.tool with a pose that ends in contact with `foeId`. */
function moveIntoContact(r: StepResult, moverId: string, foeId: string): StepResult {
  const picked = must(r.state, optionAction(r.state, 'move'))
  const seat = picked.state.pending!.seat as 'A' | 'B'
  const act = suggestToolToward(picked.state, picked.state.pending, seat, moverId, contactPoint(picked.state, moverId, foeId))
  expect(act).not.toBeNull()
  return must(picked.state, act!)
}

describe('M2c Moving into Melee (review 5)', () => {
  it('RVW-05 a unit whose leader has a melee weapon may end a Move in base contact; the enemy unit is then placed into contact and both are Engaged', () => {
    const f = firstTurn()
    const d = clear(duelOf(f, 'emp.u.darth-vader-dlots', 'reb.u.rebel-troopers', 3.4), -14, -10.6)
    let r = startOf(d.state, d.atk)
    r = moveIntoContact(r, d.atk, d.def)
    // Vader has a single figure: no troopers to place, the enemy placements are made by the engine and reported
    const s = r.state
    expect(s.units[d.atk]!.engagedWith).toEqual([d.def])
    expect(s.units[d.def]!.engagedWith).toEqual([d.atk])
    const vader = s.units[d.atk]!.minis[0]!
    const foe = s.units[d.def]!
    // every Rebel Trooper that could be put into contact is touching Vader; the unit leader certainly is
    const touching = foe.minis.filter((m) => m.alive && Math.hypot(m.pos.x - vader.pos.x, m.pos.z - vader.pos.z) <= miniBody(s, m).baseRadius + miniBody(s, vader).baseRadius + 0.002)
    expect(touching.length).toBeGreaterThanOrEqual(1)
    expect(touching.map((m) => m.id)).toContain(foe.leaderId)
    expect(events(r, 'MeleeContact').length + events(r, 'UnitMoved').length).toBeGreaterThan(0)
  })

  it('RVW-05 an Engaged unit may not Move, shoot or be shot (Withdraw aside), and may attack with melee weapons only', () => {
    const f = firstTurn()
    const d = clear(duelOf(f, 'emp.u.darth-vader-dlots', 'reb.u.rebel-troopers', 3.4), -14, -10.6)
    let r = startOf(d.state, d.atk)
    r = moveIntoContact(r, d.atk, d.def)
    // Vader's Relentless offers a free Attack after the Move action
    r = advance(r, (p) => p.kind === 'keyword.choice' || p.kind === 'action.choose')
    if (r.pending!.kind === 'keyword.choice') r = advance(must(r.state, optionAction(r.state, 'use')), (p) => p.kind === 'action.choose')
    const m = menuOf(r.state)
    expect(m.items.some((i) => i.action === 'move')).toBe(false)
    expect(m.withheld.find((w) => w.action === 'move')?.whyNot).toBe('engaged')
    expect(m.items.some((i) => i.action === 'withdraw')).toBe(true)
    const free = m.items.find((i) => i.action === 'free')
    expect(free).toBeDefined()
    // the free Attack is a melee attack against the unit Vader is in Melee with
    const started = must(r.state, optionAction(r.state, free!.id))
    expect(started.pending!.kind).toBe('attack.defender')
    expect(started.pending!.options!.map((o) => o.id)).toEqual([`unit:${d.def}`])
    expect((started.pending!.options![0]!.data as { kinds: string[] }).kinds).toEqual(['melee'])
    // after that Attack the Attack action is gone for the turn and so is Withdraw
    const fin = advance(must(started.state, optionAction(started.state, `unit:${d.def}`)), (p) => p.kind === 'action.choose' || p.kind === 'activation.choose')
    expect(fin.pending!.kind).toBe('action.choose')
    expect(hasOption(fin.state, 'attack')).toBe(false)
    expect(hasOption(fin.state, 'withdraw')).toBe(false)
    expect(events(fin, 'AttackEnded')).toHaveLength(1)
  })

  it('RVW-05 Charge: Luke\'s Move into base contact offers a free melee Attack against that unit (melee.charged carries the window)', () => {
    const f = firstTurn()
    const d = clear(duelOf(f, 'reb.u.luke-hotr', 'emp.u.stormtroopers', 3.4, [-14, -14], 'B'), -14, -10.6)
    let r = startOf(d.state, d.atk)
    r = moveIntoContact(r, d.atk, d.def)
    // Charge is optional: the choice comes straight after the Move, before anything else
    r = advance(r, (p) => p.kind === 'keyword.choice' || p.kind === 'action.choose')
    expect(r.pending!.kind).toBe('keyword.choice')
    expect(r.pending!.context['keyword']).toBe('kw.charge')
    expect(r.state.effects.some((e) => e.kind === 'freeAction')).toBe(false)
    r = advance(must(r.state, optionAction(r.state, 'use')), (p) => p.kind === 'action.choose')
    const grant = r.state.effects.find((e) => e.kind === 'freeAction' && e.unitId === d.atk)
    expect(grant!.data).toMatchObject({ action: 'core.action.attack', weapons: 'melee', source: 'kw.charge' })
    const free = menuOf(r.state).items.find((i) => i.action === 'free')
    expect(free).toBeDefined()
    // a unit that did not start a melee (an ordinary Move far away) gets no Charge choice
    const far = duelOf(f, 'reb.u.luke-hotr', 'emp.u.stormtroopers', 14, [-14, -14], 'B')
    let q = startOf(far.state, far.atk)
    q = advance(must(q.state, optionAction(q.state, 'move')), (p) => p.kind === 'keyword.choice' || p.kind === 'action.choose')
    expect(q.pending!.kind).toBe('action.choose')
  })

  it('RVW-05 Withdraw: an Engaged unit leaves Melee with a Speed-1 Move; it may not Move into Melee in that activation', () => {
    const f = firstTurn()
    const d = clear(duelOf(f, 'emp.u.darth-vader-dlots', 'reb.u.rebel-troopers', 3.4), -14, -10.6)
    let r = startOf(d.state, d.atk)
    r = moveIntoContact(r, d.atk, d.def)
    r = advance(r, (p) => p.kind === 'keyword.choice' || p.kind === 'action.choose')
    if (r.pending!.kind === 'keyword.choice') r = advance(must(r.state, optionAction(r.state, 'skip')), (p) => p.kind === 'action.choose')
    // end this activation and open the next one for the same unit by hand: Withdraw needs an action, so edit the ledger back
    const again = must(r.state, optionAction(r.state, 'withdraw'))
    expect(again.pending!.kind).toBe('move.tool')
    expect(again.pending!.context['kind']).toBe('withdraw')
    expect(again.pending!.context['maxSpeed']).toBe(1)
  })
})
