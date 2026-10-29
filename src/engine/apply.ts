// step(): envelope checks -> dispatch to the owner of pending.kind -> afterAction -> log + hash.
// Rejections never throw and return the SAME state reference. A decision for 'all' stays open under the same id until
// every seat that owes an answer has given one; the module sees `ctx.lastAnswer` and resolves it on the last.
import { refreshEngagement } from './measure'
import { moduleFor } from './modules'
import { SeededRng, type Rng } from './rng'
import { canon, cloneState, EngineInvariantError, hashState, SEATS } from './state'
import { createCtx, endGame, reject, type Ctx, type Handled } from './registry'
import type { Action, GameState, PendingDecision, Rejection, Seat, StepResult } from './types'
import type { GameEvent } from './events'

function rejectionResult(state: GameState, action: Action | undefined, rejection: Rejection): StepResult {
  const ev: GameEvent = {
    type: 'ActionRejected',
    code: rejection.code,
    reason: rejection.reason,
    seq: state.seq,
    round: state.round,
    phase: state.phase,
    seat: action && SEATS.includes(action.seat) ? action.seat : null,
  }
  return { state, events: [ev], pending: state.pending, rejection }
}

/** The seats that owe an answer to a decision for 'all' (default both), and those that have answered. */
export function owingSeats(pending: PendingDecision): Seat[] {
  return (pending.context.seats as Seat[] | undefined) ?? [...SEATS]
}
export function answeredSeats(pending: PendingDecision): Seat[] {
  return (pending.context.answered as Seat[] | undefined) ?? []
}

function matchesOption(pending: PendingDecision, action: Action): boolean {
  if (!pending.options) return true
  const payload = canon(action.payload ?? {})
  return pending.options.some((o) => o.action.type === action.type && o.action.seat === action.seat && canon(o.action.payload ?? {}) === payload)
}

export { endGame }

/** Envelope + dispatch. Returns either a rejection or the closure that applies the action. */
function evaluate(state: GameState, action: Action): Handled {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string' || typeof action.decisionId !== 'string' || !SEATS.includes(action.seat)) {
    return reject('E_SCHEMA', 'malformed action envelope')
  }
  if (state.phase === 'ended' || !state.pending) return reject('E_GAME_OVER', 'the battle is over')
  if (action.type === 'resign') {
    return {
      run(ctx) {
        endGame(ctx, 'resign', action.seat)
      },
    }
  }
  const pending = state.pending
  if (action.decisionId !== pending.id) {
    return reject('E_WRONG_DECISION', `expected an answer to ${pending.id} (${pending.kind})`)
  }
  if (pending.seat === 'all') {
    if (!owingSeats(pending).includes(action.seat)) return reject('E_WRONG_SEAT', `seat ${action.seat} owes no answer to ${pending.kind}`)
    if (answeredSeats(pending).includes(action.seat)) return reject('E_ALREADY_ANSWERED', `seat ${action.seat} already answered ${pending.kind}`)
  } else if (action.seat !== pending.seat) {
    return reject('E_WRONG_SEAT', `seat ${pending.seat} must answer`)
  }
  const mod = moduleFor(pending.kind)
  if (action.type === 'pass') {
    if (!pending.canPass) return reject('E_PASS_NOT_ALLOWED', 'this decision cannot be passed')
  } else {
    if (action.type !== pending.kind) return reject('E_WRONG_DECISION', `expected ${pending.kind}, got ${action.type}`)
    if (pending.options && !matchesOption(pending, action)) {
      const why = mod.explain?.(state, action, pending)
      return { rejection: why ?? { code: 'E_NOT_AN_OPTION', reason: 'that is not one of the offered options' } }
    }
  }
  return mod.handle(state, action, pending)
}

/** The same checks `step` runs, without mutation. */
export function validate(state: GameState, action: Action): Rejection | null {
  const handled = evaluate(state, action)
  return 'rejection' in handled ? handled.rejection : null
}

/**
 * Rules that react after every accepted action. Engagement is derived from geometry and cached on each unit
 * (`unit.engagedWith`); cohesion is checked where units are placed (movement module), never here (R-7.3).
 */
function afterAction(ctx: Ctx): void {
  refreshEngagement(ctx)
}

export function step(state: GameState, action: Action, rng?: Rng): StepResult {
  const handled = evaluate(state, action)
  if ('rejection' in handled) return rejectionResult(state, action, handled.rejection)

  const draft = cloneState(state)
  const source = rng ?? SeededRng.restore(state.rng)
  const seq = state.seq
  const ctx = createCtx(draft, source, action, seq)
  const pending = state.pending!

  let holdOpen = false
  if (pending.seat === 'all' && action.type !== 'resign') {
    const answered = [...answeredSeats(pending), action.seat]
    ctx.lastAnswer = SEATS.filter((s) => owingSeats(pending).includes(s)).every((s) => answered.includes(s))
    if (!ctx.lastAnswer) {
      holdOpen = true
      // keep the decision (same id); drop this seat's options; `answered` names who, never what
      draft.pending = {
        ...pending,
        context: { ...pending.context, answered },
        ...(pending.options ? { options: pending.options.filter((o) => o.action.seat !== action.seat) } : {}),
      }
    }
  }
  const before = draft.pending
  if (!holdOpen) draft.pending = null
  handled.run(ctx)
  if (holdOpen && draft.pending !== before) {
    throw new EngineInvariantError(`${action.type}: a decision for 'all' raised another decision before every seat answered`)
  }
  afterAction(ctx)

  if (draft.phase === 'ended') {
    draft.pending = null
  } else if (!draft.pending) {
    throw new EngineInvariantError(`action ${action.type} left no pending decision`)
  }
  draft.log.push({ ...action, seq } as Action)
  draft.seq = seq + 1
  if (ctx.rolled || ctx.revealed) draft.undoFence = seq
  const serialised = source.serialize()
  if (serialised) draft.rng = serialised
  draft.hash = hashState(draft)
  return { state: draft, events: ctx.events, pending: draft.pending }
}
