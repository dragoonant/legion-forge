// Save and Continue on the real engine and store: the autosave is written after accepted actions while a human plays, a continued
// battle replays to the same hash and keeps its ledger, a tampered save is refused with a reason (never a throw), and an ended battle
// clears the save.
import { beforeAll, describe, expect, it } from 'vitest'
import { suggest } from '../../src/engine'
import { defaultLists } from '../../src/client/game/adapter'
import { useGame, humanToAct } from '../../src/client/store/game'
import { useSession } from '../../src/client/store/session'
import { useSettings } from '../../src/client/presentation/settings'
import { SAVE_KEY, ago, parseEnvelope, readSave, restoreSave, clearSave } from '../../src/client/store/saveGame'

const store = new Map<string, string>()
beforeAll(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

const lists = defaultLists()
const builds = { A: { listId: lists.A }, B: { listId: lists.B } }

async function until(cond: () => boolean, ms: number): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 15))
  }
  return cond()
}

/** The human seat answers with the engine's own suggestion until `stop` holds. */
async function playHuman(stop: () => boolean, maxSteps = 4000): Promise<void> {
  for (let i = 0; i < maxSteps && !stop(); i++) {
    await until(() => humanToAct() !== null || useGame.getState().state?.phase === 'ended' || stop(), 5000)
    const g = useGame.getState()
    const seat = humanToAct()
    if (!g.state || !g.pending || !seat || g.state.phase === 'ended' || stop()) return
    const a = suggest(g.state, g.pending, seat)
    if (!a || g.dispatch(a)) return
  }
}

describe('save and continue', () => {
  it('autosaves while a human plays, and Continue replays to the same position with the ledger', async () => {
    useSettings.getState().setAnimSpeed('instant')
    clearSave()
    useGame.getState().newGame({ builds, seats: { A: 'human', B: 'bot' }, seed: 'save-1', tier: 'random' })
    await playHuman(() => (useGame.getState().state?.round ?? 0) >= 2)
    await until(() => humanToAct() !== null, 5000)
    const env = readSave()
    expect(env, 'a save exists').not.toBeNull()
    expect(env!.summary.round).toBeGreaterThanOrEqual(2)
    expect(env!.summary.tier).toBe('random')
    expect(env!.seats).toEqual({ A: 'human', B: 'bot' })
    const live = useGame.getState().state!
    expect(env!.file.finalHash).toBe(live.hash)
    expect(env!.ledger.entries.some((e) => e.t === 'pick' && e.seat === 'B')).toBe(true)

    // continue: same hash, same pending decision, the ledger survives
    const before = { hash: live.hash, kind: useGame.getState().pending?.kind, ledger: useGame.getState().ledger.entries.length }
    useGame.getState().reset()
    expect(useGame.getState().state).toBeNull()
    useSession.getState().refreshSave()
    useSession.getState().continueGame()
    expect(useSession.getState().screen).toBe('battle')
    const g = useGame.getState()
    expect(g.state?.hash).toBe(before.hash)
    expect(g.pending?.kind).toBe(before.kind)
    expect(g.ledger.entries.length).toBe(before.ledger)
    expect(g.seats).toEqual({ A: 'human', B: 'bot' })
    // and it can be played on
    const pendingId = g.pending!.id
    await playHuman(() => useGame.getState().pending?.id !== pendingId)
    expect(useGame.getState().pending?.id).not.toBe(pendingId)
  }, 60000)

  it('a save that no longer replays to the same hash is discarded with a notice', () => {
    const env = readSave()!
    expect(env).not.toBeNull()
    const bad = { ...env, file: { ...env.file, finalHash: 'deadbeef' } }
    const r = restoreSave(bad)
    expect(r.ok).toBe(false)
    useGame.getState().reset()
    store.set(SAVE_KEY, JSON.stringify(bad))
    useSession.setState({ screen: 'start' })
    useSession.getState().refreshSave()
    useSession.getState().continueGame()
    expect(useSession.getState().save).toBeNull()
    expect(useSession.getState().notice).toMatch(/discarded/)
    expect(readSave()).toBeNull()
    expect(useSession.getState().screen).toBe('start')
  })

  it('garbage in storage is no save, and an old engine version is refused', () => {
    store.set(SAVE_KEY, '{not json')
    expect(readSave()).toBeNull()
    expect(parseEnvelope({ v: 2 })).toBeNull()
    expect(parseEnvelope(null)).toBeNull()
  })

  it('the save is cleared when the battle ends', async () => {
    clearSave()
    useGame.getState().newGame({ builds, seats: { A: 'human', B: 'bot' }, seed: 'save-2', tier: 'random' })
    await playHuman(() => (useGame.getState().state?.round ?? 0) >= 1 && store.has(SAVE_KEY))
    expect(store.has(SAVE_KEY)).toBe(true)
    const g = useGame.getState()
    g.dispatch({ type: 'resign', seat: 'A', decisionId: g.pending!.id, payload: {} })
    expect(useGame.getState().state?.phase).toBe('ended')
    expect(store.has(SAVE_KEY)).toBe(false)
  }, 30000)

  it('a watched game is not saved', async () => {
    clearSave()
    useGame.getState().newGame({ builds, seats: { A: 'bot', B: 'bot' }, seed: 'save-3', tier: 'random' })
    await until(() => (useGame.getState().state?.round ?? 0) >= 1, 20000)
    useGame.getState().reset()
    expect(store.has(SAVE_KEY)).toBe(false)
  }, 30000)

  it('"ago" reads as a person would say it', () => {
    expect(ago(1000, 1000 + 10_000)).toBe('just now')
    expect(ago(0, 5 * 60_000)).toBe('5 minutes ago')
    expect(ago(0, 3 * 3600_000)).toBe('3 hours ago')
    expect(ago(0, 3 * 86400_000)).toBe('3 days ago')
  })
})
