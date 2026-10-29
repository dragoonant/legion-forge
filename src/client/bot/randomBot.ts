// The bots the store plays against. `RandomBot` is the M3 opponent: a random-legal bot with light weights that answers through the same
// decision path as a human (a ready-made legal action, or the engine's suggestion for the continuous kinds). The easy and normal tiers are
// the utility AI of src/ai, asked through its worker (`decideAsync`); `createBot` is the seam the store calls.
import { act, legalActions, suggest, SeededRng, type Action, type GameState, type PendingDecision, type Seat, type Vec2 } from '@/engine'
import { markersOf } from '@/engine/battle'
import { suggestToolToward } from '@/engine/movement'
import { flowOf } from '@/engine/battle'
import { createAiWorkerBot } from '@/ai'
import type { BotTier } from '../params'

const ACTION_WEIGHTS: Record<string, number> = { move: 4, climb: 1, withdraw: 2, attack: 4, aim: 1, dodge: 1, recover: 1.5, standby: 0.7, claim: 6, end: 0.15 }

export interface Bot {
  readonly tier: BotTier
  /** In-process answer (the store's watchdog and the fallback when the asynchronous one is refused). */
  decide(state: GameState, pending: PendingDecision, seat: Seat): Action
  /** The AI tiers think in a worker so a slow decision never blocks rendering; the random bot has none. */
  decideAsync?(state: GameState, pending: PendingDecision, seat: Seat): Promise<Action>
}

export class RandomBot implements Bot {
  readonly tier: BotTier = 'random'
  private readonly rng: SeededRng

  constructor(seed: string) {
    this.rng = SeededRng.fromSeed(`bot:${seed}`)
  }

  private int(n: number): number {
    return this.rng.int(n)
  }

  private float(): number {
    return this.rng.next32() / 0x100000000
  }

  decide(state: GameState, pending: PendingDecision, seat: Seat): Action {
    const legal = legalActions(state, pending, seat)
    if (legal && legal.length > 0) {
      switch (pending.kind) {
        case 'action.choose':
          return this.chooseAction(legal)
        case 'activation.standby':
          return this.float() < 0.5 ? (legal.find((a) => a.type === 'pass') ?? legal[0]!) : legal[this.int(legal.length)]!
        case 'activation.choose': {
          const draws = legal.filter((a) => a.type === 'activation.choose' && a.payload.drawPool)
          const rest = legal.filter((a) => !(a.type === 'activation.choose' && a.payload.drawPool) && a.type !== 'pass')
          const pass = legal.find((a) => a.type === 'pass')
          if (pass && this.float() < 0.2) return pass
          if (draws.length > 0 && (rest.length === 0 || this.float() < 0.4)) return draws[0]!
          const pool = rest.length > 0 ? rest : legal
          return pool[this.int(pool.length)]!
        }
        case 'attack.spend':
          // spend what helps most often; the engine lists the useful ones first
          return legal[this.float() < 0.6 ? 0 : this.int(legal.length)]!
        default:
          return legal[this.int(legal.length)]!
      }
    }
    if (pending.kind === 'move.tool') {
      const unitId = (pending.context.unitId as string | undefined) ?? flowOf(state).move?.unitId
      if (unitId) {
        const target = this.target(state)
        const a = suggestToolToward(state, pending, seat, unitId, target, true) ?? suggestToolToward(state, pending, seat, unitId, null, true)
        if (a) return a
      }
      if (pending.canPass) return act.pass(pending, seat)
    }
    const s = suggest(state, pending, seat)
    if (s) return s
    if (pending.canPass) return act.pass(pending, seat)
    throw new Error(`the bot cannot answer ${pending.kind}`)
  }

  /** Mostly a point of interest, sometimes a random point on the table. */
  private target(state: GameState): Vec2 | null {
    const pois = markersOf(state, 'poi')
    if (pois.length > 0 && this.float() < 0.75) {
      const m = pois[this.int(pois.length)]!
      return { x: m.pos.x + (this.float() - 0.5) * 3, z: m.pos.z + (this.float() - 0.5) * 3 }
    }
    const b = state.table.def.bounds
    return { x: b.minX + 3 + this.float() * (b.maxX - b.minX - 6), z: b.minZ + 3 + this.float() * (b.maxZ - b.minZ - 6) }
  }

  private chooseAction(legal: Action[]): Action {
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

/** The bot for a seat: the random bot, or the utility AI of that tier in a worker (`hard` plays as `normal` until it has its own tuning). */
export function createBot(tier: BotTier, seed: string): Bot {
  if (tier === 'random') return new RandomBot(seed)
  return createAiWorkerBot(tier === 'hard' ? 'normal' : tier, seed)
}
