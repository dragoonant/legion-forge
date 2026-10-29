import { afterEach, describe, expect, it } from 'vitest'
import { legalActions, view, type Action } from '@/engine'
import { createAiDecider } from '../../src/ai/decider'
import { handleRequest, type WorkerRequest } from '../../src/ai/worker'
import { AiWorkerClient, createAiWorkerBot } from '../../src/ai/workerClient'
import { newGame } from './helpers'

function request(): { req: WorkerRequest & { type: 'decide' }; legal: Action[] | null; state: ReturnType<typeof newGame>['state'] } {
  const g = newGame(0)
  const seat = g.state.pending!.seat === 'all' ? 'A' : g.state.pending!.seat
  const legal = legalActions(g.state, g.state.pending, seat)
  return {
    state: g.state,
    legal,
    req: { type: 'decide', id: 1, view: view(g.state, seat), pending: g.state.pending!, legal, tier: 'normal', seed: 'w', memoryKey: 'm' },
  }
}

const globalWithWorker = globalThis as unknown as { Worker?: unknown }

afterEach(() => {
  delete globalWithWorker.Worker
  AiWorkerClient.resetForTests()
})

describe('AI worker host', () => {
  it('AI-030 the worker core answers a request exactly as the in-process decider does', () => {
    const { req } = request()
    const res = handleRequest(req)
    expect(res?.type).toBe('action')
    const direct = createAiDecider('normal', { seed: 'w' }).decideSync(req.view, req.pending, req.legal).action
    expect(res && res.type === 'action' ? res.action : null).toEqual(direct)
  })

  it('AI-031 without a Worker the client answers in-process with the same code', async () => {
    const { req } = request()
    const client = new AiWorkerClient({ tier: 'normal', seed: 'w', memoryKey: 'm' })
    const a = await client.decide(req.view, req.pending, req.legal)
    const direct = createAiDecider('normal', { seed: 'w' }).decideSync(req.view, req.pending, req.legal).action
    expect(a).toEqual(direct)
    expect(AiWorkerClient.stats.inline).toBe(1)
    expect(AiWorkerClient.stats.timeouts).toBe(0)
  })

  it('AI-032 a worker that never answers is replaced by a legal random answer after the timeout, and the timeout is counted', async () => {
    class SilentWorker {
      onmessage: unknown = null
      onerror: unknown = null
      postMessage(): void {}
    }
    globalWithWorker.Worker = SilentWorker
    const { req, legal } = request()
    const client = new AiWorkerClient({ tier: 'normal', seed: 'w', memoryKey: 'm', timeoutMs: 40 })
    const t0 = Date.now()
    const a = await client.decide(req.view, req.pending, req.legal)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35)
    expect(legal!.some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(true)
    expect(AiWorkerClient.stats.timeouts).toBe(1)
  })

  it('AI-033 a worker that replies with an error falls back to the in-process AI', async () => {
    class BrokenWorker {
      onmessage: ((ev: { data: unknown }) => void) | null = null
      onerror: unknown = null
      postMessage(m: WorkerRequest): void {
        if (m.type === 'decide') queueMicrotask(() => this.onmessage?.({ data: { type: 'error', id: m.id, message: 'boom' } }))
      }
    }
    globalWithWorker.Worker = BrokenWorker
    const { req } = request()
    const client = new AiWorkerClient({ tier: 'normal', seed: 'w', memoryKey: 'm', timeoutMs: 2000 })
    const a = await client.decide(req.view, req.pending, req.legal)
    expect(a).toEqual(createAiDecider('normal', { seed: 'w' }).decideSync(req.view, req.pending, req.legal).action)
    expect(AiWorkerClient.stats.errors).toBe(1)
    expect(AiWorkerClient.stats.timeouts).toBe(0)
  })

  it('AI-034 the client bot answers synchronously and through the worker path with legal actions', async () => {
    const g = newGame(0)
    const seat = g.state.pending!.seat === 'all' ? 'A' : g.state.pending!.seat
    const legal = legalActions(g.state, g.state.pending, seat)!
    const bot = createAiWorkerBot('normal', 'w:bot')
    const sync = bot.decide(g.state, g.state.pending!, seat)
    const async = await bot.decideAsync(g.state, g.state.pending!, seat)
    for (const a of [sync, async]) expect(legal.some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(true)
  })
})
