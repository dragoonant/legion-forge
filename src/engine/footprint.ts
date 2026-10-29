// Base footprints. Round bases (small 27 mm, medium 50 mm, large 70 mm) are discs on the table plane; the notched
// vehicle shape arrives in M2b and is stubbed here (it throws rather than answer with a wrong shape). Every helper takes
// a footprint `{ pos, baseRadius }`, so the call sites do not change when a second shape lands.
import { EPS, baseGap2D, circlesOverlap, distToPolygon, distToPolygonBoundary, mmToInches, pointInPolygon, ringPoints, segmentCircleInterval } from './geometry'
import { EngineInvariantError } from './state'
import type { Polygon, RuntimeBase, Vec2 } from './types'

export interface Footprint {
  pos: Vec2
  baseRadius: number
}

/** Standard Legion round base diameters in mm (small, medium, large); data supplies the real list. */
export const ROUND_BASE_MM = { small: 27, medium: 50, large: 70 } as const

/** Exact radius in inches of a round base of `mm` diameter (rounding happens on distances, not on radii: 7.063" apart is 6.000"). */
export function baseRadiusIn(mm: number): number {
  return mmToInches(mm) / 2
}

/** The footprint of a base definition at a position. Notched bases are an M2b feature. */
export function footprintFor(base: Pick<RuntimeBase, 'radius' | 'notched'>, pos: Vec2, _yaw = 0): Footprint {
  if (base.notched) throw new EngineInvariantError('notched bases arrive in M2b')
  return { pos: { x: pos.x, z: pos.z }, baseRadius: base.radius }
}

/** Closest-edge gap between two footprints (0 when touching or overlapping). */
export function footprintGap2D(a: Footprint, b: Footprint): number {
  return baseGap2D(a.pos, a.baseRadius, b.pos, b.baseRadius)
}

/** Do two footprints overlap with positive area (touching is not overlap)? */
export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return circlesOverlap(a.pos, a.baseRadius, b.pos, b.baseRadius)
}

/** Horizontal distance from the footprint's edge to a polygon region (<= 0 when it reaches inside). */
export function footprintDistToPolygon(f: Footprint, poly: Polygon): number {
  return distToPolygon(f.pos, poly) - f.baseRadius
}

/** The footprint overlaps the polygon with positive area. */
export function footprintOverlapsPolygon(f: Footprint, poly: Polygon): boolean {
  return pointInPolygon(f.pos, poly) || distToPolygonBoundary(f.pos, poly) < f.baseRadius - EPS
}

/** The whole footprint lies inside the polygon ("wholly within"). */
export function footprintInsidePolygon(f: Footprint, poly: Polygon): boolean {
  return pointInPolygon(f.pos, poly) && distToPolygonBoundary(f.pos, poly) >= f.baseRadius - EPS
}

/** The whole footprint lies inside the axis-aligned bounds. */
export function footprintInsideBounds(f: Footprint, b: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
  const r = f.baseRadius
  return f.pos.x - r >= b.minX - EPS && f.pos.x + r <= b.maxX + EPS && f.pos.z - r >= b.minZ - EPS && f.pos.z + r <= b.maxZ + EPS
}

/** Points on the footprint's outline, `count` of them starting at `startAngle` (radians, +Z = 0). */
export function footprintRing(f: Footprint, count: number, startAngle = 0): Vec2[] {
  return ringPoints(f.pos, f.baseRadius, count, startAngle)
}

/** t interval in which the segment a -> b passes over the footprint (empty when it misses). */
export function segmentFootprintIntervals(a: Vec2, b: Vec2, f: Footprint): [number, number][] {
  const iv = segmentCircleInterval(a, b, f.pos, f.baseRadius)
  return iv ? [iv] : []
}

/** Smallest distance from a point to the footprint's edge (0 when inside). */
export function pointGapToFootprint(p: Vec2, f: Footprint): number {
  return Math.max(0, Math.hypot(p.x - f.pos.x, p.z - f.pos.z) - f.baseRadius)
}

/** Smallest signed rotation from `from` to `to` (radians, in (-pi, pi]). */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d <= -Math.PI) d += 2 * Math.PI
  return d
}
