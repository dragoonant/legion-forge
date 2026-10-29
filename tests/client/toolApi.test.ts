// The movement-tool preview is the engine's own: every ok preview carries an action `validate` accepts, a reject carries the engine's
// reason, and the hinge preview re-solves toward the same destination. Run at a real `move.tool` decision.
import { describe, expect, it } from 'vitest'
import { validate, suggest, type GameState, type PendingDecision, type Vec2 } from '../../src/engine'
import { leaderOf } from '../../src/engine/state'
import { moveUnitId, previewHinge, previewToward, startingTarget } from '../../src/client/game/toolApi'
import { currentToolPreview, rememberToolPreview, ptKey, previewDeploy, deployFacing, deployUnitFor, turnedBy, bearingTo, previewDeployTroopers } from '../../src/client/interaction/controller'
import { playGame } from './fixtures'

function atMove(seed: string, deployed: boolean): { state: GameState; pending: PendingDecision } {
  const played = playGame(seed, (s, p) => {
    if (!p || p.kind !== 'move.tool') return false
    const u = s.units[String(p.context.unitId)]!
    return deployed ? u.location === 'table' : u.location !== 'table'
  })
  return { state: played.state, pending: played.pending! }
}

describe('tool preview', () => {
  it('on the table: a click toward a destination gives a legal pose whose action validate accepts', () => {
    const { state, pending } = atMove('tool-1', true)
    expect(pending.kind).toBe('move.tool')
    const unitId = moveUnitId(state, pending)!
    const lead = leaderOf(state.units[unitId]!)
    const target: Vec2 = { x: lead.pos.x + 3.5, z: lead.pos.z }
    let seen = 0
    for (const dx of [3, 3.5, 4, 5, -3, -4]) {
      const pv = previewToward(state, pending, { x: lead.pos.x + dx, z: lead.pos.z })
      if (pv.ok) {
        seen++
        expect(pv.action).not.toBeNull()
        expect(validate(state, pv.action!)).toBeNull()
        expect(pv.shape!.rects).toHaveLength(2)
        expect(pv.speed).toBeGreaterThanOrEqual(1)
        expect(pv.toolLength).toBeGreaterThan(0)
      } else {
        expect(pv.reason).toBeTruthy()
        expect(pv.action).toBeNull()
      }
    }
    expect(seen).toBeGreaterThan(0)
    expect(previewToward(state, pending, target)).toBeDefined()
  })

  it('a destination far out of reach is refused with the engine reason', () => {
    const { state, pending } = atMove('tool-2', true)
    const unitId = moveUnitId(state, pending)!
    const lead = leaderOf(state.units[unitId]!)
    const pv = previewToward(state, pending, { x: lead.pos.x + 30, z: lead.pos.z })
    expect(pv.ok).toBe(false)
    expect(pv.reason).toBeTruthy()
  })

  it('the hinge preview bends the tool about the hinge and still goes through validate', () => {
    const { state, pending } = atMove('tool-3', true)
    const unitId = moveUnitId(state, pending)!
    const lead = leaderOf(state.units[unitId]!)
    let base = previewToward(state, pending, { x: lead.pos.x + 4, z: lead.pos.z + 1 })
    for (const dz of [2, -2, 3, -3]) {
      if (base.ok) break
      base = previewToward(state, pending, { x: lead.pos.x + 4, z: lead.pos.z + dz })
    }
    expect(base.ok).toBe(true)
    const hinge = base.hinge!
    const bent = previewHinge(state, pending, base.speed!, { x: hinge.x + 0.3, z: hinge.z + 0.6 }, { x: lead.pos.x + 4, z: lead.pos.z + 1 })
    expect(bent.shape).not.toBeNull()
    expect(bent.pose!.hinges[0]).not.toBe(0)
    if (bent.ok) expect(validate(state, bent.action!)).toBeNull()
    else expect(bent.reason).toBeTruthy()
  })

  it('a unit entering the table is previewed from the edge span', () => {
    const { state, pending } = atMove('tool-4', false)
    expect(pending.context.deploying).toBe(true)
    const t = startingTarget(state, pending)!
    const pv = previewToward(state, pending, t)
    expect(pv.shape).not.toBeNull()
    if (pv.ok) expect(validate(state, pv.action!)).toBeNull()
  })

  it('the suggestion of the engine is among the previews the client can show', () => {
    const { state, pending } = atMove('tool-5', true)
    const a = suggest(state, pending, pending.seat as 'A')!
    expect(a.type).toBe('move.tool')
    expect(validate(state, a)).toBeNull()
  })
})

describe('controller helpers', () => {
  it('facing turns wrap and bearings follow the engine convention', () => {
    expect(turnedBy(Math.PI, Math.PI / 4)).toBeCloseTo(-3 * Math.PI / 4, 2)
    expect(bearingTo({ x: 0, z: 0 }, { x: 0, z: 5 })).toBe(0)
    expect(bearingTo({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2)
  })

  it('the last tool preview is remembered per key', () => {
    expect(currentToolPreview()).toBeNull()
    expect(ptKey({ x: 1, z: 2 })).toBe('4:8')
    expect(ptKey(null)).toBe('-')
    rememberToolPreview('k', null)
    expect(currentToolPreview()).toBeNull()
  })

  it('a deploy click is the engine verdict at the point; the unit comes from the decision', () => {
    const played = playGame('deploy-click', (_s, p) => p?.kind === 'setup.deploy')
    const { state, pending } = played
    expect(pending!.kind).toBe('setup.deploy')
    const id = deployUnitFor(pending!, null)!
    expect(deployUnitFor(pending!, 'not-a-unit')).toBe(id)
    const regions = pending!.context.regions as Vec2[][]
    const poly = regions[0]!
    const xs = poly.map((p) => p.x)
    const zs = poly.map((p) => p.z)
    const inside = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
    const facing = deployFacing(pending!, null)
    const ok = previewDeploy(state, pending!, id, inside, facing)
    const off = previewDeploy(state, pending!, id, { x: 0, z: 0 }, facing)
    expect(off.ok).toBe(false)
    expect(off.text.length).toBeGreaterThan(0)
    if (ok.ok) expect(previewDeployTroopers(state, pending!, id, inside).length).toBe(state.units[id]!.minis.length - 1)
  })
})
