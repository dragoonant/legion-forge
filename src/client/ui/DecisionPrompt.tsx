// The decision prompt: names what the pending decision decides and shows the engine's numbers. Finite decisions are option rows from
// `pending.options` with engine labels and facts; the continuous kinds (deploy, move.tool, move.troopers) are answered on the board and
// the prompt carries their controls. Every decision kind renders through the generic option list, so a kind the engine adds later
// still plays. Shown only to a human seat, after the presentation caught up.
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import type { Action, PendingDecision } from '@/engine'
import { suggest } from '@/engine'
import { cameraApi } from '../board/cameraApi'
import { deployUnitFor, confirmTool, confirmTroopers, doItForMe, optionsForUnit, placeStaged, rotateFacing, cancelDecision } from '../interaction/controller'
import { cardText, decisionHint, decisionTitle, keywordRec, touchHint, unitLabel, rankName, type Snap } from '../game/labels'
import { optionFacts } from '../game/optionFacts'
import { useDisplayState, useSettled } from '../presentation/presentedStore'
import { useSettings } from '../presentation/settings'
import { humanToAct, owedSeats, useGame } from '../store/game'
import { ActionMenu } from './ActionMenu'
import { OptionList, OptionRow, SpendPrompt, factStyle } from './AttackPrompts'
import { CommandHand } from './CommandHand'
import { BottomSheet } from './BottomSheet'
import { CollapseButton, CollapsedTab, useCollapse, useCollapsed } from './collapse'
import { Keyword, Rich } from './Keyword'
import { RankGlyph } from './OrderPool'
import { useFormFactor } from './formFactor'
import { HintStrip, useFirstHint } from './HintStrip'
import { colors, fontStack, panel } from './theme'
import { useUi } from './uiStore'
import { Btn, seatColor } from './widgets'

const row: CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left', whiteSpace: 'normal' }

// ---------------------------------------------------------------- units to pick

/** Rows for a decision answered by naming a unit: hovering a row rings the unit on the table, a click answers. */
function UnitPick({ pending, state, seat }: { pending: PendingDecision; state: Snap; seat: string }) {
  const showOdds = useSettings((s) => s.showOdds)
  const opts = (pending.options ?? []).filter((o) => o.action.seat === seat)
  const units = [...new Set(opts.map((o) => (o.action as { payload?: { unitId?: string } }).payload?.unitId).filter((x): x is string => !!x))]
  const rest = opts.filter((o) => !(o.action as { payload?: { unitId?: string } }).payload?.unitId)
  return (
    <div data-testid="unit-pick" style={{ display: 'grid', gridTemplateColumns: units.length > 4 ? '1fr 1fr' : '1fr', gap: 5, maxHeight: '34vh', overflowY: 'auto', scrollbarWidth: 'none' }}>
      {units.map((id) => {
        const list = optionsForUnit(pending, id).filter((o) => o.action.seat === seat)
        const first = list[0]!
        const u = state.units[id]
        const facts = optionFacts(first, pending, state, showOdds)
        if (list.length > 1) {
          return (
            <div key={id} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 13 }}>{unitLabel(state, id)}</b>
              {list.map((o) => (
                <OptionRow key={o.id} opt={o} pending={pending} state={state} />
              ))}
            </div>
          )
        }
        return (
          <div key={id} style={{ display: 'contents' }}>
            <OptionRowUnit opt={first} pending={pending} state={state} rank={u?.rank} extra={facts.map((f) => f.text).join(' · ')} />
          </div>
        )
      })}
      {rest.map((o) => (
        <OptionRow key={o.id} opt={o} pending={pending} state={state} />
      ))}
    </div>
  )
}

