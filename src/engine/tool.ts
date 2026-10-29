// The movement tool (00 section 7.3, R-6) and cohesion (R-7). The tool is two straight segments joined by a hinge; a pose
// is where segment 1 starts (flush against the leader's base, or on the table edge when deploying), its heading and the
// hinge angle. The leader is then set down touching or overlapping the tool. `validateToolPose` is the single legality test
// (checks (1)-(5) of R-6.4 in order, first failure is the rejection); `fitTool` solves a requested destination into a
// legal hinged pose (R-6.5); `cohesion*` check and place the rest of the unit. Pure: no state, no clock.
import { bearing, distPointSegment, distToPolygon, distToPolygonBoundary, pointInPolygon, round3 } from './geometry'
import { footprintGap2D, footprintInsideBounds, footprintInsidePolygon, footprintOverlapsPolygon, angleDelta, type Footprint } from './footprint'
import { hasLos, type LosBody } from './los'
import { piecesOverlapping, segmentCrossesImpassable } from './table'
import type { MovementToolDef, Polygon, Pose2, RejectionCode, RuleConstants, Segment2, TableDef, TerrainPiece, ToolPose, Vec2 } from './types'

/** A base other than the mover's leader that the placement must respect. */
export interface Obstacle extends Footprint {
  id: string
  enemy: boolean
  /** the unit the base belongs to: a model may never touch bases of two enemy units (CRB p28) */
  unitId?: string
}

export interface ToolWorld {
  table: TableDef
  tool: MovementToolDef
  constants: RuleConstants
  /** every other base on the table (friendly and enemy, the mover's own troopers included when they are placed) */
  others: readonly Obstacle[]
  /** points of interest: tokens may be crossed but no model may end overlapping one (R-18.2) */
  pois?: readonly Footprint[]
}

export interface Mover {
  pos: Vec2
  /** elevation of the surface the leader stands on (0, or a rooftop height) */
  y: number
  baseRadius: number
  silhouetteHeight: number
  /** the unit's speed after non-terrain modifiers (1-3) */
  maxSpeed: number
  /** the leader has a melee weapon, so it may end in base contact with an enemy (R-16.1 ruling) */
  canEngage: boolean
  /** any miniature of the unit starts in difficult terrain (R-6.7) */
  startsInDifficult?: boolean
  /** a Scout or Jump Move ignores difficult terrain (CRB p52, p54) */
  ignoreDifficult?: boolean
  /** a Jump X Move: terrain of height X or lower is ignored, may be stood on, and impassable terrain may lie under the tool (CRB p52) */
  jumpHeight?: number
}

/** Where a deploying unit's tool starts: a span on the table edge and the inward normal (R-6.6). */
export interface DeployStart {
  edge: Segment2
  inward: Vec2
}

export interface ToolShape {
  /** the two segment rectangles */
  rects: [Polygon, Polygon]
  hinge: Vec2
  hingeRadius: number
  /** centreline: start, hinge, far tip */
  path: [Vec2, Vec2, Vec2]
}

const DEG = Math.PI / 180
/** how far a requested start may sit from the base circle, and how far its heading may deviate from radial */
const START_TOL = 0.02
const HEADING_TOL = 2 * DEG

export type ToolVerdict =
  | {
      ok: true
      speed: number
      leader: Pose2 & { y: number }
      toolPath: Vec2[]
      /** the highest speed the unit could use here after difficult terrain */
      effectiveSpeed: number
      touchesDifficult: boolean
      endsInDifficult: boolean
      /** enemy unit bases the leader ends in contact with */
      touchingEnemies: string[]
      verticalChange: number
    }
  | { ok: false; code: RejectionCode; reason: string; check: number; details?: Record<string, unknown> }

function fail(code: RejectionCode, check: number, reason: string, details?: Record<string, unknown>): ToolVerdict {
  return details ? { ok: false, code, reason, check, details } : { ok: false, code, reason, check }
}

// ---------------------------------------------------------------------------
// Geometry of the tool
// ---------------------------------------------------------------------------

