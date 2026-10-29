// Presentation director: turns each accepted step's events into timed beats (feed lines, dice tray, banners, move tweens) and only
// then advances the presented-seq cursor, so no result shows before it is played. 'instant' speed skips every pause, banner and
// tween. Batches queue FIFO; the idle flag is true when the queue is empty. The bot waits for it (store/game.ts).
import type { GameEvent, Seat } from '@/engine'
import { trayClear } from '../dice/trayStore'
import { trayEvent } from '../dice/trayEvents'
import { cardName, describeEvent, seatName } from '../game/labels'
import { clearAnnouncement, holdAnnouncement } from './announceStore'
import { clearAnims, endMoveAnim, requestRepaint, startMoveAnim } from './animStore'
import { pushFeed } from './feedStore'
import { clearFx, spawnFx } from './fxStore'
import { setPresentationIdle } from './idleStore'
import { catchUpPresented, pickDisplaySnapshot, setPresentedSeq, usePresentedStore, type DisplayState } from './presentedStore'
import { speedFactor, useSettings } from './settings'
import { colors } from '../ui/theme'

export interface Batch {
  /** the seq of the last event of the step (the cursor value once played) */
  seq: number
  events: GameEvent[]
  /** the state AFTER the step, as the viewer sees it (names, positions of everybody the events mention) */
  state: DisplayState
}

const queue: Batch[] = []
let running = false
let generation = 0

const factor = (): number => speedFactor(useSettings.getState().animSpeed)

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()
}

/** Base pause (ms at normal speed) per event type; the pause is a beat in which the event's effects play. */
export function beatMs(ev: GameEvent): number {
  switch (ev.type) {
    case 'PriorityDecided':
      return 1500
    case 'RoundStarted':
      return 1000
    case 'CommandCardsRevealed':
      return 1500
    case 'DiceRolled':
      return 650
    case 'Compared':
      return 450
    case 'WoundsAssigned':
      return 300
    case 'MiniDefeated':
      return 450
    case 'UnitDefeated':
      return 600
    case 'PointsScored':
      return 450
    case 'UnitActivated':
      return 250
    case 'UnitDeployed':
      return 200
    case 'GameEnded':
      return 900
    default:
      return 0
  }
}

/** Walking pace: ms per inch at normal speed, clamped so a short step is still seen and a long one is not tedious. */
export function moveDurationMs(length: number): number {
  return Math.min(1500, Math.max(260, length * 130))
}

/** The leader's spot of a unit in the post-step state, lifted to chest height (tracers and floating texts). */
function spotOf(state: DisplayState, unitId: string, y = 1.1): [number, number, number] | null {
  const u = state.units[unitId]
  const m = u?.minis.find((x) => x.id === u.leaderId && x.alive) ?? u?.minis.find((x) => x.alive)
  return m ? [m.pos.x, m.pos.y + y, m.pos.z] : null
}

/** The attacker and defender of the attack a batch plays (from its AttackDeclared). */
let attackPair: { attackerId: string; defenderId: string } | null = null

function floatText(state: DisplayState, unitId: string, text: string, color: string): void {
  if (factor() <= 0) return
  const at = spotOf(state, unitId, 2.4)
  if (!at) return
  spawnFx({ kind: 'text', to: at, color, text, dur: 900 })
  requestRepaint()
}

