// Keyword and effect interpreter (docs/spec/00 section 9, 20-data-schema section 4). Keywords, upgrade effects and command-card
// effects are declarative JSON: triggers `{ window | event, self | aura }`, `when` conditions, `do` verbs, passive
// `modifier`s, `native` flags and `{ code }` escape hatches. `fireWindow` runs every effect whose trigger matches a timing
// window; `modValues` answers the passive modifiers the owning step reads. An optional effect, a choice of units or an
// option is a `keyword.choice` / `card.choice` decision that carries its own continuation, so the sequence that opened the
// window (an attack, an activation) resumes through a registered frame-resume after the last answer.
import './armies'
import { getCodeEffect } from './armies/registry'
import { sufferWounds } from './attack'
import { addEffect, removeEffects } from './effects'
import { getFrameResume, runHook } from './hooks'
import { distance, miniBody, withinBand } from './measure'
import { applySuppression, courageOf, isPanicked, isSuppressed, removeSuppression } from './morale'
import { reject, type Ctx, type ModuleDef } from './registry'
import { aliveMinis, constants, EngineInvariantError, getUnit, leaderOf, otherSeat, seatUnits, unitsOnTable } from './state'
import type {
  AttackFrame,
  CodeOffer,
  GameState,
  PendingDecision,
  PoolFrame,
  Seat,
  TimingWindowId,
  Unit,
} from './types'
import { markFired } from './code-hooks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type J = any

// ---------------------------------------------------------------------------
// Data accessors and id normalisation
// ---------------------------------------------------------------------------

export const tokenKey = (id: string): string => id.replace(/^core\.token\./, '')
export const rankKey = (id: string): string => id.replace(/^core\.rank\./, '')
const typeKey = (id: string): string => id.replace(/^core\.unittype\./, '')

export function unitDef(state: GameState, unit: Unit): J {
  const d = state.data.units[unit.unitTypeId]
  if (!d) throw new EngineInvariantError(`unit ${unit.id}: no data record ${unit.unitTypeId}`)
  return d
}

export function weaponDef(state: GameState, id: string): J {
  const w = state.data.weapons[id]
  if (!w) throw new EngineInvariantError(`unknown weapon ${id}`)
  return w
}

export function upgradeDef(state: GameState, id: string): J | undefined {
  return state.data.upgrades[id]
}

export function keywordDef(state: GameState, id: string): J | undefined {
  return state.data.keywords[id]
}

export function cardDef(state: GameState, id: string): J | undefined {
  return state.data.cards[id]
}

/** The current side of a two-sided upgrade card (Battle Shield): index into `sides`. */
export function upgradeSide(unit: Unit, upgradeId: string): number {
  const sides = unit.flags.cardSide as Record<string, number> | undefined
  return sides?.[upgradeId] ?? 0
}

export function unitRank(unit: Unit): string {
  return rankKey(unit.rank)
}

export function isTrooperType(state: GameState, unit: Unit): boolean {
  const t = typeKey(String(unitDef(state, unit).unitType ?? unit.flags.unitType ?? 'trooper'))
  return /trooper/.test(t)
}

export function matchesUnitType(state: GameState, unit: Unit, want: string): boolean {
  if (want === 'any') return true
  if (want === 'trooper-any') return isTrooperType(state, unit)
  return typeKey(String(unitDef(state, unit).unitType ?? 'trooper')) === typeKey(want)
}

export function isVehicle(state: GameState, unit: Unit): boolean {
  return /vehicle/.test(typeKey(String(unitDef(state, unit).unitType ?? '')))
}

export function isDroid(state: GameState, unit: Unit): boolean {
  return /droid/.test(typeKey(String(unitDef(state, unit).unitType ?? '')))
}

