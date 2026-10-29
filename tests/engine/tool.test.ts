import { describe, expect, it } from 'vitest'
import toolJson from '../../src/data/core/movement-tool.json'
import { bearing } from '../../src/engine/geometry'
import {
  checkBasePlacement,
  checkCohesion,
  deployPoseAt,
  findCohesionSpot,
  fitTool,
  nearestLegalSpot,
  poseAt,
  poseFromHinge,
  toolShape,
  troopersDifficultCheck,
  validateToolPose,
  type DeployStart,
} from '../../src/engine/tool'
import { body, box, moverAt, obstacle, SMALL_H, SMALL_R, SMALL_SAMPLES, TOOL, worldOf } from './fixtures'

const R = SMALL_R
const DEG = Math.PI / 180

/** A straight tool from the origin leaving along +Z. */
const straight = (speed: number, mover = moverAt(0, 0)) => poseAt(mover, speed, 0, 0)
const leaderAt = (x: number, z: number) => ({ x, z, yaw: 0 })

function ok(v: { ok: boolean }): void {
  expect(v).toMatchObject({ ok: true })
}

describe('movement tool', () => {
  it('MOVE-001 the tool data gives Speed-1/2/3 lengths 4.5/7.0/9.5, width 1.0, hinge at the midpoint, limit 135 degrees', () => {
    for (const [s, len] of [['1', 4.5], ['2', 7.0], ['3', 9.5]] as const) {
      const sp = toolJson.speeds[s]
      expect(sp.segments[0] + sp.segments[1]).toBeCloseTo(len, 9)
      expect(sp.hingeAt).toBeCloseTo(len / 2, 9)
    }
    expect(toolJson.widthIn).toBe(1)
    expect(toolJson.hingeLimitDeg).toBe(135)
    const shape = toolShape(TOOL, poseAt(moverAt(0, 0), 3, 0, 0))
    expect(Math.hypot(shape.path[2].x - shape.path[0].x, shape.path[2].z - shape.path[0].z)).toBeCloseTo(9.5, 6)
  })

  it('MOVE-002 a Speed-2 unit may use the Speed-1 or Speed-2 tool, never Speed-3', () => {
    const w = worldOf()
    const m = moverAt(0, 0, { maxSpeed: 2 })
    ok(validateToolPose(w, m, straight(1), leaderAt(0, 4)))
    ok(validateToolPose(w, m, straight(2), leaderAt(0, 6)))
    expect(validateToolPose(w, m, straight(3), leaderAt(0, 6))).toMatchObject({ ok: false, code: 'E_ACTION_RESTRICTED' })
  })

  it('MOVE-003 segment 1 starts on the leader\'s base and leaves it radially; a start off the base is rejected', () => {
    const w = worldOf()
    const m = moverAt(0, 0)
    const good = straight(1)
    expect(good.start.z).toBeCloseTo(R, 3)
    ok(validateToolPose(w, m, good, leaderAt(0, 4)))
    expect(validateToolPose(w, m, { ...good, start: { x: 0, z: R + 0.5 } }, leaderAt(0, 4))).toMatchObject({ ok: false, code: 'E_OFF_TOOL' })
    expect(validateToolPose(w, m, { ...good, heading: 30 * DEG }, leaderAt(0, 4))).toMatchObject({ ok: false, code: 'E_OFF_TOOL' })
  })

  it('MOVE-004 a leader touching the tool at its far tip is legal; 0.01" away is E_OFF_TOOL', () => {
    const w = worldOf()
    const m = moverAt(0, 0)
    const tip = R + 4.5
    ok(validateToolPose(w, m, straight(1), leaderAt(0, tip + R)))
    expect(validateToolPose(w, m, straight(1), leaderAt(0, tip + R + 0.01))).toMatchObject({ ok: false, code: 'E_OFF_TOOL', check: 3 })
    // the hinge cannot bend past the limit either
    expect(validateToolPose(w, m, poseAt(m, 1, 0, 140 * DEG), leaderAt(0, 3))).toMatchObject({ ok: false, code: 'E_OFF_TOOL' })
  })

  it('MOVE-005 a tool crossing impassable terrain is E_TERRAIN; crossing friendly and enemy models is legal', () => {
    const m = moverAt(0, 0, { maxSpeed: 3 })
    const wall = box('wall', -3, 2, 3, 3, { movement: 'impassable', heightIn: 0.5 })
    expect(validateToolPose(worldOf([wall]), m, straight(3), leaderAt(0, 8))).toMatchObject({ ok: false, code: 'E_TERRAIN', check: 2 })
    const crowd = [obstacle('f1', 0, 3), obstacle('e1', 0.3, 5, true)]
    ok(validateToolPose(worldOf([], crowd), m, straight(3), leaderAt(0, 8)))
  })

  it('MOVE-006 a leader ending on another model, a barricade or a point of interest is E_OVERLAP; touching is fine', () => {
    const m = moverAt(0, 0)
    expect(validateToolPose(worldOf([], [obstacle('f1', 0, 4)]), m, straight(1), leaderAt(0, 4.3))).toMatchObject({ ok: false, code: 'E_OVERLAP' })
    ok(validateToolPose(worldOf([], [obstacle('f1', 0, 4)]), m, straight(1), leaderAt(0, 4 + 2 * R + 0.001)))
    const barricade = box('b', -1, 3.5, 1, 4.5, { kind: 'barricade', heightIn: 1, cover: 'heavy' })
    expect(validateToolPose(worldOf([barricade]), m, straight(1), leaderAt(0, 4))).toMatchObject({ ok: false, code: 'E_OVERLAP' })
    const w = { ...worldOf(), pois: [{ pos: { x: 0, z: 4 }, baseRadius: 0.25 }] }
    expect(validateToolPose(w, m, straight(1), leaderAt(0, 4))).toMatchObject({ ok: false, code: 'E_OVERLAP' })
  })

  it('MOVE-007 ending in contact with an enemy is rejected when the leader has no melee weapon', () => {
    const enemy = [obstacle('e1', 0, 4 + 2 * R, true)]
    const noMelee = moverAt(0, 0, { canEngage: false })
    expect(validateToolPose(worldOf([], enemy), noMelee, straight(1), leaderAt(0, 4))).toMatchObject({ ok: false, code: 'E_ENGAGED', check: 5 })
    const melee = validateToolPose(worldOf([], enemy), moverAt(0, 0), straight(1), leaderAt(0, 4))
    expect(melee).toMatchObject({ ok: true, touchingEnemies: ['e1'] })
  })

  it('MOVE-008 clicking a reachable open-ground point gives a straight tool of the shortest sufficient speed', () => {
    const w = worldOf()
    const m = moverAt(0, 0, { maxSpeed: 3 })
    const a = fitTool(w, m, { x: 0, z: 4 })
    expect(a).toMatchObject({ ok: true })
    if (a.ok) {
      expect(a.pose.speed).toBe(1)
      expect(a.pose.hinges[0]).toBe(0)
    }
    const b = fitTool(w, m, { x: 3, z: 7 })
    expect(b.ok && b.pose.speed).toBe(2)
    expect(b.ok && b.pose.hinges[0]).toBe(0)
    const c = fitTool(w, m, { x: 0, z: 9.5 })
    expect(c.ok && c.pose.speed).toBe(3)
  })

  it('MOVE-009 a point behind a wall gets a bent legal tool, and validate agrees with the preview', () => {
    const wall = box('wall', -1, 2, 1, 3, { movement: 'impassable', heightIn: 3 })
    const w = worldOf([wall])
    const m = moverAt(0, 0, { maxSpeed: 3 })
    const target = { x: 0, z: 5.5 }
    const fit = fitTool(w, m, target)
    expect(fit).toMatchObject({ ok: true })
    if (!fit.ok) return
    expect(Math.abs(fit.pose.hinges[0]!)).toBeGreaterThan(0)
    expect(validateToolPose(w, m, fit.pose, fit.leader)).toMatchObject({ ok: true, speed: fit.pose.speed })
    expect(fit.leader.x).toBeCloseTo(target.x, 3)
  })

  it('MOVE-010 dragging the hinge keeps it on the circle of radius base + segment 1 and the bend re-solves toward the target', () => {
    const w = worldOf()
    const m = moverAt(0, 0, { maxSpeed: 3 })
    const target = { x: 6, z: 2 }
    const { pose, hinge } = poseFromHinge(w, m, 2, { x: 0.5, z: 9 }, target)
    expect(Math.hypot(hinge.x, hinge.z)).toBeCloseTo(R + TOOL.speeds['2'].segments[0], 9)
    const shape = toolShape(TOOL, pose)
    expect(shape.hinge.x).toBeCloseTo(hinge.x, 2)
    // the far tip is on the bearing from the hinge to the target
    const tipBearing = bearing(shape.hinge, shape.path[2])
    expect(tipBearing).toBeCloseTo(bearing(hinge, target), 2)
  })

  it('MOVE-011 an unreachable click is refused with the failing check, and the nearest legal leader spot is offered', () => {
    const w = worldOf()
    const m = moverAt(0, 0, { maxSpeed: 2 })
    const far = { x: 0, z: 15 }
    const miss = fitTool(w, m, far)
    expect(miss).toMatchObject({ ok: false, code: 'E_OUT_OF_RANGE' })
    const near = nearestLegalSpot(w, m, far)
    expect(near).not.toBeNull()
    expect(near!.because.code).toBe('E_OUT_OF_RANGE')
    expect(near!.spot.leader.z).toBeGreaterThan(5)
    expect(near!.spot.leader.z).toBeLessThan(15)
    expect(validateToolPose(w, m, near!.spot.pose, near!.spot.leader)).toMatchObject({ ok: true })
    // a click on top of another model is refused for its own reason
    expect(fitTool(worldOf([], [obstacle('f1', 0, 4)]), m, { x: 0, z: 4 })).toMatchObject({ ok: false, code: 'E_OVERLAP' })
  })

  it('MOVE-012 a deploying tool must start flush on the allied edge span', () => {
    const deploy: DeployStart = { edge: { a: { x: -10, z: -18 }, b: { x: 10, z: -18 } }, inward: { x: 0, z: 1 } }
    const w = worldOf()
    const m = moverAt(0, -18)
    ok(validateToolPose(w, m, deployPoseAt(deploy, 1, 0.5, 0), leaderAt(0, -15), deploy))
    // a start outside the span (or with a prong hanging off its end) is rejected
    const outside = { ...deployPoseAt(deploy, 1, 0.5, 0), start: { x: 15, z: -18 } }
    expect(validateToolPose(w, m, outside, leaderAt(15, -15), deploy)).toMatchObject({ ok: false, code: 'E_OFF_TOOL' })
    const hanging = { ...deployPoseAt(deploy, 1, 0.5, 0), start: { x: 9.8, z: -18 } }
    expect(validateToolPose(w, m, hanging, leaderAt(9.8, -15), deploy)).toMatchObject({ ok: false, code: 'E_OFF_TOOL' })
    // not perpendicular to the edge
    expect(validateToolPose(w, m, { ...deployPoseAt(deploy, 1, 0.5, 0), heading: 0.5 }, leaderAt(0, -15), deploy)).toMatchObject({ ok: false, code: 'E_OFF_TOOL' })
  })

  it('MOVE-013 starting with one trooper in difficult terrain caps a Speed-2 unit at Speed-1', () => {
    const w = worldOf()
    const m = moverAt(0, 0, { maxSpeed: 2, startsInDifficult: true })
    expect(validateToolPose(w, m, straight(2), leaderAt(0, 6))).toMatchObject({ ok: false, code: 'E_TERRAIN' })
    expect(validateToolPose(w, m, straight(1), leaderAt(0, 4))).toMatchObject({ ok: true, effectiveSpeed: 1 })
  })

  it('MOVE-014 a tool merely crossing difficult terrain reduces speed by 1; Speed 1 stays 1', () => {
    const rough = box('rough', -2, 2, 2, 3, { kind: 'area', movement: 'difficult', heightIn: 0, blocksLos: false, cover: 'none' })
    const w = worldOf([rough])
    expect(validateToolPose(w, moverAt(0, 0, { maxSpeed: 2 }), straight(2), leaderAt(0, 6))).toMatchObject({ ok: false, code: 'E_TERRAIN' })
    expect(validateToolPose(w, moverAt(0, 0, { maxSpeed: 2 }), straight(1), leaderAt(0, 4))).toMatchObject({ ok: true, touchesDifficult: true, effectiveSpeed: 1 })
    expect(validateToolPose(w, moverAt(0, 0, { maxSpeed: 1 }), straight(1), leaderAt(0, 4))).toMatchObject({ ok: true, effectiveSpeed: 1 })
  })

  it('MOVE-015 troopers placed into difficult terrain after a Speed-2 move are rejected; placed outside it, legal', () => {
    expect(troopersDifficultCheck(2, 2, true)).toMatchObject({ ok: false, code: 'E_TERRAIN' })
    expect(troopersDifficultCheck(2, 2, false)).toEqual({ ok: true })
    expect(troopersDifficultCheck(2, 1, true)).toEqual({ ok: true })
  })

  it('MOVE-016 a Standard Move over a 1" barricade is legal; over a 2" wall it is E_TERRAIN', () => {
    const m = moverAt(0, 0)
    const low = box('low', -1, 1.5, 1, 2.5, { kind: 'barricade', heightIn: 1, cover: 'heavy', blocksLos: false })
    ok(validateToolPose(worldOf([low]), m, straight(1), leaderAt(0, 4)))
    const wall = box('wall', -3, 1.5, 3, 2.5, { kind: 'obstacle', heightIn: 2, climbable: false })
    expect(validateToolPose(worldOf([wall]), m, straight(1), leaderAt(0, 4))).toMatchObject({ ok: false, code: 'E_TERRAIN', check: 2 })
  })

  it('MOVE-017 a trooper ending half on a rooftop is rejected; fully on it is legal', () => {
    const roof = box('roof', -3, 2, 3, 8, { kind: 'building', heightIn: 1.5, climbable: true })
    const w = worldOf([roof])
    const m = moverAt(0, 0)
    const edge = checkBasePlacement(w, { pos: { x: 0, z: 2 }, baseRadius: R }, { fromY: 0, silhouetteHeight: SMALL_H, climb: false, canEngage: true })
    expect(edge).toMatchObject({ ok: false, code: 'E_TERRAIN' })
    const on = validateToolPose(w, m, straight(1), leaderAt(0, 4))
    expect(on).toMatchObject({ ok: true, verticalChange: 1.5 })
    expect(on.ok && on.leader.y).toBe(1.5)
  })

  it('MOVE-018 a Climb onto a 4" roof uses Speed-1 only and succeeds; a Climb to 7" fails', () => {
    const m = moverAt(0, 0, { maxSpeed: 3 })
    const roof4 = box('roof', -3, 2, 3, 8, { kind: 'building', heightIn: 4, climbable: true })
    const climb = poseAt(m, 1, 0, 0, true)
    expect(validateToolPose(worldOf([roof4]), m, climb, leaderAt(0, 4))).toMatchObject({ ok: true, leader: { y: 4 } })
    // without Climb the same move is refused
    expect(validateToolPose(worldOf([roof4]), m, straight(1, m), leaderAt(0, 4))).toMatchObject({ ok: false, code: 'E_TERRAIN' })
    // a Climb is Speed-1 whatever the unit's speed
    expect(validateToolPose(worldOf([roof4]), m, { ...climb, speed: 2 }, leaderAt(0, 6))).toMatchObject({ ok: false, code: 'E_ACTION_RESTRICTED' })
    const roof7 = box('roof7', -3, 2, 3, 8, { kind: 'building', heightIn: 7, climbable: true })
    expect(validateToolPose(worldOf([roof7]), m, climb, leaderAt(0, 4))).toMatchObject({ ok: false, code: 'E_TERRAIN' })
  })

  it('MOVE-019 a leader placement with any part of the base off the table is rejected', () => {
    const m = moverAt(0, 17)
    expect(validateToolPose(worldOf(), m, straight(1, m), leaderAt(0, 17.9))).toMatchObject({ ok: false, code: 'E_OUT_OF_RANGE' })
    expect(fitTool(worldOf(), m, { x: 0, z: 17.9 })).toMatchObject({ ok: false, code: 'E_OUT_OF_RANGE' })
    ok(validateToolPose(worldOf(), m, poseAt(m, 1, Math.PI, 0), leaderAt(0, 12)))
  })

  it('MOVE-020 moving across an objective token is legal (tokens are not obstacles); ending on a POI is not', () => {
    const w = { ...worldOf(), pois: [{ pos: { x: 0, z: 2.5 }, baseRadius: 0.3 }] }
    ok(validateToolPose(w, moverAt(0, 0), straight(1), leaderAt(0, 4)))
    expect(validateToolPose(w, moverAt(0, 0), straight(1), leaderAt(0, 2.6))).toMatchObject({ ok: false, code: 'E_OVERLAP' })
  })
})

