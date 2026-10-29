// Headless simulation core (docs/spec/60-testing.md section 3): two random-legal bots play seeded games while the invariants
// below are checked after every step. This loop (like the client store) is the only caller of `step`. Attacks are real:
// ranged and melee pools, cover, wounds, suppression, panic, keywords, upgrade actions and command cards all run.
import {
  createGame,
  legalActions,
  redactEvents,
  replay,
  save,
  step,
  suggest,
  validate,
  view,
  SeededRng,
  act,
  type Action,
  type EngineBundle,
  type GameEvent,
  type GameSetup,
  type GameState,
  type PendingDecision,
  type Seat,
} from '../src/engine'
import { cohesionOf, suggestToolToward } from '../src/engine/movement'
import { markersOf } from '../src/engine/battle'
import { footprintOverlapsPolygon, type Footprint } from '../src/engine/footprint'
import { miniLosBody } from '../src/engine/los'
import { miniBody } from '../src/engine/measure'
import { checkCohesion } from '../src/engine/tool'
import { leaderOf } from '../src/engine/state'
import { canMoveIntoMelee } from '../src/engine/melee'

export interface Violation {
  rule: string
  message: string
  decision: number
}

export interface GameSummary {
  battle: string[]
  armies: Record<Seat, string>
  winner: Seat | 'draw' | null
  reason: string | null
  rounds: number
  points: Record<Seat, number>
  decisions: number
}

export interface GameReport {
  game: number
  seed: string
  ended: boolean
  decisions: number
  rounds: number
  rejections: number
  violations: Violation[]
  hashMismatch: boolean
  actions: Action[]
  stats: Record<string, number>
  summary: GameSummary
}

export interface SimReport {
  games: number
  completed: number
  decisions: number
  rejections: number
  violations: number
  failing: GameReport[]
  stats: Record<string, number>
  summaries: GameSummary[]
  ms: number
}

export const MAX_DECISIONS = 4000
export const STALL_LIMIT = 200

// ---------------------------------------------------------------------------
// Random-legal bot with light weights
// ---------------------------------------------------------------------------

const ACTION_WEIGHTS: Record<string, number> = { move: 4, climb: 1, withdraw: 2, attack: 3, aim: 1, dodge: 1, recover: 1.5, standby: 0.7, claim: 6, cardAction: 2, free: 4, end: 0.15 }

export class RandomBot {
  private readonly rng: SeededRng
  constructor(seed: string) {
    this.rng = SeededRng.fromSeed(`bot:${seed}`)
  }

  int(n: number): number {
    return this.rng.int(n)
  }

  float(): number {
    return this.rng.next32() / 0x100000000
  }

  decide(state: GameState, pending: PendingDecision, seat: Seat): Action {
    const legal = legalActions(state, pending, seat)
    if (legal) {
      if (pending.kind === 'action.choose') return this.choose(legal)
      if (pending.kind === 'activation.standby') return this.float() < 0.5 ? (legal.find((a) => a.type === 'pass') ?? legal[0]!) : legal[this.int(legal.length)]!
      if (pending.kind === 'activation.choose') {
        // keep the pool in play: draw about as often as a face-up order is used
        const draws = legal.filter((a) => a.type === 'activation.choose' && a.payload.drawPool)
        const rest = legal.filter((a) => !(a.type === 'activation.choose' && a.payload.drawPool) && a.type !== 'pass')
        const pass = legal.find((a) => a.type === 'pass')
        if (pass && this.float() < 0.3) return pass
        if (draws.length > 0 && (rest.length === 0 || this.float() < 0.4)) return draws[0]!
        const pool = rest.length > 0 ? rest : legal
        return pool[this.int(pool.length)]!
      }
      return legal[this.int(legal.length)]!
    }
    if (pending.kind === 'move.tool') {
      const frame = state.battle.data.flow as { move: { unitId: string } | null }
      const unitId = frame.move?.unitId
      if (unitId) {
        const target = this.chargeTarget(state, unitId) ?? this.target(state, seat)
        const a = suggestToolToward(state, pending, seat, unitId, target, true) ?? suggestToolToward(state, pending, seat, unitId, null, true)
        if (a) return a
      }
      if (pending.canPass) return act.pass(pending, seat)
    }
    const s = suggest(state, pending, seat)
    if (s) return s
    if (pending.canPass) return act.pass(pending, seat)
    throw new Error(`bot cannot answer ${pending.kind}`)
  }

