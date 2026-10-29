// ACT activation.* / action.*: the Activation phase (R-5). Turns alternate, priority holder first; on a turn a seat activates
// a unit with a face-up order, draws a random token from its pool and picks an unordered unit of that rank, or passes with a
// pass-pool token (not twice in a row). A unit's activation: rally, 2 actions (1 Suppressed, 0 Panicked), order token flipped.
//
// Seams for the combat stage (merge): the Attack action goes through `registerAttackSeam` (attack.ts registers
// `{ canStart, start }` and calls `getFrameResume('activation.action')` when the action is over); `rallyRoll` below is a local
// stand-in for morale.ts. Suppressed / Panicked / courage are computed here (`isSuppressed`, `isPanicked`).
import { actionData, unitData, unitTypeData } from './bundle'
import {
  bd,
  checkWipeout,
  contests,
  dropAssets,
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
import { expireEffects } from './effects'
import { registerFrameResume, runHook } from './hooks'
import { distance, miniBody, unitWithin } from './measure'
import { beginMove, planMove, unitSpeed } from './movement'
import { reject, type Ctx, type ModuleDef } from './registry'
import { constants, EngineInvariantError, leaderOf, otherSeat, poolCounts, seatUnits, unitsOnTable } from './state'
import { hasLos, miniLosBody } from './los'
import type { Action, GameState, PendingDecision, Seat, Unit } from './types'

// ---------------------------------------------------------------------------
// Courage, Suppressed, Panicked (R-15)
// ---------------------------------------------------------------------------

/** Printed courage plus `courage.value` hook deltas; null = no courage ("-"): never gains suppression. */
export function courageOf(state: GameState, unit: Unit): number | null {
  const c = unitData(state.data, unit.unitTypeId).courage
  if (c === null) return null
  const delta = runHook('courage.value', { seat: unit.seat, state, unitId: unit.id }).reduce((n, r) => n + (r.delta ?? 0), 0)
  return c + delta
}

/** Suppressed: tokens >= courage (R-15.2). Units with no courage never are. */
export function isSuppressed(state: GameState, unit: Unit): boolean {
  const c = courageOf(state, unit)
  return c !== null && c > 0 && unit.suppression >= c
}

/**
 * The courage a Panic check uses (R-15.2): the highest of the unit's own and that of allied Commander units within range 3;
 * null when the unit has no courage or an allied Commander within range 3 has none (nobody panics then).
 */
export function panicCourage(state: GameState, unit: Unit): number | null {
  const own = courageOf(state, unit)
  if (own === null) return null
  let best = own
  const c = constants(state)
  const bodies = unit.minis.filter((m) => m.alive).map((m) => miniBody(state, m))
  for (const cmd of unitsOnTable(state)) {
    if (cmd.seat !== unit.seat || cmd.id === unit.id || cmd.rank !== 'commander') continue
    const near = cmd.minis.some((m) => m.alive && unitWithin(bodies, miniBody(state, m), 3, c))
    if (!near) continue
    const cc = courageOf(state, cmd)
    if (cc === null) return null
    best = Math.max(best, cc)
  }
  return best
}

/** Panicked: tokens >= 2 x courage (R-15.2). */
export function isPanicked(state: GameState, unit: Unit): boolean {
  const c = panicCourage(state, unit)
  return c !== null && c > 0 && unit.suppression >= 2 * c
}

const isDroid = (state: GameState, unit: Unit): boolean => unitData(state.data, unit.unitTypeId).unitType.includes('droid')

/** Actions the unit gets after rally: 2; Suppressed 1 (Droid Troopers keep 2); Panicked 0 (R-5.6). */
export function actionAllowance(state: GameState, unit: Unit): number {
  const c = constants(state)
  if (isPanicked(state, unit)) return 0
  if (isSuppressed(state, unit) && !isDroid(state, unit)) return c.suppressedActions ?? 1
  return c.actionsPerActivation ?? 2
}

// ---------------------------------------------------------------------------
// Rally (R-15.3): local stand-in for morale.rallyRoll until the combat stage merges
// ---------------------------------------------------------------------------

/** One white defence die per suppression token; one token removed per block or surge. Automatic. */
export function rallyRoll(ctx: Ctx, unit: Unit): void {
  const n = unit.suppression
  if (n <= 0) return
  const idx = ctx.roll('rally', n, 'def:white')
  const faces = ctx.state.data.dice.defence.white
  const names = idx.map((i) => faces[i]!)
  const removed = names.filter((f) => f === 'block' || f === 'surge').length
  const from = unit.suppression
  unit.suppression = Math.max(0, from - removed)
  ctx.emit({ type: 'Rallied', unitId: unit.id, dice: names, removed }, unit.seat)
  if (unit.suppression !== from) ctx.emit({ type: 'SuppressionChanged', unitId: unit.id, from, to: unit.suppression, reason: 'rally' }, unit.seat)
}

// ---------------------------------------------------------------------------
// Attack seam (attack.ts registers itself at merge)
// ---------------------------------------------------------------------------

export interface AttackOpts {
  free: boolean
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
}

const used = (state: GameState, action: string): boolean => (state.activation.current?.performed ?? []).some((p) => p.action === action)

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
  const alreadyUsed = (action: string) => repeatOnce(action) && used(state, action)
  const speed = unitSpeed(state, unit)

  // Move / Climb / Withdraw
  paid('move', !engaged && speed >= 1, engaged ? 'engaged' : 'speed', () => [{ id: 'move', action: 'move', free: false, data: { maxSpeed: speed } }])
  paid('climb', deployed && !engaged && climbPossible(state, unit), !deployed ? 'undeployed' : engaged ? 'engaged' : 'noClimbable', () => [{ id: 'climb', action: 'climb', free: false, data: { maxSpeed: 1 } }])
  paid('withdraw', engaged && !alreadyUsed('withdraw'), alreadyUsed('withdraw') ? 'alreadyUsed' : 'notEngaged', () => [{ id: 'withdraw', action: 'withdraw', free: false, data: { maxSpeed: 1 } }])

  // Attack
  const wd = used(state, 'withdraw')
  const noAttack = alreadyUsed('attack') ? 'alreadyUsed' : used(state, 'standby') ? 'afterStandby' : wd && !type?.flags.attackAfterWithdraw ? 'afterWithdraw' : !deployed ? 'undeployed' : !attackSeam ? 'notAvailable' : null
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
  const standbyWhy = !type?.flags.trooper ? 'notTrooper' : !deployed ? 'undeployed' : alreadyUsed('standby') ? 'alreadyUsed' : (unit.tokens.standby ?? 0) >= (constants(state).standbyMax ?? 1) ? 'hasToken' : used(state, 'attack') ? 'afterAttack' : wd ? 'afterWithdraw' : null
  paid('standby', standbyWhy === null, standbyWhy ?? '', () => [{ id: 'standby', action: 'standby', free: false }])

  // Free card actions granted by the battle cards: Claim
  const claim = claimTarget(state, unit)
  if (isPanicked(state, unit)) hold('claim', 'panicked')
  else if (alreadyUsed('claim')) hold('claim', 'alreadyUsed')
  else if (claim) items.push({ id: 'claim', action: 'claim', free: true, data: { markerId: claim } })

  // R-5.11: an undeployed unit may only Move (and free Moves)
  if (!deployed) {
    const keep = items.filter((i) => i.action === 'move')
    for (const i of items) if (i.action !== 'move') hold(i.action, 'undeployed')
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
  raiseMenu(ctx, unit, menu, true)
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
      panicked: isPanicked(s, unit),
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
  if (unit.location !== 'defeated' && act.performed.length === 0 && isPanicked(s, unit)) {
    const c = courageOf(s, unit) ?? 0
    const from = unit.suppression
    unit.suppression = Math.max(0, from - c)
    ctx.emit({ type: 'SuppressionChanged', unitId: unit.id, from, to: unit.suppression, reason: 'panic' }, unit.seat)
  }
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
    unit.activated = true
    unit.order.state = 'spent'
  }
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
  if (openWindow(ctx, 'activation.phaseStart', {}, `r${s.round}`, 'act.phaseStarted')) return
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
  if (openWindow(ctx, 'activation.rallied', { unitId: unit.id }, `a${flowOf(s).activations}`, 'act.rallied')) return
  afterRallied(ctx)
}

