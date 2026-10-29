// Small shared UI pieces: panel, buttons, AP pips, seat chip. Inline styles from theme.ts (no CSS framework).
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import type { Seat } from '@/engine'
import { useGame } from '../store/game'
import { buttonActive, buttonBase, buttonDanger, buttonPrimary, colors, mutedText, panel } from './theme'

/** The viewer's side is blue, the other side red (watch mode: seat A blue). */
export const seatColor = (seat: Seat): string => (seat === useGame.getState().viewer ? colors.mine : colors.theirs)

export function Panel({ children, style, testId, ...rest }: { children: ReactNode; style?: CSSProperties; testId?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-testid={testId} style={{ ...panel, padding: 10, boxSizing: 'border-box', pointerEvents: 'auto', ...style }} {...rest}>
      {children}
    </div>
  )
}

type Variant = 'base' | 'primary' | 'active' | 'danger'
const VARIANT: Record<Variant, CSSProperties> = { base: buttonBase, primary: buttonPrimary, active: buttonActive, danger: buttonDanger }

export function Btn({ variant = 'base', style, children, ...rest }: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const disabled = rest.disabled
  return (
    <button
      type="button"
      {...rest}
      style={{ ...VARIANT[variant], ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}), ...style }}
    >
      {children}
    </button>
  )
}

export function Muted({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...mutedText, ...style }}>{children}</div>
}

export function Dot({ seat }: { seat: Seat }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: seatColor(seat), marginRight: 6 }} />
}

// Phone layout: every button, field and link inside a menu screen, the HUD or a prompt is at least 44 px tall (touch targets).
const TOUCH_CSS = `
html[data-ff="compact"] .lf-menu button, html[data-ff="compact"] .lf-menu input, html[data-ff="compact"] .lf-menu select,
html[data-ff="compact"] .lf-touch button { min-height: 44px; touch-action: manipulation; }
html[data-ff="compact"] .lf-menu a { display: inline-flex; align-items: center; min-height: 44px; }
`

export function TouchStyle() {
  return <style>{TOUCH_CSS}</style>
}
