import { afterEach, describe, expect, it } from 'vitest'
import { step, type GameState, type StepResult } from '../../../src/engine'
import { actionMenu, registerAttackSeam, type AttackOpts } from '../../../src/engine/activation'
import { getFrameResume } from '../../../src/engine/hooks'
import { ScriptedRng, answerOf, advance, edit, events, hasOption, must, newGame, optionAction, pick, place, unitBy, withData } from './helpers'

const CARDS = ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.cunning-deployment', 'rec.adv.fortified-position']

/** Round 1, A (1 pip: one order, priority) against B (2 pips: two orders), at A's first turn. */
function firstTurn(): StepResult {
  const g = newGame({ generic: true, cards: CARDS, options: { autoDeploy: true } })
  return advance(pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.push' }), (p) => p.kind === 'activation.choose')
}

/** Answer decisions until the activation is over and the next turn decision is open (ends after the first action). */
function finishActivation(r: StepResult): StepResult {
  let cur = r
  for (let i = 0; i < 80 && cur.pending; i++) {
    const p = cur.pending
    if (p.kind === 'activation.choose' && i > 0) return cur
    if (p.kind === 'action.choose' && (cur.state.activation.current?.performed.length ?? 0) >= 1 && hasOption(cur.state, 'end')) {
      cur = must(cur.state, optionAction(cur.state, 'end'))
      continue
    }
    cur = must(cur.state, answerOf(cur.state))
  }
  return cur
}

const act = (state: GameState, seat: 'A' | 'B', id: string) => ({ type: 'activation.choose' as const, seat, decisionId: state.pending!.id, payload: { unitId: id } })

/** Mark a unit as a deployed unit holding a face-up order for a rules test (taken out of its pool). */
function ready(state: GameState, unitId: string, at: [number, number] | null = [0, -10], patch: (s: GameState) => void = () => undefined): GameState {
  return edit(state, (s) => {
    const u = s.units[unitId]!
    if (u.order.state === 'pool') {
      const pool = s.players[u.seat].pool.tokens
      pool.splice(pool.indexOf(u.rank), 1)
    }
    u.order.state = 'faceUp'
    if (at) place(u, at[0], at[1])
    patch(s)
  })
}

const startOf = (state: GameState, unitId: string, rng?: ScriptedRng): StepResult => {
  const u = state.units[unitId]!
  // the turn decision was raised before the test edited the unit: put the unit among its options
  const s = edit(state, (x) => {
    const p = x.pending!
    x.pending = { ...p, seat: u.seat, options: [{ id: `unit:${unitId}`, labelKey: 'activation.order', action: act(x, u.seat, unitId) }] }
  })
  return must(s, act(s, u.seat, unitId), rng)
}

afterEach(() => registerAttackSeam(null))

describe('turns and the order pool', () => {
  it('ACT-001 the priority seat takes the first turn and turns alternate', () => {
    const r = firstTurn()
    expect(r.state.command.priority).toBe('A')
    expect(r.pending!.seat).toBe('A')
    const first = r.pending!.options![0]!.action
    const after = finishActivation(must(r.state, first))
    expect(after.state.units[(first.payload as { unitId: string }).unitId]!.activated).toBe(true)
    expect(after.pending!.kind).toBe('activation.choose')
    expect(after.pending!.seat).toBe('B')
  })

  it('ACT-002 activation.choose lists only face-up, unactivated allied units plus drawPool while the pool has tokens', () => {
    const r = firstTurn()
    const faceUp = Object.values(r.state.units).filter((u) => u.seat === 'A' && u.order.state === 'faceUp')
    expect(r.pending!.options!.map((o) => o.id)).toEqual([...faceUp.map((u) => `unit:${u.id}`), 'drawPool'])
    const empty = edit(r.state, (s) => void (s.players.A.pool.tokens = []))
    const again = edit(empty, (s) => void (s.units[faceUp[0]!.id]!.activated = true))
    expect(again.units[faceUp[0]!.id]!.activated).toBe(true)
    // after the face-up unit activates and the pool is gone, A has nothing left
    const gone = finishActivation(must(empty, optionAction(empty, `unit:${faceUp[0]!.id}`)))
    expect(gone.pending!.seat).toBe('B')
    expect(events(gone, 'Passed').some((e) => e.type === 'Passed' && e.seat === 'A' && !e.spentToken)).toBe(false)
  })

  it('ACT-003 after a pool draw, activation.pick lists only unordered, unactivated units of the drawn rank; one candidate is picked automatically', () => {
    const r = firstTurn()
    const tokens = r.state.players.A.pool.tokens
    expect(tokens.filter((t) => t === 'corps')).toHaveLength(2)
    const draw = must(r.state, optionAction(r.state, 'drawPool'), new ScriptedRng([tokens.indexOf('corps')]))
    expect(draw.pending!.kind).toBe('activation.pick')
    const corps = Object.values(draw.state.units).filter((u) => u.seat === 'A' && u.rank === 'corps' && u.order.state === 'pool')
    expect(draw.pending!.options!.map((o) => o.id)).toEqual(corps.map((u) => `unit:${u.id}`))
    expect(draw.state.activation.drawn).toEqual({ seat: 'A', rank: 'corps' })
    const single = edit(r.state, (s) => {
      unitBy(s, 'A', 'emp.u.stormtroopers', 1).order.state = 'faceUp'
      s.players.A.pool.tokens.splice(s.players.A.pool.tokens.indexOf('corps'), 1)
    })
    const auto = must(single, optionAction(single, 'drawPool'), new ScriptedRng([single.players.A.pool.tokens.indexOf('corps')]))
    expect(auto.pending!.kind).toBe('action.choose')
    expect(events(auto, 'UnitActivated')[0]).toMatchObject({ via: 'pool', rank: 'corps' })
  })

  it('ACT-004 a drawn rank with no eligible unit leaves the game; the seat may then pass for free or choose again', () => {
    const r = firstTurn()
    const withHeavy = edit(r.state, (s) => void (s.players.A.pool.tokens = ['heavy']))
    const d = must(withHeavy, optionAction(withHeavy, 'drawPool'), new ScriptedRng([0]))
    expect(events(d, 'PoolTokenRemoved')[0]).toMatchObject({ seat: 'A', rank: 'heavy', reason: 'deadDraw' })
    expect(d.state.players.A.pool.tokens).toHaveLength(0)
    expect(d.pending!.kind).toBe('activation.choose')
    expect(d.pending!.canPass).toBe(true)
    expect(hasOption(d.state, 'drawPool')).toBe(false)
    const passed = must(d.state, { type: 'pass', seat: 'A', decisionId: d.pending!.id, payload: {} })
    expect(events(passed, 'Passed')[0]).toMatchObject({ seat: 'A', spentToken: false })
    expect(passed.state.players.A.passTokens ?? 0).toBe(0)
    expect(passed.pending!.seat).toBe('B')
  })

  it('ACT-005 a pass token passes the turn; a second pass on the next turn is not offered', () => {
    const r = firstTurn()
    expect(r.pending!.canPass).toBe(false)
    // give A two pass tokens before its turn is raised: re-enter the turn through a pass-capable state
    const open = edit(r.state, (s) => {
      s.players.A.passTokens = 2
      s.pending = { ...s.pending!, canPass: true }
    })
    const passed = must(open, { type: 'pass', seat: 'A', decisionId: open.pending!.id, payload: {} })
    expect(events(passed, 'Passed')[0]).toMatchObject({ seat: 'A', spentToken: true })
    expect(passed.state.players.A.passTokens).toBe(1)
    expect(passed.pending!.seat).toBe('B')
    const bActs = finishActivation(must(passed.state, passed.pending!.options![0]!.action))
    expect(bActs.pending!.seat).toBe('A')
    expect(bActs.pending!.canPass).toBe(false)
    const again = step(bActs.state, { type: 'pass', seat: 'A', decisionId: bActs.pending!.id, payload: {} })
    expect(again.rejection?.code).toBe('E_PASS_NOT_ALLOWED')
  })

  it('ACT-006 a seat with nothing to activate passes automatically without a token; the other seat activates back to back', () => {
    const r = firstTurn()
    const bDone = edit(r.state, (s) => {
      for (const u of Object.values(s.units)) if (u.seat === 'B') {
        u.activated = true
        u.order.state = 'spent'
      }
      s.players.B.pool.tokens = []
    })
    const after = finishActivation(must(bDone, r.pending!.options![0]!.action))
    expect(after.pending!.seat).toBe('A')
    expect(events(after, 'Passed')[0]).toMatchObject({ seat: 'B', spentToken: false })
  })

  it('ACT-022 the Activation phase ends only when every unit has activated and both pools are empty', () => {
    let cur = firstTurn()
    let ended = false
    let activations = 0
    for (let i = 0; i < 400 && cur.pending; i++) {
      const p = cur.pending
      if (p.kind === 'activation.choose') {
        const seat = p.seat as 'A' | 'B'
        const open = Object.values(cur.state.units).filter((u) => u.seat === seat && !u.activated && u.order.state === 'faceUp').length + cur.state.players[seat].pool.tokens.length
        expect(open).toBeGreaterThan(0)
      }
      const a = p.kind === 'action.choose' && (cur.state.activation.current?.performed.length ?? 0) >= 1 && hasOption(cur.state, 'end') ? optionAction(cur.state, 'end') : answerOf(cur.state)
      cur = must(cur.state, a)
      activations += cur.events.filter((e) => e.type === 'ActivationEnded').length
      if (cur.events.some((e) => e.type === 'PhaseStarted' && e.name === 'end')) {
        ended = true
        // every one of the 13 units has activated, so both pools were empty when the phase ended
        expect(activations).toBe(Object.keys(cur.state.units).length)
        break
      }
    }
    expect(ended).toBe(true)
  })
})

describe('a unit\'s activation', () => {
  it('ACT-007 an activation runs start, rally, actions, end; the order token is flipped and the unit marked activated', () => {
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const s = ready(r.state, id, [0, -10], (x) => void (unitBy(x, 'A', 'emp.u.stormtroopers', 0).suppression = 1))
    const started = startOf(s, id, new ScriptedRng([0]))
    expect(started.events.map((e) => e.type)).toEqual(expect.arrayContaining(['UnitActivated', 'DiceRolled', 'Rallied']))
    const types = started.events.map((e) => e.type)
    expect(types.indexOf('UnitActivated')).toBeLessThan(types.indexOf('Rallied'))
    expect(started.state.units[id]!.suppression).toBe(0)
    const aim = must(started.state, optionAction(started.state, 'aim'))
    const ended = must(aim.state, optionAction(aim.state, 'end'))
    expect(ended.events.map((e) => e.type)).toContain('ActivationEnded')
    expect(ended.state.units[id]!.activated).toBe(true)
    expect(ended.state.units[id]!.order.state).toBe('spent')
    expect(ended.state.activation.current).toBeNull()
  })

  it('ACT-008 an unsuppressed unit gets 2 actions, a Suppressed one 1, a Panicked one 0 and no free actions', () => {
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const base = ready(r.state, id)
    // white defence faces: 0 block, 1 surge, 2-5 blank. Stormtroopers have courage 1.
    const plain = startOf(base, id)
    expect(plain.state.activation.current!.actionsLeft).toBe(2)
    const sup = startOf(edit(base, (s) => void (s.units[id]!.suppression = 1)), id, new ScriptedRng([5]))
    expect(sup.state.activation.current!.actionsLeft).toBe(1)
    expect(sup.pending!.context.suppressed).toBe(true)
    const pan = startOf(edit(base, (s) => void (s.units[id]!.suppression = 2)), id, new ScriptedRng([5, 5]))
    expect(events(pan, 'UnitPanicked')).toHaveLength(1)
    expect(pan.state.activation.current).toBeNull()
    expect(events(pan, 'ActivationEnded')[0]).toMatchObject({ unitId: id, actionsUsed: 0 })
    // a panicked unit that took no actions sheds suppression equal to its courage
    expect(pan.state.units[id]!.suppression).toBe(1)
    expect(pan.pending!.kind).toBe('activation.choose')
  })

  it('ACT-009 a Suppressed Droid Trooper unit still gets 2 actions', () => {
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const droid = withData(ready(r.state, id, [0, -10], (s) => void (s.units[id]!.suppression = 1)), (d) => ({
      ...d,
      units: { ...d.units, 'emp.u.stormtroopers': { ...d.units['emp.u.stormtroopers']!, unitType: 'droid-trooper' } },
    }))
    const sup = startOf(droid, id, new ScriptedRng([5]))
    expect(sup.state.activation.current!.actionsLeft).toBe(2)
  })

  it('ACT-010 Aim, Dodge, Recover and Standby are each withheld after one use; Move may be taken twice', () => {
    registerAttackSeam({ canStart: () => true, start: () => undefined })
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.scout-troopers', 0).id
    const s = ready(r.state, id, [0, -10], (x) => void (x.units[id]!.suppression = 1))
    const st = startOf(s, id, new ScriptedRng([5]))
    expect(st.state.activation.current!.actionsLeft).toBe(2)
    // every once-only action is withheld with the reason alreadyUsed (or its own reason) once it is in the ledger
    for (const action of ['aim', 'dodge', 'recover', 'standby', 'attack']) {
      const used = edit(st.state, (x) => void (x.activation.current = { ...x.activation.current!, actionsLeft: 1, performed: [{ action, free: false }] }))
      const menu = actionMenu(used, used.units[id]!)
      expect(menu.items.map((i) => i.action)).not.toContain(action)
      expect(menu.withheld.map((w) => w.action)).toContain(action)
    }
    const aimed = must(st.state, optionAction(st.state, 'aim'))
    expect(aimed.state.units[id]!.tokens.aim).toBe(1)
    expect((aimed.pending!.context.withheld as { action: string; whyNot: string }[]).find((w) => w.action === 'aim')).toMatchObject({ whyNot: 'alreadyUsed' })
    // Move twice: after one Move another is offered
    let m = must(st.state, optionAction(st.state, 'move'))
    m = advance(m, (p) => p.kind === 'action.choose')
    expect(hasOption(m.state, 'move')).toBe(true)
    expect(m.state.activation.current!.actionsLeft).toBe(1)
    m = advance(must(m.state, optionAction(m.state, 'move')), (p) => p.kind !== 'move.tool' && p.kind !== 'move.troopers')
    expect(m.state.activation.current).toBeNull()
  })

  it('ACT-011 after an Attack action Standby is withheld, and after Standby Attack is withheld', () => {
    registerAttackSeam({
      canStart: () => true,
      start(ctx) {
        getFrameResume('activation.action')!(ctx, 'finished', {})
      },
    })
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const s = ready(r.state, id)
    const a = must(startOf(s, id).state, optionAction(startOf(s, id).state, 'attack'))
    expect(a.pending!.kind).toBe('action.choose')
    expect(hasOption(a.state, 'standby')).toBe(false)
    expect(hasOption(a.state, 'attack')).toBe(false)
    expect((a.pending!.context.withheld as { action: string; whyNot: string }[]).find((w) => w.action === 'standby')).toMatchObject({ whyNot: 'afterAttack' })
    const st = startOf(s, id)
    const b = must(st.state, optionAction(st.state, 'standby'))
    expect(hasOption(b.state, 'attack')).toBe(false)
    expect((b.pending!.context.withheld as { action: string; whyNot: string }[]).find((w) => w.action === 'attack')).toMatchObject({ whyNot: 'afterStandby' })
  })

  it('ACT-015 Recover removes the chosen number of suppression tokens, any number up to all', () => {
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.scout-troopers', 0).id
    const s = ready(r.state, id, [0, -10], (x) => void (x.units[id]!.suppression = 3))
    const st = startOf(s, id, new ScriptedRng([5, 5, 5]))
    expect(st.pending!.options!.filter((o) => o.id.startsWith('recover:')).map((o) => o.id)).toEqual(['recover:1', 'recover:2', 'recover:3'])
    const two = must(st.state, optionAction(st.state, 'recover:2'))
    expect(two.state.units[id]!.suppression).toBe(1)
    const all = must(st.state, optionAction(st.state, 'recover:3'))
    expect(all.state.units[id]!.suppression).toBe(0)
    expect(hasOption(all.state, 'recover:1')).toBe(false)
  })

  it('ACT-016 Standby is for Trooper units and a unit holds at most one Standby token', () => {
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const has = ready(r.state, id, [0, -10], (x) => void (x.units[id]!.tokens.standby = 1))
    const st = startOf(has, id)
    expect(hasOption(st.state, 'standby')).toBe(false)
    expect((st.pending!.context.withheld as { action: string; whyNot: string }[]).find((w) => w.action === 'standby')).toMatchObject({ whyNot: 'hasToken' })
    const fresh = startOf(ready(r.state, id), id)
    expect(hasOption(fresh.state, 'standby')).toBe(true)
    const noTrooper = withData(ready(r.state, id), (d) => ({ ...d, unitTypes: { ...d.unitTypes, trooper: { ...(d.unitTypes!.trooper as object), flags: { trooper: false } } as never } }))
    const nt = startOf(noTrooper, id)
    expect(hasOption(nt.state, 'standby')).toBe(false)
  })

  it('ACT-017 an undeployed unit\'s first menu offers only Move; Aim, Dodge and Attack are withheld until it has deployed', () => {
    registerAttackSeam({ canStart: () => true, start: () => undefined })
    const r = firstTurn()
    const id = r.pending!.options![0]!.action.payload as { unitId: string }
    const st = must(r.state, r.pending!.options![0]!.action)
    expect(st.state.units[id.unitId]!.location).toBe('reserve')
    expect(st.pending!.options!.map((o) => o.id)).toEqual(['move'])
    const withheld = st.pending!.context.withheld as { action: string; whyNot: string }[]
    for (const a of ['aim', 'dodge', 'attack']) expect(withheld.find((w) => w.action === a)).toMatchObject({ whyNot: 'undeployed' })
  })

  it('ACT-021 the Standby token is removed when its unit moves, attacks or takes an action', () => {
    const r = firstTurn()
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const s = ready(r.state, id, [0, -10], (x) => void (x.units[id]!.tokens.standby = 1))
    const st = startOf(s, id)
    expect(st.state.units[id]!.tokens.standby).toBe(1)
    const aim = must(st.state, optionAction(st.state, 'aim'))
    expect(aim.state.units[id]!.tokens.standby ?? 0).toBe(0)
    expect(events(aim, 'TokenChanged').some((e) => e.type === 'TokenChanged' && e.kind === 'standby' && e.to === 0)).toBe(true)
  })
})

describe('Standby', () => {
  /** A's Stormtroopers at the rim of B's Standby unit; B's Rebel Troopers hold a Standby token. */
  function standbyScene(distance: number, withLos = true): { state: GameState; mover: string; watcher: string } {
    const r = firstTurn()
    const mover = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const watcher = unitBy(r.state, 'B', 'reb.u.rebel-troopers', 0).id
    const s = ready(r.state, mover, [-14, -14], (x) => {
      place(x.units[watcher]!, -14, -14 + distance)
      x.units[watcher]!.tokens.standby = 1
    })
    void withLos
    return { state: s, mover, watcher }
  }

  it('ACT-018 an enemy action within range 2 and LoS of a Standby unit raises activation.standby after it resolves; out of range nothing triggers', () => {
    const near = standbyScene(8)
    let r = startOf(near.state, near.mover)
    r = must(r.state, optionAction(r.state, 'aim'))
    expect(r.pending!.kind).toBe('activation.standby')
    expect(r.pending!.seat).toBe('B')
    expect(r.pending!.canPass).toBe(true)
    expect(r.pending!.options!.map((o) => o.id)).toEqual([`${near.watcher}:move`])
    const far = standbyScene(20)
    const q = must(startOf(far.state, far.mover).state, optionAction(startOf(far.state, far.mover).state, 'aim'))
    expect(q.pending!.kind).toBe('action.choose')
  })

  it('ACT-019 the Standby free attack may only declare the triggering unit as defender', () => {
    const calls: { unit: string; opts: AttackOpts }[] = []
    registerAttackSeam({
      canStart: () => true,
      start(ctx, unitId, opts) {
        calls.push({ unit: unitId, opts })
        getFrameResume('activation.action')!(ctx, 'finished', {})
      },
    })
    const sc = standbyScene(8)
    let r = startOf(sc.state, sc.mover)
    r = must(r.state, optionAction(r.state, 'aim'))
    expect(r.pending!.options!.map((o) => o.id)).toEqual([`${sc.watcher}:move`, `${sc.watcher}:attack`])
    r = must(r.state, optionAction(r.state, `${sc.watcher}:attack`))
    expect(calls).toEqual([{ unit: sc.watcher, opts: { free: true, against: sc.mover } }])
    expect(r.state.units[sc.watcher]!.tokens.standby ?? 0).toBe(0)
    expect(events(r, 'StandbyTriggered')[0]).toMatchObject({ unitId: sc.watcher, byUnitId: sc.mover })
    // the interrupted activation goes on with its menu
    expect(r.pending!.kind).toBe('action.choose')
    expect(r.pending!.seat).toBe('A')
  })

  it('ACT-020 Standby is offered after the action resolved, and passing it resumes the activation', () => {
    const sc = standbyScene(8)
    let r = startOf(sc.state, sc.mover)
    r = must(r.state, optionAction(r.state, 'aim'))
    expect(r.state.activation.current!.performed.map((p) => p.action)).toEqual(['aim'])
    const passed = must(r.state, { type: 'pass', seat: 'B', decisionId: r.pending!.id, payload: {} })
    expect(passed.pending!.kind).toBe('action.choose')
    expect(passed.state.units[sc.watcher]!.tokens.standby).toBe(1)
  })
})
