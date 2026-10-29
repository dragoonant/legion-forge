// Shared drivers for the M2c review-fix tests: a first-turn position on the real Recon data, readying a unit and putting it
// on the table, starting its activation through the real `activation.choose` answer, and a duel at a chosen distance.
import type { GameState, Seat, StepResult } from '../../../src/engine'
import { CLOSE, ScriptedRng, advance, edit, must, newGame, pick, place, unitBy } from './helpers'

export const CARDS = ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.cunning-deployment', 'rec.adv.fortified-position']

export { CLOSE }

/** Both seats have picked Ambush / Push and the first `activation.choose` is open (generic hands, every unit deployed). */
export function firstTurn(cards: Partial<Record<Seat, string>> = { A: 'neu.cc.ambush', B: 'neu.cc.push' }): StepResult {
  const g = newGame({ generic: true, cards: CARDS, options: { autoDeploy: true } })
  return advance(pick(g, cards), (p) => p.kind === 'activation.choose')
}

export const act = (state: GameState, seat: Seat, id: string) => ({ type: 'activation.choose' as const, seat, decisionId: state.pending!.id, payload: { unitId: id } })

/** Give the unit a face-up order (out of the pool), optionally place it on the table and patch the state. */
export function ready(state: GameState, unitId: string, at: [number, number] | null, patch: (s: GameState) => void = () => undefined): GameState {
  return edit(state, (s) => {
    const u = s.units[unitId]!
    if (u.order.state === 'pool') {
      const pool = s.players[u.seat].pool.tokens
      pool.splice(pool.indexOf(u.rank), 1)
    }
    u.order.state = 'faceUp'
    if (at) place(u, at[0], at[1])
    patch(s)
  })
}

/** Start the unit's activation through the real answer to `activation.choose` (the pending decision is re-pointed at its seat). */
export function startOf(state: GameState, unitId: string, rng?: ScriptedRng): StepResult {
  const u = state.units[unitId]!
  const s = edit(state, (x) => {
    const p = x.pending!
    x.pending = { ...p, seat: u.seat, options: [{ id: `unit:${unitId}`, labelKey: 'activation.order', action: act(x, u.seat, unitId) }] }
  })
  return must(s, act(s, u.seat, unitId), rng)
}

/** Everyone else is moved out of the way: `atk` at (x, z) and `def` `distance` inches further along z, both in the open. */
export function duelOf(first: StepResult, atkType: string, defType: string, distance: number, at: [number, number] = [-14, -14], atkSeat: Seat = 'A'): { state: GameState; atk: string; def: string } {
  const atk = unitBy(first.state, atkSeat, atkType, 0).id
  const def = unitBy(first.state, atkSeat === 'A' ? 'B' : 'A', defType, 0).id
  const state = ready(first.state, atk, at, (x) => {
    Object.values(x.units).filter((u) => u.location === 'table' && u.id !== atk && u.id !== def).forEach((u, i) => place(u, 16, 16 - 3.5 * i))
    place(x.units[def]!, at[0], at[1] + distance)
  })
  return { state, atk, def }
}

/** One unit alone in the open, ready to activate: every other unit is parked in the far corner. */
export function soloOf(first: StepResult, seat: Seat, dataId: string, at: [number, number] = [-10, -10], nth = 0): { state: GameState; id: string } {
  const id = unitBy(first.state, seat, dataId, nth).id
  const state = ready(first.state, id, at, (x) => {
    Object.values(x.units).filter((u) => u.location === 'table' && u.id !== id).forEach((u, i) => place(u, 30 - 4 * Math.floor(i / 8), 16 - 3.5 * (i % 8)))
  })
  return { state, id }
}

/** The unit's leader at (x, z) and its other figures in a row 1.4" behind it (further along +z), so the leader's front is clear. */
export function lineUp(state: GameState, unitId: string, x: number, z: number): GameState {
  return edit(state, (s) => {
    const u = s.units[unitId]!
    u.location = 'table'
    let k = 0
    for (const m of u.minis) {
      if (m.id === u.leaderId) m.pos = { x, y: 0, z }
      else {
        k++
        m.pos = { x: x + (k % 2 === 0 ? -1 : 1) * 1.3 * Math.ceil(k / 2), y: 0, z: z + 1.4 }
      }
    }
  })
}
