// M2c review findings 1, 2 and 33: named-unit command cards order their unit, Sabotaged Communications limits orders, an
// Operative alone has nobody to nominate. All on the real data through `step`.
import { describe, expect, it } from 'vitest'
import { CLOSE, edit, events, must, newGame, optionAction, pick, toActivation, unitBy } from './helpers'

const real = () => newGame({ cards: CLOSE, options: { autoDeploy: true } })

describe('M2c orders (review 1, 2, 33)', () => {
  it('RVW-01 a named-unit card with no further orders still orders its named unit (Implacable / Vader)', () => {
    const r = pick(real(), { A: 'emp.cc.implacable', B: 'neu.cc.standing-orders' })
    const vader = unitBy(r.state, 'A', 'emp.u.darth-vader-dlots')
    const issued = events(r, 'OrderIssued').filter((e) => e.seat === 'A')
    expect(issued.map((e) => (e.type === 'OrderIssued' ? e.unitId : ''))).toEqual([vader.id])
    expect(vader.order.state).toBe('faceUp')
  })

  it('RVW-01 Master of Evil issues three orders: Vader is forced, two more go to units of the commander\'s choice', () => {
    let r = pick(real(), { A: 'emp.cc.master-of-evil', B: 'neu.cc.standing-orders' })
    const vader = unitBy(r.state, 'A', 'emp.u.darth-vader-dlots')
    expect(vader.order.state).toBe('faceUp')
    expect(r.pending!.kind).toBe('command.order')
    expect(r.pending!.options!.map((o) => o.id)).not.toContain(vader.id)
    // Vader's Dodge fires from the real OrderIssued window of the card
    expect(vader.tokens.dodge ?? 0).toBe(1)
    const first = unitBy(r.state, 'A', 'emp.u.scout-troopers', 0)
    r = must(r.state, optionAction(r.state, first.id))
    expect(r.pending!.kind).toBe('command.order')
    const second = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0)
    r = must(r.state, optionAction(r.state, second.id))
    expect(events(r, 'OrderIssued').filter((e) => e.seat === 'A')).toHaveLength(1)
    const all = Object.values(r.state.units).filter((u) => u.seat === 'A' && u.order.state === 'faceUp').length
    expect(all).toBe(3)
  })

  it('RVW-01 Return of the Jedi orders Luke plus two (Luke is not left to the pool)', () => {
    const r = pick(real(), { A: 'neu.cc.standing-orders', B: 'reb.cc.return-of-the-jedi' })
    const luke = unitBy(r.state, 'B', 'reb.u.luke-hotr')
    expect(luke.order.state).toBe('faceUp')
    expect(luke.tokens.dodge ?? 0).toBe(1)
  })

  it('RVW-02 Sabotaged Communications cuts the opponent\'s card to a single order, named units counting', () => {
    // B (1 pip, Sabotaged Communications) is revealed beside A's 3-pip Master of Evil: A may issue only 1 order, and it is Vader's
    const r = toActivation(pick(real(), { A: 'emp.cc.master-of-evil', B: 'reb.cc.sabotaged-communications' }))
    const vader = unitBy(r.state, 'A', 'emp.u.darth-vader-dlots')
    expect(vader.order.state).toBe('faceUp')
    expect(Object.values(r.state.units).filter((u) => u.seat === 'A' && u.order.state === 'faceUp')).toHaveLength(1)
  })

  it('RVW-02 Sabotaged Communications leaves a plain 3-order card with exactly one order', () => {
    const g = newGame({ generic: true, cards: CLOSE, options: { autoDeploy: true } })
    const r = toActivation(pick(g, { A: 'neu.cc.assault', B: 'reb.cc.sabotaged-communications' }))
    expect(Object.values(r.state.units).filter((u) => u.seat === 'A' && u.order.state === 'faceUp')).toHaveLength(1)
  })

  it('RVW-33 an Operative may play a card but, with no Commander unit to nominate, issues no orders (R-4.5 Corrected)', () => {
    const g = newGame({ generic: true, cards: CLOSE, options: { autoDeploy: true } })
    const noCommander = edit(g.state, (s) => {
      for (const u of Object.values(s.units)) {
        if (u.seat === 'A' && u.rank === 'commander') {
          u.location = 'defeated'
          u.minis.forEach((m) => (m.alive = false))
        }
      }
      unitBy(s, 'A', 'emp.u.scout-troopers').rank = 'operative'
    })
    expect(Object.values(noCommander.units).some((u) => u.seat === 'A' && u.rank === 'operative' && u.location !== 'defeated')).toBe(true)
    const r = toActivation(pick({ ...g, state: noCommander, pending: noCommander.pending }, { A: 'neu.cc.assault', B: 'neu.cc.standing-orders' }))
    expect(Object.values(r.state.units).filter((u) => u.seat === 'A' && u.order.state === 'faceUp')).toHaveLength(0)
  })
})
