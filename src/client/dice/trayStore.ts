// Dice tray state. Only the presentation director writes it (so a roll shows when its beat plays, never early). One row per
// physical roll, appended as the roll's event plays; a new attack clears the tray and it folds away a few seconds after its last row.
import { create } from 'zustand'
import type { Seat } from '@/engine'
import { speedFactor } from '../presentation/settings'

/** `atk` = attack d8, `def` = defence d6, `d6` = a plain d6; colour is null for a plain die. */
export interface TrayDie {
  side: 'atk' | 'def' | 'd6'
  colour: 'red' | 'black' | 'white' | null
  /** the face name off the event: hit, crit, surge, blank, block, or a pip count for a plain die */
  face: string
}

export type RowKind = 'attack' | 'defence' | 'cover' | 'rally' | 'priority' | 'other'

export interface TrayRow {
  id: number
  kind: RowKind
  seat: Seat | null
  /** "Attack roll", "Reroll", "Defence roll"... */
  label: string
  dice: TrayDie[]
  /** a one-line outcome from the engine (Compared), or '' */
  verdict: string
  /** the die set that replaced an earlier one (reroll) */
  reroll: boolean
}

export interface TrayState {
  title: string
  rows: TrayRow[]
  /** bumps on every change so the tray can restart small animations */
  rev: number
}

export const TRAY_ROW_LIMIT = 8
/** How long the tray stays after its last row (ms). */
export const TRAY_LINGER_MS = 7000

const EMPTY: TrayState = { title: '', rows: [], rev: 0 }

export const useTray = create<TrayState>(() => ({ ...EMPTY }))

let nextId = 1
let timer: ReturnType<typeof setTimeout> | null = null
/** While true (a watched game is paused) the tray stays up however long it has been there. */
let held = false

export function setTrayHold(on: boolean): void {
  held = on
  if (!on && useTray.getState().rows.length > 0) arm()
}

function arm(): void {
  if (timer !== null) clearTimeout(timer)
  const linger = Math.round(TRAY_LINGER_MS * Math.max(1, speedFactor()))
  timer = typeof setTimeout === 'undefined' ? null : setTimeout(() => (held ? arm() : trayClear()), linger)
}

export function trayBegin(title: string): void {
  useTray.setState((s) => ({ title, rows: [], rev: s.rev + 1 }))
  arm()
}

export function trayClear(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
  useTray.setState((s) => (s.rows.length === 0 && !s.title ? s : { ...EMPTY, rev: s.rev + 1 }))
}

export function trayRow(row: Omit<TrayRow, 'id'>): void {
  useTray.setState((s) => ({ ...s, rows: [...s.rows, { ...row, id: nextId++ }].slice(-TRAY_ROW_LIMIT), rev: s.rev + 1 }))
  arm()
}

/** Put the engine's own outcome sentence on the last row. */
export function trayVerdict(verdict: string): void {
  useTray.setState((s) => {
    if (s.rows.length === 0) return s
    const rows = s.rows.slice()
    rows[rows.length - 1] = { ...rows[rows.length - 1]!, verdict }
    return { ...s, rows, rev: s.rev + 1 }
  })
  arm()
}

/** Add dice to the last row when it has the same label and no outcome yet (one pool rolled colour by colour). True when merged. */
export function trayMerge(label: string, dice: TrayDie[]): boolean {
  const { rows } = useTray.getState()
  const last = rows[rows.length - 1]
  if (!last || last.label !== label || last.verdict || !['attack', 'defence', 'cover'].includes(last.kind)) return false
  useTray.setState((s) => {
    const next = s.rows.slice()
    next[next.length - 1] = { ...last, dice: [...last.dice, ...dice] }
    return { ...s, rows: next, rev: s.rev + 1 }
  })
  arm()
  return true
}