function dir(heading: number): Vec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) }
}

function rect(p: Vec2, q: Vec2, halfWidth: number): Polygon {
  const dx = q.x - p.x
  const dz = q.z - p.z
  const len = Math.hypot(dx, dz) || 1
  const nx = (-dz / len) * halfWidth
  const nz = (dx / len) * halfWidth
  return [
    { x: p.x + nx, z: p.z + nz },
    { x: q.x + nx, z: q.z + nz },
    { x: q.x - nx, z: q.z - nz },
    { x: p.x - nx, z: p.z - nz },
  ]
}

/** The footprint of a pose: segment rectangles of the tool's width and a disc at the hinge to fill the bend. */
export function toolShape(def: MovementToolDef, pose: ToolPose): ToolShape {
  const sp = def.speeds[String(pose.speed) as '1' | '2' | '3']
  if (!sp) throw new Error(`no movement tool for speed ${pose.speed}`)
  const d1 = dir(pose.heading)
  const hinge: Vec2 = { x: pose.start.x + d1.x * sp.segments[0], z: pose.start.z + d1.z * sp.segments[0] }
  const d2 = dir(pose.heading + (pose.hinges[0] ?? 0))
  const tip: Vec2 = { x: hinge.x + d2.x * sp.segments[1], z: hinge.z + d2.z * sp.segments[1] }
  const hw = def.widthIn / 2
  return { rects: [rect(pose.start, hinge, hw), rect(hinge, tip, hw)], hinge, hingeRadius: hw, path: [pose.start, hinge, tip] }
}

/** Distance from a point to the tool's footprint (0 when on it). */
export function distToTool(shape: ToolShape, p: Vec2): number {
  return Math.min(distToPolygon(p, shape.rects[0]), distToPolygon(p, shape.rects[1]), Math.max(0, Math.hypot(p.x - shape.hinge.x, p.z - shape.hinge.z) - shape.hingeRadius))
}

function segIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const d1 = o(a, b, c)
  const d2 = o(a, b, d)
  const d3 = o(c, d, a)
  const d4 = o(c, d, b)
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12
}

function strictlyInside(p: Vec2, poly: Polygon): boolean {
  return pointInPolygon(p, poly) && distToPolygonBoundary(p, poly) > 1e-6
}

/** Do two simple polygons overlap with positive area (touching along an edge is not overlap)? */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segIntersect(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) return true
    }
  }
  return a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a))
}

/** Terrain pieces the tool's footprint overlaps. */
export function piecesUnderTool(table: TableDef, shape: ToolShape): TerrainPiece[] {
  return table.pieces.filter(
    (p) =>
      polygonsOverlap(shape.rects[0], p.footprint) ||
      polygonsOverlap(shape.rects[1], p.footprint) ||
      footprintOverlapsPolygon({ pos: shape.hinge, baseRadius: shape.hingeRadius }, p.footprint),
  )
}

/** A pose with segment 1 leaving the leader's base radially at bearing `theta` and one hinge angle. */
export function poseAt(mover: Pick<Mover, 'pos' | 'baseRadius'>, speed: number, theta: number, hinge: number, climb = false): ToolPose {
  const d = dir(theta)
  const pose: ToolPose = {
    speed,
    start: { x: round3(mover.pos.x + d.x * mover.baseRadius), z: round3(mover.pos.z + d.z * mover.baseRadius) },
    heading: theta,
    hinges: [hinge],
  }
  if (climb) pose.climb = true
  return pose
}

/** A deployment pose: segment 1 leaves the table edge perpendicular, starting `t` (0..1) along the span (R-6.6). */
export function deployPoseAt(deploy: DeployStart, speed: number, t: number, hinge: number): ToolPose {
  const { a, b } = deploy.edge
  return {
    speed,
    start: { x: round3(a.x + (b.x - a.x) * t), z: round3(a.z + (b.z - a.z) * t) },
    heading: Math.atan2(deploy.inward.x, deploy.inward.z),
    hinges: [hinge],
  }
}

