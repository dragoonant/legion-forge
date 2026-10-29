// The ledger: what the end screen needs that the redacted event list cannot give. It records, from the UNREDACTED events of each
// accepted step, every score by card and round, every unit lost, and every hidden decision (command picks and order-pool draws) of
// each seat, so the human can audit the AI after the battle. It is saved with the game, so a continued battle keeps its history.
// Pure TS: the store feeds it, the end screen reads it, tests drive it directly.
import type { GameEvent, GameState, Seat } from '@/engine'

export type LedgerEntry =
  | { t: 'pick'; round: number; seat: Seat; cardId: string }
  | { t: 'draw'; round: number; seat: Seat; rank: string }
  | { t: 'score'; round: number; seat: Seat; amount: number; reason: string }
  | { t: 'lost'; round: number; seat: Seat; unitId: string; typeId: string }

export interface Ledger {
  /** the round the battle is in (0 during set-up) */
  round: number
  entries: LedgerEntry[]
}

export const emptyLedger = (): Ledger => ({ round: 0, entries: [] })

/** Fold one step's unredacted events into the ledger. `state` is the state after the step (to name the lost unit's side and type). */
export function recordLedger(prev: Ledger, events: readonly GameEvent[], state: Pick<GameState, 'units'>): Ledger {
  let round = prev.round
  let entries: LedgerEntry[] | null = null
  const push = (e: LedgerEntry) => {
    entries ??= prev.entries.slice()
    entries.push(e)
  }
  for (const ev of events) {
    switch (ev.type) {
      case 'RoundStarted':
        round = ev.round
        break
      case 'CommandCardPicked':
        if (typeof ev.cardId === 'string') push({ t: 'pick', round: round || 1, seat: ev.seat, cardId: ev.cardId })
        break
      case 'PoolTokenDrawn':
        if (typeof ev.rank === 'string') push({ t: 'draw', round, seat: ev.seat, rank: ev.rank })
        break
      case 'PointsScored':
        push({ t: 'score', round, seat: ev.seat, amount: ev.amount, reason: ev.reason })
        break
      case 'UnitDefeated': {
        const u = state.units[ev.unitId]
        if (u) push({ t: 'lost', round, seat: u.seat, unitId: ev.unitId, typeId: u.unitTypeId })
        break
      }
      default:
        break
    }
  }
  return entries || round !== prev.round ? { round, entries: entries ?? prev.entries } : prev
}

export interface VpRow {
  /** the card behind the points (battle card id), or the raw reason when it names none */
  card: string
  /** per round, per seat */
  byRound: Record<number, Record<Seat, number>>
  total: Record<Seat, number>
}

/** Victory points grouped by card, then round and seat. Order: first scored first. */
export function vpByCard(l: Ledger): VpRow[] {
  const rows = new Map<string, VpRow>()
  for (const e of l.entries) {
    if (e.t !== 'score') continue
    const card = e.reason.split(':')[0] ?? e.reason
    let row = rows.get(card)
    if (!row) {
      row = { card, byRound: {}, total: { A: 0, B: 0 } }
      rows.set(card, row)
    }
    const r = (row.byRound[e.round] ??= { A: 0, B: 0 })
    r[e.seat] += e.amount
    row.total[e.seat] += e.amount
  }
  return [...rows.values()]
}

export function roundsScored(l: Ledger): number[] {
  return [...new Set(l.entries.filter((e) => e.t === 'score').map((e) => e.round))].sort((a, b) => a - b)
}

export function unitsLost(l: Ledger, seat: Seat): { round: number; unitId: string; typeId: string }[] {
  return l.entries.filter((e): e is Extract<LedgerEntry, { t: 'lost' }> => e.t === 'lost' && e.seat === seat).map((e) => ({ round: e.round, unitId: e.unitId, typeId: e.typeId }))
}

export interface SeatReveal {
  seat: Seat
  rounds: { round: number; pick: string | null; draws: string[] }[]
}

/** Every hidden decision of `seat`, round by round: the command card it picked and the order tokens it drew from the pool in order. */
export function hiddenDecisions(l: Ledger, seat: Seat): SeatReveal {
  const byRound = new Map<number, { round: number; pick: string | null; draws: string[] }>()
  const at = (round: number) => {
    let r = byRound.get(round)
    if (!r) {
      r = { round, pick: null, draws: [] }
      byRound.set(round, r)
    }
    return r
  }
  for (const e of l.entries) {
    if (e.seat !== seat) continue
    if (e.t === 'pick') at(e.round).pick = e.cardId
    else if (e.t === 'draw') at(e.round).draws.push(e.rank)
  }
  return { seat, rounds: [...byRound.values()].sort((a, b) => a.round - b.round) }
}

/** Keep a saved ledger honest: drop anything that is not an entry of the known shape. */
export function parseLedger(raw: unknown): Ledger {
  if (!raw || typeof raw !== 'object') return emptyLedger()
  const r = raw as { round?: unknown; entries?: unknown }
  const seat = (v: unknown): v is Seat => v === 'A' || v === 'B'
  const entries: LedgerEntry[] = []
  if (Array.isArray(r.entries)) {
    for (const e of r.entries as Record<string, unknown>[]) {
      if (!e || !seat(e.seat) || typeof e.round !== 'number') continue
      if (e.t === 'pick' && typeof e.cardId === 'string') entries.push({ t: 'pick', round: e.round, seat: e.seat, cardId: e.cardId })
      else if (e.t === 'draw' && typeof e.rank === 'string') entries.push({ t: 'draw', round: e.round, seat: e.seat, rank: e.rank })
      else if (e.t === 'score' && typeof e.amount === 'number' && typeof e.reason === 'string') entries.push({ t: 'score', round: e.round, seat: e.seat, amount: e.amount, reason: e.reason })
      else if (e.t === 'lost' && typeof e.unitId === 'string' && typeof e.typeId === 'string') entries.push({ t: 'lost', round: e.round, seat: e.seat, unitId: e.unitId, typeId: e.typeId })
    }
  }
  return { round: typeof r.round === 'number' ? r.round : 0, entries }
}
