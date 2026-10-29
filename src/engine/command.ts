// CMD command.*: the Command phase (R-4). Both seats secretly pick a command card at once (`seat: 'all'`), the picks are
// revealed together, the lower pip count takes priority (a red defence die breaks a tie), each seat nominates a commander and
// issues the card's orders (no range or LoS limit, R-4.6), then each player's order pool is formed and the pass pool is granted.
import { cardData, unitData, unitTypeData } from './bundle'
import { beginActivationPhase } from './activation'
import { activateCard, onOrderIssued } from './commandCards'
import { bd, flowOf, freshFlow, openWindow } from './battle'
import { expireEffects } from './effects'
import { registerFrameResume, runHook } from './hooks'
import type { OptionInput } from './registry'
import { reject, type Ctx, type ModuleDef } from './registry'
import { EngineInvariantError, otherSeat, poolCounts, SEATS, seatUnits } from './state'
import type { Action, GameState, PendingDecision, Seat, Unit } from './types'

// ---------------------------------------------------------------------------
// Who plays, which cards, who may be ordered
// ---------------------------------------------------------------------------

/** A player with no undefeated Commander or Operative unit plays no card (R-4.2). */
export function canPlayCard(state: GameState, seat: Seat): boolean {
  return seatUnits(state, seat).some((u) => u.rank === 'commander' || u.rank === 'operative')
}

/** Cards of the hand the seat may pick now: unit-restricted cards need the named unit(s) undefeated (R-4.2, R-3.3). */
export function playableCards(state: GameState, seat: Seat): string[] {
  const alive = new Set(seatUnits(state, seat).map((u) => u.unitTypeId))
  return state.players[seat].hand.filter((id) => {
    const r = cardData(state.data, id).restriction
    if (!r) return true
    const hits = r.units.filter((u) => alive.has(u)).length
    return r.op === 'or' ? hits >= 1 : hits === r.units.length
  })
}

/** Units that may be nominated commander by the seat's card (R-4.5): the card's named units, else Commander-rank units (Operatives if none). */
export function commanderCandidates(state: GameState, seat: Seat, cardId: string): Unit[] {
  const card = cardData(state.data, cardId)
  const units = seatUnits(state, seat)
  if (card.orders.named && card.orders.named.length > 0) return units.filter((u) => card.orders.named!.includes(u.unitTypeId))
  const cmd = units.filter((u) => u.rank === 'commander')
  return cmd.length > 0 ? cmd : units.filter((u) => u.rank === 'operative')
}

/** Units that can still receive an order from this card (R-4.6): no order yet this round and matching the card's limit. */
export function orderTargets(state: GameState, seat: Seat, cardId: string): Unit[] {
  const f = cardData(state.data, cardId).orders.filter
  return seatUnits(state, seat).filter((u) => {
    if (u.order.state !== 'none') return false
    if (!f) return true
    if (f.ranks && !f.ranks.includes(u.rank)) return false
    if (f.units && !f.units.includes(u.unitTypeId)) return false
    if (f.unitTypes) {
      const key = unitData(state.data, u.unitTypeId).unitType
      const trooper = unitTypeData(state.data, key)?.flags.trooper === true
      if (!f.unitTypes.some((t) => t === key || (t === 'trooper-any' && trooper))) return false
    }
    return true
  })
}

/** A unit left the game: its token leaves the order pool (call it where a unit is defeated; WND-008). */
export function dropOrderToken(ctx: Ctx, unit: Unit): void {
  const cur = ctx.state.activation.current
  const drawnNow = cur?.via === 'pool' && cur.unitId === unit.id // its token was drawn when the activation began
  if (unit.order.state === 'pool' && !drawnNow) {
    const pool = ctx.state.players[unit.seat].pool.tokens
    const i = pool.indexOf(unit.rank)
    if (i >= 0) {
      pool.splice(i, 1)
      ctx.emit({ type: 'PoolTokenRemoved', seat: unit.seat, rank: unit.rank, reason: 'unitDefeated' }, unit.seat)
    }
  }
  unit.order.state = 'none'
}

/**
 * Safety net for defeats: a pool token whose unit is gone (no unit in the pool state of that rank) leaves the pool. The
 * attack code should call `dropOrderToken` when it defeats a unit; this keeps the pools honest if it does not.
 */
