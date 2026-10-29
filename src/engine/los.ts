// Line of sight and cover (00 section 7.4, R-10, R-11). Silhouettes are vertical cylinders over the base; LoS is any
// clear ray between sample points of the two silhouettes (counts from data); terrain with `blocksLos` blocks by its
// volume (footprint prism from the table plane to its top); trooper silhouettes never block. One scan feeds both the
// LoS verdict and the cover verdict, so `query.losCover` and the attack step cannot disagree (LOS-008).
import { footprintGapToPiece, piecesWithin } from './table'
import { footprintOverlapsPolygon, type Footprint } from './footprint'
import { round3, segmentPolygonIntervals } from './geometry'
import { EngineInvariantError } from './state'
import type { CoverValue, GameState, Mini, RuleConstants, RuntimeSilhouette, TableDef, TerrainPiece, Vec2, Vec3 } from './types'

export type SampleLayout = RuntimeSilhouette['samples']

/** A model as the LoS code sees it: base disc, bottom elevation and silhouette cylinder. */
export interface LosBody {
  id: string
  /** pos.y = elevation of the base bottom (a rooftop height when standing on one) */
  pos: Vec3
  baseRadius: number
  height: number
  samples: SampleLayout
}

export function miniLosBody(state: GameState, m: Mini): LosBody {
  const base = state.data.bases[m.baseSize]
  const sil = base ? state.data.silhouettes[base.silhouette] : undefined
  if (!base || !sil) throw new EngineInvariantError(`mini ${m.id}: unknown base or silhouette (${m.baseSize})`)
  return { id: m.id, pos: m.pos, baseRadius: base.radius, height: sil.height, samples: sil.samples }
}

function footprintOf(b: LosBody): Footprint {
  return { pos: { x: b.pos.x, z: b.pos.z }, baseRadius: b.baseRadius }
}

/**
 * Sample points of a silhouette (R-10.2, RULING Port choice): `rings` rims from the base up to the top (rings=2: bottom
 * and top rims), `perRing` points on each rim, plus the axis point of each ring height.
 */
export function samplePoints(b: LosBody): Vec3[] {
  const { rings, perRing, axis } = b.samples
  const out: Vec3[] = []
  const n = Math.max(1, rings)
  for (let i = 0; i < n; i++) {
    const y = b.pos.y + (n === 1 ? b.height : (b.height * i) / (n - 1))
    for (let k = 0; k < perRing; k++) {
      const a = (2 * Math.PI * k) / perRing
      out.push({ x: b.pos.x + Math.sin(a) * b.baseRadius, y, z: b.pos.z + Math.cos(a) * b.baseRadius })
    }
    if (axis) out.push({ x: b.pos.x, y, z: b.pos.z })
  }
  return out
}

const Y_EPS = 1e-6

/** Does the ray A -> B pass through the piece's volume? Returns the entry parameter t, or null. */
function rayEntersPiece(p: TerrainPiece, a: Vec3, b: Vec3): number | null {
  // the ray's height never drops below its lower end: a ray that starts and ends above the piece cannot enter it
  if (Math.min(a.y, b.y) >= p.heightIn - Y_EPS) return null
  if (Math.max(a.x, b.x) < p.bbox.minX || Math.min(a.x, b.x) > p.bbox.maxX || Math.max(a.z, b.z) < p.bbox.minZ || Math.min(a.z, b.z) > p.bbox.maxZ) return null
  const ivs = segmentPolygonIntervals({ x: a.x, z: a.z }, { x: b.x, z: b.z }, p.footprint)
  for (const [t0, t1] of ivs) {
    const y0 = a.y + (b.y - a.y) * t0
    const y1 = a.y + (b.y - a.y) * t1
    if (Math.min(y0, y1) < p.heightIn - Y_EPS) return t0
  }
  return null
}