// ---------------------------------------------------------------------------
// Placement legality (R-6.4 (4)-(5)), shared with trooper placement
// ---------------------------------------------------------------------------

export interface PlacementInfo {
  /** elevation of the surface the base ends on (an obstacle top, or 0) */
  surface: number
  difficult: boolean
  touchingEnemies: string[]
}

export interface PlacementRules {
  /** elevation of the surface the unit came from */
  fromY: number
  silhouetteHeight: number
  climb: boolean
  canEngage: boolean
  /** ignore the vertical-change rule (deploying: measured from the edge) */
  skipVertical?: boolean
  /** a Jump X Move may end on terrain up to this height */
  jumpHeight?: number
  /** ids of obstacles to ignore (the mover itself) */
  ignore?: ReadonlySet<string>
}

/**
 * Can a base end here? Order: on the table, not overlapping a model, POI or barricade, not on or across impassable terrain,
 * wholly on any obstacle it overlaps, vertical change within limits, and no contact with an enemy unless the leader may
 * engage. Returns the surface and flags, or the failure.
 */
export function checkBasePlacement(world: ToolWorld, base: Footprint, r: PlacementRules): { ok: true; info: PlacementInfo } | { ok: false; code: RejectionCode; reason: string; check: number } {
  const eps = world.constants.contactEpsilon
  if (!footprintInsideBounds(base, world.table.bounds)) return { ok: false, code: 'E_OUT_OF_RANGE', reason: 'the base would leave the table', check: 4 }
  for (const o of world.others) {
    if (r.ignore?.has(o.id)) continue
    if (Math.hypot(base.pos.x - o.pos.x, base.pos.z - o.pos.z) < base.baseRadius + o.baseRadius - eps) {
      return { ok: false, code: 'E_OVERLAP', reason: `the base would overlap ${o.id}`, check: 4 }
    }
  }
  for (const poi of world.pois ?? []) {
    if (Math.hypot(base.pos.x - poi.pos.x, base.pos.z - poi.pos.z) < base.baseRadius + poi.baseRadius - eps) {
      return { ok: false, code: 'E_OVERLAP', reason: 'no model may end overlapping a point of interest', check: 4 }
    }
  }
  let surface = 0
  let difficult = false
  for (const p of piecesOverlapping(world.table, base)) {
    if (p.movement === 'impassable') return { ok: false, code: 'E_TERRAIN', reason: `the base would stand on impassable terrain (${p.id})`, check: 4 }
    if (p.kind === 'barricade') return { ok: false, code: 'E_OVERLAP', reason: `no model may end overlapping a barricade (${p.id})`, check: 4 }
    if (p.movement === 'difficult') difficult = true
    if (p.kind === 'obstacle' || p.kind === 'building') {
      if (!p.climbable || !footprintInsidePolygon(base, p.footprint)) {
        return { ok: false, code: 'E_TERRAIN', reason: `a base must lie completely on obstacle terrain, never partly on it (${p.id})`, check: 4 }
      }
      surface = Math.max(surface, p.heightIn)
    }
  }
  if (!r.skipVertical) {
    const limit = Math.max(r.climb ? world.constants.heightBandSize : r.silhouetteHeight, r.jumpHeight ?? 0)
    const change = Math.abs(surface - r.fromY)
    if (change > limit + 1e-9) {
      return { ok: false, code: 'E_TERRAIN', reason: `height change ${round3(change)}" is more than ${round3(limit)}"${r.climb ? '' : ' (a Climb is needed)'}`, check: 4 }
    }
  }
  const touchingEnemies = world.others
    .filter((o) => o.enemy && !r.ignore?.has(o.id) && footprintGap2D(base, o) <= eps + 1e-9)
    .map((o) => o.id)
  if (touchingEnemies.length > 0 && !r.canEngage) {
    return { ok: false, code: 'E_ENGAGED', reason: 'this leader has no melee weapon and may not end in base contact with an enemy', check: 5 }
  }
  // a model never touches bases of two enemy units, though several units may join a Melee later (CRB p28)
  const touchedUnits = new Set(world.others.filter((o) => touchingEnemies.includes(o.id)).map((o) => o.unitId ?? o.id))
  if (touchedUnits.size > 1) {
    return { ok: false, code: 'E_ENGAGED', reason: 'a model may never end in base contact with models of two enemy units', check: 5 }
  }
  return { ok: true, info: { surface, difficult, touchingEnemies } }
}

