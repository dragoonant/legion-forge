import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateAll } from '../../src/data/validate'
import { CODE_HOOKS, loadBundle } from '../../src/data'
import { armyListProblems, listPoints } from '../../src/data/roster'
import { mutated, NO_SOURCES } from './helpers'

const problems = (manifest: ReturnType<typeof mutated>) => validateAll({ ...NO_SOURCES, manifest }).errors

describe('data bundle (M1)', () => {
  it('validates clean: schemas, ids, references, lists, decks, maps, layouts, prose', () => {
    const r = validateAll({ allowPendingCodes: true })
    expect(r.errors).toEqual([])
    expect(r.records).toBeGreaterThan(150)
  })

  it('holds every slice record of the freeze rule', () => {
    const b = loadBundle()
    expect(Object.keys(b.units).sort()).toEqual([
      'emp.u.darth-vader-dlots', 'emp.u.scout-strike-team', 'emp.u.scout-troopers', 'emp.u.stormtroopers',
      'reb.u.commando-strike-team', 'reb.u.luke-hotr', 'reb.u.rebel-commandos', 'reb.u.rebel-troopers', 'reb.u.wookiee-warriors-ff',
    ])
    expect(Object.keys(b.keywords)).toHaveLength(41) // 40 slice keywords plus Ion
    expect(Object.values(b.battleCards).filter((c) => c.format === 'recon').map((c) => c.type).sort()).toEqual(['advantage', 'advantage', 'advantage', 'objective', 'objective', 'objective', 'secondary', 'secondary', 'secondary'])
    expect(Object.keys(b.maps)).toHaveLength(3)
    expect(Object.keys(b.armyLists).sort()).toEqual(['emp.list.recon-a', 'emp.list.recon-b', 'reb.list.recon-a', 'reb.list.recon-b'])
    expect(Object.values(b.armyLists).map((l) => listPoints(b, l)).sort()).toEqual([508, 549, 566, 588])
    // every named upgrade of 14-armies 2.3 and 3.3 (the character heavy-weapon upgrades are out of slice)
    expect(Object.keys(b.upgrades).filter((id) => id.startsWith('emp.')).length).toBe(10)
    expect(Object.keys(b.upgrades).filter((id) => id.startsWith('reb.')).length).toBe(13)
  })

  it('core numbers: dice faces sum to sides, tool lengths, bands, base size', () => {
    const b = loadBundle()
    expect(b.dice.attack.red.faces).toEqual({ hit: 5, crit: 1, surge: 1, blank: 1 })
    expect(b.dice.defence.white.faces).toEqual({ block: 1, surge: 1, blank: 4 })
    expect(Object.values(b.movementTool.speeds).map((s) => s.segments[0] + s.segments[1])).toEqual([4.5, 7, 9.5])
    expect(b.constants.values.rangeBand).toBe(6)
    expect(b.bases['core.base.small'].diameterMm).toBe(27)
    expect(b.formats.recon).toMatchObject({ maxPoints: 600, table: { x: 36, z: 36 }, rounds: 5, instantWinVp: 12 })
  })

  it('V-01 rejects an unknown property, a bad id and a missing source', () => {
    expect(problems(mutated('armies/empire/units.json', (d) => { d[1].surprise = 1 })).join('\n')).toMatch(/V-01.*additional properties/)
    expect(problems(mutated('armies/empire/units.json', (d) => { d[1].id = 'Emp.U.Bad' })).join('\n')).toMatch(/V-01/)
    expect(problems(mutated('armies/empire/units.json', (d) => { delete d[1].source })).join('\n')).toMatch(/V-01.*source/)
    expect(problems(mutated('armies/empire/units.json', (d) => { d[1].source = { doc: 'EU', kind: 'primary' } })).join('\n')).toMatch(/V-01/)
  })

  it('V-01 flags a JSON file that is in no manifest', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-data-'))
    fs.writeFileSync(path.join(dir, 'stray.json'), '{}')
    const r = validateAll({ sourcesDir: false, dataDir: dir, allowPendingCodes: true })
    expect(r.errors.join('\n')).toMatch(/stray\.json: V-01 JSON file is in no manifest/)
    fs.rmSync(dir, { recursive: true })
  })

  it('V-02 / V-04 / V-09 / V-10: duplicate ids, dangling references, keyword parameters, dice sums', () => {
    expect(problems(mutated('armies/empire/units.json', (d) => { d[1].id = d[2].id })).join('\n')).toMatch(/V-02 duplicate id/)
    expect(problems(mutated('armies/empire/units.json', (d) => { d[1].weapons.push('emp.w.nope') })).join('\n')).toMatch(/V-04 reference emp\.w\.nope does not resolve/)
    expect(problems(mutated('armies/empire/units.json', (d) => { d[1].keywords = [{ id: 'kw.precise' }] })).join('\n')).toMatch(/V-09 kw\.precise needs x/)
    expect(problems(mutated('armies/empire/units.json', (d) => { d[1].keywords = [{ id: 'kw.deflect', x: 2 }] })).join('\n')).toMatch(/V-09 kw\.deflect takes no x/)
    expect(problems(mutated('core/dice.json', (d) => { d.attack.red.faces.blank = 2 })).join('\n')).toMatch(/V-10 attack red die faces sum to 9/)
    expect(problems(mutated('armies/empire/weapons.json', (d) => { d[2].range = { min: 4, max: 2 } })).join('\n')).toMatch(/V-10 range min 4/)
  })

  it('V-11 / V-12: army-list legality (points, ranks, slots, restrictions, detachments, hands)', () => {
    const b = loadBundle()
    const list = structuredClone(b.armyLists['emp.list.recon-a'])
    expect(armyListProblems(b, list)).toEqual([])
    const bad = (change: (l: typeof list) => void) => {
      const l = structuredClone(list)
      change(l)
      return armyListProblems(b, l).join('\n')
    }
    expect(bad((l) => { l.points = 500 })).toMatch(/recomputed sum is 588/)
    expect(bad((l) => { l.units.push({ unit: 'emp.u.stormtroopers', upgrades: [] }, { unit: 'emp.u.stormtroopers', upgrades: [] }, { unit: 'emp.u.stormtroopers', upgrades: [] }) })).toMatch(/corps units/)
    expect(bad((l) => { l.units[1].upgrades.push('emp.up.stormtrooper') })).toMatch(/personnel upgrades but only 1 personnel icons/)
    expect(bad((l) => { l.units[3].upgrades = ['emp.up.dlt19x-sniper'] })).toMatch(/not one of the units this upgrade allows/)
    expect(bad((l) => { l.units[5].upgrades = [] })).toMatch(/Heavy Weapon Team needs a heavy weapon/)
    expect(bad((l) => { l.units.splice(3, 2) })).toMatch(/detachments but only 0 parent/)
    expect(bad((l) => { l.commandHand.pop() })).toMatch(/hand has 6 cards/)
    expect(bad((l) => { l.commandHand[0] = 'emp.cc.coordinated-fire' })).toMatch(/1 cards of 1 pips, needs 2/)
    expect(bad((l) => { l.units.shift() })).toMatch(/commander units|needs emp\.u\.darth-vader-dlots/)
  })

  it('V-05: a playable army refuses {"unimplemented"}, an unplayable one does not', () => {
    const inject = (playable: boolean) =>
      mutated('keywords.json', (d) => { d.find((k: any) => k.id === 'kw.nimble').effects = [{ unimplemented: 'test reason' }] }).map((f) =>
        f.path === 'armies/rebels/faction.json' ? { ...f, data: { ...(f.data as object), playable } } : f)
    expect(problems(inject(true)).join('\n')).toMatch(/kw\.nimble: V-05 reachable from a playable faction or deck but marked unimplemented \(test reason\)/)
    expect(problems(inject(false)).join('\n')).not.toMatch(/kw\.nimble/)
    // Ion is unimplemented but only the out-of-slice MPL-57 uses it, so no playable list reaches it
    expect(loadBundle().keywords['kw.ion'].effects).toEqual([{ unimplemented: expect.any(String) }])
    const playableDeck = mutated('battle/recon/advantages.json', (d) => { d[0].special = [{ unimplemented: 'test reason' }] })
    expect(problems(playableDeck).join('\n')).toMatch(/rec\.adv\.advanced-intel: V-05/)
  })

  it('V-06: pending code hooks pass only while the flag is on; registered ones always pass', () => {
    const names = CODE_HOOKS.map((h) => h.name)
    expect(names).toEqual(['bunkerAssault', 'compel', 'darknessDescends', 'deflect', 'flipCard', 'implacable', 'orderTokenToPool', 'scoringTable', 'sniperTeam', 'vadersMight'])
    const off = validateAll({ sourcesDir: false, dataDir: false, allowPendingCodes: false, registeredCodes: new Set<string>() })
    expect(off.errors.filter((e) => e.includes('V-06'))).toHaveLength(names.length)
    const registered = validateAll({ sourcesDir: false, dataDir: false, registeredCodes: new Set(names) })
    expect(registered.errors).toEqual([])
    expect(registered.warnings.join('\n')).not.toMatch(/V-06/)
  })

  it('V-13 / V-14 / V-15 / V-22: battle decks, maps, layouts', () => {
    expect(problems(mutated('battle/recon/advantages.json', (d) => { d.pop() })).join('\n')).toMatch(/V-13 2 advantage cards/)
    expect(problems(mutated('battle/recon/objectives.json', (d) => { d[0].map = 'rec.map.nope' })).join('\n')).toMatch(/rec\.map\.nope does not resolve|V-13 objective needs/)
    expect(problems(mutated('battle/recon/maps.json', (d) => { d[0].pois[0].at = { x: 0, z: -12.5 } })).join('\n')).toMatch(/V-14 POIs t1 and t2|closer than 2 in/)
    expect(problems(mutated('battle/recon/maps.json', (d) => { d[1].territories.blue = d[1].territories.red })).join('\n')).toMatch(/V-14 a red and a blue territory overlap/)
    expect(problems(mutated('battle/recon/objectives.json', (d) => { d[2].scoring[0].count.tokens.tag = 'nowhere' })).join('\n')).toMatch(/V-14 uses POI tag "nowhere"/)
    expect(problems(mutated('layouts/recon-forest-1.json', (d) => { d.pieces[4].footprint = [{ x: 9, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 7 }, { x: 9, z: 7 }] })).join('\n')).toMatch(/V-22.*b2 sits on impassable piece t5/)
    const wall = (z0: number, z1: number) => [{ x: -18, z: z0 }, { x: 18, z: z0 }, { x: 18, z: z1 }, { x: -18, z: z1 }]
    expect(problems(mutated('layouts/recon-forest-1.json', (d) => { d.pieces.push({ id: 'wall', kind: 'building', footprint: wall(-17.5, -16), heightIn: 7, cover: 'heavy', blocksLos: true, movement: 'impassable', climbable: false }) })).join('\n')).toMatch(/V-15 impassable pieces block the whole red entry edge/)
  })

  it('V-17 / V-19: unknown verbs, windows and tokens are rejected', () => {
    expect(problems(mutated('keywords.json', (d) => { d[0].effects[0].do = [{ explode: {} }] })).join('\n')).toMatch(/V-01.*allowed values/)
    expect(problems(mutated('armies/neutral/upgrades.json', (d) => { d[0].effects[0].grant.action.do[0].chooseUnits.then = [{ explode: {} }] })).join('\n')).toMatch(/V-17 unknown verb explode/)
    expect(problems(mutated('keywords.json', (d) => { d[0].effects[0].trigger.window = 'move.finished' })).join('\n')).toMatch(/V-01/)
    expect(problems(mutated('keywords.json', (d) => { d[0].effects[0].do = [{ gainToken: { token: 'core.token.nope', n: 1 } }] })).join('\n')).toMatch(/V-04 reference core\.token\.nope does not resolve/)
  })

  it('V-25 / V-21: primary sources are required before playable; fan-only values print a warning', () => {
    const r = validateAll({ sourcesDir: false, dataDir: false, allowPendingCodes: true })
    expect(r.warnings.join('\n')).toMatch(/V-21 6 reachable records/)
    const fanOnly = mutated('armies/empire/units.json', (d) => { d[1].source = { doc: 'LHQ', url: 'legionhq2 bundle id ay', kind: 'fan' } })
    expect(problems(fanOnly).join('\n')).toMatch(/emp\.u\.stormtroopers: V-25 no primary source/)
  })
})
