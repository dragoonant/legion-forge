// Attack-time decisions (docs/spec/40-ai.md section 3): the defender, the pool, extra defenders, token spends, wound allocation
// and Standby responses. The plan chose the attack at `action.choose`; here the same valuation (`damageValue`) re-ranks what
// the engine actually offers, using the odds the engine puts on each option (`data.odds`) or asks `query.attackOdds` for.
import { act } from '@/engine'
import type { Action, DecisionOption } from '@/engine'
import * as query from '@/engine/query'
import { damageValue, tieBreak, worthOf } from './eval'
import { spend, COST, type AiCtx } from './tiers'

function payloadOf<T>(o: DecisionOption): T {
  return o.action.payload as T
}

/** `attack.defender`: the offered target with the best value; the target the plan named wins a near tie. */
export function defender(ctx: AiCtx): Action | null {
  const s = ctx.view
  let best: { a: Action; v: number } | null = null
  const planned = ctx.memory.intent?.target
  for (const o of ctx.pending.options ?? []) {
    const id = payloadOf<{ unitId: string }>(o).unitId
    const def = s.units[id]
    if (!def) continue
    const odds = (o.data as { odds?: { expectedWounds: number; pDefeat: number; pAnyHit: number } } | undefined)?.odds
    let v = odds ? damageValue(ctx, s, def, odds) : worthOf(s, def) * 0.05
    if (id === planned) v *= 1.08
    v += tieBreak(id)
    if (!best || v > best.v) best = { a: o.action, v }
  }
  return best?.a ?? null
}

/** `attack.pool`: the pool with the most expected damage (the engine's full pool when it is the only one). */
export function pool(ctx: AiCtx): Action | null {
  const opts = ctx.pending.options ?? []
  if (opts.length === 0) return null
  if (opts.length === 1) return opts[0]!.action
  const s = ctx.view
  const atk = String(ctx.pending.context.attackerId)
  const def = s.units[String(ctx.pending.context.defenderId)]
  let best: { a: Action; v: number } | null = null
  // many pools: the engine's default and the ones with the most dice (the odds query is the dear part)
  const dice = (o: DecisionOption) => Object.values((o.data as { dice?: Record<string, number> } | undefined)?.dice ?? {}).reduce((a, b) => a + b, 0)
  const considered = opts.length <= 6 ? opts : [...opts].sort((a, b) => dice(b) - dice(a) || (a.id < b.id ? -1 : 1)).slice(0, 6)
  for (const o of considered) {
    const d = o.data as { weapons?: { miniId: string; weaponId: string }[]; auto?: boolean } | undefined
    let v = (d?.auto ? 0.001 : 0) + tieBreak(o.id)
    if (def && d?.weapons && spend(ctx, COST.odds)) {
      try {
        v += damageValue(ctx, s, def, query.attackOdds(s, atk, def.id, { weapons: d.weapons }))
      } catch {
        // an unscorable pool keeps only its default bonus
      }
    }
    if (!best || v > best.v) best = { a: o.action, v }
  }
  return best?.a ?? opts[0]!.action
}

/** `attack.extraDefender`: add another defender when the remaining models can hurt it, else done. */
export function extraDefender(ctx: AiCtx): Action | null {
  const s = ctx.view
  const atk = String(ctx.pending.context.attackerId)
  let best: { a: Action; v: number } | null = null
  const done = (ctx.pending.options ?? []).find((o) => payloadOf<{ done?: boolean }>(o).done)
  if (ctx.tier === 'easy') return done?.action ?? null
  for (const o of ctx.pending.options ?? []) {
    const id = payloadOf<{ unitId?: string }>(o).unitId
    if (!id || !s.units[id] || !spend(ctx, COST.odds)) continue
    let v = 0
    try {
      v = damageValue(ctx, s, s.units[id]!, query.attackOdds(s, atk, id, { aim: 0 })) * 0.5
    } catch {
      v = 0
    }
    if (!best || v > best.v) best = { a: o.action, v }
  }
  if (best && best.v >= 1) return best.a
  return done?.action ?? null
}

/** `attack.spend`: the engine flags its own best option `auto` (all the dodge tokens that pay, the worst dice to reroll, no cancel). */
export function attackSpend(ctx: AiCtx): Action | null {
  const opts = ctx.pending.options ?? []
  const auto = opts.find((o) => (o.data as { auto?: boolean } | undefined)?.auto)
  return (auto ?? opts[0])?.action ?? null
}

/** `attack.allocate`: wound the models that are already hurt first, then those whose weapons matter least; the leader last. */
export function allocate(ctx: AiCtx): Action | null {
  const s = ctx.view
  const unit = s.units[String(ctx.pending.context.unitId)]
  let best: { a: Action; v: number } | null = null
  for (const o of ctx.pending.options ?? []) {
    const d = o.data as { miniId?: string; weapons?: string[]; wounds?: number; maxWounds?: number } | undefined
    if (!d?.miniId) continue
    let weaponValue = 0
    if (unit) for (const w of d.weapons ?? []) weaponValue += query.weaponValue(s, w)
    const hurt = (d.wounds ?? 0) > 0 ? 100 : 0
    const leader = unit && d.miniId === unit.leaderId ? 8 : 0
    // finishing a model removes its whole remaining wound pool from play
    const v = hurt + (d.wounds ?? 0) * 10 - weaponValue - leader + tieBreak(d.miniId) - (d.maxWounds ?? 1) * 0.1
    if (!best || v > best.v) best = { a: o.action, v }
  }
  return best?.a ?? null
}

/** `activation.standby`: shoot whoever triggered it when the odds give anything, else let the token ride. */
export function standby(ctx: AiCtx): Action | null {
  const s = ctx.view
  const trigger = String(ctx.pending.context.triggerUnitId)
  const def = s.units[trigger]
  const beh = ctx.memory.stats.behaviour
  let best: { a: Action; v: number } | null = null
  for (const o of ctx.pending.options ?? []) {
    const pl = payloadOf<{ unitId?: string; response?: string }>(o)
    if (!pl.unitId || !def) continue
    let v = 0
    if (pl.response === 'attack' && spend(ctx, COST.target + COST.odds)) {
      try {
        const check = query.checkTarget(s, pl.unitId, trigger)
        if (check.ok) v = damageValue(ctx, s, def, query.attackOdds(s, pl.unitId, trigger, { aim: s.units[pl.unitId]!.tokens.aim ?? 0 })) + 0.5
      } catch {
        v = 0
      }
    }
    if (v > 0 && (!best || v > best.v)) best = { a: o.action, v }
  }
  if (best) {
    const r = (best.a.payload as { response?: string }).response ?? 'attack'
    beh.standby[r] = (beh.standby[r] ?? 0) + 1
    return best.a
  }
  return ctx.pending.canPass ? act.pass(ctx.pending) : null
}

