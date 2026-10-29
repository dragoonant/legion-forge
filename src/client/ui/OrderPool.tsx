// Order pool readout: how many tokens each seat still has in its pool, by rank (the engine's counts: which token comes next is
// hidden), and the rank glyphs. The glyphs are our own drawings: one shape per rank, drawn with CSS.
import type { CSSProperties } from 'react'
import type { Seat } from '@/engine'
import { rankName } from '../game/labels'
import type { DisplayState } from '../presentation/presentedStore'
import { Keyword } from './Keyword'
import { colors } from './theme'
import { seatColor } from './widgets'

const SHAPE: Record<string, CSSProperties> = {
  commander: { clipPath: 'polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' },
  operative: { clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' },
  corps: { borderRadius: 2 },
  'special-forces': { clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' },
  support: { clipPath: 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)' },
  heavy: { borderRadius: '50%' },
}

export function RankGlyph({ rank, size = 14, color = colors.text }: { rank: string; size?: number; color?: string }) {
  return <span data-rank={rank} style={{ display: 'inline-block', width: size, height: size, background: color, ...(SHAPE[rank] ?? { borderRadius: 3 }) }} />
}

export function PoolRow({ state, seat }: { state: DisplayState; seat: Seat }) {
  const pool = state.players[seat].pool
  const ranks = Object.entries(pool.byRank).filter(([, n]) => n > 0)
  return (
    <span data-testid={`pool-${seat}`} data-size={pool.size} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Keyword term="Order pool">Pool</Keyword>
      <b style={{ color: seatColor(seat) }}>{pool.size}</b>
      {ranks.map(([r, n]) => (
        <span key={r} aria-label={`${n} ${rankName(state.data, r)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, color: colors.muted }}>
          <RankGlyph rank={r} size={10} color={seatColor(seat)} />
          {n}
        </span>
      ))}
    </span>
  )
}