function OptionRowUnit({ opt, pending, state, rank, extra }: { opt: PendingDecision['options'] extends (infer T)[] | undefined ? T : never; pending: PendingDecision; state: Snap; rank: string | undefined; extra: string }) {
  const dispatch = useGame((s) => s.dispatch)
  const unitId = (opt.action as { payload?: { unitId?: string } }).payload?.unitId ?? ''
  return (
    <Btn
      data-testid={`opt-${opt.id}`}
      onMouseEnter={() => useUi.setState({ hoverOption: unitId, hoverUnit: unitId })}
      onMouseLeave={() => useUi.setState({ hoverOption: null, hoverUnit: null })}
      onClick={() => {
        useUi.setState({ hoverOption: null, hoverUnit: null })
        dispatch(opt.action)
      }}
      style={row}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {rank && <RankGlyph rank={rank} size={11} color={colors.text} />}
        <b>{unitLabel(state, unitId)}</b>
      </span>
      <span style={factStyle}>{extra}{pending.kind === 'activation.pick' && rank ? rankName(state.data, rank) : ''}</span>
    </Btn>
  )
}

// ---------------------------------------------------------------- activation

function ActivationPrompt({ pending, state, seat }: { pending: PendingDecision; state: Snap; seat: string }) {
  const dispatch = useGame((s) => s.dispatch)
  const opts = (pending.options ?? []).filter((o) => o.action.seat === seat)
  const draw = opts.find((o) => o.action.type === 'activation.choose' && o.action.payload.drawPool)
  const units = opts.filter((o) => !(o.action.type === 'activation.choose' && o.action.payload.drawPool))
  const facts = draw ? optionFacts(draw, pending, state) : []
  return (
    <div data-testid="activation-prompt" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {units.length > 0 && <UnitPick pending={{ ...pending, options: units }} state={state} seat={seat} />}
      {draw && (
        <Btn variant="primary" data-testid="pool-draw" onClick={() => dispatch(draw.action)} style={row}>
          <span><Keyword term="Order pool">Draw from the order pool</Keyword></span>
          <span style={{ ...factStyle, color: colors.accentText }}>{facts.map((f) => f.text).join(' · ')}</span>
        </Btn>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- setup

const seatOf = (p: PendingDecision): string => (p.seat === 'all' ? '' : p.seat)

function EdgePrompt({ pending, state }: { pending: PendingDecision; state: Snap }) {
  const blue = String(pending.context.blue ?? '')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={factStyle}>{blue === seatOf(pending) ? 'You are the blue player (rolled), so you choose first.' : ''}</div>
      <OptionList pending={pending} state={state} />
    </div>
  )
}

/** The phone's sheet covers the near edge, where a deployment zone usually is: once per game the camera is brought over the zone. */
let focusedGame = ''
function useFocusDeployZone(pending: PendingDecision, compact: boolean): void {
  const seed = useGame((s) => s.meta?.seed ?? '')
  useEffect(() => {
    if (!compact || focusedGame === seed) return
    const regions = (pending.context.regions as { x: number; z: number }[][] | undefined) ?? []
    const pts = regions.flat()
    if (pts.length === 0) return
    focusedGame = seed
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const cz = pts.reduce((a, p) => a + p.z, 0) / pts.length
    cameraApi.current?.lookAt(cx, cz, 24)
  }, [compact, seed, pending])
}

function DeployPrompt({ pending, state, seat }: { pending: PendingDecision; state: Snap; seat: string }) {
  const picked = useUi((s) => s.deployUnit)
  const auto = useUi((s) => s.autoDeploy)
  const ids = (pending.context.unitIds as string[] | undefined) ?? []
  const current = deployUnitFor(pending, picked)
  const { touch, compact } = useFormFactor()
  useFocusDeployZone(pending, compact)
  const stagedOk = useUi((s) => !!s.hover && s.hoverNote?.ok === true)
  // "Deploy the rest for me": the engine's own spot for each unit, one decision at a time
  useEffect(() => {
    if (auto) doItForMe()
  }, [auto, pending.id])
  useEffect(() => {
    if (auto && ids.length === 0) useUi.setState({ autoDeploy: false })
  }, [auto, ids.length])
  void seat
  return (
    <div data-testid="deploy-prompt" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ids.map((id) => (
          <Btn key={id} variant={id === current ? 'active' : 'base'} data-testid={`deploy-unit-${id}`} onClick={() => useUi.setState({ deployUnit: id })}>
            {unitLabel(state, id)}
          </Btn>
        ))}
        <Btn onClick={() => rotateFacing(-Math.PI / 4)} data-testid="deploy-turn-left">{touch ? 'Turn left' : 'Turn left (Q)'}</Btn>
        <Btn onClick={() => rotateFacing(Math.PI / 4)} data-testid="deploy-turn-right">{touch ? 'Turn right' : 'Turn right (E)'}</Btn>
        <Btn data-testid="deploy-auto" onClick={() => useUi.setState({ autoDeploy: true })}>Deploy the rest for me</Btn>
        {touch && <Btn variant="primary" data-testid="deploy-place" disabled={!stagedOk} onClick={() => placeStaged()}>Place here</Btn>}
      </div>
      {touch && !compact && <div style={factStyle}>{stagedOk ? 'Tap the ghost again, or Place here, to set the unit down.' : 'Tap your side of the table to stage the unit; the ghost shows if it fits.'}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- movement

function ToolPrompt({ pending, state }: { pending: PendingDecision; state: Snap }) {
  const target = useUi((s) => s.toolTarget)
  const note = useUi((s) => s.toolNote)
  const unitId = String(pending.context.unitId ?? '')
  const climb = pending.context.climb === true
  const deploying = pending.context.deploying === true
  const touch = useFormFactor().touch
  return (
    <div data-testid="tool-prompt" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: note ? (note.ok ? colors.picked : colors.danger) : colors.muted }}>
        {note ? note.text : deploying ? 'Click a spot just inside your edge; the unit enters along the tool.' : touch ? 'Tap the table where the leader should end.' : 'Move the pointer over the table to see where the tool fits.'}
        {climb ? ' (Climb: speed 1 tool.)' : ''}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Btn variant="primary" data-testid="move-confirm" disabled={!target || !note?.ok} onClick={() => confirmTool()}>Confirm move</Btn>
        <Btn data-testid="move-cancel" onClick={() => cancelDecision()}>{target ? 'Re-aim' : 'Cancel move'}</Btn>
        <Btn data-testid="move-auto" onClick={() => doItForMe()}>Engine suggestion</Btn>
      </div>
      <div style={factStyle}>
        {touch
          ? `${unitLabel(state, unitId)}: tap a destination, then drag the gold hinge to bend the tool (the point rides above your finger). Confirm commits.`
          : `${unitLabel(state, unitId)}: click a destination, then drag the gold hinge to bend the tool. Enter confirms, Escape cancels.`}
      </div>
    </div>
  )
}

function BarricadePrompt() {
  return (
    <div data-testid="barricade-prompt" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Btn onClick={() => rotateFacing(-Math.PI / 4)} data-testid="barricade-turn-left">Turn left (Q)</Btn>
      <Btn onClick={() => rotateFacing(Math.PI / 4)} data-testid="barricade-turn-right">Turn right (E)</Btn>
      <Btn data-testid="barricade-auto" onClick={() => doItForMe()}>Engine suggestion</Btn>
    </div>
  )
}

function TroopersPrompt({ pending }: { pending: PendingDecision }) {
  const drag = useUi((s) => s.trooperDrag)
  const note = useUi((s) => s.toolNote)
  return (
    <div data-testid="troopers-prompt" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Object.keys(drag).length > 0 && note && <div data-testid="troopers-note" style={{ fontSize: 12, color: note.ok ? colors.picked : colors.danger }}>{note.text}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn variant="primary" data-testid="troopers-confirm" disabled={Object.keys(drag).length > 0 && note?.ok === false} onClick={() => confirmTroopers()}>{Object.keys(drag).length > 0 ? 'Confirm my placement' : 'Confirm placement'}</Btn>
        {Object.keys(drag).length > 0 && <Btn onClick={() => useUi.setState({ trooperDrag: {} })}>Reset</Btn>}
        <Btn onClick={() => { const s = useGame.getState(); if (s.state && s.pending) { const a = suggest(s.state, s.pending, s.viewer); if (a) s.dispatch(a) } }} data-testid="troopers-auto">Use engine placement</Btn>
      </div>
      <div style={{ display: 'none' }}>{pending.id}</div>
    </div>
  )
}

// ---------------------------------------------------------------- body switch

function Body({ pending, state, seat, legal }: { pending: PendingDecision; state: ReturnType<typeof useDisplayState> & object; seat: 'A' | 'B'; legal: Action[] | null }) {
  switch (pending.kind) {
    case 'setup.battle':
      return <EdgePrompt pending={pending} state={state} />
    case 'setup.deploy':
      return <DeployPrompt pending={pending} state={state} seat={seat} />
    case 'command.pick':
      return <CommandHand pending={pending} state={state} legal={legal} seat={seat} />
    case 'command.issuer':
    case 'command.order':
    case 'activation.pick':
    case 'attack.extraDefender':
    case 'attack.defender':
      return <UnitPick pending={pending} state={state} seat={seat} />
    case 'activation.choose':
      return <ActivationPrompt pending={pending} state={state} seat={seat} />
    case 'action.choose':
      return <ActionMenu pending={pending} state={state} />
    case 'move.tool':
      return <ToolPrompt pending={pending} state={state} />
    case 'move.troopers':
      return <TroopersPrompt pending={pending} />
    case 'battle.place':
      return pending.context.terrain === 'barricade' ? <BarricadePrompt /> : <OptionList pending={pending} state={state} />
    case 'attack.spend':
      return <SpendPrompt pending={pending} state={state} />
    default:
      // attack.pool, attack.spend, activation.standby, keyword.choice, card.choice, end.choice, confirm, battle.place and any kind
      // the engine adds later: the generic option list with the engine's labels and facts
      return <OptionList pending={pending} state={state} />
  }
}

/** keyword.choice / card.choice: the effect's own text from data explains what the choice does. */
function choiceHint(p: PendingDecision, state: Snap): string | null {
  if (p.kind === 'keyword.choice' && typeof p.context.keyword === 'string') return keywordRec(state.data, p.context.keyword)?.text ?? null
  if (p.kind === 'card.choice' && typeof p.context.cardId === 'string') return cardText(state.data, p.context.cardId) || null
  return null
}

const frame: CSSProperties = {
  ...panel,
  position: 'absolute',
  left: '50%',
  bottom: 12,
  transform: 'translateX(-50%)',
  width: 'min(660px, calc(100vw - 24px))',
  maxHeight: '58vh',
  overflowY: 'auto',
  scrollbarWidth: 'none',
  padding: '10px 12px',
  boxSizing: 'border-box',
  pointerEvents: 'auto',
  zIndex: 30,
  fontFamily: fontStack,
}

/** The sheet header's primary action while a staged move is folded away, so the board stays visible. */
function SheetSummary({ pending }: { pending: PendingDecision }) {
  const target = useUi((s) => s.toolTarget)
  const note = useUi((s) => s.toolNote)
  const stagedOk = useUi((s) => !!s.hover && s.hoverNote?.ok === true)
  if ((pending.kind === 'setup.deploy' || (pending.kind === 'battle.place' && pending.context.terrain === 'barricade')) && stagedOk) {
    return <Btn variant="primary" data-testid="deploy-place-folded" onClick={() => placeStaged()}>Place here</Btn>
  }
  if (pending.kind === 'move.tool' && target) {
    return <Btn variant="primary" data-testid="move-confirm-folded" disabled={!note?.ok} onClick={() => confirmTool()}>Confirm move</Btn>
  }
  return null
}

export function DecisionPrompt(): ReactNode {
  const state = useDisplayState()
  const pending = useGame((s) => s.pending)
  const legal = useGame((s) => s.legal)
  const live = useGame((s) => s.state)
  const viewer = useGame((s) => s.viewer)
  const settled = useSettled()
  const ff = useFormFactor()
  const toolTarget = useUi((s) => s.toolTarget)
  const stagedOk = useUi((s) => !!s.hover && s.hoverNote?.ok === true)
  const [folded] = useCollapsed('prompt')
  const firstHint = useFirstHint()
  // a new decision always opens unfolded
  const decisionId = pending?.id
  useEffect(() => {
    useCollapse.getState().setCollapsed('prompt', false)
  }, [decisionId])
  if (!state || !live || !pending || live.phase === 'ended' || !settled) return null
  const mine = humanToAct()
  // the simultaneous card pick stays up after the human picked, showing the face-down cards
  const showHand = pending.kind === 'command.pick'
  const phoneEdge: CSSProperties = ff.compact ? { left: 58, right: 8, bottom: 6, transform: 'none', width: 'auto' } : {}
  if (!mine && !showHand) {
    return (
      <div data-testid="waiting" style={{ ...frame, ...(ff.compact ? { ...phoneEdge, left: '50%', right: 'auto', transform: 'translateX(-50%)' } : {}), width: 'auto', padding: '6px 14px', fontSize: 13, color: colors.muted, borderTop: `3px solid ${seatColor(owedSeats(pending)[0] ?? viewer)}` }}>
        Opponent is deciding...
      </div>
    )
  }
  const seat = mine ?? viewer
  const title = decisionTitle(pending, state)
  const hint = choiceHint(pending, state) ?? (ff.touch ? touchHint(pending) : null) ?? decisionHint(pending)
  const continuous = pending.kind === 'setup.deploy' || pending.kind === 'move.tool' || pending.kind === 'move.troopers' || (pending.kind === 'battle.place' && pending.context.terrain === 'barricade')
  const passBtn = mine && pending.canPass && !continuous && !(pending.options ?? []).some((o) => o.action.type === 'pass') && (
    <Btn data-testid="opt-pass" style={{ marginTop: 6 }} onClick={() => useGame.getState().pass()}>
      {pending.kind.startsWith('attack.') ? 'Cancel (no action spent)' : 'Pass'}
    </Btn>
  )
  // on a phone the sheet is short: the first-turn hint rides inside it, and decisions answered on the board skip the long how-to line
  const isBarricadeKind = pending.kind === 'battle.place' && pending.context.terrain === 'barricade'
  const phoneHint = firstHint ? <HintStrip inline /> : continuous ? null : hint ? <div style={{ ...factStyle, marginBottom: 6, lineHeight: 1.3 }}><Rich text={hint} d={state.data} /></div> : null
  const body = (
    <>
      {ff.compact ? phoneHint : hint && <div style={{ ...factStyle, marginBottom: 8, lineHeight: 1.35 }}><Rich text={hint} d={state.data} /></div>}
      <Body pending={pending} state={state} seat={seat} legal={legal} />
      {passBtn}
    </>
  )
  if (ff.compact) {
    const staged = (pending.kind === 'move.tool' && !!toolTarget) || ((pending.kind === 'setup.deploy' || isBarricadeKind) && stagedOk)
    return (
      <BottomSheet
        testId="prompt"
        attrs={{ 'data-kind': pending.kind, 'data-decision': pending.id }}
        title={<span data-testid="prompt-title"><Rich text={title} d={state.data} /></span>}
        auto={staged}
        autoKey={`${pending.id}:${staged ? 'staged' : 'open'}`}
        left={58}
        right={8}
        summary={<SheetSummary pending={pending} />}
      >
        {body}
      </BottomSheet>
    )
  }
  if (folded) {
    return <CollapsedTab id="prompt" title={title} testId="collapsed-prompt" accent={seatColor(seat)} style={{ position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', zIndex: 30, maxWidth: 'calc(100vw - 24px)' }} />
  }
  const wide: CSSProperties = pending.kind === 'command.pick' ? { width: 'min(1040px, calc(100vw - 24px))' } : {}
  return (
    <div className="lf-touch" data-testid="prompt" data-kind={pending.kind} data-decision={pending.id} style={{ ...frame, ...wide, borderTop: `4px solid ${seatColor(seat)}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 2 }}>
        <div data-testid="prompt-title" style={{ fontWeight: 800, fontSize: 15, flex: 1 }}><Rich text={title} d={state.data} /></div>
        <CollapseButton id="prompt" title="prompt" />
      </div>
      {body}
    </div>
  )
}
