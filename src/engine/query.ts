// query.*: every number the UI and the AI show (docs/spec/00 section 7.7). Pure functions of a state; the attack pipeline
// (attack.ts) calls the same functions for targets, pools and cover, so a prompt can never disagree with the step it
// leads to. Odds are exact distributions over the face tables (dice.ts), not simulations.
import {
  attackDistribution,
  coverDistribution,
  defenceBlockDistribution,
  expectedOf,
  reduceHits,
  type HitCritDist,
} from './dice'
import { hasLos, coverFor, improveCover, miniLosBody, type CoverResult } from './los'
import { closestDistance, distance, inBaseContact, miniBody, rangeBand, weaponReaches, withinBand, type RangeBand } from './measure'
import { poiPiece } from './table'
import { aliveMinis, constants, EngineInvariantError, getUnit, leaderOf, unitsOnTable } from './state'
import {
  attackCtxOf,
  barricadeCover,
  foldBool,
  foldNumber,
  hasKeyword,
  keywordX,
  matchesUnitType,
  miniWeapons,
  modValues,
  poolAllHave,
  poolKeywordX,
  tokensOf,
  unitDef,
  unitKeywords,
  unitRank,
  weaponDef,
  weaponKeywordList,
  weaponTypes,
  rankKey,
  type J,
} from './keywords'
import { courageOf, courageSource, isPanicked, isSuppressed, suppressionState } from './morale'
import type {
  AttackColour,
  AttackFrame,
  AttackKind,
  CoverValue,
  DefenceColour,
  GameState,
  Mini,
  PoolFrame,
  PoolWeapon,
  Seat,
  Unit,
} from './types'

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

export function leaderBody(state: GameState, unit: Unit) {
  return miniBody(state, leaderOf(unit))
}

/** Enemy units with a model in base contact with one of `unit`'s models, computed now (not the cached `engagedWith`). */
export function engagedUnitIds(state: GameState, unit: Unit): string[] {
  const c = constants(state)
  const mine = aliveMinis(unit).map((m) => miniBody(state, m))
  const out: string[] = []
  for (const o of unitsOnTable(state)) {
    if (o.seat === unit.seat || unit.location !== 'table') continue
    const theirs = aliveMinis(o).map((m) => miniBody(state, m))
    if (mine.some((a) => theirs.some((b) => inBaseContact(a, b, c)))) out.push(o.id)
  }
  return out.sort()
}

/** `query.distance`: closest base edges between two units' models, 1/1000". */
export function distanceBetween(state: GameState, aId: string, bId: string): number {
  const a = getUnit(state, aId)
  const b = getUnit(state, bId)
  let best = Infinity
  for (const x of aliveMinis(a)) for (const y of aliveMinis(b)) best = Math.min(best, distance(miniBody(state, x), miniBody(state, y)))
  return best
}

/** `query.rangeBand` between two units (closest models). */
export function rangeBandBetween(state: GameState, aId: string, bId: string): RangeBand {
  return rangeBand(distanceBetween(state, aId, bId), constants(state))
}

/** `query.inRange`: some model of `a` is within band `n` of some model of `b`. */
export function inRange(state: GameState, aId: string, bId: string, n: number): boolean {
  return withinBand(distanceBetween(state, aId, bId), n, constants(state))
}

/** `query.engagedWith`: enemy units in base contact with the unit now. */
export function engagedWith(state: GameState, unitId: string): string[] {
  return engagedUnitIds(state, getUnit(state, unitId))
}

export function distanceLeaderToUnit(state: GameState, attacker: Unit, defender: Unit): number {
  return closestDistance(leaderBody(state, attacker), aliveMinis(defender).map((m) => miniBody(state, m)))
}

/** Models of `defender` in LOS of one specific model. */
export function minisSeenBy(state: GameState, from: Mini, defender: Unit): Mini[] {
  const a = miniLosBody(state, from)
  return aliveMinis(defender).filter((m) => hasLos(state.table.def, a, miniLosBody(state, m)))
}

/** Defending models seen by at least one attacking model (the ranged wound cap, R-14.3). */
export function minisSeenByUnit(state: GameState, attacker: Unit, defender: Unit): Mini[] {
  const seen = new Set<string>()
  for (const a of aliveMinis(attacker)) for (const m of minisSeenBy(state, a, defender)) seen.add(m.id)
  return aliveMinis(defender).filter((m) => seen.has(m.id))
}

// ---------------------------------------------------------------------------
// Cover (R-11)
// ---------------------------------------------------------------------------

export function poiPieces(state: GameState) {
  return Object.values(state.table.objectives)
    .filter((o) => o.kind === 'poi')
    .map((o) => poiPiece(o.id, o.pos, 1))
}