// ---------------------------------------------------------------------------
// validate (R-6.4)
// ---------------------------------------------------------------------------

function onSpan(p: Vec2, edge: Segment2, halfWidth: number): boolean {
  const dx = edge.b.x - edge.a.x
  const dz = edge.b.z - edge.a.z
  const len = Math.hypot(dx, dz)
  const t = ((p.x - edge.a.x) * dx + (p.z - edge.a.z) * dz) / (len * len)
  const off = Math.abs((p.x - edge.a.x) * dz - (p.z - edge.a.z) * dx) / len
  const along = t * len
  return off <= START_TOL && along >= halfWidth - START_TOL && along <= len - halfWidth + START_TOL
}

/**
 * Is this tool pose, with the leader set down at `leader`, legal? Checks in the order of R-6.4: structure of the pose
 * (start flush, radial, hinge within limits), (1) speed, (2) tool across terrain, (3) leader touches the tool, (4) leader
 * placement, (5) enemy contact, then the difficult-terrain speed cap. The first failure is the rejection.
 */
export function validateToolPose(world: ToolWorld, mover: Mover, pose: ToolPose, leader: Pose2, deploy?: DeployStart): ToolVerdict {
  const nums = [pose.speed, pose.start.x, pose.start.z, pose.heading, leader.x, leader.z, leader.yaw, ...pose.hinges]
  if (!nums.every(Number.isFinite) || pose.hinges.length !== 1) return fail('E_SCHEMA', 0, 'malformed tool pose')
  if (!Number.isInteger(pose.speed) || pose.speed < 1 || pose.speed > 3) return fail('E_ACTION_RESTRICTED', 1, `there is no Speed-${pose.speed} tool`)
  const limit = world.tool.hingeLimitDeg * DEG
  if (Math.abs(pose.hinges[0]!) > limit + 1e-9) return fail('E_OFF_TOOL', 0, `the hinge bends past ${world.tool.hingeLimitDeg} degrees`)

  // structure: segment 1 starts flush on the leader's base (or the allied edge span) and leaves radially (R-6.3, R-6.6)
  if (deploy) {
    if (!onSpan(pose.start, deploy.edge, world.tool.widthIn / 2)) return fail('E_OFF_TOOL', 0, 'a deploying tool must start with both prongs on the allied edge span')
    const want = Math.atan2(deploy.inward.x, deploy.inward.z)
    if (Math.abs(angleDelta(want, pose.heading)) > HEADING_TOL) return fail('E_OFF_TOOL', 0, 'a deploying tool leaves the edge perpendicular to it')
  } else {
    const off = Math.hypot(pose.start.x - mover.pos.x, pose.start.z - mover.pos.z) - mover.baseRadius
    if (Math.abs(off) > START_TOL) return fail('E_OFF_TOOL', 0, 'the tool must start against the leader\'s base', { off: round3(off) })
    const radial = bearing(mover.pos, pose.start)
    if (Math.abs(angleDelta(radial, pose.heading)) > HEADING_TOL) return fail('E_OFF_TOOL', 0, 'the tool must leave the base radially')
  }

  // (1) speed
  const maxSpeed = pose.climb ? 1 : mover.maxSpeed
  if (pose.speed > maxSpeed) {
    return fail('E_ACTION_RESTRICTED', 1, pose.climb ? 'a Climb uses the Speed-1 tool only' : `this unit's speed is ${mover.maxSpeed}`)
  }

  // (2) the tool across terrain
  const shape = toolShape(world.tool, pose)
  const band = world.constants.heightBandSize
  const reach = pose.climb ? band : mover.silhouetteHeight
  let touchesDifficult = false
  for (const p of piecesUnderTool(world.table, shape)) {
    if (p.movement === 'impassable') {
      // a Jump may lay the tool over impassable terrain (it may still not end there, checked with the leader's base)
      if (mover.jumpHeight === undefined) return fail('E_TERRAIN', 2, `the tool crosses impassable terrain (${p.id})`)
      continue
    }
    const jumped = mover.jumpHeight !== undefined && p.heightIn <= mover.jumpHeight + 1e-9
    if (!jumped && (p.kind === 'obstacle' || p.kind === 'building' || p.kind === 'barricade') && p.heightIn - mover.y > reach + 1e-9) {
      return fail('E_TERRAIN', 2, `the tool crosses ${p.id}, taller than ${round3(reach)}"${pose.climb ? '' : ' (a Climb is needed)'}`)
    }
    if (p.movement === 'difficult') touchesDifficult = true
  }

  // (3) the leader's base touches or overlaps the tool
  const eps = world.constants.contactEpsilon
  const dTool = distToTool(shape, leader)
  if (dTool > mover.baseRadius + eps + 1e-9) {
    return fail('E_OFF_TOOL', 3, 'the leader\'s base does not touch the tool', { gap: round3(dTool - mover.baseRadius) })
  }

  // (4)-(5) placement
  const placed = checkBasePlacement(world, { pos: { x: leader.x, z: leader.z }, baseRadius: mover.baseRadius }, {
    fromY: mover.y,
    silhouetteHeight: mover.silhouetteHeight,
    climb: pose.climb === true,
    canEngage: mover.canEngage,
    ...(mover.jumpHeight !== undefined ? { jumpHeight: mover.jumpHeight } : {}),
    ...(deploy ? { skipVertical: true } : {}),
  })
  if (!placed.ok) return fail(placed.code, placed.check, placed.reason)

  // difficult terrain: starting in it, the tool crossing it or ending in it costs one speed (min 1) (R-6.7)
  const difficult = mover.ignoreDifficult !== true && (touchesDifficult || placed.info.difficult || mover.startsInDifficult === true)
  const effectiveSpeed = difficult ? Math.max(1, mover.maxSpeed - 1) : mover.maxSpeed
  if (!pose.climb && pose.speed > effectiveSpeed) {
    return fail('E_TERRAIN', 6, `difficult terrain limits this move to the Speed-${effectiveSpeed} tool`)
  }
  return {
    ok: true,
    speed: pose.speed,
    leader: { x: round3(leader.x), z: round3(leader.z), yaw: leader.yaw, y: placed.info.surface },
    toolPath: shape.path.map((p) => ({ x: round3(p.x), z: round3(p.z) })),
    effectiveSpeed,
    touchesDifficult,
    endsInDifficult: placed.info.difficult,
    touchingEnemies: [...new Set(placed.info.touchingEnemies)],
    verticalChange: round3(Math.abs(placed.info.surface - mover.y)),
  }
}

