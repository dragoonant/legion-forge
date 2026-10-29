// ACT activation.* / action.*: the Activation phase (R-5). Turns alternate, priority holder first; on a turn a seat activates
// a unit with a face-up order, draws a random token from its pool and picks an unordered unit of that rank, or passes with a
// pass-pool token (not twice in a row). A unit's activation: rally, 2 actions (1 Suppressed, 0 Panicked), order token flipped.
//
// Combat seams: the Attack action goes through `registerAttackSeam` (attack.ts registers `{ canStart, start }` and calls
// `getFrameResume('activation.action')` when the action is over). Courage, Suppressed, Panicked, rally and the action
// allowance live in morale.ts.
import { actionData, unitData, unitTypeData } from './bundle'
import {
  bd,
  checkWipeout,
  contests,
  flowOf,
  heldAssets,
  markersOf,
  onActivationEnd,
  onActivationPhaseStart,
  onStepEvents,
  openWindow,
} from './battle'
import { beginEndPhase } from './endphase'
import { reconcilePools } from './command'
import { expireEffects, removeEffects } from './effects'
import { registerFrameResume, runHook } from './hooks'
import { cardActions, runCardAction } from './commandCards'
import { distance, miniBody } from './measure'
import { actionsFor, courageSource, isPanicked, isSuppressed, panicRelief, rallyRoll, refreshPanic, removeSuppression } from './morale'
import { beginMove, moveEndedWindow, planMove, unitSpeed } from './movement'
import { reject, type Ctx, type ModuleDef } from './registry'
import { constants, EngineInvariantError, leaderOf, otherSeat, poolCounts, seatUnits } from './state'
import { hasLos, miniLosBody } from './los'
import { keywordX } from './keywords'
import type { Action, FreeActionGrant, GameState, MoveFrame, PendingDecision, Seat, Unit } from './types'

// ---------------------------------------------------------------------------
// Attack seam (attack.ts registers itself at merge)
// ---------------------------------------------------------------------------

