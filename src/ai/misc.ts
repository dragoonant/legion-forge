// The small decisions (docs/spec/40-ai.md section 3): keyword and card choices, battle placements, End-phase choices, confirm.
// Each reads the option ids the engine raised; none of them re-derives a rule.
import { act, validate } from '@/engine'
import type { Action, DecisionOption } from '@/engine'
import { round3 } from '@/engine/geometry'
import { dist, leaderPos, overlay, tieBreak, worthOf } from './eval'
import { goalsFor } from './goals'
import { stateValue } from './moves'
import type { AiCtx } from './tiers'

const id = (o: DecisionOption) => o.id

/** The option with the smallest stable hash of its id: a choice that does not depend on the order the engine listed them in. */
function stable(opts: DecisionOption[]): DecisionOption {
  return opts.reduce((best, o) => (tieBreak(id(o)) < tieBreak(id(best)) ? o : best))
}

function firstOf(opts: DecisionOption[], ids: string[]): DecisionOption | undefined {
  for (const want of ids) {
    const o = opts.find((x) => id(x) === want)
    if (o) return o
  }
  return undefined
}


/** A declarative `choose` between effect lists (`opt:<i>`): the first listed is the one the card prints first (Specialist: Aim before Surge). */
function lowestOption(opts: DecisionOption[]): DecisionOption | undefined {
  const list = opts.filter((o) => /^opt:\d+$/.test(id(o)))
  return list.length === opts.length && list.length > 0 ? list.reduce((a, b) => (Number(id(b).slice(4)) < Number(id(a).slice(4)) ? b : a)) : undefined
}

/** Pick the unit option whose unit is hurt the most (suppression first) among `unit:<id>` options; null when none. */
function neediestUnit(ctx: AiCtx, opts: DecisionOption[]): DecisionOption | null {
  const s = ctx.view
  let best: { o: DecisionOption; v: number } | null = null
  for (const o of opts) {
    if (!id(o).startsWith('unit:')) continue
    const u = s.units[id(o).slice(5)]
    if (!u) continue
    const v = u.suppression * 100 + worthOf(s, u) + tieBreak(u.id)
    if (!best || v > best.v) best = { o, v }
  }
  return best?.o ?? null
}

/** `keyword.choice`: use what is free, accept what helps, keep what is set, spread tokens to the units that suffer. */
export function keywordChoice(ctx: AiCtx): Action | null {
  const opts = ctx.pending.options ?? []
  if (opts.length === 0) return null
  const stage = String(ctx.pending.context.stage ?? '')
  const first = lowestOption(opts)
  if (first) return first.action
  const direct = firstOf(opts, ['use', 'accept', 'keep'])
  if (direct && stage !== 'distribute') return direct.action
  if (stage === 'distribute' || opts.some((o) => id(o).startsWith('unit:'))) {
    const pick = neediestUnit(ctx, opts)
    if (pick) {
      const u = ctx.view.units[id(pick).slice(5)]
      if (u && u.suppression > 0) return pick.action
    }
    const done = firstOf(opts, ['done'])
    if (done) return done.action
    if (pick) return pick.action
  }
  const rest = opts.filter((o) => !['skip', 'decline', 'cancel', 'done'].includes(id(o)))
  return stable(rest.length > 0 ? rest : opts).action
}

/** `card.choice`: use a card effect when offered; for a unit or destination, the unit that is worth the most and the spot toward its goal. */
export function cardChoice(ctx: AiCtx): Action | null {
  const opts = ctx.pending.options ?? []
  if (opts.length === 0) return null
  const s = ctx.view
  const direct = firstOf(opts, ['use', 'accept', 'divulge'])
  if (direct) return direct.action
  const first = lowestOption(opts)
  if (first) return first.action
  const cardId = String(ctx.pending.context.cardId ?? ctx.pending.context.keyword ?? '')
  const harms = /vaders-might/.test(cardId)
  const units = opts.filter((o) => id(o).startsWith('unit:'))
  if (units.length > 0) {
    let best: { o: DecisionOption; v: number } | null = null
    for (const o of units) {
      const u = s.units[id(o).slice(5)]
      if (!u) continue
      const foe = u.seat !== ctx.seat
      // an action that hurts (Vader's Might wounds an enemy it moves) goes at the dearest enemy; the rest help the dearest friend
      if (harms && !foe) continue
      const v = (harms ? 1 : u.seat === ctx.seat ? 1 : -1) * worthOf(s, u) + tieBreak(u.id)
      if (!best || v > best.v) best = { o, v }
    }
    if (best) return best.o.action
    const none = firstOf(opts, ['cancel', 'skip', 'decline'])
    if (none) return none.action
  }
  const spots = opts.filter((o) => id(o).startsWith('to:'))
  if (spots.length > 0) {
    // the unit being moved (the card's target when it names one): a friend where its own value is best, a foe where its value is worst
    const mover = String(ctx.pending.context.targetId ?? ctx.pending.context.subjectId ?? ctx.pending.context.unitId ?? '')
    const u = s.units[mover]
    if (u && u.location === 'table') {
      const mine = u.seat === ctx.seat
      const pov = mine ? ctx : { ...ctx, seat: u.seat, cache: new Map() }
      const from = leaderPos(u)
      let best: { o: DecisionOption; v: number } | null = null
      const stay = opts.find((o) => id(o) === 'stay')
      const scoreAt = (at: { x: number; z: number }) => (mine ? 1 : -1) * stateValue(pov, overlay(s, u.id, { leaderAt: at }), u.id)
      if (stay) best = { o: stay, v: scoreAt(from) + 0.01 }
      for (const o of spots) {
        const d = o.data as { dx?: number; dz?: number } | undefined
        const v = scoreAt({ x: from.x + (d?.dx ?? 0), z: from.z + (d?.dz ?? 0) }) + tieBreak(id(o))
        if (!best || v > best.v) best = { o, v }
      }
      if (best) return best.o.action
    }
  }
  const rest = opts.filter((o) => !['skip', 'cancel', 'stay', 'decline'].includes(id(o)))
  return stable(rest.length > 0 ? rest : opts).action
}