/** Speed after difficult terrain: -1, minimum 1, once however many ways apply (R-6.7). */
export function effectiveSpeed(maxSpeed: number, difficult: boolean): number {
  return difficult ? Math.max(1, maxSpeed - 1) : maxSpeed
}

/**
 * After `move.troopers`: if any miniature of the unit began or ended in difficult terrain, or the tool crossed it, the tool
 * used must fit the reduced speed, else the placement is rejected (R-6.4 (6), RULING Port choice).
 */
export function troopersDifficultCheck(maxSpeed: number, toolSpeed: number, anyDifficult: boolean): { ok: true } | { ok: false; code: 'E_TERRAIN'; reason: string } {
  const allowed = effectiveSpeed(maxSpeed, anyDifficult)
  return toolSpeed <= allowed ? { ok: true } : { ok: false, code: 'E_TERRAIN', reason: `difficult terrain limits this move to the Speed-${allowed} tool` }
}

// ---------------------------------------------------------------------------
// Fitting a path (R-6.5)
// ---------------------------------------------------------------------------

export interface ToolFit {
  ok: true
  pose: ToolPose
  leader: Pose2
  verdict: Extract<ToolVerdict, { ok: true }>
}
export interface ToolMiss {
  ok: false
  code: RejectionCode
  reason: string
  check: number
}

