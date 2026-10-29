// SET setup.*: army validation (R-3.2, R-3.3), the units, the blue player (R-3.6), the table edge, the Recon mission draw
// (B-1.6), card setup, Prepared Position deployment (R-3.9). Every other unit stays in reserve and enters on its first Move.
import {
  armyListData,
  battleCardData,
  cardData,
  formatData,
  unitData,
  upgradeData,
} from './bundle'
import {
  bd,
  blueFirst,
  deploySpans,
  EDGES,
  flowOf,
  gainTokenOn,
  resolveCardSetup,
  rotatePolygon,
  rotationOf,
  type EdgeName,
} from './battle'
import { beginRound } from './command'
import { makeAction } from './actions'
import { footprintInsidePolygon, type Footprint } from './footprint'
import { round3 } from './geometry'
import { miniBody } from './measure'
import { checkTroopers, planTroopers, worldFor } from './movement'
import { reject, type Ctx, type ModuleDef, type OptionInput } from './registry'
import { checkBasePlacement } from './tool'
import { EngineInvariantError, otherSeat, SEATS } from './state'
import type {
  Action,
  GameData,
  GameSetup,
  GameState,
  Mini,
  PendingDecision,
  Polygon,
  Pose2,
  RosterUnit,
  Seat,
  TrooperPlacement,
  Unit,
  Vec2,
} from './types'
import { mapData } from './bundle'

// ---------------------------------------------------------------------------
// Validation (createGame throws EngineInvariantError with these problems)
// ---------------------------------------------------------------------------

export const STANDING_ORDERS = 'neu.cc.standing-orders'

/** Army legality (R-3.2, R-3.3) against a format; problem strings name the limit that failed. Slot and restriction checks of upgrades live in src/data/roster (the army picker and validate:data). */
export function armyProblems(data: GameData, formatKey: string, army: GameSetup['armies'][Seat], label = 'army'): string[] {
  const out: string[] = []
  const fmt = formatData(data, formatKey)
  let total = 0
  const counts: Record<string, number> = {}
  const names: Record<string, number> = {}
  const ids: string[] = []
  for (const r of army.units) {
    const u = data.units[r.unit] ? unitData(data, r.unit) : null
    if (!u) {
      out.push(`${label}: unknown unit ${r.unit}`)
      continue
    }
    if (u.faction !== army.factionId) out.push(`${label}: ${u.id} belongs to ${u.faction}, not ${army.factionId}`)
    ids.push(u.id)
    total += u.points
    if (!u.keywords.some((k) => k.id === 'kw.detachment')) counts[u.rank] = (counts[u.rank] ?? 0) + 1
    if (u.unique) names[u.name] = (names[u.name] ?? 0) + 1
    if (new Set(r.upgrades).size !== r.upgrades.length) out.push(`${label}: ${u.id} takes the same upgrade twice`)
    for (const id of r.upgrades) {
      if (!data.upgrades[id]) {
        out.push(`${label}: unknown upgrade ${id}`)
        continue
      }
      const up = upgradeData(data, id)
      total += up.points
      if (up.unique) names[up.name] = (names[up.name] ?? 0) + 1
    }
  }
  for (const [name, n] of Object.entries(names)) if (n > 1) out.push(`${label}: unique name "${name}" appears ${n} times`)
  if (total > fmt.maxPoints) out.push(`${label}: ${total} points exceeds the ${fmt.name} limit of ${fmt.maxPoints}`)
  for (const [rank, [min, max]] of Object.entries(fmt.ranks)) {
    const n = counts[rank] ?? 0
    if (n < min || n > max) out.push(`${label}: ${n} ${rank} units, ${fmt.name} allows ${min}-${max}`)
  }
  // command hand (R-3.3)
  const hand = army.commandHand
  if (hand.length !== 7) out.push(`${label}: command hand has ${hand.length} cards, needs 7`)
  if (new Set(hand).size !== hand.length) out.push(`${label}: command hand has duplicate cards`)
  const pips: Record<number, number> = {}
  for (const id of hand) {
    if (!data.cards[id]) {
      out.push(`${label}: unknown command card ${id}`)
      continue
    }
    const c = cardData(data, id)
    pips[c.pips] = (pips[c.pips] ?? 0) + 1
    if (c.restriction) {
      const hits = c.restriction.units.filter((u) => ids.includes(u)).length
      const ok = c.restriction.op === 'or' ? hits >= 1 : hits === c.restriction.units.length
      if (!ok) out.push(`${label}: ${id} needs ${c.restriction.units.join(c.restriction.op === 'or' ? ' or ' : ' and ')} in the army`)
    }
  }
  for (const p of [1, 2, 3]) if ((pips[p] ?? 0) !== 2) out.push(`${label}: ${pips[p] ?? 0} cards of ${p} pips, needs 2`)
  if (!hand.includes(STANDING_ORDERS) || (pips[4] ?? 0) !== 1) out.push(`${label}: the hand needs Standing Orders`)
  return out
}

