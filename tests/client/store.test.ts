// Store flow on the real engine: bots play a whole game through the same decision path as a human (store/game.ts is the only step
// caller), the presented cursor catches up, a human seat is never answered by the bot, a rejection changes nothing.
import { describe, expect, it } from 'vitest'
import { suggest } from '../../src/engine'
import { defaultLists } from '../../src/client/game/adapter'
import { useGame, humanToAct } from '../../src/client/store/game'
import { useSettings } from '../../src/client/presentation/settings'
import { usePresentedStore } from '../../src/client/presentation/presentedStore'

const lists = defaultLists()
const builds = { A: { listId: lists.A }, B: { listId: lists.B } }

async function until(cond: () => boolean, ms: number): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return cond()
}

describe('client store', () => {
  it('two bots play a whole game to its end at instant speed', async () => {
    useSettings.getState().setAnimSpeed('instant')
    useGame.getState().newGame({ builds, seats: { A: 'bot', B: 'bot' }, seed: 'store-watch-1', tier: 'random' })
    const ended = await until(() => useGame.getState().state?.phase === 'ended', 60000)
    expect(ended).toBe(true)
    const g = useGame.getState()
    expect(g.state?.result).not.toBeNull()
    expect(g.botAnswers).toBeGreaterThan(100)
    expect(g.pending).toBeNull()
    const p = usePresentedStore.getState()
    expect(p.presentedSeq).toBe(p.latestSeq)
  }, 90000)

  it('a human seat waits for the human; a wrong-seat answer is a rejection that changes nothing', async () => {
    useSettings.getState().setAnimSpeed('instant')
    useGame.getState().newGame({ builds, seats: { A: 'human', B: 'bot' }, seed: 'store-human-1', tier: 'random' })
    await until(() => humanToAct() !== null, 5000)
    const before = useGame.getState().state
    const pending = useGame.getState().pending!
    expect(humanToAct()).toBe('A')
    // an answer for the wrong decision id is rejected
    const bad = useGame.getState().dispatch({ type: 'pass', seat: 'A', decisionId: 'd:999', payload: {} })
    expect(bad).not.toBeNull()
    expect(useGame.getState().state).toBe(before)
    expect(useGame.getState().pending?.id).toBe(pending.id)
  })
})

describe('a human seat through the store', () => {
  it('answering only with the store\'s `legal` list (or the engine suggestion for continuous kinds) plays two full rounds against the bot', async () => {
    useSettings.getState().setAnimSpeed('instant')
    useGame.getState().newGame({ builds, seats: { A: 'human', B: 'bot' }, seed: 'store-human-2', tier: 'random' })
    const kinds = new Set<string>()
    let answered = 0
    const t0 = Date.now()
    while (Date.now() - t0 < 60000) {
      const g = useGame.getState()
      if (!g.state || g.state.phase === 'ended' || g.state.round >= 3) break
      const seat = humanToAct()
      if (!seat || !g.pending) {
        await new Promise((r) => setTimeout(r, 10))
        continue
      }
      kinds.add(g.pending.kind)
      const legal = g.legal
      let action = legal && legal.length > 0 ? legal[answered % legal.length]! : suggest(g.state, g.pending, seat)
      if (!action) action = { type: 'pass', seat, decisionId: g.pending.id, payload: {} }
      const rej = g.dispatch(action)
      expect(rej, `${g.pending.kind}: ${rej?.reason}`).toBeNull()
      answered++
    }
    const g = useGame.getState()
    expect(g.state!.round).toBeGreaterThanOrEqual(3)
    expect(kinds.has('command.pick')).toBe(true)
    expect(kinds.has('activation.choose')).toBe(true)
    expect(kinds.has('move.tool')).toBe(true)
    expect(g.botAnswers).toBeGreaterThan(20)
    // the human's view never holds the opponent's pick before the reveal: the engine view is what the display state carries
    expect(g.events.every((e) => !(e.type === 'CommandCardPicked' && e.seat === 'B' && typeof e.cardId === 'string'))).toBe(true)
  }, 90000)
})