const THETA_STEPS = 72
const HINGE_STEP = 5 * DEG

function reachOf(world: ToolWorld, speed: number): number {
  const sp = world.tool.speeds[String(speed) as '1' | '2' | '3']
  return sp.segments[0] + sp.segments[1]
}

/**
 * Click a destination: try the tools from shortest to longest (never above `maxSpeed`), straight first, then a search over
 * the start angle (72 steps) and hinge (5 degree steps) keeping the legal pose with the smallest bend, then the smallest
 * turn from the direct bearing.
 */
export function fitTool(world: ToolWorld, mover: Mover, target: Vec2, opts: { yaw?: number; climb?: boolean; maxSpeed?: number } = {}): ToolFit | ToolMiss {
  const climb = opts.climb === true
  const maxSpeed = climb ? 1 : Math.min(3, opts.maxSpeed ?? mover.maxSpeed)
  const eps = world.constants.contactEpsilon
  const direct = bearing(mover.pos, target)
  const yaw = opts.yaw ?? direct
  const leader: Pose2 = { x: round3(target.x), z: round3(target.z), yaw }
  const dist = Math.hypot(target.x - mover.pos.x, target.z - mover.pos.z)

  // the destination itself must be a legal place to end, whatever tool gets there
  const dest = checkBasePlacement(world, { pos: target, baseRadius: mover.baseRadius }, {
    fromY: mover.y,
    silhouetteHeight: mover.silhouetteHeight,
    climb,
    canEngage: mover.canEngage,
  })
  if (!dest.ok) return { ok: false, code: dest.code, reason: dest.reason, check: dest.check }
  if (dist > mover.baseRadius * 2 + reachOf(world, maxSpeed) + eps) {
    return { ok: false, code: 'E_OUT_OF_RANGE', reason: 'that spot is beyond the longest tool this unit may use', check: 3 }
  }

  let firstFailure: ToolMiss | null = null
  for (let speed = 1; speed <= maxSpeed; speed++) {
    if (dist > mover.baseRadius * 2 + reachOf(world, speed) + eps) continue
    const attempt = (theta: number, hinge: number): ToolFit | null => {
      const pose = poseAt(mover, speed, theta, hinge, climb)
      const v = validateToolPose(world, mover, pose, leader)
      if (v.ok) return { ok: true, pose, leader, verdict: v }
      firstFailure ??= { ok: false, code: v.code, reason: v.reason, check: v.check }
      return null
    }
    // straight first, toward the click
    const direct0 = attempt(direct, 0)
    if (direct0) return direct0
    // then the search over start angle and hinge, smallest bend first, then the smallest turn from the direct bearing
    const limit = world.tool.hingeLimitDeg * DEG
    const hw = world.tool.widthIn / 2
    const reach: { theta: number; hinge: number; bend: number; turn: number }[] = []
    for (let i = 0; i < THETA_STEPS; i++) {
      const theta = direct + angleDelta(0, (2 * Math.PI * i) / THETA_STEPS)
      for (let h = -limit; h <= limit + 1e-9; h += HINGE_STEP) {
        const hinge = Math.abs(h) < 1e-9 ? 0 : h
        if (hinge === 0 && i === 0) continue
        const pose = poseAt(mover, speed, theta, hinge, climb)
        const shape = toolShape(world.tool, pose)
        // cheap lower bound first: the footprint lies within half a width of the centreline
        const centre = Math.min(distPointSegment(target, shape.path[0], shape.path[1]), distPointSegment(target, shape.path[1], shape.path[2]))
        if (centre - hw > mover.baseRadius + eps) continue
        if (distToTool(shape, target) <= mover.baseRadius + eps) {
          reach.push({ theta, hinge, bend: Math.abs(hinge), turn: Math.abs(angleDelta(direct, theta)) })
        }
      }
    }
    reach.sort((a, b) => a.bend - b.bend || a.turn - b.turn)
    for (const t of reach) {
      const fit = attempt(t.theta, t.hinge)
      if (fit) return fit
    }
  }
  return firstFailure ?? { ok: false, code: 'E_OFF_TOOL', reason: 'no tool placement reaches that spot', check: 3 }
}

