// Client game store (docs/spec/50-client.md): the ONLY caller of engine.step. Owns the live GameState, the pending decision and
// the legal actions; answers bot seats once the presentation is idle (with a watchdog so a stuck decision can never leave the UI
// waiting); pushes every accepted step through the presentation director and the presented-seq cursor so results never show early.
// The display state is the engine's per-seat `view`, never the full state.
import { create } from 'zustand'
import {
  createGame,
  legalActions,
  redactEvents,
  save as engineSave,
  step,
  suggest,
  view,
  type Action,
  type GameEvent,
  type GameState,
  type PendingDecision,
  type Rejection,
  type SaveFile,
  type Seat,
} from '@/engine'
import { buildGameSetup, engineBundle, type SeatBuild } from '../game/adapter'
import { rejectionText, setLabelPerspective } from '../game/labels'
import { createBot, type Bot } from '../bot/randomBot'
import { clearAnims } from '../presentation/animStore'
import { enqueueBatch, resetDirector } from '../presentation/director'
import { clearFeed, clearToasts, pushToast } from '../presentation/feedStore'
import { waitForPresentationIdle } from '../presentation/idleStore'
import { isAnnouncementHolding } from '../presentation/announceStore'
import { pushSnapshot, resetPresentation, usePresentedStore } from '../presentation/presentedStore'
import { useSettings } from '../presentation/settings'
import { setTrayHold } from '../dice/trayStore'
import type { BotTier, SeatMode } from '../params'
import { botDelayMs, isWatching, startsAttackSequence } from './pacing'

export interface GameMeta {
  seed: string
  builds: Record<Seat, SeatBuild>
  battle: string[] | null
  tier: BotTier
}

export interface NewGameOptions {
  builds: Record<Seat, SeatBuild>
  seats: Record<Seat, SeatMode>
  seed: string
  tier?: BotTier
  /** battle card ids to force; the rest are drawn from the seed */
  battle?: string[] | null
  options?: import('@/engine').GameSetup['options']
}

export type PauseReason = 'user' | 'attack'

interface GameStore {
  state: GameState | null
  pending: PendingDecision | null
  /** finite answers of the seat the UI acts for (null for continuous decisions or when nobody human owes an answer) */
  legal: Action[] | null
  meta: GameMeta | null
  seats: Record<Seat, SeatMode>
  /** the seat whose view the screen shows (the human seat, or A in a watched game) */
  viewer: Seat
  /** every event of the battle in order, redacted for the viewer (end screen, tests); bounded */
  events: GameEvent[]
  rejection: { code: string; reason: string; nonce: number } | null
  // ---- watch mode (no human seat): pacing of the bot loop. Ignored whenever a human plays.
  paused: boolean
  pauseReason: PauseReason | null
  pauseOnAttacks: boolean
  /** bot answers applied in this game (tests and the watch bar read it) */
  botAnswers: number
  setPaused(paused: boolean, reason?: PauseReason): void
  togglePause(): void
  stepOnce(): void
  setPauseOnAttacks(on: boolean): void
  newGame(opts: NewGameOptions): void
  /** Answer the pending decision. A rejection of a bot seat's action is only logged; a human's shows one toast. */
  dispatch(action: Action): Rejection | null
  /** answer the pending decision for the viewer's seat with the option whose id matches */
  choose(optionId: string): Rejection | null
  pass(): Rejection | null
  exportSave(): SaveFile | null
  reset(): void
}

const EVENT_LIMIT = 6000
const PRESENTATION_IDLE_TIMEOUT_MS = 3000
const NO_PROGRESS_MS = 5000
const WATCHDOG_POLL_MS = 1000

let generation = 0
let bots: Record<Seat, Bot> | null = null
let botTimer: ReturnType<typeof setTimeout> | null = null
let watchdog: ReturnType<typeof setInterval> | null = null
let watchKey: string | null = null
let watchSince = 0
let rejectionNonce = 0
let stepRequested = false
let goWaiters: (() => void)[] = []
let botBusyKey: string | null = null
let lastAnsweredKind: string | null = null

