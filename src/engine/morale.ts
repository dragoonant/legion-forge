// Suppression, panic and courage (R-15). Suppressed = tokens >= courage; Panicked = tokens >= 2 x the panic courage (the
// highest courage of allied Commander units within range 3, or the unit's own); a null courage ("-") never gains
// suppression and a null-courage Commander within range 3 stops allied units panicking. Functions only: the activation
// flow (another module) calls `rallyRoll`, `actionsFor` and `panicRelief` at the right steps.
import { dropAssets } from './battle'
import { runHook } from './hooks'
import { distance, miniBody, withinBand } from './measure'
import type { Ctx } from './registry'
import { aliveMinis, constants, getUnit, unitsOnTable } from './state'
import { actionDelta, foldBool, foldNumber, isDroid, isVehicle, modValues, tokenKey, unitDef, unitRank } from './keywords'
import type { GameState, Unit } from './types'

/** Courage after modifiers: null is "-" (R-15.1). */
export function courageOf(state: GameState, unit: Unit): number | null {
  const base = unitDef(state, unit).courage
  if (base === null || base === undefined) {
    const sets = modValues(state, unit, 'courage').filter((m) => m.op === 'set')
    return sets.length > 0 ? Number(sets[sets.length - 1]!.value) : null
  }
  return foldNumber(Number(base), modValues(state, unit, 'courage'))
}

/** An activation-long effect says the unit is not Suppressed (and so not Panicked): the Captain (EUP p7). */
function notSuppressedNow(state: GameState, unit: Unit): boolean {
  return state.effects.some((e) => e.kind === 'modifier' && e.unitId === unit.id && e.data?.modifier === 'notSuppressed' && e.data?.value === true)
}

export function isSuppressed(state: GameState, unit: Unit): boolean {
  const c = courageOf(state, unit)
  return c !== null && unit.suppression >= c && unit.suppression > 0 && !notSuppressedNow(state, unit)
}

function unitsDistance(state: GameState, a: Unit, b: Unit): number {
  let best = Infinity
  for (const x of aliveMinis(a)) for (const y of aliveMinis(b)) best = Math.min(best, distance(miniBody(state, x), miniBody(state, y)))
  return best
}

export interface CourageSource {
  /** the courage used for the panic check; null = the unit can never panic */
  courage: number | null
  /** the Commander unit lending its courage, if any */
  sourceUnitId: string | null
  own: number | null
  /** a null-courage Commander within range 3: allied units never panic */
  immune: boolean
}

/** R-15.2: the courage used for a panic check and where it comes from (CourageSourceUsed). */
export function courageSource(state: GameState, unit: Unit): CourageSource {
  const own = courageOf(state, unit)
  const c = constants(state)
  let best = own
  let source: string | null = null
  let immune = false
  const range = c['commanderCourageRange'] ?? 3
  for (const o of unitsOnTable(state)) {
    if (o.seat !== unit.seat || unitRank(o) !== 'commander') continue
    if (o.id !== unit.id && unitsDistance(state, unit, o) > range * c.rangeBand + 1e-9) continue
    if (o.id === unit.id) continue
    const oc = courageOf(state, o)
    if (oc === null) {
      immune = true
      continue
    }
    if (own !== null && (best === null || oc > best)) {
      best = oc
      source = o.id
    }
  }
  if (own === null) return { courage: null, sourceUnitId: null, own, immune }
  return { courage: immune ? null : best, sourceUnitId: source, own, immune }
}

export function isPanicked(state: GameState, unit: Unit): boolean {
  if (unit.location !== 'table' && unit.location !== 'reserve') return false
  const src = courageSource(state, unit)
  if (src.courage === null) return false
  return unit.suppression >= 2 * src.courage && unit.suppression > 0 && !notSuppressedNow(state, unit)
}

/** Panicked is a derived state; the false-to-true change is "the unit panics" (drops Assets, emits UnitPanicked). */
export function refreshPanic(ctx: Ctx): void {
  for (const u of unitsOnTable(ctx.state)) {
    const was = Boolean(u.flags['panicked'])
    const now = isPanicked(ctx.state, u)
    if (now === was) continue
    u.flags['panicked'] = now
    if (now) {
      const src = courageSource(ctx.state, u)
      ctx.emit({ type: 'PanicChecked', unitId: u.id, suppression: u.suppression, courage: src.courage, panicked: true }, u.seat)
      if (src.sourceUnitId) ctx.emit({ type: 'CourageSourceUsed', unitId: u.id, sourceId: src.sourceUnitId }, u.seat)
      ctx.emit({ type: 'UnitPanicked', unitId: u.id }, u.seat)
      dropAssets(ctx, u)
    }
  }
}

export { dropAssets }

/**
 * Add suppression (R-15.1, R-5.13): vehicles never take it, a null-courage unit never gains it, a unit that cannot be
 * suppressed this activation (Captain) ignores it. Returns the tokens actually added. A unit holding Standby loses it.
 */
