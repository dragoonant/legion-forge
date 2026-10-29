// Dice tray: one row per physical roll as the director plays it. Attack dice are d8 (red, black, white), defence dice d6 (red,
// white); faces (crit, hit, surge, blank, block) are our own drawings and every face comes off the engine's event. Docked in the
// right rail; on a phone it floats under the HUD.
import { useEffect, type CSSProperties } from 'react'
import { colors, fontStack, panel } from '../ui/theme'
import { CollapseButton, CollapsedTab, useCollapsed } from '../ui/collapse'
import { useFormFactor } from '../ui/formFactor'
import { seatColor } from '../ui/widgets'
import { useTray, type TrayDie, type TrayRow, type TrayState } from './trayStore'

const STYLE_ID = 'lf-dice-tray-style'

function injectStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes lf-tray-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
    @keyframes lf-die-tumble { 0% { transform: rotate(-200deg) scale(0.3); opacity: 0 } 70% { transform: rotate(14deg) scale(1.12); opacity: 1 } 100% { transform: none } }
    @keyframes lf-row-in { from { opacity: 0; transform: translateX(10px) } to { opacity: 1; transform: none } }
  `
  document.head.appendChild(style)
}

export const DIE_FILL: Record<string, { bg: string; ink: string; edge: string }> = {
  red: { bg: '#b8332b', ink: '#fff2ee', edge: '#ff7a6b' },
  black: { bg: '#23242b', ink: '#f0f0f6', edge: '#5b5e6c' },
  white: { bg: '#eceef6', ink: '#1a1c24', edge: '#ffffff' },
}

/** Our own drawings of the faces; the die colour supplies the ink. */
function Glyph({ face, ink }: { face: string; ink: string }) {
  switch (face) {
    case 'crit':
      return (
        <svg viewBox="0 0 30 30" width="100%" height="100%" aria-hidden>
          <path d="M15 3 L18 12 L27 15 L18 18 L15 27 L12 18 L3 15 L12 12 Z" fill={ink} />
        </svg>
      )
    case 'hit':
      return (
        <svg viewBox="0 0 30 30" width="100%" height="100%" aria-hidden>
          <path d="M15 6 L24 15 L15 24 L6 15 Z" fill={ink} />
        </svg>
      )
    case 'surge':
      return (
        <svg viewBox="0 0 30 30" width="100%" height="100%" aria-hidden>
          <path d="M17 3 L7 17 H14 L12 27 L23 12 H16 Z" fill={ink} />
        </svg>
      )
    case 'block':
      return (
        <svg viewBox="0 0 30 30" width="100%" height="100%" aria-hidden>
          <path d="M15 4 L25 8 V15 C25 21 20 25 15 27 C10 25 5 21 5 15 V8 Z" fill={ink} />
        </svg>
      )
    case 'blank':
      return (
        <svg viewBox="0 0 30 30" width="100%" height="100%" aria-hidden>
          <circle cx="15" cy="15" r="3" fill={ink} opacity="0.35" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 30 30" width="100%" height="100%" aria-hidden>
          <text x="15" y="21" textAnchor="middle" fontSize="16" fontWeight="800" fill={ink}>
            {face}
          </text>
        </svg>
      )
  }
}

function dieBox(d: TrayDie, size: number): CSSProperties {
  const fill = DIE_FILL[d.colour ?? 'white']!
  const base: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    flex: '0 0 auto',
    width: size,
    height: size,
    boxSizing: 'border-box',
    background: fill.bg,
    border: `1px solid ${fill.edge}`,
    animation: 'lf-die-tumble 340ms ease-out',
  }
  // attack dice are d8 (an octagon-ish corner cut), defence dice d6 (rounded square)
  return d.side === 'atk' ? { ...base, borderRadius: Math.round(size / 3) } : { ...base, borderRadius: Math.round(size / 6) }
}

export function TrayDieView({ d, size, i }: { d: TrayDie; size: number; i: number }) {
  const fill = DIE_FILL[d.colour ?? 'white']!
  return (
    <span data-testid="tray-die" data-side={d.side} data-colour={d.colour ?? ''} data-face={d.face} style={dieBox(d, size)} aria-label={`${d.colour ?? ''} die ${i + 1}: ${d.face}`}>
      <Glyph face={d.face} ink={fill.ink} />
    </span>
  )
}

function Row({ row }: { row: TrayRow }) {
  const n = row.dice.length
  const size = n > 8 ? 22 : n > 5 ? 26 : 30
  return (
    <div data-testid="tray-row" data-kind={row.kind} style={{ animation: 'lf-row-in 200ms ease-out', padding: '5px 0', borderTop: `1px solid ${colors.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontSize: 12, minWidth: 0 }}>
        {row.seat && <span style={{ width: 8, height: 8, borderRadius: 4, background: seatColor(row.seat), flex: '0 0 auto', alignSelf: 'center' }} />}
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{row.label}</span>
        <span style={{ color: colors.muted }}>{n} {n === 1 ? 'die' : 'dice'}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
        {row.dice.map((d, i) => (
          <TrayDieView key={i} d={d} size={size} i={i} />
        ))}
      </div>
      {row.verdict && (
        <div data-testid="tray-verdict" style={{ fontSize: 12, fontWeight: 800, color: colors.accent, marginTop: 4 }}>
          {row.verdict}
        </div>
      )}
    </div>
  )
}

/** The tray box. Only the DOM view folds: the director writes trayStore on its own beats and never waits on this. */
export function DiceTrayView({ tray, compact }: { tray: TrayState; compact: boolean }) {
  const [collapsed] = useCollapsed('dicetray')
  if (tray.rows.length === 0) return null
  if (collapsed) {
    return <CollapsedTab id="dicetray" title="Dice tray" style={compact ? { position: 'absolute', top: 60, left: 8, zIndex: 35 } : { alignSelf: 'flex-end', flex: '0 0 auto' }} />
  }
  const style: CSSProperties = {
    ...panel,
    padding: '8px 10px 6px',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    fontFamily: fontStack,
    animation: 'lf-tray-in 180ms ease-out',
    ...(compact ? { position: 'absolute', top: 60, left: 8, width: 'min(300px, 52vw)', zIndex: 35 } : { width: 288, maxWidth: '100%', flex: '0 0 auto' }),
  }
  return (
    <div data-testid="dice-tray" style={style}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, paddingLeft: 2 }}>{tray.title}</div>
        <CollapseButton id="dicetray" title="dice tray" style={{ pointerEvents: 'auto', flex: '0 0 auto' }} />
      </div>
      {tray.rows.map((r) => (
        <Row key={r.id} row={r} />
      ))}
    </div>
  )
}

export function DiceTray() {
  const tray = useTray()
  const compact = useFormFactor().compact
  useEffect(injectStyle, [])
  return <DiceTrayView tray={tray} compact={compact} />
}
