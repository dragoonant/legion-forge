// Fixtures for the client tests: a real engine game played forward with the client's own random bot (the same decision path the
// store uses), so view-models and labels are checked against real states, events and decisions.
import { createGame, step, view, redactEvents, type GameEvent, type GameState, type PendingDecision, type Seat, type StepResult } from '../../src/engine'
import { RandomBot } from '../../src/client/bot/randomBot'
import { buildGameSetup, defaultLists, engineBundle } from '../../src/client/game/adapter'
import type { Batch } from '../../src/client/presentation/director'

export function newRealGame(seed: string, listA?: string, listB?: string): StepResult {
  const d = defaultLists()
  return createGame(buildGameSetup({ A: { listId: listA ?? d.A }, B: { listId: listB ?? d.B } }), seed, engineBundle())
}

export interface Played {
  created: StepResult
  steps: StepResult[]
  events: GameEvent[]
  /** the first state at which `stop` held (or the last one) */
  state: GameState
  pending: PendingDecision | null
}

const owed = (p: PendingDecision): Seat[] => (p.seat !== 'all' ? [p.seat] : (((p.context.seats as Seat[] | undefined) ?? ['A', 'B']).filter((s) => !((p.context.answered as Seat[] | undefined) ?? []).includes(s))))

/** Play the game with random bots for both seats until `stop(state, pending)` is true, the battle ends, or `max` steps pass. */
export function playGame(seed: string, stop: (s: GameState, p: PendingDecision | null) => boolean = () => false, max = 5000): Played {
  const created = newRealGame(seed)
  const bots = { A: new RandomBot(`${seed}:A`), B: new RandomBot(`${seed}:B`) }
  const steps: StepResult[] = []
  const events: GameEvent[] = [...created.events]
  let cur = created
  for (let i = 0; i < max && cur.pending && cur.state.phase !== 'ended'; i++) {
    if (stop(cur.state, cur.pending)) break
    const seat = owed(cur.pending)[0]!
    const r = step(cur.state, bots[seat].decide(cur.state, cur.pending, seat))
    if (r.rejection) throw new Error(`rejected ${r.rejection.code}: ${r.rejection.reason}`)
    steps.push(r)
    events.push(...r.events)
    cur = r
  }
  return { created, steps, events, state: cur.state, pending: cur.pending }
}

/** A director batch for one step, as the viewer `A` sees it. */
export function batchOf(state: GameState, events: GameEvent[], viewer: Seat = 'A'): Batch {
  return { seq: state.seq, events: redactEvents(events, viewer), state: view(state, viewer) }
}

/** In-memory localStorage for modules that persist settings. */
export function installStorage(): void {
  const mem = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size
    },
  }
}
