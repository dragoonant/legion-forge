// One AI match: two deciders play a seeded Recon game through the engine while we count what the AI bench reports (rejections,
// stalls, decision time, activations that did nothing, decisions answered by the fallback) and the behaviour counters of
// docs/spec/40-ai.md section 6, read from the engine's events so they do not depend on the AI's own bookkeeping. The game loop
// here is, like the sim and the client store, a caller of `step`.
import { createGame, legalActions, step, view, type Action, type EngineBundle, type GameEvent, type GameSetup, type GameState, type Seat } from '../src/engine'
import type { AiDecider } from '../src/ai/decider'

export interface SeatStats {
  decisions: number
  ms: number
  maxMs: number
  fallbacks: number
  rejections: number
  /** units activated and activations that ended having used no action */
  activations: number
  emptyActivations: number
  /** the AI's own count: ended at the first menu with an action on offer */
  zeroAction: number
  /** action.choose answers by action id */
  actions: Record<string, number>
}

export interface Behaviour {
  /** aim, dodge, standby tokens gained, spent in an activation, and expired at the End phase */
  tokens: Record<'aim' | 'dodge' | 'standby', { gained: number; spent: number; expired: number }>
  attacks: number
  attackWounds: number
  attacksByRound: Record<string, number>
  claims: number
  /** victory points by reason prefix */
  points: Record<string, number>
  ordersUsed: number
  poolDraws: number
  unitsDefeated: number
  suppressionGained: number
  panics: number
  standbyTriggers: number
  /** a unit's leader moved into base contact (R-16.1), and melee pools built */
  charges: number
  meleeContacts: number
  meleePools: number
  cards: Record<string, string[]>
}

export interface MatchResult {
  seed: string
  ended: boolean
  winner: Seat | 'draw' | null
  reason: string | null
  points: Record<Seat, number>
  /** points of own units defeated at the end (the engine's tie-break) */
  decisions: number
  rounds: number
  stalled: boolean
  seats: Record<Seat, SeatStats>
  behaviour: Record<Seat, Behaviour>
  firstRejection: string | null
  kinds: Record<string, number>
  ms: number
}

const MAX_DECISIONS = 6000
const STALL_LIMIT = 250

function progressKey(s: GameState): string {
  const a = s.activation.current
  const p = s.pending
  let tokens = 0
  for (const u of Object.values(s.units)) tokens += u.suppression * 7 + (u.tokens.aim ?? 0) * 3 + (u.tokens.dodge ?? 0) * 5 + (u.order.state === 'spent' ? 11 : 0) + (u.location === 'table' ? 13 : 0)
  return `${s.phase}|${s.round}|${p?.kind}|${p?.id}|${a ? `${a.unitId}:${a.actionsLeft}:${a.performed.length}` : '-'}|${s.players.A.points}-${s.players.B.points}|${tokens}`
}

const blankSeat = (): SeatStats => ({ decisions: 0, ms: 0, maxMs: 0, fallbacks: 0, rejections: 0, activations: 0, emptyActivations: 0, zeroAction: 0, actions: {} })
const blankBehaviour = (): Behaviour => ({
  tokens: { aim: { gained: 0, spent: 0, expired: 0 }, dodge: { gained: 0, spent: 0, expired: 0 }, standby: { gained: 0, spent: 0, expired: 0 } },
  attacks: 0,
  attackWounds: 0,
  attacksByRound: {},
  claims: 0,
  points: {},
  ordersUsed: 0,
  poolDraws: 0,
  unitsDefeated: 0,
  suppressionGained: 0,
  panics: 0,
  standbyTriggers: 0,
  charges: 0,
  meleeContacts: 0,
  meleePools: 0,
  cards: {},
})

function count(state: GameState, events: GameEvent[], b: Record<Seat, Behaviour>, seats: Record<Seat, SeatStats>): void {
  const seatOf = (unitId: string): Seat | null => state.units[unitId]?.seat ?? null
  for (const e of events) {
    switch (e.type) {
      case 'TokenChanged': {
        const seat = seatOf(e.unitId)
        if (!seat || !(e.kind in b[seat].tokens)) break
        const t = b[seat].tokens[e.kind as 'aim']
        if (e.to > e.from) t.gained += e.to - e.from
        else if (e.phase === 'end') t.expired += e.from - e.to
        else t.spent += e.from - e.to
        break
      }
      case 'AttackDeclared': {
        const seat = seatOf(e.attackerId)
        if (!seat) break
        b[seat].attacks++
        b[seat].attacksByRound[String(e.round)] = (b[seat].attacksByRound[String(e.round)] ?? 0) + 1
        break
      }
      case 'AttackEnded': {
        const seat = seatOf(e.attackerId)
        if (seat) b[seat].attackWounds += e.wounds
        break
      }
      case 'ActionResolved': {
        const seat = seatOf(e.unitId)
        if (seat && e.action === 'claim') b[seat].claims++
        break
      }
      case 'PointsScored':
        b[e.seat].points[e.reason.split(':')[0]!] = (b[e.seat].points[e.reason.split(':')[0]!] ?? 0) + e.amount
        break
      case 'UnitActivated': {
        const seat = seatOf(e.unitId)
        if (!seat) break
        seats[seat].activations++
        if (e.via === 'order') b[seat].ordersUsed++
        else b[seat].poolDraws++
        break
      }
      case 'ActivationEnded': {
        const seat = seatOf(e.unitId)
        if (seat && e.actionsUsed === 0) seats[seat].emptyActivations++
        break
      }
      case 'UnitDefeated': {
        const seat = seatOf(e.unitId)
        if (seat) b[seat].unitsDefeated++
        break
      }
      case 'SuppressionChanged': {
        const seat = seatOf(e.unitId)
        if (seat && e.to > e.from) b[seat].suppressionGained += e.to - e.from
        break
      }
      case 'UnitPanicked': {
        const seat = seatOf(e.unitId)
        if (seat) b[seat].panics++
        break
      }
      case 'StandbyTriggered': {
        const seat = seatOf(e.unitId)
        if (seat) b[seat].standbyTriggers++
        break
      }
      case 'MeleeContact': {
        const seat = seatOf(e.unitId)
        if (seat) b[seat].meleeContacts++
        break
      }
      case 'WeaponsAdded': {
        const seat = seatOf(e.attackerId)
        if (seat && e.kind === 'melee') b[seat].meleePools++
        break
      }
      case 'CommandCardsRevealed':
        for (const s of ['A', 'B'] as const) if (e.picks[s]) (b[s].cards[String(e.round)] ??= []).push(e.picks[s]!)
        break
      default:
        break
    }
  }
}