export interface RayResult {
  from: Vec3
  to: Vec3
  /** terrain pieces whose volume the ray passes through, nearest first (LoS-blocking pieces and extra cover-only pieces) */
  blockers: string[]
  /** true when no LoS-blocking piece stops the ray */
  clear: boolean
}

export interface LosResult {
  /** at least one clear ray */
  visible: boolean
  clear: number
  total: number
  /** per piece, how many rays it is the FIRST blocker of (the attribution the client draws) */
  firstBlocker: Record<string, number>
  /** per piece, how many rays it blocks at all */
  blocks: Record<string, number>
  rays?: RayResult[]
}

export interface ScanOptions {
  keepRays?: boolean
  /** pieces that obscure for cover but never block LoS (points of interest, R-18.2) */
  extraPieces?: readonly TerrainPiece[]
  /** stop at the first clear ray (a pure yes/no LoS question) */
  firstClearOnly?: boolean
}

/** The ignore rule of R-9.3: a model overlapping a piece of area terrain disregards that piece for its own LoS lines. */
function ignoredFor(p: TerrainPiece, a: LosBody, d: LosBody): boolean {
  return p.kind === 'area' && (footprintOverlapsPolygon(footprintOf(a), p.footprint) || footprintOverlapsPolygon(footprintOf(d), p.footprint))
}

// Scans are pure functions of the table, the two bodies and the extra pieces, and the sim / bot / UI ask the same pair
// again and again (target lists, odds, the attack itself, replays). Results are cached per table (never mutated by callers).
const SCAN_CACHE_MAX = 40_000
const scanCaches = new Map<string, Map<string, LosResult>>()
const tableSigs = new WeakMap<TableDef, string>()

/** Everything about a table that a scan reads, so games on the same layout (and a replay) share one cache. */
function tableSig(table: TableDef): string {
  let sig = tableSigs.get(table)
  if (sig === undefined) {
    sig = table.pieces
      .map((p) => `${p.id}:${p.kind}:${p.heightIn}:${p.blocksLos ? 1 : 0}:${p.footprint.map((v) => `${v.x},${v.z}`).join(';')}`)
      .join('|')
    tableSigs.set(table, sig)
  }
  return sig
}

function bodyKey(b: LosBody): string {
  const s = b.samples
  return `${b.pos.x},${b.pos.y},${b.pos.z},${b.baseRadius},${b.height},${s.rings},${s.perRing},${s.axis ? 1 : 0}`
}

/** Scan every ray between the sample points of two bodies. The single source of LoS and cover verdicts. */
export function scanRays(table: TableDef, a: LosBody, d: LosBody, opts: ScanOptions = {}): LosResult {
  if (opts.keepRays) return scanRaysUncached(table, a, d, opts)
  const sig = tableSig(table)
  let cache = scanCaches.get(sig)
  if (!cache) {
    if (scanCaches.size >= 16) scanCaches.clear()
    scanCaches.set(sig, (cache = new Map()))
  }
  const extra = opts.extraPieces && opts.extraPieces.length > 0 ? opts.extraPieces.map((p) => `${p.id}@${p.bbox.minX},${p.bbox.minZ}`).join('|') : ''
  const key = `${bodyKey(a)}>${bodyKey(d)}>${opts.firstClearOnly ? 1 : 0}>${extra}`
  const hit = cache.get(key)
  if (hit) return hit
  const res = scanRaysUncached(table, a, d, opts)
  if (cache.size >= SCAN_CACHE_MAX) cache.clear()
  cache.set(key, res)
  return res
}

