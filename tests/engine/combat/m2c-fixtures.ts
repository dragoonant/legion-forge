// Fixtures for the M2c combat-side tests: a real-data game state (both starter lists, Recon battle cards, units deployed).
import type { GameState } from '../../../src/engine'
import { CLOSE, edit, newGame } from '../flow/helpers'

export { edit }

/** The state right after setup on the real data; `a` / `b` pick the army lists (default Recon list A for both). */
export function firstTurnState(o: { a?: string; b?: string } = {}): GameState {
  return newGame({ ...o, cards: CLOSE, options: { autoDeploy: true } }).state
}
