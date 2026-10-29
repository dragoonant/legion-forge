// Presentation (client/presentation/*): the presented-seq cursor only advances after a batch has played, the idle flag follows the
// queue, 'instant' skips pauses, the feed gets the events' lines in order, and the move tween walks the engine's own path.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { view } from '../../src/engine'
import { animPosition, clearAnims, startMoveAnim } from '../../src/client/presentation/animStore'
import { useAnnouncementStore, holdAnnouncement, clearAnnouncement } from '../../src/client/presentation/announceStore'
import { beatMs, enqueueBatch, moveDurationMs, resetDirector } from '../../src/client/presentation/director'
import { clearFeed, groupFeed, useFeedStore } from '../../src/client/presentation/feedStore'
import { isPresentationIdle, waitForPresentationIdle } from '../../src/client/presentation/idleStore'
import { catchUpPresented, pickDisplaySnapshot, pushSnapshot, resetPresentation, setPresentedSeq, usePresentedStore } from '../../src/client/presentation/presentedStore'
import { useSettings, speedFactor } from '../../src/client/presentation/settings'
import { useTray } from '../../src/client/dice/trayStore'
import { batchOf, installStorage, newRealGame, playGame } from './fixtures'

describe('presented cursor and snapshots', () => {
  it('the display state is the last snapshot at or before the cursor', () => {
    const g = newRealGame('cursor')
    const v0 = view(g.state, 'A')
    resetPresentation(g.state.seq, v0)
    const later = { ...v0, seq: v0.seq + 5 }
    pushSnapshot(later.seq, later)
    const s = usePresentedStore.getState()
    expect(s.latestSeq).toBe(later.seq)
    expect(pickDisplaySnapshot(s.snapshots, s.presentedSeq)).toBe(v0)
    expect(pickDisplaySnapshot(s.snapshots, later.seq)).toBe(later)
    expect(pickDisplaySnapshot([], 3)).toBeNull()
  })

  it('the cursor never passes the head or goes backwards, and catch-up lands on the head', () => {
    const g = newRealGame('cursor2')
    resetPresentation(0, view(g.state, 'A'))
    pushSnapshot(4, { ...view(g.state, 'A'), seq: 4 })
    setPresentedSeq(2)
    expect(usePresentedStore.getState().presentedSeq).toBe(2)
    setPresentedSeq(1)
    expect(usePresentedStore.getState().presentedSeq).toBe(2)
    setPresentedSeq(99)
    expect(usePresentedStore.getState().presentedSeq).toBe(4)
    resetPresentation(0, view(g.state, 'A'))
    pushSnapshot(7, { ...view(g.state, 'A'), seq: 7 })
    catchUpPresented()
    expect(usePresentedStore.getState().presentedSeq).toBe(7)
  })

  it('the display state is the engine view: no seed, rng, log or hash', () => {
    const g = newRealGame('view')
    const v = view(g.state, 'A') as unknown as Record<string, unknown>
    for (const k of ['rng', 'log', 'seed', 'hash']) expect(k in v).toBe(false)
  })
})

describe('director', () => {
  beforeEach(() => {
    installStorage()
    useSettings.setState({ animSpeed: 'instant' })
    resetDirector()
    clearFeed()
    clearAnims()
  })
  afterEach(() => {
    vi.useRealTimers()
    resetDirector()
  })

  it('instant speed plays a batch at once: feed lines in event order, cursor at the batch, idle again', async () => {
    const played = playGame('director', (s) => s.seq >= 60)
    const first = played.steps.slice(0, 12)
    resetPresentation(played.created.state.seq, view(played.created.state, 'A'))
    for (const st of first) {
      pushSnapshot(st.state.seq, view(st.state, 'A'))
      enqueueBatch(batchOf(st.state, st.events))
    }
    await waitForPresentationIdle(2000)
    expect(isPresentationIdle()).toBe(true)
    expect(usePresentedStore.getState().presentedSeq).toBe(first[first.length - 1]!.state.seq)
    const feed = useFeedStore.getState().feed
    expect(feed.length).toBeGreaterThan(3)
    const seqs = feed.map((f) => f.seq)
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs)
  })

  it('the idle flag is false while a batch is queued and true after resetDirector', () => {
    const played = playGame('director2', (s) => s.seq >= 10)
    const st = played.steps[0]!
    enqueueBatch(batchOf(st.state, st.events))
    expect(isPresentationIdle()).toBe(false)
    resetDirector()
    expect(isPresentationIdle()).toBe(true)
  })

  it('dice events fill the dice tray; the creation batch carries the blue roll', async () => {
    const played = playGame('tray', (s) => s.round >= 2)
    resetPresentation(played.created.state.seq, view(played.created.state, 'A'))
    // the first batch is the game's creation: it carries the blue player's roll
    enqueueBatch(batchOf(played.created.state, played.created.events))
    for (const st of played.steps) {
      pushSnapshot(st.state.seq, view(st.state, 'A'))
      enqueueBatch(batchOf(st.state, st.events))
    }
    await waitForPresentationIdle(5000)
    expect(played.events.some((e) => e.type === 'DiceRolled')).toBe(true)
    expect(useTray.getState().rev).toBeGreaterThan(0)
  })

  it('beats and the walking pace are positive numbers; speed factors scale them', () => {
    const played = playGame('beats', (s) => s.round >= 2)
    const known = played.events.filter((e) => beatMs(e) > 0)
    expect(known.length).toBeGreaterThan(0)
    expect(moveDurationMs(0)).toBeGreaterThanOrEqual(200)
    expect(moveDurationMs(100)).toBeLessThanOrEqual(1600)
    expect(speedFactor('instant')).toBe(0)
    expect(speedFactor('fast')).toBeLessThan(speedFactor('normal'))
  })
})

describe('banners and tweens', () => {
  it('a banner holds until its time is up or any click skips it', async () => {
    vi.useFakeTimers()
    const p = holdAnnouncement({ title: 'Round 1', subtitle: '', seat: null, durationMs: 1000 })
    expect(useAnnouncementStore.getState().current?.title).toBe('Round 1')
    await vi.advanceTimersByTimeAsync(1100)
    await p
    expect(useAnnouncementStore.getState().current).toBeNull()
    clearAnnouncement()
  })

  it('a zero-length banner is no banner, and a move tween walks the engine path', () => {
    return holdAnnouncement({ title: 'x', subtitle: '', seat: null, durationMs: 0 }).then(() => {
      expect(useAnnouncementStore.getState().current).toBeNull()
      clearAnims()
      startMoveAnim('A0.0', [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }], 1000)
      const mid = animPosition('A0.0', performance.now() + 500)!
      expect(mid.x).toBeGreaterThan(0)
      expect(animPosition('nobody')).toBeNull()
      const end = animPosition('A0.0', performance.now() + 5000)!
      expect(end.x).toBeCloseTo(4)
      expect(end.z).toBeCloseTo(3)
      clearAnims()
    })
  })

  it('consecutive dice lines are grouped', () => {
    const g = groupFeed([
      { id: 1, seq: 1, seat: null, text: 'a' },
      { id: 2, seq: 2, seat: null, text: 'd1', dice: true },
      { id: 3, seq: 2, seat: null, text: 'd2', dice: true },
      { id: 4, seq: 3, seat: null, text: 'b' },
    ])
    expect(g.map((x) => x.length)).toEqual([1, 2, 1])
  })
})