/** Reduce a cover value by Sharpshooter (after improvements, R-11.1). */
export function reduceCover(level: CoverValue, x: number): CoverValue {
  const levels: CoverValue[] = ['none', 'light', 'heavy']
  return levels[Math.max(0, levels.indexOf(level) - Math.max(0, x))]!
}

export interface CoverVerdict {
  /** raw scan: models obscured, cover before/after the Suppressed improvement */
  scan: CoverResult
  /** the cover the defender actually has after the Suppressed improvement and the attacker's Sharpshooter */
  level: CoverValue
  sharpshooter: number
}

/** Cover of `defender` against a ranged attack by `attacker` (R-11.2 to R-11.3), the same function the attack step uses. */
export function coverVerdict(state: GameState, attacker: Unit, defender: Unit, keepRays = false): CoverVerdict {
  const scan = coverFor(
    state.table.def,
    miniLosBody(state, leaderOf(attacker)),
    aliveMinis(defender).map((m) => miniLosBody(state, m)),
    {
      suppressed: isSuppressed(state, defender),
      barricadeCover: barricadeCover(state, defender),
      constants: constants(state),
      extraPieces: poiPieces(state),
      keepRays,
    },
  )
  const x = foldNumber(
    0,
    modValues(state, attacker, 'coverValue', { role: 'attacker' }).map((m) => ({ ...m, value: Number(m.value) })),
  )
  const sharp = x < 0 ? -x : 0
  return { scan, level: reduceCover(scan.cover, sharp), sharpshooter: sharp }
}

/** `query.losCover`: what the attacker's leader sees of a unit, and the cover verdict with its rays. */
export function losCover(state: GameState, attackerId: string, defenderId: string) {
  const attacker = getUnit(state, attackerId)
  const defender = getUnit(state, defenderId)
  const verdict = coverVerdict(state, attacker, defender, true)
  return { visible: verdict.scan.minis.filter((m) => m.visible).map((m) => m.id), ...verdict }
}

// ---------------------------------------------------------------------------
// Targets (R-12.2) and pools (R-12.3)
// ---------------------------------------------------------------------------

export interface TargetOpts {
  rangeBonus?: number
  rangedOnly?: boolean
  meleeOnly?: boolean
  usedMinis?: readonly string[]
  usedWeapons?: readonly string[]
}

export interface TargetCheck {
  ok: boolean
  reason?: 'notOnTable' | 'friendly' | 'noLos' | 'outOfRange' | 'engaged' | 'notEngaged' | 'noWeapon' | 'incognito'
  distance: number
  band: RangeBand
  kinds: AttackKind[]
  visible: string[]
}

export function weaponInRange(state: GameState, weaponId: string, d: number, bonus = 0): boolean {
  const w = weaponDef(state, weaponId)
  const r = w.range ?? { min: 1, max: 1 }
  if (r.max === 0) return true
  return weaponReaches(d, { min: r.min ?? 1, max: r.max + bonus }, constants(state))
}

/** Weapons `mini` could add to a pool of `kind` against a defender at distance `d` (R-12.3). */
export function usableWeapons(state: GameState, unit: Unit, mini: Mini, kind: AttackKind, d: number, opts: TargetOpts = {}): string[] {
  if (!mini.alive || opts.usedMinis?.includes(mini.id)) return []
  const out: string[] = []
  for (const wid of miniWeapons(state, unit, mini.id)) {
    const w = weaponDef(state, wid)
    if (!weaponTypes(w).includes(kind)) continue
    if (opts.usedWeapons?.includes(wid)) continue
    const longShot = (w.keywords as { id: string }[] | undefined)?.some((k) => k.id === 'kw.long-shot')
    if (kind === 'ranged' && !weaponInRange(state, wid, d, longShot ? (opts.rangeBonus ?? 0) : 0)) continue
    out.push(wid)
  }
  return out
}

