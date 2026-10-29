// The command hand (decision `command.pick`): the seat's remaining cards with name, pips, orders and effect text from data. Picking
// puts a card face down beside the opponent's face-down card (shown once the opponent has picked, without its identity); both flip on
// `CommandCardsRevealed` (the director's reveal banner). Cards the seat has played are not in the hand any more.
import { useState, type CSSProperties } from 'react'
import type { CommandCardData } from '@/data/types'
import type { Action, PendingDecision } from '@/engine'
import { cardName, cardText } from '../game/labels'
import { owedSeats, useGame } from '../store/game'
import type { DisplayState } from '../presentation/presentedStore'
import { Keyword, Rich } from './Keyword'
import { colors, fontStack } from './theme'

export function Pips({ n, color = colors.accent }: { n: number; color?: string }) {
  return (
    <span aria-label={`${n} pips`} data-pips={n} style={{ display: 'inline-flex', gap: 3, verticalAlign: 'middle' }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ width: 9, height: 9, borderRadius: 5, background: color, border: '1px solid rgba(0,0,0,0.5)' }} />
      ))}
    </span>
  )
}

const cardBox = (picked: boolean, enabled: boolean): CSSProperties => ({
  width: 138,
  minHeight: 120,
  flex: '0 0 auto',
  textAlign: 'left',
  cursor: enabled ? 'pointer' : 'default',
  padding: '8px 9px',
  borderRadius: 8,
  border: `2px solid ${picked ? colors.picked : enabled ? colors.actable : colors.border}`,
  background: picked ? 'rgba(69,201,139,0.12)' : colors.button,
  color: colors.text,
  fontFamily: fontStack,
  boxSizing: 'border-box',
})

function ordersLine(rec: CommandCardData | undefined): string {
  if (!rec) return ''
  const o = rec.orders
  if (o.count === 0 && o.named?.length) return 'Orders its named unit'
  return `Orders: ${o.count}`
}

function CardFace({ state, id, picked, enabled, onPick }: { state: DisplayState; id: string; picked: boolean; enabled: boolean; onPick?: () => void }) {
  const rec = state.data.cards[id] as unknown as CommandCardData | undefined
  return (
    <button type="button" data-testid={`cmd-card-${id}`} data-picked={picked ? '1' : '0'} disabled={!enabled} onClick={onPick} style={cardBox(picked, enabled)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <b style={{ fontSize: 13 }}>{cardName(state.data, id)}</b>
        <Keyword term="Pips"><Pips n={rec?.pips ?? 0} /></Keyword>
      </div>
      <div style={{ fontSize: 11, color: colors.muted, margin: '2px 0 4px' }}>{ordersLine(rec)}</div>
      <div style={{ fontSize: 11, lineHeight: 1.35 }}><Rich text={cardText(state.data, id)} d={state.data} /></div>
    </button>
  )
}

function Back({ label, known }: { label: string; known: boolean }) {
  return (
    <div data-testid="card-back" style={{ ...cardBox(false, false), width: 90, minHeight: 80, display: 'grid', placeItems: 'center', textAlign: 'center', opacity: known ? 1 : 0.5, background: 'repeating-linear-gradient(45deg,#1a2030,#1a2030 6px,#223049 6px,#223049 12px)' }}>
      <span style={{ fontSize: 11, color: colors.muted }}>{label}</span>
    </div>
  )
}

export function CommandHand({ pending, state, legal, seat }: { pending: PendingDecision; state: DisplayState; legal: Action[] | null; seat: 'A' | 'B' }) {
  const dispatch = useGame((s) => s.dispatch)
  const [hover, setHover] = useState<string | null>(null)
  const answered = !owedSeats(pending).includes(seat)
  const mine = state.command.picks[seat]
  const other = seat === 'A' ? 'B' : 'A'
  const theirs = state.command.picks[other]
  const hand = state.players[seat].hand
  const pickable = new Map<string, Action>()
  for (const a of legal ?? []) if (a.type === 'command.pick') pickable.set(a.payload.cardId, a)
  return (
    <div data-testid="command-hand" style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2, paddingTop: 8, flex: 1 }}>
        {hand.map((id) => {
          const a = pickable.get(id)
          const isPicked = typeof mine === 'string' && mine === id
          return (
            <div key={id} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} style={{ transform: hover === id && a ? 'translateY(-6px)' : 'none', transition: 'transform 120ms' }}>
              <CardFace state={state} id={id} picked={isPicked} enabled={!!a && !answered} {...(a ? { onPick: () => dispatch(a) } : {})} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center', alignItems: 'center', flex: '0 0 auto' }}>
        <div style={{ fontSize: 11, color: colors.muted }}>{answered ? 'Picked, waiting' : 'Pick one'}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {answered && typeof mine === 'string' ? <CardFace state={state} id={mine} picked enabled={false} /> : <Back label="Your card" known={false} />}
          {theirs !== undefined ? <Back label="Opponent: face down" known /> : <Back label="Opponent has not picked" known={false} />}
        </div>
      </div>
    </div>
  )
}
