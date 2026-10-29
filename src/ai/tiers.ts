// AI tiers, tunable weights, the per-decision work budget, counters and the shared context type (docs/spec/40-ai.md sections 2, 4, 6).
// Difficulty is scoring noise plus how much of the board the planner looks at. `AI_MS` (default 60) maps to a deterministic
// work cap (units of engine calls: a line-of-sight test, an odds query, a tool validation) with a wall-clock hard stop at 4x the
// budget; `AI_TUNE` overrides weights as JSON (`{"threat":0.7}`) or `threat=0.7,dmg=1.1`.
import type { Action, GameState, PendingDecision, Seat, Vec2 } from '@/engine'

export type Tier = 'random' | 'easy' | 'normal'
export const TIER_IDS: readonly Tier[] = ['random', 'easy', 'normal']

export interface TierParams {
  /** choose uniformly among the candidates within `noise` of the best, at most `topK` of them (1 = always the best) */
  topK: number
  noise: number
  /** exact (engine-queried) end spots per move */
  spots: number
  /** tool targets proposed per move before the cheap ranking */
  samples: number
  /** weight on end-position exposure (0 disables the threat map) */
  threatScale: number
  /** score pairs of actions (move then attack, aim then attack, dodge after a move); false = best single action each time */
  lookahead: boolean
  /** weight on the mission's objectives (1 = full) */
  objectives: number
  /** use the command-card policy (false: highest priority card) */
  cards: boolean
}

export const TIERS: Record<Exclude<Tier, 'random'>, TierParams> = {
  easy: { topK: 3, noise: 0.6, spots: 3, samples: 12, threatScale: 0.4, lookahead: false, objectives: 0.5, cards: false },
  normal: { topK: 1, noise: 0, spots: 6, samples: 28, threatScale: 1, lookahead: true, objectives: 1, cards: true },
}

/** Weights are in points of army value (the points cost of a unit from data). */
export interface Weights {
  /** multiplier on the value of damage dealt (wounds, kills) */
  damage: number
  /** share of a unit's worth a suppression token is worth to the attacker */
  suppression: number
  /** multiplier on end-position exposure (expected loss before the next round) */
  threat: number
  /** points per victory point per remaining round for a marker held at the end spot */
  objective: number
  /** points per inch of progress toward the unit's goal */
  approach: number
  /** value of a friendly unit within cohesion support of the end spot */
  cohesion: number
  /** extra approach pressure per quiet round (a stall breaker) */
  patience: number
  /** value of one order (face-up order instead of a pool draw) in the command-card policy */
  order: number
  /** value of winning priority */
  priority: number
  /** value of a card with an effect that applies this round */
  effect: number
  /** discount on the value of tokens that only matter later in the round (aim for standby, dodge) */
  later: number
}

export const DEFAULT_WEIGHTS: Weights = {
  damage: 1,
  suppression: 0.07,
  threat: 0.55,
  objective: 14,
  approach: 0.9,
  cohesion: 1.5,
  patience: 0.25,
  order: 10,
  priority: 12,
  effect: 6,
  later: 0.5,
}

function envOf(name: string): string | undefined {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return p?.env?.[name]
}

function parseTune(text: string | undefined): Partial<Weights> {
  if (!text) return {}
  const out: Record<string, number> = {}
  try {
    const j = JSON.parse(text) as Record<string, unknown>
    for (const [k, v] of Object.entries(j)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    return out as Partial<Weights>
  } catch {
    for (const part of text.split(',')) {
      const [k, v] = part.split('=')
      const n = Number(v)
      if (k && Number.isFinite(n)) out[k.trim()] = n
    }
    return out as Partial<Weights>
  }
}

let weightsCache: Weights | null = null
/** Default weights with `AI_TUNE` applied (read once). */
export function tunedWeights(): Weights {
  if (!weightsCache) {
    const t = parseTune(envOf('AI_TUNE'))
    weightsCache = { ...DEFAULT_WEIGHTS }
    for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof Weights)[]) if (typeof t[k] === 'number') weightsCache[k] = t[k]!
  }
  return weightsCache
}

/** Per-decision budget in work units (about milliseconds): `AI_MS` or 60. */
export function aiBudgetMs(): number {
  const n = Number(envOf('AI_MS'))
  return Number.isFinite(n) && n > 0 ? n : 60
}

