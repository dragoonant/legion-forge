// Shared inline-style tokens for src/client/ui/**: the Starbound Legions skin (docs/knowledge-base/starbound-legions-ip.md
// section 3) on the Mallet/Mancermundo HUD layout. Colour roles come from legalActions only: actable gold, selected blue,
// target pink, picked green. Faction identity goes in pips and words, never borders.
import type { CSSProperties } from 'react'

export const fontStack = "'Segoe UI', system-ui, -apple-system, sans-serif"

export const colors = {
  page: '#10141c',
  bg: 'rgba(26, 32, 48, 0.94)',
  bgSolid: '#1a2030',
  border: '#2a3446',
  text: '#dfe6f0',
  muted: '#93a3bd',
  accent: '#ffd166',
  accentText: '#10141c',
  danger: '#e5484d',
  button: '#223049',
  buttonBorder: '#3a4a68',
  /** colour roles: only the decision's legal actions decide who gets them */
  actable: '#f5c34d',
  selected: '#5b9dff',
  target: '#ff6bcb',
  picked: '#45c98b',
  /** seat colours: the viewer's side and the other side */
  mine: '#58b8ff',
  theirs: '#ff5a5a',
  /** zone colours */
  ground: '#d9a441',
}

export const panel: CSSProperties = {
  background: colors.bg,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  color: colors.text,
  fontFamily: fontStack,
  boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(6px)',
}

export const buttonBase: CSSProperties = {
  fontFamily: fontStack,
  fontSize: 13,
  fontWeight: 600,
  color: colors.text,
  background: colors.button,
  border: `1px solid ${colors.buttonBorder}`,
  borderRadius: 6,
  padding: '7px 12px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const buttonActive: CSSProperties = {
  ...buttonBase,
  background: colors.selected,
  color: '#0b1220',
  border: `1px solid ${colors.selected}`,
}

export const buttonPrimary: CSSProperties = {
  ...buttonBase,
  background: colors.accent,
  color: colors.accentText,
  border: `1px solid ${colors.accent}`,
  fontSize: 14,
}

export const buttonDanger: CSSProperties = {
  ...buttonBase,
  color: colors.danger,
  border: `1px solid ${colors.danger}88`,
}

export const mutedText: CSSProperties = { color: colors.muted, fontSize: 12 }

export const scrollList: CSSProperties = {
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  scrollbarWidth: 'none',
}

/** The menu screens (start, briefing, end): flat dark page, no scrollbars. */
export const menuPage: CSSProperties = {
  position: 'fixed',
  inset: 0,
  overflowY: 'auto',
  scrollbarWidth: 'none',
  color: colors.text,
  fontFamily: fontStack,
  background: `radial-gradient(ellipse at 50% -10%, rgba(91,157,255,0.16) 0%, rgba(16,20,28,0) 55%), ${colors.page}`,
}

export const plate: CSSProperties = {
  background: colors.bgSolid,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
  color: colors.text,
  fontFamily: fontStack,
  boxSizing: 'border-box',
}

export const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: colors.accent,
  fontWeight: 800,
}
