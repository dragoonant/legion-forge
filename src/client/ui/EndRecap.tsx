// The end-screen recap: victory points by card and round, the units each side lost, and a reveal of every hidden decision the AI made
// (its command card each round and the order tokens it drew), so the human can audit what the opponent did behind the screen.
// Everything is read from the store's ledger (unredacted events of the whole battle); names come from data.
import type { CSSProperties } from 'react'
import type { Seat } from '@/engine'
import { battleCardName, cardName, rankName, reasonText, seatName, unitLabel, type Snap } from '../game/labels'
import { hiddenDecisions, roundsScored, unitsLost, vpByCard, type Ledger } from '../store/ledger'
import type { DisplayState } from '../presentation/presentedStore'
import { Rich } from './Keyword'
import { colors } from './theme'
import { seatColor } from './widgets'

const th: CSSProperties = { textAlign: 'center', padding: '3px 6px', fontWeight: 700, fontSize: 11, color: colors.muted, whiteSpace: 'nowrap' }
const td: CSSProperties = { textAlign: 'center', padding: '3px 6px', borderTop: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <details open data-testid={`recap-${id}`} style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 14, color: colors.accent, minHeight: 28 }}>{title}</summary>
      <div style={{ marginTop: 6 }}>{children}</div>
    </details>
  )
}

function cardLabel(state: DisplayState, id: string): string {
  return state.data.battleCards[id] ? battleCardName(state.data, id) : reasonText(state.data, id)
}

export function VpTable({ state, ledger }: { state: DisplayState; ledger: Ledger }) {
  const rows = vpByCard(ledger)
  const rounds = roundsScored(ledger)
  const snap = state as Snap
  if (rows.length === 0) return <div style={{ color: colors.muted, fontSize: 13 }}>Nobody scored a point.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table data-testid="vp-table" style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Card</th>
            {rounds.map((r) => (
              <th key={r} style={th}>Round {r}</th>
            ))}
            <th style={th}>Total</th>
          </tr>
          <tr>
            <th style={th} />
            {[...rounds, 0].map((r) => (
              <th key={r} style={th}>
                <span style={{ color: seatColor('A') }}>{seatName(snap, 'A') === 'You' ? 'You' : 'A'}</span> / <span style={{ color: seatColor('B') }}>{seatName(snap, 'B') === 'Opponent' ? 'Opp.' : 'B'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.card} data-testid={`vp-row-${row.card}`}>
              <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}><Rich text={cardLabel(state, row.card)} d={state.data} /></td>
              {rounds.map((r) => (
                <td key={r} style={td}>
                  {row.byRound[r] ? `${row.byRound[r]!.A} / ${row.byRound[r]!.B}` : '-'}
                </td>
              ))}
              <td style={{ ...td, fontWeight: 800 }}>{row.total.A} / {row.total.B}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LostList({ state, ledger, seat }: { state: DisplayState; ledger: Ledger; seat: Seat }) {
  const lost = unitsLost(ledger, seat)
  const snap = state as Snap
  return (
    <div data-testid={`lost-${seat}`} style={{ flex: '1 1 200px', borderTop: `3px solid ${seatColor(seat)}`, background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}>
      <div style={{ fontWeight: 800 }}>{seatName(snap, seat)} lost {lost.length} unit{lost.length === 1 ? '' : 's'}</div>
      {lost.length === 0 ? <div style={{ color: colors.muted }}>No units lost.</div> : lost.map((u) => (
        <div key={u.unitId} style={{ color: colors.muted }}>{unitLabel(snap, u.unitId)}, round {u.round}</div>
      ))}
    </div>
  )
}

/** The AI seats' secret picks and draws, round by round. In a watched game both seats are AI, so both are shown. */
export function AiReveal({ state, ledger, aiSeats }: { state: DisplayState; ledger: Ledger; aiSeats: Seat[] }) {
  const snap = state as Snap
  const d = state.data
  if (aiSeats.length === 0) return null
  return (
    <div data-testid="ai-reveal" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {aiSeats.map((seat) => {
        const rev = hiddenDecisions(ledger, seat)
        return (
          <div key={seat} data-testid={`ai-reveal-${seat}`} style={{ borderTop: `3px solid ${seatColor(seat)}`, background: 'rgba(255,255,255,0.04)', padding: '6px 10px', borderRadius: 6, fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 3 }}>{seatName(snap, seat)}: what it chose in secret</div>
            {rev.rounds.length === 0 && <div style={{ color: colors.muted }}>Nothing was hidden.</div>}
            {rev.rounds.map((r) => (
              <div key={r.round} data-testid={`ai-round-${seat}-${r.round}`} style={{ padding: '2px 0', borderTop: `1px solid ${colors.border}` }}>
                <b>Round {r.round}</b>{' '}
                {r.pick ? <>picked <Rich text={cardName(d, r.pick)} d={d} /></> : 'picked no card'}
                {r.draws.length > 0 && (
                  <span style={{ color: colors.muted }}>
                    {' '}· drew from its order pool: {r.draws.map((k, i) => (
                      <span key={i}>{i > 0 && ', '}<Rich text={rankName(d, k)} d={d} /></span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export function Recap({ state, ledger, aiSeats }: { state: DisplayState; ledger: Ledger; aiSeats: Seat[] }) {
  return (
    <>
      <Section id="vp" title="Victory points by card"><VpTable state={state} ledger={ledger} /></Section>
      <Section id="lost" title="Units lost">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <LostList state={state} ledger={ledger} seat="A" />
          <LostList state={state} ledger={ledger} seat="B" />
        </div>
      </Section>
      {aiSeats.length > 0 && <Section id="ai" title="What the AI decided in secret"><AiReveal state={state} ledger={ledger} aiSeats={aiSeats} /></Section>}
    </>
  )
}
