// BTL battle.*: Recon objectives and secondaries (docs/spec/11-battle.md), contesting and securing, assets, scoring,
// victory. Also the home of the flow machine's shared state accessors (`flowOf`, `bd`) and the suspendable timing-window
// helper every phase module uses.
//
// The scoring grammar of 20-data-schema section 9.3 is interpreted by shape (`count.tokens`, `count.units`,
// `count.compare`, `count.table`); a card whose rules use a shape this file does not know scores nothing and
// says so with an `ObjectiveChanged` event, never silently. Recon needs exactly the shapes handled here.
import type { BattleCardData, MapData } from '../data/types'
import { battleCardData, mapData, unitPoints } from './bundle'
import { markFired, registerCodeHook } from './code-hooks'
import { footprintGap2D, footprintInsideBounds, footprintInsidePolygon, footprintOverlapsPolygon, type Footprint } from './footprint'
import { pointInPolygon } from './geometry'
import { getWindowOpener } from './hooks'
import { hasLos, miniLosBody } from './los'
import { distance, miniBody, rangeBand } from './measure'
import { endGame, reject, type Ctx, type ModuleDef } from './registry'
import { constants, enemiesOf, EngineInvariantError, otherSeat, seatUnits, unitsOnTable, leaderOf } from './state'
import { piecesOverlapping } from './table'
import type {
  Action,
  BattleData,
  FlowState,
  GameState,
  ObjectiveMarker,
  PendingDecision,
  Polygon,
  Seat,
  TimingWindowId,
  Unit,
  Vec2,
} from './types'
import { isPanicked, isSuppressed } from './activation'

// ---------------------------------------------------------------------------
// Shared flow state
// ---------------------------------------------------------------------------

export function freshFlow(): FlowState {
  return {
    resume: null,
    opened: [],
    lastPass: { A: false, B: false },
    deadDraw: false,
    issueSeats: [],
    activations: 0,
    move: null,
    standby: null,
    deployTurn: null,
  }
}

/** The battle bookkeeping of `state.battle.data`; created on first use (setup writes it before anything reads it). */
export function bd(state: GameState): BattleData {
  const d = state.battle.data as unknown as Partial<BattleData>
  if (!d.flow) {
    Object.assign(d, {
      format: 'recon',
      edge: 'zMax',
      rotation: 0,
      territories: { A: [], B: [] },
      objective: '',
      secondary: '',
      advantage: { A: '', B: '' },
      wounds: {},
      destroyedThisPhase: {},
      caps: {},
      marks: {},
      picks: {},
      flow: freshFlow(),
    })
  }
  return d as BattleData
}

export function flowOf(state: GameState): FlowState {
  return bd(state).flow
}

export function blueOf(state: GameState): Seat {
  if (!state.battle.blue) throw new EngineInvariantError('the blue player is not decided yet')
  return state.battle.blue
}

export function colourOf(state: GameState, seat: Seat): 'blue' | 'red' {
  return blueOf(state) === seat ? 'blue' : 'red'
}

/** Blue first, then red (R-1.2 with no priority holder). */
export function blueFirst(state: GameState): Seat[] {
  const b = blueOf(state)
  return [b, otherSeat(b)]
}

/** The priority holder first when there is one, else blue first. */
export function priorityFirst(state: GameState): Seat[] {
  const p = state.command.priority
  return p ? [p, otherSeat(p)] : blueFirst(state)
}

// ---------------------------------------------------------------------------
// Timing windows that may suspend the flow
// ---------------------------------------------------------------------------

/**
 * Offer a timing window to the registered opener (commandCards / keywords). Returns true when the opener raised a decision:
 * the caller must stop, and whoever answers that decision calls `getFrameResume('flow')` to continue at `resume`. Each
 * `window|scope` is offered once, so a resumed step does not offer it again.
 */
export function openWindow(
  ctx: Ctx,
  window: TimingWindowId,
  info: { unitId?: string; targetId?: string },
  scope: string,
  resume: string,
): boolean {
  const flow = flowOf(ctx.state)
  const key = `${window}|${scope}`
  if (flow.opened.includes(key)) return false
  flow.opened.push(key)
  const opener = getWindowOpener()
  if (!opener) return false
  const raised = opener(ctx, window, { kind: 'other', unitId: info.unitId ?? '', ...(info.targetId ? { targetId: info.targetId } : {}) })
  if (raised) flow.resume = resume
  return raised
}

// ---------------------------------------------------------------------------
// Edges, rotation, territories (11-battle B-5)
// ---------------------------------------------------------------------------

export const EDGES = ['zMax', 'xMax', 'zMin', 'xMin'] as const
export type EdgeName = (typeof EDGES)[number]

export function oppositeEdge(e: string): EdgeName {
  return e === 'zMax' ? 'zMin' : e === 'zMin' ? 'zMax' : e === 'xMax' ? 'xMin' : 'xMax'
}