/** `battle.place`: a legal spot in the offered region, nearest the middle of the table (cover for the army, fortifications toward the fight). */
export function battlePlace(ctx: AiCtx): Action | null {
  const p = ctx.pending
  if (p.context.terrain === 'barricade') return barricadePlace(ctx)
  const region = p.constraints?.region
  if (!region || region.length === 0) return null
  const xs = region.map((q) => q.x)
  const zs = region.map((q) => q.z)
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  const tries: { x: number; z: number; v: number }[] = []
  for (let i = 0; i < 48; i++) {
    const x = round3(box.minX + ctx.rand() * (box.maxX - box.minX))
    const z = round3(box.minZ + ctx.rand() * (box.maxZ - box.minZ))
    tries.push({ x, z, v: -Math.hypot(x * 0.5, z) })
  }
  tries.sort((a, b) => b.v - a.v)
  for (const t of tries) {
    const a = act.place(p, t.x, t.z)
    if (validate(ctx.view, a) === null) return a
  }
  return null
}

/** `end.choice`: the first option the engine lists (the End phase only offers choices that cost nothing). */
export function endChoice(ctx: AiCtx): Action | null {
  const opts = ctx.pending.options ?? []
  const rest = opts.filter((o) => !['skip', 'cancel', 'decline'].includes(id(o)))
  return rest.length > 0 || opts.length > 0 ? stable(rest.length > 0 ? rest : opts).action : null
}

/** `confirm`: play on. */
export function confirm(ctx: AiCtx): Action | null {
  const opts = ctx.pending.options ?? []
  const go = opts.find((o) => (o.action.payload as { choice?: string }).choice === 'continue')
  if (go) return go.action
  return opts[0]?.action ?? act.confirm(ctx.pending, 'continue')
}

/**
 * A barricade (Fortified Position): heavy cover and a wall that blocks sight, so it goes in front of our line, on the near side of the
 * middle, with its long side across the way the enemy comes. The engine's `validate` is the only judge of legality (own or contested
 * Territory, the spacing the decision names, clear of models and tokens).
 */
function barricadePlace(ctx: AiCtx): Action | null {
  const p = ctx.pending
  const s = ctx.view
  const mine = Object.values(s.units).filter((u) => u.seat === ctx.seat && u.location === 'table')
  // the way our army faces the table: toward its own centroid from the middle; with nothing deployed yet, the seat's own edge
  let cx = 0
  let cz = 0
  for (const u of mine) {
    const l = leaderPos(u)
    cx += l.x
    cz += l.z
  }
  if (mine.length > 0) {
    cx /= mine.length
    cz /= mine.length
  } else cz = ctx.seat === 'A' ? 1 : -1
  const alongX = Math.abs(cx) > Math.abs(cz)
  // long side (x at yaw 0) lies across the enemy's approach
  const yaws = alongX ? [Math.PI / 2, 0] : [0, Math.PI / 2]
  const b = s.table.def.bounds
  const want = { x: cx * 0.35, z: cz * 0.35 }
  const cands: { x: number; z: number; yaw: number; v: number }[] = []
  for (let x = Math.ceil(b.minX + 2); x <= b.maxX - 2; x += 2) {
    for (let z = Math.ceil(b.minZ + 2); z <= b.maxZ - 2; z += 2) {
      yaws.forEach((yaw, i) => cands.push({ x, z, yaw, v: -dist({ x, z }, want) - i * 1.5 + tieBreak(`${x},${z},${yaw}`) }))
    }
  }
  cands.sort((a, c) => c.v - a.v)
  let tried = 0
  for (const c of cands) {
    const a = { ...act.place(p, c.x, c.z), payload: { x: c.x, z: c.z, yaw: c.yaw } } as Action
    if (validate(s, a) === null) return a
    if (++tried > 400) break
  }
  return null
}