function wake(): void {
  const w = goWaiters
  goWaiters = []
  for (const r of w) r()
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()
}

const viewerOf = (seats: Record<Seat, SeatMode>): Seat => (seats.A === 'human' ? 'A' : seats.B === 'human' ? 'B' : 'A')

/** Seats that still owe an answer to this decision. */
export function owedSeats(p: PendingDecision): Seat[] {
  if (p.seat !== 'all') return [p.seat]
  const seats = (p.context.seats as Seat[] | undefined) ?? ['A', 'B']
  const answered = (p.context.answered as Seat[] | undefined) ?? []
  return seats.filter((s) => !answered.includes(s))
}

export const useGame = create<GameStore>((set, get) => {
  /** The answers the UI may offer: the viewer's, when the viewer owes one and is human. */
  function legalFor(state: GameState, pending: PendingDecision | null): Action[] | null {
    if (!pending) return []
    const { seats, viewer } = get()
    // the viewer's seat first (hot seat later: the other human seats take their turn at the curtain)
    const owed = owedSeats(pending).filter((s) => seats[s] === 'human')
    const mine = owed.includes(viewer) ? viewer : owed[0]
    if (!mine) return []
    return legalActions(state, pending, mine)
  }

  function apply(state: GameState, events: GameEvent[], pending: PendingDecision | null): void {
    const { viewer } = get()
    const shown = redactEvents(events, viewer)
    const prevEvents = get().events
    const all = prevEvents.length + shown.length > EVENT_LIMIT ? [...prevEvents.slice(-(EVENT_LIMIT / 2)), ...shown] : [...prevEvents, ...shown]
    const v = view(state, viewer)
    set({ state, pending, legal: legalFor(state, pending), events: all })
    pushSnapshot(state.seq, v)
    enqueueBatch({ seq: state.seq, events: shown, state: v })
    scheduleBot()
  }

  function botSeatOwing(pending: PendingDecision | null): Seat | null {
    if (!pending) return null
    const { seats } = get()
    return owedSeats(pending).find((s) => seats[s] === 'bot') ?? null
  }

  function scheduleBot(): void {
    const { pending, state } = get()
    const seat = botSeatOwing(pending)
    if (!pending || !state || state.phase === 'ended' || !seat) return
    const key = `${pending.id}:${seat}`
    const gen = generation
    if (botTimer) clearTimeout(botTimer)
    botTimer = setTimeout(() => {
      botTimer = null
      void runBot(key, pending.id, seat, gen)
    }, 0)
  }

  /** The bot's answer: its own choice, else every legal action, the engine's suggestion, pass. First one the engine accepts. */
  function resolveBotAnswer(state: GameState, pending: PendingDecision, seat: Seat): { action: Action; result: ReturnType<typeof step> } | null {
    const candidates: Action[] = []
    try {
      candidates.push(bots![seat].decide(state, pending, seat))
    } catch (e) {
      console.warn('[bot] decide failed', e)
    }
    for (const a of legalActions(state, pending, seat) ?? []) candidates.push(a)
    try {
      const s = suggest(state, pending, seat)
      if (s) candidates.push(s)
    } catch {
      /* no suggestion */
    }
    if (pending.canPass) candidates.push({ type: 'pass', seat, decisionId: pending.id, payload: {} })
    for (const a of candidates) {
      const r = step(state, a)
      if (!r.rejection) return { action: a, result: r }
      console.debug(`[bot] ${pending.kind} rejected: ${r.rejection.code} ${r.rejection.reason}`)
    }
    return null
  }

  function commitBot(pending: PendingDecision, result: ReturnType<typeof step>): void {
    lastAnsweredKind = pending.kind
    set((s) => ({ botAnswers: s.botAnswers + 1 }))
    apply(result.state, result.events, result.pending)
  }

  /** Answer for a bot seat at once (no pause): the normal game and the watchdog. */
  function answerForBot(expectedId: string, seat: Seat): void {
    const { state, pending } = get()
    if (!state || !pending || pending.id !== expectedId || !owedSeats(pending).includes(seat)) return
    const found = resolveBotAnswer(state, pending, seat)
    if (found) {
      commitBot(pending, found.result)
      return
    }
    // last resort so a stuck bot can never freeze the battle: it resigns
    console.error(`[bot] no accepted answer for ${pending.kind}; resigning seat ${seat}`)
    const r = step(state, { type: 'resign', seat, decisionId: pending.id, payload: {} })
    if (!r.rejection) apply(r.state, r.events, r.pending)
  }

  /** Watch mode: 'run' when the game is running, 'step' when paused and one Step was asked for, 'stale' when the game moved on. */
  async function waitForGo(key: string, gen: number): Promise<'run' | 'step' | 'stale'> {
    for (;;) {
      const p = get().pending
      if (gen !== generation || !p || `${p.id}:${botSeatOwing(p)}` !== key) return 'stale'
      if (!get().paused) {
        stepRequested = false
        return 'run'
      }
      if (stepRequested) {
        stepRequested = false
        return 'step'
      }
      await new Promise<void>((r) => goWaiters.push(r))
    }
  }

  async function runBot(key: string, pendingId: string, seat: Seat, gen: number): Promise<void> {
    botBusyKey = `${gen}:${key}`
    try {
      const backlog = Math.max(0, usePresentedStore.getState().latestSeq - usePresentedStore.getState().presentedSeq)
      await waitForPresentationIdle(PRESENTATION_IDLE_TIMEOUT_MS + backlog * 150)
      await sleep(botDelayMs(useSettings.getState().animSpeed))
      if (gen !== generation) return
      const { pending, seats } = get()
      if (!get().state || !pending || pending.id !== pendingId) return
      if (isWatching(seats) && get().pauseOnAttacks && !get().paused && startsAttackSequence(lastAnsweredKind, pending.kind)) get().setPaused(true, 'attack')
      if (isWatching(seats)) {
        const how = await waitForGo(key, gen)
        if (how === 'stale') return
      }
      const now = get()
      if (now.pending?.id !== pendingId) return
      answerForBot(pendingId, seat)
    } finally {
      if (botBusyKey === `${gen}:${key}`) botBusyKey = null
    }
  }

  function resetWatch(): void {
    stepRequested = false
    lastAnsweredKind = null
    botBusyKey = null
    setTrayHold(false)
    set({ paused: false, pauseReason: null, botAnswers: 0 })
    wake()
  }

  function startWatchdog(): void {
    if (watchdog) return
    watchdog = setInterval(() => {
      const { pending, state } = get()
      const seat = botSeatOwing(pending)
      if (!pending || !state || state.phase === 'ended' || !seat) {
        watchKey = null
        return
      }
      const key = `${pending.id}:${seat}`
      if (key !== watchKey) {
        watchKey = key
        watchSince = Date.now()
        return
      }
      if (isAnnouncementHolding() || botBusyKey === `${generation}:${key}`) {
        watchSince = Date.now()
        return
      }
      if (Date.now() - watchSince >= NO_PROGRESS_MS) {
        console.warn(`[bot] watchdog answering ${pending.kind}`)
        watchSince = Date.now()
        answerForBot(pending.id, seat)
      }
    }, WATCHDOG_POLL_MS)
  }

  return {
    state: null,
    pending: null,
    legal: null,
    meta: null,
    seats: { A: 'human', B: 'bot' },
    viewer: 'A',
    events: [],
    rejection: null,
    paused: false,
    pauseReason: null,
    pauseOnAttacks: false,
    botAnswers: 0,

    setPaused(paused, reason = 'user') {
      if (paused === get().paused) return
      set({ paused, pauseReason: paused ? reason : null })
      setTrayHold(paused)
      if (!paused) stepRequested = false
      wake()
    },
    togglePause() {
      get().setPaused(!get().paused)
    },
    stepOnce() {
      if (!get().paused) return
      stepRequested = true
      wake()
    },
    setPauseOnAttacks: (pauseOnAttacks) => set({ pauseOnAttacks }),

    newGame(opts) {
      generation++
      if (botTimer) clearTimeout(botTimer)
      resetWatch()
      resetDirector()
      clearAnims()
      clearFeed()
      const viewer = viewerOf(opts.seats)
      setLabelPerspective(isWatching(opts.seats) ? null : viewer)
      const setup = buildGameSetup(opts.builds, { battle: opts.battle ?? null, ...(opts.options ? { options: opts.options } : {}) })
      const r = createGame(setup, opts.seed, engineBundle())
      const tier = opts.tier ?? 'random'
      bots = { A: createBot(tier, `${opts.seed}:A`), B: createBot(tier, `${opts.seed}:B`) }
      set({ state: null, pending: null, legal: null, events: [], rejection: null, seats: { ...opts.seats }, viewer, meta: { seed: opts.seed, builds: opts.builds, battle: opts.battle ?? null, tier } })
      const v = view(r.state, viewer)
      resetPresentation(r.state.seq, v)
      const shown = redactEvents(r.events, viewer)
      set({ state: r.state, pending: r.pending, legal: legalFor(r.state, r.pending), events: [...shown] })
      enqueueBatch({ seq: r.state.seq, events: shown, state: v })
      startWatchdog()
      scheduleBot()
    },

    dispatch(action) {
      const state = get().state
      if (!state) return null
      const r = step(state, action)
      if (r.rejection) {
        if (get().seats[action.seat] === 'bot') {
          console.debug(`[bot] ${action.type} rejected: ${r.rejection.code} ${r.rejection.reason}`)
          return r.rejection
        }
        rejectionNonce++
        set({ rejection: { code: r.rejection.code, reason: r.rejection.reason, nonce: rejectionNonce } })
        // at most one rejection toast per human action: the newest replaces the previous one
        clearToasts()
        pushToast(rejectionText(r.rejection), r.rejection.code === 'E_TODO' ? 'warn' : 'error')
        return r.rejection
      }
      lastAnsweredKind = get().pending?.kind ?? null
      apply(r.state, r.events, r.pending)
      return null
    },

    choose(optionId) {
      const { pending, dispatch, viewer } = get()
      if (!pending) return null
      const seat = owedSeats(pending).includes(viewer) ? viewer : owedSeats(pending)[0]!
      if (optionId === 'pass') return dispatch({ type: 'pass', seat, decisionId: pending.id, payload: {} })
      const opt = pending.options?.find((o) => o.id === optionId && o.action.seat === seat)
      if (!opt) return { code: 'E_NOT_AN_OPTION', reason: `no option ${optionId}` }
      return dispatch(opt.action)
    },

    pass() {
      return get().choose('pass')
    },

    exportSave() {
      const s = get().state
      return s ? engineSave(s) : null
    },

    reset() {
      generation++
      if (botTimer) clearTimeout(botTimer)
      resetWatch()
      resetDirector()
      clearAnims()
      clearFeed()
      resetPresentation(-1, null)
      set({ state: null, pending: null, legal: null, meta: null, events: [], rejection: null })
    },
  }
})

/** Seat whose decision is pending and who is a human (the UI may act for it). */
export function humanToAct(): Seat | null {
  const { pending, seats, state, viewer } = useGame.getState()
  if (!pending || state?.phase === 'ended') return null
  const owed = owedSeats(pending).filter((s) => seats[s] === 'human')
  return owed.includes(viewer) ? viewer : (owed[0] ?? null)
}