export function rotationOf(edge: string): number {
  return edge === 'zMax' ? 0 : edge === 'xMax' ? 90 : edge === 'zMin' ? 180 : 270
}

/** Canonical map frame (blue at +z) -> world for blue sitting on `edge`. */
export function rotatePoint(p: Vec2, edge: string): Vec2 {
  switch (edge) {
    case 'xMax':
      return { x: p.z, z: -p.x }
    case 'zMin':
      return { x: -p.x, z: -p.z }
    case 'xMin':
      return { x: -p.z, z: p.x }
    default:
      return { x: p.x, z: p.z }
  }
}

export function rotatePolygon(poly: Polygon, edge: string): Polygon {
  const out = poly.map((p) => rotatePoint(p, edge))
  // a rotation keeps winding; nothing to fix
  return out
}

export function edgeOfSeat(state: GameState, seat: Seat): EdgeName {
  const e = bd(state).edge as EdgeName
  return blueOf(state) === seat ? e : oppositeEdge(e)
}

/** The spans of the seat's table edge inside its allied Territory, with the inward normal (R-6.6). */
export function deploySpans(state: GameState, seat: Seat): { edge: { a: Vec2; b: Vec2 }; inward: Vec2 }[] {
  const e = edgeOfSeat(state, seat)
  const b = state.table.def.bounds
  const line = e === 'zMax' ? b.maxZ : e === 'zMin' ? b.minZ : e === 'xMax' ? b.maxX : b.minX
  const alongZ = e === 'xMax' || e === 'xMin'
  const inward: Vec2 = e === 'zMax' ? { x: 0, z: -1 } : e === 'zMin' ? { x: 0, z: 1 } : e === 'xMax' ? { x: -1, z: 0 } : { x: 1, z: 0 }
  const out: { edge: { a: Vec2; b: Vec2 }; inward: Vec2 }[] = []
  for (const poly of bd(state).territories[seat]) {
    const on = poly.filter((p) => Math.abs((alongZ ? p.x : p.z) - line) < 1e-6)
    if (on.length < 2) continue
    const vals = on.map((p) => (alongZ ? p.z : p.x))
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    out.push({ edge: alongZ ? { a: { x: line, z: lo }, b: { x: line, z: hi } } : { a: { x: lo, z: line }, b: { x: hi, z: line } }, inward })
  }
  return out
}

export function inAnyPolygon(p: Vec2, polys: readonly Polygon[]): boolean {
  return polys.some((poly) => pointInPolygon(p, poly))
}

/** The unit's leader base overlaps the seat's allied Territory ("in" a Territory, B-5.3). */
export function leaderInTerritory(state: GameState, unit: Unit, polys: readonly Polygon[]): boolean {
  const f = miniFootprint(state, leaderOf(unit))
  return polys.some((poly) => footprintOverlapsPolygon(f, poly))
}

function miniFootprint(state: GameState, m: Parameters<typeof miniBody>[1]): Footprint {
  return miniBody(state, m)
}

// ---------------------------------------------------------------------------
// Objective markers: contesting, securing, assets (R-18)
// ---------------------------------------------------------------------------

export function tokenRadius(state: GameState, kind: string): number {
  const t = state.data.tokens?.[kind === 'poi' ? 'core.token.poi' : kind === 'asset' ? 'core.token.asset' : 'core.token.advantage'] as { sizeIn?: number } | undefined
  return (t?.sizeIn ?? (kind === 'poi' ? 2 : 1)) / 2
}

export function markerFootprint(state: GameState, m: ObjectiveMarker): Footprint {
  return { pos: m.pos, baseRadius: tokenRadius(state, m.kind) }
}

export const labelOf = (m: ObjectiveMarker): string | null => m.tags.find((t) => t.startsWith('label:'))?.slice(6) ?? null
export const hasTag = (m: ObjectiveMarker, tag: string): boolean => m.tags.includes(tag)

/** Assets held by a unit (the card names the asset: 'Scanner'). */
export function heldAssets(state: GameState, unitId: string, asset?: string): ObjectiveMarker[] {
  return Object.values(state.table.objectives).filter((m) => m.kind === 'asset' && m.heldBy === unitId && (!asset || m.tags.includes(`asset:${asset}`)))
}

export function canContest(state: GameState, unit: Unit): boolean {
  if (unit.location !== 'table') return false
  if (!unit.minis.some((m) => m.alive && m.id === unit.leaderId)) return false
  if (unit.keywords.some((k) => k.id === 'kw.incognito')) return false
  return !isPanicked(state, unit)
}

