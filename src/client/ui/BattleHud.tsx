// The battle HUD: no top bar proper, a banner strip with round, phase and priority, each seat's score, order pool and units left, and
// a toolbar (camera presets, range ruler, LoS tool, feed, briefing, hide). Everything is read from the display state (the presented
// cursor), so a score never shows before its beat.
import type { Seat } from '@/engine'
import { useDisplayState } from '../presentation/presentedStore'
import { useGame } from '../store/game'
import { useSession } from '../store/session'
import { isWatching } from '../store/pacing'
import { PHASE_WORD, SeatChip, SpeedPicker, ToolButton, maxRounds, tbtn } from './hudParts'
import { useFormFactor } from './formFactor'
import { colors, fontStack, panel } from './theme'
import { useUi, type ToolMode } from './uiStore'
import { CompactBar } from './CompactHud'
import { Btn, seatColor } from './widgets'

export function BattleHud() {
  const state = useDisplayState()
  const ff = useFormFactor()
  const watching = useGame((s) => isWatching(s.seats))
  const viewer = useGame((s) => s.viewer)
  const feedOpen = useUi((s) => s.feedOpen)
  const briefingOpen = useUi((s) => s.briefingOpen)
  const requestCamera = useUi((s) => s.requestCamera)
  if (!state) return null
  if (ff.compact) return <CompactBar state={state} />
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
          <Btn data-testid="open-howto" onClick={() => useUi.setState({ helpOpen: true })} style={tbtn}>Help</Btn>
          <Btn data-testid="open-settings" onClick={() => useUi.setState({ settingsOpen: true })} style={tbtn}>Settings</Btn>
          <Btn data-testid="menu-exit" onClick={() => useSession.getState().backToMenu()} style={tbtn}>Save and quit</Btn>
      </div>
      {watching && <div style={{ ...panel, padding: '4px 10px', fontSize: 12, color: colors.muted, pointerEvents: 'none' }}>Watching two bots</div>}
    </div>
  )
}
