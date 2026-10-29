// Watch mode (two bots) and the seat loop: pause holds the bot, Step lets exactly one decision through, a bot never answers for a human
// seat, the human can sit in seat B, pacing rules, the presented-cursor stall catch-up.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultLists } from '../../src/client/game/adapter'
import { owedSeats, useGame, humanToAct } from '../../src/client/store/game'
import { isAttackKind, isWatching, startsAttackSequence, botDelayMs } from '../../src/client/store/pacing'
import { useSettings } from '../../src/client/presentation/settings'
import { PRESENTED_STALL_MS, pushSnapshot, resetPresentation, usePresentedStore } from '../../src/client/presentation/presentedStore'
import { suggest, view } from '../../src/engine'
import { newRealGame } from './fixtures'

const lists = defaultLists()
const builds = { A: { listId: lists.A }, B: { listId: lists.B } }
const until = async (cond: () => boolean, ms: number): Promise<boolean> => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 15))
  }
  return cond()
}

describe('pacing rules', () => {
  it('attack kinds start an attack sequence only from a non-attack decision', () => {
    expect(isAttackKind('attack.pool')).toBe(true)
    expect(isAttackKind('action.choose')).toBe(false)
    expect(startsAttackSequence('action.choose', 'attack.defender')).toBe(true)
    expect(startsAttackSequence('attack.defender', 'attack.pool')).toBe(false)
    expect(startsAttackSequence(null, 'move.tool')).toBe(false)
  })

  it('watching means no human seat; instant speed has no bot delay', () => {
    expect(isWatching({ A: 'bot', B: 'bot' })).toBe(true)
    expect(isWatching({ A: 'human', B: 'bot' })).toBe(false)
    expect(botDelayMs('instant')).toBe(0)
    expect(botDelayMs('normal')).toBeGreaterThan(botDelayMs('fast'))
  })
})

describe('watch mode', () => {
  afterEach(() => {
    useGame.getState().reset()
  })

  it('a paused game holds the bots; Step lets one decision through; Play runs on', async () => {
    useSettings.getState().setAnimSpeed('instant')
    useGame.getState().newGame({ builds, seats: { A: 'bot', B: 'bot' }, seed: 'watch-pause', tier: 'random' })
    useGame.getState().setPaused(true)
    await until(() => useGame.getState().botAnswers >= 1, 300)
    const held = useGame.getState().botAnswers
    await new Promise((r) => setTimeout(r, 200))
    expect(useGame.getState().botAnswers).toBe(held)
    useGame.getState().stepOnce()
    expect(await until(() => useGame.getState().botAnswers === held + 1, 3000)).toBe(true)
    await new Promise((r) => setTimeout(r, 150))
    expect(useGame.getState().botAnswers).toBe(held + 1)
    expect(useGame.getState().paused).toBe(true)
    useGame.getState().setPaused(false)
    expect(await until(() => useGame.getState().botAnswers > held + 20, 5000)).toBe(true)
  })

  it('"pause on attacks" pauses itself when an attack sequence is about to start', async () => {
    useSettings.getState().setAnimSpeed('instant')
    useGame.getState().newGame({ builds, seats: { A: 'bot', B: 'bot' }, seed: 'watch-attacks', tier: 'random' })
    useGame.getState().setPauseOnAttacks(true)
    expect(await until(() => useGame.getState().paused, 60000)).toBe(true)
    expect(useGame.getState().pauseReason).toBe('attack')
    expect(useGame.getState().pending?.kind.startsWith('attack.')).toBe(true)
  }, 90000)
})

describe('seats', () => {
  afterEach(() => {
    useGame.getState().reset()
  })

  it('a human in seat B is asked for seat B only, and sees the game from seat B', async () => {
    useSettings.getState().setAnimSpeed('instant')
    useGame.getState().newGame({ builds, seats: { A: 'bot', B: 'human' }, seed: 'seat-b', tier: 'random' })
    expect(useGame.getState().viewer).toBe('B')
    expect(await until(() => humanToAct() === 'B', 5000)).toBe(true)
    const g = useGame.getState()
    for (const _ of [0, 1, 2, 3, 4, 5]) {
      const s = useGame.getState()
      if (!s.pending || humanToAct() !== 'B') {
        await until(() => humanToAct() === 'B' || useGame.getState().state?.phase === 'ended', 3000)
        continue
      }
      const a = (s.legal && s.legal[0]) ?? suggest(s.state!, s.pending, 'B')!
      expect(s.dispatch(a)).toBeNull()
    }
    expect(g.pending).not.toBeNull()
  })

  it('owed seats: a decision for all lists the seats that have not answered', () => {
    const created = newRealGame('owed')
    expect(owedSeats({ ...created.pending!, seat: 'all', context: { seats: ['A', 'B'], answered: ['A'] } })).toEqual(['B'])
    expect(owedSeats({ ...created.pending!, seat: 'A' })).toEqual(['A'])
  })
})

describe('presented cursor stall', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('a stuck director cannot freeze the UI: the cursor catches up after the stall time', () => {
    vi.useFakeTimers()
    const g = newRealGame('stall')
    const v = view(g.state, 'A')
    resetPresentation(0, v)
    pushSnapshot(9, { ...v, seq: 9 })
    expect(usePresentedStore.getState().presentedSeq).toBe(0)
    vi.advanceTimersByTime(PRESENTED_STALL_MS + 50)
    expect(usePresentedStore.getState().presentedSeq).toBe(9)
    resetPresentation(-1, null)
  })
})
