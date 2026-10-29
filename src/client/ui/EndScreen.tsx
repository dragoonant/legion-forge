// End screen: the result, the round count, each seat's objective points and what is left of each army. The numbers come from the
// engine's result and the final state; names from data. Polished in M7.
import type { Seat } from '@/engine'
import { factionName, seatName, unitLabel, armyOf, type Snap } from '../game/labels'
import { useDisplayState } from '../presentation/presentedStore'
import { useGame } from '../store/game'
import { isWatching } from '../store/pacing'
import { useSession } from '../store/session'
import { colors, panel } from './theme'
import { Btn, seatColor } from './widgets'

const REASON: Record<string, string> = { battle: 'The battle ran its course.', resign: 'A seat resigned.', concede: 'A seat conceded.', roundLimit: 'The last round ended.' }

export function EndScreen() {
  const state = useDisplayState()
  const result = useGame((s) => s.state?.result ?? null)
  const watching = useGame((s) => isWatching(s.seats))
  const session = useSession()
  if (!state || !result) return null
  const snap = state as Snap
  const headline = result.winner === 'draw' ? 'The battle is a draw' : `${seatName(snap, result.winner)} ${seatName(snap, result.winner) === 'You' ? 'win' : 'wins'}`
  const lost = (seat: Seat) => Object.values(state.units).filter((u) => u.seat === seat && u.location === 'defeated')
  const left = (seat: Seat) => Object.values(state.units).filter((u) => u.seat === seat && u.location !== 'defeated')
  return (
    <div className="lf-touch" data-testid="end-screen" style={{ position: 'absolute', inset: 0, background: 'rgba(8,10,16,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: 10, boxSizing: 'border-box', pointerEvents: 'auto' }}>
      <div style={{ ...panel, padding: 22, width: 'min(560px, 100%)', maxHeight: '92vh', overflowY: 'auto', scrollbarWidth: 'none' }}>
        <h1 data-testid="result" data-winner={result.winner} style={{ margin: 0, fontSize: 28, color: colors.accent }}>{headline}</h1>
        <p style={{ color: colors.muted, margin: '4px 0 12px' }}>{REASON[result.reason] ?? ''} Round {state.round}.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(['A', 'B'] as const).map((s) => (
            <div key={s} style={{ flex: '1 1 220px', borderTop: `3px solid ${seatColor(s)}`, background: 'rgba(255,255,255,0.04)', padding: '8px 10px', borderRadius: 6 }}>
              <div style={{ fontWeight: 800 }}>{seatName(snap, s)}</div>
              <div style={{ fontSize: 12, color: colors.muted }}>{factionName(state.data, armyOf(snap, s).factionId)}</div>
              <div data-testid={`final-points-${s}`} style={{ fontSize: 26, fontWeight: 800, color: colors.accent }}>{result.points[s]} <span style={{ fontSize: 12, color: colors.muted }}>VP</span></div>
              <div style={{ fontSize: 12 }}>Standing: {left(s).map((u) => unitLabel(snap, u.id)).join(', ') || 'none'}</div>
              <div style={{ fontSize: 12, color: colors.muted }}>Lost: {lost(s).map((u) => unitLabel(snap, u.id)).join(', ') || 'none'}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Btn data-testid="back-to-menu" onClick={() => session.backToMenu()}>Main menu</Btn>
          <Btn data-testid="play-again" variant="primary" onClick={() => session.playAgain()}>{watching ? 'Watch another' : 'Play again'}</Btn>
        </div>
      </div>
    </div>
  )
}
