// The unit card slot: the hovered unit, else the selected unit; a bottom sheet on phones comes in M7.
import { useDisplayState } from '../presentation/presentedStore'
import { UnitCardView } from './UnitCard'
import { useUi } from './uiStore'

export function UnitStrip() {
  const state = useDisplayState()
  const id = useUi((s) => s.hoverUnit ?? s.selected)
  const u = state && id ? state.units[id] : undefined
  if (!state || !u) return null
  return <UnitCardView d={state.data} typeId={u.unitTypeId} upgrades={u.upgrades} live={u} state={state} compact={false} />
}