  /**
   * A unit that may move into melee goes for the nearest enemy within a Move or two about half the time: the point where its
   * leader would stand touching the enemy leader, approached straight on (CRB p28). Null otherwise.
   */
  private chargeTarget(state: GameState, unitId: string): { x: number; z: number } | null {
    const u = state.units[unitId]
    if (!u || u.location !== 'table' || !canMoveIntoMelee(state, u) || this.float() >= 0.5) return null
    const lead = leaderOf(u)
    const lb = miniBody(state, lead)
    let best: { d: number; x: number; z: number; gap: number } | null = null
    for (const e of Object.values(state.units)) {
      if (e.seat === u.seat || e.location !== 'table') continue
      const el = leaderOf(e)
      const d = Math.hypot(el.pos.x - lead.pos.x, el.pos.z - lead.pos.z)
      if (d > 9 || (best && d >= best.d)) continue
      best = { d, x: el.pos.x, z: el.pos.z, gap: lb.baseRadius + miniBody(state, el).baseRadius + 0.0003 }
    }
    if (!best || best.d <= best.gap) return null
    const f = (best.d - best.gap) / best.d
    return { x: lead.pos.x + (best.x - lead.pos.x) * f, z: lead.pos.z + (best.z - lead.pos.z) * f }
  }

  /** Mostly a point of interest, sometimes a random point on the table. */
  private target(state: GameState, seat: Seat): { x: number; z: number } | null {
    void seat
    const pois = markersOf(state, 'poi')
    if (pois.length > 0 && this.float() < 0.75) {
      const m = pois[this.int(pois.length)]!
      return { x: m.pos.x + (this.float() - 0.5) * 3, z: m.pos.z + (this.float() - 0.5) * 3 }
    }
    const b = state.table.def.bounds
    return { x: b.minX + 3 + this.float() * (b.maxX - b.minX - 6), z: b.minZ + 3 + this.float() * (b.maxZ - b.minZ - 6) }
  }

  private choose(legal: Action[]): Action {
    const groups = new Map<string, Action[]>()
    for (const a of legal) {
      const key = a.type === 'action.choose' ? a.payload.action : a.type
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(a)
    }
    const keys = [...groups.keys()]
    const weights = keys.map((k) => ACTION_WEIGHTS[k] ?? 1)
    let roll = this.float() * weights.reduce((x, y) => x + y, 0)
    let pick = keys[keys.length - 1]!
    for (let i = 0; i < keys.length; i++) {
      roll -= weights[i]!
      if (roll < 0) {
        pick = keys[i]!
        break
      }
    }
    const list = groups.get(pick)!
    return list[this.int(list.length)]!
  }
}

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

