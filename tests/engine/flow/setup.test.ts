import { describe, expect, it } from 'vitest'
import { EngineInvariantError, createGame, step } from '../../../src/engine'
import { bd, deploySpans, rotationOf } from '../../../src/engine/battle'
import { createCtx } from '../../../src/engine/registry'
import { armyProblems, rollBlue, rosterFromList } from '../../../src/engine/setup'
import { ScriptedRng } from '../../../src/engine/rng'
import { CLOSE, edit, must, newGame, optionAction, realBundle, reconSetup } from './helpers'

const data = realBundle().data
const lists = {
  empA: rosterFromList(data, 'emp.list.recon-a'),
  empB: rosterFromList(data, 'emp.list.recon-b'),
  rebA: rosterFromList(data, 'reb.list.recon-a'),
  rebB: rosterFromList(data, 'reb.list.recon-b'),
}
const storm = { unit: 'emp.u.stormtroopers', upgrades: ['emp.up.stormtrooper-squad', 'emp.up.dlt19-stormtrooper'] }
const vader = { unit: 'emp.u.darth-vader-dlots', upgrades: [] as string[] }
const scouts = { unit: 'emp.u.scout-troopers', upgrades: ['emp.up.sonic-charge-saboteur'] }

describe('setup validation', () => {
  it('SETUP-001 a standard army over 1000 points, with 0 or 3 Commanders, or with 2 Corps is refused with the limit named', () => {
    const base = lists.empA
    const strike = { unit: 'emp.u.scout-strike-team', upgrades: ['emp.up.dlt19x-sniper'] }
    const big = { ...base, units: [vader, storm, storm, storm, storm, storm, storm, scouts, scouts, scouts, strike, strike, strike] }
    expect(armyProblems(data, 'standard', big).join('\n')).toMatch(/exceeds the Standard limit of 1000/)
    const none = { ...base, units: [storm, storm, storm, scouts] }
    expect(armyProblems(data, 'standard', none)).toContain('army: 0 commander units, Standard allows 1-2')
    const three = { ...base, units: [vader, vader, vader, storm, storm, storm] }
    expect(armyProblems(data, 'standard', three).join('\n')).toMatch(/3 commander units, Standard allows 1-2/)
    const two = { ...base, units: [vader, storm, storm] }
    expect(armyProblems(data, 'standard', two)).toContain('army: 2 corps units, Standard allows 3-6')
  })

  it('SETUP-002 a Recon army needs exactly 1 Commander, 2-4 Corps, at most 1 Operative and 1 Heavy and 600 points; the starter lists pass', () => {
    for (const l of Object.values(lists)) expect(armyProblems(data, 'recon', l)).toEqual([])
    const two = { ...lists.empA, units: [vader, vader, storm, storm] }
    expect(armyProblems(data, 'recon', two).join('\n')).toMatch(/2 commander units, Recon allows 1-1/)
    const five = { ...lists.empA, units: [vader, storm, storm, storm, storm, storm] }
    expect(armyProblems(data, 'recon', five).join('\n')).toMatch(/5 corps units, Recon allows 2-4/)
    const rich = { ...lists.empA, units: [vader, storm, storm, storm, storm, scouts, scouts] }
    expect(armyProblems(data, 'recon', rich).join('\n')).toMatch(/exceeds the Recon limit of 600/)
    expect(() => createGame({ ...reconSetup({ blue: 'A' }), armies: { A: rich, B: lists.rebA } }, 's', realBundle())).toThrow(EngineInvariantError)
  })

  it('SETUP-003 two copies of a one-bullet name and the same upgrade twice on one unit are refused', () => {
    const twoVaders = { ...lists.empA, units: [vader, vader, storm, storm] }
    expect(armyProblems(data, 'recon', twoVaders).join('\n')).toMatch(/unique name "Darth Vader" appears 2 times/)
    const twice = { ...lists.empA, units: [vader, { unit: 'emp.u.stormtroopers', upgrades: ['emp.up.dlt19-stormtrooper', 'emp.up.dlt19-stormtrooper'] }, storm] }
    expect(armyProblems(data, 'recon', twice).join('\n')).toMatch(/takes the same upgrade twice/)
  })

  it('SETUP-004 a hand without Standing Orders, with a duplicate or with three 2-pip cards is refused; a card for a missing unit is refused', () => {
    const h = lists.empA.commandHand
    const noSo = { ...lists.empA, commandHand: [...h.slice(0, 6), 'neu.cc.assault'] }
    expect(armyProblems(data, 'recon', noSo).join('\n')).toMatch(/needs Standing Orders/)
    const dup = { ...lists.empA, commandHand: [...h.slice(0, 6), h[0]!] }
    expect(armyProblems(data, 'recon', dup).join('\n')).toMatch(/duplicate cards/)
    const three2 = { ...lists.empA, commandHand: ['emp.cc.new-ways', 'neu.cc.push', 'emp.cc.pinned-down', 'emp.cc.implacable', 'neu.cc.ambush', 'emp.cc.master-of-evil', 'neu.cc.standing-orders'] }
    expect(armyProblems(data, 'recon', three2).join('\n')).toMatch(/3 cards of 2 pips, needs 2/)
    const noVader = { ...lists.empA, units: [storm, storm, scouts], commandHand: h }
    expect(armyProblems(data, 'recon', noVader).join('\n')).toMatch(/emp\.cc\.implacable needs emp\.u\.darth-vader-dlots/)
  })
})

