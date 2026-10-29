// A `Decider` that asks the AI worker (src/ai/worker.ts) for each answer, so a slow decision never blocks rendering. Without a
// `Worker` (node, tests, a browser that refuses one) the answer is computed in-process by the same code (`handleRequest`). When the
// worker errors the same in-process path answers; when it takes longer than `timeoutMs` (3 s by default) the decision is answered
// by the random tier and counted in `AiWorkerClient.stats.timeouts`, so a hung worker can never freeze the battle. One worker is
// shared by every client.
import { legalActions, view as viewOf, type Action, type Decider, type GameState, type PendingDecision, type PlayerView, type Seat } from '@/engine'
import { createAiBot, createAiDecider, type AiBot } from './decider'
import { handleRequest, type WorkerRequest, type WorkerResponse } from './worker'
import type { Tier } from './tiers'

export interface AiWorkerClientOpts {
  tier: Tier
  /** the game seed plus the seat, e.g. `${seed}:B` (one stream per bot) */
  seed: string
  /** deciders keep their activation memory per key; default: the seed */
  memoryKey?: string
  /** answer by the random tier after this long (default 3000 ms) */
  timeoutMs?: number
  budgetMs?: number
}

export interface AiWorkerStats {
  requests: number
  /** answered by the random fallback because the worker did not reply in time */
  timeouts: number
  /** the worker replied with an error and the in-process AI answered */
  errors: number
  /** answered in-process because there is no worker */
  inline: number
}

let shared: Worker | null | undefined
let nextId = 1
const waiting = new Map<number, (res: WorkerResponse) => void>()
const randomDeciders = new Map<string, ReturnType<typeof createAiDecider>>()

function worker(): Worker | null {
  if (shared !== undefined) return shared
  if (typeof Worker === 'undefined') {
    shared = null
    return shared
  }
  try {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const done = waiting.get(ev.data.id)
      if (done) {
        waiting.delete(ev.data.id)
        done(ev.data)
      }
    }
    w.onerror = () => {
      // the worker is broken: answer everything in-process from now on
      shared = null
      for (const [id, done] of waiting) {
        waiting.delete(id)
        done({ type: 'error', id, message: 'worker error' })
      }
    }
    shared = w
  } catch {
    shared = null
  }
  return shared
}

function randomAnswer(req: WorkerRequest & { type: 'decide' }): Action {
  const key = `${req.memoryKey}:${req.seed}`
  let d = randomDeciders.get(key)
  if (!d) {
    if (randomDeciders.size > 8) randomDeciders.clear()
    d = createAiDecider('random', { seed: req.seed })
    randomDeciders.set(key, d)
  }
  return d.decideSync(req.view, req.pending, req.legal).action
}

export class AiWorkerClient implements Decider {
  static readonly stats: AiWorkerStats = { requests: 0, timeouts: 0, errors: 0, inline: 0 }
  private readonly key: string
  constructor(private readonly opts: AiWorkerClientOpts) {
    this.key = opts.memoryKey ?? opts.seed
  }

  private request(view: PlayerView, pending: PendingDecision, legal: Action[] | null, id: number): WorkerRequest & { type: 'decide' } {
    return { type: 'decide', id, view, pending, legal, tier: this.opts.tier, seed: this.opts.seed, memoryKey: this.key, ...(this.opts.budgetMs ? { budgetMs: this.opts.budgetMs } : {}) }
  }

  decide(view: PlayerView, pending: PendingDecision, legal: Action[] | null): Promise<Action> {
    const id = nextId++
    const req = this.request(view, pending, legal, id)
    AiWorkerClient.stats.requests++
    const inline = (): Action => {
      const res = handleRequest(req)
      if (!res || res.type !== 'action') throw new Error(res && res.type === 'error' ? res.message : 'the AI gave no answer')
      return res.action
    }
    const w = worker()
    if (!w) {
      AiWorkerClient.stats.inline++
      try {
        return Promise.resolve(inline())
      } catch {
        return Promise.resolve(randomAnswer(req))
      }
    }
    return new Promise<Action>((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(id)
        AiWorkerClient.stats.timeouts++
        resolve(randomAnswer(req))
      }, this.opts.timeoutMs ?? 3000)
      waiting.set(id, (res) => {
        clearTimeout(timer)
        if (res.type === 'action') return resolve(res.action)
        AiWorkerClient.stats.errors++
        try {
          resolve(inline())
        } catch {
          resolve(randomAnswer(req))
        }
      })
      try {
        w.postMessage(req)
      } catch {
        clearTimeout(timer)
        waiting.delete(id)
        AiWorkerClient.stats.errors++
        try {
          resolve(inline())
        } catch {
          resolve(randomAnswer(req))
        }
      }
    })
  }

  /** A new game: the worker forgets every decider (and so every activation memory). */
  static reset(): void {
    shared?.postMessage({ type: 'reset' } satisfies WorkerRequest)
    handleRequest({ type: 'reset' })
    randomDeciders.clear()
  }

  /** Forget the shared worker and the counters (tests install a fake `Worker` between cases). */
  static resetForTests(): void {
    shared = undefined
    waiting.clear()
    randomDeciders.clear()
    nextId = 1
    Object.assign(AiWorkerClient.stats, { requests: 0, timeouts: 0, errors: 0, inline: 0 })
  }
}

/**
 * The bot the client store uses: `decideAsync` asks the worker (a slow decision never blocks rendering; a worker that does not answer in
 * `timeoutMs` is replaced by a counted random answer), `decide` answers in-process with the same code for the paths that cannot wait
 * (the store's watchdog). One per seat.
 */
export interface AiWorkerBot extends AiBot {
  decideAsync(state: GameState, pending: PendingDecision, seat: Seat): Promise<Action>
}

export function createAiWorkerBot(tier: Tier, seed: string, opts: { timeoutMs?: number; budgetMs?: number } = {}): AiWorkerBot {
  const inline = createAiBot(tier, seed, opts.budgetMs ? { budgetMs: opts.budgetMs } : {})
  const client = new AiWorkerClient({ tier, seed, ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}), ...(opts.budgetMs ? { budgetMs: opts.budgetMs } : {}) })
  return {
    tier,
    memory: inline.memory,
    decide: (state, pending, seat) => inline.decide(state, pending, seat),
    decideAsync: (state, pending, seat) => client.decide(viewOf(state, seat), pending, legalActions(state, pending, seat)),
  }
}
