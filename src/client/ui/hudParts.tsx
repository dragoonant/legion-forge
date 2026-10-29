// Pieces shared by the desktop HUD and the phone HUD: the phase words, the seat chip, the speed picker and the tool buttons.
import type { CSSProperties } from 'react'
import type { Seat } from '@/engine'
import { factionName, armyOf, seatName, type Snap } from '../game/labels'
import type { DisplayState } from '../presentation/presentedStore'
import { useSettings, type AnimSpeed } from '../presentation/settings'
import { Keyword } from './Keyword'
import { PoolRow } from './OrderPool'
import { Tooltip } from './Tooltip'
import { colors, panel } from './theme'
import { useUi, type ToolMode } from './uiStore'
import { Btn, seatColor } from './widgets'

export const PHASE_WORD: Record<string, string> = { setup: 'Setup', command: 'Command phase', activation: 'Activation phase', end: 'End phase', ended: 'Battle over' }

export function maxRounds(state: DisplayState): number {
  const fmt = state.data.formats?.[state.origin.setup.format ?? 'recon'] as { rounds?: number } | undefined
  return state.origin.setup.options?.maxRounds ?? fmt?.rounds ?? 0
}

export function unitsLeft(state: DisplayState, seat: Seat): number {
  return Object.values(state.units).filter((u) => u.seat === seat && u.location !== 'defeated').length
}

export function SeatChip({ state, seat }: { state: DisplayState; seat: Seat }) {
  const army = armyOf(state, seat)
  const p = state.players[seat]
  const priority = state.command.priority === seat
  return (
    <div data-testid={`seat-${seat}`} style={{ ...panel, padding: '5px 10px', display: 'flex', flexDirection: 'column', gap: 2, borderTop: `3px solid ${seatColor(seat)}`, fontSize: 12, minWidth: 190 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <b>{seatName(state as Snap, seat)}</b>
        {seatName(state as Snap, seat) === 'You' || seatName(state as Snap, seat) === 'Opponent' ? <span style={{ color: colors.muted }}>{factionName(state.data, army.factionId)}</span> : null}
        {priority && <span data-testid={`priority-${seat}`} style={{ color: colors.accent, fontWeight: 800 }}><Keyword term="Priority">priority</Keyword></span>}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span data-testid={`points-${seat}`}><b style={{ fontSize: 16, color: colors.accent }}>{p.points}</b> <span style={{ color: colors.muted }}>VP</span></span>
        <span style={{ color: colors.muted }}>{unitsLeft(state, seat)} units</span>
        <PoolRow state={state} seat={seat} />
      </div>
    </div>
  )
}

const SPEEDS: { id: AnimSpeed; label: string; body: string }[] = [
  { id: 'normal', label: 'Normal', body: 'Full pacing: banners, dice and movement play out.' },
  { id: 'fast', label: 'Fast', body: 'Short beats: you still see each result go by.' },
  { id: 'instant', label: 'Instant', body: 'No waiting: banners, tweens and pauses are skipped.' },
]

export function SpeedPicker() {
  const speed = useSettings((s) => s.animSpeed)
  const setSpeed = useSettings((s) => s.setAnimSpeed)
  return (
    <div role="radiogroup" aria-label="Speed" data-testid="speed-picker" style={{ display: 'flex', gap: 3 }}>
      {SPEEDS.map((o) => (
        <Tooltip key={o.id} title={`${o.label} speed`} body={o.body}>
          <Btn role="radio" aria-checked={speed === o.id} data-testid={`speed-${o.id}`} variant={speed === o.id ? 'active' : 'base'} onClick={() => setSpeed(o.id)} style={tbtn}>
            {o.label}
          </Btn>
        </Tooltip>
      ))}
    </div>
  )
}

export const tbtn: CSSProperties = { padding: '4px 9px', fontSize: 12 }

export function ToolButton({ id, label, body, mode }: { id: string; label: string; body: string; mode: ToolMode }) {
  const tool = useUi((s) => s.tool)
  return (
    <Tooltip title={label} body={body}>
      <Btn
        data-testid={id}
        aria-pressed={tool === mode}
        variant={tool === mode ? 'active' : 'base'}
        onClick={() => useUi.setState({ tool: tool === mode ? 'none' : mode, losPair: [], rulerPoint: null })}
        style={tbtn}
      >
        {label}
      </Btn>
    </Tooltip>
  )
}