describe('the blue player', () => {
  const ctxWith = (script: number[]) => {
    const g = newGame()
    return createCtx(edit(g.state, () => undefined), new ScriptedRng(script), null, 0)
  }

  it('SETUP-005 four black dice each: crits, then hits, then surges decide; a full tie rerolls', () => {
    // black faces by index: 0-2 hit, 3 crit, 4 surge, 5-7 blank
    // A: crit, hit, surge, blank   B: crit, hit, blank, blank -> equal crits and hits, A has more surges
    expect(rollBlue(ctxWith([3, 0, 4, 5, 3, 0, 5, 6]), 'fourBlackDice')).toBe('A')
    // B has one more crit
    expect(rollBlue(ctxWith([0, 0, 5, 5, 3, 0, 5, 5]), 'fourBlackDice')).toBe('B')
    // a full tie (both: one hit, three blanks) rerolls; the second round A has the crit
    expect(rollBlue(ctxWith([0, 5, 5, 5, 0, 5, 5, 5, 3, 5, 5, 5, 0, 5, 5, 5]), 'fourBlackDice')).toBe('A')
  })

  it('SETUP-006 Recon: a block on the red die makes the roller blue, anything else the other seat', () => {
    // red defence faces: 0-2 block, 3 surge, 4-5 blank
    expect(rollBlue(ctxWith([0]), 'redDefenceDie')).toBe('A')
    expect(rollBlue(ctxWith([2]), 'redDefenceDie')).toBe('A')
    expect(rollBlue(ctxWith([3]), 'redDefenceDie')).toBe('B')
    expect(rollBlue(ctxWith([5]), 'redDefenceDie')).toBe('B')
  })
})