export function checkTarget(state: GameState, attackerId: string, defenderId: string, opts: TargetOpts = {}): TargetCheck {
  const atk = getUnit(state, attackerId)
  const def = getUnit(state, defenderId)
  const base: TargetCheck = { ok: false, distance: Infinity, band: 'beyond', kinds: [], visible: [] }
  if (atk.seat === def.seat) return { ...base, reason: 'friendly' }
  if (atk.location !== 'table' || def.location !== 'table') return { ...base, reason: 'notOnTable' }
  const d = distanceLeaderToUnit(state, atk, def)
  const band = rangeBand(d, constants(state))
  const leader = miniLosBody(state, leaderOf(atk))
  const visible = aliveMinis(def)
    .filter((m) => hasLos(state.table.def, leader, miniLosBody(state, m)))
    .map((m) => m.id)
  const res: TargetCheck = { ...base, distance: d, band, visible }
  if (visible.length === 0) return { ...res, reason: 'noLos' }
  const atkEngaged = engagedUnitIds(state, atk)
  const defEngaged = engagedUnitIds(state, def)
  const kinds: AttackKind[] = []
  let meleeReason: TargetCheck['reason'] | undefined
  let rangedReason: TargetCheck['reason'] | undefined
  const minis = aliveMinis(atk)
  if (!opts.rangedOnly) {
    if (atkEngaged.includes(def.id)) {
      if (minis.some((m) => usableWeapons(state, atk, m, 'melee', d, opts).length > 0)) kinds.push('melee')
      else meleeReason = 'noWeapon'
    } else meleeReason = 'notEngaged'
  }
  if (!opts.meleeOnly) {
    if (atkEngaged.length > 0 || defEngaged.length > 0) rangedReason = 'engaged'
    else if (minis.some((m) => usableWeapons(state, atk, m, 'ranged', d, opts).length > 0)) {
      const cap = foldNumber(Infinity, modValues(state, def, 'targetableFrom', { role: 'defender' }).map((m) => ({ ...m, value: Number(m.value) })))
      if (band !== 'beyond' && band > cap) rangedReason = 'incognito'
      else kinds.push('ranged')
    } else rangedReason = 'outOfRange'
  }
  const reason = opts.meleeOnly ? meleeReason : (rangedReason ?? meleeReason)
  if (kinds.length > 0) return { ...res, ok: true, kinds }
  return { ...res, reason: reason ?? 'outOfRange' }
}

/** `query.attackTargets`: every enemy unit with its check (distance, band, kinds, visible models, cover for ranged). */
export function attackTargets(state: GameState, unitId: string, opts: TargetOpts = {}) {
  const atk = getUnit(state, unitId)
  return unitsOnTable(state)
    .filter((u) => u.seat !== atk.seat)
    .map((u) => {
      const t = checkTarget(state, atk.id, u.id, opts)
      return {
        unitId: u.id,
        ...t,
        cover: t.ok && t.kinds.includes('ranged') ? coverVerdict(state, atk, u).level : null,
      }
    })
}

export interface PoolCandidate {
  miniId: string
  /** weapons it could add, best first */
  weapons: string[]
}

/** Models with LOS to the defender and the weapons each may add for a given kind (R-12.3). */
export function poolCandidates(state: GameState, attackerId: string, defenderId: string, kind: AttackKind, opts: TargetOpts = {}): PoolCandidate[] {
  const atk = getUnit(state, attackerId)
  const def = getUnit(state, defenderId)
  const d = distanceLeaderToUnit(state, atk, def)
  const out: PoolCandidate[] = []
  for (const m of aliveMinis(atk)) {
    const ws = usableWeapons(state, atk, m, kind, d, opts)
    if (ws.length === 0) continue
    if (minisSeenBy(state, m, def).length === 0) continue
    out.push({ miniId: m.id, weapons: ws.sort((a, b) => weaponValue(state, b) - weaponValue(state, a) || (a < b ? -1 : 1)) })
  }
  return out
}

/** Expected hit-equivalents of a weapon's dice (red .75, black .5, white .25 with the community d8 faces), for ordering only. */
export function weaponValue(state: GameState, weaponId: string): number {
  const dice = weaponDef(state, weaponId).dice as Record<AttackColour, number>
  let v = 0
  for (const c of ['red', 'black', 'white'] as const) {
    const faces = state.data.dice.attack[c]
    v += (dice[c] ?? 0) * (faces.filter((f) => f === 'hit' || f === 'crit').length / faces.length)
  }
  return v
}

export function weaponDiceCounts(state: GameState, weaponId: string): Record<AttackColour, number> {
  const d = weaponDef(state, weaponId).dice as Record<AttackColour, number>
  return { red: d.red ?? 0, black: d.black ?? 0, white: d.white ?? 0 }
}

export function poolDiceCounts(state: GameState, weapons: readonly PoolWeapon[]): Record<AttackColour, number> {
  const out: Record<AttackColour, number> = { red: 0, black: 0, white: 0 }
  for (const w of weapons) {
    const c = weaponDiceCounts(state, w.weaponId)
    out.red += c.red
    out.black += c.black
    out.white += c.white
  }
  return out
}

