// window.__lf (docs/spec/50-client.md section 8): test hooks installed with ?test=1 or ?debug. Read-only views of the store plus
// `dispatch`; the store remains the only step caller. E2E specs and the screenshot script read these instead of guessing at pixels.
import { legalActions, suggest, validate, type Action, type PendingDecision } from '@/engine'
import { AiWorkerClient, type AiWorkerStats } from '@/ai'
import { cameraApi } from '../board/cameraApi'
import { RandomBot } from '../bot/randomBot'
import { clickableUnits, currentToolPreview, deployFacing, deployUnitFor, previewDeploy } from '../interaction/controller'
import { previewToward } from '../game/toolApi'
import { currentParams } from '../params'
import { useAnnouncementStore } from '../presentation/announceStore'
import { useFeedStore } from '../presentation/feedStore'
import { pickDisplaySnapshot, usePresentedStore } from '../presentation/presentedStore'
import { useUi } from '../ui/uiStore'
import { humanToAct, useGame } from './game'
import { useSession } from './session'

export interface LfHooks {
  getState(): unknown
  getPending(): PendingDecision | null
  /** the view as the player currently sees it (the presentation cursor, not the live head) */
  display(): unknown
  legal(): Action[] | null
  dispatch(action: Action): unknown
  choose(optionId: string): unknown
  params(): unknown
  /** presentation caught up with the engine and no banner is showing */
  settled(): boolean
  /** would the engine accept the next deploy click at (x, z)? A dry run: nothing is dispatched */
  deployOk(x: number, z: number): boolean
  /** would the engine accept the movement tool toward (x, z)? A dry run */
  toolOk(x: number, z: number): { ok: boolean; reason: string | null }
  /** the unit ids a click can answer right now for the human seat (the actable rings) */
  clickable(): string[]
  /** the aimed (locked) tool preview: pose, hinge point, verdict */
  tool(): { ok: boolean; reason: string | null; hinge: { x: number; z: number } | null; leader: { x: number; z: number } | null; speed: number | null } | null
  project(x: number, y: number, z: number): { x: number; y: number } | null
  camera: typeof cameraApi
  session(): unknown
  ui(): unknown
  /** answer the pending decision of the human seat with the random bot's choice; false when nothing is owed */
  autoStep(): boolean
  /** the toasts currently on screen */
  toasts(): { text: string; kind: string }[]
  /** every event of the battle so far (redacted for the viewer) */
  events(): unknown[]
  /** watch-mode pacing: paused and the bot answers applied so far */
  watch(): { paused: boolean; reason: string | null; answers: number }
  /** the AI worker client's counters: requests sent, answered in-process (no Worker), timed out, errors */
  ai(): AiWorkerStats
}

declare global {
  interface Window {
    __lf?: LfHooks
  }
}

let autoBot: RandomBot | null = null

function autoStep(): boolean {
  const { state, pending, dispatch } = useGame.getState()
  const seat = humanToAct()
  if (!state || !pending || !seat || state.phase === 'ended') return false
  autoBot ??= new RandomBot(`auto:${state.seed}`)
  const candidates: Action[] = []
  try {
    candidates.push(autoBot.decide(state, pending, seat))
  } catch {
    /* fall through to the enumerated answers */
  }
  candidates.push(...(legalActions(state, pending, seat) ?? []))
  try {
    const s = suggest(state, pending, seat)
    if (s) candidates.push(s)
  } catch {
    /* none */
  }
  for (const a of candidates) {
    if (!validate(state, a)) return dispatch(a) === null
  }
  return false
}

export function installTestHooks(): void {
  if (typeof window === 'undefined') return
  const p = currentParams()
  if (!p.test && !p.debug) return
  window.__lf = {
    getState: () => useGame.getState().state,
    getPending: () => useGame.getState().pending,
    display: () => {
      const s = usePresentedStore.getState()
      return pickDisplaySnapshot(s.snapshots, s.presentedSeq)
    },
    legal: () => useGame.getState().legal,
    dispatch: (a) => useGame.getState().dispatch(a),
    choose: (id) => useGame.getState().choose(id),
    params: () => p,
    settled: () => {
      const s = usePresentedStore.getState()
      return s.presentedSeq >= s.latestSeq && useAnnouncementStore.getState().current === null
    },
    deployOk: (x, z) => {
      const { state, pending } = useGame.getState()
      if (!state || !pending || pending.kind !== 'setup.deploy') return false
      const id = deployUnitFor(pending, useUi.getState().deployUnit)
      return !!id && previewDeploy(state, pending, id, { x, z }, deployFacing(pending, useUi.getState().facing)).ok
    },
    toolOk: (x, z) => {
      const { state, pending } = useGame.getState()
      if (!state || !pending || pending.kind !== 'move.tool') return { ok: false, reason: 'no move pending' }
      const pv = previewToward(state, pending, { x, z })
      return { ok: pv.ok, reason: pv.reason }
    },
    clickable: () => [...clickableUnits(useGame.getState().pending, humanToAct())],
    tool: () => {
      const pv = currentToolPreview()
      return pv ? { ok: pv.ok, reason: pv.reason, hinge: pv.hinge, leader: pv.leader, speed: pv.speed } : null
    },
    project: (x, y, z) => cameraApi.current?.project(x, y, z) ?? null,
    camera: cameraApi,
    session: () => useSession.getState(),
    ui: () => useUi.getState(),
    autoStep,
    toasts: () => useFeedStore.getState().toasts.map((t) => ({ text: t.text, kind: t.kind })),
    events: () => useGame.getState().events,
    watch: () => {
      const g = useGame.getState()
      return { paused: g.paused, reason: g.pauseReason, answers: g.botAnswers }
    },
    ai: () => ({ ...AiWorkerClient.stats }),
  }
}
