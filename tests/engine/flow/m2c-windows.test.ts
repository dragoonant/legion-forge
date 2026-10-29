// M2c root cause: the flow's window opener now carries action / moveKind / unitId / eachOwner to the declarative triggers, so
// Agile, Relentless and Reliable fire in a real game. Every test drives `step` only; no window info is injected by hand.
// Also the activation-ledger fixes: one Attack action even when free, card actions once, Withdraw exclusions, Standby timing,
// Panic fixed at the start of the Make Actions step.
import { describe, expect, it } from 'vitest'
import '../../../src/engine'
import type { GameState, StepResult } from '../../../src/engine'
import { actionMenu } from '../../../src/engine/activation'
import { advance, edit, events, hasOption, must, newGame, optionAction, pick, toActivation, unitBy } from './helpers'
import { CLOSE, duelOf, firstTurn, ready, soloOf, startOf } from './m2c-helpers'

const menuOf = (state: GameState) => actionMenu(state, state.units[state.activation.current!.unitId]!)

function doMove(r: StepResult): StepResult {
  const picked = must(r.state, optionAction(r.state, 'move'))
  return advance(picked, (p) => p.kind === 'action.choose')
}

describe('M2c windows carry their context (review 3, 4, 6)', () => {
  it('RVW-04 Agile: a Standard Move made as an action gives the unit 1 Dodge (the move.ended window carries moveKind)', () => {
    const f = firstTurn()
    const s = soloOf(f, 'B', 'reb.u.rebel-troopers', [10, 10])
    let r = startOf(s.state, s.id)
    expect(r.state.units[s.id]!.tokens.dodge ?? 0).toBe(0)
    r = doMove(r)
    expect(r.state.units[s.id]!.tokens.dodge ?? 0).toBe(1)
    expect(events(r, 'KeywordFired').some((e) => e.type === 'KeywordFired' && e.keyword === 'kw.agile')).toBe(true)
  })

  it('RVW-03 Relentless: after Vader\'s Move action the free Attack action is granted (action.resolved carries the core action id)', () => {
    const f = firstTurn()
    const s = soloOf(f, 'A', 'emp.u.darth-vader-dlots', [-10, -10])
    let r = startOf(s.state, s.id)
    expect(r.state.effects.some((e) => e.kind === 'freeAction' && e.source === 'kw.relentless')).toBe(false)
    r = doMove(r)
    const grant = r.state.effects.find((e) => e.kind === 'freeAction' && e.unitId === s.id)
    expect(grant).toBeDefined()
    expect(grant!.data).toMatchObject({ action: 'core.action.attack', source: 'kw.relentless' })
    // an Aim is not a Move action: it grants nothing
    const aimed = startOf(s.state, s.id)
    const after = must(aimed.state, optionAction(aimed.state, 'aim'))
    expect(after.state.effects.some((e) => e.kind === 'freeAction')).toBe(false)
  })

  it('RVW-06 Reliable: Darkness Descends played while Vader is still in reserve gives him 2 surge tokens when the Activation Phase starts', () => {
    const g = newGame({ cards: CLOSE, options: { autoDeploy: true } })
    const undeployed = edit(g.state, (s) => {
      const v = unitBy(s, 'A', 'emp.u.darth-vader-dlots')
      v.location = 'reserve'
    })
    const r = toActivation(pick({ ...g, state: undeployed, pending: undeployed.pending }, { A: 'emp.cc.darkness-descends', B: 'neu.cc.standing-orders' }))
    const vader = unitBy(r.state, 'A', 'emp.u.darth-vader-dlots')
    expect(vader.location).toBe('reserve')
    expect(vader.tokens.surge ?? 0).toBe(2)
  })

  it('RVW-06 Reliable: Vader on the table gets his surge tokens as well', () => {
    const g = newGame({ cards: CLOSE, options: { autoDeploy: true } })
    const r = toActivation(pick(g, { A: 'emp.cc.darkness-descends', B: 'neu.cc.standing-orders' }))
    expect(unitBy(r.state, 'A', 'emp.u.darth-vader-dlots').tokens.surge ?? 0).toBe(2)
  })
})

