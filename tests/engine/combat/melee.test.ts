// MEL-: moving into melee, engagement, melee attacks and re-placement (R-16).
import { afterEach, describe, expect, it } from 'vitest'
import { canMoveIntoMelee, isEngaged, meleeTargets, planMeleeContact, replaceAfterMelee, unitsInContact, withdrawRules } from '../../../src/engine/melee'
import { engagedUnitIds, checkTarget, poolCandidates } from '../../../src/engine/query'
import { createCtx } from '../../../src/engine/registry'
import { computeEngagement } from '../../../src/engine/measure'
import { game, u, unit, uninstallModules, withUnitDef } from './harness'

afterEach(uninstallModules)

const T = 1.0633 // two 27 mm bases touching (centre distance 1.063")
const stubRng = { int: () => 0, d6: () => 1, serialize: () => null }

describe('MEL melee and engagement', () => {
  it('MEL-001 a unit whose leader has a melee weapon may move into base contact with an enemy', () => {
    const s = game([unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] }), unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[5, 0]] })])
    expect(canMoveIntoMelee(s, u(s, 'V'))).toBe(true)
    expect(canMoveIntoMelee(s, u(s, 'ST'))).toBe(true)
    // a unit card with only ranged weapons gives its leader nothing to charge with
    const def = s.data.units['emp.u.stormtroopers']!
    s.data = { ...s.data, units: { ...s.data.units, 'emp.u.stormtroopers': { ...def, weapons: ['emp.w.e11'] } } } as typeof s.data
    expect(canMoveIntoMelee(s, u(s, 'ST'))).toBe(false)
  })

  it('MEL-002 after the charge the mover places its models into contact, then the enemy leader and the rest', () => {
    const st = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0], [-3, -2], [3, -2], [0, -3]] })
    const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, T], [-4, 5], [4, 5], [0, 7]] })
    const s = game([st, rt])
    const plan = planMeleeContact(s, 'ST', 'RT')
    expect(plan.failed).toEqual([])
    expect(plan.mover.map((p) => p.miniId).sort()).toEqual(['ST.2', 'ST.3', 'ST.4'])
    expect(plan.enemyLeader).toBeNull() // already touched by the charging leader
    expect(plan.enemyRest.map((p) => p.miniId).sort()).toEqual(['RT.2', 'RT.3', 'RT.4'])
    // apply every placement: every model of both units ends in contact with the other unit
    for (const p of plan.mover) Object.assign(u(s, 'ST').minis.find((m) => m.id === p.miniId)!.pos, { x: p.x, z: p.z })
    for (const p of plan.enemyRest) Object.assign(u(s, 'RT').minis.find((m) => m.id === p.miniId)!.pos, { x: p.x, z: p.z })
    expect(unitsInContact(s, u(s, 'ST'), u(s, 'RT'))).toBe(true)
    const eng = computeEngagement(s)
    expect(eng['ST']).toEqual(['RT'])
    for (const m of u(s, 'ST').minis) {
      const single = { ...u(s, 'ST'), minis: [m] }
      expect(unitsInContact(s, single, u(s, 'RT'))).toBe(true)
    }
  })

  it('MEL-002 when the charging leader is not touching the enemy leader, the enemy leader is placed into contact', () => {
    const st = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0], [-3, -2]] })
    const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[6, 6], [0, T]] })
    const s = game([st, rt])
    const plan = planMeleeContact(s, 'ST', 'RT')
    expect(plan.enemyLeader).not.toBeNull()
    expect(plan.enemyLeader!.miniId).toBe('RT.1')
  })

  it('MEL-003 no placement may touch models of two different enemy units', () => {
    const st = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0], [-1.2, -1.2]] })
    const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, T]] })
    const other = unit({ id: 'OT', seat: 'B', data: 'reb.u.rebel-commandos', at: [[-2.2, -0.2], [-2.2, -2.4]] })
    const s = game([st, rt, other])
    const plan = planMeleeContact(s, 'ST', 'RT')
    for (const p of plan.mover) Object.assign(u(s, 'ST').minis.find((m) => m.id === p.miniId)!.pos, { x: p.x, z: p.z })
    // the only unit touched besides the mover's own is RT
    expect(engagedUnitIds(s, u(s, 'ST'))).toEqual(['RT'])
  })

  it('MEL-004 Trooper units in contact are Engaged: neither shoots nor is shot', () => {
    const st = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0], [-1, -3]] })
    const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, T], [3, 6]] })
    const third = unit({ id: 'TH', seat: 'B', data: 'reb.u.rebel-commandos', at: [[10, 0]] })
    const friend = unit({ id: 'F', seat: 'A', data: 'emp.u.stormtroopers', at: [[10, -8]] })
    const s = game([st, rt, third, friend])
    expect(isEngaged(s, u(s, 'ST'))).toBe(true)
    expect(isEngaged(s, u(s, 'RT'))).toBe(true)
    expect(checkTarget(s, 'ST', 'TH')).toMatchObject({ ok: false, reason: 'engaged' })
    expect(checkTarget(s, 'RT', 'F')).toMatchObject({ ok: false, reason: 'engaged' })
    // an unengaged friend cannot shoot an engaged enemy either
    expect(checkTarget(s, 'F', 'RT')).toMatchObject({ ok: false, reason: 'engaged' })
    expect(meleeTargets(s, u(s, 'ST'))).toEqual(['RT'])
  })

  it('MEL-005 every model of an Engaged unit with line of sight may add its melee weapon, without base contact of its own', () => {
    const st = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0], [-1.5, -1], [1.5, -1], [0, -2.5]] })
    const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, T]] })
    const s = game([st, rt])
    const c = poolCandidates(s, 'ST', 'RT', 'melee')
    expect(c.map((x) => x.miniId).sort()).toEqual(['ST.1', 'ST.2', 'ST.3', 'ST.4'])
    expect(c.every((x) => x.weapons.includes('emp.w.bludgeon'))).toBe(true)
  })

  it('MEL-006 a melee pool may only target a unit the attacker is in Melee with', () => {
    const st = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0]] })
    const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, T]] })
    const far = unit({ id: 'FAR', seat: 'B', data: 'reb.u.rebel-troopers', at: [[5, 0]] })
    const s = game([st, rt, far])
    expect(checkTarget(s, 'ST', 'RT', { meleeOnly: true }).kinds).toEqual(['melee'])
    expect(checkTarget(s, 'ST', 'FAR', { meleeOnly: true })).toMatchObject({ ok: false, reason: 'notEngaged' })
  })

  it('MEL-007 Withdraw is a speed-1 Move after which Attack and Standby are withheld', () => {
    const s = game([unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0]] })])
    expect(withdrawRules(s, u(s, 'ST'))).toEqual({ speed: 1, blocksAttack: true, blocksStandby: true, mayMoveIntoMelee: false })
  })

  it('MEL-008 a Creature or Heavy Trooper unit may attack after Withdrawing', () => {
    const s0 = game([unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0]] })])
    const s = withUnitDef(s0, 'emp.u.stormtroopers', { unitType: 'heavy-trooper' })
    expect(withdrawRules(s, u(s, 'ST')).blocksAttack).toBe(false)
  })

  it('MEL-009 a Withdraw cannot end in base contact with an enemy (no move into melee that activation)', () => {
    const s = game([unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, 0]] })])
    expect(withdrawRules(s, u(s, 'ST')).mayMoveIntoMelee).toBe(false)
  })

  it('MEL-010 after a melee attack removes models in contact the attacker re-places into contact, then the defender', () => {
    // Vader touches nothing any more: the defender models that touched him are gone
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 4], [3, 5]] })
    const s = game([vader, rt])
    expect(unitsInContact(s, u(s, 'V'), u(s, 'RT'))).toBe(false)
    const c = createCtx(s, stubRng, null, 0)
    replaceAfterMelee(c, 'V', 'RT')
    expect(unitsInContact(c.state, u(c.state, 'V'), u(c.state, 'RT'))).toBe(true)
    expect(c.events.map((e) => e.type)).toContain('MeleeContact')
    // the leader moved first; the units now stand in melee again
    expect(meleeTargets(c.state, u(c.state, 'V'))).toEqual(['RT'])
  })

  it('MEL-010 a unit that cannot get back into contact stays put', () => {
    // the only enemy model is flush against the table edge behind the mover: nothing to do, nothing breaks
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 0.6]] })
    const s = game([vader, rt])
    const c = createCtx(s, stubRng, null, 0)
    const before = JSON.stringify(u(c.state, 'V').minis)
    replaceAfterMelee(c, 'V', 'RT')
    expect(JSON.stringify(u(c.state, 'V').minis)).toBe(before)
  })
})
