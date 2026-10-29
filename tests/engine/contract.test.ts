import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from '../../src/engine/actions'
import { answeredSeats, owingSeats } from '../../src/engine/apply'
import { checkCodeParams, hookFireCount, installCodeHooks, markFired, registerCodeHook, registeredCodeHooks, resetFireCounts, withoutFireCounts } from '../../src/engine/code-hooks'
import { addEffect, expireEffects, hasEffect } from '../../src/engine/effects'
import { clearHooks, registerHook, runHook } from '../../src/engine/hooks'
import {
  createGame,
  EngineInvariantError,
  legalActions,
  load,
  redactEvents,
  replay,
  save,
  step,
  suggest,
  undo,
  validate,
  view,
  ScriptedRng,
  SeededRng,
  type Action,
  type GameState,
} from '../../src/engine'
import { computeEngagement } from '../../src/engine/measure'
import { resetModules, setModule, useStubModules } from '../../src/engine/modules'
import { createCtx, endGame, reject, type ModuleDef } from '../../src/engine/registry'
import { canon, cloneState, hashState } from '../../src/engine/state'
import { compileTable } from '../../src/engine/table'
import type { GameData, Seat, Unit } from '../../src/engine/types'
import { box, FIXTURE_BUNDLE, FIXTURE_DATA, FIXTURE_SETUP, SMALL_R } from './fixtures'

// ---------------------------------------------------------------------------
// Fixture modules: a minimal command/confirm flow so the contract (hidden simultaneous picks, rolls, replay) runs for real.
// The shipped modules are stubs that reject with E_TODO until their stages land.
// ---------------------------------------------------------------------------

function pickOptions(state: GameState) {
  return (['A', 'B'] as const).flatMap((seat) =>
    state.players[seat].hand.map((cardId) => ({ id: `${seat}:${cardId}`, labelKey: 'command.pick', type: 'command.pick' as const, seat, payload: { cardId } })),
  )
}

const fixtureSetup: ModuleDef = {
  id: 'setup',
  namespaces: ['setup'],
  init(ctx) {
    ctx.state.phase = 'command'
    ctx.state.round = 1
    ctx.raise({ kind: 'command.pick', seat: 'all', window: 'command.picked', options: pickOptions(ctx.state) })
  },
  handle: () => reject('E_TODO', 'unused'),
}

const fixtureCommand: ModuleDef = {
  id: 'command',
  namespaces: ['command'],
  handle(_state, action) {
    if (action.type !== 'command.pick') return reject('E_TODO', 'unused')
    return {
      run(ctx) {
        const seat = action.seat
        ctx.state.command.picks[seat] = action.payload.cardId
        ctx.emit({ type: 'CommandCardPicked', seat, cardId: action.payload.cardId })
        if (!ctx.lastAnswer) return
        ctx.state.command.revealed = true
        ctx.reveal()
        ctx.emit({ type: 'CommandCardsRevealed', picks: { ...ctx.state.command.picks } })
        const [face] = ctx.roll('priority.tie', 1, 'def:red')
        const holder: Seat = face! < 3 ? 'A' : 'B'
        ctx.state.command.priority = holder
        ctx.state.phase = 'activation'
        ctx.raise({
          kind: 'confirm',
          seat: holder,
          window: 'battle.end',
          options: [
            { id: 'continue', labelKey: 'confirm.continue', type: 'confirm', payload: { choice: 'continue' } },
            { id: 'concede', labelKey: 'confirm.concede', type: 'confirm', payload: { choice: 'concede' } },
          ],
        })
      },
    }
  },
}

const fixtureBattle: ModuleDef = {
  id: 'battle',
  namespaces: ['battle', 'confirm'],
  handle: () => ({
    run(ctx) {
      endGame(ctx, 'battle')
    },
  }),
}

function installFixtureModules(): void {
  setModule(fixtureSetup)
  setModule(fixtureCommand)
  setModule(fixtureBattle)
}

function start(seed = 'seed-1'): GameState {
  return createGame(FIXTURE_SETUP, seed, FIXTURE_BUNDLE).state
}

function pick(state: GameState, seat: Seat, cardId: string): Action {
  return act.pick(state.pending!, seat, cardId)
}

