// The command phase (docs/spec/40-ai.md section 5, step 4): which card to play, who issues, which units get orders.
// value(card) = orders it can give x the worth of a face-up order + the value of its effect this round + P(priority | card) x the
// worth of going first. The opponent's hand is open information; the AI assumes it picks uniformly among its remaining cards.
import type { Action, GameState, Seat } from '@/engine'
import { cardPips, orderSpec, orderTargets } from '@/engine/commandCards'
import { quickValue } from './activation'
import { otherSeat, tieBreak, worthOf } from './eval'
import type { AiCtx } from './tiers'

interface CardRec {
  restriction?: { units?: string[] } | null
  orders?: { count?: number }
  effects?: unknown[]
  persistent?: boolean
}

const cardOf = (s: GameState, id: string): CardRec => (s.data.cards[id] as unknown as CardRec | undefined) ?? {}

/** P(my card has priority) when the opponent picks uniformly from its remaining hand (fewer pips wins; a tie is a coin toss). */
export function priorityChance(s: GameState, me: Seat, pips: number): number {
  const hand = s.players[otherSeat(me)].hand
  if (hand.length === 0) return 1
  let p = 0
  for (const id of hand) {
    const o = cardPips(s, id)
    p += pips < o ? 1 : pips === o ? 0.5 : 0
  }
  return p / hand.length
}

export function cardValue(ctx: AiCtx, id: string): number {
  const s = ctx.view
  const seat = ctx.seat
  const card = cardOf(s, id)
  const named = card.restriction?.units
  if (named && !Object.values(s.units).some((u) => u.seat === seat && u.location !== 'defeated' && named.includes(u.unitTypeId))) return -100 + tieBreak(id)
  const spec = orderSpec(s, seat, id)
  const targets = orderTargets(s, seat, id).length
  const orders = Math.min(spec.total, targets)
  let v = orders * ctx.w.order
  if (card.effects && card.effects.length > 0) v += ctx.w.effect * (named ? 1.5 : 1)
  v += priorityChance(s, seat, cardPips(s, id)) * ctx.w.priority * (s.round >= 2 ? 1.25 : 1)
  // a card that stays in the hand costs nothing to play again; the others are spent
  if (card.persistent) v += 2
  return v + tieBreak(id)
}

/** `command.pick`: the card that is worth the most this round. */
export function pick(ctx: AiCtx): Action | null {
  const mine = (ctx.pending.options ?? []).filter((o) => o.action.seat === ctx.seat)
  if (mine.length === 0) return null
  let best: { a: Action; v: number; id: string } | null = null
  for (const o of mine) {
    const id = (o.action.payload as { cardId: string }).cardId
    const v = ctx.params.cards ? cardValue(ctx, id) : -cardPips(ctx.view, id) + tieBreak(id)
    if (!best || v > best.v) best = { a: o.action, v, id }
  }
  const beh = ctx.memory.stats.behaviour
  const r = String(ctx.view.round)
  ;(beh.cardsByRound[r] ??= []).push(best!.id)
  return best!.a
}

/** `command.issuer`: the Commander when there is a choice, else the most valuable unit. */
export function issuer(ctx: AiCtx): Action | null {
  const s = ctx.view
  let best: { a: Action; v: number } | null = null
  for (const o of ctx.pending.options ?? []) {
    const u = s.units[(o.action.payload as { unitId: string }).unitId]
    if (!u) continue
    const v = (u.rank === 'commander' ? 1000 : 0) + worthOf(s, u) + tieBreak(u.id)
    if (!best || v > best.v) best = { a: o.action, v }
  }
  return best?.a ?? null
}

/** `command.order`: give the order to the unit with the most to do in the coming activation (a shot, a marker in reach), else the dearest. */
export function order(ctx: AiCtx): Action | null {
  const s = ctx.view
  let best: { a: Action; v: number } | null = null
  for (const o of ctx.pending.options ?? []) {
    const id = (o.action.payload as { unitId?: string }).unitId
    const u = id ? s.units[id] : undefined
    if (!u) continue
    const v = quickValue(ctx, u) + worthOf(s, u) * 0.04 + (u.rank === 'commander' ? 1.5 : 0) + tieBreak(u.id)
    if (!best || v > best.v) best = { a: o.action, v }
  }
  return best?.a ?? (ctx.pending.options ?? []).find((o) => (o.action.payload as { done?: boolean }).done)?.action ?? null
}
