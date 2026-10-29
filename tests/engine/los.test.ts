import { describe, expect, it } from 'vitest'
import { coverFor, hasLos, improveCover, samplePoints, scanRays, type CoverOptions } from '../../src/engine/los'
import { poiPiece } from '../../src/engine/table'
import { body, box, CONSTANTS, SMALL_H, SMALL_R, tableOf } from './fixtures'

const OPTS: CoverOptions = { suppressed: false, barricadeCover: true, constants: CONSTANTS }

describe('line of sight', () => {
  it('LOS-001 a small-base silhouette is a cylinder of base radius and 1.69" height, sampled on rims and axis', () => {
    const pts = samplePoints(body('a', 4, 5, 2))
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(2 + SMALL_H, 9)
    expect(Math.min(...pts.map((p) => p.y))).toBe(2)
    const rim = pts.filter((p) => !(p.x === 4 && p.z === 5))
    for (const p of rim) expect(Math.hypot(p.x - 4, p.z - 5)).toBeCloseTo(SMALL_R, 9)
    expect(pts.length).toBe(2 * 8 + 2)
    // a large (Creature, Heavy) cylinder is just another height as data
    const tall = { ...body('b', 0, 0), height: 2.7 }
    expect(Math.max(...samplePoints(tall).map((p) => p.y))).toBeCloseTo(2.7, 9)
  })

  it('LOS-002 a target whose silhouette top rim alone is visible over a wall is in LoS', () => {
    const t = tableOf([box('wall', -3, 4, 3, 5, { heightIn: 1.5 })])
    const r = scanRays(t, body('a', 0, 0), body('d', 0, 9))
    expect(r.visible).toBe(true)
    expect(r.clear).toBeGreaterThan(0)
    expect(r.clear).toBeLessThan(r.total)
    expect(hasLos(t, body('a', 0, 0), body('d', 0, 9))).toBe(true)
  })

  it('LOS-004 a blocking prism between two models with every ray intersected gives no LoS', () => {
    const t = tableOf([box('tower', -3, 4, 3, 5, { heightIn: 4 })])
    const r = scanRays(t, body('a', 0, 0), body('d', 0, 9))
    expect(r.visible).toBe(false)
    expect(r.clear).toBe(0)
    expect(r.firstBlocker).toEqual({ tower: r.total })
    // terrain that does not block LoS never does
    expect(hasLos(tableOf([box('rail', -3, 4, 3, 5, { heightIn: 4, blocksLos: false })]), body('a', 0, 0), body('d', 0, 9))).toBe(true)
  })

  it('LOS-005 area terrain blocks LoS across its whole footprint up to its top', () => {
    const wood = box('wood', -4, 2, 4, 8, { kind: 'area', heightIn: 3, cover: 'light' })
    const t = tableOf([wood])
    expect(hasLos(t, body('a', 0, 0), body('d', 0, 10))).toBe(false)
    // a ray over the top (the model on a 3" roof elsewhere sees across) is clear
    expect(hasLos(t, body('a', 0, 0, 3), body('d', 0, 10, 3))).toBe(true)
  })

  it('LOS-006 a model overlapping area terrain ignores that piece for its own rays and is obscured by it', () => {
    const wood = box('wood', -4, 2, 4, 8, { kind: 'area', heightIn: 3, cover: 'light' })
    const t = tableOf([wood])
    const inside = body('d', 0, 5)
    expect(hasLos(t, body('a', 0, 0), inside)).toBe(true)
    expect(hasLos(t, inside, body('a', 0, 0))).toBe(true)
    const cover = coverFor(t, body('a', 0, 0), [inside], OPTS)
    expect(cover.minis[0]).toMatchObject({ visible: true, obscured: true, obscuredBy: ['wood'], value: 'light' })
    expect(cover.cover).toBe('light')
  })

  it('LOS-008 the LoS verdict and rays of the cover check are the same scan the attack step uses', () => {
    const t = tableOf([box('wall', -1, 4, 1, 5, { heightIn: 1.2 })])
    const a = body('a', 0, 0)
    const d = body('d', 0, 9)
    const scan = scanRays(t, a, d, { keepRays: true })
    const cover = coverFor(t, a, [d], { ...OPTS, keepRays: true })
    expect(cover.minis[0]!.visible).toBe(scan.visible)
    expect(cover.minis[0]!.clear).toBe(scan.clear)
    expect(cover.minis[0]!.rays).toEqual(scan.rays)
    expect(cover.anyVisible).toBe(hasLos(t, a, d))
  })
})

