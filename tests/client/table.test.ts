// The table and terrain are drawn from the rules geometry: the mat is the layout's size, every piece of the compiled table becomes an
// extruded footprint of its real height, objective tokens come from the table's markers.
import { describe, expect, it } from 'vitest'
import { engineBundle } from '../../src/client/game/adapter'
import { tableSize } from '../../src/client/board/Table'
import { prismGeometry, terrainStyle } from '../../src/client/board/Terrain'
import { newRealGame, playGame } from './fixtures'

describe('table and terrain geometry', () => {
  const g = newRealGame('table')
  const def = g.state.table.def

  it('the Recon table is 36 by 36 inches centred on the origin', () => {
    const s = tableSize(def)
    expect(s).toMatchObject({ w: 36, d: 36, cx: 0, cz: 0 })
    expect(def.bounds).toEqual({ minX: -18, maxX: 18, minZ: -18, maxZ: 18 })
  })

  it('every terrain piece extrudes to its footprint box and its data height', () => {
    expect(def.pieces.length).toBeGreaterThan(3)
    for (const p of def.pieces) {
      const geo = prismGeometry(p.footprint, p.heightIn)
      geo.computeBoundingBox()
      const b = geo.boundingBox!
      expect(b.min.x).toBeCloseTo(p.bbox.minX, 3)
      expect(b.max.x).toBeCloseTo(p.bbox.maxX, 3)
      expect(b.min.z).toBeCloseTo(p.bbox.minZ, 3)
      expect(b.max.z).toBeCloseTo(p.bbox.maxZ, 3)
      expect(b.min.y).toBeCloseTo(0, 3)
      expect(b.max.y).toBeCloseTo(p.heightIn, 3)
    }
  })

  it('areas are translucent, solid pieces opaque', () => {
    for (const p of def.pieces) {
      const st = terrainStyle(p)
      if (p.kind === 'area') expect(st.opacity).toBeLessThan(1)
      else expect(st.opacity).toBe(1)
    }
  })

  it('objective tokens are the table markers of the drawn objective, inside the table', () => {
    const markers = Object.values(playGame('table-objectives', (st) => st.round >= 1).state.table.objectives)
    expect(markers.length).toBeGreaterThanOrEqual(3)
    for (const m of markers) {
      expect(Math.abs(m.pos.x)).toBeLessThanOrEqual(18)
      expect(Math.abs(m.pos.z)).toBeLessThanOrEqual(18)
    }
  })

  it('one layout in the data: the table the client draws is the engine bundle layout', () => {
    expect(Object.keys(engineBundle().data.layouts)).toContain(def.id)
  })
})
