// M2c review findings 17 (Scout) and 18 (Jump): both reach the action menu from the keyword records and run a real Move.
import { describe, expect, it } from 'vitest'
import '../../../src/engine'
import type { GameState } from '../../../src/engine'
import { actionMenu } from '../../../src/engine/activation'
import { validateToolPose } from '../../../src/engine/tool'
import { advance, edit, events, hasOption, must, optionAction, unitBy } from './helpers'
import { firstTurn, ready, startOf } from './m2c-helpers'
import { box, moverAt, worldOf } from '../fixtures'
import { poseAt } from '../../../src/engine/tool'

const menuOf = (state: GameState) => actionMenu(state, state.units[state.activation.current!.unitId]!)

describe('M2c Scout and Jump (review 17, 18)', () => {
  it('RVW-17 Scout: an undeployed Scout Troopers unit may deploy at the start of its Make Actions with a free Speed-3 Move that ignores difficult terrain', () => {
    const f = firstTurn()
    const id = unitBy(f.state, 'A', 'emp.u.scout-troopers', 0).id
    const s = ready(f.state, id, null, (x) => {
      x.units[id]!.location = 'reserve'
    })
    let r = startOf(s, id)
    expect(menuOf(r.state).items.map((i) => i.id)).toContain('scout')
    r = must(r.state, optionAction(r.state, 'scout'))
    expect(r.pending!.kind).toBe('move.tool')
    expect(r.pending!.context).toMatchObject({ kind: 'move', maxSpeed: 3, deploying: true, free: true })
    r = advance(r, (p) => p.kind === 'action.choose')
    const u = r.state.units[id]!
    expect(u.location).toBe('table')
    // a free action: both actions are still there, and the Scout Move is not offered twice
    expect(r.state.activation.current!.actionsLeft).toBe(2)
    expect(r.state.activation.current!.performed).toEqual([{ action: 'free.move', free: true, move: true }])
    expect(hasOption(r.state, 'scout')).toBe(false)
    expect(events(r, 'UnitDeployed')).toHaveLength(1)
  })

  it('RVW-17 Scout is only for a unit that has the keyword and has not acted yet', () => {
    const f = firstTurn()
    const stormId = unitBy(f.state, 'A', 'emp.u.stormtroopers', 0).id
    const storm = ready(f.state, stormId, null, (x) => {
      x.units[stormId]!.location = 'reserve'
    })
    expect(menuOf(startOf(storm, stormId).state).items.map((i) => i.id)).not.toContain('scout')
    const id = unitBy(f.state, 'A', 'emp.u.scout-troopers', 0).id
    const s = ready(f.state, id, null, (x) => {
      x.units[id]!.location = 'reserve'
    })
    const r = startOf(s, id)
    const late = edit(r.state, (x) => {
      x.activation.current!.performed.push({ action: 'aim', free: false })
    })
    expect(menuOf(late).items.map((i) => i.id)).not.toContain('scout')
  })

  it('RVW-18 Jump 1: Luke is offered the Jump card action, it is a Move that costs one action and ignores difficult terrain', () => {
    const f = firstTurn()
    const luke = unitBy(f.state, 'B', 'reb.u.luke-hotr').id
    const s = ready(f.state, luke, [14, 10], (x) => {
      x.units[luke]!.location = 'table'
    })
    let r = startOf(s, luke)
    const jump = menuOf(r.state).items.find((i) => i.action === 'cardAction' && i.id.includes('jump'))
    expect(jump).toBeDefined()
    r = must(r.state, optionAction(r.state, jump!.id))
    expect(r.pending!.kind).toBe('move.tool')
    expect(r.pending!.context).toMatchObject({ kind: 'move', free: false })
    r = advance(r, (p) => p.kind === 'action.choose')
    const a = r.state.activation.current!
    expect(a.actionsLeft).toBe(1)
    expect(a.performed[0]).toMatchObject({ move: true, free: false })
    expect(a.performed[0]!.action).toContain('jump')
    // once per activation
    expect(menuOf(r.state).items.some((i) => i.id.includes('jump'))).toBe(false)
  })

  it('RVW-18 the Jump Move may lay the tool over impassable terrain and ignores obstacles of height X or lower, but may not end on impassable terrain', () => {
    const wall = box('wall', -3, 2, 3, 3, { movement: 'impassable', heightIn: 0.5 })
    const m = moverAt(0, 0, { maxSpeed: 3 })
    const straight = (speed: number) => poseAt(m, speed, 0, 0)
    const leader = (z: number) => ({ x: 0, z, yaw: 0 })
    expect(validateToolPose(worldOf([wall]), m, straight(3), leader(8))).toMatchObject({ ok: false, code: 'E_TERRAIN', check: 2 })
    expect(validateToolPose(worldOf([wall]), { ...m, jumpHeight: 1 }, straight(3), leader(8))).toMatchObject({ ok: true })
    // ending on the wall is still refused
    const wide = box('wide', -3, 7, 3, 9, { movement: 'impassable', heightIn: 0.5 })
    expect(validateToolPose(worldOf([wide]), { ...m, jumpHeight: 1 }, straight(3), leader(8))).toMatchObject({ ok: false })
    // a 1" obstacle is a step Jump 1 ignores; a 3" one is not
    const low = box('low', -3, 2, 3, 3, { heightIn: 1 })
    const tall = box('tall', -3, 2, 3, 3, { heightIn: 3 })
    expect(validateToolPose(worldOf([tall]), { ...m, silhouetteHeight: 0.5 }, straight(3), leader(8))).toMatchObject({ ok: false })
    expect(validateToolPose(worldOf([low]), { ...m, silhouetteHeight: 0.5, jumpHeight: 1 }, straight(3), leader(8))).toMatchObject({ ok: true })
    // difficult terrain does not limit a Jump or Scout Move
    const mud = box('mud', -3, 2, 3, 3, { movement: 'difficult', heightIn: 0 })
    expect(validateToolPose(worldOf([mud]), m, straight(3), leader(8))).toMatchObject({ ok: false, code: 'E_TERRAIN', check: 6 })
    expect(validateToolPose(worldOf([mud]), { ...m, ignoreDifficult: true }, straight(3), leader(8))).toMatchObject({ ok: true })
  })
})