/**
 * The nearest legal leader spot toward an unreachable click: walk back from the target along the line to the leader in
 * quarter-inch steps and return the first spot `fitTool` can reach, with the failing check of the original click.
 */
export function nearestLegalSpot(world: ToolWorld, mover: Mover, target: Vec2, opts: { climb?: boolean; maxSpeed?: number } = {}): { spot: ToolFit; because: ToolMiss } | null {
  const first = fitTool(world, mover, target, opts)
  if (first.ok) return null
  const dist = Math.hypot(target.x - mover.pos.x, target.z - mover.pos.z)
  const maxSpeed = Math.min(3, opts.climb ? 1 : (opts.maxSpeed ?? mover.maxSpeed))
  const farthest = mover.baseRadius * 2 + reachOf(world, maxSpeed)
  for (let d = Math.min(dist, farthest); d > mover.baseRadius * 2; d -= 0.25) {
    const f = d / dist
    const p: Vec2 = { x: round3(mover.pos.x + (target.x - mover.pos.x) * f), z: round3(mover.pos.z + (target.z - mover.pos.z) * f) }
    const fit = fitTool(world, mover, p, opts)
    if (fit.ok) return { spot: fit, because: first }
  }
  return null
}

/**
 * Dragging the hinge: the hinge point is constrained to the circle of radius (base radius + segment 1) around the leader,
 * which sets the start angle; the hinge angle then re-solves toward the target, clamped to the limit.
 */
export function poseFromHinge(world: ToolWorld, mover: Mover, speed: number, hingePoint: Vec2, target: Vec2): { pose: ToolPose; hinge: Vec2 } {
  const sp = world.tool.speeds[String(speed) as '1' | '2' | '3']
  const theta = bearing(mover.pos, hingePoint)
  const d = dir(theta)
  const r = mover.baseRadius + sp.segments[0]
  const hinge: Vec2 = { x: mover.pos.x + d.x * r, z: mover.pos.z + d.z * r }
  const limit = world.tool.hingeLimitDeg * DEG
  const want = Math.hypot(target.x - hinge.x, target.z - hinge.z) < 1e-9 ? 0 : angleDelta(theta, bearing(hinge, target))
  const phi = Math.max(-limit, Math.min(limit, want))
  return { pose: poseAt(mover, speed, theta, phi), hinge }
}

// ---------------------------------------------------------------------------
// Cohesion (R-7)
// ---------------------------------------------------------------------------

export type CohesionFailure = 'distance' | 'impassable' | 'los' | 'vertical'

export interface CohesionVerdict {
  ok: boolean
  /** horizontal base-edge distance to the leader */
  distance: number
  failure?: CohesionFailure
}

/**
 * Is a trooper in cohesion with its leader? Within `cohesionDistance` horizontally (edge to edge), the straight measurement
 * not crossing impassable terrain, LoS to the leader, and within the leader's silhouette height vertically (R-7.1).
 */
