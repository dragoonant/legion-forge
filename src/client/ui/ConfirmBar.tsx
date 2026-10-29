// Touch: a unit tapped on the board to answer the open decision (activate it, give it an order, target it) is only picked; this slim bar
// names it, repeats the engine's numbers and asks to confirm. Cancel (or tapping the bare table) drops the pick.
// On a phone it sits over the foot of the bottom sheet, so the board above stays clear and the top-right corner stays empty.
import { cancelPick, confirmPick, pickedOption } from '../interaction/controller'
import { optionFacts } from '../game/optionFacts'
import { unitLabel, type Snap } from '../game/labels'
import { useDisplayState } from '../presentation/presentedStore'
import { useSettings } from '../presentation/settings'
import { useGame } from '../store/game'
import { useFormFactor } from './formFactor'
import { colors, fontStack, panel } from './theme'
import { useUi } from './uiStore'
import { Btn } from './widgets'

export function ConfirmBar() {
  const pick = useUi((s) => s.pick)
  const pending = useGame((s) => s.pending)
  const state = useDisplayState()
  const showOdds = useSettings((s) => s.showOdds)
  const { compact } = useFormFactor()
  if (!pick || !pending || !state) return null
  const p = pickedOption()
  if (!p) return null
  const facts = optionFacts(p.option, pending, state as Snap, showOdds).map((f) => f.text).join(' · ')
  return (
    <div
      className="lf-touch"
      data-testid="confirm-bar"
      data-unit={p.unitId}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ ...panel, position: 'absolute', ...(compact ? { bottom: 6, left: 58, right: 8 } : { top: 76, left: '50%', transform: 'translateX(-50%)', width: 'min(520px, calc(100vw - 24px))' }), minHeight: 52, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 8, zIndex: 46, pointerEvents: 'auto', boxSizing: 'border-box', fontFamily: fontStack, borderLeft: `4px solid ${colors.selected}` }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{unitLabel(state as Snap, p.unitId)}</div>
        {facts && <div style={{ fontSize: 11, color: colors.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{facts}</div>}
      </div>
      <Btn data-testid="pick-cancel" onClick={() => cancelPick()}>Cancel</Btn>
      <Btn variant="primary" data-testid="pick-confirm" onClick={() => confirmPick()}>Confirm</Btn>
    </div>
  )
}