export function setupProblems(data: GameData, setup: GameSetup): string[] {
  const out: string[] = []
  const key = setup.format ?? 'recon'
  if (!data.formats?.[key]) return [`unknown format ${key}`]
  if (!formatData(data, key).playable) out.push(`format ${key} is not playable yet`)
  for (const seat of SEATS) out.push(...armyProblems(data, key, setup.armies[seat], `army ${seat}`))
  if ('cards' in setup.battle) for (const id of setup.battle.cards) if (!data.battleCards[id]) out.push(`unknown battle card ${id}`)
  return out
}

/** A setup for one of the pre-built army lists (the sim, the tests and the army picker's "play this list"). */
export function rosterFromList(data: GameData, listId: string): GameSetup['armies'][Seat] {
  const l = armyListData(data, listId)
  return { factionId: l.faction, listId: l.id, units: l.units.map((e) => ({ unit: e.unit, upgrades: [...e.upgrades] })), commandHand: [...l.commandHand] }
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export function buildUnit(data: GameData, seat: Seat, index: number, r: RosterUnit): Unit {
  const ud = unitData(data, r.unit)
  const id = r.id ?? `${seat}${index}`
  const minis: Mini[] = []
  const mk = (extra: Partial<Mini> = {}): Mini => {
    const m: Mini = {
      id: `${id}.${minis.length}`,
      isLeader: false,
      pos: { x: 0, y: 0, z: 0 },
      yaw: 0,
      baseSize: ud.base,
      wounds: 0,
      maxWounds: ud.wounds,
      alive: true,
      ...extra,
    }
    minis.push(m)
    return m
  }
  for (let i = 0; i < ud.minis; i++) mk()
  const keywords = ud.keywords.map((k) => ({ id: k.id, ...(k.x !== undefined ? { x: k.x } : {}), ...(k.param !== undefined ? { params: { param: k.param } } : {}) }))
  const flags: Record<string, unknown> = {}
  let leader: Mini | null = null
  for (const uid of r.upgrades) {
    const up = upgradeData(data, uid)
    for (const k of up.keywords ?? []) keywords.push({ id: k.id, ...(k.x !== undefined ? { x: k.x } : {}) })
    const a = up.addsMinis
    if (!a) continue
    for (let i = 0; i < a.count; i++) {
      const m = mk({ upgradeId: uid, ...(a.weapon ? { weaponId: a.weapon, weaponIds: [a.weapon] } : {}) })
      if (a.leader && !leader) leader = m
    }
    for (const k of a.persistent?.keywords ?? []) if (!keywords.some((x) => x.id === k.id)) keywords.push({ id: k.id, ...(k.x !== undefined ? { x: k.x } : {}) })
    for (const mod of a.persistent?.modifiers ?? []) if (mod.modifier === 'cohesionRange' && mod.op === 'set' && typeof mod.value === 'number') flags.cohesionRange = mod.value
  }
  const lead = leader ?? minis[0]!
  lead.isLeader = true
  return {
    id,
    seat,
    unitTypeId: ud.id,
    rank: ud.rank,
    minis,
    leaderId: lead.id,
    location: 'reserve',
    order: { state: 'none' },
    activated: false,
    suppression: 0,
    tokens: {},
    keywords,
    weapons: [...ud.weapons],
    upgrades: [...r.upgrades],
    engagedWith: [],
    flags,
  }
}

const hasKeyword = (u: Unit, id: string): boolean => u.keywords.some((k) => k.id === id)

/** Units placed in setup: Prepared Position (R-3.9). */
export function preparedUnits(state: GameState, seat: Seat): Unit[] {
  return Object.values(state.units)
    .filter((u) => u.seat === seat && u.location === 'reserve' && hasKeyword(u, 'kw.prepared-position'))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
}

// ---------------------------------------------------------------------------
// Blue player (R-3.6)
// ---------------------------------------------------------------------------

/** Recon: seat A rolls a red defence die; a block makes A blue (B-1.5). Standard: 4 black dice each, crits then hits then surges, reroll a full tie. */
export function rollBlue(ctx: Ctx, method: 'redDefenceDie' | 'fourBlackDice'): Seat {
  if (method === 'redDefenceDie') {
    const idx = ctx.roll('bluePlayer', 1, 'def:red')
    return ctx.state.data.dice.defence.red[idx[0]!] === 'block' ? 'A' : 'B'
  }
  const faces = ctx.state.data.dice.attack.black
  for (let attempt = 0; attempt < 20; attempt++) {
    const score = (seat: Seat) => {
      const names = ctx.roll(`bluePlayer:${seat}`, 4, 'atk:black').map((i) => faces[i]!)
      return [names.filter((f) => f === 'crit').length, names.filter((f) => f === 'hit').length, names.filter((f) => f === 'surge').length]
    }
    const a = score('A')
    const b = score('B')
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]! ? 'A' : 'B'
  }
  return 'A'
}