/** Heavy and Creature troopers get no cover from barricades (R-9.2). */
export function barricadeCover(state: GameState, unit: Unit): boolean {
  const t = typeKey(String(unitDef(state, unit).unitType ?? 'trooper'))
  return !/(creature|heavy)/.test(t)
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export function tokensOf(unit: Unit, kind: string): number {
  return kind === 'suppression' ? unit.suppression : (unit.tokens[kind] ?? 0)
}

/** Add tokens to a unit (Suppression goes through morale rules); returns how many were really added. */
export function gainToken(ctx: Ctx, unitId: string, kind: string, n: number, reason = 'effect'): number {
  if (n <= 0) return 0
  if (kind === 'suppression') return applySuppression(ctx, unitId, n, reason)
  const u = getUnit(ctx.state, unitId)
  const cap = kind === 'standby' ? constants(ctx.state)['standbyMax'] ?? 1 : Infinity
  const from = u.tokens[kind] ?? 0
  const to = Math.min(cap, from + n)
  if (to === from) return 0
  u.tokens[kind] = to
  ctx.emit({ type: 'TokenChanged', unitId, kind, from, to })
  return to - from
}

export function loseToken(ctx: Ctx, unitId: string, kind: string, n: number, reason = 'effect'): number {
  if (n <= 0) return 0
  if (kind === 'suppression') return removeSuppression(ctx, unitId, n, reason)
  const u = getUnit(ctx.state, unitId)
  const from = u.tokens[kind] ?? 0
  const to = Math.max(0, from - n)
  if (to === from) return 0
  if (to === 0) delete u.tokens[kind]
  else u.tokens[kind] = to
  ctx.emit({ type: 'TokenChanged', unitId, kind, from, to })
  return from - to
}

// ---------------------------------------------------------------------------
// Unit keywords (derived from data so a setup that forgets to copy them still works)
// ---------------------------------------------------------------------------

export interface KwInst {
  id: string
  x: number
  param?: string
}

function addKw(acc: Map<string, KwInst>, k: J): void {
  if (!k?.id) return
  const x = typeof k.x === 'number' ? k.x : 0
  const cur = acc.get(k.id)
  if (cur) cur.x += x
  else acc.set(k.id, { id: k.id, x, ...(k.param ? { param: String(k.param) } : {}) })
}

/**
 * Does the unit still have the rules of an equipped upgrade card? A card that added figures stops applying when every figure
 * it added is defeated (CRB p18); the `persistent` block of a Squad card stays by its own text. A unit whose figures carry no
 * upgrade marker (a hand-built test unit) keeps every card.
 */
export function upgradeLive(unit: Unit, upId: string): boolean {
  const mine = unit.minis.filter((m) => m.upgradeId === upId)
  return mine.length === 0 || mine.some((m) => m.alive)
}

/** Keywords of a unit: its card, equipped upgrades (current side), persistent upgrade rules, granted keywords. X values add. */
export function unitKeywords(state: GameState, unit: Unit): KwInst[] {
  const acc = new Map<string, KwInst>()
  const def: J = state.data.units[unit.unitTypeId]
  for (const k of def?.keywords ?? []) addKw(acc, k)
  for (const upId of unit.upgrades) {
    const ud = upgradeDef(state, upId)
    if (!ud) continue
    if (upgradeLive(unit, upId)) {
      for (const k of ud.keywords ?? []) addKw(acc, k)
      const side = ud.sides?.[upgradeSide(unit, upId)]
      for (const k of side?.keywords ?? []) addKw(acc, k)
    }
    for (const k of ud.addsMinis?.persistent?.keywords ?? []) addKw(acc, k)
  }
  const derived = new Set(acc.keys())
  for (const k of unit.keywords) if (!derived.has(k.id)) addKw(acc, k)
  for (const e of state.effects) {
    if (e.kind === 'keyword' && e.unitId === unit.id) addKw(acc, e.data?.keyword)
  }
  const removed = (unit.flags.removedKeywords as string[] | undefined) ?? []
  return [...acc.values()].filter((k) => !removed.includes(k.id))
}

export function hasKeyword(state: GameState, unit: Unit, kwId: string): boolean {
  return unitKeywords(state, unit).some((k) => k.id === kwId)
}

export function keywordX(state: GameState, unit: Unit, kwId: string): number {
  return unitKeywords(state, unit).find((k) => k.id === kwId)?.x ?? 0
}

/** The textual parameter of a keyword such as Compel's rank (KeywordRef.param). */
export function keywordParam(state: GameState, unit: Unit, kwId: string): string | undefined {
  return unitKeywords(state, unit).find((k) => k.id === kwId)?.param
}

/**
 * Weapons a model may add (R-12.3): the weapon its upgrade card gave it (the current side of a two-sided card) in addition
 * to the weapons on the unit card (CRB p17); a model with no upgrade weapon has the unit card's.
 */
export function miniWeapons(state: GameState, unit: Unit, miniId: string): string[] {
  const m = unit.minis.find((x) => x.id === miniId)
  if (!m) return []
  const def: J = state.data.units[unit.unitTypeId]
  const card: string[] = [...(def?.weapons ?? unit.weapons)]
  let own: string[] = []
  if (m.upgradeId) {
    const ud = upgradeDef(state, m.upgradeId)
    const side = ud?.sides?.[upgradeSide(unit, m.upgradeId)]
    if (side?.weapons) own = [...side.weapons]
  }
  if (own.length === 0 && m.weaponIds) own = [...m.weaponIds]
  return [...own, ...card.filter((w) => !own.includes(w))]
}

export type WeaponType = 'melee' | 'ranged'

/**
 * Melee weapons have range 0-0 and ranged weapons start at range 1; a weapon with both icons (Sonic Charge, Proton Charge:
 * melee and range 1, range 0-1 in the data) is chosen as melee or ranged when it is added to a pool (CRB p31).
 */
export function weaponTypes(w: J): WeaponType[] {
  const r = w.range ?? { min: 1, max: 1 }
  if (r.max === 0) return ['melee']
  return (r.min ?? 1) === 0 ? ['melee', 'ranged'] : ['ranged']
}

// ---------------------------------------------------------------------------
// Pool keywords
// ---------------------------------------------------------------------------

export function weaponKeywordList(state: GameState, pf: PoolFrame, weaponId: string): KwInst[] {
  const acc = new Map<string, KwInst>()
  for (const k of weaponDef(state, weaponId).keywords ?? []) addKw(acc, k)
  for (const g of pf.granted) {
    if (g.weaponIds?.includes(weaponId)) addKw(acc, { id: g.id, x: g.x })
  }
  return [...acc.values()]
}

/** Keywords granted to the whole pool (Duelist's Pierce). */
export function poolWideGrants(pf: PoolFrame): KwInst[] {
  const acc = new Map<string, KwInst>()
  for (const g of pf.granted) if (!g.weaponIds) addKw(acc, { id: g.id, x: g.x })
  return [...acc.values()]
}

/** A pool keyword's value: weapon instances and grants add together (CRB p9). */
export function poolKeywordX(state: GameState, pf: PoolFrame, kwId: string): number {
  let sum = poolWideGrants(pf).find((k) => k.id === kwId)?.x ?? 0
  for (const w of pf.weapons) sum += weaponKeywordList(state, pf, w.weaponId).find((k) => k.id === kwId)?.x ?? 0
  return sum
}

export function poolHasKeyword(state: GameState, pf: PoolFrame, kwId: string): boolean {
  return poolWideGrants(pf).some((k) => k.id === kwId) || pf.weapons.some((w) => weaponKeywordList(state, pf, w.weaponId).some((k) => k.id === kwId))
}

/** Every weapon in the pool has the keyword (High Velocity's `poolOnly`). */
export function poolAllHave(state: GameState, pf: PoolFrame, kwId: string): boolean {
  if (pf.weapons.length === 0) return false
  if (poolWideGrants(pf).some((k) => k.id === kwId)) return true
  return pf.weapons.every((w) => weaponKeywordList(state, pf, w.weaponId).some((k) => k.id === kwId))
}

/** Distinct weapons of a pool with their instance counts. */
export function weaponGroups(pf: PoolFrame): { weaponId: string; count: number }[] {
  const out: { weaponId: string; count: number }[] = []
  for (const w of pf.weapons) {
    const g = out.find((x) => x.weaponId === w.weaponId)
    if (g) g.count++
    else out.push({ weaponId: w.weaponId, count: 1 })
  }
  return out
}

// ---------------------------------------------------------------------------
// Attack context for conditions
// ---------------------------------------------------------------------------

export interface AttackCtx {
  af: AttackFrame
  pf: PoolFrame | null
  attacker: Unit
  defender: Unit | null
}

export function attackCtxOf(state: GameState): AttackCtx | null {
  if (!state.attack) return null
  const af = state.attack.data as unknown as AttackFrame
  const pf = af.pools[af.current] ?? null
  const attacker = state.units[state.attack.attackerId]
  if (!attacker) return null
  const defId = pf?.defenderId ?? state.attack.defenderId
  return { af, pf, attacker, defender: defId ? (state.units[defId] ?? null) : null }
}

// ---------------------------------------------------------------------------
// Effect instances
// ---------------------------------------------------------------------------

export interface EffectRef {
  src: 'keyword' | 'upgrade' | 'card'
  id: string
  ei: number
  /** upgrade side (two-sided cards) */
  side?: number
  /** a granted action of the upgrade: the effect is the action's own `do` list */
  action?: string
  x: number
  /** the pool weapon a weapon keyword belongs to, and how many instances were added */
  weaponId?: string
  weaponCount?: number
}

export interface EffInst {
  ref: EffectRef
  effect: J
  owner: Unit | null
  seat: Seat
}

export function effectOfRef(state: GameState, ref: EffectRef): J {
  if (ref.src === 'keyword') return keywordDef(state, ref.id)?.effects?.[ref.ei]
  if (ref.src === 'card') return cardDef(state, ref.id)?.effects?.[ref.ei]
  const ud = upgradeDef(state, ref.id)
  if (ref.action) {
    const grant = (ud?.effects ?? []).find((e: J) => e.grant?.action?.id === ref.action)
    return grant ? { do: grant.grant.action.do ?? [] } : undefined
  }
  if (ref.side !== undefined) return ud?.sides?.[ref.side]?.effects?.[ref.ei]
  return ud?.effects?.[ref.ei]
}

/** Effects a unit carries: keyword effects, upgrade effects, and the effects of the weapons of a running pool (attacker only). */
export function unitEffects(state: GameState, unit: Unit, pf?: PoolFrame | null): EffInst[] {
  const out: EffInst[] = []
  for (const k of unitKeywords(state, unit)) {
    const d = keywordDef(state, k.id)
    if (!d || d.kind === 'weapon') continue
    ;(d.effects ?? []).forEach((effect: J, ei: number) => out.push({ ref: { src: 'keyword', id: k.id, ei, x: k.x }, effect, owner: unit, seat: unit.seat }))
  }
  for (const upId of unit.upgrades) {
    const ud = upgradeDef(state, upId)
    if (!ud || !upgradeLive(unit, upId)) continue
    ;(ud.effects ?? []).forEach((effect: J, ei: number) => out.push({ ref: { src: 'upgrade', id: upId, ei, x: 0 }, effect, owner: unit, seat: unit.seat }))
    const side = upgradeSide(unit, upId)
    ;(ud.sides?.[side]?.effects ?? []).forEach((effect: J, ei: number) => out.push({ ref: { src: 'upgrade', id: upId, ei, side, x: 0 }, effect, owner: unit, seat: unit.seat }))
  }
  if (pf) {
    for (const g of weaponGroups(pf)) {
      for (const k of weaponKeywordList(state, pf, g.weaponId)) {
        const d = keywordDef(state, k.id)
        ;(d?.effects ?? []).forEach((effect: J, ei: number) =>
          out.push({ ref: { src: 'keyword', id: k.id, ei, x: k.x * g.count, weaponId: g.weaponId, weaponCount: g.count }, effect, owner: unit, seat: unit.seat }),
        )
      }
    }
    for (const k of poolWideGrants(pf)) {
      const d = keywordDef(state, k.id)
      ;(d?.effects ?? []).forEach((effect: J, ei: number) => out.push({ ref: { src: 'keyword', id: k.id, ei, x: k.x }, effect, owner: unit, seat: unit.seat }))
    }
  }
  return out
}

/** Card effects in play (installed by commandCards.activateCard as ActiveEffects of kind `cardEffect`). */
export function cardEffectInsts(state: GameState): EffInst[] {
  const out: EffInst[] = []
  for (const e of state.effects) {
    if (e.kind !== 'cardEffect') continue
    const cardId = String(e.data?.cardId)
    const ei = Number(e.data?.ei)
    const effect = cardDef(state, cardId)?.effects?.[ei]
    if (!effect) continue
    out.push({ ref: { src: 'card', id: cardId, ei, x: 0 }, effect, owner: null, seat: e.seat })
  }
  return out
}

/** The units a card names for a seat (`restriction.units`), still in play. */
export function namedUnits(state: GameState, cardId: string, seat: Seat): Unit[] {
  const names: string[] | undefined = cardDef(state, cardId)?.restriction?.units
  if (!names) return []
  return unitsOnTable(state).filter((u) => u.seat === seat && names.includes(u.unitTypeId))
}

// ---------------------------------------------------------------------------
// Conditions, expressions, filters
// ---------------------------------------------------------------------------

export interface WindowInfo {
  /** the unit the window is about */
  unitId?: string
  moveKind?: string
  fromAction?: boolean
  startedMelee?: boolean
  suppressionDue?: boolean
  /** an extra attack.resolved pass for a further defender: defender-side effects only */
  defenderOnly?: boolean
  /** a phase-level window: self triggers run once for every unit that carries the effect */
  eachOwner?: boolean
  action?: string
  byCard?: string
  byCommandCard?: boolean
  [key: string]: unknown
}

export interface Env {
  state: GameState
  owner: Unit | null
  subject: Unit | null
  role: 'attacker' | 'defender' | null
  seat: Seat
  attack: AttackCtx | null
  info: WindowInfo
  x: number
  cardId?: string
  weaponId?: string
}

export function roleOf(a: AttackCtx | null, unit: Unit | null): 'attacker' | 'defender' | null {
  if (!a || !unit) return null
  if (unit.id === a.attacker.id) return 'attacker'
  if (a.defender && unit.id === a.defender.id) return 'defender'
  return null
}

function unitIsId(unit: Unit | null, id: string): boolean {
  return !!unit && (unit.unitTypeId === id || unit.id === id)
}

function unitDistance(state: GameState, a: Unit, b: Unit): number {
  let best = Infinity
  for (const x of aliveMinis(a)) for (const y of aliveMinis(b)) best = Math.min(best, distance(miniBody(state, x), miniBody(state, y)))
  return best
}
export { unitDistance }

export function evalExpr(env: Env, e: J): number {
  if (typeof e === 'number') return e
  if (e && typeof e === 'object') {
    if (e.x) return env.x
    if (e.stat) {
      const u = env.owner ?? env.subject
      if (!u) return 0
      if (e.stat === 'courage') return courageOf(env.state, u) ?? 0
      if (e.stat === 'wounds') return u.minis.reduce((s, m) => s + m.wounds, 0)
      if (e.stat === 'speed') return Number(unitDef(env.state, u).speed ?? 0)
    }
    if (e.tokens) {
      const u = env.owner ?? env.subject
      return u ? tokensOf(u, tokenKey(e.tokens)) : 0
    }
    if (e.sub) {
      const v = evalExpr(env, e.sub[0]) - evalExpr(env, e.sub[1])
      return typeof e.min === 'number' ? Math.max(e.min, v) : v
    }
    if (e.count === 'woundsSuffered') {
      const u = env.subject ?? env.owner
      return env.attack && u ? (env.attack.af.woundsTaken[u.id] ?? 0) : 0
    }
  }
  throw new EngineInvariantError(`unsupported expression ${JSON.stringify(e)}`)
}

export function condOk(env: Env, when: J | undefined): boolean {
  if (!when) return true
  const st = env.state
  const subj = env.subject ?? env.owner
  const a = env.attack
  for (const [k, v] of Object.entries(when) as [string, J][]) {
    switch (k) {
      case 'attackKind':
        if (!a?.pf || a.pf.kind !== v) return false
        break
      case 'role':
        if (env.role !== v) return false
        break
      case 'side':
        if (!subj || (v === 'ally') !== (subj.seat === env.seat)) return false
        break
      case 'spent': {
        const side = env.role === 'defender' ? 'defender' : 'attacker'
        const got = a?.pf?.spent[side][tokenKey(v.token)] ?? 0
        if (got < v.min) return false
        break
      }
      case 'spentAny': {
        // the attacker spent the token in any pool of the attack (Coordinated Fire, once per attack)
        const hit = a?.af.pools.some((p) => (!v.kind || p.kind === v.kind) && (p.spent.attacker[tokenKey(v.token)] ?? 0) >= v.min)
        if (!hit) return false
        break
      }
      case 'poolOnly':
        if (!a?.pf || !poolAllHave(st, a.pf, v)) return false
        break
      case 'unitMoved':
        if (!a || a.af.moved !== v) return false
        break
      case 'order':
        if (!subj || (v === 'faceUp' ? subj.order.state !== 'faceUp' : subj.order.state !== 'none')) return false
        break
      case 'rank': {
        const list: string[] = Array.isArray(v) ? v : [v]
        if (!subj || !list.map(rankKey).includes(unitRank(subj))) return false
        break
      }
      case 'unitType':
        if (!subj || !matchesUnitType(st, subj, v)) return false
        break
      case 'unit':
        if (!unitIsId(subj, v)) return false
        break
      case 'notUnit':
        if (!subj || (v as string[]).some((id) => unitIsId(subj, id))) return false
        break
      case 'suppressed':
        if (!subj || isSuppressed(st, subj) !== v) return false
        break
      case 'panicked':
        if (!subj || isPanicked(st, subj) !== v) return false
        break
      case 'within': {
        if (v.of === 'leader') {
          if (!a?.defender) return false
          const lead = miniBody(st, leaderOf(a.attacker))
          const d = Math.min(...aliveMinis(a.defender).map((m) => distance(lead, miniBody(st, m))))
          if (!withinBand(d, v.range, constants(st))) return false
        } else {
          const other = v.of === 'subject' ? subj : env.owner
          if (!subj || !other || !withinBand(unitDistance(st, subj, other), v.range, constants(st))) return false
        }
        break
      }
      case 'defenderHasKeyword':
        if (!a?.defender || !hasKeyword(st, a.defender, v)) return false
        break
      case 'defenderIsVehicle':
        if (!a?.defender || isVehicle(st, a.defender) !== v) return false
        break
      case 'round':
        if ((v.min !== undefined && st.round < v.min) || (v.max !== undefined && st.round > v.max)) return false
        break
      case 'firstOfRound':
        break
      case 'moveKind':
        if (env.info.moveKind !== v) return false
        break
      case 'fromAction':
        if (!!env.info.fromAction !== v) return false
        break
      case 'startedMelee':
        if (!!env.info.startedMelee !== v) return false
        break
      case 'suppressionDue':
        // the attack gives its defender the base Suppression token (a ranged attack with a hit or crit in the pool)
        if (!!env.info.suppressionDue !== v) return false
        break
      case 'poolHasWeapon':
        if (!a?.pf || !a.pf.weapons.some((w) => w.weaponId === v)) return false
        break
      case 'byThisCard':
        if ((env.info.byCard !== undefined && env.info.byCard === env.cardId) !== v) return false
        break
      case 'byCommandCard':
        if (!!env.info.byCommandCard !== v) return false
        break
      case 'phase':
        if (st.phase !== v) return false
        break
      case 'action':
        if (env.info.action !== v) return false
        break
      case 'woundsSuffered': {
        const u = subj
        if (!a || !u || (a.af.woundsTaken[u.id] ?? 0) < v.min) return false
        break
      }
      case 'contesting':
      case 'holding':
      case 'divulged':
        return false
      default:
        throw new EngineInvariantError(`unsupported condition ${k}`)
    }
  }
  return true
}

/** UnitFilter match; `center` is the unit an aura or range is measured from. */
export function matchFilter(state: GameState, u: Unit, f: J | undefined, center: Unit | null, seat: Seat, subject?: Unit | null): boolean {
  if (!f) return true
  if (f.side && (f.side === 'ally') !== (u.seat === seat)) return false
  if (f.ranks && !f.ranks.map(rankKey).includes(unitRank(u))) return false
  if (f.notRanks && f.notRanks.map(rankKey).includes(unitRank(u))) return false
  if (f.unitTypes && !f.unitTypes.some((t: string) => matchesUnitType(state, u, t))) return false
  if (f.units && !f.units.some((id: string) => unitIsId(u, id))) return false
  if (f.notUnits && f.notUnits.some((id: string) => unitIsId(u, id))) return false
  if (f.excludeSelf && center && u.id === center.id) return false
  if (f.excludeSubject && subject && u.id === subject.id) return false
  if (f.suppressed !== undefined && isSuppressed(state, u) !== f.suppressed) return false
  if (f.hasKeyword && !hasKeyword(state, u, f.hasKeyword)) return false
  if (f.within) {
    const ref = f.within.of === 'subject' ? (subject ?? center) : center
    if (!ref || (u.id !== ref.id && !withinBand(unitDistance(state, u, ref), f.within.range, constants(state)))) return false
  }
  return true
}

function unitsAround(state: GameState, center: Unit, aura: J, seat: Seat, subject?: Unit | null): Unit[] {
  return unitsOnTable(state).filter((u) => {
    if (aura.side && (aura.side === 'ally') !== (u.seat === seat)) return false
    if (aura.excludeSelf && u.id === center.id) return false
    if (u.id !== center.id && !withinBand(unitDistance(state, u, center), aura.range, constants(state))) return false
    return matchFilter(state, u, aura.filter ? { ...aura.filter, side: undefined } : undefined, center, seat, subject)
  })
}

// ---------------------------------------------------------------------------
// Passive modifiers
// ---------------------------------------------------------------------------

export interface ModValue {
  op: 'add' | 'set' | 'min' | 'max'
  value: number | boolean | string
  then?: { addResult: string; n: number }
  source: string
}

export interface ModQuery {
  role?: 'attacker' | 'defender' | null
  attack?: AttackCtx | null
  info?: WindowInfo
  subject?: Unit | null
}

/** Passive modifiers of one name that apply to `unit` right now (keyword and upgrade effects, active modifier effects, card modifiers). */
export function modValues(state: GameState, unit: Unit, name: string, q: ModQuery = {}): ModValue[] {
  const out: ModValue[] = []
  const attack = q.attack ?? attackCtxOf(state)
  const role = q.role !== undefined ? q.role : roleOf(attack, unit)
  const pf = unit.id === attack?.attacker.id ? attack.pf : null
  const mk = (inst: EffInst, owner: Unit): Env => ({
    state,
    owner,
    subject: q.subject ?? owner,
    role,
    seat: owner.seat,
    attack,
    info: q.info ?? {},
    x: inst.ref.x,
    ...(inst.ref.src === 'card' ? { cardId: inst.ref.id } : {}),
    ...(inst.ref.weaponId ? { weaponId: inst.ref.weaponId } : {}),
  })
  const push = (inst: EffInst, e: J, owner: Unit) => {
    const env = mk(inst, owner)
    if (!condOk(env, e.when)) return
    let value = e.value
    if (value && typeof value === 'object') value = evalExpr(env, value)
    out.push({ op: e.op, value, ...(e.then ? { then: e.then } : {}), source: inst.ref.id })
  }
  for (const inst of unitEffects(state, unit, pf)) {
    if (inst.effect.modifier === name) push(inst, inst.effect, unit)
  }
  for (const eff of state.effects) {
    if (eff.kind === 'modifier' && eff.unitId === unit.id && eff.data?.modifier === name) {
      const inst: EffInst = { ref: { src: 'card', id: eff.source, ei: 0, x: 0 }, effect: eff.data, owner: unit, seat: eff.seat }
      push(inst, eff.data, unit)
    }
  }
  for (const inst of cardEffectInsts(state)) {
    if (inst.effect.modifier !== name) continue
    if (inst.effect.scope === 'opponent') continue
    if (inst.seat !== unit.seat) continue
    const named = inst.effect.scope === 'named' ? unitIsId(unit, inst.effect.when?.unit ?? '') : true
    if (!named) continue
    push(inst, inst.effect, unit)
  }
  return out
}

/** Fold numeric modifiers: `set` first, then `add`s, then `max` (cap) and `min` (floor). */
export function foldNumber(base: number, mods: ModValue[]): number {
  let v = base
  for (const m of mods) if (m.op === 'set') v = Number(m.value)
  for (const m of mods) if (m.op === 'add') v += Number(m.value)
  for (const m of mods) if (m.op === 'max') v = Math.min(v, Number(m.value))
  for (const m of mods) if (m.op === 'min') v = Math.max(v, Number(m.value))
  return v
}

export function foldBool(base: boolean, mods: ModValue[]): boolean {
  let v = base
  for (const m of mods) if (m.op === 'set') v = Boolean(m.value)
  return v
}

/** Order limit for a seat's command cards (Sabotaged Communications): `Infinity` when none applies. */
export function orderLimit(state: GameState, seat: Seat): number {
  let lim = Infinity
  for (const inst of cardEffectInsts(state)) {
    if (inst.effect.modifier === 'orderLimit' && inst.effect.scope === 'opponent' && inst.seat === otherSeat(seat)) {
      lim = Math.min(lim, Number(inst.effect.value))
    }
  }
  return lim
}

/** The exhaust / expend state of an upgrade card on a unit: spent cards cannot be used (CRB p17). */
export function cardSpent(state: GameState, unit: Unit, upId: string): boolean {
  const kind = upgradeDef(state, upId)?.exhaust ?? 'none'
  if (kind === 'exhaust') return ((unit.flags.exhausted as string[] | undefined) ?? []).includes(upId) || ((unit.flags.expended as string[] | undefined) ?? []).includes(upId)
  if (kind === 'expend') return ((unit.flags.expended as string[] | undefined) ?? []).includes(upId)
  return false
}

/** Exhaust or expend the card after one of its effects was used. */
function spendCard(unit: Unit, upId: string, state: GameState): void {
  const kind = upgradeDef(state, upId)?.exhaust ?? 'none'
  const key = kind === 'exhaust' ? 'exhausted' : kind === 'expend' ? 'expended' : null
  if (!key) return
  const list = (unit.flags[key] as string[] | undefined) ?? []
  if (!list.includes(upId)) unit.flags[key] = [...list, upId]
}

/** Net extra actions from effects (extraAction minus fewerActions) for a unit's current activation. */
export function actionDelta(state: GameState, unitId: string): number {
  let d = 0
  for (const e of state.effects) {
    if (e.unitId !== unitId) continue
    if (e.kind === 'extraAction') d += Number(e.data?.n ?? 1)
    if (e.kind === 'fewerActions') d -= Number(e.data?.n ?? 1)
  }
  return d
}

// ---------------------------------------------------------------------------
// Limits (once per attack / activation / round / game)
// ---------------------------------------------------------------------------

type Limit = string | { perRound?: number; perGame?: number } | undefined

function limitKey(inst: EffInst, owner: Unit | null): string {
  return `${inst.ref.src}:${inst.ref.id}:${inst.ref.ei}:${owner?.id ?? inst.seat}`
}

function limitUses(state: GameState, key: string): number {
  return state.effects.filter((e) => e.kind === 'limit' && e.data?.key === key).length
}

function limitReached(state: GameState, inst: EffInst, limit: Limit, owner: Unit | null): boolean {
  if (!limit || limit === 'unlimited') return false
  const key = limitKey(inst, owner)
  const uses = limitUses(state, key)
  if (typeof limit === 'string') return uses >= 1
  if (limit.perRound !== undefined) return uses >= limit.perRound
  if (limit.perGame !== undefined) return uses >= limit.perGame
  return false
}

function markLimit(ctx: Ctx, inst: EffInst, limit: Limit, owner: Unit | null): void {
  if (!limit || limit === 'unlimited') return
  const expires = typeof limit === 'string' ? (limit === 'oncePerAttack' ? 'attack' : limit === 'oncePerActivation' ? 'activation' : limit === 'oncePerRound' ? 'round' : 'game') : limit.perRound !== undefined ? 'round' : 'game'
  addEffectQuiet(ctx, { source: inst.ref.id, seat: inst.seat, kind: 'limit', expires, data: { key: limitKey(inst, owner) } })
}

/** Like addEffect but without the EffectStarted event (internal bookkeeping). */
function addEffectQuiet(ctx: Ctx, e: Parameters<typeof addEffect>[1]): void {
  const s = ctx.state
  s.effects.push({ ...e, id: `e${s.nextEffect++}` })
}

// ---------------------------------------------------------------------------
// Window runs: collect -> execute -> (suspend on a choice) -> continue
// ---------------------------------------------------------------------------

export interface FrameRef {
  name: string
  data?: Record<string, unknown>
}

export interface WindowRun {
  window: string
  info: WindowInfo
  /** keys of the effect instances already executed in this run */
  fired: string[]
  frame: FrameRef | null
}

export interface Step {
  key: string
  ref: EffectRef
  /** owner unit id (null for an unnamed card effect) */
  owner: string | null
  subject: string | null
  seat: Seat
  role: 'attacker' | 'defender' | null
  /** the optional prompt was answered with Use */
  used: boolean
  /** next verb to run */
  vi: number
  /** per-verb partial answers */
  bound: Record<string, { picks?: string[]; option?: number }>
  /** the effect's limit was marked when it was offered, so declining spends it (Son of Skywalker, CRB RC p4) */
  marked?: boolean
}

const ATTACK_FIRST = (w: string): boolean => !w.startsWith('defence.')

function envFor(state: GameState, run: WindowRun, step: Step): Env {
  const attack = attackCtxOf(state)
  const owner = step.owner ? (state.units[step.owner] ?? null) : null
  const subject = step.subject ? (state.units[step.subject] ?? null) : owner
  return {
    state,
    owner,
    subject,
    role: step.role,
    seat: step.seat,
    attack,
    info: run.info,
    x: step.ref.x,
    ...(step.ref.src === 'card' ? { cardId: step.ref.id } : {}),
    ...(step.ref.weaponId ? { weaponId: step.ref.weaponId } : {}),
  }
}

function onlyGrants(effect: J): boolean {
  return Array.isArray(effect.do) && effect.do.every((v: J) => 'grantKeyword' in v)
}

/** Effects whose trigger matches the window and whose conditions hold, in firing order. */
export function collectSteps(state: GameState, run: WindowRun): Step[] {
  const { window, info } = run
  const attack = info.attack === false ? null : attackCtxOf(state)
  const subjectId = info.unitId ?? (attack ? attack.attacker.id : undefined)
  const subject = subjectId ? (state.units[subjectId] ?? null) : null
  const steps: Step[] = []
  const considered = new Set<string>()

  const consider = (inst: EffInst, owner: Unit | null): void => {
    const e = inst.effect
    if (!e) return
    // an exhausted (or expended) card cannot be used until it is readied (CRB p17): its triggered effects wait
    if (inst.ref.src === 'upgrade' && !inst.ref.action && owner && cardSpent(state, owner, inst.ref.id)) return
    if (e.unimplemented) {
      // reached only when the unit actually carries the effect in a running window
      throw new EngineInvariantError(`unimplemented effect reached (${inst.ref.id}): ${String(e.unimplemented)}`)
    }
    const tr = e.trigger
    // the units the effect may be about: the owner (self), each attack participant (auras, cards), or the window's subject
    let subjects: (Unit | null)[]
    if (e.code) {
      const def = getCodeEffect(e.code)
      if (!def || !def.windows.includes(window)) return
      subjects = [subject]
    } else {
      if (!tr || !(tr.window === window || tr.event === window)) return
      if (tr.self) {
        if (!owner) return
        if (info.unitId) {
          if (owner.id !== info.unitId) return
        } else if (info.eachOwner) {
          // a phase-level window (the Activation Phase starts): every unit that carries the effect is its subject
        } else if (attack) {
          if (!roleOf(attack, owner)) return
        } else if (!subject || owner.id !== subject.id) return
        subjects = [owner]
      } else if (attack && !info.unitId) {
        subjects = [attack.attacker, attack.defender].filter((x): x is Unit => !!x)
      } else subjects = [subject]
    }
    for (const sub of subjects) {
      if (tr?.aura) {
        if (!owner || !sub) continue
        if (!unitsAround(state, owner, tr.aura, inst.seat, sub).some((u) => u.id === sub.id)) continue
      }
      // a code effect reads the owner's own role; a declarative effect the role of the unit it is about
      const role = e.code ? roleOf(attack, owner) : roleOf(attack, sub ?? owner)
      // the extra pass for another defender of the same attack (attack.resolved) runs defender effects only
      if (info.defenderOnly && role !== 'defender') continue
      const key = `${inst.ref.src}:${inst.ref.id}:${inst.ref.ei}:${inst.ref.weaponId ?? ''}:${owner?.id ?? inst.seat}:${sub?.id ?? ''}`
      if (run.fired.includes(key) || considered.has(key)) continue
      considered.add(key)
      const env: Env = {
        state,
        owner,
        subject: sub,
        role,
        seat: inst.seat,
        attack,
        info,
        x: inst.ref.x,
        ...(inst.ref.src === 'card' ? { cardId: inst.ref.id } : {}),
        ...(inst.ref.weaponId ? { weaponId: inst.ref.weaponId } : {}),
      }
      if (!e.code && !condOk(env, e.when)) continue
      if (e.limit && limitReached(state, inst, e.limit, owner)) continue
      steps.push({ key, ref: inst.ref, owner: owner?.id ?? null, subject: sub?.id ?? null, seat: inst.seat, role, used: false, vi: 0, bound: {} })
    }
  }

  // a phase-level window reaches units still in reserve too (Reliable on an undeployed unit)
  const units: Unit[] = info.eachOwner ? [...seatUnits(state, 'A'), ...seatUnits(state, 'B')] : unitsOnTable(state)
  if (attack) {
    for (const u of [attack.attacker, attack.defender]) if (u && !units.includes(u)) units.push(u)
  }
  const ordered = units
  for (const u of ordered) {
    const pf = attack && u.id === attack.attacker.id ? attack.pf : null
    for (const inst of unitEffects(state, u, pf)) consider(inst, u)
  }
  for (const inst of cardEffectInsts(state)) {
    const e = inst.effect
    if (e.trigger?.self || e.code) {
      const owners = namedUnits(state, inst.ref.id, inst.seat)
      const list = owners.length > 0 ? owners : e.code ? [null] : []
      for (const o of list) consider(inst, o)
    } else consider(inst, null)
  }
  // grants first, so a keyword gained in the window can fire in the same window; then the side the window favours
  const roleRank = (st: Step): number => {
    const r = st.role
    if (ATTACK_FIRST(window)) return r === 'attacker' ? 0 : r === 'defender' ? 1 : 2
    return r === 'defender' ? 0 : r === 'attacker' ? 1 : 2
  }
  steps.sort((a, b) => Number(onlyGrants(effectOfRef(state, b.ref))) - Number(onlyGrants(effectOfRef(state, a.ref))) || roleRank(a) - roleRank(b))
  return steps
}

type VerbResult = 'ok' | 'suspend'

interface OptionSpec {
  id: string
  labelKey: string
  data?: Record<string, unknown>
}

const asWindow = (w: string): TimingWindowId => w as TimingWindowId

function raiseChoice(ctx: Ctx, run: WindowRun, step: Step, stage: string, options: OptionSpec[], extra: Record<string, unknown> = {}, offer?: CodeOffer): void {
  const isCard = step.ref.src === 'card'
  const kind = isCard ? 'card.choice' : 'keyword.choice'
  ctx.raise({
    kind,
    seat: offer ? offer.seat : step.seat,
    window: asWindow(run.window),
    context: {
      ...(isCard ? { cardId: step.ref.id } : { keyword: step.ref.id }),
      stage,
      unitId: step.owner,
      subjectId: step.subject,
      ...extra,
      cont: { run, step, ...(offer ? { offer } : {}) },
    },
    options: options.map((o) => ({ id: o.id, labelKey: o.labelKey, type: kind, payload: { option: o.id }, ...(o.data ? { data: o.data } : {}) })),
    canPass: false,
  })
}

function emitFired(ctx: Ctx, step: Step, detail?: Record<string, unknown>): void {
  if (step.ref.src === 'card') ctx.emit({ type: 'CardEffect', cardId: step.ref.id, detail: { ...(detail ?? {}), unitId: step.owner ?? step.subject } }, step.seat)
  else ctx.emit({ type: 'KeywordFired', unitId: step.owner ?? step.subject ?? '', keyword: step.ref.id, ...(detail ? { detail } : {}) }, step.seat)
}

/** Verbs whose only effect is an unambiguous improvement: applied without asking even when the data says optional. */
function noBrainer(effect: J): boolean {
  return Array.isArray(effect.do) && effect.do.length > 0 && effect.do.every((v: J) => 'upgradeDice' in v)
}

function execStep(ctx: Ctx, run: WindowRun, step: Step): VerbResult {
  const state = ctx.state
  const effect = effectOfRef(state, step.ref)
  const owner = step.owner ? (state.units[step.owner] ?? null) : null
  if (effect.code) {
    const def = getCodeEffect(effect.code)
    if (!def) throw new EngineInvariantError(`code effect ${effect.code} is not registered`)
    const attack = attackCtxOf(state)
    const env = {
      window: run.window,
      params: effect.params as Record<string, unknown> | undefined,
      owner,
      subjectId: step.subject,
      seat: step.seat,
      source: step.ref.id,
      attack: attack?.af ?? null,
      pool: attack?.pf ?? null,
      role: step.role,
      offers: [] as CodeOffer[],
      info: run.info as Record<string, unknown>,
    }
    def.run(ctx, env)
    run.fired.push(step.key)
    const offer = env.offers[0]
    if (offer && run.frame) {
      raiseChoice(ctx, run, step, 'offer', offer.options, { offer: offer.keyword }, offer)
      return 'suspend'
    }
    return 'ok'
  }
  const inst: EffInst = { ref: step.ref, effect, owner, seat: step.seat }
  if (effect.optional && !step.used && !noBrainer(effect)) {
    if (!run.frame) {
      run.fired.push(step.key)
      return 'ok'
    }
    // an offer spends a once-per limit whether or not it is taken: "after his first attack this round" is not offered again
    if (effect.limit && !step.marked) {
      markLimit(ctx, inst, effect.limit, owner)
      step.marked = true
    }
    raiseChoice(ctx, run, step, 'use', [
      { id: 'use', labelKey: 'keyword.use' },
      { id: 'skip', labelKey: 'keyword.skip' },
    ])
    return 'suspend'
  }
  const verbs: J[] = effect.do ?? []
  while (step.vi < verbs.length) {
    const r = execVerb(ctx, run, step, verbs[step.vi])
    if (r === 'suspend') return 'suspend'
    step.vi++
  }
  if (effect.limit && !step.marked) markLimit(ctx, inst, effect.limit, owner)
  // using a card with an exhaust icon exhausts it; a granted action did that when it was declared
  if (step.ref.src === 'upgrade' && !step.ref.action && owner) spendCard(owner, step.ref.id, state)
  run.fired.push(step.key)
  emitFired(ctx, step)
  const hookName = step.ref.src === 'keyword' ? step.ref.id : step.ref.id
  void hookName
  return 'ok'
}

function loop(ctx: Ctx, run: WindowRun): boolean {
  for (let guard = 0; guard < 64; guard++) {
    const steps = collectSteps(ctx.state, run)
    const next = steps[0]
    if (!next) return false
    if (execStep(ctx, run, next) === 'suspend') return true
  }
  throw new EngineInvariantError(`window ${run.window} did not settle`)
}

/**
 * Run every effect whose trigger matches `window` (or event name). Returns true when a decision was raised: the caller must
 * stop and wait; the interpreter calls the registered frame-resume `resume.name` after the last answer. Without `resume`
 * optional effects and choices are not offered (they are skipped / auto-resolved).
 */
export function fireWindow(ctx: Ctx, window: string, info: WindowInfo = {}, resume?: FrameRef): boolean {
  const run: WindowRun = { window, info, fired: [], frame: resume ?? null }
  return loop(ctx, run)
}

export const fireEvent = fireWindow

function finish(ctx: Ctx, run: WindowRun): void {
  // a granted action that waited for an answer is resolved now
  if (run.info['granted'] === true && typeof run.info['action'] === 'string' && typeof run.info.unitId === 'string') {
    ctx.emit({ type: 'ActionResolved', unitId: run.info.unitId, action: run.info['action'] }, ctx.state.units[run.info.unitId]?.seat ?? null)
  }
  if (!run.frame) return
  const fn = getFrameResume(run.frame.name)
  if (!fn) throw new EngineInvariantError(`no frame resume registered for ${run.frame.name}`)
  fn(ctx, 'finished', run.frame.data ?? {})
}

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

function beneficiary(state: GameState, step: Step): Unit | null {
  const id = step.subject ?? step.owner
  return id ? (state.units[id] ?? null) : null
}

function resolveTargets(ctx: Ctx, step: Step, to: J, env: Env): Unit[] {
  const state = ctx.state
  const center = (step.subject ? state.units[step.subject] : null) ?? (step.owner ? state.units[step.owner] : null)
  if (to === undefined || to === 'subject' || to === 'self') {
    const u = to === 'self' ? (step.owner ? state.units[step.owner] : null) : beneficiary(state, step)
    return u ? [u] : []
  }
  if (to === 'defender') return env.attack?.defender ? [env.attack.defender] : []
  if (to === 'attacker') return env.attack ? [env.attack.attacker] : []
  if (to?.aura) return center ? unitsAround(state, center, to.aura, step.seat, center) : []
  if (to?.all) {
    // every unit still in the game, units in reserve included (Turning the Tide reaches Support and Heavy units not yet deployed)
    return [...seatUnits(state, 'A'), ...seatUnits(state, 'B')].filter((u) => matchFilter(state, u, to.all.filter, center, step.seat) && (!to.all.side || (to.all.side === 'ally') === (u.seat === step.seat)))
  }
  throw new EngineInvariantError(`unsupported verb target ${JSON.stringify(to)}`)
}

function applyToTokens(ctx: Ctx, run: WindowRun, step: Step, verb: 'gainToken' | 'removeToken', args: J, env: Env): VerbResult {
  const kind = tokenKey(args.token)
  const n = evalExpr(env, args.n ?? 1)
  const targets = resolveTargets(ctx, step, args.to, env)
  const act = (u: Unit, k: number): void => {
    if (k <= 0) return
    if (verb === 'gainToken') gainToken(ctx, u.id, kind, k, 'effect')
    else loseToken(ctx, u.id, kind, k, 'effect')
  }
  if (!args.distribute) {
    for (const u of targets) act(u, n)
    return 'ok'
  }
  // distribute n tokens among the targets one at a time (Demoralize, Inspire)
  const key = String(step.vi)
  const b = (step.bound[key] ??= { picks: [] })
  const candidates = targets.filter((u) => (verb === 'gainToken' ? kind !== 'suppression' || courageOf(ctx.state, u) !== null : tokensOf(u, kind) > 0))
  const placed = new Map<string, number>()
  for (const id of b.picks ?? []) placed.set(id, (placed.get(id) ?? 0) + 1)
  while ((b.picks?.length ?? 0) < n && b.option !== -1) {
    const open = verb === 'removeToken' ? candidates.filter((u) => tokensOf(u, kind) - (placed.get(u.id) ?? 0) > 0) : candidates
    if (open.length === 0) break
    if (open.length === 1 || !run.frame) {
      const id = open[0]!.id
      b.picks!.push(id)
      placed.set(id, (placed.get(id) ?? 0) + 1)
      continue
    }
    raiseChoice(
      ctx,
      run,
      step,
      'distribute',
      [...open.map((u) => ({ id: `unit:${u.id}`, labelKey: 'keyword.pickUnit', data: { unitId: u.id } })), { id: 'done', labelKey: 'keyword.done' }],
      { remaining: n - (b.picks?.length ?? 0), token: kind },
    )
    return 'suspend'
  }
  for (const [id, k] of placed) act(getUnit(ctx.state, id), k)
  delete step.bound[key]
  return 'ok'
}

function execVerb(ctx: Ctx, run: WindowRun, step: Step, verb: J): VerbResult {
  const state = ctx.state
  const name = Object.keys(verb)[0]!
  const args = verb[name]
  const env = envFor(state, run, step)
  const att = env.attack
  switch (name) {
    case 'gainToken':
    case 'removeToken':
      return applyToTokens(ctx, run, step, name, args, env)
    case 'spendToken': {
      const u = beneficiary(state, step)
      if (u) {
        const kind = tokenKey(args.token)
        const k = loseToken(ctx, u.id, kind, evalExpr(env, args.n ?? 1), 'spend')
        if (att?.pf && k > 0) att.pf.spent[step.role ?? 'attacker'][kind] = (att.pf.spent[step.role ?? 'attacker'][kind] ?? 0) + k
      }
      return 'ok'
    }
    case 'changeRange':
      if (att) att.af.rangeBonus += Number(args.max ?? 1)
      return 'ok'
    case 'cancelResult': {
      if (!att?.pf) return 'ok'
      const pf = att.pf
      const max = evalExpr(env, args.max ?? 1)
      if (args.result === 'block') {
        // Immune: Pierce (and a Duelist's defensive grant) stops Pierce from cancelling blocks (K-11)
        if (step.ref.id === 'kw.pierce' && att.defender && !foldBool(true, modValues(state, att.defender, 'pierceAllowed', { role: 'defender' }))) return 'ok'
        const n = Math.min(max, pf.blocks)
        pf.blocks -= n
        if (n > 0) ctx.emit({ type: 'ResultsCancelled', side: 'defence', source: step.ref.id, result: 'block', n })
      } else if (args.result === 'crit') {
        const n = Math.min(max, pf.crits)
        pf.crits -= n
        if (n > 0) ctx.emit({ type: 'ResultsCancelled', side: 'attack', source: step.ref.id, result: 'crit', n })
      } else {
        const n = Math.min(max, pf.hits)
        pf.hits -= n
        if (n > 0) ctx.emit({ type: 'ResultsCancelled', side: 'attack', source: step.ref.id, result: 'hit', n })
      }
      return 'ok'
    }
    case 'changeResult': {
      if (!att?.pf) return 'ok'
      const pf = att.pf
      const max = evalExpr(env, args.max ?? 1)
      if (args.from === 'hit' && args.to === 'crit') {
        const n = Math.min(max, pf.hits)
        pf.hits -= n
        pf.crits += n
        if (n > 0) ctx.emit({ type: 'ResultsChanged', source: step.ref.id, from: 'hit', to: 'crit', n })
      } else if (args.from === 'crit' && args.to === 'hit') {
        const n = Math.min(max, pf.crits)
        pf.crits -= n
        pf.hits += n
        if (n > 0) ctx.emit({ type: 'ResultsChanged', source: step.ref.id, from: 'crit', to: 'hit', n })
      }
      return 'ok'
    }
    case 'convertSurge': {
      if (!att?.pf) return 'ok'
      const max = evalExpr(env, args.max ?? 1)
      let n = 0
      for (const d of att.pf.dice) {
        if (n >= max) break
        if (d.face === 'surge') {
          d.face = args.to === 'hit' ? 'hit' : 'crit'
          n++
        }
      }
      if (n > 0) ctx.emit({ type: 'ResultsChanged', source: step.ref.id, from: 'surge', to: String(args.to), n })
      return 'ok'
    }
    case 'upgradeDice':
    case 'downgradeDice': {
      if (!att?.pf) return 'ok'
      const raw = args.n
      const count = raw === 'all' ? 0 : evalExpr(env, raw ?? 1)
      att.pf.shifts.push({
        effectId: `${step.ref.src}:${step.ref.id}:${step.ref.weaponId ?? ''}:${step.owner ?? ''}`,
        party: step.role === 'defender' ? 'defender' : 'attacker',
        dir: name === 'upgradeDice' ? 1 : -1,
        count,
        ...(args.weapons === 'thisWeapon' && step.ref.weaponId ? { weaponId: step.ref.weaponId } : {}),
      })
      return 'ok'
    }
    case 'grantKeyword': {
      const kw = args.keyword
      const scope = effectOfRef(state, step.ref)?.scope
      if (att?.pf && scope && typeof scope === 'object' && 'pool' in scope) {
        if (scope.pool === 'otherRangedWeapons') {
          const own = effectOfRef(state, step.ref)?.when?.poolHasWeapon as string | undefined
          const ids = att.pf.weapons.map((w) => w.weaponId).filter((id) => id !== own && weaponTypes(weaponDef(state, id)).includes('ranged'))
          att.pf.granted.push({ id: kw.id, ...(kw.x !== undefined ? { x: kw.x } : {}), weaponIds: [...new Set(ids)] })
        } else if (scope.pool === 'thisWeapon' && step.ref.weaponId) {
          att.pf.granted.push({ id: kw.id, ...(kw.x !== undefined ? { x: kw.x } : {}), weaponIds: [step.ref.weaponId] })
        } else {
          att.pf.granted.push({ id: kw.id, ...(kw.x !== undefined ? { x: kw.x } : {}) })
        }
        return 'ok'
      }
      const targets = resolveTargets(ctx, step, args.to, env)
      const expires = args.duration === 'attack' ? 'attack' : args.duration === 'activation' ? 'activation' : args.duration === 'round' ? 'round' : 'game'
      for (const u of targets) {
        addEffect(ctx, { source: step.ref.id, seat: u.seat, kind: 'keyword', unitId: u.id, expires, data: { keyword: { id: kw.id, ...(kw.x !== undefined ? { x: kw.x } : {}) } } })
      }
      return 'ok'
    }
    case 'removeKeyword': {
      const u = beneficiary(state, step)
      if (u) {
        const removed = ((u.flags.removedKeywords as string[] | undefined) ?? []).slice()
        if (!removed.includes(args.keyword.id)) removed.push(args.keyword.id)
        u.flags.removedKeywords = removed
      }
      return 'ok'
    }
    case 'grantFreeAction': {
      const u = beneficiary(state, step)
      if (!u) return 'ok'
      addEffect(ctx, {
        source: step.ref.id,
        seat: u.seat,
        kind: 'freeAction',
        unitId: u.id,
        expires: 'activation',
        data: { action: args.action, ...(args.weapons ? { weapons: args.weapons } : {}), ...(args.target ? { target: args.target } : {}), ...(args.ignoreAttackLimit ? { ignoreAttackLimit: true } : {}), source: step.ref.id },
      })
      return 'ok'
    }
    case 'extraAction':
    case 'fewerActions': {
      const u = beneficiary(state, step)
      if (u) addEffect(ctx, { source: step.ref.id, seat: u.seat, kind: name === 'extraAction' ? 'extraAction' : 'fewerActions', unitId: u.id, expires: 'activation', data: { n: evalExpr(env, args.n ?? 1) } })
      return 'ok'
    }
    case 'sufferWounds': {
      const u = beneficiary(state, step)
      if (u) sufferWounds(ctx, u.id, evalExpr(env, args.n ?? 1), step.ref.id)
      return 'ok'
    }
    case 'dealWounds': {
      const targets = args.to === 'attacker' ? (att ? [att.attacker] : []) : resolveTargets(ctx, step, args.to, env)
      const amount = evalExpr(env, args.amount ?? 1)
      for (const u of targets) sufferWounds(ctx, u.id, amount, step.ref.id)
      return 'ok'
    }
    case 'readyCards': {
      const u = beneficiary(state, step)
      if (!u) return 'ok'
      const exhausted = ((u.flags.exhausted as string[] | undefined) ?? []).slice()
      const max = evalExpr(env, args.max ?? 1)
      const ready = exhausted.filter((id) => (args.slot ? upgradeDef(state, id)?.slot === args.slot : true)).slice(0, max)
      u.flags.exhausted = exhausted.filter((id) => !ready.includes(id))
      return 'ok'
    }
    case 'applyModifier': {
      const u = beneficiary(state, step)
      if (!u) return 'ok'
      const expires = args.duration === 'round' ? 'round' : args.duration === 'game' ? 'game' : 'activation'
      addEffectQuiet(ctx, { source: step.ref.id, seat: u.seat, kind: 'modifier', unitId: u.id, expires, data: { modifier: args.modifier, op: args.op, value: args.value } })
      return 'ok'
    }
    case 'choose': {
      const key = String(step.vi)
      const options: J[][] = args.options
      let pick = step.bound[key]?.option
      if (pick === undefined) {
        if (!run.frame || options.length === 1) pick = 0
        else {
          raiseChoice(ctx, run, step, 'option', options.map((_, i) => ({ id: `opt:${i}`, labelKey: 'keyword.option', data: { index: i, verbs: options[i]!.map((v: J) => Object.keys(v)[0]) } })))
          return 'suspend'
        }
        step.bound[key] = { option: pick }
      }
      for (const v of options[pick]!) {
        const sub: Step = { ...step, vi: 0, bound: {} }
        if (execVerb(ctx, run, sub, v) === 'suspend') throw new EngineInvariantError('a choose option cannot itself suspend')
      }
      return 'ok'
    }
    case 'chooseUnits': {
      const key = String(step.vi)
      const b = (step.bound[key] ??= { picks: [] })
      const picks = (b.picks ??= [])
      const center = (step.owner ? state.units[step.owner] : null) ?? beneficiary(state, step)
      const subj = beneficiary(state, step)
      const n = evalExpr(env, args.n ?? 1)
      const matching = unitsOnTable(state).filter((u) => matchFilter(state, u, args.filter, center, step.seat, subj))
      while (picks.length < n && b.option !== -1) {
        const open = matching.filter((u) => !picks.includes(u.id))
        if (open.length === 0) break
        const need = n - picks.length
        if (!args.upTo && open.length <= need) {
          picks.push(...open.map((u) => u.id))
          break
        }
        if (!run.frame) {
          picks.push(...open.slice(0, need).map((u) => u.id))
          break
        }
        raiseChoice(
          ctx,
          run,
          step,
          'pick',
          [...open.map((u) => ({ id: `unit:${u.id}`, labelKey: 'keyword.pickUnit', data: { unitId: u.id } })), ...(args.upTo || picks.length > 0 ? [{ id: 'done', labelKey: 'keyword.done' }] : [])],
          { remaining: need },
        )
        return 'suspend'
      }
      for (const id of picks) {
        const sub: Step = { ...step, subject: id, vi: 0, bound: {} }
        for (const v of args.then ?? []) {
          const vv = v.sufferWounds ? { sufferWounds: { ...v.sufferWounds, who: 'subject' } } : v
          if (execVerb(ctx, run, sub, vv) === 'suspend') throw new EngineInvariantError('a chooseUnits follow-up cannot itself suspend')
        }
      }
      delete step.bound[key]
      return 'ok'
    }
    case 'controlledMove': {
      const u = beneficiary(state, step)
      if (!u) return 'ok'
      addEffect(ctx, { source: step.ref.id, seat: u.seat, kind: 'controlledMove', unitId: u.id, expires: 'activation', data: { speed: args.speed, ignoreEngagement: !!args.ignoreEngagement } })
      return 'ok'
    }
    default:
      throw new EngineInvariantError(`verb ${name} is not implemented in the slice (effect ${step.ref.id})`)
  }
}

// ---------------------------------------------------------------------------
// Choice resolution (keyword.choice, card.choice)
// ---------------------------------------------------------------------------

interface ContJson {
  run: WindowRun
  step: Step
  offer?: CodeOffer
}

// ---------------------------------------------------------------------------
// Divulge (CRB p61): at Resolve Setup Effects a player may reveal a card with the Divulge keyword, blue first; declining ends
// the chance for that card. commandCards.ts registers the function that applies the text below the card's line.
// ---------------------------------------------------------------------------

interface DivulgeEntry {
  seat: Seat
  cardId: string
}

/** Raise the next Divulge offer (blue first); false when no card is left to offer. */
export function offerDivulges(ctx: Ctx): boolean {
  const s = ctx.state
  if (s.origin.setup.options?.autoDivulge) return false
  let queue = s.battle.data['divulgeQueue'] as DivulgeEntry[] | undefined
  if (!queue) {
    const blue = s.battle.blue ?? 'A'
    queue = []
    for (const seat of [blue, otherSeat(blue)]) {
      for (const cardId of s.players[seat].hand) if (cardDef(s, cardId)?.divulge) queue.push({ seat, cardId })
    }
    s.battle.data['divulgeQueue'] = queue
  }
  const next = queue.shift()
  if (!next) return false
  ctx.raise({
    kind: 'card.choice',
    seat: next.seat,
    window: 'setup.*',
    context: { stage: 'divulge', cardId: next.cardId, unitId: null, subjectId: null },
    options: [
      { id: 'divulge', labelKey: 'card.divulge', type: 'card.choice', payload: { option: 'divulge' } },
      { id: 'decline', labelKey: 'card.divulge.decline', type: 'card.choice', payload: { option: 'decline' } },
    ],
    canPass: false,
  })
  return true
}

function resolveDivulge(ctx: Ctx, pending: PendingDecision, option: string): void {
  const cardId = String(pending.context['cardId'])
  const seat = pending.seat as Seat
  if (option === 'divulge') {
    const d = (ctx.state.battle.data['divulged'] as Record<string, boolean> | undefined) ?? {}
    ctx.state.battle.data['divulged'] = { ...d, [cardId]: true }
    getFrameResume('divulge.apply')?.(ctx, 'finished', { seat, cardId })
  }
  if (offerDivulges(ctx)) return
  const fn = getFrameResume('setup.divulge')
  if (!fn) throw new EngineInvariantError('no frame resume registered for setup.divulge')
  fn(ctx, 'finished', {})
}

export function resolveChoice(ctx: Ctx, pending: PendingDecision, option: string): void {
  if (pending.context['stage'] === 'divulge') return resolveDivulge(ctx, pending, option)
  const raw = pending.context['cont']
  if (!raw) throw new EngineInvariantError(`${pending.kind} ${pending.id} carries no continuation`)
  const cont = JSON.parse(JSON.stringify(raw)) as ContJson
  const { run, step } = cont
  const stage = String(pending.context['stage'])
  if (stage === 'offer' && cont.offer) {
    const more = (o: CodeOffer): void => raiseChoice(ctx, run, step, 'offer', o.options, { offer: o.keyword }, o)
    getCodeEffect(cont.offer.code)?.resolve?.(ctx, cont.offer, option, more)
    if (ctx.state.pending) return
  } else if (stage === 'use') {
    if (option === 'skip') run.fired.push(step.key)
    else {
      step.used = true
      if (execStep(ctx, run, step) === 'suspend') return
    }
  } else {
    const key = String(step.vi)
    const b = (step.bound[key] ??= { picks: [] })
    if (stage === 'option') b.option = Number(option.split(':')[1])
    else if (option === 'done') b.option = -1
    else b.picks = [...(b.picks ?? []), option.replace(/^unit:/, '')]
    if (execStep(ctx, run, step) === 'suspend') return
  }
  if (loop(ctx, run)) return
  finish(ctx, run)
}

/** Raise a code effect's offer as a `keyword.choice` / `card.choice` outside a window run (a card action's first choice). */
export function raiseOffer(ctx: Ctx, offer: CodeOffer, source: { src: 'keyword' | 'upgrade' | 'card'; id: string }, window: string, frame: FrameRef | null): void {
  const run: WindowRun = { window, info: { unitId: offer.unitId, attack: false }, fired: [], frame }
  const step: Step = { key: `offer:${offer.code}:${offer.unitId}`, ref: { src: source.src, id: source.id, ei: 0, x: 0 }, owner: offer.unitId, subject: offer.unitId, seat: offer.seat, role: null, used: true, vi: 0, bound: {} }
  raiseChoice(ctx, run, step, 'offer', offer.options, { offer: offer.keyword }, offer)
}

export function choiceModule(id: string, namespace: string): ModuleDef {
  return {
    id,
    namespaces: [namespace],
    handle(_state, action, pending) {
      if (action.type !== 'keyword.choice' && action.type !== 'card.choice') return reject('E_WRONG_DECISION', `${action.type} is not a ${namespace} decision`)
      const option = action.payload.option
      return {
        run(ctx) {
          resolveChoice(ctx, pending, option)
        },
      }
    },
  }
}

export const keywordsModule: ModuleDef = choiceModule('keywords', 'keyword')

// ---------------------------------------------------------------------------
// Granted actions (upgrade cards and keywords add actions to the menu)
// ---------------------------------------------------------------------------

export interface GrantedAction {
  id: string
  name: string
  kind: 'card' | 'free'
  exhaust: 'none' | 'exhaust' | 'expend'
  /** the upgrade card (or, for a keyword grant, the keyword id) the action belongs to */
  upgradeId: string
  available: boolean
  whyNot?: string
  /** Jump X: the action is a Move that ignores terrain up to this height (CRB p52) */
  jump?: number
}

export function grantedActions(state: GameState, unit: Unit): GrantedAction[] {
  const out: GrantedAction[] = []
  // actions a keyword grants (Jump X): usable whenever the unit could make a Move action
  for (const k of unitKeywords(state, unit)) {
    for (const e of keywordDef(state, k.id)?.effects ?? []) {
      const a = e.grant?.action
      if (!a) continue
      const native = (a.effects ?? []).find((x: J) => x.native === 'jump')
      const canMove = unit.location === 'table' && unit.engagedWith.length === 0
      out.push({ id: a.id, name: a.name, kind: a.kind, exhaust: 'none', upgradeId: k.id, available: canMove, ...(canMove ? {} : { whyNot: 'engaged' }), ...(native ? { jump: Math.max(1, k.x) } : {}) })
    }
  }
  for (const upId of unit.upgrades) {
    const ud = upgradeDef(state, upId)
    if (!ud || !upgradeLive(unit, upId)) continue
    for (const e of ud.effects ?? []) {
      const a = e.grant?.action
      if (!a) continue
      const exhaust = (a.exhaust ?? ud.exhaust ?? 'none') as GrantedAction['exhaust']
      const exhausted = ((unit.flags.exhausted as string[] | undefined) ?? []).includes(upId)
      const expended = ((unit.flags.expended as string[] | undefined) ?? []).includes(upId)
      const available = exhaust === 'none' ? true : exhaust === 'exhaust' ? !exhausted && !expended : !expended
      out.push({ id: a.id, name: a.name, kind: a.kind, exhaust, upgradeId: upId, available, ...(available ? {} : { whyNot: expended ? 'expended' : 'exhausted' }) })
    }
  }
  return out
}

/** Run the effects of a granted action (Force Choke, Specialist...). Exhausts or expends the card. Returns true when a decision was raised. */
export function runGrantedAction(ctx: Ctx, unitId: string, actionId: string, resume?: FrameRef): boolean {
  const unit = getUnit(ctx.state, unitId)
  const ga = grantedActions(ctx.state, unit).find((g) => g.id === actionId)
  if (!ga) throw new EngineInvariantError(`unit ${unitId} has no action ${actionId}`)
  if (ga.jump !== undefined) throw new EngineInvariantError(`${actionId} is a Move: the activation runs it`)
  if (!ga.available) throw new EngineInvariantError(`action ${actionId} is ${ga.whyNot}`)
  if (ga.exhaust === 'exhaust') unit.flags.exhausted = [...((unit.flags.exhausted as string[] | undefined) ?? []), ga.upgradeId]
  if (ga.exhaust === 'expend') unit.flags.expended = [...((unit.flags.expended as string[] | undefined) ?? []), ga.upgradeId]
  const run: WindowRun = { window: 'action.resolved', info: { unitId, action: actionId, attack: false, granted: true }, fired: [], frame: resume ?? null }
  const step: Step = { key: `action:${actionId}:${unitId}`, ref: { src: 'upgrade', id: ga.upgradeId, ei: 0, action: actionId, x: 0 }, owner: unitId, subject: unitId, seat: unit.seat, role: null, used: true, vi: 0, bound: {} }
  ctx.emit({ type: 'ActionDeclared', unitId, action: actionId, free: ga.kind === 'free' }, unit.seat)
  const suspended = execStep(ctx, run, step) === 'suspend'
  if (!suspended) ctx.emit({ type: 'ActionResolved', unitId, action: actionId }, unit.seat)
  return suspended
}

// ---------------------------------------------------------------------------
// Lifecycle helpers the flow modules call
// ---------------------------------------------------------------------------

/** Expire attack-scoped effects (granted keywords, once-per-attack limits) when an attack ends. */
export function expireAttackEffects(ctx: Ctx): void {
  removeEffects(ctx, (e) => e.expires === 'attack')
}

/** A code hook fired: count it for the "every hook fires in a real game" test. */
export function codeFired(name: string): void {
  markFired(name)
}

export { runHook }