export function playMatch(setup: GameSetup, bundle: EngineBundle, seed: string, deciders: Record<Seat, AiDecider>): MatchResult {
  const t0 = Date.now()
  let state = createGame(setup, seed, bundle).state
  const seats: Record<Seat, SeatStats> = { A: blankSeat(), B: blankSeat() }
  const behaviour: Record<Seat, Behaviour> = { A: blankBehaviour(), B: blankBehaviour() }
  const kinds: Record<string, number> = {}
  let decisions = 0
  let stall = 0
  let stalled = false
  let lastKey = progressKey(state)
  let firstRejection: string | null = null
  // AI_CLONE=1 hands the decider a structured clone, as a Web Worker gets it (cold engine caches without interning)
  const clone = (process.env.AI_CLONE ? structuredClone : (x: unknown) => x) as <T>(x: T) => T
  game: while (state.pending && decisions < MAX_DECISIONS) {
    const pending = state.pending
    const owed: Seat[] = pending.seat === 'all' ? ['A', 'B'] : [pending.seat]
    for (const seat of owed) {
      if (!state.pending || state.pending.id !== pending.id) break
      const legal = legalActions(state, state.pending, seat)
      if (pending.seat === 'all' && legal && legal.length === 0) continue
      const d = deciders[seat]
      const st = seats[seat]
      let action: Action
      try {
        const r = d.decideSync(clone(view(state, seat)), clone(state.pending), clone(legal))
        action = r.action
        st.decisions++
        st.ms += r.ms
        st.maxMs = Math.max(st.maxMs, r.ms)
        if (r.fallback) st.fallbacks++
      } catch (e) {
        firstRejection ??= `decider threw on ${pending.kind}: ${(e as Error).stack?.split('\n').slice(0, 3).join(' | ')}`
        st.rejections++
        break game
      }
      decisions++
      kinds[pending.kind] = (kinds[pending.kind] ?? 0) + 1
      if (pending.kind === 'action.choose' && action.type === 'action.choose') {
        const key = action.payload.action.replace(/:.*/, '')
        st.actions[key] = (st.actions[key] ?? 0) + 1
      }
      let r
      try {
        r = step(state, action)
      } catch (e) {
        firstRejection ??= `engine threw on ${pending.kind} ${JSON.stringify(action.payload).slice(0, 120)}: ${(e as Error).message}`
        st.rejections++
        break game
      }
      if (r.rejection) {
        st.rejections++
        firstRejection ??= `${pending.kind} ${action.type}: ${r.rejection.code} ${r.rejection.reason} ${JSON.stringify(action.payload).slice(0, 200)}`
        // keep the game going with the first legal answer so one bug does not hide the rest
        const alt = legal?.find((a) => a.type !== 'pass') ?? legal?.[0]
        if (!alt) break game
        const r2 = step(state, alt)
        if (r2.rejection) break game
        count(state, r2.events, behaviour, seats)
        state = r2.state
      } else {
        count(state, r.events, behaviour, seats)
        // a Move whose leader ended in base contact with an enemy is a charge (R-16.1)
        if (action.type === 'move.tool' && pending.kind === 'move.tool') {
          const mover = pending.constraints?.unitId ? state.units[pending.constraints.unitId] : undefined
          const after = mover ? r.state.units[mover.id] : undefined
          if (mover && after && mover.seat === seat && mover.engagedWith.length === 0 && after.engagedWith.length > 0) behaviour[seat].charges++
        }
        state = r.state
      }
      const key = progressKey(state)
      stall = key === lastKey ? stall + 1 : 0
      lastKey = key
      if (stall >= STALL_LIMIT) {
        stalled = true
        break game
      }
    }
  }
  for (const s of ['A', 'B'] as const) seats[s].zeroAction = deciders[s].memory.stats.behaviour.zeroAction
  const res = state.result
  return {
    seed,
    ended: state.phase === 'ended',
    winner: res ? res.winner : null,
    reason: res ? res.reason : null,
    points: res ? res.points : { A: state.players.A.points, B: state.players.B.points },
    decisions,
    rounds: state.round,
    stalled,
    seats,
    behaviour,
    firstRejection,
    kinds,
    ms: Date.now() - t0,
  }
}