/** A unit contests a token when its leader is within half range of it and it is not Panicked (R-18.3, B-6.2). */
export function contests(state: GameState, unit: Unit, m: ObjectiveMarker): boolean {
  if (!canContest(state, unit)) return false
  const gap = distance(miniBody(state, leaderOf(unit)), markerFootprint(state, m))
  return gap <= constants(state).halfRange + 1e-9
}

export function contestingUnits(state: GameState, m: ObjectiveMarker): Record<Seat, Unit[]> {
  const out: Record<Seat, Unit[]> = { A: [], B: [] }
  for (const u of unitsOnTable(state)) if (contests(state, u, m)) out[u.seat].push(u)
  return out
}

/** The player with more contesting units secures a token; a tie secures nothing (R-18.4). */
export function securedBy(state: GameState, m: ObjectiveMarker): Seat | null {
  if (m.kind !== 'poi') return null
  const c = contestingUnits(state, m)
  if (c.A.length === c.B.length) return null
  return c.A.length > c.B.length ? 'A' : 'B'
}

export function markersOf(state: GameState, kind: string): ObjectiveMarker[] {
  return Object.values(state.table.objectives)
    .filter((m) => m.kind === kind)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}

// ---------------------------------------------------------------------------
// Placement of tokens (R-18.5)
// ---------------------------------------------------------------------------

export type PlacementCheck = { ok: true } | { ok: false; reason: string }

/** May a token of `kind` be set down here? Not on impassable terrain, not partly over non-area terrain, not on height-2+ obstacles, not overlapping a model or a POI. */
export function checkObjectivePlacement(state: GameState, pos: Vec2, kind: string, ignoreId?: string): PlacementCheck {
  const f: Footprint = { pos, baseRadius: tokenRadius(state, kind) }
  if (!footprintInsideBounds(f, state.table.def.bounds)) return { ok: false, reason: 'off the table' }
  for (const p of piecesOverlapping(state.table.def, f)) {
    if (p.movement === 'impassable') return { ok: false, reason: `on impassable terrain (${p.id})` }
    if (p.kind !== 'area') {
      if (!footprintInsidePolygon(f, p.footprint)) return { ok: false, reason: `partly over ${p.id}` }
      if (p.heightBand >= 2) return { ok: false, reason: `on an obstacle of height ${p.heightBand} (${p.id})` }
    }
  }
  for (const u of unitsOnTable(state)) {
    for (const m of u.minis) {
      if (m.alive && footprintGap2D(f, miniBody(state, m)) < -1e-6) return { ok: false, reason: 'overlaps a model' }
      if (m.alive && Math.hypot(m.pos.x - pos.x, m.pos.z - pos.z) < f.baseRadius + miniBody(state, m).baseRadius - 1e-6) return { ok: false, reason: 'overlaps a model' }
    }
  }
  for (const o of Object.values(state.table.objectives)) {
    if (o.kind !== 'poi' || o.id === ignoreId) continue
    if (Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < f.baseRadius + tokenRadius(state, 'poi') - 1e-6) return { ok: false, reason: 'overlaps a point of interest' }
  }
  return { ok: true }
}

/** The closest legal spot to `near` within `maxDist` of it (dropped Assets, after setup: R-18.5, ruling Port choice). */
export function closestLegalSpot(state: GameState, near: Vec2, kind: string, maxDist: number, ignoreId?: string): Vec2 | null {
  if (checkObjectivePlacement(state, near, kind, ignoreId).ok) return { x: near.x, z: near.z }
  for (let r = 0.25; r <= maxDist + 1e-9; r += 0.25) {
    const steps = Math.max(8, Math.ceil((2 * Math.PI * r) / 0.35))
    for (let i = 0; i < steps; i++) {
      const a = (2 * Math.PI * i) / steps
      const p = { x: Math.round((near.x + Math.sin(a) * r) * 1000) / 1000, z: Math.round((near.z + Math.cos(a) * r) * 1000) / 1000 }
      if (checkObjectivePlacement(state, p, kind, ignoreId).ok) return p
    }
  }
  return null
}

/**
 * A unit drops every Asset it holds (it panics or is defeated, R-18.3). Call it before the leader is removed. The opponent
 * places each within half range of the leader; until a placement UI exists the engine puts it on the closest legal spot
 * (RULING Port choice). Returns the dropped marker ids.
 */
export function dropAssets(ctx: Ctx, unit: Unit): string[] {
  const dropped: string[] = []
  const leader = unit.minis.find((m) => m.id === unit.leaderId)
  for (const m of heldAssets(ctx.state, unit.id)) {
    const spot = leader ? closestLegalSpot(ctx.state, { x: leader.pos.x, z: leader.pos.z }, 'asset', constants(ctx.state).halfRange, m.id) : null
    m.heldBy = null
    if (spot) m.pos = spot
    ctx.emit({ type: 'ObjectiveChanged', objectiveId: m.id, detail: { dropped: true, by: unit.id, pos: m.pos } })
    dropped.push(m.id)
  }
  return dropped
}