/** `query.attackPool`: the dice and keywords of a pool (explicit weapons per model, or the best full pool) against a defender. */
export function attackPool(state: GameState, attackerId: string, defenderId: string, weaponIds?: Record<string, string>) {
  const kinds = checkTarget(state, attackerId, defenderId).kinds
  const kind: AttackKind = kinds.includes('ranged') ? 'ranged' : 'melee'
  const weapons: PoolWeapon[] = weaponIds
    ? Object.entries(weaponIds).map(([miniId, weaponId]) => ({ miniId, weaponId }))
    : poolCandidates(state, attackerId, defenderId, kind).map((c) => ({ miniId: c.miniId, weaponId: c.weapons[0]! }))
  const pf = blankPool(defenderId, kind, weapons)
  return {
    kind,
    weapons,
    dice: poolDiceCounts(state, weapons),
    keywords: [...new Set(weapons.flatMap((w) => weaponKeywordList(state, pf, w.weaponId).map((k) => k.id)))].sort(),
  }
}

export interface PoolOption {
  id: string
  kind: AttackKind
  weapons: PoolWeapon[]
  dice: Record<AttackColour, number>
  auto: boolean
}

/**
 * Candidate pools for the `attack.pool` decision: for each kind, everything (best weapon per model), and for each weapon
 * name the pool of only its users and the pool of everyone else, so a heavy weapon can be split off into its own pool.
 * Same-named weapons are never separated and a used weapon name is not offered again (R-12.3, R-12.4).
 */
export function poolOptions(state: GameState, attackerId: string, defenderId: string, opts: TargetOpts = {}): PoolOption[] {
  const check = checkTarget(state, attackerId, defenderId, opts)
  const out: PoolOption[] = []
  const seen = new Set<string>()
  for (const kind of check.kinds) {
    const cands = poolCandidates(state, attackerId, defenderId, kind, opts)
    if (cands.length === 0) continue
    const best: PoolWeapon[] = cands.map((c) => ({ miniId: c.miniId, weaponId: c.weapons[0]! }))
    const names = [...new Set(best.map((w) => w.weaponId))]
    const push = (id: string, weapons: PoolWeapon[]) => {
      if (weapons.length === 0) return
      const key = weapons.map((w) => `${w.miniId}=${w.weaponId}`).join(',')
      if (seen.has(`${kind}|${key}`)) return
      seen.add(`${kind}|${key}`)
      out.push({ id, kind, weapons, dice: poolDiceCounts(state, weapons), auto: false })
    }
    push(`pool:${kind}:all`, best)
    if (names.length > 1) {
      for (const n of names) push(`pool:${kind}:only:${n}`, best.filter((w) => w.weaponId === n))
      for (const n of names) push(`pool:${kind}:except:${n}`, best.filter((w) => w.weaponId !== n))
    }
  }
  // auto = the most damaging full pool
  let bestI = -1
  let bestV = -1
  out.forEach((o, i) => {
    if (!o.id.endsWith(':all')) return
    const v = o.weapons.reduce((s, w) => s + weaponValue(state, w.weaponId), 0)
    if (v > bestV) {
      bestV = v
      bestI = i
    }
  })
  if (bestI >= 0) out[bestI]!.auto = true
  return out
}

// ---------------------------------------------------------------------------
// Courage / suppression numbers
// ---------------------------------------------------------------------------

export { courageOf, courageSource, isPanicked, isSuppressed, suppressionState }

/** `query.rallyOdds`: distribution of tokens removed when `unit` rallies. */
export function rallyOdds(state: GameState, unitId: string) {
  const u = getUnit(state, unitId)
  const colour: DefenceColour = modValues(state, u, 'rallyDie').some((m) => m.op === 'set' && m.value === 'red') ? 'red' : 'white'
  const n = u.suppression
  const dist = defenceBlockDistribution(state.data.dice, colour, n, 'block')
  return { dice: n, colour, removedDist: dist, expectedRemoved: expectedOf(dist), pRemoveAll: dist[n] ?? 0 }
}

/** `query.panicOdds`: the panic state the unit is in and how many tokens separate it from the next state. */
export function panicOdds(state: GameState, unitId: string) {
  const u = getUnit(state, unitId)
  const src = courageSource(state, u)
  return {
    suppression: u.suppression,
    courage: src.courage,
    own: src.own,
    sourceUnitId: src.sourceUnitId,
    immune: src.immune,
    suppressed: isSuppressed(state, u),
    panicked: isPanicked(state, u),
    tokensToSuppressed: src.own === null ? null : Math.max(0, src.own - u.suppression),
    tokensToPanic: src.courage === null ? null : Math.max(0, 2 * src.courage - u.suppression),
  }
}

/** Keyword ids and data names of a unit (`query.keywordsOf`). */
export function keywordsOf(state: GameState, unitId: string) {
  const u = getUnit(state, unitId)
  return unitKeywords(state, u).map((k) => ({ id: k.id, name: String(state.data.keywords[k.id]?.name ?? k.id), x: k.x }))
}