export function applySuppression(ctx: Ctx, unitId: string, n: number, reason: string): number {
  const u = getUnit(ctx.state, unitId)
  if (n <= 0 || u.location === 'defeated') return 0
  if (isVehicle(ctx.state, u) || courageOf(ctx.state, u) === null) return 0
  if (!foldBool(true, modValues(ctx.state, u, 'suppressible'))) return 0
  const from = u.suppression
  u.suppression = from + n
  ctx.emit({ type: 'SuppressionChanged', unitId, from, to: u.suppression, reason }, u.seat)
  const sb = u.tokens['standby'] ?? 0
  if (sb > 0) {
    delete u.tokens['standby']
    ctx.emit({ type: 'TokenChanged', unitId, kind: 'standby', from: sb, to: 0 }, u.seat)
  }
  runHook('suppression.apply', { seat: u.seat, state: ctx.state, engine: ctx, unitId, data: { from, to: u.suppression, reason } })
  refreshPanic(ctx)
  return n
}

export function removeSuppression(ctx: Ctx, unitId: string, n: number, reason: string): number {
  const u = getUnit(ctx.state, unitId)
  if (n <= 0 || u.suppression === 0) return 0
  if (!foldBool(true, modValues(ctx.state, u, 'suppressionRemovable'))) return 0
  const k = Math.min(n, u.suppression)
  const from = u.suppression
  u.suppression = from - k
  ctx.emit({ type: 'SuppressionChanged', unitId, from, to: u.suppression, reason }, u.seat)
  refreshPanic(ctx)
  return k
}

/** A unit gaining null courage loses its suppression (R-15.1). */
export function stripSuppressionIfNull(ctx: Ctx, unitId: string): void {
  const u = getUnit(ctx.state, unitId)
  if (u.suppression > 0 && courageOf(ctx.state, u) === null) {
    const from = u.suppression
    u.suppression = 0
    ctx.emit({ type: 'SuppressionChanged', unitId, from, to: 0, reason: 'nullCourage' }, u.seat)
  }
}

export interface RallyResult {
  dice: string[]
  removed: number
}

/** Rally (R-15.3): one white defence die per token (red with Indomitable); remove one per block or surge. Automatic. */
export function rallyRoll(ctx: Ctx, unit: Unit): RallyResult {
  const u = getUnit(ctx.state, unit.id)
  if (u.suppression <= 0) {
    ctx.emit({ type: 'Rallied', unitId: u.id, dice: [], removed: 0 }, u.seat)
    return { dice: [], removed: 0 }
  }
  const colour = rallyColour(ctx.state, u)
  const idx = ctx.roll('rally', u.suppression, colour === 'red' ? 'def:red' : 'def:white')
  const faces = idx.map((i) => ctx.state.data.dice.defence[colour][i]!)
  const hits = faces.filter((f) => f === 'block' || f === 'surge').length
  const removed = removeSuppression(ctx, u.id, hits, 'rally')
  ctx.emit({ type: 'Rallied', unitId: u.id, dice: faces, removed }, u.seat)
  return { dice: faces, removed }
}

export function rallyColour(state: GameState, unit: Unit): 'red' | 'white' {
  const sets = modValues(state, unit, 'rallyDie').filter((m) => m.op === 'set')
  return sets.length > 0 && sets[sets.length - 1]!.value === 'red' ? 'red' : 'white'
}

/**
 * Actions available in an activation (R-5.6, R-15.4-15.6): 2, a Suppressed unit 1 (a Droid Trooper keeps 2), a Panicked
 * unit 0; extra and fewer actions from effects apply on top (never below 0, never any for a Panicked unit).
 */
export function actionsFor(state: GameState, unit: Unit): number {
  const c = constants(state)
  const base = c['actionsPerActivation'] ?? 2
  if (isPanicked(state, unit)) return 0
  const suppressed = isSuppressed(state, unit) && !isDroid(state, unit)
  return Math.max(0, (suppressed ? (c['suppressedActions'] ?? 1) : base) + actionDelta(state, unit.id))
}

/**
 * End of an activation in which a Panicked unit made no actions (R-15.5): it removes suppression equal to its own printed
 * courage (RULING: not a borrowed Commander value).
 */
export function panicRelief(ctx: Ctx, unit: Unit): number {
  const c = courageOf(ctx.state, unit)
  if (c === null) return 0
  return removeSuppression(ctx, unit.id, c, 'panic')
}

/** All units that are currently Suppressed / Panicked, for the UI and scoring. */
export function suppressionState(state: GameState, unit: Unit): 'none' | 'suppressed' | 'panicked' {
  if (isPanicked(state, unit)) return 'panicked'
  if (isSuppressed(state, unit)) return 'suppressed'
  return 'none'
}

export { tokenKey, withinBand }
