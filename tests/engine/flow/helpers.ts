// Helpers for the flow tests: the real Recon data through bundleFromData, setups from the pre-built lists, small drivers
// and state editing. Rules tests edit a cloned state to reach a position (hash is not rechecked by `step`).
import { loadBundle } from '../../../src/data'
import { RULESET, bundleFromData } from '../../../src/engine/bundle'
import { rosterFromList } from '../../../src/engine/setup'
import { createCtx, type Ctx } from '../../../src/engine/registry'
import { cloneState } from '../../../src/engine/state'
import {
  createGame,
  legalActions,
  step,
  suggest,
  ScriptedRng,
  SeededRng,
  type Action,
  type EngineBundle,
  type GameData,
  type GameEvent,
  type GameSetup,
  type GameState,
  type PendingDecision,
  type Rng,
  type Seat,
  type StepResult,
  type Unit,
} from '../../../src/engine'

let cached: EngineBundle | null = null
export function realBundle(): EngineBundle {
  return (cached ??= bundleFromData(loadBundle()))
}

/** Seven-card hands whose cards need no particular unit: Ambush/Push/Assault plus one faction card of each pip count. */
export const GENERIC_A = ['neu.cc.ambush', 'emp.cc.covert-observation', 'neu.cc.push', 'emp.cc.pinned-down', 'neu.cc.assault', 'emp.cc.coordinated-fire', 'neu.cc.standing-orders']
export const GENERIC_B = ['neu.cc.ambush', 'reb.cc.sabotaged-communications', 'neu.cc.push', 'reb.cc.turning-the-tide', 'neu.cc.assault', 'reb.cc.covering-fire', 'neu.cc.standing-orders']

export const CLOSE = ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.advanced-intel', 'rec.adv.cunning-deployment']

export interface SetupOpts {
  a?: string
  b?: string
  cards?: string[]
  blue?: Seat
  layout?: string
  generic?: boolean
  options?: GameSetup['options']
}

export function reconSetup(o: SetupOpts = {}, bundle: EngineBundle = realBundle()): GameSetup {
  const d = bundle.data
  const A = rosterFromList(d, o.a ?? 'emp.list.recon-a')
  const B = rosterFromList(d, o.b ?? 'reb.list.recon-a')
  if (o.generic) {
    A.commandHand = [...GENERIC_A]
    B.commandHand = [...GENERIC_B]
  }
  return {
    ruleset: RULESET,
    format: 'recon',
    battle: o.cards ? { cards: o.cards } : { auto: true },
    armies: { A, B },
    ...(o.blue ? { blue: o.blue } : {}),
    ...(o.layout ? { layout: o.layout } : {}),
    ...(o.options ? { options: o.options } : {}),
  }
}

/**
 * A Recon game. Defaults make geometry predictable: seat A is blue and sits on the +z edge (`edge: null` leaves the edge
 * decision open); the Prepared Position units are not auto-deployed.
 */
export function newGame(o: SetupOpts & { edge?: string | null } = {}, seed = 't1', bundle: EngineBundle = realBundle()): StepResult {
  const blue = 'blue' in o ? o.blue : 'A'
  // the Divulge offers of the hands are declined unless a test asks for them
  const options = { autoDivulge: true, ...(o.options ?? {}) }
  const r = createGame(reconSetup({ ...o, options, ...(blue ? { blue } : {}) }, bundle), seed, bundle)
  if (r.pending?.kind === 'setup.battle' && o.edge !== null) return must(r.state, optionAction(r.state, `edge:${o.edge ?? 'zMax'}`))
  return r
}

export function must(state: GameState, a: Action, rng?: Rng): StepResult {
  const r = step(state, a, rng)
  if (r.rejection) throw new Error(`rejected ${a.type}: ${r.rejection.code} ${r.rejection.reason}`)
  return r
}

export function pendingOf(r: StepResult): PendingDecision {
  if (!r.pending) throw new Error('no pending decision')
  return r.pending
}

/** A deep copy of the state with `fn` applied (rules tests reach their position by editing). */
export function edit(state: GameState, fn: (s: GameState) => void): GameState {
  const s = cloneState(state)
  fn(s)
  return s
}

