// Module plumbing: one ModuleDef per namespace owner, the per-step context, decision raising.
import { rollDice } from './dice'
import type { GameEvent, GameEventBody } from './events'
import type { Rng } from './rng'
import { EngineInvariantError, SEATS } from './state'
import type {
  Action,
  ActionType,
  DecisionKind,
  DecisionOption,
  DieId,
  GameState,
  MoveConstraints,
  PendingDecision,
  Rejection,
  RejectionCode,
  Seat,
  TimingWindowId,
} from './types'

export interface OptionInput {
  id: string
  labelKey: string
  type: ActionType
  payload: unknown
  /** the seat this answer belongs to; required for decisions raised for 'all' */
  seat?: Seat
  data?: Record<string, unknown>
}

export interface RaiseInput {
  kind: DecisionKind
  seat: Seat | 'all'
  window: TimingWindowId
  context?: Record<string, unknown>
  options?: OptionInput[]
  constraints?: MoveConstraints
  canPass?: boolean
}

/** Mutable per-step context handed to a module's `run`. `state` is a private draft copy. */
export interface Ctx {
  state: GameState
  rng: Rng
  /** the accepted action, or null while building the initial state */
  action: Action | null
  events: GameEvent[]
  /** true once any die was rolled or any pick drawn in this step */
  rolled: boolean
  /** true once something hidden was revealed in this step (undo may not cross it) */
  revealed: boolean
  /** answering a decision for 'all': true when this answer is the last one owed (the module then resolves it) */
  lastAnswer: boolean
  emit(body: GameEventBody, seat?: Seat | null): void
  /**
   * Roll `n` dice of `die`; returns the face INDEXES (what ScriptedRng scripts name). Every roll emits one `DiceRolled`
   * with the face names. For 'd6' the index is the result minus one.
   */
  roll(purpose: string, n: number, die: DieId): number[]
  /** Random pick in [0, n) (pool draws, random choices): one `rng.int(n)`, emitted as `Drawn`. */
  draw(purpose: string, n: number): number
  /** Declare that hidden information was revealed in this step. */
  reveal(): void
  raise(input: RaiseInput): void
}

export type Handled = { rejection: Rejection } | { run: (ctx: Ctx) => void }

export interface ModuleDef {
  id: string
  /** decision-kind namespaces this module owns, e.g. ['setup'] */
  namespaces: string[]
  /** Optional: raise the module's first decision while `createGame` builds the initial state (the setup module). */
  init?(ctx: Ctx): void
  /**
   * Validate `action` (already checked for envelope, seat, pass and, for finite decisions, option
   * membership) against `state` and return either a rejection or the closure that applies it.
   * Heavy work happens once here; `run` only mutates the draft.
   */
  handle(state: GameState, action: Action, pending: PendingDecision): Handled
  /**
   * Optional: when an action is not one of the offered options, say why (for example
   * E_ACTION_RESTRICTED instead of the generic E_NOT_AN_OPTION).
   */
  explain?(state: GameState, action: Action, pending: PendingDecision): Rejection | null
  /** Optional: the engine default answer for a continuous decision (deploy spot, tool placement, trooper placement). */
  suggest?(state: GameState, pending: PendingDecision, seat: Seat): Action | null
}

export function reject(code: RejectionCode, reason: string, details?: Record<string, unknown>): { rejection: Rejection } {
  return { rejection: details ? { code, reason, details } : { code, reason } }
}

export function createCtx(state: GameState, rng: Rng, action: Action | null, seq: number): Ctx {
  const ctx: Ctx = {
    state,
    rng,
    action,
    events: [],
    rolled: false,
    revealed: false,
    lastAnswer: true,
    emit(body, seat) {
      const ev = {
        ...body,
        seq,
        round: ctx.state.round,
        phase: ctx.state.phase,
        seat: seat === undefined ? (action ? action.seat : null) : seat,
      } as GameEvent
      ctx.events.push(ev)
    },
    roll(purpose, n, die) {
      const { indexes, faces } = rollDice(rng, ctx.state.data.dice, die, n)
      ctx.rolled = true
      ctx.emit({ type: 'DiceRolled', purpose, die, indexes, faces, final: true })
      return indexes
    },
    draw(purpose, n) {
      if (!Number.isInteger(n) || n < 1) throw new EngineInvariantError(`draw(${purpose}): cannot draw from ${n}`)
      const index = rng.int(n)
      ctx.rolled = true
      ctx.emit({ type: 'Drawn', purpose, n, index })
      return index
    },
    reveal() {
      ctx.revealed = true
    },
    raise(input) {
      const s = ctx.state
      const id = `d:${s.nextDecision++}`
      const options: DecisionOption[] | undefined = input.options?.map((o) => {
        const seat = o.seat ?? (input.seat === 'all' ? undefined : input.seat)
        if (!seat) throw new EngineInvariantError(`option ${o.id} of an 'all' decision needs a seat`)
        return {
          id: o.id,
          labelKey: o.labelKey,
          action: { type: o.type, seat, decisionId: id, payload: o.payload } as Action,
          ...(o.data ? { data: o.data } : {}),
        }
      })
      const canPass = input.canPass ?? false
      // legalActions is never empty for an open finite decision (00 section 2)
      if (options && options.length === 0 && !canPass) {
        throw new EngineInvariantError(`decision ${input.kind} raised with no option and no pass`)
      }
      const context = { ...(input.context ?? {}) }
      if (input.seat === 'all') {
        context.answered = []
        context.seats ??= [...SEATS]
      }
      const pending: PendingDecision = { id, seat: input.seat, kind: input.kind, window: input.window, context, canPass }
      if (options) pending.options = options
      if (input.constraints) pending.constraints = input.constraints
      s.pending = pending
      ctx.emit({ type: 'DecisionRequested', decisionId: id, kind: input.kind, window: input.window }, input.seat === 'all' ? null : input.seat)
    },
  }
  return ctx
}

/** A module that owns namespaces whose rules arrive in a later stage: every action is rejected with E_TODO. */
export function stubModule(id: string, namespaces: string[]): ModuleDef {
  return {
    id,
    namespaces,
    handle(_state, action) {
      return reject('E_TODO', `${action.type} is not implemented yet (module ${id})`)
    },
  }
}

/**
 * End the battle at once (resign, concede, round limit, battle victory): sets the result, emits GameEnded and closes the
 * phase. `loser` is the seat that resigned or conceded; without it the points decide.
 */
export function endGame(ctx: Ctx, reason: 'resign' | 'concede' | 'roundLimit' | 'battle', loser?: Seat, decided?: { winner: Seat | 'draw' }): void {
  const s = ctx.state
  const points = { A: s.players.A.points, B: s.players.B.points }
  const winner = decided ? decided.winner : loser ? (loser === 'A' ? 'B' : 'A') : points.A === points.B ? 'draw' : points.A > points.B ? 'A' : 'B'
  s.result = { winner, points, reason }
  s.phase = 'ended'
  s.pending = null
  ctx.emit({ type: 'GameEnded', result: s.result }, null)
}
