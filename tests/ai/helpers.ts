// Shared by the AI tests: seeded Recon games driven by AI deciders, stopped after a number of decisions.
import { createGame, legalActions, step, view, type Action, type GameState, type PendingDecision, type Seat } from '@/engine'
import { createAiDecider, type AiDecider } from '../../src/ai/decider'
import type { Tier } from '../../src/ai/tiers'
import { simBundle, simSetupFor, type Matchup } from '../../tools/sim-setup'

export interface Sample {
  state: GameState
  pending: PendingDecision
  seat: Seat
  legal: Action[] | null
  action: Action
  fallback: boolean
}

export function newGame(game: number, matchup: Matchup = 'main', seed = 'ait') {
  const bundle = simBundle()
  const setup = simSetupFor(bundle, { matchup })(game)
  return { bundle, setup, seed: `${seed}-${game}`, state: createGame(setup, `${seed}-${game}`, bundle).state }
}

/** Play `limit` decisions (or to the end) with the given tiers; every decision is handed to `onSample` before it is applied. */
export function play(game: number, tiers: Record<Seat, Tier>, limit: number, onSample?: (s: Sample) => void, matchup: Matchup = 'main') {
  const g = newGame(game, matchup)
  let state = g.state
  const deciders: Record<Seat, AiDecider> = { A: createAiDecider(tiers.A, { seed: `${g.seed}:A` }), B: createAiDecider(tiers.B, { seed: `${g.seed}:B` }) }
  let n = 0
  const rejections: string[] = []
  while (state.pending && n < limit) {
    const pending = state.pending
    const owed: Seat[] = pending.seat === 'all' ? ['A', 'B'] : [pending.seat]
    for (const seat of owed) {
      if (!state.pending || state.pending.id !== pending.id) break
      const legal = legalActions(state, state.pending, seat)
      if (pending.seat === 'all' && legal && legal.length === 0) continue
      const r = deciders[seat].decideSync(view(state, seat), state.pending, legal)
      onSample?.({ state, pending: state.pending, seat, legal, action: r.action, fallback: r.fallback })
      const out = step(state, r.action)
      if (out.rejection) {
        rejections.push(`${pending.kind}: ${out.rejection.code} ${out.rejection.reason}`)
        return { state, deciders, n, rejections }
      }
      state = out.state
      n++
    }
  }
  return { state, deciders, n, rejections }
}
