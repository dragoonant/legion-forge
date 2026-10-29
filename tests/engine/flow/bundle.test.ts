import { describe, expect, it } from 'vitest'
import { loadBundle } from '../../../src/data'
import { bundleFromData, RULESET, unitData } from '../../../src/engine/bundle'
import { realBundle } from './helpers'

describe('bundleFromData', () => {
  const { data } = realBundle()

  it('maps dice, constants, the tool, bases and silhouettes from the data', () => {
    expect(data.ruleset).toBe(RULESET)
    expect(data.dice.attack.red).toHaveLength(8)
    expect(data.dice.defence.red).toHaveLength(6)
    expect(data.constants.rangeBand).toBe(6)
    expect(data.constants.cohesionDistance).toBe(3)
    expect(data.tool.speeds['2'].segments).toEqual([3.5, 3.5])
    // 27 mm small base: radius = 27 / 25.4 / 2 inches, exactly
    expect(data.bases['core.base.small']!.radius).toBeCloseTo(27 / 25.4 / 2, 12)
    expect(data.silhouettes['core.silhouette.small']!.height).toBe(1.69)
  })

  it('carries units, weapons, upgrades, command cards, battle cards, formats, maps and layouts', () => {
    const db = loadBundle()
    expect(Object.keys(data.units)).toHaveLength(Object.keys(db.units).length)
    expect(unitData(data, 'emp.u.darth-vader-dlots').courage).toBeNull()
    expect(Object.keys(data.battleCards).sort()).toEqual(Object.keys(db.battleCards).sort())
    expect(data.formats!.recon).toMatchObject({ maxPoints: 600, instantWinVp: 12 })
    expect(Object.keys(data.layouts)).toEqual(['lay.recon.forest-1'])
    expect(data.layouts['lay.recon.forest-1']!.size).toEqual({ x: 36, z: 36 })
    expect(Object.keys(data.maps!)).toHaveLength(3)
    expect(bundleFromData(db).data.dataVersion).toBe(db.dataVersion)
  })
})