function nonFinite(v: unknown, path: string, out: string[]): void {
  if (out.length > 0) return
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(path)
  } else if (Array.isArray(v)) v.forEach((x, i) => nonFinite(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) nonFinite(x, `${path}.${k}`, out)
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export function checkInvariants(prev: GameState, next: GameState, action: Action, events: GameEvent[]): string[] {
  const out: string[] = []
  const add = (rule: string, msg: string) => out.push(`${rule}: ${msg}`)

  const bad: string[] = []
  nonFinite({ units: next.units, players: next.players, table: next.table.objectives, battle: next.battle }, 'state', bad)
  if (bad.length) add('finite', `non-finite number at ${bad[0]}`)

  const midMove = next.pending && (next.pending.kind === 'move.troopers') ? (next.battle.data.flow as { move: { unitId: string } | null }).move?.unitId : undefined
  const b = next.table.def.bounds
  const bodies: { id: string; unit: string; f: Footprint }[] = []
  for (const u of Object.values(next.units)) {
    if (u.suppression < 0) add('suppression', `${u.id} has ${u.suppression} suppression`)
    for (const [k, v] of Object.entries(u.tokens)) if (!(v >= 0)) add('tokens', `${u.id} has ${v} ${k}`)
    if ((u.tokens.standby ?? 0) > 1) add('tokens', `${u.id} has ${u.tokens.standby} standby tokens`)
    if (u.location === 'defeated' && u.minis.some((m) => m.alive)) add('wounds', `defeated ${u.id} has live models`)
    if (!['none', 'faceUp', 'pool', 'spent'].includes(u.order.state)) add('order', `${u.id} order ${u.order.state}`)
    for (const m of u.minis) {
      if (m.wounds < 0 || m.wounds > m.maxWounds) add('wounds', `${m.id} has ${m.wounds}/${m.maxWounds}`)
      const prevUnit = prev.units[u.id]
      const prevMini = prevUnit?.minis.find((x) => x.id === m.id)
      if (prevMini && !prevMini.alive && m.alive) add('wounds', `${m.id} came back to life`)
    }
    if (u.location !== 'table' || u.id === midMove) continue
    for (const m of u.minis) {
      if (!m.alive) continue
      const f = miniBody(next, m)
      if (f.pos.x - f.baseRadius < b.minX - 1e-6 || f.pos.x + f.baseRadius > b.maxX + 1e-6 || f.pos.z - f.baseRadius < b.minZ - 1e-6 || f.pos.z + f.baseRadius > b.maxZ + 1e-6) add('SIM-007', `${m.id} is off the table`)
      for (const p of next.table.def.pieces) if (p.movement === 'impassable' && footprintOverlapsPolygon(f, p.footprint)) add('SIM-007', `${m.id} overlaps impassable ${p.id}`)
      bodies.push({ id: m.id, unit: u.id, f })
    }
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!
      const c = bodies[j]!
      if (Math.hypot(a.f.pos.x - c.f.pos.x, a.f.pos.z - c.f.pos.z) < a.f.baseRadius + c.f.baseRadius - 0.003) add('SIM-007', `${a.id} overlaps ${c.id}`)
    }
  }
  for (const m of markersOf(next, 'poi')) {
    for (const bd of bodies) if (Math.hypot(bd.f.pos.x - m.pos.x, bd.f.pos.z - m.pos.z) < bd.f.baseRadius + 1 - 0.003) add('OBJ-006', `${bd.id} overlaps POI ${m.id}`)
  }

  // cohesion after a move or placement (R-7.1), unless the model was flagged out of cohesion (R-7.2)
  for (const ev of events) {
    if (ev.type !== 'TroopersPlaced' && ev.type !== 'UnitDeployed') continue
    if (ev.type === 'UnitDeployed' && ev.minis.length > 1 && events.some((e) => e.type === 'TroopersPlaced' && e.unitId === ev.unitId)) continue
    const u = next.units[ev.unitId]!
    if (u.location !== 'table') continue
    const lead = leaderOf(u)
    const lb = miniLosBody(next, lead)
    for (const m of u.minis) {
      if (!m.alive || m.id === u.leaderId || m.outOfCohesion) continue
      const v = checkCohesion(next.table.def, { cohesionDistance: cohesionOf(next, u) }, lb, miniLosBody(next, m))
      if (!v.ok) add('COH', `${m.id} is out of cohesion with ${lead.id} (${v.failure}, ${v.distance}")`)
    }
  }

  // order tokens (60-testing: face-up + pool + spent = the seat's units) in the Activation phase
  if (next.phase === 'activation') {
    for (const seat of ['A', 'B'] as const) {
      const units = Object.values(next.units).filter((u) => u.seat === seat && u.location !== 'defeated')
      const withToken = units.filter((u) => u.order.state !== 'none')
      if (withToken.length !== units.length) add('ORDER', `seat ${seat}: ${units.length - withToken.length} units without an order token in the Activation phase`)
      const active = next.activation.current?.via === 'pool' ? next.activation.current.unitId : null
      const poolUnits = units.filter((u) => u.order.state === 'pool' && u.id !== active)
      const tokens = next.players[seat].pool.tokens
      const drawn = next.activation.drawn?.seat === seat ? 1 : 0
      if (tokens.length + drawn !== poolUnits.length) add('ORDER', `seat ${seat}: ${tokens.length} pool tokens (+${drawn} drawn) for ${poolUnits.length} units in the pool`)
      const rankOf = (xs: string[]) => [...xs].sort().join(',')
      const drawnRank = next.activation.drawn?.seat === seat ? [next.activation.drawn.rank] : []
      if (rankOf([...tokens, ...drawnRank]) !== rankOf(poolUnits.map((u) => u.rank))) add('ORDER', `seat ${seat}: pool token ranks differ from the units in the pool`)
    }
  }

  // the action ledger of the activation in progress
  const cur = next.activation.current
  if (cur) {
    const used = cur.performed.filter((p) => !p.free).length
    const extra = next.effects.filter((e) => e.kind === 'extraAction' && e.unitId === cur.unitId).reduce((n, e) => n + Number(e.data?.n ?? 1), 0)
    if (cur.actionsLeft < 0 || used + cur.actionsLeft > 2 + extra) add('ACT', `${cur.unitId}: ${used} spent with ${cur.actionsLeft} left`)
    const once = cur.performed.filter((p) => !['move', 'climb'].includes(p.action) && !p.action.includes('.act.') && !p.action.startsWith('free.')).map((p) => p.action)
    if (new Set(once).size !== once.length) add('ACT', `${cur.unitId} repeated an action: ${once.join(',')}`)
    if (cur.performed.some((p) => p.free && p.action !== 'claim' && !p.action.includes('.act.') && !p.action.startsWith('free.'))) add('ACT', `${cur.unitId} took a free action that was not granted`)
    const names = cur.performed.map((p) => p.action)
    if (names.includes('attack') && names.includes('standby')) add('ACT', `${cur.unitId} attacked and went on standby`)
  }

  // priority and the card ledger
  for (const ev of events) {
    if (ev.type === 'PriorityDecided') {
      const { A, B } = ev.pips
      if (A !== undefined && B !== undefined && A !== B) {
        if (ev.rolloff) add('CMD', 'a priority roll-off on unequal pips')
        if (ev.holder !== (A < B ? 'A' : 'B')) add('CMD', `priority went to ${ev.holder} with pips ${A}/${B}`)
      } else if (A !== undefined && B !== undefined && !ev.rolloff && !next.origin.setup.options?.firstPriority) add('CMD', 'equal pips without a roll-off')
    }
    if (ev.type === 'DiceRolled') {
      const faces = ev.die === 'd6' ? ['1', '2', '3', '4', '5', '6'] : ev.die.startsWith('atk') ? next.data.dice.attack[ev.die.slice(4) as 'red'] : next.data.dice.defence[ev.die.slice(4) as 'red']
      for (const f of ev.faces) if (!faces.includes(f)) add('dice', `face ${f} is not on ${ev.die}`)
    }
    if (ev.type === 'Drawn' && ev.purpose === 'orderPool') add('LEAK', 'a pool draw emitted a Drawn event (its index names the token)')
    if (ev.type === 'OrderIssued') {
      const u = next.units[ev.unitId]!
      if (u.order.state === 'none') add('CMD', `${u.id} was issued an order but holds none`)
    }
  }
  for (const seat of ['A', 'B'] as const) {
    const p = next.players[seat]
    if (new Set(p.played).size !== p.played.length) add('CMD', `seat ${seat} discarded a card twice`)
    if (p.played.some((c) => p.hand.includes(c))) add('CMD', `seat ${seat} has a discarded card in hand`)
    if (p.hand.length + p.played.length !== next.origin.setup.armies[seat].commandHand.length) add('CMD', `seat ${seat}: hand ${p.hand.length} + played ${p.played.length} is not the original hand`)
    if (p.points < prev.players[seat].points) add('SCORE', `seat ${seat} points fell`)
    if ((p.passTokens ?? 0) < 0) add('pass', `seat ${seat} has negative pass tokens`)
  }
  const scored = events.filter((e) => e.type === 'PointsScored')
  for (const seat of ['A', 'B'] as const) {
    const gained = scored.filter((e) => e.type === 'PointsScored' && e.seat === seat).reduce((n, e) => n + (e.type === 'PointsScored' ? e.amount : 0), 0)
    if (next.players[seat].points - prev.players[seat].points !== gained) add('SCORE', `seat ${seat}: points changed by ${next.players[seat].points - prev.players[seat].points}, events say ${gained}`)
  }

  if (next.seq !== prev.seq + 1) add('seq', `seq jumped from ${prev.seq} to ${next.seq}`)
  if (next.phase === 'ended') {
    if (next.pending) add('pending', 'a pending decision remains after the battle ended')
    if (!next.result) add('pending', 'the battle ended with no result')
    else {
      const r = next.result
      if (r.points.A !== next.players.A.points || r.points.B !== next.players.B.points) add('SCORE', 'the result points differ from the players')
    }
  } else if (!next.pending) {
    add('pending', 'no pending decision before the battle ended')
  } else {
    const p = next.pending
    const seats: Seat[] = p.seat === 'all' ? ['A', 'B'] : [p.seat]
    for (const seat of seats) {
      const legal = legalActions(next, p, seat)
      if (legal === null) {
        const sug = p.canPass && (p.kind === 'move.tool') ? null : suggest(next, p, seat)
        if (!p.canPass && !sug) add('SIM-001', `${p.kind} is continuous with no way to pass and no suggestion`)
        if (sug) {
          const rej = validate(next, sug)
          if (rej) add('SIM-001', `the suggestion for ${p.kind} fails validate: ${rej.code} ${rej.reason}`)
        }
      } else {
        const owes = p.seat !== 'all' || !((p.context.answered as Seat[] | undefined) ?? []).includes(seat)
        if (legal.length === 0 && owes) add('SIM-001', `${p.kind} has no legal action for ${seat}`)
        for (const l of legal) {
          const rej = validate(next, l)
          if (rej) add('SIM-001', `a listed action fails validate: ${l.type} ${rej.code} ${rej.reason}`)
        }
      }
    }
  }

  // leak test (00 section 3.2): hidden facts stay hidden in `view` and in redacted events
  if (next.phase !== 'ended') {
    for (const seat of ['A', 'B'] as const) {
      const v = view(next, seat)
      const other = seat === 'A' ? 'B' : 'A'
      if (!next.command.revealed && next.command.picks[other] !== undefined && !sameJson(v.command.picks[other], { hidden: true })) add('LEAK', `seat ${seat} sees the unrevealed pick of ${other}`)
      const pool = v.players[other].pool as unknown as Record<string, unknown>
      if ('tokens' in pool) add('LEAK', `seat ${seat} sees the pool order of ${other}`)
      if (next.activation.drawn && next.activation.drawn.seat === other && !sameJson(v.activation.drawn?.rank, { hidden: true })) add('LEAK', `seat ${seat} sees the token ${other} drew`)
      if ('rng' in v || 'log' in v || 'seed' in v || 'hash' in v) add('LEAK', 'view exposes rng, log, seed or hash')
      for (const e of redactEvents(events, seat)) {
        if (e.type === 'CommandCardPicked' && e.seat !== seat && !sameJson(e.cardId, { hidden: true })) add('LEAK', 'a redacted event shows the other seat\'s pick')
        if (e.type === 'PoolTokenDrawn' && e.seat !== seat && !sameJson(e.rank, { hidden: true })) add('LEAK', 'a redacted event shows the other seat\'s drawn token')
      }
    }
  }
  void action
  return out
}