export function checkCohesion(table: TableDef, c: Pick<RuleConstants, 'cohesionDistance'>, leader: LosBody, mini: LosBody): CohesionVerdict {
  const lf: Footprint = { pos: { x: leader.pos.x, z: leader.pos.z }, baseRadius: leader.baseRadius }
  const mf: Footprint = { pos: { x: mini.pos.x, z: mini.pos.z }, baseRadius: mini.baseRadius }
  const distance = round3(footprintGap2D(lf, mf))
  if (distance > c.cohesionDistance + 1e-9) return { ok: false, distance, failure: 'distance' }
  if (distance > 0) {
    const dx = mini.pos.x - leader.pos.x
    const dz = mini.pos.z - leader.pos.z
    const len = Math.hypot(dx, dz) || 1
    const p1 = { x: leader.pos.x + (dx / len) * leader.baseRadius, z: leader.pos.z + (dz / len) * leader.baseRadius }
    const p2 = { x: mini.pos.x - (dx / len) * mini.baseRadius, z: mini.pos.z - (dz / len) * mini.baseRadius }
    if (segmentCrossesImpassable(table, p1, p2)) return { ok: false, distance, failure: 'impassable' }
  }
  if (!hasLos(table, leader, mini)) return { ok: false, distance, failure: 'los' }
  if (Math.abs(mini.pos.y - leader.pos.y) > leader.height + 1e-9) return { ok: false, distance, failure: 'vertical' }
  return { ok: true, distance }
}

export interface CohesionSpot {
  pos: Vec2
  y: number
  inCohesion: boolean
}

/**
 * Where a trooper goes when the player has no preference or none is legal in cohesion (R-7.2, RULING Port choice): the
 * legal spot in cohesion closest to `prefer` (the leader when omitted); when no spot in cohesion exists, the closest legal
 * spot to the leader, flagged out of cohesion. Null only when nothing within 12" is legal.
 */
export function findCohesionSpot(
  world: ToolWorld,
  leader: LosBody,
  trooper: { baseRadius: number; height: number; samples: LosBody['samples'] },
  rules: Omit<PlacementRules, 'canEngage' | 'climb' | 'fromY'> & { fromY?: number },
  prefer?: Vec2,
): CohesionSpot | null {
  const centre: Vec2 = { x: leader.pos.x, z: leader.pos.z }
  const first = leader.baseRadius + trooper.baseRadius
  let bestIn: { spot: CohesionSpot; score: number } | null = null
  let bestOut: { spot: CohesionSpot; score: number } | null = null
  for (let k = 0; k <= 48; k++) {
    const rho = first + 0.05 + k * 0.25
    const steps = Math.max(12, Math.ceil((2 * Math.PI * rho) / 0.35))
    let ringHadCohesive = false
    for (let i = 0; i < steps; i++) {
      const a = (2 * Math.PI * i) / steps
      const pos: Vec2 = { x: round3(centre.x + Math.sin(a) * rho), z: round3(centre.z + Math.cos(a) * rho) }
      const placed = checkBasePlacement(world, { pos, baseRadius: trooper.baseRadius }, { ...rules, fromY: rules.fromY ?? leader.pos.y, climb: false, canEngage: false })
      if (!placed.ok) continue
      const body: LosBody = { id: 'candidate', pos: { x: pos.x, y: placed.info.surface, z: pos.z }, baseRadius: trooper.baseRadius, height: trooper.height, samples: trooper.samples }
      const v = checkCohesion(world.table, world.constants, leader, body)
      const score = Math.hypot(pos.x - (prefer ?? centre).x, pos.z - (prefer ?? centre).z)
      if (v.ok) {
        ringHadCohesive = true
        if (!bestIn || score < bestIn.score) bestIn = { spot: { pos, y: placed.info.surface, inCohesion: true }, score }
      } else if (!bestOut || rho < Math.hypot(bestOut.spot.pos.x - centre.x, bestOut.spot.pos.z - centre.z)) {
        bestOut = { spot: { pos, y: placed.info.surface, inCohesion: false }, score: rho }
      }
    }
    // rings grow monotonically; once an in-cohesion spot exists and the ring left the cohesion band, stop
    if (bestIn && !ringHadCohesive) break
    if (!bestIn && bestOut && rho > first + world.constants.cohesionDistance + 0.5) break
  }
  return bestIn?.spot ?? bestOut?.spot ?? null
}
