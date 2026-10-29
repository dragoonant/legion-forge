// Table compilation (00 section 7.1): a data layout (terrain pieces with kind, height, cover, LoS and movement class)
// becomes a `TableDef` with height bands and bounding boxes; plus the terrain queries the space modules share.
// 36"x36" (Recon) and 72"x36" (Standard) are just sizes: the table is centred on the origin, x and z in [-size/2, size/2].
import { type BBox, distToPolygonBoundary, polygonBBox, segmentPolygonIntervals } from './geometry'
import { footprintOverlapsPolygon, type Footprint } from './footprint'
import { EngineInvariantError } from './state'
import type { Polygon, TableDef, TableLayout, TerrainPiece, TerrainPieceDef, Vec2 } from './types'

/** Height band of a terrain top (R-8.5): top in (0, band] = height 1. A flat piece (height 0) is band 0. */
export function heightBandOf(heightIn: number, bandSize = 6): number {
  return heightIn <= 0 ? 0 : Math.ceil(heightIn / bandSize - 1e-9)
}

function polygonArea(poly: Polygon): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    a += p.x * q.z - q.x * p.z
  }
  return a / 2
}

export function compilePiece(def: TerrainPieceDef, bandSize = 6): TerrainPiece {
  if (def.footprint.length < 3 || Math.abs(polygonArea(def.footprint)) < 1e-6) {
    throw new EngineInvariantError(`terrain piece ${def.id}: footprint is not a polygon`)
  }
  if (!(def.heightIn >= 0)) throw new EngineInvariantError(`terrain piece ${def.id}: negative height`)
  return { ...def, heightBand: heightBandOf(def.heightIn, bandSize), bbox: polygonBBox(def.footprint) }
}

export interface CompileOptions {
  heightBandSize?: number
  zones?: Record<string, Polygon>
}

/** Compile a layout. Throws `EngineInvariantError` for a piece that leaves the table or has a degenerate footprint. */
export function compileTable(layout: TableLayout, opts: CompileOptions = {}): TableDef {
  const hx = layout.size.x / 2
  const hz = layout.size.z / 2
  const bounds = { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz }
  const ids = new Set<string>()
  const pieces = layout.pieces.map((p) => {
    if (ids.has(p.id)) throw new EngineInvariantError(`table ${layout.id}: duplicate piece ${p.id}`)
    ids.add(p.id)
    const piece = compilePiece(p, opts.heightBandSize ?? 6)
    const b = piece.bbox
    if (b.minX < bounds.minX - 1e-6 || b.maxX > bounds.maxX + 1e-6 || b.minZ < bounds.minZ - 1e-6 || b.maxZ > bounds.maxZ + 1e-6) {
      throw new EngineInvariantError(`table ${layout.id}: piece ${p.id} leaves the table`)
    }
    return piece
  })
  return { id: layout.id, size: { ...layout.size }, bounds, pieces, zones: opts.zones ?? {} }
}

/** A bare table with no terrain. */
export function openTable(x: number, z: number, id = `open-${x}x${z}`): TableDef {
  return compileTable({ id, size: { x, z }, pieces: [] })
}

/** A regular polygon around a centre (a round marker as a footprint polygon). */
export function regularPolygon(c: Vec2, radius: number, sides = 12): Polygon {
  return Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides
    return { x: c.x + Math.sin(a) * radius, z: c.z + Math.cos(a) * radius }
  })
}

/**
 * A point of interest obscures as 3"-tall heavy area terrain for cover only (R-18.2): the returned piece is passed as an
 * extra piece to the cover check; it is never put in the table's own list, so it does not block LoS for declaring defenders.
 */
export function poiPiece(id: string, pos: Vec2, radius: number): TerrainPiece {
  return compilePiece({
    id,
    kind: 'area',
    footprint: regularPolygon(pos, radius, 12),
    heightIn: 3,
    cover: 'heavy',
    blocksLos: true,
    movement: 'open',
    climbable: false,
  })
}

export function pointOnTable(table: TableDef, p: Vec2): boolean {
  const b = table.bounds
  return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ
}

function bboxNear(a: BBox, b: BBox, pad: number): boolean {
  return a.maxX >= b.minX - pad && a.minX <= b.maxX + pad && a.maxZ >= b.minZ - pad && a.minZ <= b.maxZ + pad
}

/** Pieces whose footprint the base overlaps with positive area. */
export function piecesOverlapping(table: TableDef, f: Footprint): TerrainPiece[] {
  const box: BBox = { minX: f.pos.x - f.baseRadius, maxX: f.pos.x + f.baseRadius, minZ: f.pos.z - f.baseRadius, maxZ: f.pos.z + f.baseRadius }
  return table.pieces.filter((p) => bboxNear(p.bbox, box, 0) && footprintOverlapsPolygon(f, p.footprint))
}

/** Does the segment a -> b pass through the footprint of an impassable piece? (cohesion measurement, R-7.1) */
export function segmentCrossesImpassable(table: TableDef, a: Vec2, b: Vec2): TerrainPiece | null {
  const box: BBox = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) }
  for (const p of table.pieces) {
    if (p.movement !== 'impassable' || !bboxNear(p.bbox, box, 0)) continue
    if (segmentPolygonIntervals(a, b, p.footprint).length > 0) return p
  }
  return null
}

/** Pieces that satisfy a predicate and whose footprint comes within `dist` of the footprint's edge (0 = touching or overlapping). */
export function piecesWithin(pieces: readonly TerrainPiece[], f: Footprint, dist: number): TerrainPiece[] {
  const box: BBox = { minX: f.pos.x - f.baseRadius, maxX: f.pos.x + f.baseRadius, minZ: f.pos.z - f.baseRadius, maxZ: f.pos.z + f.baseRadius }
  return pieces.filter((p) => bboxNear(p.bbox, box, dist) && footprintGapToPiece(f, p) <= dist + 1e-9)
}

/** Horizontal gap from a footprint's edge to a piece's footprint polygon (0 when touching or overlapping). */
export function footprintGapToPiece(f: Footprint, piece: TerrainPiece): number {
  if (footprintOverlapsPolygon(f, piece.footprint)) return 0
  return Math.max(0, distToPolygonBoundary(f.pos, piece.footprint) - f.baseRadius)
}
