// Command-card effects and their windows (docs/spec/00 section 9). The command module reveals cards and issues orders; it
// calls `activateCard` when a card is revealed, `onOrderIssued` after each order and `fireWindow('command.ordersIssued')`
// once all orders are out. The card's effects are installed as ActiveEffects of kind `cardEffect` (expiring with the round,
// or the game for a Permanent card) and run through the same interpreter as keywords (keywords.ts). A card window opens a
// `card.choice` only when its seat can use something (an optional effect whose conditions hold).
import { getCodeEffect, codeEffectNames } from './armies/registry'
import { addEffect } from './effects'
import { choiceModule, cardDef, fireWindow, grantedActions, raiseOffer, runGrantedAction, unitDef, matchFilter, type FrameRef, type GrantedAction, rankKey, unitRank, matchesUnitType } from './keywords'
import { isPanicked } from './morale'
import type { Ctx, ModuleDef } from './registry'
import { EngineInvariantError, getUnit, seatUnits } from './state'
import type { CodeOffer, GameState, Seat, Unit } from './types'

export const commandCardsModule: ModuleDef = choiceModule('commandCards', 'card')

/** Card record accessors. */
export function cardPips(state: GameState, cardId: string): number {
  return Number(cardDef(state, cardId)?.pips ?? 0)
}

export function cardReturnsToHand(state: GameState, cardId: string): boolean {
  return !!cardDef(state, cardId)?.returnsToHand
}

export function cardIsPermanent(state: GameState, cardId: string): boolean {
  return !!(cardDef(state, cardId)?.keywords as string[] | undefined)?.includes('permanent')
}

/** Install a revealed card's effects. Expiry: the end of the round, or the game for a Permanent card. */
export function activateCard(ctx: Ctx, seat: Seat, cardId: string): void {
  const card = cardDef(ctx.state, cardId)
  if (!card) throw new EngineInvariantError(`unknown command card ${cardId}`)
  const expires = cardIsPermanent(ctx.state, cardId) ? 'game' : 'round'
  const effects = (card.effects ?? []) as { modifier?: string; trigger?: unknown; code?: string }[]
  effects.forEach((e, ei) => {
    if (e.code || e.trigger || e.modifier) addEffect(ctx, { source: cardId, seat, kind: 'cardEffect', expires, data: { cardId, ei } })
  })
  ctx.emit({ type: 'CardEffect', cardId, detail: { activated: effects.length, expires } }, seat)
  // code parts that act on the reveal itself (Darkness Descends: permanent part)
  for (const e of effects) {
    if (!e.code) continue
    const def = getCodeEffect(e.code)
    if (!def || !def.windows.includes('card.revealed')) continue
    const named = namedFor(ctx.state, cardId, seat)
    for (const owner of named.length > 0 ? named : [null]) {
      def.run(ctx, { window: 'card.revealed', params: (e as { params?: Record<string, unknown> }).params, owner, subjectId: owner?.id ?? null, seat, source: cardId, attack: null, pool: null, role: null, offers: [], info: {} })
    }
  }
}

/** Divulge a card at the Resolve Setup Effects step (K-52): the text below its line applies, the card is not played. */
export function divulgeCard(ctx: Ctx, seat: Seat, cardId: string): void {
  const card = cardDef(ctx.state, cardId)
  const div = card?.divulge as { window: string; effects: { code?: string; params?: Record<string, unknown> }[] } | undefined
  if (!div) throw new EngineInvariantError(`card ${cardId} has no divulge text`)
  for (const e of div.effects) {
    if (!e.code) continue
    const def = getCodeEffect(e.code)
    if (!def) throw new EngineInvariantError(`code effect ${e.code} is not registered`)
    const named = namedFor(ctx.state, cardId, seat)
    for (const owner of named.length > 0 ? named : [null]) {
      def.run(ctx, { window: div.window, params: e.params, owner, subjectId: owner?.id ?? null, seat, source: cardId, attack: null, pool: null, role: null, offers: [], info: {} })
    }
  }
  ctx.emit({ type: 'CardEffect', cardId, detail: { divulged: true } }, seat)
}

function namedFor(state: GameState, cardId: string, seat: Seat): Unit[] {
  const names: string[] | undefined = cardDef(state, cardId)?.restriction?.units
  if (!names) return []
  // a named unit still in reserve counts: Darkness Descends played in Round 1 with Vader undeployed must still reach him
  return seatUnits(state, seat).filter((u) => names.includes(u.unitTypeId))
}

// ---------------------------------------------------------------------------
// Playing a card: restriction and orders
// ---------------------------------------------------------------------------

