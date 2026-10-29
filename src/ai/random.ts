// The random tier and the last-resort fallback (docs/spec/40-ai.md sections 2 and 6). Uniform over legal actions (an action type
// first, so a rare option is not drowned by many similar ones); continuous kinds get a random legal sample checked with
// `validate`, falling back to the engine's `suggest`. Uses only the seeded stream of the AiCtx, never Math.random.
import { act, suggest, validate, type Action, type PendingDecision, type Seat } from '@/engine'
import { round3 } from '@/engine/geometry'
import { leaderOf } from '@/engine/state'
import { suggestToolToward } from '@/engine/movement'
import { markersOf } from '@/engine/battle'
import type { AiCtx } from './tiers'

export function passAction(p: PendingDecision, seat: Seat): Action {
  return { type: 'pass', seat, decisionId: p.id, payload: {} } as Action
}

const ACTION_WEIGHTS: Record<string, number> = { move: 4, climb: 1, withdraw: 2, attack: 3, aim: 1, dodge: 1, recover: 1.5, standby: 0.7, claim: 6, cardAction: 2, free: 4, end: 0.15 }

function chooseType(ctx: AiCtx, legal: Action[]): Action {
  const groups = new Map<string, Action[]>()
  for (const a of legal) {
    const key = a.type === 'action.choose' ? a.payload.action : a.type
    const l = groups.get(key)
    if (l) l.push(a)
    else groups.set(key, [a])
  }
  const keys = [...groups.keys()]
  const weights = keys.map((k) => ACTION_WEIGHTS[k] ?? 1)
  let roll = ctx.rand() * weights.reduce((x, y) => x + y, 0)
  let pick = keys[keys.length - 1]!
  for (let i = 0; i < keys.length; i++) {
    roll -= weights[i]!
    if (roll < 0) {
      pick = keys[i]!
      break
    }
  }
  const list = groups.get(pick)!
  return list[ctx.int(list.length)]!
}

function randomDeploy(ctx: AiCtx): Action | null {
  const { pending, view } = ctx
  const c = pending.constraints!
  const ids = (pending.context.unitIds as string[] | undefined) ?? (c.unitId ? [c.unitId] : [])
  if (ids.length === 0 || !c.region) return null
  const xs = c.region.map((p) => p.x)
  const zs = c.region.map((p) => p.z)
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  const id = c.unitId ?? ids[ctx.int(ids.length)]!
  for (let i = 0; i < 60; i++) {
    const a = act.deploy(pending, id, { x: round3(box.minX + ctx.rand() * (box.maxX - box.minX)), z: round3(box.minZ + ctx.rand() * (box.maxZ - box.minZ)), yaw: round3((ctx.rand() - 0.5) * 2 * Math.PI) })
    if (!validate(view, a)) return a
  }
  return null
}

function randomTool(ctx: AiCtx): Action | null {
  const { pending, view, seat } = ctx
  const unitId = pending.constraints?.unitId
  if (!unitId) return null
  const unit = view.units[unitId]
  if (!unit) return null
  const from = unit.location === 'table' ? leaderOf(unit).pos : { x: 0, z: 0 }
  for (let i = 0; i < 6; i++) {
    const pois = markersOf(view, 'poi')
    let target: { x: number; z: number }
    if (pois.length > 0 && ctx.rand() < 0.5) {
      const m = pois[ctx.int(pois.length)]!
      target = { x: m.pos.x + (ctx.rand() - 0.5) * 3, z: m.pos.z + (ctx.rand() - 0.5) * 3 }
    } else {
      const ang = ctx.rand() * Math.PI * 2
      target = { x: from.x + Math.sin(ang) * 8, z: from.z + Math.cos(ang) * 8 }
    }
    const a = suggestToolToward(view, pending, seat, unitId, target, true)
    if (a && !validate(view, a)) return a
  }
  return null
}

/** Uniform random legal answer; never throws for a decision the engine can raise. */
export function randomPolicy(ctx: AiCtx): Action {
  const { pending, legal, view, seat } = ctx
  if (legal && legal.length > 0) {
    if (pending.kind === 'action.choose') return chooseType(ctx, legal)
    if (pending.kind === 'activation.standby') {
      const pass = legal.find((a) => a.type === 'pass')
      if (pass && ctx.rand() < 0.5) return pass
    }
    return legal[ctx.int(legal.length)]!
  }
  let a: Action | null = null
  if (pending.kind === 'setup.deploy') a = randomDeploy(ctx)
  else if (pending.kind === 'move.tool') a = randomTool(ctx)
  if (a) return a
  return suggestPolicy(ctx)
}

/**
 * The scored fallback for a decision no policy answered (an unhandled kind, or an answer the engine would refuse): the
 * engine's own suggestion, then the first legal option, then a pass. Never random; the decider counts every use.
 */
export function suggestPolicy(ctx: AiCtx): Action {
  const { pending, legal, view, seat } = ctx
  const s = suggest(view, pending, seat)
  if (s && !validate(view, s)) return s
  if (legal && legal.length > 0) return legal.find((a) => a.type !== 'pass') ?? legal[0]!
  if (pending.canPass) return passAction(pending, seat)
  if (s) return s
  throw new Error(`no answer for ${pending.kind}`)
}
