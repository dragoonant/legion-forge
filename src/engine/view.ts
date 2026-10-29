// Per-seat redacted view (frozen after M2). Deciders only ever see a PlayerView (00 section 3.2). Hidden facts:
//  1. a seat's command pick until `CommandCardsRevealed` (`command.revealed`);
//  2. the order of each order pool (only the count per rank is shown);
//  3. a drawn pool token's rank for the seat that did not draw it, until its unit is picked.
// `rng`, `log`, `seed` and `hash` are removed: each determines hidden data (pool draws, picks in the action log).
// Everything else is open information: army lists, remaining command cards, tokens, wounds, suppression.
import { poolCounts } from './state'
import type { GameEvent } from './events'
import type { GameState, Hidden, PlayerView, Seat } from './types'

const HIDDEN: Hidden = { hidden: true }

export function view(state: GameState, seat: Seat): PlayerView {
  const { rng: _rng, log: _log, seed: _seed, hash: _hash, command, players, activation, ...rest } = state
  const picks: Partial<Record<Seat, string | Hidden>> = {}
  for (const s of ['A', 'B'] as const) {
    const pick = command.picks[s]
    if (pick === undefined) continue
    picks[s] = s === seat || command.revealed ? pick : HIDDEN
  }
  const pv = (s: Seat) => {
    const { pool, ...p } = players[s]
    return { ...p, pool: { size: pool.tokens.length, byRank: poolCounts(pool.tokens) } }
  }
  return {
    ...rest,
    viewer: seat,
    command: { ...command, picks },
    players: { A: pv('A'), B: pv('B') },
    activation: {
      ...activation,
      drawn: activation.drawn ? { seat: activation.drawn.seat, rank: activation.drawn.seat === seat ? activation.drawn.rank : HIDDEN } : null,
    },
  }
}

/** The same redaction for an event batch: replace what `seat` may not see with `{ hidden: true }`. */
export function redactEvents(events: readonly GameEvent[], seat: Seat): GameEvent[] {
  return events.map((e) => {
    if (e.type === 'CommandCardPicked' && e.seat !== seat) return { ...e, cardId: HIDDEN }
    if (e.type === 'PoolTokenDrawn' && e.seat !== seat) return { ...e, rank: HIDDEN }
    return e
  })
}