export { rankKey, hasKeyword, keywordX, matchesUnitType, unitRank, unitDef, tokensOf, attackCtxOf, foldBool, poolAllHave, poolKeywordX, weaponKeywordList }

// ---------------------------------------------------------------------------
// Attack odds (exact)
// ---------------------------------------------------------------------------

export interface OddsOptions {
  /** Aim tokens the attacker will spend (default: all it holds) */
  aim?: number
  /** Dodge tokens the defender will spend (default: all it holds, up to the hits) */
  dodge?: number
  /** override the pool (default: the best full pool vs this defender) */
  weapons?: PoolWeapon[]
  kind?: AttackKind
}

export interface AttackOdds {
  dice: Record<AttackColour, number>
  kind: AttackKind
  /** P(at least one hit or crit after surge conversion) = suppression chance for ranged */
  pAnyHit: number
  pHits: number[]
  pCrits: number[]
  /** wounds dealt to the defending unit (before the model cap) */
  woundDist: number[]
  expectedWounds: number
  /** models killed distribution (index = models) after allocation and the ranged wound cap */
  killDist: number[]
  expectedKills: number
  pDefeat: number
  suppressionAdded: number
  cover: CoverValue
  explain: string[]
  exact: boolean
}

function convolve(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j]! += a[i]! * b[j]!
  return out
}

/**
 * Exact (hits, crits) distribution of an attack pool after surge conversion and Aim rerolls. Rerolls follow the engine's
 * `auto` policy: each Aim token rerolls up to `perAim` dice, worthless faces (blank, and surge when nothing converts it)
 * first, strongest colours first. The joint is computed by enumerating the unrerolled dice by colour.
 */
export function poolHitDistribution(
  tables: GameState['data']['dice'],
  colours: AttackColour[],
  surge: 'hit' | 'crit' | 'blank',
  rerolls: number,
  critSurges = 0,
): HitCritDist {
  if (rerolls <= 0 || colours.length === 0) return surgeAware(tables, colours, surge, critSurges)
  // state: counts of "bad" dice by colour (these are the ones a reroll would improve) + settled (hits, crits)
  const order: AttackColour[] = ['red', 'black', 'white']
  const sorted = [...colours].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  type S = { h: number; c: number; bad: Record<AttackColour, number> }
  const key = (s: S) => `${s.h}|${s.c}|${s.bad.red}|${s.bad.black}|${s.bad.white}`
  let states = new Map<string, { s: S; p: number }>([[key({ h: 0, c: 0, bad: { red: 0, black: 0, white: 0 } }), { s: { h: 0, c: 0, bad: { red: 0, black: 0, white: 0 } }, p: 1 }]])
  for (const col of sorted) {
    const faces = tables.attack[col]
    const next = new Map<string, { s: S; p: number }>()
    for (const { s, p } of states.values()) {
      for (const f of faces) {
        const eff = f === 'surge' ? (critSurges > 0 ? 'surge' : surge) : f
        const t: S = { h: s.h, c: s.c, bad: { ...s.bad } }
        if (eff === 'hit') t.h++
        else if (eff === 'crit') t.c++
        else t.bad[col]++
        const k = key(t)
        const cur = next.get(k)
        if (cur) cur.p += p / faces.length
        else next.set(k, { s: t, p: p / faces.length })
      }
    }
    states = next
  }
  const n = colours.length
  const out: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0))
  for (const { s, p } of states.values()) {
    let left = rerolls
    const rr: AttackColour[] = []
    for (const col of order) {
      const k = Math.min(left, s.bad[col])
      for (let i = 0; i < k; i++) rr.push(col)
      left -= k
    }
    const re = surgeAware(tables, rr, surge, critSurges)
    for (let h = 0; h <= rr.length; h++)
      for (let c = 0; c <= rr.length - h; c++) {
        const q = re.p[h]?.[c] ?? 0
        if (q > 0) out[s.h + h]![s.c + c]! += p * q
      }
  }
  return { dice: n, p: out }
}