async function playEvent(ev: GameEvent, b: Batch): Promise<void> {
  const f = factor()
  const state = b.state
  const line = describeEvent(ev, state)
  if (line) pushFeed(ev.seq, ev.seat, line, ev.type === 'DiceRolled')
  trayEvent(ev, state)
  const beat = Math.round(beatMs(ev) * f)
  switch (ev.type) {
    case 'AttackDeclared':
      attackPair = { attackerId: ev.attackerId, defenderId: ev.defenderId }
      break
    case 'PoolFormed': {
      // the volley: a tracer from the attacker to the defender while the dice are on the table
      const from = attackPair ? spotOf(state, attackPair.attackerId) : null
      const to = attackPair ? spotOf(state, attackPair.defenderId) : null
      if (f > 0 && from && to) {
        spawnFx({ kind: 'tracer', from, to, color: colors.theirs, dur: 450 })
        requestRepaint()
        await sleep(Math.round(300 * f))
      }
      break
    }
    case 'WoundsSuffered':
      floatText(state, ev.unitId, `-${ev.n}`, colors.danger)
      await sleep(Math.round(300 * f))
      break
    case 'MiniDefeated':
      floatText(state, ev.unitId, 'Model down', '#ff9f43')
      await sleep(beat)
      break
    case 'UnitDefeated':
      floatText(state, ev.unitId, 'Defeated', colors.danger)
      await sleep(beat)
      break
    case 'SuppressionChanged':
      if (ev.to > ev.from) floatText(state, ev.unitId, `+${ev.to - ev.from} suppression`, '#ff9f43')
      break
    case 'UnitPanicked':
      floatText(state, ev.unitId, 'Panic', colors.danger)
      break
    case 'UnitMoved': {
      if (f > 0 && ev.toolPath.length >= 2) {
        const hinge = ev.toolPath[1]!
        const pts = [{ x: ev.leaderFrom.x, z: ev.leaderFrom.z }, { x: hinge.x, z: hinge.z }, { x: ev.leaderTo.x, z: ev.leaderTo.z }]
        const len = Math.hypot(hinge.x - pts[0]!.x, hinge.z - pts[0]!.z) + Math.hypot(pts[2]!.x - hinge.x, pts[2]!.z - hinge.z)
        const ms = Math.round(moveDurationMs(len) * f)
        const leader = ev.minis.find((m) => state.units[ev.unitId]?.leaderId === m.miniId)
        startMoveAnim(leader?.miniId ?? ev.minis[0]!.miniId, pts, ms)
        await sleep(ms)
      }
      break
    }
    case 'TroopersPlaced': {
      if (f > 0) {
        const prev = pickDisplaySnapshot(usePresentedStore.getState().snapshots, usePresentedStore.getState().presentedSeq)
        const unit = prev?.units[ev.unitId]
        let ms = 0
        for (const m of ev.minis) {
          const old = unit?.minis.find((x) => x.id === m.miniId)
          if (!old) continue
          const d = Math.hypot(old.pos.x - m.pos.x, old.pos.z - m.pos.z)
          if (d < 0.05) continue
          const t = Math.round(moveDurationMs(d) * f)
          ms = Math.max(ms, t)
          startMoveAnim(m.miniId, [{ x: old.pos.x, z: old.pos.z }, { x: m.pos.x, z: m.pos.z }], t)
        }
        await sleep(ms)
      }
      break
    }
    case 'RoundStarted':
      if (f > 0) await holdAnnouncement({ title: `Round ${ev.round}`, subtitle: 'Command phase: pick a command card', seat: null, durationMs: beat })
      break
    case 'CommandCardsRevealed':
      if (f > 0) {
        const parts = (['A', 'B'] as const).filter((s) => ev.picks[s]).map((s) => `${seatName(state, s)}: ${cardName(state.data, ev.picks[s]!)}`)
        await holdAnnouncement({ title: 'Command cards revealed', subtitle: parts.join('   '), seat: null, durationMs: beat })
      }
      break
    case 'PriorityDecided':
      if (f > 0) {
        const pips = (['A', 'B'] as const).filter((s) => ev.pips[s] !== undefined).map((s) => `${seatName(state, s)} ${ev.pips[s]} pip${ev.pips[s] === 1 ? '' : 's'}`)
        await holdAnnouncement({ title: `${seatName(state, ev.holder)} ${seatName(state, ev.holder) === 'You' ? 'have' : 'has'} priority`, subtitle: `${pips.join(' vs ')}${ev.rolloff ? ' (tie: roll-off)' : ''}`, seat: ev.holder as Seat, durationMs: beat })
      }
      break
    case 'GameEnded':
      if (f > 0) await holdAnnouncement({ title: ev.result.winner === 'draw' ? 'A draw' : `${seatName(state, ev.result.winner)} wins`, subtitle: 'The battle is over', seat: ev.result.winner === 'draw' ? null : ev.result.winner, durationMs: beat })
      break
    default:
      await sleep(beat)
  }
}

async function playBatch(b: Batch, gen: number): Promise<void> {
  for (const ev of b.events) {
    if (gen !== generation) return
    await playEvent(ev, b)
  }
}

async function run(): Promise<void> {
  if (running) return
  running = true
  const gen = generation
  try {
    while (queue.length > 0 && gen === generation) {
      const b = queue.shift()!
      await playBatch(b, gen)
      if (gen !== generation) break
      setPresentedSeq(b.seq)
      // the tween ends on the new position, so releasing it after the cursor moves cannot flash the old one
      for (const ev of b.events) {
        if (ev.type === 'UnitMoved') for (const m of ev.minis) endMoveAnim(m.miniId)
        if (ev.type === 'TroopersPlaced') for (const m of ev.minis) endMoveAnim(m.miniId)
      }
      requestRepaint()
    }
  } finally {
    if (gen === generation) {
      running = false
      if (queue.length === 0) {
        catchUpPresented()
        setPresentationIdle(true)
      } else void run()
    }
  }
}

/** Queue one step's events. The store calls this once per accepted action (and once for createGame). */
export function enqueueBatch(batch: Batch): void {
  queue.push(batch)
  setPresentationIdle(false)
  void run()
}

/** New game / abandon: drop everything queued and let the running loop stop. */
export function resetDirector(): void {
  generation++
  queue.length = 0
  running = false
  clearAnnouncement()
  clearAnims()
  clearFx()
  attackPair = null
  trayClear()
  setPresentationIdle(true)
}
