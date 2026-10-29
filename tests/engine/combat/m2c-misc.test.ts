// M2c review findings 30, 32 and 38 (doubtful readings the rulebook settles): Turning the Tide reaches units in reserve, Backup
// is measured for the unit not for one model, Compel's free Move needs the Suppression token it costs.
import { afterEach, describe, expect, it } from 'vitest'
import { backupHits } from '../../../src/engine/query'
import { createCtx } from '../../../src/engine/registry'
import { box } from '../fixtures'
import { choose, game, menu, ok, optionIds, u, unit, uninstallModules } from './harness'
import type { GameState } from '../../../src/engine/types'

afterEach(uninstallModules)

const fire = (s: GameState, window: string, info: Record<string, unknown> = {}) => ok(menu(s, { action: 'fire', window, info, resume: true }))

describe('M2c doubtful readings settled by the rulebook (review 30, 32, 38)', () => {
  it('RVW-30 Turning the Tide gives Inspire 2 to every allied Support and Heavy unit, those still in reserve included', () => {
    const table = unit({ id: 'CS1', seat: 'B', data: 'reb.u.commando-strike-team', at: [[0, 0]] })
    const reserve = unit({ id: 'CS2', seat: 'B', data: 'reb.u.commando-strike-team', at: [[0, 0]], location: 'reserve' })
    const corps = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[4, 0]] })
    const s0 = ok(menu(game([table, reserve, corps]), { action: 'activateCard', seat: 'B', cardId: 'reb.cc.turning-the-tide' })).state
    const r = fire(s0, 'command.ordersIssued')
    const inspired = (id: string) => r.state.effects.some((e) => e.kind === 'keyword' && e.unitId === id && (e.data?.['keyword'] as { id: string }).id === 'kw.inspire')
    expect(inspired('CS1')).toBe(true)
    expect(inspired('CS2')).toBe(true)
    expect(inspired('RT')).toBe(false)
  })

  it('RVW-32 Backup: the defending unit is within 3 of the provider\'s leader with one model and has LOS to it with another', () => {
    // two-figure Commander stand-in: model 1 is close but behind a wall, model 2 sees the provider from further away
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 3], [9, 3]] })
    const provider = unit({ id: 'P', seat: 'A', data: 'emp.u.stormtroopers', at: [[2.5, 3]] })
    const shooter = unit({ id: 'S', seat: 'B', data: 'reb.u.rebel-troopers', at: [[4, 17]] })
    const wall = box('wall', 1.05, 1, 1.35, 5, { heightIn: 6 })
    const s = game([vader, provider, shooter], { pieces: [wall] })
    expect(backupHits(s, u(s, 'S'), u(s, 'V'), 'ranged')).toBe(2)
    // nobody within 3: no Backup
    const far = game([unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 3], [9, 3]] }), unit({ id: 'P', seat: 'A', data: 'emp.u.stormtroopers', at: [[4.5, 8]] }), shooter])
    expect(backupHits(far, u(far, 'S'), u(far, 'V'), 'ranged')).toBe(0)
    // a Suppressed provider gives none
    const sup = game([vader, unit({ id: 'P', seat: 'A', data: 'emp.u.stormtroopers', at: [[2.5, 3]], suppression: 1 }), shooter], { pieces: [wall] })
    expect(backupHits(sup, u(sup, 'S'), u(sup, 'V'), 'ranged')).toBe(0)
  })

  it('RVW-38 Compel: the free Move is paid with the Suppression token; a unit that cannot gain it makes no free Move', () => {
    const vader = unit({ id: 'V', seat: 'A', data: 'emp.u.darth-vader-dlots', at: [[0, 0]] })
    const mk = () => unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[3, 0]], suppression: 1 })
    let r = fire(game([vader, mk()]), 'activation.rallied', { unitId: 'ST' })
    expect(r.pending!.context['keyword']).toBe('kw.compel')
    expect(optionIds(r.state)).toEqual(['accept', 'decline'])
    r = ok(choose(r.state, 'accept'))
    expect(r.state.effects.some((e) => e.kind === 'freeAction' && e.unitId === 'ST')).toBe(true)
    expect(u(r.state, 'ST').suppression).toBe(2)
    // the same offer to a unit that cannot gain suppression right now
    const blocked = game([vader, mk()])
    blocked.effects.push({ id: 'e900', source: 'test', seat: 'A', kind: 'modifier', unitId: 'ST', expires: 'activation', data: { modifier: 'suppressible', op: 'set', value: false } })
    let q = fire(blocked, 'activation.rallied', { unitId: 'ST' })
    q = ok(choose(q.state, 'accept'))
    expect(q.state.effects.some((e) => e.kind === 'freeAction' && e.unitId === 'ST')).toBe(false)
    expect(u(q.state, 'ST').suppression).toBe(1)
    void createCtx
  })
})
