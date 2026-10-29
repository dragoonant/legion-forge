// The phone layout of the battle HUD (form factor `compact`): a 48 px top bar (both seats and the round), a column of 44 px buttons on the
// LEFT edge, and right-edge drawers for the tools, the log, the objectives, the unit card and the menu. Nothing is placed in the
// top-right corner (the system overlay covers it on the owner's phones); drawers close with a button at their top-LEFT.
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import type { Seat } from '@/engine'
import { factionName, seatName, armyOf, type Snap } from '../game/labels'
import { useDisplayState, type DisplayState } from '../presentation/presentedStore'
import { useSettings } from '../presentation/settings'
import { useGame } from '../store/game'
import { useSession } from '../store/session'
import { isWatching } from '../store/pacing'
import { EventFeed } from './EventFeed'
import { Keyword } from './Keyword'
import { ObjectiveBody } from './ObjectiveTracker'
import { UnitCardView } from './UnitCard'
import { PHASE_WORD, SpeedPicker, ToolButton, maxRounds, tbtn, unitsLeft } from './hudParts'
import { OVERLAY_W } from './hudLayout'
import { useFormFactor } from './formFactor'
import { colors, fontStack, panel } from './theme'
import { useUi, type Drawer } from './uiStore'
import { Btn, seatColor } from './widgets'

const BAR_H = 48
const COL_TOP = BAR_H + 10