/** Work units per millisecond of budget; `AI_WORK` overrides it. */
export function workPerMs(): number {
  const n = Number(envOf('AI_WORK'))
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** Work-unit prices of the dear engine calls (roughly their cost in ms on a laptop). */
export const COST = { odds: 2.4, target: 0.7, los: 1.2, tool: 0.2, plan: 8 } as const

export interface Work {
  /** work units spent */
  n: number
  /** deterministic cap */
  cap: number
  /** wall-clock hard stop (performance.now units) */
  hardAt: number
  /** the hard stop fired (counts in the bench) */
  hard: boolean
  /** open-ground odds computed for the threat map: cached for the whole game, so their first computation has a larger cap of its own */
  typical: number
  typicalCap: number
}

export interface DecisionStats {
  n: number
  ms: number
  max: number
  fallbacks: number
}

/** Behaviour counters (docs/spec/40-ai.md section 6): what the AI chose, so a roster or rule it cannot play shows up as a zero. */
export interface Behaviour {
  /** activations (action.choose sequences) that ended with an action still on offer and nothing done */
  zeroAction: number
  activations: number
  /** `action.choose` answers by action id */
  actions: Record<string, number>
  /** activations started by a face-up order and by a pool draw */
  ordersUsed: number
  poolDraws: number
  /** command cards picked, by round */
  cardsByRound: Record<string, string[]>
  /** attacks declared, by round */
  attacksByRound: Record<string, number>
  /** claims taken and move/attack choices made for an objective */
  claims: number
  objectiveMoves: number
  /** standby responses answered, by response */
  standby: Record<string, number>
}

export interface AiStats {
  decisions: number
  ms: number
  maxMs: number
  /** a decision the policy could not answer (an unhandled kind, an invalid answer, a throw) and the engine suggestion answered */
  fallbacks: number
  /** decision kinds no policy knows, by kind (must stay empty) */
  unhandled: Record<string, number>
  /** policy failures: it threw or returned an answer the engine would refuse */
  errors: number
  hardStops: number
  /** decisions that spent their whole work cap (the plan was cut short) */
  capped: number
  workerTimeouts: number
  byKind: Record<string, DecisionStats>
  /** the decision times in ms (for p50 / p95) */
  samples: number[]
  behaviour: Behaviour
}

export function newBehaviour(): Behaviour {
  return { zeroAction: 0, activations: 0, actions: {}, ordersUsed: 0, poolDraws: 0, cardsByRound: {}, attacksByRound: {}, claims: 0, objectiveMoves: 0, standby: {} }
}

export function newStats(): AiStats {
  return { decisions: 0, ms: 0, maxMs: 0, fallbacks: 0, unhandled: {}, errors: 0, hardStops: 0, capped: 0, workerTimeouts: 0, byKind: {}, samples: [], behaviour: newBehaviour() }
}

/** The plan the activation in progress settled on (kept so the sub-decisions agree with it). */
export interface Intent {
  unitId: string
  round: number
  /** action ids that did not lead anywhere in this activation (a move with no legal tool, a cancelled attack) */
  banned: string[]
  /** the tool pose and leader spot chosen at the `move` action.choose, answered at the following `move.tool` */
  move: { kind: string; pose: unknown; leader: { x: number; z: number; yaw: number } } | null
  /** the attack target chosen at action.choose (answered at attack.defender when it is still offered) */
  target: string | null
  chosen: string | null
  /** action.choose decisions answered in this activation (a watchdog) */
  chooseCount: number
  /** an action was done in this activation */
  acted: boolean
  /** an action beyond `end` was on offer when the activation started */
  couldAct: boolean
}

export interface AiMemory {
  intent: Intent | null
  /** per-game caches that survive across decisions: typical-engagement values by key */
  typical: Map<string, number>
  /** exact attack odds by shot signature (null: not attackable) */
  exact: Map<string, import('@/engine/query').AttackOdds | null>
  /** round of the last wound or point seen (the stall breaker) */
  lastEventRound: number
  woundsSeen: number
  pointsSeen: number
  stats: AiStats
}

export function newMemory(): AiMemory {
  return { intent: null, typical: new Map(), exact: new Map(), lastEventRound: 1, woundsSeen: 0, pointsSeen: 0, stats: newStats() }
}

/** What every policy sees. `view` is the redacted PlayerView read through the engine's GameState helpers. */
export interface AiCtx {
  tier: Tier
  params: TierParams
  w: Weights
  seat: Seat
  view: GameState
  pending: PendingDecision
  legal: Action[] | null
  seed: string
  /** uniform float in [0, 1) from the seeded stream of this decision */
  rand(): number
  /** uniform integer in [0, n) */
  int(n: number): number
  memory: AiMemory
  work: Work
  now(): number
  /** values cached for the lifetime of this decision */
  cache: Map<string, unknown>
}

export function clock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** Spend `units` of the work cap; false once the cap or the wall-clock hard stop is reached. */
export function spend(ctx: AiCtx, units = 1): boolean {
  if (ctx.work.n >= ctx.work.cap) return false
  if (ctx.now() > ctx.work.hardAt) {
    ctx.work.hard = true
    return false
  }
  ctx.work.n += units
  return true
}

/** Spend from the threat-map allowance (cheap to repeat: the results are cached for the game). */
export function spendTypical(ctx: AiCtx, units: number): boolean {
  if (ctx.work.typical >= ctx.work.typicalCap) return false
  if (ctx.now() > ctx.work.hardAt) {
    ctx.work.hard = true
    return false
  }
  ctx.work.typical += units
  return true
}

/** The work cap is reached (or time is up) without spending anything. */
export function exhausted(ctx: AiCtx): boolean {
  if (ctx.work.n >= ctx.work.cap) return true
  if (ctx.now() > ctx.work.hardAt) {
    ctx.work.hard = true
    return true
  }
  return false
}

/** `AI_TRACE=1` prints the scored candidates of every action.choose decision (node only). */
export function tracing(): boolean {
  return !!envOf('AI_TRACE')
}

export type { Vec2 }
