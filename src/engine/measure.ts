// Measuring (00 section 7.2, R-8): base-edge horizontal distance, range bands 1-5 and beyond, half range, "within /
// completely within", weapon range windows, base contact and the derived engagement cache. Height never changes a range
// (R-8.1); it only matters for contact (R-1.6) and for height bands (R-8.5).
import { footprintGap2D, type Footprint } from './footprint'
import { round3 } from './geometry'
import type { Ctx } from './registry'
import { constants, unitsOnTable } from './state'
import type { GameState, Mini, RuleConstants, Unit } from './types'

export type RangeBand = 1 | 2 | 3 | 4 | 5 | 'beyond'

/** A base with an optional elevation: `y` of its bottom and the silhouette height above it. */
export interface Body extends Footprint {
  y?: number
  height?: number
}

export function miniBody(state: GameState, m: Mini): Body {
  const base = state.data.bases[m.baseSize]
  if (!base) throw new Error(`unknown base size ${m.baseSize}`)
  const sil = state.data.silhouettes[base.silhouette]
  return { pos: { x: m.pos.x, z: m.pos.z }, baseRadius: base.radius, y: m.pos.y, ...(sil ? { height: sil.height } : {}) }
}

/** Base-edge to base-edge horizontal distance, rounded to 1/1000 inch (R-8.1; two 27 mm bases 7.063" apart are 6.000"). */
export function distance(a: Footprint, b: Footprint): number {
  return round3(footprintGap2D(a, b))
}

/** The range band of a distance: n covers (6(n-1), 6n], band 1 includes 0 (R-8.2, RULING Port choice). */
export function rangeBand(d: number, c: Pick<RuleConstants, 'rangeBand' | 'maxBand'>): RangeBand {
  const n = Math.max(1, Math.ceil(d / c.rangeBand - 1e-9))
  return n > c.maxBand ? 'beyond' : (n as RangeBand)
}

/** "within range n": distance at most n bands (inclusive). */
export function withinBand(d: number, n: number, c: Pick<RuleConstants, 'rangeBand'>): boolean {
  return d <= n * c.rangeBand + 1e-9
}

/** "within half range" (3"). */
export function withinHalfRange(d: number, c: Pick<RuleConstants, 'halfRange'>): boolean {
  return d <= c.halfRange + 1e-9
}

/** A weapon's range window in bands: `[min, max]`, or a single number as the maximum (min 1) (R-8.4). */
export function weaponReaches(d: number, range: { min?: number; max: number }, c: Pick<RuleConstants, 'rangeBand' | 'maxBand'>): boolean {
  const band = rangeBand(d, c)
  if (band === 'beyond') return false
  return band >= (range.min ?? 1) && band <= range.max
}

/** Distance from one body to the closest of several (leader to the defender's closest model). */
export function closestDistance(from: Footprint, targets: readonly Footprint[]): number {
  let best = Infinity
  for (const t of targets) best = Math.min(best, distance(from, t))
  return best
}

/** A unit is "within range n" of a reference when at least one model is (R-8.3). */
export function unitWithin(minis: readonly Footprint[], ref: Footprint, n: number, c: Pick<RuleConstants, 'rangeBand'>): boolean {
  return minis.some((m) => withinBand(distance(m, ref), n, c))
}

/** "Completely within": every model wholly inside the range region of the reference. */
export function unitCompletelyWithin(minis: readonly Footprint[], ref: Footprint, n: number, c: Pick<RuleConstants, 'rangeBand'>): boolean {
  if (minis.length === 0) return false
  return minis.every((m) => Math.hypot(m.pos.x - ref.pos.x, m.pos.z - ref.pos.z) + m.baseRadius <= ref.baseRadius + n * c.rangeBand + 1e-9)
}

/** "Not within": every model fully outside. */
export function unitNotWithin(minis: readonly Footprint[], ref: Footprint, n: number, c: Pick<RuleConstants, 'rangeBand'>): boolean {
  return minis.every((m) => !withinBand(distance(m, ref), n, c))
}

/** Vertical gap between two cylinders (0 when their height ranges touch or overlap). */
export function verticalGap(a: Body, b: Body): number {
  const ya = a.y ?? 0
  const yb = b.y ?? 0
  const ha = a.height ?? 0
  const hb = b.height ?? 0
  return Math.max(0, Math.max(ya, yb) - Math.min(ya + ha, yb + hb))
}

/**
 * Base contact (R-1.6): horizontal gap at most `contactEpsilon` and the vertical gap at most the taller silhouette height.
 * Bodies without elevation data are on the same level.
 */
export function inBaseContact(a: Body, b: Body, c: Pick<RuleConstants, 'contactEpsilon'>): boolean {
  if (footprintGap2D(a, b) > c.contactEpsilon + 1e-9) return false
  return verticalGap(a, b) <= Math.max(a.height ?? 0, b.height ?? 0) + 1e-9
}

/** Height band of a vertical extent (R-8.5): 5.9" is height 1, 6.1" is height 2. */
export function heightBand(h: number, c: Pick<RuleConstants, 'heightBandSize'>): number {
  return h <= 0 ? 0 : Math.ceil(h / c.heightBandSize - 1e-9)
}

// ---------------------------------------------------------------------------
// Engagement (R-16.2): derived from geometry after every step and cached on the unit
// ---------------------------------------------------------------------------

/** For every unit on the table, the ids of the enemy units with a model in base contact with one of its models. */
export function computeEngagement(state: GameState): Record<string, string[]> {
  const c = constants(state)
  const units = unitsOnTable(state)
  const bodies = new Map<string, { unit: Unit; bodies: Body[] }>()
  const boxes = new Map<string, { x0: number; x1: number; z0: number; z1: number }>()
  for (const u of units) {
    const bs = u.minis.filter((m) => m.alive).map((m) => miniBody(state, m))
    bodies.set(u.id, { unit: u, bodies: bs })
    // the box of the unit's bases, to skip pairs of units that are nowhere near each other
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (const b of bs) {
      if (b.pos.x - b.baseRadius < x0) x0 = b.pos.x - b.baseRadius
      if (b.pos.x + b.baseRadius > x1) x1 = b.pos.x + b.baseRadius
      if (b.pos.z - b.baseRadius < z0) z0 = b.pos.z - b.baseRadius
      if (b.pos.z + b.baseRadius > z1) z1 = b.pos.z + b.baseRadius
    }
    boxes.set(u.id, { x0, x1, z0, z1 })
  }
  const out: Record<string, string[]> = {}
  for (const u of units) out[u.id] = []
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i]!
      const b = units[j]!
      if (a.seat === b.seat) continue
      const A = boxes.get(a.id)!
      const B = boxes.get(b.id)!
      const pad = c.contactEpsilon + 1e-6
      if (A.x1 + pad < B.x0 || B.x1 + pad < A.x0 || A.z1 + pad < B.z0 || B.z1 + pad < A.z0) continue
      const ba = bodies.get(a.id)!.bodies
      const bb = bodies.get(b.id)!.bodies
      if (ba.some((x) => bb.some((y) => inBaseContact(x, y, c)))) {
        out[a.id]!.push(b.id)
        out[b.id]!.push(a.id)
      }
    }
  }
  for (const id of Object.keys(out)) out[id]!.sort()
  return out
}

/** Recompute `unit.engagedWith` for every unit (called by apply.afterAction). */
export function refreshEngagement(ctx: Ctx): void {
  const next = computeEngagement(ctx.state)
  for (const u of Object.values(ctx.state.units)) {
    u.engagedWith = u.location === 'table' ? (next[u.id] ?? []) : []
  }
}