describe('M2c activation ledger (review 7 to 9, 37)', () => {
  const grant = (state: GameState, unitId: string, data: Record<string, unknown>): GameState =>
    edit(state, (x) => {
      x.effects.push({ id: `e${x.nextEffect++}`, source: 'kw.relentless', seat: x.units[unitId]!.seat, kind: 'freeAction', unitId, expires: 'activation', data: { action: 'core.action.attack', source: 'kw.relentless', ...data } })
    })

  function duelActivation() {
    const f = firstTurn()
    const d = duelOf(f, 'emp.u.stormtroopers', 'reb.u.rebel-troopers', 6)
    return { ...d, r: startOf(d.state, d.atk) }
  }

  it('RVW-07 a granted free Attack counts as the Attack action: withheld after the Attack action unless the grant ignores the limit', () => {
    const d = duelActivation()
    const afterAttack = edit(d.r.state, (x) => {
      x.activation.current!.performed.push({ action: 'attack', free: false })
      x.activation.current!.actionsLeft = 1
    })
    expect(menuOf(grant(afterAttack, d.atk, {})).items.some((i) => i.action === 'free')).toBe(false)
    expect(menuOf(grant(afterAttack, d.atk, { ignoreAttackLimit: true })).items.some((i) => i.action === 'free')).toBe(true)
  })

  it('RVW-07 a free Attack already made blocks the Attack action and Standby for the rest of the activation', () => {
    const d = duelActivation()
    const afterFree = edit(d.r.state, (x) => {
      x.activation.current!.performed.push({ action: 'free.attack', free: true })
    })
    const m = menuOf(afterFree)
    expect(m.items.some((i) => i.action === 'attack')).toBe(false)
    expect(m.withheld.find((w) => w.action === 'attack')?.whyNot).toBe('alreadyUsed')
    expect(m.withheld.find((w) => w.action === 'standby')?.whyNot).toBe('afterAttack')
    // before any attack the same grant is offered
    expect(menuOf(grant(d.r.state, d.atk, {})).items.some((i) => i.action === 'free')).toBe(true)
  })

  it('RVW-08 a card action is made once per activation: Force Choke, Recover, Force Choke is refused (CRB p15, p23)', () => {
    const f = firstTurn()
    const vader = unitBy(f.state, 'A', 'emp.u.darth-vader-dlots').id
    const s = ready(f.state, vader, [-14, -14], (x) => {
      const v = x.units[vader]!
      if (!v.upgrades.includes('neu.up.force-choke')) v.upgrades.push('neu.up.force-choke')
    })
    const r = startOf(s, vader)
    const card = menuOf(r.state).items.find((i) => i.action === 'cardAction' && i.id.includes('force-choke'))
    expect(card).toBeDefined()
    if (!card) return
    const done = edit(r.state, (x) => {
      x.activation.current!.performed.push({ action: String(card.params!.actionId), free: true })
      x.units[vader]!.flags.exhausted = []
    })
    expect(menuOf(done).items.some((i) => i.id === card.id)).toBe(false)
    expect(menuOf(done).withheld.find((w) => w.action === card.id)?.whyNot).toBe('alreadyUsed')
  })

  it('RVW-09 Withdraw is refused after an attack or Standby (Creature and Heavy Troopers may attack and Withdraw)', () => {
    const d = duelActivation()
    const engaged = edit(d.r.state, (x) => {
      x.units[d.atk]!.engagedWith = [d.def]
    })
    expect(menuOf(engaged).items.some((i) => i.action === 'withdraw')).toBe(true)
    const attacked = edit(engaged, (x) => {
      x.activation.current!.performed.push({ action: 'attack', free: false })
    })
    expect(menuOf(attacked).items.some((i) => i.action === 'withdraw')).toBe(false)
    expect(menuOf(attacked).withheld.find((w) => w.action === 'withdraw')?.whyNot).toBe('afterAttack')
    const freeAttacked = edit(engaged, (x) => {
      x.activation.current!.performed.push({ action: 'free.attack', free: true })
    })
    expect(menuOf(freeAttacked).withheld.find((w) => w.action === 'withdraw')?.whyNot).toBe('afterAttack')
    const standby = edit(engaged, (x) => {
      x.activation.current!.performed.push({ action: 'standby', free: false })
    })
    expect(menuOf(standby).withheld.find((w) => w.action === 'withdraw')?.whyNot).toBe('afterStandby')
    // a Heavy Trooper unit keeps both
    const heavy = edit(attacked, (x) => {
      const types = x.data.unitTypes as unknown as Record<string, { flags: Record<string, boolean> }>
      x.data = { ...x.data, unitTypes: { ...types, trooper: { ...types['trooper']!, flags: { ...types['trooper']!.flags, attackAfterWithdraw: true } } } } as unknown as typeof x.data
    })
    expect(menuOf(heavy).items.some((i) => i.action === 'withdraw')).toBe(true)
  })

  it('RVW-37 Panicked is tested when the Make Actions step begins and stays fixed: a unit that panics mid-activation keeps its free actions', () => {
    const d = duelActivation()
    // not Panicked at the start of its Make Actions step ...
    expect(d.r.state.activation.current!.panickedAtStart).toBe(false)
    // ... then it suffers enough suppression to be Panicked: its granted free actions are still offered
    const later = edit(grant(d.r.state, d.atk, {}), (x) => {
      x.units[d.atk]!.suppression = 99
    })
    expect(menuOf(later).items.some((i) => i.action === 'free')).toBe(true)
    // a unit that began Panicked has no free actions
    const began = edit(later, (x) => {
      x.activation.current!.panickedAtStart = true
    })
    expect(menuOf(began).items.some((i) => i.action === 'free')).toBe(false)
  })
})

