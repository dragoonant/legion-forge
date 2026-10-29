import { describe, expect, it } from 'vitest'
import { step, type GameState, type StepResult } from '../../../src/engine'
import { act } from '../../../src/engine/actions'
import { deploySpans, flowOf } from '../../../src/engine/battle'
import { moverFor } from '../../../src/engine/movement'
import { deployPoseAt, poseAt } from '../../../src/engine/tool'
import { leaderOf } from '../../../src/engine/state'
import type { EngineBundle, TableLayout } from '../../../src/engine'
import { ScriptedRng, advance, edit, events, must, newGame, optionAction, pick, place, realBundle, unitBy } from './helpers'

const CARDS = ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.cunning-deployment', 'rec.adv.fortified-position']

function roundOne(bundle: EngineBundle = realBundle(), layout?: string): StepResult {
  const g = newGame({ generic: true, cards: CARDS, options: { autoDeploy: true }, ...(layout ? { layout } : {}) }, 't1', bundle)
  return advance(pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.push' }), (p) => p.kind === 'activation.choose')
}

/** The unit is on the table at (x, z) with a face-up order and has started its activation with the move action chosen. */
function moving(r: StepResult, unitId: string, at: [number, number] | null, action = 'move', patch: (s: GameState) => void = () => undefined): StepResult {
  const s = edit(r.state, (x) => {
    const u = x.units[unitId]!
    if (u.order.state === 'pool') x.players[u.seat].pool.tokens.splice(x.players[u.seat].pool.tokens.indexOf(u.rank), 1)
    u.order.state = 'faceUp'
    if (at) place(u, at[0], at[1])
    patch(x)
    x.pending = { ...x.pending!, seat: u.seat, options: [{ id: `unit:${unitId}`, labelKey: 'x', action: { type: 'activation.choose', seat: u.seat, decisionId: x.pending!.id, payload: { unitId } } }] }
  })
  const started = must(s, s.pending!.options![0]!.action)
  return must(started.state, optionAction(started.state, action))
}

const toolAction = (state: GameState, pose: ReturnType<typeof poseAt>, leader: { x: number; z: number; yaw: number }) => act.tool(state.pending!, pose, leader)

describe('entering and moving', () => {
  it('MOVE-012 a deploying unit\'s tool must start flush on the allied-Territory edge span; a start outside the span is rejected', () => {
    const r = roundOne()
    const first = r.pending!.options![0]!.action
    const st = must(r.state, first)
    const move = must(st.state, optionAction(st.state, 'move'))
    expect(move.pending!.kind).toBe('move.tool')
    expect(move.pending!.context.deploying).toBe(true)
    const unit = move.state.units[(first.payload as { unitId: string }).unitId]!
    const spans = deploySpans(move.state, unit.seat)
    expect(spans).toHaveLength(2)
    const speed = move.pending!.context.maxSpeed as number
    const good = deployPoseAt(spans[0]!, speed, 0.5, 0)
    const len = speed === 1 ? 4.5 : 7
    const tip = { x: good.start.x + Math.sin(good.heading) * len, z: good.start.z + Math.cos(good.heading) * len }
    const ok = step(move.state, toolAction(move.state, good, { ...tip, yaw: good.heading }))
    expect(ok.rejection).toBeUndefined()
    // a start in the middle of the edge is outside both corner spans (Close the Pocket)
    const bad = { ...good, start: { x: 0, z: good.start.z } }
    const rej = step(move.state, toolAction(move.state, bad, { x: 0, z: tip.z, yaw: good.heading }))
    expect(rej.rejection?.code).toBe('E_OFF_TOOL')
  })

  it('MOVE-015 troopers placed into difficult terrain after a Speed-2 move are rejected; the engine\'s own placement stays outside it', () => {
    const r = roundOne()
    const id = unitBy(r.state, 'A', 'emp.u.scout-troopers', 0).id
    // t1 (difficult area) spans x 4.5..8, z -3..3. The leader moves north along x = 2 and ends outside it
    const mv = moving(r, id, [2, -5])
    const mover = moverFor(mv.state, mv.state.units[id]!, flowOf(mv.state).move!)
    const pose = poseAt(mover, 2, 0, 0)
    const tipZ = -5 + 0.53 + 7
    const t = must(mv.state, toolAction(mv.state, pose, { x: 2, z: tipZ - 0.2, yaw: 0 }))
    expect(t.pending!.kind).toBe('move.troopers')
    const sug = t.pending!.context.suggestion as { miniId: string; x: number; z: number; yaw: number }[]
    expect(t.pending!.context.maxSpeed).toBe(2)
    // move one trooper into the difficult terrain at (5, 1)
    const placed = sug.map((p, i) => (i === 0 ? { ...p, x: 5, z: 1 } : p))
    const rej = step(t.state, act.troopers(t.state.pending!, placed))
    expect(rej.rejection?.code).toBe('E_TERRAIN')
    const lead = leaderOf(t.state.units[id]!)
    const ok = step(t.state, act.troopers(t.state.pending!, sug))
    expect(ok.rejection).toBeUndefined()
    void lead
  })

  it('MOVE-018 a Climb onto a 4" roof uses only the Speed-1 tool and succeeds; a Climb to 7" fails', () => {
    const piece = (id: string, cx: number, cz: number, h: number): TableLayout['pieces'][number] => ({
      id,
      kind: 'obstacle',
      footprint: [{ x: cx - 2, z: cz - 2 }, { x: cx + 2, z: cz - 2 }, { x: cx + 2, z: cz + 2 }, { x: cx - 2, z: cz + 2 }],
      heightIn: h,
      cover: 'heavy',
      blocksLos: true,
      movement: 'open',
      climbable: true,
    })
    const layout: TableLayout = { id: 'lay.test', size: { x: 36, z: 36 }, pieces: [piece('roof4', 0, -6, 4), piece('roof7', 10, -6, 7)] }
    const bundle: EngineBundle = { data: { ...realBundle().data, layouts: { ...realBundle().data.layouts, [layout.id]: layout } } }
    const r = roundOne(bundle, layout.id)
    const id = unitBy(r.state, 'A', 'emp.u.darth-vader-dlots').id
    const mv = moving(r, id, [0, -10], 'climb')
    expect(mv.pending!.kind).toBe('move.tool')
    expect(mv.pending!.context.maxSpeed).toBe(1)
    const mover = moverFor(mv.state, mv.state.units[id]!, flowOf(mv.state).move!)
    const climb = poseAt(mover, 1, 0, 0, true)
    // speed 2 is refused for a Climb
    const fast = step(mv.state, toolAction(mv.state, { ...climb, speed: 2 }, { x: 0, z: -6, yaw: 0 }))
    expect(fast.rejection?.code).toBe('E_ACTION_RESTRICTED')
    const up = must(mv.state, toolAction(mv.state, climb, { x: 0, z: -6, yaw: 0 }))
    expect(leaderOf(up.state.units[id]!).pos.y).toBe(4)
    expect(events(up, 'UnitMoved')).toHaveLength(1)
    // the 7" roof is more than one height band
    const mv7 = moving(r, id, [10, -10], 'climb')
    const mover7 = moverFor(mv7.state, mv7.state.units[id]!, flowOf(mv7.state).move!)
    const bad = step(mv7.state, toolAction(mv7.state, poseAt(mover7, 1, 0, 0, true), { x: 10, z: -6, yaw: 0 }))
    expect(bad.rejection?.code).toBe('E_TERRAIN')
  })

  it('MOVE-019 a leader placement with any part of the base off the table is rejected', () => {
    const r = roundOne()
    const id = unitBy(r.state, 'A', 'emp.u.darth-vader-dlots').id
    const mv = moving(r, id, [0, 16.5])
    const mover = moverFor(mv.state, mv.state.units[id]!, flowOf(mv.state).move!)
    const pose = poseAt(mover, 1, 0, 0)
    const rej = step(mv.state, toolAction(mv.state, pose, { x: 0, z: 17.7, yaw: 0 }))
    expect(rej.rejection?.code).toBe('E_OUT_OF_RANGE')
  })

  it('MOVE-020 moving across an objective token is legal; ending overlapping a POI is rejected', () => {
    const r = roundOne()
    const id = unitBy(r.state, 'A', 'emp.u.scout-troopers', 0).id
    const mv = moving(r, id, [0, -4.5])
    const mover = moverFor(mv.state, mv.state.units[id]!, flowOf(mv.state).move!)
    const pose = poseAt(mover, 2, 0, 0)
    // the Stockpile at the centre (0, 0) has a 2" token: the tool passes over it
    const across = step(mv.state, toolAction(mv.state, pose, { x: 0, z: 2.5, yaw: 0 }))
    expect(across.rejection).toBeUndefined()
    const onIt = step(mv.state, toolAction(mv.state, pose, { x: 0, z: 0.8, yaw: 0 }))
    expect(onIt.rejection?.code).toBe('E_OVERLAP')
  })
})

describe('cohesion after a Move', () => {
  it('COH-001 a trooper within the cohesion distance is placed; one beyond it is E_COHESION while a spot in cohesion exists', () => {
    const r = roundOne()
    const id = unitBy(r.state, 'A', 'emp.u.scout-troopers', 0).id
    const mv = moving(r, id, [-15, -5])
    const mover = moverFor(mv.state, mv.state.units[id]!, flowOf(mv.state).move!)
    const t = must(mv.state, toolAction(mv.state, poseAt(mover, 2, 0, 0), { x: -15, z: 1.5, yaw: 0 }))
    expect(t.pending!.kind).toBe('move.troopers')
    const sug = t.pending!.context.suggestion as { miniId: string; x: number; z: number; yaw: number }[]
    const lead = leaderOf(t.state.units[id]!)
    // scouts keep to 3": 2.9 away from the base edge is in cohesion, 3.5 is not
    const at = (d: number) => ({ x: lead.pos.x + (d + 1.063), z: lead.pos.z })
    const ok = step(t.state, act.troopers(t.state.pending!, sug.map((p, i) => (i === 0 ? { ...p, ...at(2.9) } : p))))
    expect(ok.rejection).toBeUndefined()
    const far = step(t.state, act.troopers(t.state.pending!, sug.map((p, i) => (i === 0 ? { ...p, ...at(3.5) } : p))))
    expect(far.rejection?.code).toBe('E_COHESION')
    const missing = step(t.state, act.troopers(t.state.pending!, sug.slice(1)))
    expect(missing.rejection?.code).toBe('E_SCHEMA')
    void ScriptedRng
  })

  it('COH-005 a model that cannot be placed in cohesion is placed as close as possible and the move is accepted, flagged out of cohesion', () => {
    const r = roundOne()
    const id = unitBy(r.state, 'A', 'emp.u.scout-troopers', 0).id
    // a cohesion range tighter than any base-to-base gap leaves no spot in cohesion at all
    const mv = moving(r, id, [-15, -5], 'move', (x) => void (x.units[id]!.flags.cohesionRange = 0.01))
    const mover = moverFor(mv.state, mv.state.units[id]!, flowOf(mv.state).move!)
    const t = must(mv.state, toolAction(mv.state, poseAt(mover, 2, 0, 0), { x: -15, z: 1.5, yaw: 0 }))
    expect(t.pending!.kind).toBe('move.troopers')
    const done = must(t.state, { type: 'pass', seat: 'A', decisionId: t.pending!.id, payload: {} })
    const unit = done.state.units[id]!
    expect(unit.minis.filter((m) => m.id !== unit.leaderId).every((m) => m.outOfCohesion === true)).toBe(true)
    expect(events(done, 'TroopersPlaced')[0]).toMatchObject({ type: 'TroopersPlaced' })
  })
})

