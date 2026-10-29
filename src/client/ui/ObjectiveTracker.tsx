// Objective and VP tracker: the drawn battle cards in our words (from data), the score of each seat, the round, the instant-win line.
// Opened from the HUD's Objectives button; `data-testid="objective-tracker"` for the e2e specs.
import type { Seat } from '@/engine'
import { battleCardName, battleCardText, seatName, type Snap } from '../game/labels'
import { useDisplayState, type DisplayState } from '../presentation/presentedStore'
import { useGame } from '../store/game'
import { useFormFactor } from './formFactor'
import { Rich } from './Keyword'
import { Pill } from './promptParts'
import { colors, fontStack, panel } from './theme'
import { useUi } from './uiStore'
import { Btn, seatColor } from './widgets'

interface Cards {
  objective: string
  secondary: string
  mine: string
  theirs: string
}

export function cardsOf(state: DisplayState, viewer: Seat): Cards | null {
  const d = state.battle.data as { objective?: string; secondary?: string; advantage?: Record<Seat, string> }
  if (!d.objective) return null
  const other: Seat = viewer === 'A' ? 'B' : 'A'
  return { objective: d.objective, secondary: d.secondary ?? '', mine: d.advantage?.[viewer] ?? '', theirs: d.advantage?.[other] ?? '' }
}

function CardBlock({ state, id, label }: { state: DisplayState; id: string; label: string }) {
  if (!id) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontWeight: 800 }}>{battleCardName(state.data, id)}</div>
      <div style={{ fontSize: 12, lineHeight: 1.4 }}><Rich text={battleCardText(state.data, id)} d={state.data} /></div>
    </div>
  )
}

/** The objectives and scores (shared by the desktop panel and the phone drawer). */
export function ObjectiveBody() {
  const state = useDisplayState()
  const viewer = useGame((s) => s.viewer)
  if (!state) return null
  const cards = cardsOf(state, viewer)
  const fmt = state.data.formats?.[state.origin.setup.format ?? 'recon'] as { instantWinVp?: number; rounds?: number } | undefined
  return (
    <div data-testid="objective-body">
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['A', 'B'] as const).map((s) => (
          <div key={s} style={{ flex: 1, borderTop: `3px solid ${seatColor(s)}`, background: 'rgba(255,255,255,0.04)', padding: '4px 8px', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: colors.muted }}>{seatName(state as Snap, s)}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.accent }}>{state.players[s].points} <span style={{ fontSize: 11, color: colors.muted }}>VP</span></div>
          </div>
        ))}
      </div>
      {fmt?.instantWinVp ? <div style={{ fontSize: 11, color: colors.muted, marginBottom: 8 }}>First to {fmt.instantWinVp} VP wins at once; otherwise the higher score after round {fmt.rounds}.</div> : null}
      {cards ? (
        <>
          <CardBlock state={state} id={cards.objective} label="Objective" />
          <CardBlock state={state} id={cards.secondary} label="Secondary objective" />
          <CardBlock state={state} id={cards.mine} label="Your advantage" />
          <CardBlock state={state} id={cards.theirs} label="Their advantage" />
        </>
      ) : (
        <Pill kind="muted" label="Battle cards are drawn once the table edge is chosen" />
      )}
    </div>
  )
}

export function ObjectiveTracker() {
  const open = useUi((s) => s.briefingOpen)
  const { compact } = useFormFactor()
  if (!open || compact) return null
  return (
    <div className="lf-touch" data-testid="objective-tracker" style={{ ...panel, position: 'absolute', top: 76, right: 8, width: 'min(380px, calc(100vw - 16px))', maxHeight: 'calc(100vh - 150px)', overflowY: 'auto', scrollbarWidth: 'none', padding: 12, fontFamily: fontStack, pointerEvents: 'auto', zIndex: 35, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <b style={{ fontSize: 15 }}>Objectives</b>
        <Btn onClick={() => useUi.setState({ briefingOpen: false })} style={{ padding: '2px 8px' }}>Close</Btn>
      </div>
      <ObjectiveBody />
    </div>
  )
}
