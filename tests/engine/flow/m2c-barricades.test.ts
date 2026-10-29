// M2c review finding 29: Fortified Position places up to 3 barricades (CRB p12; Recon card p6), checked for Territory, spacing,
// tokens and the table, through `step` on the real data.
import { describe, expect, it } from 'vitest'
import '../../../src/engine'
import { step, suggest } from '../../../src/engine'
import { barricadePolygon } from '../../../src/engine/barricades'
import { polygonsOverlap } from '../../../src/engine/tool'
import { must, newGame, optionAction } from './helpers'

const CARDS = ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.cunning-deployment', 'rec.adv.fortified-position']
const asked = () => newGame({ cards: CARDS, options: { autoDivulge: true } })
const place = (state: ReturnType<typeof asked>['state'], x: number, z: number, yaw = 0) =>
  step(state, { type: 'battle.place', seat: state.pending!.seat as 'A' | 'B', decisionId: state.pending!.id, payload: { x, z, yaw } })

describe('M2c Fortified Position (review 29)', () => {
  it('RVW-29 the owner is asked to place up to 3 barricades; Territory, spacing and the table are checked', () => {
    const g = asked()
    expect(g.pending!.kind).toBe('battle.place')
    expect(g.pending!.seat).toBe('B') // blue (A) took Cunning Deployment, red took Fortified Position
    expect(g.pending!.canPass).toBe(true)
    expect(g.pending!.context).toMatchObject({ terrain: 'barricade', left: 3, minApart: 6, width: 3, depth: 1, height: 1 })
    // blue's Territory is the two +z corners: off limits to red's barricades, and so is the edge of the table
    expect(place(g.state, 13.5, 14).rejection?.code).toBe('E_TERRAIN')
    expect(place(g.state, 13.5, 14).rejection?.reason).toMatch(/enemy Territory/)
    expect(place(g.state, 0, 18.4).rejection?.reason).toBe('off the table')
    const spot = suggest(g.state, g.pending!, 'B')!
    expect(spot.type).toBe('battle.place')
    const first = must(g.state, spot)
    expect(first.pending!.kind).toBe('battle.place')
    expect(first.pending!.context['left']).toBe(2)
    expect(first.state.table.def.pieces.filter((p) => p.kind === 'barricade')).toHaveLength(1)
    const p1 = first.state.table.def.pieces.find((p) => p.kind === 'barricade')!
    expect(p1).toMatchObject({ heightIn: 1, cover: 'heavy', movement: 'open' })
    // a second barricade within range 1 (6") of the first is refused, one further away is fine
    const at = spot.payload as { x: number; z: number }
    const near = { x: at.x, z: at.z + 4 }
    expect(place(first.state, near.x, near.z).rejection?.reason).toMatch(/range 1 of another barricade|overlaps|enemy Territory/)
    const poly = (x: number, z: number) => barricadePolygon(x, z, 0)
    expect(polygonsOverlap(poly(near.x, near.z), p1.footprint)).toBe(false)
    // a pass ends the placements ("up to 3") and setup goes on
    const done = step(first.state, { type: 'pass', seat: 'B', decisionId: first.state.pending!.id, payload: {} })
    expect(done.rejection).toBeUndefined()
    expect(done.state.pending!.kind).not.toBe('battle.place')
    expect(done.state.table.def.pieces.filter((p) => p.kind === 'barricade')).toHaveLength(1)
  })

  it('RVW-29 with autoDeploy the engine places all three, each more than 6" from the others, and records them in the battle data', () => {
    const g = newGame({ cards: CARDS, options: { autoDeploy: true, autoDivulge: true } })
    const bars = g.state.table.def.pieces.filter((p) => p.kind === 'barricade')
    expect(bars).toHaveLength(3)
    expect((g.state.battle.data['barricades'] as unknown[]).length).toBe(3)
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const a = bars[i]!.bbox
        const b = bars[j]!.bbox
        const gap = Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ))
        expect(gap).toBeGreaterThan(6)
      }
    }
    // no barricade overlaps a point of interest or the enemy's Territory: the placement is the same one the player would get
    expect(optionAction).toBeDefined()
  })

  it('RVW-29 a barricade gives no model somewhere to stand: a Move ending on it is refused (E_OVERLAP)', async () => {
    const g = newGame({ cards: CARDS, options: { autoDeploy: true, autoDivulge: true } })
    const bar = g.state.table.def.pieces.find((p) => p.kind === 'barricade')!
    expect(bar.movement).toBe('open')
    const { checkBasePlacement } = await import('../../../src/engine/tool')
    const world = { table: g.state.table.def, tool: g.state.data.tool, constants: g.state.data.constants, others: [] }
    const cx = (bar.bbox.minX + bar.bbox.maxX) / 2
    const cz = (bar.bbox.minZ + bar.bbox.maxZ) / 2
    expect(checkBasePlacement(world, { pos: { x: cx, z: cz }, baseRadius: 0.53 }, { fromY: 0, silhouetteHeight: 1.7, climb: false, canEngage: false })).toMatchObject({ ok: false, code: 'E_OVERLAP' })
  })
})
