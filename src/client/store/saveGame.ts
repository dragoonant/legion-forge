// Save and Continue. One versioned envelope in localStorage holds the engine's own save (setup, seed, action log, final hash), the
// seats, bot tier, army lists and battle cards chosen on the start screen, and the ledger. The Continue card reads the small
// `summary` without replaying. Continuing replays the log; a save that no longer replays to the same hash (rules or data changed) is
// discarded with a notice. Every storage access is guarded: private windows and node tests have none.
import { load as engineLoad, ENGINE_VERSION, type GameState, type SaveFile, type Seat, type StepResult } from '@/engine'
import { engineBundle, type SeatBuild } from '../game/adapter'
import type { BotTier, SeatMode } from '../params'
import { parseLedger, type Ledger } from './ledger'

export const SAVE_KEY = 'legionforge.save.v1'
export const SAVE_VERSION = 1

export interface SaveSummary {
  yourFaction: string
  theirFaction: string
  round: number
  phase: string
  tier: BotTier
}

export interface SaveEnvelope {
  v: typeof SAVE_VERSION
  /** ms since the epoch */
  savedAt: number
  engineVersion: string
  file: SaveFile
  seats: Record<Seat, SeatMode>
  tier: BotTier
  builds: Record<Seat, SeatBuild>
  battle: string[] | null
  ledger: Ledger
  summary: SaveSummary
}

export interface SaveInput {
  state: GameState
  file: SaveFile
  seats: Record<Seat, SeatMode>
  tier: BotTier
  builds: Record<Seat, SeatBuild>
  battle: string[] | null
  ledger: Ledger
  viewer: Seat
  now?: number
}

const factionOfSeat = (state: Pick<GameState, 'origin'>, seat: Seat): string => state.origin.setup.armies[seat].factionId

export function buildEnvelope(i: SaveInput): SaveEnvelope {
  const other: Seat = i.viewer === 'A' ? 'B' : 'A'
  return {
    v: SAVE_VERSION,
    savedAt: i.now ?? Date.now(),
    engineVersion: ENGINE_VERSION,
    file: i.file,
    seats: { ...i.seats },
    tier: i.tier,
    builds: { A: { ...i.builds.A }, B: { ...i.builds.B } },
    battle: i.battle ? [...i.battle] : null,
    ledger: i.ledger,
    summary: { yourFaction: factionOfSeat(i.state, i.viewer), theirFaction: factionOfSeat(i.state, other), round: i.state.round, phase: i.state.phase, tier: i.tier },
  }
}

/** Is `raw` an envelope of the shape this version writes? Returns it typed, or null. */
export function parseEnvelope(raw: unknown): SaveEnvelope | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Partial<SaveEnvelope>
  if (e.v !== SAVE_VERSION || typeof e.savedAt !== 'number' || typeof e.engineVersion !== 'string') return null
  const f = e.file as Partial<SaveFile> | undefined
  if (!f || f.version !== 1 || typeof f.seed !== 'string' || !Array.isArray(f.actions) || typeof f.finalHash !== 'string' || !f.setup) return null
  const seats = e.seats
  if (!seats || (seats.A !== 'human' && seats.A !== 'bot') || (seats.B !== 'human' && seats.B !== 'bot')) return null
  const b = e.builds
  if (!b || typeof b.A?.listId !== 'string' || typeof b.B?.listId !== 'string') return null
  const s = e.summary
  if (!s || typeof s.yourFaction !== 'string' || typeof s.theirFaction !== 'string' || typeof s.round !== 'number' || typeof s.phase !== 'string') return null
  const tier: BotTier = e.tier === 'random' || e.tier === 'easy' || e.tier === 'normal' || e.tier === 'hard' ? e.tier : 'normal'
  return {
    v: SAVE_VERSION,
    savedAt: e.savedAt,
    engineVersion: e.engineVersion,
    file: f as SaveFile,
    seats: { A: seats.A, B: seats.B },
    tier,
    builds: { A: { listId: b.A.listId }, B: { listId: b.B.listId } },
    battle: Array.isArray(e.battle) ? e.battle.filter((x): x is string => typeof x === 'string') : null,
    ledger: parseLedger(e.ledger),
    summary: { yourFaction: s.yourFaction, theirFaction: s.theirFaction, round: s.round, phase: s.phase, tier },
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function writeSave(env: SaveEnvelope): boolean {
  const st = storage()
  if (!st) return false
  try {
    st.setItem(SAVE_KEY, JSON.stringify(env))
    return true
  } catch {
    return false // quota or blocked storage: the game goes on, it just cannot be continued
  }
}

export function readSave(): SaveEnvelope | null {
  const st = storage()
  if (!st) return null
  try {
    const raw = st.getItem(SAVE_KEY)
    return raw ? parseEnvelope(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}

export type RestoreResult = { ok: true; result: StepResult } | { ok: false; reason: string }

/** Replay the saved log. Any failure (a refused action, a different final hash, another engine version) is a reason, not a throw. */
export function restoreSave(env: SaveEnvelope): RestoreResult {
  if (env.engineVersion !== ENGINE_VERSION) return { ok: false, reason: 'It was saved by a different version of the rules engine.' }
  try {
    return { ok: true, result: engineLoad(env.file, engineBundle()) }
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: /hash mismatch/.test(why) ? 'The rules or data changed since it was saved, so it no longer plays out the same.' : `It could not be replayed (${why}).` }
  }
}

/** "3 minutes ago" for the Continue card (pure, takes `now`). */
export function ago(savedAt: number, now: number): string {
  const s = Math.max(0, Math.round((now - savedAt) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