// ---------------------------------------------------------------------------
// Setup flow
// ---------------------------------------------------------------------------

function formatKey(state: GameState): string {
  return state.origin.setup.format ?? 'recon'
}

function startSetup(ctx: Ctx): void {
  const s = ctx.state
  const setup = s.origin.setup
  const problems = setupProblems(s.data, setup)
  if (problems.length > 0) throw new EngineInvariantError(`invalid setup: ${problems.join('; ')}`)
  const key = formatKey(s)
  const fmt = formatData(s.data, key)
  const d = bd(s)
  d.format = key
  for (const seat of SEATS) {
    setup.armies[seat].units.forEach((r, i) => {
      const u = buildUnit(s.data, seat, i, r)
      if (s.units[u.id]) throw new EngineInvariantError(`duplicate unit id ${u.id}`)
      s.units[u.id] = u
    })
  }
  // blue player
  if (setup.blue) {
    s.battle.blue = setup.blue
    ctx.emit({ type: 'BluePlayerDecided', blue: setup.blue, method: 'forced' }, null)
  } else {
    s.battle.blue = rollBlue(ctx, fmt.bluePlayer === 'redDefenceDie' ? 'redDefenceDie' : 'fourBlackDice')
    ctx.emit({ type: 'BluePlayerDecided', blue: s.battle.blue, method: fmt.bluePlayer === 'redDefenceDie' ? 'redDie' : 'blackDice' }, null)
  }
  const edges: EdgeName[] = fmt.edgeChoice === 'long' ? ['zMax', 'zMin'] : [...EDGES]
  if (setup.options?.autoBattle) return afterEdge(ctx, edges[ctx.draw('edge', edges.length)]!)
  const blue = s.battle.blue
  const options: OptionInput[] = edges.map((e) => ({ id: `edge:${e}`, labelKey: 'setup.edge', type: 'setup.battle', payload: { cardId: `edge:${e}` }, data: { edge: e, rotation: rotationOf(e) } }))
  options.push({ id: 'auto', labelKey: 'setup.battle.auto', type: 'setup.battle', payload: { auto: true } })
  ctx.raise({ kind: 'setup.battle', seat: blue, window: 'setup.*', context: { step: 'edge', blue }, options })
}