export interface AttackOpts {
  free: boolean
  /** a granted free attack may be limited to one weapon type (FreeActionGrant.weapons) */
  weapons?: 'melee' | 'ranged'
  /** a Standby attack may only declare this unit as the defender (R-5.12) */
  against?: string
}
export interface AttackSeam {
  /** is there a legal first step (an enemy in range and LoS) for this attacker? */
  canStart(state: GameState, unitId: string, opts: AttackOpts): boolean
  /** raise the first attack decision; when the action is over call `getFrameResume('activation.action')(ctx, 'finished' | 'cancelled', {})` */
  start(ctx: Ctx, unitId: string, opts: AttackOpts): void
}
let attackSeam: AttackSeam | null = null
export function registerAttackSeam(seam: AttackSeam | null): void {
  attackSeam = seam
}
export function hasAttackSeam(): boolean {
  return attackSeam !== null
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

function setToken(ctx: Ctx, unit: Unit, kind: string, to: number): void {
  const from = unit.tokens[kind] ?? 0
  if (from === to) return
  if (to <= 0) delete unit.tokens[kind]
  else unit.tokens[kind] = to
  ctx.emit({ type: 'TokenChanged', unitId: unit.id, kind, from, to }, unit.seat)
}

/** A unit loses its Standby token when it makes a Move, an attack or an action, or gains suppression (R-5.13). */
export function loseStandby(ctx: Ctx, unit: Unit): void {
  if ((unit.tokens.standby ?? 0) > 0) setToken(ctx, unit, 'standby', 0)
}

// ---------------------------------------------------------------------------
// The action menu (R-5.7 to R-5.11)
// ---------------------------------------------------------------------------

export interface MenuItem {
  id: string
  action: string
  params?: Record<string, unknown>
  free: boolean
  data?: Record<string, unknown>
}
export interface Menu {
  items: MenuItem[]
  withheld: { action: string; whyNot: string }[]
  /** a start-of-actions free action (Compel) is pending: it is the only item and the activation cannot end first */
  forced?: boolean
}

/** Free actions granted to the unit by effects (`freeAction`, FreeActionGrant), oldest first. */
export function grantedFreeActions(state: GameState, unitId: string): { effectId: string; grant: FreeActionGrant }[] {
  return state.effects.filter((e) => e.kind === 'freeAction' && e.unitId === unitId).map((e) => ({ effectId: e.id, grant: e.data as unknown as FreeActionGrant }))
}

const shortAction = (id: string): string => id.replace(/^core\.action\./, '')

const used = (state: GameState, action: string): boolean => (state.activation.current?.performed ?? []).some((p) => p.action === action)

/** The action was made this activation, as an action or as a free action (a free Attack counts as the Attack action, CRB p15, p30). */
const usedAny = (state: GameState, action: string): boolean => used(state, action) || used(state, `free.${action}`)

/** Was the unit Panicked when its Make Actions step began? Fixed for the whole activation (CRB p23). */
function panickedForActions(state: GameState, unit: Unit): boolean {
  const act = state.activation.current
  return act && act.unitId === unit.id && act.panickedAtStart !== undefined ? act.panickedAtStart : isPanicked(state, unit)
}

function climbPossible(state: GameState, unit: Unit): boolean {
  const lead = miniBody(state, leaderOf(unit))
  if ((leaderOf(unit).pos.y ?? 0) > 0) return true
  return state.table.def.pieces.some((p) => p.climbable && footprintDistToPiece(lead, p.bbox) <= 6)
}

function footprintDistToPiece(f: { pos: { x: number; z: number }; baseRadius: number }, b: { minX: number; maxX: number; minZ: number; maxZ: number }): number {
  const dx = Math.max(b.minX - f.pos.x, 0, f.pos.x - b.maxX)
  const dz = Math.max(b.minZ - f.pos.z, 0, f.pos.z - b.maxZ)
  return Math.max(0, Math.hypot(dx, dz) - f.baseRadius)
}

/** Can this unit claim an unclaimed Asset its card grants it (R-18.3, free action)? */
function claimTarget(state: GameState, unit: Unit): string | null {
  const grant = (state.data.battleCards[bd(state).secondary] as { grants?: { claim?: { asset: string; ownerOnly: boolean; maxHeld: number } } } | undefined)?.grants?.claim
  if (!grant || unit.location !== 'table') return null
  if (heldAssets(state, unit.id, grant.asset).length >= grant.maxHeld) return null
  for (const m of markersOf(state, 'asset')) {
    if (m.heldBy || !m.tags.includes(`asset:${grant.asset}`)) continue
    if (grant.ownerOnly && !m.tags.includes(`owner:${unit.seat}`)) continue
    if (contests(state, unit, m)) return m.id
  }
  return null
}

/** Can an undeployed unit enter the table at all (a cheap probe)? */
function probeEntry(state: GameState, unit: Unit): boolean {
  return planMove(state, { unitId: unit.id, seat: unit.seat, kind: 'move', maxSpeed: unitSpeed(state, unit), free: false }, null, true) !== null
}

export function actionMenu(state: GameState, unit: Unit): Menu {
  const act = state.activation.current
  const items: MenuItem[] = []
  const withheld: Menu['withheld'] = []
  const left = act?.actionsLeft ?? 0
  const ud = unitData(state.data, unit.unitTypeId)
  const type = unitTypeData(state.data, ud.unitType)
  const deployed = unit.location === 'table'
  const engaged = unit.engagedWith.length > 0
  const hold = (action: string, whyNot: string) => withheld.push({ action, whyNot })
  const paid = (action: string, ok: boolean, whyNot: string, item: () => MenuItem[]) => {
    if (left <= 0) return hold(action, 'noActions')
    if (!ok) return hold(action, whyNot)
    items.push(...item())
  }
  const repeatOnce = (action: string): boolean => (actionData(state.data, `core.action.${action}`)?.repeat ?? 'once') === 'once'
  const alreadyUsed = (action: string) => repeatOnce(action) && usedAny(state, action)
  const speed = unitSpeed(state, unit)

  // Move / Climb / Withdraw
  paid('move', !engaged && speed >= 1, engaged ? 'engaged' : 'speed', () => [{ id: 'move', action: 'move', free: false, data: { maxSpeed: speed } }])
  paid('climb', deployed && !engaged && climbPossible(state, unit), !deployed ? 'undeployed' : engaged ? 'engaged' : 'noClimbable', () => [{ id: 'climb', action: 'climb', free: false, data: { maxSpeed: 1 } }])
  // no attack and Withdraw in the same activation (Creature and Heavy Troopers may), no Standby and Withdraw (CRB p29, p39)
  const attackedBeforeWithdraw = usedAny(state, 'attack') && !type?.flags.attackAfterWithdraw
  const withdrawWhy = alreadyUsed('withdraw') ? 'alreadyUsed' : !engaged ? 'notEngaged' : attackedBeforeWithdraw ? 'afterAttack' : usedAny(state, 'standby') ? 'afterStandby' : null
  paid('withdraw', withdrawWhy === null, withdrawWhy ?? '', () => [{ id: 'withdraw', action: 'withdraw', free: false, data: { maxSpeed: 1 } }])

  // Attack
  const wd = used(state, 'withdraw')
  const noAttack = alreadyUsed('attack') ? 'alreadyUsed' : usedAny(state, 'standby') ? 'afterStandby' : wd && !type?.flags.attackAfterWithdraw ? 'afterWithdraw' : !deployed ? 'undeployed' : !attackSeam ? 'notAvailable' : null
  paid('attack', noAttack === null && attackSeam!.canStart(state, unit.id, { free: false }), noAttack ?? 'noTarget', () => [{ id: 'attack', action: 'attack', free: false }])

  // Aim, Dodge
  for (const a of ['aim', 'dodge'] as const) {
    paid(a, deployed && !alreadyUsed(a), !deployed ? 'undeployed' : 'alreadyUsed', () => [{ id: a, action: a, free: false }])
  }

  // Recover: any number of suppression tokens, ready exhausted upgrades
  const exhausted = (unit.flags.exhausted as string[] | undefined) ?? []
  const canRecover = deployed && !alreadyUsed('recover') && (unit.suppression > 0 || exhausted.length > 0)
  paid('recover', canRecover, !deployed ? 'undeployed' : alreadyUsed('recover') ? 'alreadyUsed' : 'nothingToRecover', () => {
    const out: MenuItem[] = []
    for (let k = 1; k <= Math.min(unit.suppression, 8); k++) out.push({ id: `recover:${k}`, action: 'recover', params: { remove: k }, free: false })
    if (out.length === 0) out.push({ id: 'recover:0', action: 'recover', params: { remove: 0 }, free: false })
    return out
  })

  // Standby: Trooper units, at most one token, never with Attack or Withdraw in the same activation
  const standbyWhy = !type?.flags.trooper ? 'notTrooper' : !deployed ? 'undeployed' : alreadyUsed('standby') ? 'alreadyUsed' : (unit.tokens.standby ?? 0) >= (constants(state).standbyMax ?? 1) ? 'hasToken' : usedAny(state, 'attack') ? 'afterAttack' : wd ? 'afterWithdraw' : null
  paid('standby', standbyWhy === null, standbyWhy ?? '', () => [{ id: 'standby', action: 'standby', free: false }])

  // Free card actions granted by the battle cards: Claim
  const claim = claimTarget(state, unit)
  const panicked = panickedForActions(state, unit)
  if (panicked) hold('claim', 'panicked')
  else if (alreadyUsed('claim')) hold('claim', 'alreadyUsed')
  else if (claim) items.push({ id: 'claim', action: 'claim', free: true, data: { markerId: claim } })

  // Free actions granted by effects (Compel's move, granted attacks): consumed when taken
  const grants = grantedFreeActions(state, unit.id).filter((g) => !panicked || g.grant.startOfActions)
  const forced = grants.find((g) => g.grant.startOfActions && g.grant.action === 'core.action.move' && deployed && !engaged && speed >= 1 && probeEntry(state, unit))
  if (forced) {
    return { items: [{ id: `free:${forced.effectId}`, action: 'free', params: { effectId: forced.effectId }, free: true, data: { action: 'move', maxSpeed: speed, source: forced.grant.source } }], withheld, forced: true }
  }
  for (const g of grants) {
    if (g.grant.startOfActions) continue
    const name = shortAction(g.grant.action)
    const item: MenuItem = { id: `free:${g.effectId}`, action: 'free', params: { effectId: g.effectId }, free: true, data: { action: name, source: g.grant.source } }
    if (name === 'move' && deployed && !engaged && speed >= 1) items.push({ ...item, data: { ...item.data, maxSpeed: speed } })
    else if (name === 'attack' && deployed && (!usedAny(state, 'attack') || g.grant.ignoreAttackLimit) && attackSeam?.canStart(state, unit.id, { free: true, ...(g.grant.weapons ? { weapons: g.grant.weapons } : {}) })) items.push(item)
    else if ((name === 'aim' || name === 'dodge') && deployed && !usedAny(state, name)) items.push(item)
    else hold(`free:${name}`, 'notAvailable')
  }

  // Card actions: upgrade grants (Force Push, Specialist) and command-card actions, free or one action each
  if (deployed && !panicked) {
    for (const a of cardActions({ state }, unit)) {
      const item: MenuItem = { id: `card:${a.id}`, action: 'cardAction', params: { actionId: a.id }, free: a.kind === 'free', data: { name: a.name, kind: a.kind, upgradeId: a.upgradeId } }
      // each card action at most once per activation, even after a Recover readied its card (CRB p15, p23)
      if (used(state, a.id)) hold(`card:${a.id}`, 'alreadyUsed')
      else if (!a.available) hold(`card:${a.id}`, a.whyNot ?? 'unavailable')
      else if (a.kind === 'free') items.push(item)
      else paid(`card:${a.id}`, true, '', () => [item])
    }
  }

  // Scout X: an undeployed unit may deploy with a free Speed-X Move at the start of its Make Actions step (CRB p54)
  const scout = Math.min(3, keywordX(state, unit, 'kw.scout'))
  if (!deployed && scout > 0 && (act?.performed.length ?? 0) === 0 && !panicked) {
    items.push({ id: 'scout', action: 'scout', free: true, data: { maxSpeed: scout, ignoreDifficult: true } })
  }

  // R-5.11: an undeployed unit may only Move (and free Moves)
  if (!deployed) {
    const keep = items.filter((i) => i.action === 'move' || i.action === 'scout')
    for (const i of items) if (i.action !== 'move' && i.action !== 'scout') hold(i.action, 'undeployed')
    return { items: keep, withheld }
  }
  return { items, withheld }
}

// ---------------------------------------------------------------------------
// Raising the menu / ending
// ---------------------------------------------------------------------------

function activeUnit(state: GameState): Unit {
  const a = state.activation.current
  if (!a) throw new EngineInvariantError('no activation in progress')
  const u = state.units[a.unitId]
  if (!u) throw new EngineInvariantError(`activation of unknown unit ${a.unitId}`)
  return u
}

/** Raise `action.choose` for the active unit, or end the activation when nothing can be done. */
export function continueActivation(ctx: Ctx): void {
  const s = ctx.state
  if (s.phase === 'ended') return
  const act = s.activation.current
  if (!act) return
  const unit = activeUnit(s)
  if (unit.location === 'defeated') return endActivation(ctx)
  const menu = actionMenu(s, unit)
  const deployed = unit.location === 'table'
  // a unit out of actions with no free action left ends by itself
  if (menu.items.length === 0 && (act.actionsLeft <= 0 || !deployed)) {
    // an undeployed unit that cannot enter at all may skip (RULING Port choice); a unit with actions but no legal one may end
    return endActivation(ctx)
  }
  if (!deployed && act.actionsLeft > 0) {
    // must deploy: offer `end` only when no legal entry exists (RULING Port choice)
    const probe = menu.items.some((i) => i.action === 'move') ? probeEntry(s, unit) : null
    if (probe) {
      raiseMenu(ctx, unit, menu, false)
      return
    }
  }
  raiseMenu(ctx, unit, menu, !menu.forced)
}

function raiseMenu(ctx: Ctx, unit: Unit, menu: Menu, withEnd: boolean): void {
  const s = ctx.state
  const act = s.activation.current!
  const options = menu.items.map((i) => ({
    id: i.id,
    labelKey: `action.${i.action}`,
    type: 'action.choose' as const,
    payload: { action: i.action, ...(i.params ? { params: i.params } : {}) },
    data: { free: i.free, ...(i.data ?? {}) },
  }))
  if (withEnd) options.push({ id: 'end', labelKey: 'action.end', type: 'action.choose' as const, payload: { action: 'end' }, data: { free: true } })
  ctx.raise({
    kind: 'action.choose',
    seat: unit.seat,
    window: 'action.declared',
    context: {
      unitId: unit.id,
      actionsLeft: act.actionsLeft,
      performed: act.performed.map((p) => p.action),
      withheld: menu.withheld,
      suppressed: isSuppressed(s, unit),
      panicked: panickedForActions(s, unit),
      deployed: unit.location === 'table',
    },
    options,
  })
}

/** End of the activation (R-5.5): panic relief, end effects, order token face down, turn passes. */
export function endActivation(ctx: Ctx): void {
  const s = ctx.state
  const act = s.activation.current
  if (!act) return
  const unit = activeUnit(s)
  // a Panicked unit that took no actions sheds suppression equal to its own courage (R-15.5)
  if (unit.location !== 'defeated' && act.performed.length === 0 && panickedForActions(s, unit)) panicRelief(ctx, unit)
  runHook('activation.end', { seat: unit.seat, state: s, engine: ctx, unitId: unit.id })
  if (openWindow(ctx, 'activation.end', { unitId: unit.id }, `a${flowOf(s).activations}`, 'act.ended')) return
  afterEndWindow(ctx)
}

export function afterEndWindow(ctx: Ctx): void {
  const s = ctx.state
  const act = s.activation.current
  if (!act) return
  const unit = activeUnit(s)
  if (unit.location !== 'defeated') {
    onActivationEnd(ctx, unit)
    // Implacable (and any effect that returns the order token to the pool) leaves the unit activatable again
    if (unit.flags.returnedToPool) delete unit.flags.returnedToPool
    else {
      unit.activated = true
      unit.order.state = 'spent'
    }
  }
  const mover = s.units[act.unitId]
  if (mover) delete mover.flags.movedThisActivation
  ctx.emit({ type: 'ActivationEnded', unitId: unit.id, actionsUsed: act.performed.filter((p) => !p.free).length }, act.seat)
  s.activation.current = null
  expireEffects(ctx, 'activation')
  reconcilePools(ctx)
  const flow = flowOf(s)
  flow.lastPass[act.seat] = false
  flow.deadDraw = false
  onStepEvents(ctx)
  if (checkWipeout(ctx)) return
  s.activation.turn = otherSeat(act.seat)
  nextTurn(ctx)
}

// ---------------------------------------------------------------------------
// Phase and turns (R-5.1 to R-5.4)
// ---------------------------------------------------------------------------

export function beginActivationPhase(ctx: Ctx): void {
  const s = ctx.state
  s.phase = 'activation'
  ctx.emit({ type: 'PhaseStarted', name: 'activation' }, null)
  expireEffects(ctx, 'phase')
  const flow = flowOf(s)
  flow.lastPass = { A: false, B: false }
  flow.deadDraw = false
  s.activation.turn = s.command.priority
  s.activation.current = null
  s.activation.drawn = null
  if (s.round === 1) onActivationPhaseStart(ctx)
  if (openWindow(ctx, 'activation.phaseStart', { eachOwner: true }, `r${s.round}`, 'act.phaseStarted')) return
  nextTurn(ctx)
}

/** Units of `seat` that can be activated through a face-up order. */
function orderedUnits(state: GameState, seat: Seat): Unit[] {
  return seatUnits(state, seat).filter((u) => u.order.state === 'faceUp' && !u.activated)
}

function hasNothingToActivate(state: GameState, seat: Seat): boolean {
  return orderedUnits(state, seat).length === 0 && state.players[seat].pool.tokens.length === 0
}

/** Raise the active seat's turn decision, skipping a seat with nothing left, ending the phase when both are done. */
export function nextTurn(ctx: Ctx): void {
  const s = ctx.state
  let seat = s.activation.turn
  if (!seat) throw new EngineInvariantError('activation turn is not set')
  if (hasNothingToActivate(s, seat)) {
    ctx.emit({ type: 'Passed', seat, spentToken: false }, seat)
    seat = otherSeat(seat)
    if (hasNothingToActivate(s, seat)) {
      s.activation.turn = null
      return beginEndPhase(ctx)
    }
    s.activation.turn = seat
  }
  raiseChoose(ctx, seat)
}

function raiseChoose(ctx: Ctx, seat: Seat): void {
  const s = ctx.state
  const flow = flowOf(s)
  const options = orderedUnits(s, seat).map((u) => ({
    id: `unit:${u.id}`,
    labelKey: 'activation.order',
    type: 'activation.choose' as const,
    payload: { unitId: u.id },
    data: { unitId: u.id, rank: u.rank, suppression: u.suppression, standby: (u.tokens.standby ?? 0) > 0, undeployed: u.location !== 'table' },
  }))
  const pool = s.players[seat].pool.tokens
  if (pool.length > 0) options.push({ id: 'drawPool', labelKey: 'activation.drawPool', type: 'activation.choose' as const, payload: { drawPool: true } as never, data: { poolSize: pool.length, byRank: poolCounts(pool) } as never })
  const canPass = flow.deadDraw || ((s.players[seat].passTokens ?? 0) > 0 && !flow.lastPass[seat])
  ctx.raise({
    kind: 'activation.choose',
    seat,
    window: 'activation.phaseStart',
    context: { turn: seat, passTokens: s.players[seat].passTokens ?? 0, freePass: flow.deadDraw, poolSize: pool.length },
    options,
    canPass,
  })
}

function startActivation(ctx: Ctx, unit: Unit, via: 'order' | 'pool'): void {
  const s = ctx.state
  const flow = flowOf(s)
  flow.activations++
  expireEffects(ctx, `startOfActivation:${unit.id}`)
  s.activation.drawn = null
  delete unit.flags.movedThisActivation
  s.activation.current = { unitId: unit.id, seat: unit.seat, via, actionsLeft: 0, performed: [], declared: null }
  ctx.emit({ type: 'UnitActivated', unitId: unit.id, via, rank: unit.rank }, unit.seat)
  runHook('activation.start', { seat: unit.seat, state: s, engine: ctx, unitId: unit.id })
  if (openWindow(ctx, 'activation.start', { unitId: unit.id }, `a${flow.activations}`, 'act.started')) return
  afterStartWindow(ctx)
}

export function afterStartWindow(ctx: Ctx): void {
  const s = ctx.state
  const unit = activeUnit(s)
  // rally happens for units on the table; undeployed units have no suppression
  rallyRoll(ctx, unit)
  refreshPanic(ctx)
  if (openWindow(ctx, 'activation.rallied', { unitId: unit.id }, `a${flowOf(s).activations}`, 'act.rallied')) return
  afterRallied(ctx)
}

export function afterRallied(ctx: Ctx): void {
  const s = ctx.state
  const unit = activeUnit(s)
  const act = s.activation.current!
  // a unit that panicked earlier in the round was already announced (and dropped its Assets) by morale.refreshPanic
  const wasPanicked = Boolean(unit.flags.panicked)
  refreshPanic(ctx)
  const panicked = isPanicked(s, unit)
  if (unit.suppression > 0 && !(panicked && !wasPanicked)) {
    ctx.emit({ type: 'PanicChecked', unitId: unit.id, suppression: unit.suppression, courage: courageSource(s, unit).courage, panicked }, unit.seat)
  }
  act.panickedAtStart = panicked
  act.actionsLeft = actionsFor(s, unit)
  continueActivation(ctx)
}

// ---------------------------------------------------------------------------
// Declaring and completing actions
// ---------------------------------------------------------------------------

function declare(ctx: Ctx, unit: Unit, action: string, params: Record<string, unknown> | undefined): void {
  const s = ctx.state
  const act = s.activation.current!
  const free = (actionData(s.data, `core.action.${action}`)?.free ?? false) || action === 'scout'
  act.declared = { action, ...(params ? { params } : {}) }
  if (action !== 'cardAction') ctx.emit({ type: 'ActionDeclared', unitId: unit.id, action, free }, unit.seat)
  loseStandby(ctx, unit)
  switch (action) {
    case 'scout': {
      // a free Move that deploys the unit; it counts as a Move action for Relentless and the like (CRB p54)
      act.declared = { action: 'free.move', params: { free: true, move: true, source: 'kw.scout' } }
      return beginMove(ctx, { unitId: unit.id, seat: unit.seat, kind: 'move', maxSpeed: Math.min(3, keywordX(s, unit, 'kw.scout')), free: true, ignoreDifficult: true })
    }
    case 'cardAction': {
      const actionId = String(params?.actionId)
      const a = cardActions({ state: s }, unit).find((x) => x.id === actionId)
      if (a?.jump !== undefined) {
        // Jump X: a Move action as normal that ignores difficult terrain and terrain of height X or lower (CRB p52)
        act.declared = { action: actionId, params: { ...params, free: false, move: true } }
        ctx.emit({ type: 'ActionDeclared', unitId: unit.id, action: actionId, free: false }, unit.seat)
        return beginMove(ctx, { unitId: unit.id, seat: unit.seat, kind: 'move', maxSpeed: unitSpeed(s, unit), free: false, ignoreDifficult: true, jumpHeight: a.jump })
      }
      // recorded under the card action's own id so the once-per-activation ledger and the sim can tell them apart
      act.declared = { action: actionId, params: { ...params, card: true, free: a?.kind === 'free' } }
      if (runCardAction(ctx, unit.id, actionId, { name: CARD_ACTION })) return
      return afterCardAction(ctx)
    }
    case 'free':
      return declareFree(ctx, unit, String(params?.effectId))
    case 'aim':
    case 'dodge':
      setToken(ctx, unit, action, (unit.tokens[action] ?? 0) + 1)
      return completeAction(ctx)
    case 'standby':
      setToken(ctx, unit, 'standby', 1)
      return completeAction(ctx)
    case 'recover': {
      const remove = Math.min(unit.suppression, Number(params?.remove ?? 0))
      if (remove > 0) removeSuppression(ctx, unit.id, remove, 'recover')
      if (unit.flags.exhausted) delete unit.flags.exhausted
      return completeAction(ctx)
    }
    case 'claim': {
      const id = claimTarget(s, unit)
      if (id) {
        s.table.objectives[id]!.heldBy = unit.id
        ctx.emit({ type: 'ObjectiveChanged', objectiveId: id, detail: { claimedBy: unit.id } }, unit.seat)
      }
      return completeAction(ctx)
    }
    case 'move':
    case 'climb':
    case 'withdraw': {
      const speed = action === 'move' ? unitSpeed(s, unit) : 1
      return beginMove(ctx, { unitId: unit.id, seat: unit.seat, kind: action, maxSpeed: speed, free: false })
    }
    case 'attack': {
      if (!attackSeam) throw new EngineInvariantError('attack chosen but no attack seam is registered')
      return attackSeam.start(ctx, unit.id, { free: false })
    }
    default:
      throw new EngineInvariantError(`unknown action ${action}`)
  }
}

// ---------------------------------------------------------------------------
// Free actions granted by effects, card actions, controlled moves (Force Push)
// ---------------------------------------------------------------------------

const CARD_ACTION = 'activation.cardAction'

/** Take a granted free action (Compel's Move, a granted Attack, Aim or Dodge); the grant is spent when taken. */
function declareFree(ctx: Ctx, unit: Unit, effectId: string): void {
  const s = ctx.state
  const act = s.activation.current!
  const eff = s.effects.find((e) => e.id === effectId && e.kind === 'freeAction' && e.unitId === unit.id)
  if (!eff) throw new EngineInvariantError(`no free action grant ${effectId} for ${unit.id}`)
  const grant = eff.data as unknown as FreeActionGrant
  removeEffects(ctx, (e) => e.id === effectId)
  const name = shortAction(grant.action)
  // recorded as `free.<action>` so a granted Attack neither uses up nor is blocked by the Attack action of the activation
  act.declared = { action: `free.${name}`, params: { free: true, source: grant.source } }
  ctx.emit({ type: 'ActionDeclared', unitId: unit.id, action: `free.${name}`, free: true }, unit.seat)
  switch (name) {
    case 'move':
      return beginMove(ctx, { unitId: unit.id, seat: unit.seat, kind: 'move', maxSpeed: unitSpeed(s, unit), free: true })
    case 'attack':
      if (!attackSeam) throw new EngineInvariantError('free attack granted but no attack seam is registered')
      return attackSeam.start(ctx, unit.id, { free: true, ...(grant.weapons ? { weapons: grant.weapons } : {}) })
    case 'aim':
    case 'dodge':
      setToken(ctx, unit, name, (unit.tokens[name] ?? 0) + 1)
      return completeAction(ctx)
    default:
      throw new EngineInvariantError(`unsupported free action ${grant.action}`)
  }
}

/** A card action finished (possibly after a choice): resolve controlled moves it set up, then complete the action. */
function afterCardAction(ctx: Ctx): void {
  if (startControlledMove(ctx)) return
  completeAction(ctx)
}

registerFrameResume(CARD_ACTION, (ctx) => afterCardAction(ctx))

/**
 * Force Push: a `controlledMove` effect names an enemy unit that makes a Move its opponent controls (speed X, optionally
 * even while engaged). The controlling player places the tool; the effect is spent when the Move starts.
 */
function startControlledMove(ctx: Ctx): boolean {
  const s = ctx.state
  const eff = s.effects.find((e) => e.kind === 'controlledMove' && e.unitId && s.units[e.unitId]?.location === 'table')
  if (!eff) return false
  const target = s.units[eff.unitId!]!
  const data = eff.data as { speed?: number; ignoreEngagement?: boolean }
  removeEffects(ctx, (e) => e.id === eff.id)
  const speed = Math.max(1, Math.min(3, Number(data.speed ?? 1)))
  if (target.engagedWith.length > 0 && !data.ignoreEngagement) return false
  beginMove(ctx, { unitId: target.id, seat: otherSeat(target.seat), kind: 'controlled', maxSpeed: speed, free: true })
  return true
}

/** The declared action resolved: record it, spend the action, then Standby triggers and the next menu. */
export function completeAction(ctx: Ctx): void {
  const s = ctx.state
  const act = s.activation.current
  if (!act || !act.declared) throw new EngineInvariantError('completeAction with no declared action')
  const free = (actionData(s.data, `core.action.${act.declared.action}`)?.free ?? false) || act.declared.params?.free === true
  const isMove = MOVE_LEDGER.has(act.declared.action) || act.declared.params?.move === true
  act.performed.push({ action: act.declared.action, free, ...(isMove ? { move: true } : {}) })
  if (!free) act.actionsLeft = Math.max(0, act.actionsLeft - 1)
  // a card action emitted its own ActionResolved (keywords.ts / commandCards.ts)
  if (!act.declared.params?.card) ctx.emit({ type: 'ActionResolved', unitId: act.unitId, action: act.declared.action }, act.seat)
  act.declared = null
  // a Standby token is spent before any effect that triggers after the action resolves (CRB p37); a Move already gave its
  // Standby units their chance when it ended (movement.finishMove), before the move.ended effects
  if (!isMove && raiseStandby(ctx, 'action.resolved')) return
  openActionResolved(ctx)
}

/** Ledger names of the Move family: a Move, Climb, Withdraw or a free Move are all Move actions (Relentless, Standby). */
const MOVE_LEDGER = new Set(['move', 'climb', 'withdraw', 'free.move'])

/** The ledger name of a performed action as the core action id the declarative triggers read. */
function coreActionId(ledger: string, move: boolean): string {
  if (move || MOVE_LEDGER.has(ledger)) return 'core.action.move'
  return ledger.startsWith('free.') ? `core.action.${ledger.slice(5)}` : ledger.includes('.') ? ledger : `core.action.${ledger}`
}

function openActionResolved(ctx: Ctx): void {
  const s = ctx.state
  const act = s.activation.current!
  const last = act.performed[act.performed.length - 1]!
  const info = { unitId: act.unitId, action: coreActionId(last.action, last.move === true), free: last.free }
  if (openWindow(ctx, 'action.resolved', info, `a${flowOf(s).activations}:${act.performed.length}`, 'act.resolved')) return
  afterActionResolved(ctx)
}

/** The declared action was abandoned before anything resolved (a cancelled tool placement): no cost. */
export function cancelAction(ctx: Ctx): void {
  const s = ctx.state
  const act = s.activation.current
  if (!act || !act.declared) throw new EngineInvariantError('cancelAction with no declared action')
  ctx.emit({ type: 'ActionCancelled', unitId: act.unitId, action: act.declared.action }, act.seat)
  act.declared = null
  continueActivation(ctx)
}

/** After the `action.resolved` window: Standby triggers, scoring on events, then the next menu. */
export function afterActionResolved(ctx: Ctx): void {
  reconcilePools(ctx)
  onStepEvents(ctx)
  if (checkWipeout(ctx)) return
  continueActivation(ctx)
}

// ---------------------------------------------------------------------------
// Standby (R-5.12, R-5.13)
// ---------------------------------------------------------------------------

function standbyEligible(state: GameState, trigger: Unit, skip: readonly string[]): Unit[] {
  const c = constants(state)
  if (trigger.location !== 'table') return []
  const tb = trigger.minis.filter((m) => m.alive)
  return seatUnits(state, otherSeat(trigger.seat)).filter((u) => {
    if (u.location !== 'table' || (u.tokens.standby ?? 0) <= 0 || skip.includes(u.id)) return false
    if (!unitTypeData(state.data, unitData(state.data, u.unitTypeId).unitType)?.flags.trooper) return false
    for (const m of u.minis) {
      if (!m.alive) continue
      for (const t of tb) {
        if (distance(miniBody(state, m), miniBody(state, t)) <= c.standbyRange * c.rangeBand && hasLos(state.table.def, miniLosBody(state, m), miniLosBody(state, t))) return true
      }
    }
    return false
  })
}

export function raiseStandby(ctx: Ctx, then: 'move.ended' | 'action.resolved'): boolean {
  // the Move that triggered Standby: a response Move reuses the frame slot, so it is kept here until the chain is done
  const frame = flowOf(ctx.state).standby?.frame ?? (then === 'move.ended' ? flowOf(ctx.state).move : null)
  const s = ctx.state
  const act = s.activation.current
  if (!act) return false
  const trigger = s.units[act.unitId]
  if (!trigger) return false
  const flow = flowOf(s)
  const done = flow.standby?.done ?? []
  const eligible = standbyEligible(s, trigger, done)
  if (eligible.length === 0) {
    flow.standby = null
    return false
  }
  flow.standby = { triggerUnitId: trigger.id, done, responding: false, then, frame }
  const seat = eligible[0]!.seat
  const options: { id: string; labelKey: string; type: 'activation.standby'; payload: { unitId: string; response: string } }[] = []
  for (const u of eligible) {
    options.push({ id: `${u.id}:move`, labelKey: 'standby.move', type: 'activation.standby', payload: { unitId: u.id, response: 'move' } })
    if (attackSeam?.canStart(s, u.id, { free: true, against: trigger.id })) {
      options.push({ id: `${u.id}:attack`, labelKey: 'standby.attack', type: 'activation.standby', payload: { unitId: u.id, response: 'attack' } })
    }
  }
  ctx.raise({ kind: 'activation.standby', seat, window: 'action.resolved', context: { triggerUnitId: trigger.id, eligible: eligible.map((u) => u.id) }, options, canPass: true })
  return true
}

/** A Standby response (free Move or free Attack) is over. */
function standbyResponseDone(ctx: Ctx): void {
  const flow = flowOf(ctx.state)
  const then = flow.standby?.then ?? 'action.resolved'
  const frame = flow.standby?.frame ?? null
  if (flow.standby) flow.standby.responding = false
  onStepEvents(ctx)
  if (checkWipeout(ctx)) return
  if (raiseStandby(ctx, then)) return
  afterStandby(ctx, then, frame)
}

/** Every Standby response is done (or declined): the effects that trigger after the Move / action now resolve. */
function afterStandby(ctx: Ctx, then: 'move.ended' | 'action.resolved', frame: MoveFrame | null): void {
  if (then === 'move.ended') {
    flowOf(ctx.state).move = frame
    return moveEndedWindow(ctx)
  }
  openActionResolved(ctx)
}

/** Movement hands back here when a Move (or a cancelled placement) is over. */
export function afterMoveFinished(ctx: Ctx, frameKind: string, outcome: 'finished' | 'cancelled'): void {
  if (frameKind === 'standby') return standbyResponseDone(ctx)
  if (frameKind === 'controlled') return afterCardAction(ctx)
  if (outcome === 'cancelled') return cancelAction(ctx)
  completeAction(ctx)
}

registerFrameResume('activation.action', (ctx, outcome) => {
  const flow = flowOf(ctx.state)
  if (flow.standby?.responding) return standbyResponseDone(ctx)
  if (outcome === 'cancelled') return cancelAction(ctx)
  completeAction(ctx)
})

// ---------------------------------------------------------------------------
// The activation / action module
// ---------------------------------------------------------------------------

function candidatesForRank(state: GameState, seat: Seat, rank: string): Unit[] {
  return seatUnits(state, seat).filter((u) => u.order.state === 'pool' && !u.activated && u.rank === rank)
}

export const activationModule: ModuleDef = {
  id: 'activation',
  namespaces: ['activation', 'action'],

  handle(state: GameState, action: Action, pending: PendingDecision) {
    switch (action.type) {
      case 'pass': {
        if (pending.kind !== 'activation.choose' && pending.kind !== 'activation.standby') return reject('E_PASS_NOT_ALLOWED', 'this decision cannot be passed')
        if (pending.kind === 'activation.standby') {
          return {
            run(ctx) {
              const f = flowOf(ctx.state)
              const then = f.standby?.then ?? 'action.resolved'
              const frame = f.standby?.frame ?? null
              f.standby = null
              afterStandby(ctx, then, frame)
            },
          }
        }
        const seat = action.seat
        return {
          run(ctx) {
            const f = flowOf(ctx.state)
            const free = f.deadDraw
            if (!free) ctx.state.players[seat].passTokens = Math.max(0, (ctx.state.players[seat].passTokens ?? 0) - 1)
            f.lastPass[seat] = true
            f.deadDraw = false
            ctx.emit({ type: 'Passed', seat, spentToken: !free }, seat)
            ctx.state.activation.turn = otherSeat(seat)
            nextTurn(ctx)
          },
        }
      }
      case 'activation.choose': {
        const seat = action.seat
        if (action.payload.drawPool) {
          return {
            run(ctx) {
              const s = ctx.state
              const tokens = s.players[seat].pool.tokens
              // The pool draw emits no `Drawn` event: its index would name the token to a player who knows the pool's counts
              // (hidden information, 00 section 3.2). The draw still consumes exactly one `rng.int`, so replays agree.
              const i = ctx.rng.int(tokens.length)
              ctx.rolled = true
              const rank = tokens.splice(i, 1)[0]!
              ctx.emit({ type: 'PoolTokenDrawn', seat, rank }, seat)
              const cands = candidatesForRank(s, seat, rank)
              if (cands.length === 0) {
                // dead draw (R-5.3): the token leaves the game; the seat may pass for free, otherwise chooses again
                ctx.emit({ type: 'PoolTokenRemoved', seat, rank, reason: 'deadDraw' }, seat)
                flowOf(s).deadDraw = true
                return raiseChoose(ctx, seat)
              }
              flowOf(s).deadDraw = false
              s.activation.drawn = { seat, rank }
              if (cands.length === 1) return startActivation(ctx, cands[0]!, 'pool')
              ctx.raise({
                kind: 'activation.pick',
                seat,
                window: 'activation.phaseStart',
                context: { rank },
                options: cands.map((u) => ({ id: `unit:${u.id}`, labelKey: 'activation.pick', type: 'activation.pick' as const, payload: { unitId: u.id }, data: { unitId: u.id } })),
              })
            },
          }
        }
        const unitId = action.payload.unitId!
        return {
          run(ctx) {
            flowOf(ctx.state).deadDraw = false
            startActivation(ctx, ctx.state.units[unitId]!, 'order')
          },
        }
      }
      case 'activation.pick': {
        const unitId = action.payload.unitId
        return {
          run(ctx) {
            startActivation(ctx, ctx.state.units[unitId]!, 'pool')
          },
        }
      }
      case 'action.choose': {
        const a = action.payload.action
        const params = action.payload.params
        return {
          run(ctx) {
            if (a === 'end') return endActivation(ctx)
            declare(ctx, activeUnit(ctx.state), a, params)
          },
        }
      }
      case 'activation.standby': {
        const { unitId, response } = action.payload
        return {
          run(ctx) {
            const s = ctx.state
            const f = flowOf(s)
            const u = s.units[unitId!]!
            const trigger = f.standby!.triggerUnitId
            setToken(ctx, u, 'standby', 0)
            ctx.emit({ type: 'StandbyTriggered', unitId: u.id, byUnitId: trigger }, u.seat)
            f.standby!.done.push(u.id)
            f.standby!.responding = true
            if (response === 'attack' && attackSeam) return attackSeam.start(ctx, u.id, { free: true, against: trigger })
            beginMove(ctx, { unitId: u.id, seat: u.seat, kind: 'standby', maxSpeed: unitSpeed(s, u), free: true })
          },
        }
      }
      default:
        return reject('E_WRONG_DECISION', `${action.type} is not an activation decision`)
    }
  },

  explain(state, action) {
    if (action.type === 'action.choose') {
      const unit = state.activation.current ? state.units[state.activation.current.unitId] : undefined
      const why = unit ? actionMenu(state, unit).withheld.find((w) => w.action === action.payload.action) : undefined
      if (why) return { code: 'E_ACTION_RESTRICTED', reason: `${action.payload.action} is not available: ${why.whyNot}`, details: { whyNot: why.whyNot } }
      return { code: 'E_NO_ACTIONS', reason: 'that action is not available' }
    }
    return null
  },
}