function surgeAware(tables: GameState['data']['dice'], colours: AttackColour[], surge: 'hit' | 'crit' | 'blank', critSurges: number): HitCritDist {
  if (critSurges <= 0) return attackDistribution(tables, colours, surge)
  // Critical X: up to X surges become crits, the rest follow the chart; exact via counting surges
  const n = colours.length
  const out: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0))
  // enumerate surge count k by colour using a small DP over (hits, crits, surges)
  let st = new Map<string, number>([['0|0|0', 1]])
  for (const col of colours) {
    const faces = tables.attack[col]
    const nx = new Map<string, number>()
    for (const [k, p] of st) {
      const [h, c, s] = k.split('|').map(Number) as [number, number, number]
      for (const f of faces) {
        const key = `${h + (f === 'hit' ? 1 : 0)}|${c + (f === 'crit' ? 1 : 0)}|${s + (f === 'surge' ? 1 : 0)}`
        nx.set(key, (nx.get(key) ?? 0) + p / faces.length)
      }
    }
    st = nx
  }
  for (const [k, p] of st) {
    const [h, c, s] = k.split('|').map(Number) as [number, number, number]
    const toCrit = Math.min(critSurges, s)
    const rest = s - toCrit
    out[h + (surge === 'hit' ? rest : 0)]![c + toCrit + (surge === 'crit' ? rest : 0)]! += p
  }
  return { dice: n, p: out }
}

/** Models-killed mapping used by odds: allocate `w` wounds to a unit with the engine's automatic order, ranged cap applied. */
export function killsForWounds(state: GameState, defender: Unit, w: number, cap: number): number {
  let left = Math.min(w, cap)
  const minis = aliveMinis(defender).map((m) => ({ id: m.id, leader: m.id === defender.leaderId, w: m.wounds, max: m.maxWounds }))
  let kills = 0
  for (;;) {
    if (left <= 0 || minis.length === 0) break
    const wounded = minis.filter((m) => !m.leader && m.w > 0)
    const pool = wounded.length > 0 ? wounded : minis.filter((m) => !m.leader)
    const pick = pool.length > 0 ? pool.reduce((a, b) => (b.w > a.w ? b : a), pool[0]!) : minis[0]!
    const take = Math.min(left, pick.max - pick.w)
    left -= take
    pick.w += take
    if (pick.w >= pick.max) {
      kills++
      minis.splice(minis.indexOf(pick), 1)
      if (pick.leader && minis.length > 0) minis[0]!.leader = true
    }
  }
  return kills
}