/** A restricted character card can be played only while one of its named units is in play (op `or`). */
export function cardPlayable(state: GameState, seat: Seat, cardId: string): boolean {
  const names: string[] | undefined = cardDef(state, cardId)?.restriction?.units
  if (!names) return true
  return seatUnits(state, seat).some((u) => names.includes(u.unitTypeId))
}

export interface OrderSpec {
  /** units the card always orders (named character cards) */
  named: string[]
  /** how many more units it orders */
  count: number
  filter: { ranks?: string[]; unitTypes?: string[] } | null
  /** total orders the card gives: named units plus count */
  total: number
}

export function orderSpec(state: GameState, seat: Seat, cardId: string): OrderSpec {
  const o = cardDef(state, cardId)?.orders ?? { count: 0 }
  const named: string[] = o.named ? seatUnits(state, seat).filter((u) => (o.named as string[]).includes(u.unitTypeId)).map((u) => u.id) : []
  return { named, count: Number(o.count ?? 0), filter: o.filter ?? null, total: named.length + Number(o.count ?? 0) }
}

/** Units that can still receive an order from this card: not ordered yet, matching its filter (R-4.6, CMD-010). */
export function orderTargets(state: GameState, seat: Seat, cardId: string, ordered: readonly string[] = []): string[] {
  const spec = orderSpec(state, seat, cardId)
  return seatUnits(state, seat)
    .filter((u) => !ordered.includes(u.id) && u.order.state === 'none' && !u.activated)
    .filter((u) => {
      if (spec.named.includes(u.id)) return true
      const f = spec.filter
      if (!f) return true
      if (f.ranks && !f.ranks.map(rankKey).includes(unitRank(u))) return false
      if (f.unitTypes && !f.unitTypes.some((t) => matchesUnitType(state, u, t))) return false
      return true
    })
    .map((u) => u.id)
}

/** Fire the OrderIssued trigger for a unit ordered by `cardId` (null: not a command card order). Returns true when a decision was raised. */
export function onOrderIssued(ctx: Ctx, unitId: string, cardId: string | null, resume?: FrameRef): boolean {
  return fireWindow(ctx, 'OrderIssued', { unitId, ...(cardId ? { byCard: cardId } : {}), byCommandCard: cardId !== null, attack: false }, resume)
}

// ---------------------------------------------------------------------------
// Card actions (free or full): upgrade grants and code-effect actions
// ---------------------------------------------------------------------------

export interface CardAction extends GrantedAction {
  /** 'upgrade' grants run `do` lists; 'code' actions are provided by a command card hook */
  origin: 'upgrade' | 'code'
}

export function cardActions(ctx: Ctx | { state: GameState }, unit: Unit): CardAction[] {
  const st = ctx.state
  const out: CardAction[] = grantedActions(st, unit).map((a) => ({ ...a, origin: 'upgrade' as const }))
  for (const name of codeEffectNames()) {
    const def = getCodeEffect(name)
    const a = def?.action
    if (!a) continue
    const named = cardDef(st, a.card)?.restriction?.units as string[] | undefined
    if (named && !named.includes(unit.unitTypeId)) continue
    const inPlay = st.effects.some((e) => e.kind === 'cardEffect' && e.data?.cardId === a.card && e.seat === unit.seat)
    if (!inPlay) continue
    const available = !isPanicked(st, unit) && ('available' in a ? a.available(ctx as Ctx, unit.id) : true)
    out.push({ id: a.id, name: String(cardDef(st, a.card)?.name ?? a.id), kind: a.free ? 'free' : 'card', exhaust: 'none', upgradeId: a.card, available, ...(available ? {} : { whyNot: 'used' }), origin: 'code' })
  }
  return out
}

/** Execute a card action. Returns true when it raised a decision (the resume callback then continues the caller). */
export function runCardAction(ctx: Ctx, unitId: string, actionId: string, resume?: FrameRef): boolean {
  const unit = getUnit(ctx.state, unitId)
  for (const name of codeEffectNames()) {
    const a = getCodeEffect(name)?.action
    if (!a || a.id !== actionId) continue
    if (!a.available(ctx, unitId)) throw new EngineInvariantError(`card action ${actionId} is not available to ${unitId}`)
    ctx.emit({ type: 'ActionDeclared', unitId, action: actionId, free: a.free }, unit.seat)
    const offers: CodeOffer[] = []
    a.run(ctx, unitId, (o) => offers.push(o))
    const first = offers[0]
    if (first && resume) {
      raiseOffer(ctx, first, { src: 'card', id: a.card }, 'action.resolved', resume)
      return true
    }
    ctx.emit({ type: 'ActionResolved', unitId, action: actionId }, unit.seat)
    return false
  }
  return runGrantedAction(ctx, unitId, actionId, resume)
}

export { matchFilter, unitDef }
