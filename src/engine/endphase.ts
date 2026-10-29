// END end.*: the End phase (R-17) and the round advance. Steps in order: start-of-phase effects (Bunker Assault wounds), score the
// Objective then the Secondary, discard the revealed command cards, clear tokens and remove one suppression, promote a new
// Commander, end-of-phase effects (Intel), victory checks, then the next round or the end of the game (R-2.2).
import { cardData, tokenData } from './bundle'
import { beginRound } from './command'
import {
  bd,
  checkInstantWin,
  checkWipeout,
  finishAtRoundLimit,
  flowOf,
  onEndPhaseEnd,
  onEndPhaseStart,
  openWindow,
  priorityFirst,
  scoreEndPhase,
} from './battle'
import { expireEffects } from './effects'
import { runHook } from './hooks'
import { refreshPanic } from './morale'
import { reject, type Ctx, type ModuleDef } from './registry'
import { SEATS, seatUnits } from './state'
import type { Action, GameState, Seat, Unit } from './types'
import { unitData, unitTypeData } from './bundle'

export function maxRounds(state: GameState): number {
  const fmt = state.data.formats?.[bd(state).format] as { rounds?: number } | undefined
  return state.origin.setup.options?.maxRounds ?? fmt?.rounds ?? 5
}

export function beginEndPhase(ctx: Ctx): void {
  const s = ctx.state
  expireEffects(ctx, 'phase')
  ctx.emit({ type: 'PhaseEnded', name: 'activation' }, null)
  s.phase = 'end'
  s.activation = { turn: null, current: null, drawn: null }
  ctx.emit({ type: 'PhaseStarted', name: 'end' }, null)
  onEndPhaseStart(ctx)
  if (checkWipeout(ctx)) return
  if (openWindow(ctx, 'end.start', {}, `r${s.round}`, 'end.started')) return
  afterStart(ctx)
}

export function afterStart(ctx: Ctx): void {
  const s = ctx.state
  scoreEndPhase(ctx)
  if (openWindow(ctx, 'end.scoring', {}, `r${s.round}`, 'end.scored')) return
  afterScoring(ctx)
}

export function afterScoring(ctx: Ctx): void {
  const s = ctx.state
  // discard the revealed cards (Standing Orders returns to the hand instead, R-4.7)
  for (const seat of SEATS) {
    const id = s.command.picks[seat]
    if (!id) continue
    if (cardData(s.data, id).returnsToHand) {
      ctx.emit({ type: 'CardReturned', seat, cardId: id }, seat)
      continue
    }
    const hand = s.players[seat].hand
    const i = hand.indexOf(id)
    if (i >= 0) hand.splice(i, 1)
    s.players[seat].played.push(id)
    ctx.emit({ type: 'CardDiscarded', seat, cardId: id }, seat)
  }
  // clear end-phase tokens; remove one suppression from each unit; empty both pass pools (R-17.3)
  const clear = tokenData(s.data)
    .filter((t) => t.lifetime === 'endPhase' && t.kind === 'unit')
    .map((t) => t.id.replace(/^core\.token\./, ''))
  for (const u of Object.values(s.units)) {
    for (const k of clear) {
      const from = u.tokens[k] ?? 0
      if (from > 0) {
        delete u.tokens[k]
        ctx.emit({ type: 'TokenChanged', unitId: u.id, kind: k, from, to: 0 }, u.seat)
      }
    }
    if (u.suppression > 0 && u.location !== 'defeated') {
      const from = u.suppression
      u.suppression = from - 1
      ctx.emit({ type: 'SuppressionChanged', unitId: u.id, from, to: u.suppression, reason: 'endPhase' }, u.seat)
    }
    delete u.flags.returnedToPool
  }
  refreshPanic(ctx)
  for (const seat of SEATS) s.players[seat].passTokens = 0
  flowOf(s).issueSeats = priorityFirst(s)
  promoteNext(ctx)
}

// ---------------------------------------------------------------------------
// Promotion (R-17.4)
// ---------------------------------------------------------------------------

function promotionCandidates(state: GameState, seat: Seat): Unit[] {
  const units = seatUnits(state, seat)
  if (units.some((u) => u.rank === 'commander')) return []
  return units.filter((u) => unitTypeData(state.data, unitData(state.data, u.unitTypeId).unitType)?.flags.trooper === true)
}

function promote(ctx: Ctx, unit: Unit): void {
  unit.rank = 'commander'
  unit.flags.promoted = true
  ctx.emit({ type: 'UnitPromoted', unitId: unit.id }, unit.seat)
}

/** Seats in priority order promote a Trooper unit when they have no Commander left; one candidate is promoted without a decision. */
function promoteNext(ctx: Ctx): void {
  const s = ctx.state
  const flow = flowOf(s)
  while (flow.issueSeats.length > 0) {
    const seat = flow.issueSeats[0]!
    const cands = promotionCandidates(s, seat)
    if (cands.length === 0) {
      flow.issueSeats.shift()
      continue
    }
    if (cands.length === 1) {
      promote(ctx, cands[0]!)
      flow.issueSeats.shift()
      continue
    }
    ctx.raise({
      kind: 'end.choice',
      seat,
      window: 'end.scoring',
      context: { reason: 'promote' },
      options: cands.map((u) => ({ id: u.id, labelKey: 'end.promote', type: 'end.choice' as const, payload: { option: u.id }, data: { rank: u.rank, unitTypeId: u.unitTypeId } })),
    })
    return
  }
  afterPromotion(ctx)
}

function afterPromotion(ctx: Ctx): void {
  const s = ctx.state
  onEndPhaseEnd(ctx)
  if (checkWipeout(ctx)) return
  if (checkInstantWin(ctx)) return
  if (s.round >= maxRounds(s)) return finishAtRoundLimit(ctx)
  runHook('round.end', { seat: 'A', state: s, engine: ctx })
  if (openWindow(ctx, 'round.end', {}, `r${s.round}`, 'round.ended')) return
  afterRoundEnd(ctx)
}

export function afterRoundEnd(ctx: Ctx): void {
  const s = ctx.state
  expireEffects(ctx, 'phase')
  expireEffects(ctx, 'round')
  ctx.emit({ type: 'PhaseEnded', name: 'end' }, null)
  ctx.emit({ type: 'RoundEnded', round: s.round }, null)
  beginRound(ctx, s.round + 1)
}

export const endphaseModule: ModuleDef = {
  id: 'endphase',
  namespaces: ['end'],
  handle(_state: GameState, action: Action) {
    if (action.type !== 'end.choice') return reject('E_WRONG_DECISION', `${action.type} is not an End phase decision`)
    const unitId = action.payload.option
    return {
      run(ctx) {
        promote(ctx, ctx.state.units[unitId]!)
        flowOf(ctx.state).issueSeats.shift()
        promoteNext(ctx)
      },
    }
  },
}