/** `query.attackOdds`: exact odds for the best full pool of `attackerId` against `defenderId`. */
export function attackOdds(state: GameState, attackerId: string, defenderId: string, o: OddsOptions = {}): AttackOdds {
  const atk = getUnit(state, attackerId)
  const def = getUnit(state, defenderId)
  const check = checkTarget(state, attackerId, defenderId)
  const kind: AttackKind = o.kind ?? (check.kinds.includes('ranged') ? 'ranged' : 'melee')
  let weapons = o.weapons
  if (!weapons) {
    const cands = poolCandidates(state, attackerId, defenderId, kind)
    weapons = cands.map((c) => ({ miniId: c.miniId, weaponId: c.weapons[0]! }))
  }
  const explain: string[] = []
  const dice = poolDiceCounts(state, weapons)
  // a throw-away pool frame to read granted keywords the same way the attack step does
  const pf = blankPool(def.id, kind, weapons)
  // dice colours after the static shifts the attack step applies: Cumbersome (moved) downgrades, Sniper Team upgrades
  const ladder = state.data.dice.ladder.attack
  const step = (c: AttackColour, dir: 1 | -1): AttackColour => ladder[Math.min(ladder.length - 1, Math.max(0, ladder.indexOf(c) + dir))]!
  const moved = movedThisActivation(state, atk)
  const sniper = weapons.length > 0 && weapons.every((w) => (weaponDef(state, w.weaponId).keywords as { id: string }[] | undefined)?.some((k) => k.id === 'kw.sniper-team')) && !moved
  let exact = true
  const colours: AttackColour[] = []
  for (const w of weapons) {
    const wd = weaponDef(state, w.weaponId)
    const kws = (wd.keywords as { id: string }[] | undefined) ?? []
    const dc = weaponDiceCounts(state, w.weaponId)
    for (const c of ['red', 'black', 'white'] as const) {
      for (let i = 0; i < dc[c]; i++) {
        let col: AttackColour = c
        if (moved && kws.some((k) => k.id === 'kw.cumbersome')) col = step(col, -1)
        if (sniper) col = step(col, 1)
        colours.push(col)
      }
    }
  }
  if (poolKeywordX(state, pf, 'kw.assault') > 0) exact = false
  if (hasSaboteur(state, atk)) exact = false
  if (moved && colours.length > 0) explain.push('moved')
  if (sniper) explain.push('sniper')
  const surgeChart = (unitDef(state, atk).surge?.attack ?? null) as 'hit' | 'crit' | null
  const surge = surgeChart ?? 'blank'
  const critX = poolKeywordX(state, pf, 'kw.critical')
  const aimN = o.aim ?? tokensOf(atk, 'aim')
  const perAim = (constants(state)['aimRerollDice'] ?? 2) + keywordX(state, atk, 'kw.precise')
  const rerolls = aimN * perAim
  if (aimN > 0) explain.push(`aim:${aimN}x${perAim}`)
  const atkDist = poolHitDistribution(state.data.dice, colours, surge, rerolls, critX)
  // marginals
  const pHits: number[] = new Array<number>(colours.length + 1).fill(0)
  const pCrits: number[] = new Array<number>(colours.length + 1).fill(0)
  for (let h = 0; h <= colours.length; h++)
    for (let c = 0; c <= colours.length - h; c++) {
      const p = atkDist.p[h]?.[c] ?? 0
      pHits[h]! += p
      pCrits[c]! += p
    }
  const pAny = 1 - (atkDist.p[0]?.[0] ?? 0)
  // cover
  const verdict = kind === 'ranged' ? coverVerdict(state, atk, def) : null
  const cover: CoverValue = verdict ? verdict.level : 'none'
  const blast = !foldBool(true, modValues(state, atk, 'coverCancelsHits', { role: 'attacker', attack: { af: blankAttack(), pf, attacker: atk, defender: def } }))
  const lowProfile = modValues(state, def, 'coverPool', { role: 'defender' })
  const dodgeAllowed = !(poolAllHave(state, pf, 'kw.high-velocity'))
  const dodgeTokens = o.dodge ?? (dodgeAllowed ? tokensOf(def, 'dodge') : 0)
  const armor = keywordX(state, def, 'kw.armor')
  const impact = Math.min(poolKeywordX(state, pf, 'kw.impact'), Infinity)
  const pierce = unitPierceAllowed(state, def) ? poolKeywordX(state, pf, 'kw.pierce') : 0
  const defColour = (unitDef(state, def).defence ?? 'white') as DefenceColour
  const defChartBlock = unitDef(state, def).surge?.defence === 'block' || hasKeyword(state, def, 'kw.deflect') && kind === 'ranged'
  const surgeBlock = defChartBlock ? 'block' : 'blank'
  // joint over (hits, crits) then successive reductions
  let wound = new Array<number>(colours.length + 1).fill(0)
  const maxN = colours.length
  for (let h = 0; h <= maxN; h++) {
    for (let c = 0; c <= maxN - h; c++) {
      const p0 = atkDist.p[h]?.[c] ?? 0
      if (p0 === 0) continue
      // cover (ranged): cancel hits; distribution over cancelled count
      let hDist: number[] = new Array<number>(h + 1).fill(0)
      if (cover !== 'none' && !blast && h > 0) {
        const lp = lowProfile.some((m) => Number(m.value) < 0)
        const rolled = Math.max(0, h - (lp ? 1 : 0))
        const cd = coverDistribution(state.data.dice, rolled, cover)
        for (let k = 0; k < cd.length; k++) {
          const cancelled = Math.min(h, k + (lp ? 1 : 0))
          hDist[h - cancelled]! += cd[k]!
        }
      } else hDist[h] = 1
      for (let hh = 0; hh <= h; hh++) {
        const ph = hDist[hh] ?? 0
        if (ph === 0) continue
        // dodge cancels hits only
        const afterDodge = Math.max(0, hh - Math.min(dodgeTokens, hh))
        // impact (hits -> crits vs armor) then armor (cancel hits)
        let hits = afterDodge
        let crits = c
        if (armor > 0 && impact > 0) {
          const ch = Math.min(impact, hits)
          hits -= ch
          crits += ch
        }
        if (armor > 0) hits = Math.max(0, hits - armor)
        const backup = backupHits(state, atk, def, kind)
        hits = Math.max(0, hits - backup)
        const n = hits + crits
        const blocks = defenceBlockDistribution(state.data.dice, defColour, n, surgeBlock)
        for (let b = 0; b <= n; b++) {
          const eff = Math.max(0, b - pierce)
          const w = Math.max(0, n - eff)
          wound[w] = (wound[w] ?? 0) + p0 * ph * blocks[b]!
        }
      }
    }
  }
  wound = wound.map((x) => x)
  const expectedWounds = expectedOf(wound)
  // kills with the ranged cap
  const seen = kind === 'ranged' ? minisSeenByUnit(state, atk, def) : aliveMinis(def)
  const cap = seen.reduce((s, m) => s + m.maxWounds, 0)
  const total = aliveMinis(def).length
  const killDist = new Array<number>(total + 1).fill(0)
  for (let w = 0; w < wound.length; w++) killDist[Math.min(total, killsForWounds(state, def, w, cap))]! += wound[w]!
  const pDefeat = killDist[total] ?? 0
  const suppress = kind === 'ranged' && courageOf(state, def) !== null ? pAny * (1 - pDefeat) : 0
  return {
    dice,
    kind,
    pAnyHit: pAny,
    pHits,
    pCrits,
    woundDist: wound,
    expectedWounds,
    killDist,
    expectedKills: expectedOf(killDist),
    pDefeat,
    suppressionAdded: suppress,
    cover,
    explain,
    exact,
  }
}

