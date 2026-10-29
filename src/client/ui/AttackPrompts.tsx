// Prompts for the attack decisions (`attack.defender`, `attack.pool`, `attack.extraDefender`, `attack.spend`, `attack.allocate`) and the
// generic option list every other kind falls back to (so a decision kind the engine adds later still plays; never a dead end). Each row
// shows the engine's numbers from the option's own `data`: band, cover, expected wounds, defeat chance, dice counts, anything else
// primitive the engine attaches.
import type { CSSProperties } from 'react'
import type { DecisionOption, PendingDecision } from '@/engine'
import { optionLabel, type Snap } from '../game/labels'
import { optionFacts } from '../game/optionFacts'
import { useGame } from '../store/game'
import { DIE_FILL, TrayDieView } from '../dice/DiceTray'
import { colors } from './theme'
import { useUi } from './uiStore'
import { Btn } from './widgets'

const optionRow: CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left', whiteSpace: 'normal' }
export const factStyle: CSSProperties = { fontSize: 11, fontWeight: 500, color: colors.muted }

/** Dice counts as coloured squares: the pool of a weapon or an attack. */
export function DiceChips({ dice }: { dice: Record<string, number> }) {
  const list = Object.entries(dice).filter(([, n]) => n > 0)
  if (list.length === 0) return <span style={factStyle}>no dice</span>
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {list.map(([c, n]) => (
        <span key={c} data-dice={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: DIE_FILL[c]?.bg ?? '#888', border: `1px solid ${DIE_FILL[c]?.edge ?? '#fff'}` }} />
          {n}
        </span>
      ))}
    </span>
  )
}

/** Primitive entries of an option's data that no dedicated fact covers (shown as is, so a new engine fact is never lost). */
function genericFacts(opt: DecisionOption, covered: Set<string>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(opt.data ?? {})) {
    if (covered.has(k)) continue
    if (typeof v === 'number') out.push(`${k} ${Number.isInteger(v) ? v : v.toFixed(2)}`)
    else if (typeof v === 'string' && v.length < 24) out.push(`${k} ${v}`)
    else if (typeof v === 'boolean' && v) out.push(k)
  }
  return out
}

const COVERED = new Set(['miniId', 'count', 'wounds', 'maxWounds', 'n', 'faces', 'verbs', 'index', 'unitId', 'band', 'distance', 'cover', 'odds', 'dice', 'auto', 'maxSpeed', 'free', 'byRank', 'pips', 'rank', 'unitTypeId', 'poolSize', 'kind', 'weapons', 'visible', 'kinds', 'edge', 'rotation'])

export function OptionRow({ opt, pending, state }: { opt: DecisionOption; pending: PendingDecision; state: Snap }) {
  const dispatch = useGame((s) => s.dispatch)
  const facts = optionFacts(opt, pending, state)
  const unitId = (opt.action as { payload?: { unitId?: string } }).payload?.unitId
  const miniId = (opt.action as { payload?: { miniId?: string } }).payload?.miniId
  const miniUnit = miniId ? miniId.split('.')[0] : undefined
  const extra = genericFacts(opt, COVERED)
  const dice = (opt.data as { dice?: Record<string, number> } | undefined)?.dice
  const recommended = (opt.data as { auto?: boolean } | undefined)?.auto === true
  return (
    <Btn
      variant={recommended ? 'primary' : 'base'}
      data-testid={`opt-${opt.id}`}
      onMouseEnter={() => useUi.setState({ hoverOption: unitId ?? miniId ?? opt.id, hoverUnit: unitId ?? miniUnit ?? null })}
      onMouseLeave={() => useUi.setState({ hoverOption: null, hoverUnit: null })}
      onFocus={() => useUi.setState({ hoverOption: unitId ?? opt.id })}
      onBlur={() => useUi.setState({ hoverOption: null })}
      onClick={() => {
        useUi.setState({ hoverOption: null, hoverUnit: null })
        dispatch(opt.action)
      }}
      style={optionRow}
    >
      <span>{optionLabel(opt, pending, state)}</span>
      <span style={{ ...factStyle, ...(recommended ? { color: colors.accentText } : {}), display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {opt.action.type === 'attack.pool' && dice ? <DiceChips dice={dice} /> : null}
        {facts.filter((f) => !(opt.action.type === 'attack.pool' && f.id === 'dice')).map((f) => (
          <span key={f.id} data-fact={f.id}>{f.text}</span>
        ))}
        {extra.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </span>
    </Btn>
  )
}

/** The generic option list: every option as a row with its facts. */
export function OptionList({ pending, state, options }: { pending: PendingDecision; state: Snap; options?: DecisionOption[] }) {
  const list = options ?? pending.options ?? []
  const seat = useGame((s) => s.viewer)
  const mine = list.filter((o) => o.action.seat === seat || pending.seat !== 'all')
  return (
    <div data-testid="option-list" style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: '40vh', overflowY: 'auto', scrollbarWidth: 'none' }}>
      {mine.map((o) => (
        <OptionRow key={o.id} opt={o} pending={pending} state={state} />
      ))}
    </div>
  )
}

/** The numbers the engine put in a decision's context (tokens, surges, hits...), as small chips. */
export function ContextChips({ context }: { context: Record<string, unknown> }) {
  const skip = new Set(['cont', 'step', 'dice', 'stage', 'unitId', 'subjectId', 'defenderId', 'attackerId'])
  const chips = Object.entries(context).filter(([k, v]) => !skip.has(k) && typeof v === 'number')
  if (chips.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {chips.map(([k, v]) => (
        <span key={k} data-context={k} style={{ ...factStyle, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 6px' }}>
          {k.replace(/([a-z])([A-Z])/g, '$1 $2')} {String(v)}
        </span>
      ))}
    </span>
  )
}

/** `attack.spend`: the dice at this step (when the engine lists them), the numbers in play, and the spends as rows. */
export function SpendPrompt({ pending, state }: { pending: PendingDecision; state: Snap }) {
  const faces = Array.isArray(pending.context.dice) ? (pending.context.dice as string[]) : []
  return (
    <div data-testid="spend-prompt" data-step={String(pending.context.step ?? '')} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {faces.length > 0 && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={factStyle}>Your dice:</span>
          {faces.map((f, i) => (
            <TrayDieView key={i} d={{ side: 'atk', colour: 'white', face: f }} size={26} i={i} />
          ))}
        </div>
      )}
      <ContextChips context={pending.context} />
      <OptionList pending={pending} state={state} />
    </div>
  )
}