describe('cohesion', () => {
  const leader = body('L', 0, 0)
  const at = (gap: number, z = 0, y = 0) => body('T', 2 * R + gap, z, y)
  const c = { cohesionDistance: 3 }

  it('COH-001 a trooper 2.9" from the leader is in cohesion; 3.1" is not', () => {
    const t = worldOf().table
    expect(checkCohesion(t, c, leader, at(2.9))).toMatchObject({ ok: true, distance: 2.9 })
    expect(checkCohesion(t, c, leader, at(3.1))).toMatchObject({ ok: false, failure: 'distance' })
  })

  it('COH-002 within 3" but the measurement crosses impassable terrain is out of cohesion', () => {
    const wall = box('w', R + 0.8, -2, R + 1.0, 2, { movement: 'impassable', blocksLos: false, heightIn: 1 })
    expect(checkCohesion(worldOf([wall]).table, c, leader, at(2))).toMatchObject({ ok: false, failure: 'impassable' })
  })

  it('COH-003 a trooper without LoS to the leader is out of cohesion', () => {
    const screen = box('s', R + 0.8, -2, R + 1.0, 2, { heightIn: 3, blocksLos: true })
    expect(checkCohesion(worldOf([screen]).table, c, leader, at(2))).toMatchObject({ ok: false, failure: 'los' })
  })

  it('COH-004 a trooper 1.6" above the leader is in cohesion (small silhouette 1.69"); 1.8" above is not', () => {
    const t = worldOf().table
    expect(checkCohesion(t, c, leader, at(1, 0, 1.6)).ok).toBe(true)
    expect(checkCohesion(t, c, leader, at(1, 0, 1.8))).toMatchObject({ ok: false, failure: 'vertical' })
  })

  it('COH-005 with no legal spot within 3" the engine places the trooper at the closest legal spot, out of cohesion', () => {
    // four impassable slabs leave only the leader's own spot inside a 3" circle
    const slabs = [
      box('n', -8, 0.8, 8, 6, { movement: 'impassable', blocksLos: false, heightIn: 0.5 }),
      box('s', -8, -6, 8, -0.8, { movement: 'impassable', blocksLos: false, heightIn: 0.5 }),
      box('e', 0.8, -0.8, 6, 0.8, { movement: 'impassable', blocksLos: false, heightIn: 0.5 }),
      box('w', -6, -0.8, -0.8, 0.8, { movement: 'impassable', blocksLos: false, heightIn: 0.5 }),
    ]
    const w = worldOf(slabs)
    const spot = findCohesionSpot(w, leader, { baseRadius: R, height: SMALL_H, samples: SMALL_SAMPLES }, { silhouetteHeight: SMALL_H })
    expect(spot).not.toBeNull()
    expect(spot!.inCohesion).toBe(false)
    // an open table gives a spot in cohesion
    const open = findCohesionSpot(worldOf(), leader, { baseRadius: R, height: SMALL_H, samples: SMALL_SAMPLES }, { silhouetteHeight: SMALL_H }, { x: 2, z: 0 })
    expect(open).toMatchObject({ inCohesion: true })
    expect(Math.hypot(open!.pos.x - 2, open!.pos.z)).toBeLessThan(0.5)
  })

  it('COH-007 cohesion is horizontal: a trooper 2" away on a 1" step (within the silhouette height) is in cohesion', () => {
    const step = box('step', 2 * R + 1, -1, 2 * R + 3.5, 1, { kind: 'building', heightIn: 1, climbable: true, blocksLos: false })
    const w = worldOf([step])
    const t = body('T', 2 * R + 2, 0, 1)
    const v = checkCohesion(w.table, c, leader, t)
    expect(v.ok).toBe(true)
    expect(v.distance).toBe(2)
  })
})
