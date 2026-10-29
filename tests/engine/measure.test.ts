import { describe, expect, it } from 'vitest'
import { baseRadiusIn } from '../../src/engine/footprint'
import { closestDistance, distance, heightBand, inBaseContact, rangeBand, unitCompletelyWithin, unitNotWithin, unitWithin, weaponReaches, withinHalfRange } from '../../src/engine/measure'
import { CONSTANTS, SMALL_R } from './fixtures'

const fp = (x: number, z: number, r = SMALL_R) => ({ pos: { x, z }, baseRadius: r })

describe('measuring', () => {
  it('RNG-001 range is base edge to base edge: two 27 mm bases 7.063" apart are 6.000" apart', () => {
    expect(baseRadiusIn(27)).toBeCloseTo(0.5315, 4)
    expect(distance(fp(0, 0), fp(7.063, 0))).toBe(6)
    expect(distance(fp(0, 0), fp(0.5, 0))).toBe(0)
  })

  it('RNG-002 6.000" is range 1, 6.001" range 2, 30.000" range 5, 30.001" beyond', () => {
    expect(rangeBand(6.0, CONSTANTS)).toBe(1)
    expect(rangeBand(6.001, CONSTANTS)).toBe(2)
    expect(rangeBand(0, CONSTANTS)).toBe(1)
    expect(rangeBand(12, CONSTANTS)).toBe(2)
    expect(rangeBand(30.0, CONSTANTS)).toBe(5)
    expect(rangeBand(30.001, CONSTANTS)).toBe('beyond')
    expect(withinHalfRange(3.0, CONSTANTS)).toBe(true)
    expect(withinHalfRange(3.001, CONSTANTS)).toBe(false)
  })

  it('RNG-003 height does not change range: a model on a 5" roof at 4" horizontal is range 1', () => {
    const low = { ...fp(0, 0), y: 0, height: 1.69 }
    const roof = { ...fp(4 + 2 * SMALL_R, 0), y: 5, height: 1.69 }
    expect(distance(low, roof)).toBe(4)
    expect(rangeBand(distance(low, roof), CONSTANTS)).toBe(1)
    expect(inBaseContact({ ...low }, { ...fp(2 * SMALL_R, 0), y: 5, height: 1.69 }, CONSTANTS)).toBe(false)
  })

  it('RNG-004 a unit with one model inside range 1 is within 1; completely within needs every model inside', () => {
    const ref = fp(0, 0)
    const unit = [fp(5, 0), fp(8, 0)]
    expect(unitWithin(unit, ref, 1, CONSTANTS)).toBe(true)
    expect(unitCompletelyWithin(unit, ref, 1, CONSTANTS)).toBe(false)
    expect(unitCompletelyWithin([fp(3, 0), fp(0, 4)], ref, 1, CONSTANTS)).toBe(true)
    expect(unitNotWithin([fp(20, 0)], ref, 1, CONSTANTS)).toBe(true)
    expect(unitNotWithin(unit, ref, 1, CONSTANTS)).toBe(false)
    // a base only partly inside the region is not completely within
    expect(unitCompletelyWithin([fp(6 + SMALL_R, 0)], ref, 1, CONSTANTS)).toBe(false)
  })

  it('RNG-005 a weapon with range 1-3 cannot be used against a defender at range 4', () => {
    const leader = fp(0, 0)
    const defenders = [fp(20, 0), fp(25, 3)]
    const d = closestDistance(leader, defenders)
    expect(rangeBand(d, CONSTANTS)).toBe(4)
    expect(weaponReaches(d, { min: 1, max: 3 }, CONSTANTS)).toBe(false)
    expect(weaponReaches(d, { max: 4 }, CONSTANTS)).toBe(true)
  })

  it('RNG-006 a weapon with minimum range 2 cannot be used against a defender at range 1', () => {
    expect(weaponReaches(5, { min: 2, max: 4 }, CONSTANTS)).toBe(false)
    expect(weaponReaches(6.5, { min: 2, max: 4 }, CONSTANTS)).toBe(true)
    expect(weaponReaches(40, { min: 2, max: 4 }, CONSTANTS)).toBe(false)
  })

  it('RNG-007 a 5.9" roof is height 1 and a 6.1" roof is height 2', () => {
    expect(heightBand(5.9, CONSTANTS)).toBe(1)
    expect(heightBand(6.0, CONSTANTS)).toBe(1)
    expect(heightBand(6.1, CONSTANTS)).toBe(2)
  })

  it('MEL-011 base contact is a 0.002" tolerance, plus the vertical limit for elevated bases', () => {
    const a = { ...fp(0, 0), y: 0, height: 1.69 }
    expect(inBaseContact(a, { ...fp(2 * SMALL_R + 0.002, 0), y: 0, height: 1.69 }, CONSTANTS)).toBe(true)
    expect(inBaseContact(a, { ...fp(2 * SMALL_R + 0.01, 0), y: 0, height: 1.69 }, CONSTANTS)).toBe(false)
    // a base standing 4" higher is farther than a silhouette away vertically
    expect(inBaseContact(a, { ...fp(2 * SMALL_R, 0), y: 4, height: 1.69 }, CONSTANTS)).toBe(false)
    expect(inBaseContact(a, { ...fp(2 * SMALL_R, 0), y: 1.5, height: 1.69 }, CONSTANTS)).toBe(true)
  })
})
