// The first-turn hint strip: one thin line that says what to do right now, shown for a human's decisions in the first round until it is
// dismissed ("Got it" hides it for good, saved with the settings). A new kind of decision shows its own line.
import { hintFor } from '../game/howto'
import { useDisplayState, useSettled } from '../presentation/presentedStore'
import { useSettings } from '../presentation/settings'
import { humanToAct, useGame } from '../store/game'
import { isWatching } from '../store/pacing'
import { Rich } from './Keyword'
import { useFormFactor } from './formFactor'
import { OVERLAY_W } from './hudLayout'
import { colors, fontStack, panel } from './theme'
import { useUi } from './uiStore'
import { Btn } from './widgets'

/** The first-turn hint for the open decision, or null (dismissed, watching, not the first round, nothing to say). */
export function useFirstHint(): string | null {
  const dismissed = useSettings((s) => s.hintsDismissed)
  const pending = useGame((s) => s.pending)
  const watching = useGame((s) => isWatching(s.seats))
  const round = useGame((s) => s.state?.round ?? 0)
  const state = useDisplayState()
  const settled = useSettled()
  const pick = useUi((s) => s.pick)
  if (dismissed || watching || !pending || !state || !settled || pick || round > 1) return null
  if (!humanToAct()) return null
  return hintFor(pending.kind)
}

/** `inline`: the phone layout puts the hint inside the bottom sheet instead of floating over the board. */
export function HintStrip({ inline = false }: { inline?: boolean }) {
  const dismiss = useSettings((s) => s.setHintsDismissed)
  const pending = useGame((s) => s.pending)
  const state = useDisplayState()
  const text = useFirstHint()
  const { compact, touch } = useFormFactor()
  if (!text || !pending || !state) return null
  if (inline) {
    return (
      <div data-testid="hint-strip" data-kind={pending.kind} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: 1.35, borderLeft: `3px solid ${colors.accent}`, paddingLeft: 8, marginBottom: 6 }}>
        <span style={{ flex: 1, minWidth: 0 }}><Rich text={text} d={state.data} /></span>
        <Btn data-testid="hint-dismiss" onClick={() => dismiss(true)} style={{ padding: '3px 10px', fontSize: 12 }}>Got it</Btn>
      </div>
    )
  }
  return (
    <div
      className="lf-touch"
      data-testid="hint-strip"
      data-kind={pending.kind}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ ...panel, position: 'absolute', top: compact ? 60 : 76, ...(compact ? { left: 62, right: touch ? OVERLAY_W + 8 : 8 } : { left: '50%', transform: 'translateX(-50%)', maxWidth: 'min(640px, calc(100vw - 24px))' }), padding: '5px 8px 5px 12px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 34, pointerEvents: 'auto', boxSizing: 'border-box', fontFamily: fontStack, fontSize: 12, lineHeight: 1.35, borderLeft: `4px solid ${colors.accent}` }}
    >
      <span style={{ flex: 1, minWidth: 0 }}><Rich text={text} d={state.data} /></span>
      <Btn data-testid="hint-dismiss" onClick={() => dismiss(true)} style={{ padding: '3px 10px', fontSize: 12 }}>Got it</Btn>
    </div>
  )
}