function chooseCards(ctx: Ctx): void {
  const s = ctx.state
  const d = bd(s)
  const key = formatKey(s)
  const pool = (type: string) =>
    Object.values(s.data.battleCards)
      .map((r) => r as unknown as { id: string; type: string; format: string })
      .filter((c) => c.format === key && c.type === type)
      .map((c) => c.id)
      .sort()
  const given = 'cards' in s.origin.setup.battle ? s.origin.setup.battle.cards.slice() : []
  const take = (type: string): string | null => {
    const i = given.findIndex((id) => battleCardData(s.data, id).type === type)
    return i >= 0 ? given.splice(i, 1)[0]! : null
  }
  const draw = (type: string, purpose: string, exclude: string[] = []): string => {
    const cards = pool(type).filter((c) => !exclude.includes(c))
    if (cards.length === 0) throw new EngineInvariantError(`no ${type} battle cards for format ${key}`)
    return cards[ctx.draw(purpose, cards.length)]!
  }
  d.objective = take('objective') ?? draw('objective', 'objective')
  d.secondary = take('secondary') ?? draw('secondary', 'secondary')
  const [first, second] = blueFirst(s)
  const advFirst = take('advantage') ?? draw('advantage', 'advantage')
  const advSecond = take('advantage') ?? draw('advantage', 'advantage', [advFirst])
  d.advantage = { [first!]: advFirst, [second!]: advSecond } as Record<Seat, string>
  s.battle.cards = [d.objective, d.secondary, d.advantage[first!], d.advantage[second!]]
  for (const id of s.battle.cards) ctx.emit({ type: 'BattleCardChosen', cardId: id }, null)
}

function afterEdge(ctx: Ctx, edge: EdgeName): void {
  const s = ctx.state
  const d = bd(s)
  d.edge = edge
  d.rotation = rotationOf(edge)
  ctx.emit({ type: 'EdgeChosen', edge, rotation: d.rotation }, s.battle.blue)
  chooseCards(ctx)
  const map = mapData(s.data, battleCardData(s.data, d.objective).map!)
  const blue = s.battle.blue!
  const territories = (polys: Polygon[]): Polygon[] => polys.map((p) => rotatePolygon(p, edge))
  d.territories = { [blue]: territories(map.territories.blue), [otherSeat(blue)]: territories(map.territories.red) } as Record<Seat, Polygon[]>
  resolveCardSetup(ctx)
  startDeployment(ctx)
}

// ---------------------------------------------------------------------------
// Prepared Position deployment (R-3.9)
// ---------------------------------------------------------------------------

function startDeployment(ctx: Ctx): void {
  const s = ctx.state
  const flow = flowOf(s)
  flow.deployTurn = blueFirst(s).find((seat) => preparedUnits(s, seat).length > 0) ?? null
  deployNext(ctx)
}