function unitPierceAllowed(state: GameState, def: Unit): boolean {
  return foldBool(true, modValues(state, def, 'pierceAllowed', { role: 'defender' }))
}

/** Backup (R-14.6) hits cancelled for a ranged attack, 0 when it does not apply. */
export function backupHits(state: GameState, atk: Unit, def: Unit, kind: AttackKind): number {
  if (kind !== 'ranged') return 0
  const rank = unitRank(def)
  if (rank !== 'commander' && rank !== 'operative') return 0
  const c = constants(state)
  const d = distanceLeaderToUnit(state, atk, def)
  if (withinBand(d, c['backupAttackerMinRange'] ?? 2, c)) return 0
  if (!foldBool(true, modValues(state, def, 'canBackup', { role: 'defender' }))) return 0
  for (const o of unitsOnTable(state)) {
    if (o.seat !== def.seat || o.id === def.id || unitRank(o) !== 'corps' || isSuppressed(state, o)) continue
    if (!foldBool(true, modValues(state, o, 'canBackup', { role: null }))) continue
    const lead = miniLosBody(state, leaderOf(o))
    const ok = aliveMinis(def).some(
      (m) => distance(miniBody(state, m), miniBody(state, leaderOf(o))) <= (c['backupRange'] ?? 3) + 1e-9 && hasLos(state.table.def, miniLosBody(state, m), lead),
    )
    if (ok) return 2
  }
  return 0
}

/** The unit carries a Saboteur upgrade (grants Assault to its other ranged weapons): odds then ignore the dice upgrade. */
function hasSaboteur(state: GameState, atk: Unit): boolean {
  return atk.upgrades.some((id) => /saboteur/.test(id))
}

const MOVED_RE = /(^|\.)(move|climb|withdraw|deploy)$/

/** Did the unit move during its current activation (Cumbersome, Sniper Team)? A flag set by the flow also counts. */
export function movedThisActivation(state: GameState, unit: Unit): boolean {
  const cur = state.activation.current
  if (unit.flags['movedThisActivation']) return true
  return !!cur && cur.unitId === unit.id && cur.performed.some((p) => MOVED_RE.test(p.action))
}

export function blankPool(defenderId: string, kind: AttackKind, weapons: PoolWeapon[]): PoolFrame {
  return {
    defenderId,
    kind,
    weapons,
    step: 'start',
    windows: [],
    fired: [],
    granted: [],
    shifts: [],
    dice: [],
    spent: { attacker: {}, defender: {} },
    suppressFlag: false,
    cover: null,
    hits: 0,
    crits: 0,
    defColour: 'white',
    def: [],
    defChart: null,
    blocks: 0,
    wounds: 0,
    extraSuppression: 0,
    sniperEligible: false,
    sniperOffered: false,
    cancelled: false,
    woundsSuffered: 0,
    defeated: [],
    allocLeft: 0,
  }
}

export function blankAttack(): AttackFrame {
  return {
    resume: '',
    resumeData: {},
    free: false,
    rangedOnly: false,
    meleeOnly: false,
    forcedDefenderId: null,
    moved: false,
    rangeBonus: 0,
    longShotAsked: false,
    stage: 'defender',
    usedMinis: [],
    usedWeapons: [],
    pools: [],
    current: 0,
    woundsTaken: {},
  }
}

/** Defence odds: P(blocks) for the dice a defender would roll against `hitsIn` hits/crits. */
export function defenceOdds(state: GameState, defenderId: string, results: number, opts: { pierce?: number } = {}) {
  const def = getUnit(state, defenderId)
  const colour = (unitDef(state, def).defence ?? 'white') as DefenceColour
  const surge = unitDef(state, def).surge?.defence === 'block' ? 'block' : 'blank'
  const dist = defenceBlockDistribution(state.data.dice, colour, results, surge)
  const pierce = opts.pierce ?? 0
  const effective = new Array<number>(results + 1).fill(0)
  for (let b = 0; b <= results; b++) effective[Math.max(0, b - pierce)]! += dist[b]!
  return { dice: results, colour, blockDist: effective, expectedBlocks: expectedOf(effective) }
}

export { reduceHits, improveCover, EngineInvariantError }
export type { Seat, J }