function scanRaysUncached(table: TableDef, a: LosBody, d: LosBody, opts: ScanOptions): LosResult {
  const lo = { x: Math.min(a.pos.x, d.pos.x) - Math.max(a.baseRadius, d.baseRadius), z: Math.min(a.pos.z, d.pos.z) - Math.max(a.baseRadius, d.baseRadius) }
  const hi = { x: Math.max(a.pos.x, d.pos.x) + Math.max(a.baseRadius, d.baseRadius), z: Math.max(a.pos.z, d.pos.z) + Math.max(a.baseRadius, d.baseRadius) }
  const near = (p: TerrainPiece) => p.bbox.maxX >= lo.x && p.bbox.minX <= hi.x && p.bbox.maxZ >= lo.z && p.bbox.minZ <= hi.z
  const losPieces = table.pieces.filter((p) => p.blocksLos && near(p) && !ignoredFor(p, a, d))
  const extra = (opts.extraPieces ?? []).filter((p) => p.blocksLos && near(p) && !ignoredFor(p, a, d))
  const pieces: { p: TerrainPiece; los: boolean }[] = [...losPieces.map((p) => ({ p, los: true })), ...extra.map((p) => ({ p, los: false }))]

  const from = samplePoints(a)
  const to = samplePoints(d)
  const out: LosResult = { visible: false, clear: 0, total: 0, firstBlocker: {}, blocks: {} }
  if (opts.keepRays) out.rays = []
  for (const pa of from) {
    for (const pd of to) {
      out.total++
      const hits: { id: string; t: number; los: boolean }[] = []
      for (const { p, los } of pieces) {
        const t = rayEntersPiece(p, pa, pd)
        if (t !== null) hits.push({ id: p.id, t, los })
      }
      hits.sort((x, y) => x.t - y.t)
      const clear = !hits.some((h) => h.los)
      if (clear) out.clear++
      if (hits.length > 0) {
        out.firstBlocker[hits[0]!.id] = (out.firstBlocker[hits[0]!.id] ?? 0) + 1
        for (const h of hits) out.blocks[h.id] = (out.blocks[h.id] ?? 0) + 1
      }
      if (out.rays) out.rays.push({ from: pa, to: pd, blockers: hits.map((h) => h.id), clear })
      if (clear && opts.firstClearOnly) {
        out.visible = true
        return out
      }
    }
  }
  out.visible = out.clear > 0
  return out
}

/** LoS between two bodies: does any ray reach? Trooper silhouettes never block; only terrain does. */
export function hasLos(table: TableDef, a: LosBody, d: LosBody): boolean {
  return scanRays(table, a, d, { firstClearOnly: true }).visible
}

// ---------------------------------------------------------------------------
// Cover (R-11)
// ---------------------------------------------------------------------------

const COVER_RANK: Record<CoverValue, number> = { none: 0, light: 1, heavy: 2 }

/** A Suppressed defender improves cover by one step, capped at heavy (R-11.1, R-11.3). */
export function improveCover(cover: CoverValue, steps = 1): CoverValue {
  const levels: CoverValue[] = ['none', 'light', 'heavy']
  return levels[Math.min(2, COVER_RANK[cover] + steps)]!
}

export interface CoverOptions {
  suppressed: boolean
  /** false for Creature and Heavy Troopers: barricades give them nothing (R-9.2) */
  barricadeCover: boolean
  constants: Pick<RuleConstants, 'halfRange' | 'contactEpsilon'>
  extraPieces?: readonly TerrainPiece[]
  keepRays?: boolean
}

export interface MiniCover {
  id: string
  visible: boolean
  clear: number
  total: number
  obscured: boolean
  /** the pieces that obscure this model, with the strongest value last-resolved in `value` */
  obscuredBy: string[]
  value: CoverValue
  /** LoS completely blocked: counts as obscured (R-11.2) */
  fullyBlocked: boolean
  rays?: RayResult[]
}

export interface CoverResult {
  minis: MiniCover[]
  obscured: number
  total: number
  /** at least half of the defending models are obscured */
  hasCover: boolean
  /** cover before the Suppressed improvement */
  base: CoverValue
  /** cover after it: what the defender gets */
  cover: CoverValue
  /** every piece that obscured at least one model, for `CoverApplied.byTerrainId` */
  byTerrainId: string[]
  /** any model of the defender is visible to the attacking leader */
  anyVisible: boolean
}