describe('M2c Standby timing (review 10)', () => {
  it('RVW-10 Standby responses come before the action.resolved effects: a Relentless grant appears only after the Standby window is closed', () => {
    const f = firstTurn()
    const vader = unitBy(f.state, 'A', 'emp.u.darth-vader-dlots').id
    const trooper = unitBy(f.state, 'B', 'reb.u.rebel-troopers', 0).id
    const base = ready(f.state, vader, [-10, -10], (x) => {
      Object.values(x.units).filter((u) => u.location === 'table' && u.id !== vader && u.id !== trooper).forEach((u, i) => place30(u, i))
      // the Rebel Troopers stand 8" from Vader (inside Standby range 2 = 12") with a Standby token
      const t = x.units[trooper]!
      t.minis.forEach((m, k) => (m.pos = { x: -10 + 8 + k * 1.2, y: 0, z: -10 + 8 }))
      t.tokens.standby = 1
      t.location = 'table'
    })
    let r = startOf(base, vader)
    r = must(r.state, optionAction(r.state, 'move'))
    r = advance(r, (p) => p.kind === 'activation.standby' || p.kind === 'action.choose')
    // the move ended: Standby is offered before Relentless can grant anything
    expect(r.pending!.kind).toBe('activation.standby')
    expect(r.state.effects.some((e) => e.kind === 'freeAction')).toBe(false)
    r = must(r.state, { type: 'pass', seat: 'B', decisionId: r.pending!.id, payload: {} })
    // only now does Relentless offer its free Attack
    expect(r.pending!.kind).toBe('keyword.choice')
    expect(r.state.effects.some((e) => e.kind === 'freeAction')).toBe(false)
    r = advance(must(r.state, optionAction(r.state, 'use')), (p) => p.kind === 'action.choose')
    expect(r.state.effects.some((e) => e.kind === 'freeAction' && e.source === 'kw.relentless')).toBe(true)
  })
})

function place30(u: { minis: { pos: { x: number; y: number; z: number } }[] }, i: number): void {
  u.minis.forEach((m, k) => (m.pos = { x: 30 - 4 * Math.floor(i / 6), y: 0, z: -15 + 6 * (i % 6) + k * 1.0 }))
}

void hasOption