export function afterRallied(ctx: Ctx): void {
  const s = ctx.state
  const unit = activeUnit(s)
  const act = s.activation.current!
  const panicked = isPanicked(s, unit)
  if (unit.suppression > 0) ctx.emit({ type: 'PanicChecked', unitId: unit.id, suppression: unit.suppression, courage: panicCourage(s, unit), panicked }, unit.seat)
  if (panicked) {
    dropAssets(ctx, unit)
    ctx.emit({ type: 'UnitPanicked', unitId: unit.id }, unit.seat)
  }
  act.actionsLeft = actionAllowance(s, unit)
  continueActivation(ctx)
}

// ---------------------------------------------------------------------------
// Declaring and completing actions
// ---------------------------------------------------------------------------

function declare(ctx: Ctx, unit: Unit, action: string, params: Record<string, unknown> | undefined): void {
  const s = ctx.state
  const act = s.activation.current!
  const free = actionData(s.data, `core.action.${action}`)?.free ?? false
  act.declared = { action, ...(params ? { params } : {}) }
  ctx.emit({ type: 'ActionDeclared', unitId: unit.id, action, free }, unit.seat)
  loseStandby(ctx, unit)
  switch (action) {
    case 'aim':
    case 'dodge':
      setToken(ctx, unit, action, (unit.tokens[action] ?? 0) + 1)
      return completeAction(ctx)
    case 'standby':
      setToken(ctx, unit, 'standby', 1)
      return completeAction(ctx)
    case 'recover': {
      const remove = Math.min(unit.suppression, Number(params?.remove ?? 0))
      if (remove > 0) {
        const from = unit.suppression
        unit.suppression = from - remove
        ctx.emit({ type: 'SuppressionChanged', unitId: unit.id, from, to: unit.suppression, reason: 'recover' }, unit.seat)
      }
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

/** The declared action resolved: record it, spend the action, then Standby triggers and the next menu. */
export function completeAction(ctx: Ctx): void {
  const s = ctx.state
  const act = s.activation.current
  if (!act || !act.declared) throw new EngineInvariantError('completeAction with no declared action')
  const free = actionData(s.data, `core.action.${act.declared.action}`)?.free ?? false
  act.performed.push({ action: act.declared.action, free })
  if (!free) act.actionsLeft = Math.max(0, act.actionsLeft - 1)
  ctx.emit({ type: 'ActionResolved', unitId: act.unitId, action: act.declared.action }, act.seat)
  act.declared = null
  if (openWindow(ctx, 'action.resolved', { unitId: act.unitId }, `a${flowOf(s).activations}:${act.performed.length}`, 'act.resolved')) return
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
  if (raiseStandby(ctx)) return
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

function raiseStandby(ctx: Ctx): boolean {
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
  flow.standby = { triggerUnitId: trigger.id, done, responding: false }
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
  if (flow.standby) flow.standby.responding = false
  onStepEvents(ctx)
  if (checkWipeout(ctx)) return
  if (raiseStandby(ctx)) return
  continueActivation(ctx)
}

/** Movement hands back here when a Move (or a cancelled placement) is over. */
export function afterMoveFinished(ctx: Ctx, frameKind: string, outcome: 'finished' | 'cancelled'): void {
  if (frameKind === 'standby') return standbyResponseDone(ctx)
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
              f.standby = null
              continueActivation(ctx)
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
