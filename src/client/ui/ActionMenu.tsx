// The action menu (`action.choose`): the engine's offered actions as grouped buttons with its numbers, the withheld ones greyed with the
// engine's reason in the shared Tooltip, and End activation. Names come from the action records.
import type { CSSProperties } from 'react'
import type { Action, DecisionOption, PendingDecision } from '@/engine'
import { actionName, optionLabel, whyNotText, unitLabel, type Snap } from '../game/labels'
import { optionFacts } from '../game/optionFacts'
import { useGame } from '../store/game'
import { Keyword } from './Keyword'
import { Tooltip } from './Tooltip'
import { colors } from './theme'
import { Btn } from './widgets'

const GROUPS: { id: string; title: string; actions: string[] }[] = [
  { id: 'move', title: 'Move', actions: ['move', 'climb', 'withdraw'] },
  { id: 'fight', title: 'Fight', actions: ['attack', 'aim', 'dodge'] },
  { id: 'other', title: 'Other', actions: ['recover', 'standby', 'claim'] },
]

const row: CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left' }
const fact: CSSProperties = { fontSize: 11, fontWeight: 500, color: colors.muted }

function actionKey(o: DecisionOption): string {
  return o.action.type === 'action.choose' ? o.action.payload.action : o.id
}

export function ActionMenu({ pending, state }: { pending: PendingDecision; state: Snap }) {
  const dispatch = useGame((s) => s.dispatch)
  const opts = pending.options ?? []
  const withheld = (pending.context.withheld as { action: string; whyNot: string }[] | undefined) ?? []
  const left = Number(pending.context.actionsLeft ?? 0)
  const known = new Set(GROUPS.flatMap((g) => g.actions))
  const end = opts.find((o) => actionKey(o) === 'end')
  const extra = opts.filter((o) => actionKey(o) !== 'end' && !known.has(actionKey(o)))
  const unitId = String(pending.context.unitId ?? '')
  const send = (a: Action) => dispatch(a)
  return (
    <div data-testid="action-menu" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: colors.muted }}>
        {unitId ? unitLabel(state, unitId) : ''} has {left} action{left === 1 ? '' : 's'} left
        {pending.context.suppressed === true ? ', is suppressed' : ''}
        {pending.context.panicked === true ? ', is panicked' : ''}.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {GROUPS.map((g) => {
          const here = opts.filter((o) => g.actions.includes(actionKey(o)))
          const held = withheld.filter((w) => g.actions.includes(w.action) && !here.some((o) => actionKey(o) === w.action))
          if (here.length === 0 && held.length === 0) return null
          // several options for one action (recover removes 1, 2, 3...) share one row of chips
          const byAction = new Map<string, DecisionOption[]>()
          for (const o of here) byAction.set(actionKey(o), [...(byAction.get(actionKey(o)) ?? []), o])
          return (
            <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{g.title}</div>
              {[...byAction.entries()].map(([key, list]) =>
                list.length === 1 ? (
                  <Btn key={key} data-testid={`opt-${list[0]!.id}`} onClick={() => send(list[0]!.action)} style={{ ...row, whiteSpace: 'normal' }}>
                    <span><Keyword term={actionName(state.data, key)}>{actionName(state.data, key)}</Keyword></span>
                    <span style={fact}>{optionFacts(list[0]!, pending, state).map((f) => f.text).join(' · ')}</span>
                  </Btn>
                ) : (
                  <div key={key} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12 }}>{actionName(state.data, key)}</span>
                    {list.map((o) => (
                      <Btn key={o.id} data-testid={`opt-${o.id}`} onClick={() => send(o.action)} style={{ padding: '4px 9px' }}>
                        {String((o.action.type === 'action.choose' && o.action.payload.params?.remove) ?? '')}
                      </Btn>
                    ))}
                  </div>
                ),
              )}
              {held.map((w) => (
                <Tooltip key={w.action} wrap title={actionName(state.data, w.action)} body={whyNotText(w.whyNot)}>
                  <Btn data-testid={`withheld-${w.action}`} data-whynot={w.whyNot} disabled style={{ ...row }}>
                    <span>{actionName(state.data, w.action)}</span>
                    <span style={fact}>unavailable</span>
                  </Btn>
                </Tooltip>
              ))}
            </div>
          )
        })}
      </div>
      {(extra.length > 0 || withheld.some((w) => !known.has(w.action))) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {extra.map((o) => (
            <Btn key={o.id} data-testid={`opt-${o.id}`} onClick={() => send(o.action)} style={{ ...row, width: 'auto', gap: 8 }}>
              <span>{optionLabel(o, pending, state)}</span>
              <span style={fact}>{optionFacts(o, pending, state).map((f) => f.text).join(' · ')}</span>
            </Btn>
          ))}
          {withheld.filter((w) => !known.has(w.action) && !opts.some((o) => o.id === w.action)).map((w) => (
            <Tooltip key={w.action} wrap title={actionName(state.data, w.action)} body={whyNotText(w.whyNot)}>
              <Btn data-testid={`withheld-${w.action}`} data-whynot={w.whyNot} disabled style={{ ...row, width: 'auto', gap: 8 }}>
                <span>{actionName(state.data, w.action)}</span>
                <span style={fact}>unavailable</span>
              </Btn>
            </Tooltip>
          ))}
        </div>
      )}
      {end && (
        <Btn variant="primary" data-testid={`opt-${end.id}`} onClick={() => send(end.action)}>
          End activation
        </Btn>
      )}
    </div>
  )
}
