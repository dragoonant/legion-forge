// M2c review findings 11 to 14 (units built from upgrades), on the real slice data through setup.buildUnit.
import { describe, expect, it } from 'vitest'
import '../../../src/engine'
import { buildUnit } from '../../../src/engine/setup'
import { miniWeapons, modValues, unitEffects, unitKeywords, weaponDef, weaponTypes } from '../../../src/engine/keywords'
import { usableWeapons } from '../../../src/engine/query'
import { edit, firstTurnState } from './m2c-fixtures'
import { realBundle } from '../flow/helpers'

const data = () => realBundle().data

describe('M2c units built from upgrades (review 11 to 14)', () => {
  it('RVW-11 the figure a Heavy Weapon Team\'s heavy weapon card adds is the unit leader, not the spotter', () => {
    const u = buildUnit(data(), 'A', 0, { unit: 'emp.u.scout-strike-team', upgrades: ['emp.up.dlt19x-sniper'] })
    const lead = u.minis.find((m) => m.id === u.leaderId)!
    expect(lead.upgradeId).toBe('emp.up.dlt19x-sniper')
    expect(lead.isLeader).toBe(true)
    expect(u.minis.filter((m) => m.isLeader)).toHaveLength(1)
    // the same holds for the Rebel Commando Strike Team
    const r = buildUnit(data(), 'B', 0, { unit: 'reb.u.commando-strike-team', upgrades: ['reb.up.dh447-sniper'] })
    expect(r.minis.find((m) => m.id === r.leaderId)!.upgradeId).toBe('reb.up.dh447-sniper')
    // an ordinary unit keeps its first figure as leader
    const s = buildUnit(data(), 'A', 1, { unit: 'emp.u.stormtroopers', upgrades: ['emp.up.dlt19-stormtrooper'] })
    expect(s.leaderId).toBe(s.minis[0]!.id)
  })

  it('RVW-12 a figure added by an upgrade may use the upgrade weapon and the weapons on the unit card', () => {
    const state = firstTurnState()
    const u = Object.values(state.units).find((x) => x.unitTypeId === 'emp.u.stormtroopers' && x.upgrades.includes('emp.up.dlt19-stormtrooper'))!
    const heavy = u.minis.find((m) => m.upgradeId === 'emp.up.dlt19-stormtrooper')!
    const ws = miniWeapons(state, u, heavy.id)
    expect(ws).toContain('emp.w.dlt19')
    expect(ws).toContain('emp.w.e11')
    expect(ws).toContain('emp.w.bludgeon')
    // a plain figure keeps the card weapons only
    const plain = u.minis.find((m) => !m.upgradeId)!
    expect(miniWeapons(state, u, plain.id)).toEqual(['emp.w.bludgeon', 'emp.w.e11'])
  })

  it('RVW-12 the Battle Shield Wookiee may use the Wookiee Warriors\' own weapons next to the shield', () => {
    const state = firstTurnState({ b: 'reb.list.recon-b' })
    const u = Object.values(state.units).find((x) => x.unitTypeId === 'reb.u.wookiee-warriors-ff')!
    const shield = u.minis.find((m) => m.upgradeId === 'reb.up.battle-shield-wookiee')!
    const ws = miniWeapons(state, u, shield.id)
    expect(ws).toContain('reb.w.ryyk-blade')
    expect(ws).toContain('reb.w.kashyyyk-pistol')
    expect(ws.some((w) => w.startsWith('reb.w.battle-shield'))).toBe(true)
  })

  it('RVW-13 Sonic Charge and Proton Charge have both icons: melee and range 1, chosen when added to a pool', () => {
    for (const w of ['emp.w.sonic-charge', 'reb.w.proton-charge']) expect(weaponTypes(weaponDef(firstTurnState(), w)).sort()).toEqual(['melee', 'ranged'])
    expect(weaponTypes(weaponDef(firstTurnState(), 'emp.w.ec17'))).toEqual(['ranged'])
    expect(weaponTypes(weaponDef(firstTurnState(), 'emp.w.bludgeon'))).toEqual(['melee'])
    const state = firstTurnState()
    const u = Object.values(state.units).find((x) => x.unitTypeId === 'emp.u.scout-troopers' && x.upgrades.includes('emp.up.sonic-charge-saboteur'))!
    const sab = u.minis.find((m) => m.upgradeId === 'emp.up.sonic-charge-saboteur')!
    expect(usableWeapons(state, u, sab, 'melee', 0)).toContain('emp.w.sonic-charge')
    expect(usableWeapons(state, u, sab, 'ranged', 5)).toContain('emp.w.sonic-charge')
    // out of its range-1 reach it is not a ranged choice
    expect(usableWeapons(state, u, sab, 'ranged', 15)).not.toContain('emp.w.sonic-charge')
  })

  it('RVW-14 when every figure an upgrade added is defeated the unit loses that card\'s rules (Battle Shield armour, a Captain\'s ability)', () => {
    const state = firstTurnState({ b: 'reb.list.recon-b' })
    const wook = Object.values(state.units).find((x) => x.unitTypeId === 'reb.u.wookiee-warriors-ff')!
    expect(unitKeywords(state, wook).map((k) => k.id)).toContain('kw.armor')
    const dead = edit(state, (s) => {
      for (const m of s.units[wook.id]!.minis) if (m.upgradeId === 'reb.up.battle-shield-wookiee') m.alive = false
    })
    const after = unitKeywords(dead, dead.units[wook.id]!).map((k) => k.id)
    expect(after).not.toContain('kw.armor')
    expect(after).toContain('kw.charge') // the unit card\'s own keywords stay
    expect(modValues(dead, dead.units[wook.id]!, 'moveSpeed')).toHaveLength(0)
    expect(modValues(state, wook, 'moveSpeed')).toHaveLength(1)

    // a Captain's exhaust effect and a Squad card's persistent rules
    const withCaptain = edit(state, (s) => {
      s.units['X1'] = buildUnit(data(), 'A', 91, { id: 'X1', unit: 'emp.u.stormtroopers', upgrades: ['emp.up.stormtrooper-captain', 'emp.up.stormtrooper-squad'] })
    })
    const x1 = withCaptain.units['X1']!
    expect(unitEffects(withCaptain, x1).some((e) => e.ref.id === 'emp.up.stormtrooper-captain')).toBe(true)
    const killed = edit(withCaptain, (s) => {
      for (const m of s.units['X1']!.minis) if (m.upgradeId === 'emp.up.stormtrooper-captain') m.alive = false
      for (const m of s.units['X1']!.minis) if (m.upgradeId === 'emp.up.stormtrooper-squad') m.alive = false
    })
    const x2 = killed.units['X1']!
    expect(unitEffects(killed, x2).some((e) => e.ref.id === 'emp.up.stormtrooper-captain')).toBe(false)
    // the Squad card keeps its Indomitable by its own text even with every squad figure gone
    expect(unitKeywords(killed, x2).map((k) => k.id)).toContain('kw.indomitable')
  })
})
