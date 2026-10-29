// The small tokens over a unit on the board: the order token (rank glyph, face up / in the pool / spent), the unit's tokens (aim,
// dodge, surge, standby), suppression and panic, wounds and models left. `unitChips` is the pure view-model (tests read it without a
// canvas); `UnitBadge` draws it. Names come from data; the glyphs are our own drawings.
import { Html } from '@react-three/drei'
import type { GameState, Unit } from '@/engine'
import { isPanicked, isSuppressed, courageOf } from '@/engine/morale'
import { rankName, tokenName, type Snap } from '../game/labels'
import { colors } from '../ui/theme'

export interface Chip {
  id: string
  /** short text on the chip */
  label: string
  colour: string
  /** the help text (shown through the shared Tooltip where chips are in the DOM) */
  help: string
}

const TOKEN_COLOUR: Record<string, string> = { aim: '#ffd166', dodge: '#58b8ff', surge: '#c58bff', standby: '#45c98b' }

export function unitChips(state: Snap & Pick<GameState, 'units'>, unit: Unit): Chip[] {
  const d = state.data
  const out: Chip[] = []
  if (unit.order.state !== 'none') {
    const text = unit.order.state === 'faceUp' ? 'face-up order' : unit.order.state === 'pool' ? 'in the order pool' : 'order spent'
    out.push({ id: `order:${unit.order.state}`, label: unit.order.state === 'spent' ? 'done' : unit.order.state === 'pool' ? 'pool' : 'order', colour: unit.order.state === 'faceUp' ? colors.actable : colors.muted, help: `${rankName(d, unit.rank)} ${text}` })
  }
  for (const [key, n] of Object.entries(unit.tokens)) {
    if (!n || n <= 0) continue
    const k = key.replace(/^core\.token\./, '')
    out.push({ id: `token:${k}`, label: n > 1 ? `${k.slice(0, 3)} x${n}` : k.slice(0, 3), colour: TOKEN_COLOUR[k] ?? colors.muted, help: `${tokenName(d, k)} x${n}` })
  }
  if (unit.suppression > 0) out.push({ id: 'supp', label: `sup ${unit.suppression}`, colour: '#ff9f43', help: `${unit.suppression} suppression` })
  try {
    const g = state as unknown as GameState
    if (isPanicked(g, unit)) out.push({ id: 'panic', label: 'PANIC', colour: colors.danger, help: 'Panicked' })
    else if (isSuppressed(g, unit)) out.push({ id: 'suppressed', label: 'SUPPRESSED', colour: '#ff9f43', help: `Suppressed (courage ${courageOf(g, unit)})` })
  } catch {
    /* the hooks need the live state; the badge simply omits the status */
  }
  return out
}

export interface Pips {
  /** wound pips of the unit's leader when it is a single model, else models left */
  left: number
  total: number
  /** wounds taken (counters) on the most wounded model */
  worst: number
  models: { left: number; total: number }
}

export function woundPips(unit: Unit): Pips {
  const alive = unit.minis.filter((m) => m.alive)
  const leader = unit.minis.find((m) => m.id === unit.leaderId)
  const worst = Math.max(0, ...alive.map((m) => m.wounds))
  const single = unit.minis.length === 1 && leader
  return {
    left: single ? Math.max(0, leader.maxWounds - leader.wounds) : alive.length,
    total: single ? leader.maxWounds : unit.minis.length,
    worst,
    models: { left: alive.length, total: unit.minis.length },
  }
}

export function UnitBadge({ unit, state, y }: { unit: Unit; state: Snap; y: number }) {
  const chips = unitChips(state, unit)
  const p = woundPips(unit)
  const total = Math.min(12, p.total)
  return (
    <Html position={[0, y, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div data-testid={`unit-pips-${unit.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} data-pip={i < p.left ? 'left' : 'lost'} style={{ width: 6, height: 6, borderRadius: 3, background: i < p.left ? '#e8e8f2' : 'transparent', border: `1px solid ${i < p.left ? 'rgba(0,0,0,0.6)' : 'rgba(232,232,242,0.45)'}` }} />
          ))}
        </div>
        {chips.length > 0 && (
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 130 }}>
            {chips.map((c) => (
              <span key={c.id} data-chip={c.id} aria-label={c.help} style={{ font: '800 8px system-ui, sans-serif', letterSpacing: '0.04em', padding: '0 3px', borderRadius: 3, background: 'rgba(16,20,28,0.9)', border: `1px solid ${c.colour}`, color: c.colour, textTransform: 'uppercase' }}>
                {c.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </Html>
  )
}
