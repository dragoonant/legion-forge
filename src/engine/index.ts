// Public engine API (frozen after M2): createGame / step / legalActions / validate / replay / view / suggest /
// save / load / undo. The client store and tools/sim-core.ts are the only callers of `step`.
import { answeredSeats, owingSeats, setHashEvery, step, stepInPlace, validate } from './apply'
import { setupModule, moduleFor } from './modules'
import { SeededRng } from './rng'
import { createCtx } from './registry'
import { openTable, compileTable } from './table'
import { EngineInvariantError, hashState } from './state'
import type { Action, EngineBundle, GameSetup, GameState, PendingDecision, SaveFile, Seat, StepResult } from './types'
import { redactEvents, view } from './view'

export const ENGINE_VERSION = '0.1.0'

export { step, validate, view, redactEvents, EngineInvariantError, setHashEvery }
export * from './types'
export type { GameEvent, GameEventBody } from './events'
export { act, makeAction } from './actions'
export { ReplayDecider } from './decider'
export type { Decider } from './decider'
export { ScriptedRng, SeededRng, sha256Hex, fnv1a } from './rng'
export type { Rng } from './rng'

/**
 * Build the initial state and raise the first decision. Throws `EngineInvariantError` for an invalid setup (setups come
 * from the army picker or the sim, never from a Decider). Army legality and the first deployment belong to the setup
 * module; this wires the table, the players and the flow.
 */
export function createGame(setup: GameSetup, seed: string, bundle: EngineBundle): StepResult {
  const data = bundle.data
  if (setup.ruleset !== data.ruleset) throw new EngineInvariantError(`setup ruleset ${setup.ruleset} does not match the data (${data.ruleset})`)
  for (const s of ['A', 'B'] as const) {
    if (!setup.armies[s]) throw new EngineInvariantError(`setup has no army for seat ${s}`)
  }
  const layoutId = setup.layout ?? Object.keys(data.layouts)[0]
  const layout = layoutId ? data.layouts[layoutId] : undefined
  if (layoutId && !layout) throw new EngineInvariantError(`unknown layout ${layoutId}`)
  const def = layout ? compileTable(layout, { heightBandSize: data.constants.heightBandSize }) : openTable(72, 36)
  const army = (s: Seat) => setup.armies[s]
  const player = (s: Seat) => ({ armyId: army(s).listId ?? army(s).factionId, hand: [...army(s).commandHand], played: [], points: 0, pool: { tokens: [] } })
  const rng = SeededRng.fromSeed(seed)
  const state: GameState = {
    version: 1,
    engineVersion: ENGINE_VERSION,
    seed,
    ruleset: setup.ruleset,
    phase: 'setup',
    round: 0,
    seq: 0,
    nextDecision: 1,
    pending: null,
    rng: rng.serialize(),
    hash: '',
    log: [],
    undoFence: -1,
    origin: { setup },
    data,
    table: { def, objectives: {}, markers: {} },
    players: { A: player('A'), B: player('B') },
    units: {},
    command: { picks: {}, revealed: false, priority: null, issuing: null },
    activation: { turn: null, current: null, drawn: null },
    attack: null,
    effects: [],
    nextEffect: 1,
    battle: { blue: null, cards: [], data: {} },
    result: null,
  }
  const ctx = createCtx(state, rng, null, 0)
  ctx.emit({ type: 'GameCreated', seed, engineVersion: ENGINE_VERSION }, null)
  setupModule().init?.(ctx)
  if (!state.pending) throw new EngineInvariantError('the setup module raised no first decision')
  state.rng = rng.serialize()
  state.seq = 0
  state.hash = hashState(state)
  return { state, events: ctx.events, pending: state.pending }
}

/**
 * Enumerated answers of `seat` for a finite decision (each passes `validate`); `null` for continuous decisions (tool
 * poses, trooper placements, deployment spots), which are answered by constructing an action within
 * `pending.constraints`. `seat` is required when the decision is for 'all' and returns that seat's answers: empty only
 * once that seat has answered. Never empty for an open finite decision and a seat that still owes an answer.
 */
