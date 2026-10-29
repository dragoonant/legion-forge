// A centred modal panel for the settings and the how-to-play guide: dimmed backdrop, Escape and the backdrop close it, scrolls inside.
// On a phone the close button sits at the LEFT of the header (the top-right corner is covered by the system overlay) and the panel is
// the whole screen inside the safe-area insets.
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { useFormFactor } from './formFactor'
import { colors, fontStack, panel } from './theme'
import { Btn } from './widgets'

export function ModalFrame({ title, testId, onClose, children, width = 560 }: { title: string; testId: string; onClose: () => void; children: ReactNode; width?: number }) {
  const { compact } = useFormFactor()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const frame: CSSProperties = compact
    ? { ...panel, position: 'absolute', inset: 0, borderRadius: 0, padding: 'max(10px, var(--safe-top)) max(12px, var(--safe-right)) max(10px, var(--safe-bottom)) max(12px, var(--safe-left))' }
    : { ...panel, width: `min(${width}px, 100%)`, maxHeight: '90vh', padding: 18 }
  const close = (
    <Btn data-testid={`${testId}-close`} onClick={onClose} aria-label={`Close ${title}`} style={{ padding: '6px 14px' }}>
      Close
    </Btn>
  )
  return (
    <div
      className="lf-touch"
      data-testid={testId}
      role="dialog"
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(8,10,16,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: compact ? 0 : 12, boxSizing: 'border-box', fontFamily: fontStack, pointerEvents: 'auto' }}
    >
      <div style={{ ...frame, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', color: colors.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flex: '0 0 auto' }}>
          {compact && close}
          <h2 style={{ margin: 0, fontSize: 18, color: colors.accent, flex: 1 }}>{title}</h2>
          {!compact && close}
        </div>
        <div style={{ overflowY: 'auto', scrollbarWidth: 'none', flex: '1 1 auto', minHeight: 0, overscrollBehavior: 'contain' }}>{children}</div>
      </div>
    </div>
  )
}