function deployNext(ctx: Ctx): void {
  const s = ctx.state
  const flow = flowOf(s)
  while (flow.deployTurn) {
    const seat = flow.deployTurn
    const units = preparedUnits(s, seat)
    if (units.length === 0) {
      const other = otherSeat(seat)
      flow.deployTurn = preparedUnits(s, other).length > 0 ? other : null
      continue
    }
    if (s.origin.setup.options?.autoDeploy) {
      const u = units[0]!
      const plan = suggestDeploy(s, seat, u.id)
      if (!plan) throw new EngineInvariantError(`no legal Prepared Position spot for ${u.id}`)
      placeDeployed(ctx, u, plan.leader, plan.troopers)
      flow.deployTurn = alternate(s, seat)
      continue
    }
    const regions = bd(s).territories[seat]
    ctx.raise({
      kind: 'setup.deploy',
      seat,
      window: 'setup.*',
      context: { unitIds: units.map((u) => u.id), regions, spans: deploySpans(s, seat) },
      constraints: { kind: 'deploy', unitId: units[0]!.id, region: regions[0]! },
    })
    return
  }
  beginRound(ctx, 1)
}

/** Alternate units, blue first: the other seat places next while it has any; otherwise the same seat continues. */
function alternate(state: GameState, seat: Seat): Seat | null {
  const other = otherSeat(seat)
  if (preparedUnits(state, other).length > 0) return other
  return preparedUnits(state, seat).length > 0 ? seat : null
}

function placeDeployed(ctx: Ctx, unit: Unit, leader: Pose2, troopers: (TrooperPlacement & { y?: number })[]): void {
  const lead = unit.minis.find((m) => m.id === unit.leaderId)!
  lead.pos = { x: round3(leader.x), y: 0, z: round3(leader.z) }
  lead.yaw = leader.yaw
  for (const p of troopers) {
    const m = unit.minis.find((x) => x.id === p.miniId)!
    m.pos = { x: p.x, y: p.y ?? 0, z: p.z }
    m.yaw = p.yaw
  }
  unit.location = 'table'
  ctx.emit({ type: 'UnitDeployed', unitId: unit.id, minis: unit.minis.filter((m) => m.alive).map((m) => ({ miniId: m.id, pos: { ...m.pos }, yaw: m.yaw })) }, unit.seat)
  if (hasKeyword(unit, 'kw.prepared-position')) gainTokenOn(ctx, unit, 'core.token.dodge')
}

interface DeployCheck {
  leader: Pose2
  troopers: (TrooperPlacement & { y: number; outOfCohesion: boolean })[]
}

function checkDeploy(state: GameState, seat: Seat, unit: Unit, leader: Pose2, troopers: readonly TrooperPlacement[] | undefined): { ok: true; plan: DeployCheck } | { ok: false; code: 'E_OUT_OF_RANGE' | 'E_TERRAIN' | 'E_OVERLAP' | 'E_COHESION' | 'E_SCHEMA' | 'E_ENGAGED'; reason: string } {
  if (![leader.x, leader.z, leader.yaw].every(Number.isFinite)) return { ok: false, code: 'E_SCHEMA', reason: 'malformed pose' }
  const regions = bd(state).territories[seat]
  const body = miniBody(state, unit.minis[0]!)
  const f: Footprint = { pos: { x: round3(leader.x), z: round3(leader.z) }, baseRadius: body.baseRadius }
  if (!regions.some((poly) => footprintInsidePolygon(f, poly))) return { ok: false, code: 'E_OUT_OF_RANGE', reason: 'the leader must lie completely inside the allied Territory' }
  const world = worldFor(state, seat, unit.id)
  const base = state.data.bases[unit.minis[0]!.baseSize]!
  const height = state.data.silhouettes[base.silhouette]!.height
  const placed = checkBasePlacement(world, f, { fromY: 0, silhouetteHeight: height, climb: false, canEngage: false, skipVertical: true })
  if (!placed.ok) return { ok: false, code: placed.code as 'E_TERRAIN', reason: placed.reason }
  const lp = { x: f.pos.x, y: placed.info.surface, z: f.pos.z }
  const lead = unit.minis.find((m) => m.id === unit.leaderId)!
  const saved = lead.pos
  lead.pos = lp
  try {
    if (troopers) {
      const c = checkTroopers(state, unit, troopers, { leader: lp, region: regions })
      if (!c.ok) return c
      return { ok: true, plan: { leader: { x: f.pos.x, z: f.pos.z, yaw: leader.yaw }, troopers: c.placements } }
    }
    const plan = planTroopers(state, unit, { leader: lp, region: regions })
    return { ok: true, plan: { leader: { x: f.pos.x, z: f.pos.z, yaw: leader.yaw }, troopers: plan.placements } }
  } catch (e) {
    if (e instanceof EngineInvariantError) return { ok: false, code: 'E_COHESION', reason: e.message }
    throw e
  } finally {
    lead.pos = saved
  }
}

