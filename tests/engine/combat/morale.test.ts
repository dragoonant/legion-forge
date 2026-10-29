// SUP-: suppression, panic, courage sources, rally (R-15) and the token rules that ride on them.
import { afterEach, describe, expect, it } from 'vitest'
import { actionsFor, courageSource, isPanicked, isSuppressed, panicRelief, rallyRoll } from '../../../src/engine/morale'
import { createCtx } from '../../../src/engine/registry'
import { panicOdds, rallyOdds } from '../../../src/engine/query'
import { atk, beginAttack, choose, def, eventsOf, game, menu, ok, script, u, unit, uninstallModules, withUnitDef } from './harness'

afterEach(uninstallModules)

const rt = (over: Partial<Parameters<typeof unit>[0]> = {}) => unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 3], [1.5, 3.5]], ...over })
const stubRng = { int: () => 0, d6: () => 1, serialize: () => null }

describe('SUP suppression, panic, courage', () => {
  it('SUP-001 courage 1 with 1 token is Suppressed; with 2 tokens it is Panicked', () => {
    const s = game([rt({ suppression: 1 })])
    expect(isSuppressed(s, u(s, 'RT'))).toBe(true)
    expect(isPanicked(s, u(s, 'RT'))).toBe(false)
    const p = game([rt({ suppression: 2 })])
    expect(isPanicked(p, u(p, 'RT'))).toBe(true)
    expect(isSuppressed(p, u(p, 'RT'))).toBe(true)
    expect(panicOdds(p, 'RT')).toMatchObject({ panicked: true, courage: 1, tokensToPanic: 0 })
  })

  it('SUP-002 rally rolls one white die per token and removes one per block or surge', () => {
    const s = game([rt({ suppression: 3 })])
    const r = ok(menu(s, { action: 'rally', unitId: 'RT' }, script(def('white', 'block', 'surge', 'blank'))))
    expect(u(r.state, 'RT').suppression).toBe(1)
    expect(eventsOf(r, 'Rallied')[0]).toMatchObject({ unitId: 'RT', dice: ['block', 'surge', 'blank'], removed: 2 })
    const none = ok(menu(game([rt()]), { action: 'rally', unitId: 'RT' }))
    expect(eventsOf(none, 'DiceRolled')).toHaveLength(0)
    expect(rallyOdds(s, 'RT')).toMatchObject({ dice: 3, colour: 'white' })
  })

  it('SUP-003 a Panicked unit has no actions and sheds tokens equal to its courage when it made none; Suppressed has one', () => {
    const s = game([rt({ suppression: 2 })])
    expect(actionsFor(s, u(s, 'RT'))).toBe(0)
    const sup = game([rt({ suppression: 1 })])
    expect(actionsFor(sup, u(sup, 'RT'))).toBe(1)
    const fresh = game([rt()])
    expect(actionsFor(fresh, u(fresh, 'RT'))).toBe(2)
    const c = createCtx(s, stubRng, null, 0)
    expect(panicRelief(c, u(c.state, 'RT'))).toBe(1)
    expect(u(c.state, 'RT').suppression).toBe(1)
  })

  it('SUP-004 a courage-1 unit with 2 tokens within range 3 of a higher-courage allied Commander is not Panicked (still Suppressed)', () => {
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[10, 3]] })
    const s = game([rt({ suppression: 2 }), luke])
    expect(isPanicked(s, u(s, 'RT'))).toBe(false)
    expect(isSuppressed(s, u(s, 'RT'))).toBe(true)
    expect(courageSource(s, u(s, 'RT'))).toMatchObject({ courage: 3, sourceUnitId: 'L' })
    // out of range 3 (18") the Commander does not help
    const far = game([rt({ suppression: 2 }), unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[34, 3]] })])
    expect(isPanicked(far, u(far, 'RT'))).toBe(true)
  })

  it('SUP-005 a null-courage Commander within range 3 stops allied units panicking at any token count', () => {
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const st = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[4, 0]], suppression: 9 })
    const s = game([vader, st])
    expect(isPanicked(s, u(s, 'ST'))).toBe(false)
    expect(isSuppressed(s, u(s, 'ST'))).toBe(true)
  })

  it('SUP-006 a null-courage unit (Darth Vader) never gains suppression from a ranged attack', () => {
    const vader = unit({ id: 'V', seat: 'B', data: 'emp.u.darth-vader-dlots', at: [[0, 3]] })
    const shooter = unit({ id: 'R', seat: 'A', data: 'reb.u.rebel-troopers', at: [[0, -5]] })
    let r = beginAttack(game([shooter, vader]), 'R', 'V')
    r = ok(choose(r.state, 'pool:ranged:all', script(atk('black', 'hit'), def('red', 'blank'))))
    expect(u(r.state, 'V').suppression).toBe(0)
    expect(eventsOf(r, 'SuppressionChanged')).toHaveLength(0)
  })

  it('SUP-007 a unit that becomes Panicked drops its Asset', () => {
    const s = game([rt({ suppression: 1 })])
    s.table = { ...s.table, objectives: { a1: { id: 'a1', pos: { x: 0, z: 3 }, tags: [], kind: 'asset', heldBy: 'RT' } } }
    const r = ok(menu(s, { action: 'suppress', unitId: 'RT', n: 1 }))
    expect(eventsOf(r, 'UnitPanicked')).toHaveLength(1)
    expect(r.state.table.objectives['a1']!.heldBy).toBeNull()
    expect(eventsOf(r, 'ObjectiveChanged').some((e) => e.objectiveId === 'a1' && (e.detail as { dropped?: boolean }).dropped === true)).toBe(true)
    expect(u(r.state, 'RT').flags['panicked']).toBe(true)
  })

  it('SUP-008 Suppressed always uses the unit own courage even with a higher-courage Commander nearby', () => {
    const luke = unit({ id: 'L', seat: 'B', data: 'reb.u.luke-hotr', at: [[4, 3]] })
    const s = game([rt({ suppression: 1 }), luke])
    expect(isSuppressed(s, u(s, 'RT'))).toBe(true)
  })

  it('SUP-009 a Suppressed Droid Trooper unit loses no action', () => {
    const base = game([rt({ suppression: 1 })])
    const droid = withUnitDef(base, 'reb.u.rebel-troopers', { unitType: 'droid-trooper' })
    expect(actionsFor(droid, u(droid, 'RT'))).toBe(2)
    expect(isSuppressed(droid, u(droid, 'RT'))).toBe(true)
  })

  it('SUP-010 Indomitable rallies with red defence dice', () => {
    const ww = unit({ id: 'W', seat: 'B', data: 'reb.u.wookiee-warriors-ff', at: [[0, 3]], suppression: 2 })
    const s = game([ww])
    const c = createCtx(s, script(def('red', 'block', 'block')), null, 0)
    const res = rallyRoll(c, u(c.state, 'W'))
    expect(res.removed).toBe(2)
    expect(c.events.find((e) => e.type === 'DiceRolled')).toMatchObject({ die: 'def:red' })
    expect(rallyOdds(s, 'W').colour).toBe('red')
  })

  it('TOK-001 gaining suppression removes a Standby token before any window opens', () => {
    const s = game([rt({ tokens: { standby: 1 } })])
    const r = ok(menu(s, { action: 'suppress', unitId: 'RT', n: 1 }))
    expect(u(r.state, 'RT').tokens['standby'] ?? 0).toBe(0)
    expect(eventsOf(r, 'TokenChanged').find((e) => e.kind === 'standby')).toMatchObject({ from: 1, to: 0 })
  })
})