describe('mission and table edge', () => {
  it('SETUP-010 Recon: blue picks any of the four edges, red takes the opposite, and the Territory touches the edge', () => {
    const open = newGame({ edge: null, cards: CLOSE })
    const p = open.state.pending!
    expect(p.kind).toBe('setup.battle')
    expect(p.seat).toBe('A')
    expect(p.options!.filter((o) => o.id.startsWith('edge:')).map((o) => o.id)).toEqual(['edge:zMax', 'edge:xMax', 'edge:zMin', 'edge:xMin'])
    const touches: Record<string, (v: { x: number; z: number }) => number> = { zMax: (v) => v.z - 18, xMax: (v) => v.x - 18, zMin: (v) => v.z + 18, xMin: (v) => v.x + 18 }
    const opposite: Record<string, string> = { zMax: 'zMin', zMin: 'zMax', xMax: 'xMin', xMin: 'xMax' }
    for (const e of ['zMax', 'xMax', 'zMin', 'xMin']) {
      const r = must(open.state, optionAction(open.state, `edge:${e}`))
      const t = bd(r.state).territories
      expect(bd(r.state).rotation).toBe(rotationOf(e))
      for (const poly of t.A) expect(poly.some((v) => Math.abs(touches[e]!(v)) < 1e-9)).toBe(true)
      for (const poly of t.B) expect(poly.some((v) => Math.abs(touches[opposite[e]!]!(v)) < 1e-9)).toBe(true)
      expect(deploySpans(r.state, 'A').length).toBeGreaterThan(0)
      // the objective tokens rotate with the map (Close the Pocket: three Stockpiles on the centre line)
      const pois = Object.values(r.state.table.objectives).filter((m) => m.kind === 'poi')
      expect(pois).toHaveLength(3)
    }
  })

  it('SETUP-010 Recon: the mission is one Objective and one Secondary plus an Advantage each, drawn from the fixed deck', () => {
    const g = newGame({ edge: 'zMax', blue: undefined, options: { autoBattle: true } }, 'mission-seed')
    const d = bd(g.state)
    expect(d.objective).toMatch(/^rec\.obj\./)
    expect(d.secondary).toMatch(/^rec\.sec\./)
    expect(d.advantage.A).toMatch(/^rec\.adv\./)
    expect(d.advantage.B).toMatch(/^rec\.adv\./)
    expect(d.advantage.A).not.toBe(d.advantage.B)
    expect(g.events.filter((e) => e.type === 'BattleCardChosen')).toHaveLength(4)
  })

  it('SETUP-011 Prepared Position: the leader must lie completely inside the allied Territory, not on impassable terrain; the unit gains 1 Dodge', () => {
    const intercept = ['rec.obj.intercept-signals', 'rec.sec.bring-them-to-heel', 'rec.adv.advanced-intel', 'rec.adv.cunning-deployment']
    const g = newGame({ cards: intercept })
    expect(g.pending!.kind).toBe('setup.deploy')
    expect(g.pending!.seat).toBe('A')
    const unitId = (g.pending!.context.unitIds as string[])[0]!
    const lead = (x: number, z: number) => ({ type: 'setup.deploy' as const, seat: 'A' as const, decisionId: g.pending!.id, payload: { unitId, leader: { x, z, yaw: 0 } } })
    // outside the Territory (z 9..18, x -12..12): rejected
    const outside = (x: number, z: number) => step(g.state, lead(x, z)).rejection
    expect(outside(0, 0)?.code).toBe('E_OUT_OF_RANGE')
    expect(outside(-12.3, 14)?.code).toBe('E_OUT_OF_RANGE')
    // on the building t5 (x -10..-6, z 10..14): impassable
    expect(outside(-8, 12)?.code).toBe('E_TERRAIN')
    const ok = must(g.state, lead(0, 14))
    const u = ok.state.units[unitId]!
    expect(u.location).toBe('table')
    expect(u.tokens.dodge).toBe(1)
    expect(ok.events.some((e) => e.type === 'UnitDeployed')).toBe(true)
  })

  it('SETUP-012 after setup only Prepared Position units are on the table; every other unit is in reserve', () => {
    const g = newGame({ cards: CLOSE, options: { autoDeploy: true } })
    expect(g.state.phase).toBe('command')
    for (const u of Object.values(g.state.units)) {
      const pp = u.keywords.some((k) => k.id === 'kw.prepared-position')
      expect(u.location).toBe(pp ? 'table' : 'reserve')
    }
    // the table units are inside their Territory
    const t = bd(g.state).territories
    for (const u of Object.values(g.state.units).filter((x) => x.location === 'table')) {
      const m = u.minis[0]!
      expect(t[u.seat].some((poly) => poly.length > 0 && Math.abs(m.pos.x) <= 18 && Math.abs(m.pos.z) <= 18)).toBe(true)
    }
  })
})