/** The same state with a re-pointed data snapshot (a unit type or record changed for one test). */
export function withData(state: GameState, fn: (d: GameData) => GameData): GameState {
  const s = cloneState(state)
  s.data = fn(state.data)
  return s
}

export function answerOf(state: GameState, seat?: Seat): Action {
  const p = state.pending!
  const who = p.seat === 'all' ? seat! : p.seat
  const legal = legalActions(state, p, who)
  if (legal && legal.length > 0) return legal[0]!
  const s = suggest(state, p, who)
  if (!s) throw new Error(`no answer for ${p.kind}`)
  return s
}

/** The option of a pending decision whose id matches. */
export function optionAction(state: GameState, id: string, seat?: Seat): Action {
  const p = state.pending!
  const o = p.options?.find((x) => x.id === id && (!seat || x.action.seat === seat))
  if (!o) throw new Error(`no option ${id} in ${p.kind}: ${(p.options ?? []).map((x) => x.id).join(', ')}`)
  return o.action
}

export function hasOption(state: GameState, id: string): boolean {
  return (state.pending?.options ?? []).some((o) => o.id === id)
}

/** Answer decisions (first legal / engine suggestion) until `stop` says so or the game ends. */
export function advance(r: StepResult, stop: (p: PendingDecision, s: GameState) => boolean, max = 3000): StepResult {
  let cur = r
  for (let i = 0; i < max && cur.pending; i++) {
    if (stop(cur.pending, cur.state)) return cur
    const p = cur.pending
    if (p.seat === 'all') {
      for (const seat of ['A', 'B'] as const) {
        const st = cur.state.pending
        if (!st || st.id !== p.id) break
        const legal = legalActions(cur.state, st, seat)
        if (legal && legal.length === 0) continue
        cur = must(cur.state, answerOf(cur.state, seat))
      }
    } else cur = must(cur.state, answerOf(cur.state))
  }
  return cur
}

/** Both seats pick a command card (by id), returning the result after the last pick. */
export function pick(r: StepResult, cards: Partial<Record<Seat, string>>, rng?: Rng): StepResult {
  let cur = r
  for (const seat of ['A', 'B'] as const) {
    const id = cards[seat]
    if (!id || !cur.state.pending || cur.state.pending.kind !== 'command.pick') continue
    cur = must(cur.state, optionAction(cur.state, `${seat}:${id}`, seat), rng)
  }
  return cur
}

/** Resolve command.issuer / command.order decisions with the first option until the Activation phase starts. */
export function toActivation(r: StepResult): StepResult {
  return advance(r, (p) => p.kind === 'activation.choose')
}

/** A unit of a seat by its data id (the nth of that kind). */
export function unitBy(state: GameState, seat: Seat, dataId: string, nth = 0): Unit {
  const us = Object.values(state.units).filter((u) => u.seat === seat && u.unitTypeId === dataId)
  const u = us[nth]
  if (!u) throw new Error(`no ${dataId} for ${seat}`)
  return u
}

/** Put a unit on the table at a leader spot (troopers in a ring) for a test. */
export function place(u: Unit, x: number, z: number, y = 0): void {
  u.location = 'table'
  const r = 1.2
  u.minis.forEach((m, i) => {
    if (m.id === u.leaderId) m.pos = { x, y, z }
    else {
      const k = i + 1
      m.pos = { x: x + Math.sin(k) * r * (1 + Math.floor(k / 8) * 0.9), y, z: z + Math.cos(k) * r * (1 + Math.floor(k / 8) * 0.9) }
    }
  })
}

/** A step context over a COPY of the state (the copy is `ctx.state`), for calling flow functions directly. */
export function ctxFor(state: GameState, rng: Rng = SeededRng.fromSeed('ctx')): Ctx {
  return createCtx(cloneState(state), rng, null, state.seq)
}

export function events(r: StepResult, type: GameEvent['type']): GameEvent[] {
  return r.events.filter((e) => e.type === type)
}

export { ScriptedRng, SeededRng }