/** The engine's Prepared Position spot: the legal leader spot nearest the table centre that leaves room for the unit inside the Territory. */
export function suggestDeploy(state: GameState, seat: Seat, unitId: string): { leader: Pose2; troopers: (TrooperPlacement & { y: number })[] } | null {
  const unit = state.units[unitId]!
  const regions = bd(state).territories[seat]
  const cands: Vec2[] = []
  for (const poly of regions) {
    const xs = poly.map((p) => p.x)
    const zs = poly.map((p) => p.z)
    for (let x = Math.min(...xs) + 1.5; x <= Math.max(...xs) - 1.5 + 1e-9; x += 1.5) {
      for (let z = Math.min(...zs) + 1.5; z <= Math.max(...zs) - 1.5 + 1e-9; z += 1.5) cands.push({ x: round3(x), z: round3(z) })
    }
  }
  cands.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.x - b.x || a.z - b.z)
  const span = deploySpans(state, seat)[0]
  const yaw = span ? Math.atan2(span.inward.x, span.inward.z) : 0
  for (const c of cands) {
    const r = checkDeploy(state, seat, unit, { x: c.x, z: c.z, yaw }, undefined)
    if (r.ok) return { leader: r.plan.leader, troopers: r.plan.troopers }
  }
  return null
}

// ---------------------------------------------------------------------------
// The setup module
// ---------------------------------------------------------------------------

export const setupModule: ModuleDef = {
  id: 'setup',
  namespaces: ['setup'],

  init: startSetup,

  handle(state: GameState, action: Action, _pending: PendingDecision) {
    if (action.type === 'setup.battle') {
      const { cardId, auto } = action.payload
      return {
        run(ctx) {
          const edges: EdgeName[] = formatData(ctx.state.data, formatKey(ctx.state)).edgeChoice === 'long' ? ['zMax', 'zMin'] : [...EDGES]
          const edge = auto ? edges[ctx.draw('edge', edges.length)]! : (cardId!.slice(5) as EdgeName)
          afterEdge(ctx, edge)
        },
      }
    }
    if (action.type === 'setup.deploy') {
      const { unitId, leader, troopers } = action.payload
      const seat = action.seat
      const unit = state.units[unitId]
      if (!unit || unit.seat !== seat || !preparedUnits(state, seat).some((u) => u.id === unitId)) return reject('E_INVALID_TARGET', 'that unit cannot be placed now')
      const c = checkDeploy(state, seat, unit, leader, troopers)
      if (!c.ok) return reject(c.code, c.reason)
      return {
        run(ctx) {
          placeDeployed(ctx, ctx.state.units[unitId]!, c.plan.leader, c.plan.troopers)
          flowOf(ctx.state).deployTurn = alternate(ctx.state, seat)
          deployNext(ctx)
        },
      }
    }
    return reject('E_WRONG_DECISION', `${action.type} is not a setup decision`)
  },

  suggest(state, pending, seat) {
    if (pending.kind !== 'setup.deploy') return null
    const ids = pending.context.unitIds as string[]
    const plan = suggestDeploy(state, seat, ids[0]!)
    if (!plan) return null
    return makeAction('setup.deploy', pending, { unitId: ids[0]!, leader: plan.leader, troopers: plan.troopers.map(({ miniId, x, z, yaw }) => ({ miniId, x, z, yaw })) }, seat)
  },
}
