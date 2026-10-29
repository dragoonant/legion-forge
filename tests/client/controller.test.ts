// Click gating (KB gotcha): a unit takes a click only when the open decision names it; a decision of another kind offers no click
// targets; the options for a unit are the ones that name it.
import { describe, expect, it } from 'vitest'
import { clickableUnits, optionForUnit, optionsForUnit, GROUND_KINDS, UNIT_CLICK_KINDS } from '../../src/client/interaction/controller'
import { playGame } from './fixtures'

describe('click gating', () => {
  it('activation.choose names the units with a face-up order; the pool draw names nobody', () => {
    const played = playGame('gate-1', (_s, p) => p?.kind === 'activation.choose')
    const p = played.pending!
    const seat = p.seat as 'A' | 'B'
    const units = clickableUnits(p, seat)
    for (const o of p.options!) {
      const id = (o.action as { payload?: { unitId?: string } }).payload?.unitId
      if (id) {
        expect(units.has(id)).toBe(true)
        expect(optionForUnit(p, id, seat)).not.toBeNull()
        expect(optionsForUnit(p, id).length).toBeGreaterThan(0)
      }
    }
    expect(units.size).toBe(p.options!.filter((o) => (o.action as { payload?: { unitId?: string } }).payload?.unitId).length)
  })

  it('the other seat has no click targets', () => {
    const played = playGame('gate-2', (_s, p) => p?.kind === 'activation.choose')
    const p = played.pending!
    const other = p.seat === 'A' ? 'B' : 'A'
    expect(clickableUnits(p, other).size).toBe(0)
    expect(clickableUnits(p, null).size).toBe(0)
    expect(clickableUnits(null, 'A').size).toBe(0)
  })

  it('decisions that are answered on the table or by a menu give no unit clicks', () => {
    for (const kind of ['action.choose', 'command.pick']) {
      const played = playGame(`gate-${kind}`, (_s, p) => p?.kind === kind)
      expect(clickableUnits(played.pending!, played.pending!.seat === 'all' ? 'A' : played.pending!.seat).size).toBe(0)
    }
    for (const k of GROUND_KINDS) expect(UNIT_CLICK_KINDS).not.toContain(k)
  })
})
