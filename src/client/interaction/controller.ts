// Board interaction controller: turns hover/click points from the 3D scene into decision answers. Deploy spots, movement-tool
// placements and trooper placements are the continuous decisions; everything else is chosen from the prompt or by clicking the unit an
// option names. Gates: a click only answers when the open decision belongs to a human and can use that click. All verdicts and
// numbers come from the engine (`validate`, `fitTool`, `suggest`); this file only builds candidate actions and reads what the engine said.
import '@/engine' // the engine's modules import each other in a cycle: enter through the index before any submodule
import { act, suggest, validate, type Action, type DecisionOption, type GameState, type PendingDecision, type Pose2, type Vec2 } from '@/engine'
import { planTroopers } from '@/engine/movement'
import { humanToAct, useGame } from '../store/game'
import { rejectionText } from '../game/labels'
import { previewToward, type ToolPreview } from '../game/toolApi'
import { pushToast } from '../presentation/feedStore'
import { cameraApi } from '../board/cameraApi'
import { useUi, type Pt } from '../ui/uiStore'

// ---------------------------------------------------------------- touch input

let lastPointerType: string = 'mouse'
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => { lastPointerType = e.pointerType }, true)
/** Was the latest pointer a finger? Decides the two-step placement and the lifted hinge. */
export const isTouchInput = (): boolean => lastPointerType === 'touch'

/** CSS px a dragged hinge or trooper is held above the finger, so the base stays visible. */
export const TOUCH_LIFT_PX = 72
/** Inches within which a second tap counts as "the same spot" and places what the first tap staged. */
export const SAME_SPOT = 1.4

