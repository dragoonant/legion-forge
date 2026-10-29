// Token chips and wound pips over a unit: the pure view-model of figures/UnitPips.tsx.
import { describe, expect, it } from 'vitest'
import type { Unit } from '../../src/engine'
import { unitChips, woundPips } from '../../src/client/figures/UnitPips'
import { lookFor } from '../../src/client/figures/Procedural'
import { playGame } from './fixtures'

describe('unit chips and pips', () => {
  const played = playGame('pips', (s) => s.round >= 2)
  const state = played.state
  const units = Object.values(state.units)

  it('a unit with a face-up order shows an order chip with its rank name; tokens and suppression get chips', () => {
    const u = structuredClone(units.find((x) => x.location === 'table')!) as Unit
    u.order = { state: 'faceUp' }
    u.tokens = { aim: 2, dodge: 1 }
    u.suppression = 1
    const chips = unitChips(state, u)
    const ids = chips.map((c) => c.id)
    expect(ids).toContain('order:faceUp')
    expect(ids).toContain('token:aim')
    expect(ids).toContain('token:dodge')
    expect(ids).toContain('supp')
    expect(chips.find((c) => c.id === 'token:aim')!.label).toMatch(/x2/)
    expect(chips.find((c) => c.id === 'order:faceUp')!.help).toMatch(/face-up order/)
  })

  it('a spent order and a unit without tokens give the quiet chips', () => {
    const u = structuredClone(units[0]!) as Unit
    u.order = { state: 'none' }
    u.tokens = {}
    u.suppression = 0
    expect(unitChips(state, u).filter((c) => !c.id.startsWith('order'))).toHaveLength(0)
  })

  it('a single-model unit shows its wounds left; a squad shows models left', () => {
    const single = units.find((u) => u.minis.length === 1)!
    const squad = units.find((u) => u.minis.length > 1)!
    const p1 = woundPips(single)
    expect(p1.total).toBe(single.minis[0]!.maxWounds)
    expect(p1.left).toBe(single.minis[0]!.maxWounds - single.minis[0]!.wounds)
    const p2 = woundPips(squad)
    expect(p2.total).toBe(squad.minis.length)
    expect(p2.models.left).toBe(squad.minis.filter((m) => m.alive).length)
  })

  it('wounds taken lower the pips', () => {
    const single = structuredClone(units.find((u) => u.minis.length === 1)!) as Unit
    single.minis[0]!.wounds = 3
    expect(woundPips(single).left).toBe(single.minis[0]!.maxWounds - 3)
  })

  it('every unit in the data gets a look: its archetype, else its faction, else the neutral one', () => {
    for (const u of units) {
      const d = state.data.units[u.unitTypeId] as { figure?: { archetype?: string }; faction?: string }
      const look = lookFor(d.figure?.archetype, d.faction)
      expect(look.major).toMatch(/^#[0-9a-f]{6}$/)
      expect(look.tall).toBeGreaterThan(0)
    }
    expect(lookFor('unknown-archetype', 'unknown-faction').major).toMatch(/^#/)
  })
})