export function reconcilePools(ctx: Ctx): void {
  const s = ctx.state
  for (const seat of SEATS) {
    const tokens = s.players[seat].pool.tokens
    const active = s.activation.current?.via === 'pool' && s.activation.current.seat === seat ? s.activation.current.unitId : null
    const held = seatUnits(s, seat).filter((u) => u.order.state === 'pool' && u.id !== active)
    const hold = (rank: string) => held.filter((u) => u.rank === rank).length
    for (const rank of [...new Set(tokens)]) {
      let extra = tokens.filter((t) => t === rank).length - hold(rank)
      while (extra > 0) {
        tokens.splice(tokens.lastIndexOf(rank), 1)
        ctx.emit({ type: 'PoolTokenRemoved', seat, rank, reason: 'unitDefeated' }, seat)
        extra--
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Round start and picks
// ---------------------------------------------------------------------------

/** Start round `round`'s Command phase: reset the per-round state, then the hidden simultaneous pick. */
export function beginRound(ctx: Ctx, round: number): void {
  const s = ctx.state
  s.round = round
  s.phase = 'command'
  s.command = { picks: {}, revealed: false, priority: null, issuing: null }
  s.activation = { turn: null, current: null, drawn: null }
  expireEffects(ctx, 'phase')
  bd(s).flow = freshFlow()
  for (const u of Object.values(s.units)) {
    u.activated = false
    u.order.state = 'none'
  }
  for (const seat of SEATS) {
    s.players[seat].pool.tokens = []
    s.players[seat].passTokens = 0
  }
  ctx.emit({ type: 'RoundStarted', round }, null)
  ctx.emit({ type: 'PhaseStarted', name: 'command' }, null)
  runHook('round.start', { seat: 'A', state: s, engine: ctx })
  const seats = SEATS.filter((seat) => canPlayCard(s, seat) && playableCards(s, seat).length > 0)
  if (seats.length === 0) return afterPicks(ctx)
  const options: OptionInput[] = seats.flatMap((seat) =>
    playableCards(s, seat).map((cardId) => ({
      id: `${seat}:${cardId}`,
      labelKey: 'command.pick',
      type: 'command.pick' as const,
      seat,
      payload: { cardId },
      data: { cardId, pips: cardData(s.data, cardId).pips },
    })),
  )
  ctx.raise({ kind: 'command.pick', seat: 'all', window: 'command.picked', context: { seats }, options })
}

function afterPicks(ctx: Ctx): void {
  const s = ctx.state
  s.command.revealed = true
  ctx.reveal()
  ctx.emit({ type: 'CommandCardsRevealed', picks: { ...s.command.picks } }, null)
  for (const seat of SEATS) if (s.command.picks[seat]) activateCard(ctx, seat, s.command.picks[seat]!)
  if (openWindow(ctx, 'command.revealed', {}, `r${s.round}`, 'cmd.revealed')) return
  afterReveal(ctx)
}

/** Priority (R-4.4), then the commanders issue their orders (R-4.5, R-4.6). */
export function afterReveal(ctx: Ctx): void {
  const s = ctx.state
  const picks = s.command.picks
  const pips: Partial<Record<Seat, number>> = {}
  for (const seat of SEATS) if (picks[seat]) pips[seat] = cardData(s.data, picks[seat]!).pips
  let holder: Seat
  let rolloff: { faces: string[]; roller: Seat } | undefined
  const played = SEATS.filter((seat) => pips[seat] !== undefined)
  if (played.length === 1) holder = played[0]!
  else if (played.length === 2 && pips.A !== pips.B) holder = pips.A! < pips.B! ? 'A' : 'B'
  else if (s.origin.setup.options?.firstPriority) holder = s.origin.setup.options.firstPriority
  else {
    const roller: Seat = 'A'
    const idx = ctx.roll('priority', 1, 'def:red')
    const face = s.data.dice.defence.red[idx[0]!]!
    holder = face === 'block' ? roller : otherSeat(roller)
    rolloff = { faces: [face], roller }
  }
  s.command.priority = holder
  ctx.emit({ type: 'PriorityDecided', holder, pips, ...(rolloff ? { rolloff } : {}) }, holder)
  flowOf(s).issueSeats = [holder, otherSeat(holder)].filter((seat) => picks[seat] !== undefined)
  issueNext(ctx)
}

// ---------------------------------------------------------------------------
// Nominating a commander and issuing orders
// ---------------------------------------------------------------------------

/** Give one order. True when the OrderIssued trigger raised a decision: stop, `issueNext` continues after the answer. */
function issue(ctx: Ctx, unit: Unit): boolean {
  const s = ctx.state
  const iss = s.command.issuing!
  unit.order.state = 'faceUp'
  iss.remaining--
  ctx.emit({ type: 'OrderIssued', unitId: unit.id, by: iss.issuerId ?? '' }, unit.seat)
  return onOrderIssued(ctx, unit.id, iss.cardId, { name: ISSUE_RESUME })
}

const ISSUE_RESUME = 'command.issue'
registerFrameResume(ISSUE_RESUME, (ctx) => issueNext(ctx))

/** Continue the issuing sequence until a decision is needed or every seat is done. */
export function issueNext(ctx: Ctx): void {
  const s = ctx.state
  const flow = flowOf(s)
  while (flow.issueSeats.length > 0) {
    const seat = flow.issueSeats[0]!
    const cardId = s.command.picks[seat]!
    if (!s.command.issuing) {
      const cands = commanderCandidates(s, seat, cardId)
      if (cands.length === 0) {
        flow.issueSeats.shift()
        continue
      }
      if (cands.length > 1) {
        ctx.raise({
          kind: 'command.issuer',
          seat,
          window: 'command.priority',
          context: { cardId },
          options: cands.map((u) => ({ id: u.id, labelKey: 'command.issuer', type: 'command.issuer' as const, payload: { unitId: u.id }, data: { rank: u.rank } })),
        })
        return
      }
      s.command.issuing = { issuerId: cands[0]!.id, seat, remaining: cardData(s.data, cardId).orders.count, cardId }
    }
    const iss = s.command.issuing
    const eligible = iss.remaining > 0 ? orderTargets(s, seat, cardId) : []
    if (iss.remaining <= 0 || eligible.length === 0) {
      // orders that cannot be issued are lost (R-4.6)
      s.command.issuing = null
      flow.issueSeats.shift()
      continue
    }
    if (eligible.length <= iss.remaining) {
      // no choice: every eligible unit gets an order
      for (const u of eligible) if (issue(ctx, u)) return
      continue
    }
    ctx.raise({
      kind: 'command.order',
      seat,
      window: 'command.ordersIssued',
      context: { cardId, issuerId: iss.issuerId, remaining: iss.remaining },
      options: eligible.map((u) => ({ id: u.id, labelKey: 'command.order', type: 'command.order' as const, payload: { unitId: u.id }, data: { rank: u.rank, unitTypeId: u.unitTypeId } })),
    })
    return
  }
  finishOrders(ctx)
}

function finishOrders(ctx: Ctx): void {
  const s = ctx.state
  if (openWindow(ctx, 'command.ordersIssued', {}, `r${s.round}`, 'cmd.issued')) return
  afterOrders(ctx)
}

/** Order pools (R-4.8), the pass pool (R-4.9); Standing Orders simply stays in the hand (R-4.7). */
export function afterOrders(ctx: Ctx): void {
  const s = ctx.state
  for (const seat of SEATS) {
    const units = seatUnits(s, seat).filter((u) => u.order.state === 'none')
    const tokens = units.map((u) => u.rank).sort()
    for (const u of units) u.order.state = 'pool'
    s.players[seat].pool.tokens = tokens
    ctx.emit({ type: 'OrderPoolFormed', seat, size: tokens.length, byRank: poolCounts(tokens) }, seat)
  }
  const a = seatUnits(s, 'A').length
  const b = seatUnits(s, 'B').length
  const diff = Math.abs(a - b)
  if (diff >= 2) {
    const seat: Seat = a < b ? 'A' : 'B'
    s.players[seat].passTokens = (s.players[seat].passTokens ?? 0) + diff - 1
    ctx.emit({ type: 'PassTokensGranted', seat, n: diff - 1 }, seat)
  }
  beginActivationPhase(ctx)
}

// ---------------------------------------------------------------------------
// The command module
// ---------------------------------------------------------------------------

export const commandModule: ModuleDef = {
  id: 'command',
  namespaces: ['command'],

  handle(state: GameState, action: Action, _pending: PendingDecision) {
    switch (action.type) {
      case 'command.pick': {
        const { cardId } = action.payload
        const seat = action.seat
        if (!state.players[seat].hand.includes(cardId)) return reject('E_NOT_AN_OPTION', 'that card is not in your hand')
        return {
          run(ctx) {
            ctx.state.command.picks[seat] = cardId
            ctx.emit({ type: 'CommandCardPicked', seat, cardId }, seat)
            if (!ctx.lastAnswer) return
            afterPicks(ctx)
          },
        }
      }
      case 'command.issuer': {
        const { unitId } = action.payload
        const seat = action.seat
        return {
          run(ctx) {
            const cardId = ctx.state.command.picks[seat]!
            ctx.state.command.issuing = { issuerId: unitId, seat, remaining: cardData(ctx.state.data, cardId).orders.count, cardId }
            issueNext(ctx)
          },
        }
      }
      case 'command.order': {
        const unitId = action.payload.unitId
        if (!unitId) return reject('E_PASS_NOT_ALLOWED', 'an order must be issued while a unit can receive one')
        return {
          run(ctx) {
            if (issue(ctx, ctx.state.units[unitId]!)) return
            issueNext(ctx)
          },
        }
      }
      default:
        return reject('E_WRONG_DECISION', `${action.type} is not a command decision`)
    }
  },
}

export function assertCommandPhase(state: GameState): void {
  if (state.phase !== 'command') throw new EngineInvariantError(`expected the command phase, got ${state.phase}`)
}