/**
 * The differential leak check: whatever seat `a` picks, seat `b`'s view and redacted events before the reveal are byte-identical.
 * Run on the first answer of a simultaneous decision.
 */
function leakDifferential(state: GameState, pending: PendingDecision, seat: Seat, chosen: Action, legal: Action[]): string | null {
  if (pending.kind !== 'command.pick' || legal.length < 2) return null
  const alt = legal.find((l) => l.type === 'command.pick' && chosen.type === 'command.pick' && l.payload.cardId !== chosen.payload.cardId)
  if (!alt) return null
  const r1 = step(state, chosen)
  const r2 = step(state, alt)
  if (r1.rejection || r2.rejection || r1.state.command.revealed || r2.state.command.revealed) return null
  const other: Seat = seat === 'A' ? 'B' : 'A'
  if (!sameJson(view(r1.state, other), view(r2.state, other))) return `seat ${other}'s view depends on seat ${seat}'s hidden pick`
  if (!sameJson(redactEvents(r1.events, other), redactEvents(r2.events, other))) return `seat ${other}'s events depend on seat ${seat}'s hidden pick`
  return null
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

function progressKey(s: GameState): string {
  const a = s.activation.current
  const units = Object.values(s.units)
  const pos = units.map((u) => u.minis.map((m) => `${m.pos.x},${m.pos.z}`).join(';')).join('|')
  const tokens = units.map((u) => `${u.suppression}${JSON.stringify(u.tokens)}${u.order.state}${u.location}`).join('|')
  return `${s.phase}|${s.round}|${s.pending?.kind}|${a ? `${a.unitId}:${a.actionsLeft}:${a.performed.length}` : '-'}|${s.players.A.points}-${s.players.B.points}|${s.players.A.pool.tokens.length}-${s.players.B.pool.tokens.length}|${pos}|${tokens}|${Object.keys(s.command.picks).length}`
}

const bump = (stats: Record<string, number>, key: string, n = 1) => {
  stats[key] = (stats[key] ?? 0) + n
}

function countEvent(stats: Record<string, number>, ev: GameEvent): void {
  switch (ev.type) {
    case 'UnitMoved':
      bump(stats, 'moves')
      break
    case 'UnitDeployed':
      bump(stats, 'deployed')
      break
    case 'ActivationEnded':
      bump(stats, 'activations')
      break
    case 'PointsScored':
      bump(stats, `points:${ev.reason.split(':')[0]}`, ev.amount)
      break
    case 'ActionResolved':
      bump(stats, `action:${ev.action}`)
      break
    case 'Passed':
      bump(stats, ev.spentToken ? 'passes:token' : 'passes:auto')
      break
    case 'PoolTokenRemoved':
      bump(stats, `poolRemoved:${ev.reason}`)
      break
    case 'StandbyTriggered':
      bump(stats, 'standby')
      break
    case 'UnitPromoted':
      bump(stats, 'promotions')
      break
    case 'Rallied':
      bump(stats, 'rallies')
      break
    case 'AttackDeclared':
      bump(stats, 'attacks')
      break
    case 'AttackEnded':
      bump(stats, 'attacksEnded')
      bump(stats, 'attackWounds', ev.wounds)
      break
    case 'AttackSkipped':
      bump(stats, `attackSkipped:${ev.reason}`)
      break
    case 'WoundsAssigned':
      bump(stats, 'woundsAssigned', ev.wounds)
      break
    case 'WoundsSuffered':
      bump(stats, 'woundsSuffered', ev.n)
      break
    case 'MiniDefeated':
      bump(stats, 'minisDefeated')
      break
    case 'UnitDefeated':
      bump(stats, 'unitsDefeated')
      break
    case 'SuppressionChanged':
      if (ev.to > ev.from) bump(stats, 'suppressionGained', ev.to - ev.from)
      break
    case 'UnitPanicked':
      bump(stats, 'panics')
      break
    case 'MeleeContact':
      bump(stats, 'meleeContacts')
      break
    case 'WeaponsAdded':
      if (ev.kind === 'melee') bump(stats, 'meleePools')
      break
    case 'DodgeSpent':
      bump(stats, 'dodgesSpent', ev.cancelled)
      break
    case 'LeaderReplaced':
      bump(stats, 'leaderReplaced')
      break
    case 'KeywordFired':
      bump(stats, `keyword:${ev.keyword}`)
      bump(stats, 'keywordFires')
      break
    case 'CardEffect':
      bump(stats, 'cardEffects')
      break
    case 'DiceRolled':
      bump(stats, `dice:${ev.purpose.split(':')[0]}`, ev.faces.length)
      break
    default:
      break
  }
}

export function playGame(setup: GameSetup, bundle: EngineBundle, seed: string, game = 0, replayEvery = 1): GameReport {
  const violations: Violation[] = []
  const stats: Record<string, number> = {}
  const bots = { A: new RandomBot(`${seed}:A`), B: new RandomBot(`${seed}:B`) }
  const result = createGame(setup, seed, bundle)
  let state = result.state
  const hashes: string[] = [state.hash]
  let decisions = 0
  let rejections = 0
  let stall = 0
  let lastKey = progressKey(state)
  let hashMismatch = false
  const violate = (rule: string, message: string) => violations.push({ rule, message, decision: decisions })

  while (state.pending && decisions < MAX_DECISIONS && violations.length === 0) {
    const pending = state.pending
    const seats: Seat[] = pending.seat === 'all' ? ['A', 'B'] : [pending.seat]
    for (const seat of seats) {
      if (!state.pending || state.pending.id !== pending.id) break
      if (pending.seat === 'all') {
        const legalNow = legalActions(state, state.pending, seat)
        if (legalNow && legalNow.length === 0) continue
      }
      let action: Action
      try {
        action = bots[seat].decide(state, state.pending, seat)
      } catch (e) {
        violate('bot', (e as Error).message)
        break
      }
      if (pending.seat === 'all' && seat === seats[0]) {
        const legal = legalActions(state, state.pending, seat)
        const leak = legal ? leakDifferential(state, state.pending, seat, action, legal) : null
        if (leak) violate('LEAK', leak)
      }
      decisions++
      const prev = state
      let r
      try {
        r = step(state, action)
      } catch (e) {
        violate('SIM-002', `step threw: ${(e as Error).stack ?? (e as Error).message}`)
        break
      }
      if (r.rejection) {
        rejections++
        violate('bot-rejection', `${action.type}: ${r.rejection.code} ${r.rejection.reason}`)
        break
      }
      state = r.state
      hashes.push(state.hash)
      for (const ev of r.events) countEvent(stats, ev)
      for (const m of checkInvariants(prev, state, action, r.events)) violate('invariant', m)
      const key = progressKey(state)
      stall = key === lastKey ? stall + 1 : 0
      lastKey = key
      if (stall >= STALL_LIMIT) {
        violate('stall', `${STALL_LIMIT} decisions without progress at ${key.slice(0, 80)}`)
        break
      }
      if (violations.length > 5) break
    }
  }
  const ended = state.phase === 'ended'
  if (!ended && violations.length === 0) violate('SIM-003', `game did not end within ${MAX_DECISIONS} decisions (round ${state.round}, ${state.pending?.kind})`)

  // SIM-006: replay reproduces every hash; a save file survives JSON and replays to the same final hash
  if (violations.length === 0 && game % replayEvery === 0) {
    const rep = replay(setup, seed, state.log, bundle)
    if (rep.rejection || rep.hashes.length !== hashes.length || rep.hashes.some((h, i) => h !== hashes[i])) {
      hashMismatch = true
      violate('SIM-006', 'replay did not reproduce the recorded hashes')
    } else {
      const file = JSON.parse(JSON.stringify(save(state))) as ReturnType<typeof save>
      if (file.finalHash !== state.hash || file.actions.length !== state.log.length || rep.state.hash !== file.finalHash) violate('SIM-006', 'the save file does not reproduce the final hash')
    }
  }
  const winner = state.result?.winner ?? null
  const summary: GameSummary = {
    battle: state.battle.cards,
    armies: { A: state.players.A.armyId, B: state.players.B.armyId },
    winner,
    reason: state.result?.reason ?? null,
    rounds: state.round,
    points: { A: state.players.A.points, B: state.players.B.points },
    decisions,
  }
  return { game, seed, ended, decisions, rounds: state.round, rejections, violations, hashMismatch, actions: state.log, stats, summary }
}

export interface SimOptions {
  games: number
  seed: string
  setupFor: (game: number) => GameSetup
  bundle: EngineBundle
  /** replay-check every Nth game (default 1: every game) */
  replayEvery?: number
  onGame?: (r: GameReport) => void
}

export function runSim(opts: SimOptions): SimReport {
  const t0 = Date.now()
  const failing: GameReport[] = []
  const stats: Record<string, number> = {}
  const summaries: GameSummary[] = []
  let completed = 0
  let decisions = 0
  let rejections = 0
  let violations = 0
  for (let g = 0; g < opts.games; g++) {
    const r = playGame(opts.setupFor(g), opts.bundle, `${opts.seed}-${g}`, g, opts.replayEvery ?? 1)
    summaries.push(r.summary)
    if (r.ended && r.violations.length === 0) completed++
    decisions += r.decisions
    rejections += r.rejections
    violations += r.violations.length
    for (const [k, v] of Object.entries(r.stats)) bump(stats, k, v)
    if (r.violations.length > 0 || !r.ended) failing.push(r)
    opts.onGame?.(r)
  }
  return { games: opts.games, completed, decisions, rejections, violations, failing, stats, summaries, ms: Date.now() - t0 }
}