// ---------------------------------------------------------------------------
// Card setup (B-1.7): maps, tokens, picks
// ---------------------------------------------------------------------------

const tokenKey = (id: string): string => id.replace(/^core\.token\./, '')
export { tokenKey }

function drawWithout<T>(ctx: Ctx, pool: T[], n: number, purpose: string): T[] {
  const rest = pool.slice()
  const out: T[] = []
  for (let i = 0; i < n && rest.length > 0; i++) out.push(rest.splice(ctx.draw(purpose, rest.length), 1)[0]!)
  return out
}

export function gainTokenOn(ctx: Ctx, unit: Unit, token: string, n = 1): void {
  const kind = tokenKey(token)
  const from = unit.tokens[kind] ?? 0
  const cap = (ctx.state.data.tokens?.[token] as { cap?: number } | undefined)?.cap
  const to = cap !== undefined ? Math.min(cap, from + n) : from + n
  if (to === from) return
  unit.tokens[kind] = to
  ctx.emit({ type: 'TokenChanged', unitId: unit.id, kind, from, to })
}

function placeMapTokens(ctx: Ctx, card: BattleCardData, label: string): void {
  const s = ctx.state
  const data = bd(s)
  const map: MapData = mapData(s.data, card.map!)
  for (const poi of map.pois) {
    const pos = rotatePoint(poi.at, data.edge)
    const id = `${poi.id}`
    s.table.objectives[id] = { id, pos: { x: Math.round(pos.x * 1000) / 1000, z: Math.round(pos.z * 1000) / 1000 }, tags: [`label:${label}`, ...poi.tags], kind: 'poi' }
    ctx.emit({ type: 'ObjectiveChanged', objectiveId: id, detail: { placed: true, label, pos: s.table.objectives[id]!.pos } }, null)
  }
}

/** Resolve one card's setup entries (blue first inside each entry). */
function resolveSetup(ctx: Ctx, card: BattleCardData): void {
  const s = ctx.state
  const data = bd(s)
  for (const entry of card.setup) {
    const e = entry as Record<string, any>
    if (e.placeFromMap) {
      placeMapTokens(ctx, card, String(e.placeFromMap.label))
    } else if (e.chooseUnits) {
      const c = e.chooseUnits as { count: number; from: string; of?: string; as?: string; grant?: { token?: string; asset?: string } }
      for (const seat of blueFirst(s)) {
        let pool: string[]
        if (c.from === 'opponentsPick') {
          const src = data.picks[c.of ?? ''] ?? []
          pool = src.filter((id) => s.units[id] && s.units[id]!.seat !== seat)
        } else {
          pool = seatUnits(s, seat).map((u) => u.id)
        }
        const chosen = drawWithout(ctx, pool, c.count, `chooseUnits:${card.id}`)
        if (c.as) data.picks[c.as] = [...(data.picks[c.as] ?? []), ...chosen]
        for (const id of chosen) {
          const u = s.units[id]!
          if (c.grant?.token) gainTokenOn(ctx, u, c.grant.token)
          if (c.grant?.asset) {
            const mid = `asset:${c.grant.asset}:${id}`
            s.table.objectives[mid] = { id: mid, pos: { x: u.minis[0]!.pos.x, z: u.minis[0]!.pos.z }, tags: [`asset:${c.grant.asset}`, `owner:${seat}`], heldBy: id, kind: 'asset' }
            ctx.emit({ type: 'ObjectiveChanged', objectiveId: mid, detail: { asset: c.grant.asset, heldBy: id, owner: seat } }, seat)
          }
        }
      }
    } else if (e.placeTerrain) {
      // Fortified Position: barricades need a terrain record that does not exist yet (RULING Unsourced); none are placed.
      ctx.emit({ type: 'ObjectiveChanged', objectiveId: card.id, detail: { skipped: 'placeTerrain', why: 'no barricade record in v1 data' } }, null)
    } else {
      ctx.emit({ type: 'ObjectiveChanged', objectiveId: card.id, detail: { skipped: Object.keys(e)[0] ?? 'unknown' } }, null)
    }
  }
}

/** Setup effects of the Objective, then the Secondary, then each Advantage, blue first (R-3.8, B-1.7). */
export function resolveCardSetup(ctx: Ctx): void {
  const s = ctx.state
  const data = bd(s)
  resolveSetup(ctx, battleCardData(s.data, data.objective))
  resolveSetup(ctx, battleCardData(s.data, data.secondary))
  for (const seat of blueFirst(s)) resolveSetup(ctx, battleCardData(s.data, data.advantage[seat]))
}

// ---------------------------------------------------------------------------
// Advantage cards at the start of the first Activation phase
// ---------------------------------------------------------------------------