/**
 * Cover of a defending unit against a ranged attack from the attacking leader (R-11.2, R-11.3). A model is obscured when
 * its LoS is completely blocked, when it overlaps qualifying area terrain, or when one of its rays is blocked by a
 * qualifying piece: cover other than none, within half range of the model, not touched by the attacking leader, and (for
 * barricades) only when the defender benefits from barricades.
 */
export function coverFor(table: TableDef, attacker: LosBody, defenders: readonly LosBody[], opts: CoverOptions): CoverResult {
  const atkFoot = footprintOf(attacker)
  const allPieces = [...table.pieces, ...(opts.extraPieces ?? [])]
  const byId = new Map(allPieces.map((p) => [p.id, p]))
  const touched = new Set(
    allPieces.filter((p) => footprintGapToPiece(atkFoot, p) <= opts.constants.contactEpsilon + 1e-9).map((p) => p.id),
  )
  const minis: MiniCover[] = []
  const used = new Set<string>()
  for (const d of defenders) {
    const scan = scanRays(table, attacker, d, {
      ...(opts.extraPieces ? { extraPieces: opts.extraPieces } : {}),
      ...(opts.keepRays ? { keepRays: true } : {}),
    })
    const dFoot = footprintOf(d)
    const near = new Set(piecesWithin(allPieces, dFoot, opts.constants.halfRange).map((p) => p.id))
    const qualifies = (p: TerrainPiece): boolean =>
      p.cover !== 'none' && (p.kind !== 'barricade' || opts.barricadeCover) && !touched.has(p.id)
    const obscuredBy = new Set<string>()
    for (const id of Object.keys(scan.blocks)) {
      const p = byId.get(id)!
      if (qualifies(p) && near.has(id)) obscuredBy.add(id)
    }
    // overlapping area terrain always obscures (R-9.3)
    for (const p of allPieces) {
      if (p.kind === 'area' && qualifies(p) && footprintOverlapsPolygon(dFoot, p.footprint)) obscuredBy.add(p.id)
    }
    const fullyBlocked = !scan.visible
    if (fullyBlocked) {
      // RULING R-11.2: obscured by the terrain blocking its rays; the strongest of them sets the value, light if none has cover
      for (const id of Object.keys(scan.blocks)) {
        const p = byId.get(id)!
        if (p.cover !== 'none' && (p.kind !== 'barricade' || opts.barricadeCover) && !touched.has(id)) obscuredBy.add(id)
      }
    }
    const obscured = fullyBlocked || obscuredBy.size > 0
    let value: CoverValue = 'none'
    if (obscured) {
      value = 'light'
      for (const id of obscuredBy) if (byId.get(id)!.cover === 'heavy') value = 'heavy'
    }
    for (const id of obscuredBy) used.add(id)
    const mc: MiniCover = {
      id: d.id,
      visible: scan.visible,
      clear: scan.clear,
      total: scan.total,
      obscured,
      obscuredBy: [...obscuredBy].sort(),
      value,
      fullyBlocked,
    }
    if (scan.rays) mc.rays = scan.rays
    minis.push(mc)
  }
  const obscuredN = minis.filter((m) => m.obscured).length
  const hasCover = minis.length > 0 && obscuredN * 2 >= minis.length
  let base: CoverValue = 'none'
  if (hasCover) base = minis.some((m) => m.obscured && m.value === 'heavy') ? 'heavy' : 'light'
  const cover = opts.suppressed ? improveCover(base) : base
  return {
    minis,
    obscured: obscuredN,
    total: minis.length,
    hasCover,
    base,
    cover,
    byTerrainId: [...used].sort(),
    anyVisible: minis.some((m) => m.visible),
  }
}

/** Convenience for tests and the client: the point on the table plane under a body. */
export function bodyPoint(b: LosBody): Vec2 {
  return { x: round3(b.pos.x), z: round3(b.pos.z) }
}