describe('contract: stub flow', () => {
  beforeEach(useStubModules)
  afterEach(resetModules)
  it('createGame wires the whole flow with stubbed rules modules: one open decision, answers rejected with E_TODO, state untouched', () => {
    const r = createGame(FIXTURE_SETUP, 'seed-1', FIXTURE_BUNDLE)
    expect(r.pending).toMatchObject({ kind: 'setup.battle', seat: 'A' })
    expect(r.state.phase).toBe('setup')
    const legal = legalActions(r.state, r.pending)!
    expect(legal.length).toBeGreaterThan(0)
    const res = step(r.state, legal[0]!)
    expect(res.rejection?.code).toBe('E_TODO')
    expect(res.state).toBe(r.state)
    expect(res.events.map((e) => e.type)).toEqual(['ActionRejected'])
    expect(validate(r.state, legal[0]!)?.code).toBe('E_TODO')
    expect(r.state.hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('createGame throws EngineInvariantError for an invalid setup', () => {
    expect(() => createGame({ ...FIXTURE_SETUP, ruleset: 'other' }, 's', FIXTURE_BUNDLE)).toThrow(EngineInvariantError)
    expect(() => createGame({ ...FIXTURE_SETUP, layout: 'nope' }, 's', FIXTURE_BUNDLE)).toThrow(EngineInvariantError)
  })

  it('createGame compiles the layout into the table and rejects a piece that leaves it', () => {
    const data: GameData = {
      ...FIXTURE_DATA,
      layouts: { l1: { id: 'l1', size: { x: 36, z: 36 }, pieces: [box('p', -2, -2, 2, 2)] } },
    }
    const g = createGame({ ...FIXTURE_SETUP, layout: 'l1' }, 's', { data }).state
    expect(g.table.def.bounds).toEqual({ minX: -18, maxX: 18, minZ: -18, maxZ: 18 })
    expect(g.table.def.pieces[0]).toMatchObject({ id: 'p', heightBand: 1 })
    expect(() => compileTable({ id: 'x', size: { x: 36, z: 36 }, pieces: [box('far', 17, 0, 20, 2)] })).toThrow(EngineInvariantError)
  })
})

describe('contract: simultaneous hidden picks', () => {
  beforeEach(installFixtureModules)
  afterEach(resetModules)

  it('CMD-001 command.pick is for seat all; the first answer is invisible to the other seat until the reveal', () => {
    const s0 = start()
    expect(s0.pending).toMatchObject({ kind: 'command.pick', seat: 'all', context: { answered: [] } })
    const r1 = step(s0, pick(s0, 'A', 'a2'))
    expect(r1.rejection).toBeUndefined()
    // same decision id stays open; `answered` names who, never what
    expect(r1.state.pending!.id).toBe(s0.pending!.id)
    expect(r1.state.pending!.context.answered).toEqual(['A'])
    expect(JSON.stringify(r1.state.pending)).not.toContain('a2')
    // other seat's view and events never carry the card
    const vB = view(r1.state, 'B')
    expect(vB.command.picks).toEqual({ A: { hidden: true } })
    expect(view(r1.state, 'A').command.picks).toEqual({ A: 'a2' })
    const evB = redactEvents(r1.events, 'B')
    expect(evB.find((e) => e.type === 'CommandCardPicked')).toMatchObject({ cardId: { hidden: true } })
    expect(redactEvents(r1.events, 'A').find((e) => e.type === 'CommandCardPicked')).toMatchObject({ cardId: 'a2' })

    // a second pick from that seat is E_ALREADY_ANSWERED, a card not in hand E_NOT_AN_OPTION
    const again = step(r1.state, pick(r1.state, 'A', 'a1'))
    expect(again.rejection?.code).toBe('E_ALREADY_ANSWERED')
    expect(again.state).toBe(r1.state)
    expect(step(r1.state, pick(r1.state, 'B', 'a1')).rejection?.code).toBe('E_NOT_AN_OPTION')

    // the last answer resolves the decision and reveals both picks
    const r2 = step(r1.state, pick(r1.state, 'B', 'b3'))
    expect(r2.state.command).toMatchObject({ revealed: true, picks: { A: 'a2', B: 'b3' } })
    expect(view(r2.state, 'B').command.picks).toEqual({ A: 'a2', B: 'b3' })
    expect(r2.pending!.kind).toBe('confirm')
    expect(r2.events.map((e) => e.type)).toContain('CommandCardsRevealed')
  })

  it('CMD-001 leak test: the other seat\'s view is byte-identical whatever the hidden pick or the RNG', () => {
    const a = step(start('seed-x'), pick(start('seed-x'), 'A', 'a1')).state
    const s = start('seed-y')
    const b = step(s, pick(s, 'A', 'a3')).state
    expect(JSON.stringify(view(a, 'B'))).toBe(JSON.stringify(view(b, 'B')))
    expect(JSON.stringify(view(a, 'A'))).not.toBe(JSON.stringify(view(b, 'A')))
    const v = view(a, 'B') as unknown as Record<string, unknown>
    for (const k of ['rng', 'log', 'seed', 'hash']) expect(v[k]).toBeUndefined()
  })

  it('CMD-012 view shows order pool counts per rank, never the order; a drawn token is private until its unit is picked', () => {
    const base = start()
    const mk = (tokens: string[]): GameState => {
      const s = cloneState(base)
      s.players.A.pool.tokens = tokens
      s.activation.drawn = { seat: 'A', rank: 'heavy' }
      return s
    }
    const v1 = view(mk(['corps', 'corps', 'heavy']), 'B')
    const v2 = view(mk(['heavy', 'corps', 'corps']), 'B')
    expect(v1.players.A.pool).toEqual({ size: 3, byRank: { corps: 2, heavy: 1 } })
    expect(JSON.stringify(v1)).toBe(JSON.stringify(v2))
    expect(v1.activation.drawn).toEqual({ seat: 'A', rank: { hidden: true } })
    expect(view(mk(['corps']), 'A').activation.drawn).toEqual({ seat: 'A', rank: 'heavy' })
    expect(redactEvents([{ type: 'PoolTokenDrawn', seat: 'A', rank: 'heavy', seq: 0, round: 1, phase: 'activation' }], 'B')[0]).toMatchObject({ rank: { hidden: true } })
  })

  it('legalActions is never empty for a seat that owes an answer and is empty once it answered; every member passes validate', () => {
    const s0 = start()
    expect(() => legalActions(s0, s0.pending)).toThrow(EngineInvariantError)
    for (const seat of ['A', 'B'] as const) {
      const legal = legalActions(s0, s0.pending, seat)!
      expect(legal).toHaveLength(3)
      for (const a of legal) {
        expect(a.seat).toBe(seat)
        expect(validate(s0, a)).toBeNull()
      }
    }
    const r1 = step(s0, pick(s0, 'A', 'a1'))
    expect(legalActions(r1.state, r1.pending, 'A')).toEqual([])
    expect(legalActions(r1.state, r1.pending, 'B')).toHaveLength(3)
    expect(owingSeats(r1.state.pending!)).toEqual(['A', 'B'])
    expect(answeredSeats(r1.state.pending!)).toEqual(['A'])
    const r2 = step(r1.state, pick(r1.state, 'B', 'b1'))
    const conf = legalActions(r2.state, r2.pending)!
    expect(conf.length).toBe(2)
    expect(legalActions(r2.state, r2.pending, r2.state.pending!.seat === 'A' ? 'B' : 'A')).toEqual([])
    expect(suggest(r1.state, r1.pending, 'B')).toMatchObject({ type: 'command.pick', seat: 'B' })
  })

  it('every roll goes through the Rng and emits DiceRolled with face names; ScriptedRng names the face index', () => {
    const s0 = start()
    const r1 = step(s0, pick(s0, 'A', 'a1'))
    // index 0 of the red defence die is a block, which gives priority to A
    const r2 = step(r1.state, pick(r1.state, 'B', 'b1'), new ScriptedRng([0]))
    const rolled = r2.events.find((e) => e.type === 'DiceRolled')
    expect(rolled).toMatchObject({ die: 'def:red', indexes: [0], faces: ['block'], purpose: 'priority.tie', final: true })
    expect(r2.state.command.priority).toBe('A')
    const r3 = step(r1.state, pick(r1.state, 'B', 'b1'), new ScriptedRng([4]))
    expect(r3.events.find((e) => e.type === 'DiceRolled')).toMatchObject({ faces: ['blank'] })
    expect(r3.state.command.priority).toBe('B')
    expect(() => step(r1.state, pick(r1.state, 'B', 'b1'), new ScriptedRng([]))).toThrow(/exhausted/)
  })

  it('replay reproduces the hash at every step; save and load round-trip; a bad finalHash is refused', () => {
    const s0 = start('replay-seed')
    const r1 = step(s0, pick(s0, 'A', 'a2'))
    const r2 = step(r1.state, pick(r1.state, 'B', 'b2'))
    const r3 = step(r2.state, legalActions(r2.state, r2.pending)![0]!)
    expect(r3.state.phase).toBe('ended')
    expect(r3.pending).toBeNull()
    expect(r3.state.result).toMatchObject({ reason: 'battle' })
    const rep = replay(FIXTURE_SETUP, 'replay-seed', r3.state.log, FIXTURE_BUNDLE)
    expect(rep.failedAt).toBeUndefined()
    expect(rep.hashes).toEqual([s0.hash, r1.state.hash, r2.state.hash, r3.state.hash])
    expect(rep.state.hash).toBe(r3.state.hash)
    const file = save(r3.state)
    expect(JSON.parse(JSON.stringify(file))).toEqual(file)
    expect(load(file, FIXTURE_BUNDLE).state.hash).toBe(r3.state.hash)
    expect(() => load({ ...file, finalHash: 'deadbeef' }, FIXTURE_BUNDLE)).toThrow(EngineInvariantError)
    // a game after the end answers E_GAME_OVER without throwing
    expect(step(r3.state, act.resign(r2.state.pending!, 'A')).rejection?.code).toBe('E_GAME_OVER')
  })

  it('undo takes back an action that drew nothing, and refuses one that rolled or revealed', () => {
    const s0 = start()
    const r1 = step(s0, pick(s0, 'A', 'a1'))
    expect(undo(r1.state, FIXTURE_BUNDLE)!.state.hash).toBe(s0.hash)
    const r2 = step(r1.state, pick(r1.state, 'B', 'b1'))
    expect(r2.state.undoFence).toBe(1)
    expect(undo(r2.state, FIXTURE_BUNDLE)).toBeNull()
    expect(undo(s0, FIXTURE_BUNDLE)).toBeNull()
  })

  it('resign ends the game at once for either seat even while a decision for all is open', () => {
    const s0 = start()
    const r = step(s0, act.resign(s0.pending!, 'B'))
    expect(r.state.phase).toBe('ended')
    expect(r.state.result).toMatchObject({ winner: 'A', reason: 'resign' })
  })

  it('a rejection never throws and returns the same state reference (action fuzz)', () => {
    let seed = 12345
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed % n
    }
    const s0 = start()
    const mid = step(s0, pick(s0, 'A', 'a1')).state
    const types = ['command.pick', 'confirm', 'pass', 'resign', 'move.tool', 'attack.pool', 'bogus', 42]
    const seats = ['A', 'B', 'C', undefined, 'all']
    const ids = [s0.pending!.id, 'd:99', '', 7, undefined]
    const payloads: unknown[] = [{ cardId: 'a1' }, { cardId: 'zzz' }, {}, null, 5, { choice: 'continue' }, { speed: 'fast' }]
    let rejected = 0
    for (let i = 0; i < 400; i++) {
      const envelope = { type: types[rand(types.length)], seat: seats[rand(seats.length)], decisionId: ids[rand(ids.length)], payload: payloads[rand(payloads.length)] } as unknown as Action
      for (const st of [s0, mid]) {
        let res
        expect(() => {
          res = step(st, envelope)
        }).not.toThrow()
        expect(() => validate(st, envelope)).not.toThrow()
        if (res!.rejection) {
          rejected++
          expect(res!.state).toBe(st)
          expect(res!.events[0]!.type).toBe('ActionRejected')
        }
      }
    }
    expect(rejected).toBeGreaterThan(500)
  })
})

describe('contract: plumbing', () => {
  beforeEach(useStubModules)
  afterEach(resetModules)
  it('rng: the seeded stream is deterministic and unbiased in range; a scripted stream is exact and throws when dry', () => {
    const a = SeededRng.fromSeed('s')
    const b = SeededRng.fromSeed('s')
    const xs = Array.from({ length: 50 }, () => a.int(8))
    expect(xs).toEqual(Array.from({ length: 50 }, () => b.int(8)))
    expect(xs.every((x) => x >= 0 && x < 8)).toBe(true)
    expect(SeededRng.restore(a.serialize()).int(1000)).toBe(a.int(1000))
    const sc = new ScriptedRng([3, 0])
    expect(sc.int(8)).toBe(3)
    expect(sc.int(8)).toBe(0)
    expect(() => sc.int(8)).toThrow(/exhausted/)
    expect(() => new ScriptedRng([5]).int(5)).toThrow()
  })

  it('ctx.draw returns a pick in [0, n), emits Drawn and marks the step as having drawn; ctx.roll marks it rolled', () => {
    const state = cloneState(start())
    const ctx = createCtx(state, new ScriptedRng([2, 7]), null, 0)
    expect(ctx.draw('pool', 3)).toBe(2)
    expect(ctx.events[0]).toMatchObject({ type: 'Drawn', purpose: 'pool', n: 3, index: 2 })
    expect(ctx.rolled).toBe(true)
    expect(ctx.roll('atk', 1, 'atk:red')).toEqual([7])
    expect(ctx.events[1]).toMatchObject({ type: 'DiceRolled', faces: ['blank'] })
    expect(() => ctx.draw('pool', 0)).toThrow(EngineInvariantError)
  })

  it('a decision with options but no answer and no pass is refused at raise time', () => {
    const ctx = createCtx(cloneState(start()), new ScriptedRng([]), null, 0)
    expect(() => ctx.raise({ kind: 'confirm', seat: 'A', window: 'battle.end', options: [] })).toThrow(EngineInvariantError)
    ctx.raise({ kind: 'confirm', seat: 'A', window: 'battle.end', options: [], canPass: true })
    expect(ctx.state.pending!.canPass).toBe(true)
  })

  it('code hooks: register, look up params, count fires; queries run without counting', () => {
    resetFireCounts()
    let installed = 0
    registerCodeHook({
      name: 'testHook',
      kind: 'keyword',
      params: (p) => (p && typeof p.x === 'number' ? null : 'x must be a number'),
      install() {
        installed++
      },
    })
    expect(registeredCodeHooks()).toContain('testHook')
    expect(checkCodeParams('testHook', { x: 1 })).toBeNull()
    expect(checkCodeParams('testHook', {})).toMatch(/number/)
    expect(checkCodeParams('missing', {})).toMatch(/not registered/)
    installCodeHooks(['testHook'])
    installCodeHooks(['testHook'])
    expect(installed).toBe(1)
    markFired('testHook')
    withoutFireCounts(() => markFired('testHook'))
    expect(hookFireCount('testHook')).toBe(1)
  })

  it('hooks run in registration order and a re-registered id replaces its handler', () => {
    clearHooks()
    const seen: string[] = []
    registerHook('attack.pool', () => (seen.push('a'), { delta: 1 }), 'h1')
    registerHook('attack.pool', () => (seen.push('b'), null), 'h2')
    registerHook('attack.pool', () => (seen.push('c'), { delta: 2 }), 'h1')
    const out = runHook('attack.pool', { seat: 'A' })
    expect(seen).toEqual(['c', 'b'])
    expect(out).toEqual([{ delta: 2 }])
    clearHooks()
  })

  it('effects: timed effects start with an event and expire by key', () => {
    const state = cloneState(start())
    const ctx = createCtx(state, new ScriptedRng([]), null, 0)
    addEffect(ctx, { source: 'card:x', seat: 'A', kind: 'k', expires: 'round' })
    addEffect(ctx, { source: 'card:y', seat: 'B', kind: 'k', unitId: 'u1', expires: 'startOfActivation:u1' })
    expect(hasEffect(state, 'card:x', 'A')).toBe(true)
    expect(expireEffects(ctx, 'round')).toBe(1)
    expect(state.effects.map((e) => e.source)).toEqual(['card:y'])
    expect(ctx.events.map((e) => e.type)).toEqual(['EffectStarted', 'EffectStarted', 'EffectEnded'])
  })

  it('the state hash ignores key order and the log, and changes with any rule state', () => {
    const s = start()
    expect(canon({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}')
    const c = cloneState(s)
    expect(c.data).toBe(s.data)
    expect(c.table.def).toBe(s.table.def)
    expect(hashState(c)).toBe(s.hash)
    c.log.push({ type: 'pass', seat: 'A', decisionId: 'd:1', payload: {} })
    expect(hashState(c)).toBe(s.hash)
    c.players.A.points = 1
    expect(hashState(c)).not.toBe(s.hash)
  })

  it('MEL-011 engagement is derived from base contact after the unit is on the table', () => {
    const s = cloneState(start())
    const unit = (id: string, seat: Seat, x: number): Unit => ({
      id,
      seat,
      unitTypeId: 't',
      rank: 'corps',
      minis: [{ id: `${id}.m`, isLeader: true, pos: { x, y: 0, z: 0 }, yaw: 0, baseSize: 'small', wounds: 0, maxWounds: 1, alive: true }],
      leaderId: `${id}.m`,
      location: 'table',
      order: { state: 'none' },
      activated: false,
      suppression: 0,
      tokens: {},
      keywords: [],
      weapons: [],
      upgrades: [],
      engagedWith: [],
      flags: {},
    })
    s.units = { a: unit('a', 'A', 0), b: unit('b', 'B', 2 * SMALL_R + 0.001), c: unit('c', 'B', 10), d: unit('d', 'A', 2 * SMALL_R + 0.001 + 2 * SMALL_R) }
    expect(computeEngagement(s)).toEqual({ a: ['b'], b: ['a', 'd'], c: [], d: ['b'] })
  })
})