export function onActivationPhaseStart(ctx: Ctx): void {
  const s = ctx.state
  const data = bd(s)
  for (const seat of blueFirst(s)) {
    const card = battleCardData(s.data, data.advantage[seat])
    for (const sp of card.special) {
      const t = sp as Record<string, any>
      if (!t.trigger || t.trigger.window !== 'activation.phaseStart') continue
      const r = t.when?.round as { min?: number; max?: number } | undefined
      if (r && ((r.min !== undefined && s.round < r.min) || (r.max !== undefined && s.round > r.max))) continue
      for (const verb of (t.do ?? []) as Record<string, any>[]) {
        if (verb.addPassToken) {
          const n = Number(verb.addPassToken.n ?? 1)
          s.players[seat].passTokens = (s.players[seat].passTokens ?? 0) + n
          ctx.emit({ type: 'PassTokensGranted', seat, n }, seat)
          ctx.emit({ type: 'CardEffect', cardId: card.id, detail: { passTokens: n } }, seat)
        } else if (verb.chooseUnits) {
          const c = verb.chooseUnits as { n: number; then?: Record<string, any>[] }
          const chosen = drawWithout(ctx, seatUnits(s, seat).map((u) => u.id), c.n, `chooseUnits:${card.id}`)
          for (const id of chosen) for (const th of c.then ?? []) if (th.gainToken) gainTokenOn(ctx, s.units[id]!, String(th.gainToken.token), Number(th.gainToken.n ?? 1))
          ctx.emit({ type: 'CardEffect', cardId: card.id, detail: { units: chosen } }, seat)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scoring (R-17.2, B-6.6)
// ---------------------------------------------------------------------------

type Rule = Record<string, any>

function capKey(card: BattleCardData, idx: number, seat: Seat, scope: string): string {
  return `${card.id}|${idx}|${seat}|${scope}`
}

/** VP a rule awards `seat` now, before caps. Unknown shapes award 0 (reported by the caller). */
function ruleVp(state: GameState, rule: Rule, seat: Seat, unit?: Unit): number | null {
  const count = rule.count as Record<string, any> | undefined
  if (!count) return null
  const vp = Number(rule.vp ?? 0)
  if (count.tokens) return vp * countTokens(state, count, seat)
  if (count.units) return vp * countUnits(state, count.units as Rule, seat, unit)
  if (count.compare) {
    const left = unitsFor(state, count.compare.left.units as Rule)
    const right = unitsFor(state, count.compare.right.units as Rule)
    const a = seatUnitsCount(state, left, seat)
    const b = seatUnitsCount(state, right, seat)
    return count.compare.op === '>' && a > b ? vp : 0
  }
  if (count.table) return 0 // event-driven (scoringTable)
  return null
}

function unitsFor(_state: GameState, r: Rule): Rule {
  return r
}

/** Count of units matching `{side, suppressed}` from `seat`'s point of view (side ally/enemy). */
function seatUnitsCount(state: GameState, r: Rule, seat: Seat): number {
  const who = r.side === 'enemy' ? otherSeat(seat) : seat
  return seatUnits(state, who).filter((u) => u.location === 'table' && (r.suppressed === undefined || isSuppressed(state, u) === r.suppressed)).length
}

function countTokens(state: GameState, count: Rule, seat: Seat): number {
  const filt = count.tokens as Rule
  const territory = count.territory as string | undefined
  const colour = colourOf(state, seat)
  if (count.state === 'destroyedThisPhase') {
    let n = 0
    for (const [, tags] of Object.entries(bd(state).destroyedThisPhase)) {
      if (filt.enemyOf === 'scorer' && !tags.includes(`enemyOf:${colour}`)) continue
      n++
    }
    return n
  }
  let n = 0
  for (const m of markersOf(state, 'poi')) {
    if (filt.label && labelOf(m) !== filt.label) continue
    if (filt.tag && !hasTag(m, String(filt.tag))) continue
    if (filt.notTag && hasTag(m, String(filt.notTag))) continue
    if (filt.enemyOf === 'scorer' && !hasTag(m, `enemyOf:${colour}`)) continue
    if (territory === 'notAllied' && inAnyPolygon(m.pos, bd(state).territories[seat])) continue
    const secured = securedBy(state, m) === seat
    let ok = count.state === 'secured' ? secured : false
    if (!ok && count.orContested?.byUnitsHolding) {
      const key = tokenKey(String(count.orContested.byUnitsHolding))
      ok = contestingUnits(state, m)[seat].some((u) => (u.tokens[key] ?? 0) > 0)
    }
    if (ok) n++
  }
  return n
}

function countUnits(state: GameState, r: Rule, seat: Seat, only?: Unit): number {
  const asset = r.holding as string | undefined
  const territories = bd(state).territories[seat]
  let holders = seatUnits(state, seat).filter((u) => u.location === 'table' && (!asset || heldAssets(state, u.id, asset).length > 0))
  if (only) holders = holders.filter((u) => u.id === only.id)
  if (r.leaderWithin) {
    const lw = r.leaderWithin as { range: number; los?: boolean; enemyUnitsMin: number }
    const ok = holders.filter((u) => enemiesInRangeAndLos(state, u, lw.range, lw.los !== false).length >= lw.enemyUnitsMin)
    return ok.length
  }
  if (r.contestingUnclaimed) {
    const want = String((r.contestingUnclaimed as Rule).asset)
    return holders.filter((u) =>
      Object.values(state.table.objectives).some(
        (m) => m.kind === 'asset' && !m.heldBy && m.tags.includes(`asset:${want}`) && m.tags.includes(`owner:${otherSeat(seat)}`) && contests(state, u, m),
      ),
    ).length
  }
  if (r.min !== undefined) {
    const qualifying = holders.filter((u) => {
      if (r.notIn === 'alliedTerritory' && leaderInTerritory(state, u, territories)) return false
      if (r.notContestingPoiIn === 'alliedTerritory') {
        for (const m of markersOf(state, 'poi')) if (inAnyPolygon(m.pos, territories) && contests(state, u, m)) return false
      }
      return true
    })
    return qualifying.length >= Number(r.min) ? 1 : 0
  }
  return holders.length
}

/** Enemy units whose closest model is within `range` bands of `unit`'s leader and (optionally) in the leader's LoS. */
export function enemiesInRangeAndLos(state: GameState, unit: Unit, range: number, los: boolean): Unit[] {
  const leader = leaderOf(unit)
  const c = constants(state)
  return enemiesOf(state, unit).filter((e) => {
    let near = false
    for (const m of e.minis) {
      if (!m.alive) continue
      const d = distance(miniBody(state, leader), miniBody(state, m))
      const band = rangeBand(d, c)
      if (band === 'beyond' || band > range) continue
      if (!los || hasLos(state.table.def, miniLosBody(state, leader), miniLosBody(state, m))) {
        near = true
        break
      }
    }
    return near
  })
}

function award(ctx: Ctx, seat: Seat, amount: number, reason: string): void {
  if (amount <= 0) return
  ctx.state.players[seat].points += amount
  ctx.emit({ type: 'PointsScored', seat, amount, reason }, seat)
}

/** Score the rules of `card` that fire at `at` (`end.scoring` or `activation.end`); `unit` limits unit rules to one unit. */
function scoreCard(ctx: Ctx, card: BattleCardData, at: string, unit?: Unit): void {
  const s = ctx.state
  const data = bd(s)
  card.scoring.forEach((rule, idx) => {
    const r = rule as Rule
    const when = typeof r.at === 'string' ? r.at : r.at?.window
    if (when !== at) return
    if (s.round < Number(r.fromRound ?? 1)) return
    const seats = unit ? [unit.seat] : priorityFirst(s)
    for (const seat of seats) {
      let vp = ruleVp(s, r, seat, unit)
      if (vp === null) {
        ctx.emit({ type: 'ObjectiveChanged', objectiveId: card.id, detail: { unscored: 'unknown scoring shape', rule: idx } }, seat)
        continue
      }
      const cap = r.cap as { perGame?: number; perRound?: number } | undefined
      if (cap && vp > 0) {
        const scope = cap.perGame !== undefined ? 'game' : `r${s.round}`
        const key = capKey(card, idx, seat, scope)
        const limit = cap.perGame ?? cap.perRound ?? Infinity
        const room = Math.max(0, limit - (data.caps[key] ?? 0))
        vp = Math.min(vp, room)
        data.caps[key] = (data.caps[key] ?? 0) + vp
      }
      award(ctx, seat, vp, card.id)
    }
  })
}

/** End phase step 2: the Objective card, then the Secondary card (R-17.2). */
export function scoreEndPhase(ctx: Ctx): void {
  const data = bd(ctx.state)
  scoreCard(ctx, battleCardData(ctx.state.data, data.objective), 'end.scoring')
  scoreCard(ctx, battleCardData(ctx.state.data, data.secondary), 'end.scoring')
}

/** A unit finished its activation: Recon Mission scoring and the Observation tokens its Scanner hands out (B-3.2). */
export function onActivationEnd(ctx: Ctx, unit: Unit): void {
  const s = ctx.state
  const data = bd(s)
  const card = battleCardData(s.data, data.secondary)
  scoreCard(ctx, card, 'activation.end', unit)
  for (const sp of card.special) {
    const t = sp as Rule
    if (t.trigger?.window !== 'activation.end' || !t.trigger.self) continue
    const holding = t.when?.holding as string | undefined
    if (holding && heldAssets(s, unit.id, holding).length === 0) continue
    if (unit.location !== 'table') continue
    for (const verb of (t.do ?? []) as Rule[]) {
      const g = verb.gainToken as Rule | undefined
      if (!g?.to?.aura) continue
      const a = g.to.aura as { range: number; requiresLos?: boolean }
      for (const e of enemiesInRangeAndLos(s, unit, a.range, a.requiresLos !== false)) gainTokenOn(ctx, e, String(g.token), Number(g.n ?? 1))
    }
  }
}

/**
 * Events of this step that score on their own (Bring Them to Heel's table): called by the flow after every resolved action,
 * so suppression gained inside an attack is seen. Marking is optional on the card; the engine always takes a space that
 * qualifies, once per round per player, since it can only help (RULING Port choice).
 */
export function onStepEvents(ctx: Ctx): void {
  const s = ctx.state
  const data = bd(s)
  const card = battleCardData(s.data, data.secondary)
  card.scoring.forEach((rule, idx) => {
    const r = rule as Rule
    const table = r.count?.table as Rule | undefined
    if (!table || s.round < Number(r.fromRound ?? 1)) return
    for (const ev of ctx.events) {
      if (ev.type !== 'SuppressionChanged' || ev.to <= ev.from) continue
      const gained = s.units[ev.unitId]
      if (!gained) continue
      const seat = otherSeat(gained.seat)
      const capK = capKey(card, idx, seat, `r${s.round}`)
      if ((data.caps[capK] ?? 0) >= Number(table.perRound ?? 1)) continue
      for (const row of (table.rows ?? []) as Rule[]) {
        const mark = `${card.id}|${seat}|${row.condition}`
        if (data.marks[mark] !== undefined) continue
        if (!tableRowHolds(s, String(row.condition), seat)) continue
        data.marks[mark] = s.round
        data.caps[capK] = (data.caps[capK] ?? 0) + 1
        markFired('scoringTable')
        award(ctx, seat, Number(row.vp?.[colourOf(s, seat)] ?? 0), `${card.id}:${row.condition}`)
        break
      }
    }
  })
}

function tableRowHolds(state: GameState, condition: string, seat: Seat): boolean {
  const enemies = seatUnits(state, otherSeat(seat)).filter((u) => u.location === 'table')
  if (condition === 'enemyPanicked') return enemies.some((u) => isPanicked(state, u))
  if (condition === 'allEnemiesSuppressed') {
    const can = enemies.filter((u) => unitCourage(state, u) !== null)
    return can.length > 0 && can.every((u) => u.suppression >= 1)
  }
  return false
}

function unitCourage(state: GameState, u: Unit): number | null {
  const d = state.data.units[u.unitTypeId] as { courage?: number | null } | undefined
  return d?.courage ?? null
}

// ---------------------------------------------------------------------------
// End phase hooks of the Recon cards
// ---------------------------------------------------------------------------

/** Start of the End phase: Bunker Assault puts Wound tokens on enemy Bunkers (B-3.1), then destroyed ones leave. */
export function onEndPhaseStart(ctx: Ctx): void {
  const s = ctx.state
  const data = bd(s)
  data.destroyedThisPhase = {}
  const card = battleCardData(s.data, data.objective)
  for (const sp of card.special) {
    const code = sp as { code?: string; params?: Rule }
    if (code.code !== 'bunkerAssault') continue
    const p = code.params ?? {}
    if (s.round < Number(p.fromRound ?? 2)) continue
    const bonus = (p.bonusRanks as string[] | undefined) ?? []
    for (const seat of blueFirst(s)) {
      const colour = colourOf(s, seat)
      for (const m of markersOf(s, 'poi')) {
        if (!hasTag(m, `enemyOf:${colour}`) || labelOf(m) !== 'Bunker') continue
        if (securedBy(s, m) !== seat) continue
        const c = contestingUnits(s, m)[seat]
        const n = 1 + (c.some((u) => bonus.includes(u.rank)) ? 1 : 0)
        data.wounds[m.id] = (data.wounds[m.id] ?? 0) + n
        markFired('bunkerAssault')
        ctx.emit({ type: 'ObjectiveChanged', objectiveId: m.id, detail: { wounds: data.wounds[m.id], added: n, by: seat } }, seat)
        if (data.wounds[m.id]! >= Number(p.woundsToDestroy ?? 3)) {
          data.destroyedThisPhase[m.id] = m.tags.slice()
          delete s.table.objectives[m.id]
          ctx.emit({ type: 'ObjectiveChanged', objectiveId: m.id, detail: { destroyed: true } }, seat)
        }
      }
    }
  }
}

/** End of the End phase: Intercept Signals lets a player securing a Comms Tower give Intel to up to 2 of their units contesting it. */
export function onEndPhaseEnd(ctx: Ctx): void {
  const s = ctx.state
  const data = bd(s)
  const card = battleCardData(s.data, data.objective)
  for (const sp of card.special) {
    const t = sp as Rule
    if (t.trigger?.window !== 'end.end') continue
    const cap = 2
    for (const seat of blueFirst(s)) {
      const holding = () => seatUnits(s, seat).filter((u) => (u.tokens.intel ?? 0) > 0).length
      let given = 0
      for (const m of markersOf(s, 'poi')) {
        if (securedBy(s, m) !== seat) continue
        for (const u of contestingUnits(s, m)[seat]) {
          if (given >= 2 || holding() >= cap) break
          if ((u.tokens.intel ?? 0) > 0) continue
          gainTokenOn(ctx, u, 'core.token.intel')
          given++
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Victory (R-2.2)
// ---------------------------------------------------------------------------

/** Points of the seat's own defeated units (tiebreak), upgrades included. */
export function defeatedPoints(state: GameState, seat: Seat): number {
  return Object.values(state.units)
    .filter((u) => u.seat === seat && u.location === 'defeated')
    .reduce((n, u) => n + unitPoints(state, u.id), 0)
}

/** (a) At any moment, only one player still has undefeated units: that player wins at once. Returns true when the game ended. */
export function checkWipeout(ctx: Ctx): boolean {
  const s = ctx.state
  if (s.phase === 'ended' || Object.keys(s.units).length === 0) return false
  const alive: Record<Seat, number> = { A: seatUnits(s, 'A').length, B: seatUnits(s, 'B').length }
  if (alive.A > 0 && alive.B > 0) return false
  const winner: Seat | 'draw' = alive.A === 0 && alive.B === 0 ? 'draw' : alive.A > 0 ? 'A' : 'B'
  endGame(ctx, 'battle', undefined, { winner })
  return true
}

/** (b) At the end of an End phase a player with 12+ VP and strictly more than the other wins. */
export function checkInstantWin(ctx: Ctx): boolean {
  const s = ctx.state
  const need = Number((s.data.formats?.[bd(s).format] as { instantWinVp?: number } | undefined)?.instantWinVp ?? 12)
  const a = s.players.A.points
  const b = s.players.B.points
  const leader: Seat | null = a > b ? 'A' : b > a ? 'B' : null
  if (!leader || s.players[leader].points < need) return false
  endGame(ctx, 'battle', undefined, { winner: leader })
  return true
}

/** (c) After the last round: more VP wins; equal VP, the player whose own defeated units are worth fewer points; else a draw. */
export function finishAtRoundLimit(ctx: Ctx): void {
  const s = ctx.state
  const a = s.players.A.points
  const b = s.players.B.points
  let winner: Seat | 'draw'
  if (a !== b) winner = a > b ? 'A' : 'B'
  else {
    const da = defeatedPoints(s, 'A')
    const db = defeatedPoints(s, 'B')
    winner = da === db ? 'draw' : da < db ? 'A' : 'B'
  }
  endGame(ctx, 'roundLimit', undefined, { winner })
}

// ---------------------------------------------------------------------------
// Code hooks of the Recon deck (each fires in a real game: tests/engine/flow)
// ---------------------------------------------------------------------------

registerCodeHook({
  name: 'bunkerAssault',
  kind: 'battle',
  params: (p) => (p && typeof p.woundsToDestroy === 'number' ? null : 'bunkerAssault needs params.woundsToDestroy'),
  install() {
    /* applied directly by battle.ts onEndPhaseStart */
  },
})
registerCodeHook({
  name: 'scoringTable',
  kind: 'battle',
  params: () => null,
  install() {
    /* applied directly by battle.ts onStepEvents */
  },
})

// ---------------------------------------------------------------------------
// The battle namespace module: battle.place (tokens placed by a player) and confirm
// ---------------------------------------------------------------------------

export const battleModule: ModuleDef = {
  id: 'battle',
  namespaces: ['battle', 'confirm'],
  handle(state: GameState, action: Action, pending: PendingDecision) {
    if (action.type === 'battle.place') {
      const kind = String(pending.context.markerKind ?? 'asset')
      const check = checkObjectivePlacement(state, { x: action.payload.x, z: action.payload.z }, kind, pending.context.markerId as string | undefined)
      if (!check.ok) return reject('E_TERRAIN', check.reason)
      const id = String(pending.context.markerId ?? '')
      return {
        run(ctx) {
          const m = ctx.state.table.objectives[id]
          if (m) {
            m.pos = { x: action.payload.x, z: action.payload.z }
            ctx.emit({ type: 'ObjectiveChanged', objectiveId: id, detail: { placed: true, pos: m.pos } })
          }
        },
      }
    }
    return reject('E_TODO', `${action.type} is not raised in Recon`)
  },
}
