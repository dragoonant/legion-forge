// The battle HUD: no top bar proper, a banner strip with round, phase and priority, each seat's score, order pool and units left, and
// a toolbar (camera presets, range ruler, LoS tool, feed, briefing, hide). Everything is read from the display state (the presented
// cursor), so a score never shows before its beat.
import type { CSSProperties } from 'react'
import type { Seat } from '@/engine'
import { factionName, armyOf, seatName, type Snap } from '../game/labels'
import { useDisplayState, type DisplayState } from '../presentation/presentedStore'
import { useSettings, type AnimSpeed } from '../presentation/settings'
import { useGame } from '../store/game'
import { isWatching } from '../store/pacing'
import { Keyword } from './Keyword'
import { PoolRow } from './OrderPool'
import { Tooltip } from './Tooltip'
import { useFormFactor } from './formFactor'
import { colors, fontStack, panel } from './theme'
import { useUi, type ToolMode } from './uiStore'
import { Btn, seatColor } from './widgets'

const PHASE_WORD: Record<string, string> = { setup: 'Setup', command: 'Command phase', activation: 'Activation phase', end: 'End phase', ended: 'Battle over' }

function maxRounds(state: DisplayState): number {
  const fmt = state.data.formats?.[state.origin.setup.format ?? 'recon'] as { rounds?: number } | undefined
  return state.origin.setup.options?.maxRounds ?? fmt?.rounds ?? 0
}

function unitsLeft(state: DisplayState, seat: Seat): number {
  return Object.values(state.units).filter((u) => u.seat === seat && u.location !== 'defeated').length
}

function SeatChip({ state, seat }: { state: DisplayState; seat: Seat }) {
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

function SpeedPicker() {
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

const tbtn: CSSProperties = { padding: '4px 9px', fontSize: 12 }

function ToolButton({ id, label, body, mode }: { id: string; label: string; body: string; mode: ToolMode }) {
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

export function BattleHud() {
  const state = useDisplayState()
  const ff = useFormFactor()
  const watching = useGame((s) => isWatching(s.seats))
  const viewer = useGame((s) => s.viewer)
  const feedOpen = useUi((s) => s.feedOpen)
  const briefingOpen = useUi((s) => s.briefingOpen)
  const requestCamera = useUi((s) => s.requestCamera)
  if (!state) return null
  const other: Seat = viewer === 'A' ? 'B' : 'A'
  const rounds = maxRounds(state)
  return (
    <div className="lf-touch" style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', gap: 8, alignItems: 'flex-start', pointerEvents: 'none', zIndex: 20, flexWrap: 'wrap', fontFamily: fontStack }}>
      <div style={{ pointerEvents: 'auto' }}><SeatChip state={state} seat={viewer} /></div>
      <div data-testid="hud-banner" style={{ ...panel, padding: '5px 14px', textAlign: 'center', pointerEvents: 'auto', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div data-testid="hud-round" style={{ fontWeight: 800, fontSize: 15 }}>{state.round > 0 ? `Round ${state.round}${rounds ? ` of ${rounds}` : ''}` : 'Setup'}</div>
        <div data-testid="hud-phase" style={{ fontSize: 11, color: colors.muted }}>{state.round > 0 ? (PHASE_WORD[state.phase] ?? state.phase) : 'Choose edge and deploy'}</div>
      </div>
      <div style={{ pointerEvents: 'auto' }}><SeatChip state={state} seat={other} /></div>
      {!ff.compact && (
        <div style={{ ...panel, padding: '4px 6px', display: 'flex', gap: 4, pointerEvents: 'auto', flexWrap: 'wrap', maxWidth: 420 }}>
          <Btn data-testid="cam-home" onClick={() => requestCamera('home')} style={tbtn}>Home</Btn>
          <Btn data-testid="cam-top" onClick={() => requestCamera('top')} style={tbtn}>Top</Btn>
          <Btn data-testid="cam-left" onClick={() => requestCamera('left')} style={tbtn}>Turn left</Btn>
          <Btn data-testid="cam-right" onClick={() => requestCamera('right')} style={tbtn}>Turn right</Btn>
          <ToolButton id="tool-ruler" label="Ruler" mode="ruler" body="Rings at each 6 inch range band from the selected unit; click a point for its exact distance. Key M cycles the tools." />
          <ToolButton id="tool-los" label="Sight lines" mode="los" body="Pick two units: the engine draws its rays and gives the cover verdict." />
          <Btn data-testid="toggle-feed" aria-pressed={feedOpen} variant={feedOpen ? 'active' : 'base'} onClick={() => useUi.setState({ feedOpen: !feedOpen })} style={tbtn}>Log</Btn>
          {!watching && <SpeedPicker />}
          <Btn data-testid="toggle-briefing" aria-pressed={briefingOpen} variant={briefingOpen ? 'active' : 'base'} onClick={() => useUi.setState({ briefingOpen: !briefingOpen })} style={tbtn}>Objectives</Btn>
        </div>
      )}
      {watching && <div style={{ ...panel, padding: '4px 10px', fontSize: 12, color: colors.muted, pointerEvents: 'none' }}>Watching two bots</div>}
    </div>
  )
}