/** The world point under a pointer, lifted above the finger when the pointer is a finger. */
export function dragPoint(clientX: number, clientY: number, touch: boolean, fallback: Pt): Pt {
  if (!touch) return fallback
  return cameraApi.current?.groundAt?.(clientX, clientY - TOUCH_LIFT_PX) ?? fallback
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** Decisions whose options are answered by clicking the unit they name. */
export const UNIT_CLICK_KINDS: readonly string[] = ['command.issuer', 'command.order', 'activation.choose', 'activation.pick', 'attack.defender', 'attack.extraDefender', 'activation.standby']
/** Decisions answered by a click on the table. */
export const GROUND_KINDS: readonly string[] = ['setup.deploy', 'move.tool', 'move.troopers', 'battle.place']

// ---------------------------------------------------------------- facing

/** Turn `f` by `delta` radians and keep it in (-PI, PI]. */
export function turnedBy(f: number, delta: number): number {
  let r = f + delta
  while (r > Math.PI) r -= Math.PI * 2
  while (r <= -Math.PI) r += Math.PI * 2
  return round3(r)
}

/** Bearing from one point to another (radians, +Z = 0, +X = a quarter turn): the engine's facing convention. */
export function bearingTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

// ---------------------------------------------------------------- option lookup

/** The option of the open decision that names `unitId` (the first one when several do), or null. */
export function optionForUnit(pending: PendingDecision, unitId: string, seat?: string): DecisionOption | null {
  if (!UNIT_CLICK_KINDS.includes(pending.kind)) return null
  const opts = pending.options ?? []
  return opts.find((o) => (!seat || o.action.seat === seat) && 'payload' in o.action && (o.action.payload as { unitId?: string }).unitId === unitId) ?? null
}

/** Every unit a click can answer right now (for the actable ring). */
export function clickableUnits(pending: PendingDecision | null, seat: string | null): Set<string> {
  const out = new Set<string>()
  if (!pending || !seat || !UNIT_CLICK_KINDS.includes(pending.kind)) return out
  for (const o of pending.options ?? []) {
    if (o.action.seat !== seat) continue
    const id = (o.action as { payload?: { unitId?: string } }).payload?.unitId
    if (id) out.add(id)
  }
  return out
}

/** Distinct options for one unit (standby offers a unit several responses). */
export function optionsForUnit(pending: PendingDecision, unitId: string): DecisionOption[] {
  return (pending.options ?? []).filter((o) => (o.action as { payload?: { unitId?: string } }).payload?.unitId === unitId)
}

// ---------------------------------------------------------------- deployment

/** The unit the next deploy click places: the picked one if still to deploy, else the first left. */
export function deployUnitFor(pending: PendingDecision, picked: string | null): string | null {
  const ids = (pending.context.unitIds as string[] | undefined) ?? []
  return picked && ids.includes(picked) ? picked : (ids[0] ?? null)
}

/** The facing a unit is set up with: the player's choice, else toward the table (the span's inward direction). */
export function deployFacing(pending: PendingDecision, chosen: number | null): number {
  if (chosen !== null) return chosen
  const spans = pending.context.spans as { inward: Vec2 }[] | undefined
  const inward = spans?.[0]?.inward
  return inward ? round3(Math.atan2(inward.x, inward.z)) : 0
}

export interface Verdict {
  ok: boolean
  /** the engine's reason when not ok */
  text: string
}

/** The engine's verdict on setting a unit up at a point. */
export function previewDeploy(state: GameState, pending: PendingDecision, unitId: string, pt: Vec2, facing: number): Verdict {
  const seat = pending.seat === 'all' ? 'A' : pending.seat
  const rej = validate(state, { type: 'setup.deploy', seat, decisionId: pending.id, payload: { unitId, leader: { x: round3(pt.x), z: round3(pt.z), yaw: facing } } })
  return rej ? { ok: false, text: rejectionText(rej) } : { ok: true, text: 'Deploy here' }
}

/** Is the open `battle.place` a barricade (Fortified Position): placed on the table with a turn. */
export const isBarricade = (pending: PendingDecision): boolean => pending.kind === 'battle.place' && pending.context.terrain === 'barricade'

/** The barricade action for a click at `pt` turned by `yaw` (radians). */
export function barricadeAction(pending: PendingDecision, pt: Vec2, yaw: number): Action {
  const seat = pending.seat === 'all' ? 'A' : pending.seat
  return { type: 'battle.place', seat, decisionId: pending.id, payload: { x: round3(pt.x), z: round3(pt.z), yaw: round3(yaw) } }
}

/** The engine's verdict on setting a barricade down at a point. */
export function previewBarricade(state: GameState, pending: PendingDecision, pt: Vec2, yaw: number): Verdict {
  const rej = validate(state, barricadeAction(pending, pt, yaw))
  return rej ? { ok: false, text: rejectionText(rej) } : { ok: true, text: 'Place the barricade here' }
}

/** Where the rest of a deploying unit would stand (cohesion preview), from the engine's own placement. */
export function previewDeployTroopers(state: GameState, pending: PendingDecision, unitId: string, pt: Vec2): { miniId: string; x: number; z: number }[] {
  const unit = state.units[unitId]
  if (!unit || unit.minis.length < 2) return []
  const regions = (pending.context.regions as Vec2[][] | undefined) ?? []
  try {
    const plan = planTroopers(state, unit, { leader: { x: pt.x, y: 0, z: pt.z }, region: regions })
    return plan.placements.map((p) => ({ miniId: p.miniId, x: p.x, z: p.z }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------- the movement tool

/** The last tool preview the overlay computed, so Confirm sends exactly what the player saw. */
let lastTool: { key: string; preview: ToolPreview } | null = null
export function rememberToolPreview(key: string, preview: ToolPreview | null): void {
  lastTool = preview ? { key, preview } : null
}
export function currentToolPreview(): ToolPreview | null {
  return lastTool?.preview ?? null
}

/** The quantised key of a point (the previews are cached per quarter inch). */
export const ptKey = (p: Pt | null): string => (p ? `${Math.round(p.x * 4)}:${Math.round(p.z * 4)}` : '-')

// ---------------------------------------------------------------- pointer entry points

function live(): { state: GameState; pending: PendingDecision; seat: 'A' | 'B' } | null {
  const { state, pending } = useGame.getState()
  const seat = humanToAct()
  if (!state || !pending || !seat) return null
  return { state, pending, seat }
}

// ---------------------------------------------------------------- dragging (tool hinge, trooper ghosts)

export type Drag = { kind: 'hinge' } | { kind: 'trooper'; id: string }
let drag: Drag | null = null
export function beginDrag(d: Drag): void {
  drag = d
  cameraApi.current?.lockPan?.(true) // a finger dragging a hinge must not also pan the board
}
export function endDrag(): void {
  if (drag) cameraApi.current?.lockPan?.(false)
  drag = null
}
export const isDragging = (): boolean => drag !== null

/** Pointer moved over the table (null: left it). */
export function hoverPoint(pt: Pt | null): void {
  const ui = useUi.getState()
  if (drag && pt) {
    if (drag.kind === 'hinge') useUi.setState({ toolHinge: pt })
    else useUi.setState({ trooperDrag: { ...ui.trooperDrag, [drag.id]: pt } })
    return
  }
  if (!pt) {
    useUi.setState({ hover: null, hoverNote: null })
    return
  }
  const l = live()
  if (!l) {
    useUi.setState({ hover: pt, hoverNote: null })
    return
  }
  const { state, pending } = l
  if (isBarricade(pending)) {
    useUi.setState({ hover: pt, hoverNote: previewBarricade(state, pending, pt, deployFacing(pending, ui.facing)) })
    return
  }
  if (pending.kind === 'setup.deploy') {
    const unitId = deployUnitFor(pending, ui.deployUnit)
    if (!unitId) return
    const v = previewDeploy(state, pending, unitId, pt, deployFacing(pending, ui.facing))
    useUi.setState({ hover: pt, hoverNote: v })
    return
  }
  useUi.setState({ hover: pt, hoverNote: null })
}

/** A click on the table: places a deployment, aims the movement tool, or sets the ruler point. */
export function clickPoint(pt: Pt): void {
  const ui = useUi.getState()
  if (ui.pick) {
    // tapping the bare table drops a unit picked by touch
    useUi.setState({ pick: null, selected: null })
    return
  }
  if (ui.tool === 'ruler') {
    useUi.setState({ rulerPoint: pt })
    return
  }
  const l = live()
  if (!l) return
  const { state, pending, seat } = l
  switch (pending.kind) {
    case 'setup.deploy': {
      const unitId = deployUnitFor(pending, ui.deployUnit)
      if (!unitId) return
      // a finger has no hover: the first tap stages the ghost (green or red with the reason), a second tap on it places the unit
      if (isTouchInput() && !stagedAt(pt)) {
        hoverPoint(pt)
        return
      }
      const leader: Pose2 = { x: round3(pt.x), z: round3(pt.z), yaw: deployFacing(pending, ui.facing) }
      const action = act.deploy(pending, unitId, leader)
      void seat
      useGame.getState().dispatch(action)
      useUi.setState({ deployUnit: null })
      return
    }
    case 'move.tool': {
      const locked = ui.toolTarget
      const pv = currentToolPreview()
      // a second click on the ghost leader commits the move
      if (locked && pv?.ok && pv.leader && Math.hypot(pt.x - pv.leader.x, pt.z - pv.leader.z) < 1) {
        confirmTool()
        return
      }
      useUi.setState({ toolTarget: pt, toolHinge: null })
      return
    }
    case 'move.troopers':
      // a click on the table moves the selected trooper ghost there
      if (ui.hoverOption) useUi.setState({ trooperDrag: { ...ui.trooperDrag, [ui.hoverOption]: pt } })
      return
    case 'battle.place': {
      if (isBarricade(pending) && isTouchInput() && !stagedAt(pt)) {
        hoverPoint(pt)
        return
      }
      useGame.getState().dispatch(isBarricade(pending) ? barricadeAction(pending, pt, deployFacing(pending, ui.facing)) : act.place(pending, round3(pt.x), round3(pt.z)))
      return
    }
    default:
      void state
  }
}

/** Is `pt` the spot a previous tap staged (a second tap on it commits)? */
function stagedAt(pt: Pt): boolean {
  const { hover, hoverNote } = useUi.getState()
  return !!hover && !!hoverNote?.ok && Math.hypot(hover.x - pt.x, hover.z - pt.z) < SAME_SPOT
}

/** Place what a touch tap staged (the prompt's Place button): a deployment or a barricade at the staged spot. */
export function placeStaged(): boolean {
  const ui = useUi.getState()
  const l = live()
  if (!l || !ui.hover || !ui.hoverNote?.ok) return false
  const { pending } = l
  if (pending.kind === 'setup.deploy') {
    const unitId = deployUnitFor(pending, ui.deployUnit)
    if (!unitId) return false
    const leader: Pose2 = { x: round3(ui.hover.x), z: round3(ui.hover.z), yaw: deployFacing(pending, ui.facing) }
    const rej = useGame.getState().dispatch(act.deploy(pending, unitId, leader))
    if (!rej) useUi.setState({ deployUnit: null, hover: null, hoverNote: null })
    return !rej
  }
  if (isBarricade(pending)) {
    const rej = useGame.getState().dispatch(barricadeAction(pending, ui.hover, deployFacing(pending, ui.facing)))
    if (!rej) useUi.setState({ hover: null, hoverNote: null })
    return !rej
  }
  return false
}

/** Confirm the aimed movement tool (the button, Enter, or a second click). */
export function confirmTool(): boolean {
  const l = live()
  const pv = currentToolPreview()
  if (!l || l.pending.kind !== 'move.tool' || !pv?.ok || !pv.action) return false
  // the action carries the decision id of the preview; re-address it to the current decision to be safe
  const action = { ...pv.action, decisionId: l.pending.id, seat: l.seat } as Action
  const rej = useGame.getState().dispatch(action)
  if (!rej) useUi.setState({ toolTarget: null, toolHinge: null })
  return !rej
}

/** Confirm the trooper placement: the engine's suggestion with the player's drags applied. */
export function confirmTroopers(): boolean {
  const l = live()
  if (!l || l.pending.kind !== 'move.troopers') return false
  const base = (l.pending.context.suggestion as { miniId: string; x: number; z: number; yaw: number }[]) ?? []
  const drag = useUi.getState().trooperDrag
  const placements = base.map((p) => (drag[p.miniId] ? { ...p, x: round3(drag[p.miniId]!.x), z: round3(drag[p.miniId]!.z) } : p))
  const rej = useGame.getState().dispatch(act.troopers(l.pending, placements))
  return !rej
}

/** A click on a unit: answers the open decision when the unit is an option of it, else selects the unit (card + LoS probe). */
export function clickUnit(unitId: string): void {
  const ui = useUi.getState()
  if (ui.tool === 'los') {
    const pair = ui.losPair.length >= 2 ? [unitId] : [...ui.losPair, unitId]
    useUi.setState({ losPair: pair, selected: unitId })
    return
  }
  if (ui.tool === 'ruler') {
    useUi.setState({ selected: unitId, rulerPoint: null })
    return
  }
  const l = live()
  if (l) {
    const opts = optionsForUnit(l.pending, unitId).filter((o) => o.action.seat === l.seat)
    if (UNIT_CLICK_KINDS.includes(l.pending.kind) && opts.length === 1) {
      // a finger covers what it taps: the unit is picked first and a slim bar asks to confirm
      if (isTouchInput()) {
        useUi.setState({ pick: { unitId, optionId: opts[0]!.id }, selected: unitId })
        return
      }
      useGame.getState().dispatch(opts[0]!.action)
      return
    }
    if (opts.length > 1) {
      // several answers for one unit (standby responses): the prompt lists them
      useUi.setState({ selected: unitId, hoverOption: unitId })
      return
    }
  }
  useUi.setState({ selected: unitId })
}

/** The unit picked on the board by touch, with the option it would answer. */
export function pickedOption(): { unitId: string; option: DecisionOption } | null {
  const pick = useUi.getState().pick
  const l = live()
  if (!pick || !l) return null
  const option = (l.pending.options ?? []).find((o) => o.id === pick.optionId && o.action.seat === l.seat)
  return option ? { unitId: pick.unitId, option } : null
}

/** The confirm bar's Confirm: answer the open decision with the picked unit's option. */
export function confirmPick(): boolean {
  const p = pickedOption()
  useUi.setState({ pick: null, selected: null })
  if (!p) return false
  return !useGame.getState().dispatch(p.option.action)
}

export function cancelPick(): void {
  useUi.setState({ pick: null, selected: null })
}

/** Escape / right click: cancels a pending move before anything resolved, else clears the tool and selection. */
export function cancelDecision(): boolean {
  const ui = useUi.getState()
  if (ui.pick) {
    cancelPick()
    return true
  }
  if (ui.tool !== 'none') {
    useUi.setState({ tool: 'none', losPair: [], rulerPoint: null })
    return true
  }
  const l = live()
  if (l && l.pending.kind === 'move.tool') {
    if (ui.toolTarget) {
      useUi.setState({ toolTarget: null, toolHinge: null })
      return true
    }
    if (l.pending.canPass) {
      useGame.getState().pass()
      return true
    }
  }
  if (l && l.pending.kind === 'setup.deploy' && ui.deployUnit) {
    useUi.setState({ deployUnit: null })
    return true
  }
  if (ui.selected) {
    useUi.setState({ selected: null })
    return true
  }
  return false
}

/** Q / E: turn the facing a unit is deployed with, or the barricade being placed. */
export function rotateFacing(delta: number): void {
  const l = live()
  if (!l || (l.pending.kind !== 'setup.deploy' && !isBarricade(l.pending))) return
  const ui = useUi.getState()
  useUi.setState({ facing: turnedBy(deployFacing(l.pending, ui.facing), delta) })
}

/** The engine's own answer for the pending continuous decision ("do it for me"): deploy spot, tool placement, trooper placement. */
export function doItForMe(): void {
  const l = live()
  if (!l) return
  const { pending } = l
  const a = suggest(l.state, pending, l.seat)
  if (a) useGame.getState().dispatch(a)
  else pushToast('The engine has no suggestion for this decision.', 'warn')
}

/** The preview for the pending tool decision at a destination (used by the overlay and by tests). */
export function toolPreviewAt(state: GameState, pending: PendingDecision, pt: Vec2): ToolPreview {
  return previewToward(state, pending, pt)
}