describe('cover', () => {
  // low wall: blocks the low rays only, so models stay visible
  const wall = (id = 'wall', over = {}) => box(id, -3, 4, 3, 5, { heightIn: 1.2, ...over })

  it('COVER-001 a defender with one blocked ray by terrain within 3" of it is obscured', () => {
    const t = tableOf([wall()])
    const r = coverFor(t, body('a', 0, 0), [body('d', 0, 7)], OPTS)
    expect(r.minis[0]).toMatchObject({ visible: true, obscured: true, obscuredBy: ['wall'] })
    expect(r.cover).toBe('light')
  })

  it('COVER-002 the same blocking terrain 3.5" from the defending model does not obscure it', () => {
    const t = tableOf([wall()])
    // wall far edge z=5; defender edge at 5 + 3.5
    const r = coverFor(t, body('a', 0, 0), [body('d', 0, 5 + 3.5 + SMALL_R)], OPTS)
    expect(r.minis[0]!.visible).toBe(true)
    expect(r.minis[0]!.obscured).toBe(false)
    expect(r.cover).toBe('none')
    // inside 3" it does
    expect(coverFor(t, body('a', 0, 0), [body('d', 0, 5 + 2.9 + SMALL_R)], OPTS).minis[0]!.obscured).toBe(true)
  })

  it('COVER-003 terrain the attacking leader is in base contact with does not obscure', () => {
    const touching = box('touch', -3, SMALL_R, 3, SMALL_R + 1, { heightIn: 1.2 })
    const t = tableOf([touching])
    const r = coverFor(t, body('a', 0, 0), [body('d', 0, 3)], OPTS)
    expect(r.minis[0]).toMatchObject({ obscured: false, obscuredBy: [] })
    // moved 1" back the same wall obscures
    expect(coverFor(t, body('a', 0, -1), [body('d', 0, 3)], OPTS).minis[0]!.obscured).toBe(true)
  })

  it('COVER-004 a model with LoS completely blocked counts as obscured', () => {
    const t = tableOf([wall('tall', { heightIn: 4 })])
    const r = coverFor(t, body('a', 0, 0), [body('d', 0, 7)], OPTS)
    expect(r.minis[0]).toMatchObject({ visible: false, fullyBlocked: true, obscured: true })
    expect(r.anyVisible).toBe(false)
  })

  it('COVER-005 cover needs at least half the models obscured: 2 of 4 and 3 of 5 yes, 1 of 4 no', () => {
    const t = tableOf([wall('screen', { heightIn: 4 })])
    const hidden = (x: number) => body(`h${x}`, x, 7)
    const open = (i: number) => body(`o${i}`, 12 + 2 * i, 6)
    const lone = (n: number) => Array.from({ length: n }, (_, i) => open(i))
    const unit = (obsc: number, total: number) => [...[-1, 0, 1].slice(0, obsc).map(hidden), ...lone(total - obsc)]
    const a = body('a', 0, 0)
    expect(coverFor(t, a, unit(2, 4), OPTS)).toMatchObject({ obscured: 2, total: 4, hasCover: true, cover: 'light' })
    expect(coverFor(t, a, unit(1, 4), OPTS)).toMatchObject({ obscured: 1, total: 4, hasCover: false, cover: 'none' })
    expect(coverFor(t, a, unit(3, 5), OPTS)).toMatchObject({ obscured: 3, total: 5, hasCover: true })
  })

  it('COVER-006 cover is heavy when any obscured model is obscured by heavy terrain, light otherwise', () => {
    const t = tableOf([
      box('light', -6, 4, -1, 5, { heightIn: 4, cover: 'light' }),
      box('heavy', 1, 4, 6, 5, { heightIn: 4, cover: 'heavy' }),
    ])
    const a = body('a', 0, 0)
    const l = body('l', -3.5, 7)
    const h = body('h', 3.5, 7)
    expect(coverFor(t, a, [l], OPTS).cover).toBe('light')
    expect(coverFor(t, a, [h], OPTS).cover).toBe('heavy')
    expect(coverFor(t, a, [l, h], OPTS)).toMatchObject({ cover: 'heavy', byTerrainId: ['heavy', 'light'] })
  })

  it('COVER-007 a Suppressed defender improves cover by one step: none to light, light to heavy, heavy stays (cap 2)', () => {
    expect(improveCover('none')).toBe('light')
    expect(improveCover('light')).toBe('heavy')
    expect(improveCover('heavy')).toBe('heavy')
    const open = tableOf()
    const a = body('a', 0, 0)
    const d = body('d', 0, 7)
    expect(coverFor(open, a, [d], { ...OPTS, suppressed: true })).toMatchObject({ base: 'none', cover: 'light' })
    const lightWall = tableOf([wall()])
    expect(coverFor(lightWall, a, [d], { ...OPTS, suppressed: true })).toMatchObject({ base: 'light', cover: 'heavy' })
    const heavyWall = tableOf([wall('hw', { cover: 'heavy' })])
    expect(coverFor(heavyWall, a, [d], { ...OPTS, suppressed: true })).toMatchObject({ base: 'heavy', cover: 'heavy' })
  })

  it('COVER-010 a barricade gives heavy cover to troopers that use it and none to a Creature Trooper unit', () => {
    const t = tableOf([box('bar', -1.5, 3, 1.5, 4, { kind: 'barricade', heightIn: 1, cover: 'heavy' })])
    const a = body('a', 0, 0)
    const d = body('d', 0, 6)
    expect(coverFor(t, a, [d], OPTS)).toMatchObject({ cover: 'heavy' })
    expect(coverFor(t, a, [d], { ...OPTS, barricadeCover: false })).toMatchObject({ cover: 'none', obscured: 0 })
  })

  it('COVER-011 a POI obscures as 3"-tall heavy area terrain but does not block LoS for declaring defenders', () => {
    const t = tableOf()
    const poi = poiPiece('poi1', { x: 0, z: 5 }, 0.5)
    const a = body('a', 0, 0)
    const d = body('d', 0, 7)
    const r = coverFor(t, a, [d], { ...OPTS, extraPieces: [poi] })
    expect(r.minis[0]).toMatchObject({ visible: true, obscured: true, obscuredBy: ['poi1'] })
    expect(r.cover).toBe('heavy')
    expect(hasLos(t, a, d)).toBe(true)
    expect(coverFor(t, a, [d], OPTS).cover).toBe('none')
  })
})