export function legalActions(state: GameState, pending: PendingDecision | null = state.pending, seat?: Seat): Action[] | null {
  if (!pending) return []
  let who: Seat
  if (pending.seat === 'all') {
    if (!seat) throw new EngineInvariantError(`legalActions: decision ${pending.kind} is for 'all', pass the seat`)
    if (!owingSeats(pending).includes(seat) || answeredSeats(pending).includes(seat)) return []
    who = seat
  } else {
    if (seat && seat !== pending.seat) return []
    who = pending.seat
  }
  if (!pending.options) return null
  const out: Action[] = pending.options.filter((o) => o.action.seat === who).map((o) => o.action)
  if (pending.canPass) out.push({ type: 'pass', seat: who, decisionId: pending.id, payload: {} })
  return out
}

export interface ReplayResult extends StepResult {
  /** state hash after createGame and after each replayed action (length = actions replayed + 1) */
  hashes: string[]
  /** index of the first action that was rejected, if any */
  failedAt?: number
}

/** Fold `step` from `createGame`; load, undo, tests and later multiplayer all use this. */
export function replay(setup: GameSetup, seed: string, actions: Action[], bundle: EngineBundle): ReplayResult {
  let result: StepResult = createGame(setup, seed, bundle)
  const hashes = [result.state.hash]
  for (let i = 0; i < actions.length; i++) {
    // nobody keeps the intermediate states, so each step applies to the one state (no copy per action)
    const next = stepInPlace(result.state, actions[i]!)
    if (next.rejection) {
      return { ...result, rejection: next.rejection, hashes, failedAt: i }
    }
    result = next
    hashes.push(result.state.hash)
  }
  return { ...result, hashes }
}

export function save(state: GameState): SaveFile {
  return {
    version: 1,
    engineVersion: state.engineVersion,
    setup: state.origin.setup,
    seed: state.seed,
    actions: state.log.slice(),
    finalHash: state.hash,
  }
}

export function load(file: SaveFile, bundle: EngineBundle): StepResult {
  if (file.version !== 1) throw new EngineInvariantError(`unsupported save version ${String(file.version)}`)
  const r = replay(file.setup, file.seed, file.actions, bundle)
  if (r.rejection) {
    throw new EngineInvariantError(`save replay rejected action ${r.failedAt}: ${r.rejection.code} ${r.rejection.reason}`)
  }
  if (r.state.hash !== file.finalHash) {
    throw new EngineInvariantError(`save hash mismatch: ${r.state.hash} != ${file.finalHash}`)
  }
  return r
}

/**
 * Take back the last accepted action by replaying the log without it. Refused (null) when there is nothing to undo or the
 * last action drew from the RNG or revealed something hidden (undo vs AI only covers those that did neither).
 */
export function undo(state: GameState, bundle: EngineBundle): StepResult | null {
  if (state.log.length === 0) return null
  if (state.undoFence === state.seq - 1) return null
  const r = replay(state.origin.setup, state.seed, state.log.slice(0, -1), bundle)
  return r.rejection ? null : r
}

/**
 * Engine default for a decision: the first offered option of a finite decision (for 'all', the first of `seat`'s); for a
 * continuous kind, the owning module's suggestion (deploy spot, tool placement toward a point, trooper placement).
 * Used by "do it for me", the random bot and the AI fallback.
 */
export function suggest(state: GameState, pending: PendingDecision | null = state.pending, seat?: Seat): Action | null {
  if (!pending) return null
  const who: Seat | undefined = pending.seat === 'all' ? seat : pending.seat
  if (!who) throw new EngineInvariantError(`suggest: decision ${pending.kind} is for 'all', pass the seat`)
  const first = pending.options?.find((o) => o.action.seat === who)
  if (first) return first.action
  return moduleFor(pending.kind).suggest?.(state, pending, who) ?? null
}