function Chip({ state, seat }: { state: DisplayState; seat: Seat }) {
  const p = state.players[seat]
  const army = armyOf(state as Snap, seat)
  const name = seatName(state as Snap, seat)
  const priority = state.command.priority === seat
  return (
    <div data-testid={`seat-${seat}`} style={{ ...panel, flex: '1 1 0', minWidth: 0, height: BAR_H, boxSizing: 'border-box', padding: '4px 8px', borderTop: `3px solid ${seatColor(seat)}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', fontSize: 11, lineHeight: 1.25, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', whiteSpace: 'nowrap' }}>
        <b style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name === 'You' || name === 'Opponent' ? name : factionName(state.data, army.factionId)}</b>
        {priority && <span data-testid={`priority-${seat}`} style={{ color: colors.accent, fontWeight: 800 }}><Keyword term="Priority">priority</Keyword></span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', whiteSpace: 'nowrap', color: colors.muted }}>
        <span data-testid={`points-${seat}`}><b style={{ fontSize: 15, color: colors.accent }}>{p.points}</b> VP</span>
        <span>{unitsLeft(state, seat)} units</span>
        <span data-testid={`pool-${seat}`} data-size={p.pool.size}>pool <b style={{ color: seatColor(seat) }}>{p.pool.size}</b></span>
      </div>
    </div>
  )
}

/** The 48 px top bar. It stops short of the top-right corner on a touch screen. */
export function CompactBar({ state }: { state: DisplayState }) {
  const { touch } = useFormFactor()
  const viewer = useGame((s) => s.viewer)
  const other: Seat = viewer === 'A' ? 'B' : 'A'
  const rounds = maxRounds(state)
  return (
    <div className="lf-touch" data-testid="compact-bar" style={{ position: 'absolute', top: 6, left: 8, right: touch ? OVERLAY_W + 8 : 8, height: BAR_H, display: 'flex', gap: 6, pointerEvents: 'none', zIndex: 20, fontFamily: fontStack }}>
      <div style={{ display: 'flex', flex: '1 1 0', minWidth: 0, pointerEvents: 'auto' }}><Chip state={state} seat={viewer} /></div>
      <div data-testid="hud-banner" style={{ ...panel, flex: '0 0 auto', height: BAR_H, boxSizing: 'border-box', padding: '4px 10px', textAlign: 'center', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div data-testid="hud-round" style={{ fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>{state.round > 0 ? `Round ${state.round}${rounds ? ` of ${rounds}` : ''}` : 'Setup'}</div>
        <div data-testid="hud-phase" style={{ fontSize: 10, color: colors.muted, whiteSpace: 'nowrap' }}>{state.round > 0 ? (PHASE_WORD[state.phase] ?? state.phase) : 'Choose edge and deploy'}</div>
      </div>
      <div style={{ display: 'flex', flex: '1 1 0', minWidth: 0, pointerEvents: 'auto' }}><Chip state={state} seat={other} /></div>
    </div>
  )
}

const col: CSSProperties = { position: 'absolute', top: COL_TOP, left: 'max(8px, var(--safe-left, 0px))', display: 'flex', flexDirection: 'column', gap: 6, zIndex: 25, pointerEvents: 'none' }

const BUTTONS: { id: Drawer; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'log', label: 'Log' },
  { id: 'goals', label: 'Goals' },
  { id: 'more', label: 'More' },
]

/** The left-edge column of drawer buttons (44 px targets). */
export function CompactColumn() {
  const drawer = useUi((s) => s.drawer)
  return (
    <div className="lf-touch" data-testid="compact-column" style={col}>
      {BUTTONS.map((b) => (
        <button
          key={b.id}
          type="button"
          data-testid={`drawer-${b.id}`}
          aria-pressed={drawer === b.id}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => useUi.setState({ drawer: drawer === b.id ? null : b.id })}
          style={{ ...panel, width: 48, height: 44, minHeight: 44, padding: 0, fontSize: 11, fontWeight: 700, cursor: 'pointer', pointerEvents: 'auto', color: drawer === b.id ? colors.accent : colors.text, borderColor: drawer === b.id ? colors.accent : colors.border }}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

const DRAWER_TITLE: Record<Drawer, string> = { tools: 'Camera and tools', log: 'What happened', goals: 'Objectives', card: 'Unit', more: 'Menu' }

function DrawerShell({ id, children }: { id: Drawer; children: ReactNode }) {
  const reduce = useSettings((s) => s.reduceMotion)
  const close = () => useUi.setState(id === 'card' ? { drawer: null, selected: null } : { drawer: null })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return (
    <div
      className="lf-touch"
      data-testid={`drawer-panel-${id}`}
      data-drawer={id}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ ...panel, position: 'absolute', top: BAR_H + 12, right: 'max(0px, var(--safe-right, 0px))', bottom: 6, width: 'min(330px, 64vw)', borderRadius: '10px 0 0 10px', display: 'flex', flexDirection: 'column', zIndex: 38, pointerEvents: 'auto', boxSizing: 'border-box', animation: reduce ? undefined : 'lf-drawer-in 160ms ease-out' }}
    >
      <style>{'@keyframes lf-drawer-in { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, flex: '0 0 auto' }}>
        <Btn data-testid="drawer-close" onClick={close} aria-label="Close the drawer" style={{ padding: '4px 12px' }}>Close</Btn>
        <b style={{ fontSize: 14 }}>{DRAWER_TITLE[id]}</b>
      </div>
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', scrollbarWidth: 'none', overscrollBehavior: 'contain', padding: 8 }}>{children}</div>
    </div>
  )
}

function ToolsDrawer() {
  const requestCamera = useUi((s) => s.requestCamera)
  const watching = useGame((s) => isWatching(s.seats))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Camera</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Btn data-testid="cam-home" onClick={() => requestCamera('home')} style={tbtn}>Home</Btn>
          <Btn data-testid="cam-top" onClick={() => requestCamera('top')} style={tbtn}>Top</Btn>
          <Btn data-testid="cam-left" onClick={() => requestCamera('left')} style={tbtn}>Turn left</Btn>
          <Btn data-testid="cam-right" onClick={() => requestCamera('right')} style={tbtn}>Turn right</Btn>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Measure</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <ToolButton id="tool-ruler" label="Ruler" mode="ruler" body="Rings at each 6 inch range band from the selected unit; tap a point for its exact distance." />
          <ToolButton id="tool-los" label="Sight lines" mode="los" body="Pick two units: the engine draws its rays and gives the cover verdict." />
        </div>
      </div>
      {!watching && (
        <div>
          <div style={{ fontSize: 11, color: colors.muted, marginBottom: 4 }}>Speed</div>
          <SpeedPicker />
        </div>
      )}
    </div>
  )
}

function CardDrawer() {
  const state = useDisplayState()
  const id = useUi((s) => s.selected)
  const u = state && id ? state.units[id] : undefined
  if (!state || !u) return <div style={{ color: colors.muted, fontSize: 13 }}>Tap a unit on the board to read its card.</div>
  return <UnitCardView d={state.data} typeId={u.unitTypeId} upgrades={u.upgrades} live={u} state={state} compact={false} style={{ width: '100%' }} />
}

export function MenuButtons({ onDone }: { onDone?: () => void }) {
  const hidden = useUi((s) => s.uiHidden)
  const go = (p: Partial<ReturnType<typeof useUi.getState>>) => {
    useUi.setState(p)
    onDone?.()
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Btn data-testid="menu-settings" onClick={() => go({ settingsOpen: true })}>Settings</Btn>
      <Btn data-testid="menu-howto" onClick={() => go({ helpOpen: true })}>How to play</Btn>
      <Btn data-testid="menu-hide" onClick={() => go({ uiHidden: !hidden })}>Hide the panels</Btn>
      <Btn
        data-testid="menu-exit"
        onClick={() => {
          onDone?.()
          useSession.getState().backToMenu()
        }}
      >
        Save and go to the main menu
      </Btn>
    </div>
  )
}

/** The open drawer, if any. On a phone a tapped unit opens the card drawer by itself (unless a unit is being picked). */
export function Drawers() {
  const drawer = useUi((s) => s.drawer)
  const selected = useUi((s) => s.selected)
  const pick = useUi((s) => s.pick)
  useEffect(() => {
    if (selected && !pick) useUi.setState({ drawer: 'card' })
    else if (!selected && useUi.getState().drawer === 'card') useUi.setState({ drawer: null })
  }, [selected, pick])
  if (!drawer) return null
  return (
    <DrawerShell id={drawer}>
      {drawer === 'tools' && <ToolsDrawer />}
      {drawer === 'log' && <EventFeed fill />}
      {drawer === 'goals' && <ObjectiveBody />}
      {drawer === 'card' && <CardDrawer />}
      {drawer === 'more' && <MenuButtons onDone={() => useUi.setState({ drawer: null })} />}
    </DrawerShell>
  )
}
