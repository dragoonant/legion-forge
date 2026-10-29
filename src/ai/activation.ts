// The activation planner (docs/spec/40-ai.md section 5): which unit to activate, and for the unit in play which action to take
// next. Every candidate is scored against the do-nothing baseline at the same horizon (the end of this activation, with the
// same threat map): `end` scores exactly 0, anything else must beat it. With two actions left a candidate's score includes the
// best second action it enables (move then attack, aim then attack, move then dodge, attack then move); after the first action
// the planner runs again on the new state, so the pair is never a commitment the board can contradict.
import type { Action, DecisionOption, GameState, Unit } from '@/engine'
import { markerValue, pocketMarkers } from './goals'
import { dist, leaderPos, maxRange, overlay, attackFrom, tieBreak, typicalValue, worthOf, reachOf } from './eval'
import { proposeSpots, stateValue, type Spot } from './moves'
import { enemiesOf, losBlocked, threatAt } from './threat'
import { exhausted, tracing, type AiCtx } from './tiers'

interface Cand {
  id: string
  score: number
  target?: string
  spot?: Spot
  why: string
}

/** Fraction of a standby token's value counted now (it only pays if something walks into the unit's sight later). */
const STANDBY_SHARE = 0.8

function posKey(p: { x: number; z: number }): string {
  return `${Math.round(p.x * 4)},${Math.round(p.z * 4)}`
}

/** Best exact attack for `unit` as it stands in `state`: the enemies in reach of its weapons, ranked by open-ground value, the best few asked of the engine. */
export function bestAttack(ctx: AiCtx, state: GameState, unit: Unit, aim: number, exactN = 3): { value: number; target: string } | null {
  const u = state.units[unit.id]!
  const range = maxRange(state, u)
  const at = leaderPos(u)
  const moved = u.flags.movedThisActivation ? 'm' : 's'
  const cands: { e: (typeof enemies)[number]; rank: number }[] = []
  const enemies = enemiesOf(ctx)
  for (const e of enemies) {
    const d = dist(e.pos, at)
    if (d > Math.max(range, 2.5) + 3.2) continue
    const rank = typicalValue(ctx, state, u, e.unit) * (losBlocked(state, at, e.pos) ? 0.3 : 1) + tieBreak(e.unit.id)
    cands.push({ e, rank })
  }
  cands.sort((a, b) => b.rank - a.rank)
  let best: { value: number; target: string } | null = null
  for (const { e } of cands.slice(0, exactN)) {
    const key = `atk|${u.id}|${posKey(at)}|${aim}|${e.unit.id}|${moved}|${e.unit.suppression}`
    const r = attackFrom(ctx, state, u, e.unit, aim, key)
    if (!r) continue
    const v = r.value + objectiveBonus(ctx, state, e.unit) + tieBreak(e.unit.id)
    if (!best || v > best.value) best = { value: v, target: e.unit.id }
  }
  return best
}

/** A target holding a marker we want is worth a little more than its wounds (it must go for us to win the marker). */
function objectiveBonus(ctx: AiCtx, state: GameState, target: Unit): number {
  let b = 0
  for (const m of pocketMarkers(state)) {
    const val = markerValue(ctx, state, ctx.seat, m)
    if (val <= 0) continue
    if (dist(leaderPos(target), m.pos) <= state.data.constants.halfRange + 1) b += val * 0.15
  }
  return b
}

function standbyGain(ctx: AiCtx, state: GameState, u: Unit): number {
  if (maxRange(state, u) <= 0) return 0
  const at = leaderPos(u)
  let none = 1
  let aMax = 0
  for (const e of enemiesOf(ctx)) {
    const d = dist(e.pos, at)
    const f = d <= 12 + e.reach * 0.6 ? 1 : d <= 30 ? 0.4 : 0
    if (f === 0 || e.weight < 0.5) continue
    none *= 1 - 0.5 * e.weight * f
    aMax = Math.max(aMax, typicalValue(ctx, state, u, e.unit))
  }
  return (1 - none) * aMax * STANDBY_SHARE * ctx.w.later * 1.6
}

function recoverGain(ctx: AiCtx, state: GameState, u: Unit): number {
  const worth = worthOf(state, u)
  return u.suppression * worth * 0.1
}

function pickBest(ctx: AiCtx, cands: Cand[]): Cand {
  cands.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
  if (tracing()) console.log(`[ai ${ctx.seat}] ${cands.map((c) => `${c.id}=${c.score.toFixed(1)}${c.why ? `(${c.why})` : ''}`).join(' ')}`)
  const top = cands[0]!
  if (ctx.params.topK <= 1 || cands.length === 1) return top
  const tol = ctx.params.noise * Math.max(2, Math.abs(top.score) * 0.3)
  const near = cands.filter((c) => c.score >= top.score - tol).slice(0, ctx.params.topK)
  return near[ctx.int(near.length)]!
}

function opt(o: DecisionOption | undefined): Action | null {
  return o ? o.action : null
}

/** `action.choose`: the next action of the unit in play. */
export function actionChoose(ctx: AiCtx): Action | null {
  const s = ctx.view
  const p = ctx.pending
  const unitId = String(p.context.unitId)
  const u = s.units[unitId]
  if (!u) return null
  const opts = p.options ?? []
  const by = new Map(opts.map((o) => [o.id, o]))
  const left = Number(p.context.actionsLeft ?? 1)
  const beh = ctx.memory.stats.behaviour

  let it = ctx.memory.intent
  if (!it || it.unitId !== unitId || it.round !== s.round) {
    it = { unitId, round: s.round, banned: [], move: null, target: null, chosen: null, chooseCount: 0, acted: false, couldAct: opts.some((o) => o.id !== 'end') }
    ctx.memory.intent = it
    beh.activations++
  }
  it.chooseCount++
  it.move = null
  it.target = null
  const banned = (id: string) => it!.banned.includes(id)
  const take = (id: string, why?: string): Action | null => {
    const o = by.get(id)
    if (!o) return null
    it!.chosen = id
    it!.banned.push(id)
    void why
    return o.action
  }
  const finish = (a: Action | null, id: string): Action | null => {
    beh.actions[id.replace(/:.*/, '')] = (beh.actions[id.replace(/:.*/, '')] ?? 0) + 1
    if (id === 'end' && !it!.acted && it!.couldAct) beh.zeroAction++
    if (id !== 'end') it!.acted = true
    return a
  }

  // a forced free action (Compel) is the only thing on offer
  if (opts.length === 1 && opts[0]!.id !== 'end') return finish(take(opts[0]!.id), opts[0]!.id)
  if (it.chooseCount > 7) return finish(opt(by.get('end')), 'end')

  // free actions first: Claim, granted attacks, aims and dodges, free card actions (each once per activation)
  if (by.has('claim') && !banned('claim')) {
    beh.claims++
    return finish(take('claim'), 'claim')
  }
  for (const o of opts) {
    if (banned(o.id)) continue
    if (o.id.startsWith('free:')) {
      const a = (o.data as { action?: string } | undefined)?.action
      if (a === 'attack' || a === 'aim' || a === 'dodge') return finish(take(o.id), 'free')
    }
  }
  for (const o of opts) {
    if (banned(o.id) || !o.id.startsWith('card:')) continue
    if ((o.data as { kind?: string } | undefined)?.kind === 'free') return finish(take(o.id), 'card')
  }

  const base = s
  const v0 = stateValue(ctx, base, unitId)
  const aimNow = u.tokens.aim ?? 0
  const lookahead = ctx.params.lookahead && left >= 2
  const cands: Cand[] = [{ id: 'end', score: 0, why: 'baseline' }]

  const A0 = by.has('attack') && !banned('attack') ? bestAttack(ctx, base, u, aimNow) : null
  if (A0) cands.push({ id: 'attack', score: A0.value, target: A0.target, why: 'shoot' })
  // the engine offers an attack but the budget ran out before it could be priced: a shot on offer is still worth taking
  else if (by.has('attack') && !banned('attack')) cands.push({ id: 'attack', score: 1, why: 'shoot (unpriced)' })

  // moves: spots for the plain Move (and the Withdraw of an engaged unit), each scored on the state it leaves
  const moveOpt = by.get('move')
  const wdOpt = by.get('withdraw')
  const moveKind: 'move' | 'withdraw' | null = moveOpt ? 'move' : wdOpt ? 'withdraw' : null
  let bestDv = 0
  const scoredSpots: { spot: Spot; dv: number; ov: GameState }[] = []
  if (moveKind && !banned(moveKind) && !exhausted(ctx)) {
    const maxSpeed = Number((by.get(moveKind)!.data as { maxSpeed?: number } | undefined)?.maxSpeed ?? 2)
    const spots = proposeSpots(ctx, u, moveKind, maxSpeed, ctx.params.spots)
    for (const spot of spots) {
      const ov = overlay(base, unitId, { leaderAt: spot.leader, yaw: spot.leader.yaw, moved: true })
      scoredSpots.push({ spot, dv: stateValue(ctx, ov, unitId) - v0, ov })
    }
    scoredSpots.sort((a, b) => b.dv - a.dv || (a.spot.value > b.spot.value ? -1 : 1))
    bestDv = scoredSpots.length ? Math.max(0, scoredSpots[0]!.dv) : 0
  }
  if (moveKind) {
    let rank = 0
    for (const { spot, dv, ov } of scoredSpots) {
      let second = 0
      let why = 'advance'
      if (lookahead && !exhausted(ctx)) {
        const ou = ov.units[unitId]!
        if (by.has('attack') && rank < 3) {
          const a = bestAttack(ctx, ov, ou, aimNow, 2)
          if (a && a.value > second) {
            second = a.value
            why = 'move+shoot'
          }
        }
        if (by.has('dodge') && rank < 2 && !exhausted(ctx)) {
          const ovD = overlay(ov, unitId, { addTokens: { dodge: 1 } })
          const g = threatAt(ctx, ov, ou) - threatAt(ctx, ovD, ovD.units[unitId]!)
          if (g > second) {
            second = g
            why = 'move+dodge'
          }
        }
        if (by.has('standby') && rank < 3) {
          const g = standbyGain(ctx, ov, ou)
          if (g > second) {
            second = g
            why = 'move+standby'
          }
        }
      }
      cands.push({ id: moveKind, score: dv + second + tieBreak(`${spot.leader.x},${spot.leader.z}`), spot, why })
      rank++
    }
  }
  if (A0 && lookahead && bestDv > 0) {
    const c = cands.find((x) => x.id === 'attack')!
    c.score += bestDv * 0.9
    c.why = 'shoot+move'
  }

  // aim: only pays when an attack follows (the token ends with the round)
  if (by.has('aim') && !banned('aim')) {
    let score = 0
    let why = ''
    if (lookahead && A0 && !exhausted(ctx)) {
      const t = base.units[A0.target]!
      const r = attackFrom(ctx, base, u, t, aimNow + 1, `atk|${u.id}|${posKey(leaderPos(u))}|${aimNow + 1}|${t.id}|s|${t.suppression}`)
      if (r) {
        score = r.value + objectiveBonus(ctx, base, t) - 0.01
        why = 'aim+shoot'
      }
    }
    cands.push({ id: 'aim', score, why })
  }
  if (by.has('dodge') && !banned('dodge') && !exhausted(ctx)) {
    const u1 = overlay(base, unitId, { addTokens: { dodge: 1 } }).units[unitId]!
    const gain = threatAt(ctx, base, u) - threatAt(ctx, overlay(base, unitId, { addTokens: { dodge: 1 } }), u1)
    const follow = lookahead ? Math.max(0, A0?.value ?? 0, bestDv) : 0
    cands.push({ id: 'dodge', score: gain + follow, why: 'dodge' })
  }
  if (by.has('standby') && !banned('standby')) {
    const g = standbyGain(ctx, base, u)
    cands.push({ id: 'standby', score: g + (lookahead ? bestDv : 0), why: 'standby' })
  }
  // recover: remove all the suppression (the largest k on offer)
  const recoverIds = opts.filter((o) => o.id.startsWith('recover:')).map((o) => o.id)
  if (recoverIds.length > 0 && !banned('recover')) {
    const best = recoverIds.sort((a, b) => Number(b.slice(8)) - Number(a.slice(8)))[0]!
    cands.push({ id: best, score: recoverGain(ctx, base, u) + (lookahead ? Math.max(0, A0?.value ?? 0, bestDv) * 0.8 : 0), why: 'recover' })
  }
  // climbing is never planned (cover on a roof is not scored); it stays on offer only for the engine's own menu
  const c = pickBest(ctx, cands.filter((x) => by.has(x.id)))
  if (c.id === 'end') return finish(opt(by.get('end')), 'end')
  it.target = c.target ?? null
  if (c.spot) {
    it.move = { kind: c.id, pose: c.spot.pose, leader: c.spot.leader }
    if (goalsMarkerNear(ctx, c.spot)) beh.objectiveMoves++
  }
  if (c.id === 'attack') {
    const r = String(s.round)
    beh.attacksByRound[r] = (beh.attacksByRound[r] ?? 0) + 1
  }
  // the one-per-activation actions leave the menu by themselves; a move or attack that fails is banned by its sub-decision
  it.chosen = c.id
  if (['aim', 'dodge', 'standby'].includes(c.id) || c.id.startsWith('recover')) it.banned.push(c.id.replace(/:.*/, ''))
  return finish(opt(by.get(c.id)), c.id)
}

function goalsMarkerNear(ctx: AiCtx, spot: Spot): boolean {
  for (const m of pocketMarkers(ctx.view)) if (dist(spot.leader, m.pos) <= ctx.view.data.constants.halfRange + 1) return true
  return false
}

// ---------------------------------------------------------------------------
// Which unit
// ---------------------------------------------------------------------------

/** How much activating this unit now is worth, cheaply: the best shot it has on someone in reach, or a marker it can take. */
export function quickValue(ctx: AiCtx, u: Unit): number {
  const s = ctx.view
  const key = `quick|${u.id}`
  const hit = ctx.cache.get(key) as number | undefined
  if (hit !== undefined) return hit
  let best = 0
  const at = leaderPos(u)
  const range = maxRange(s, u)
  const reach = u.location === 'table' ? reachOf(s, u) : 0
  for (const e of enemiesOf(ctx)) {
    const d = dist(at, e.pos)
    if (d > range + reach * 0.85 + 3) continue
    best = Math.max(best, typicalValue(ctx, s, u, e.unit) * (d <= range + 2 ? 1 : 0.7))
  }
  for (const m of pocketMarkers(s)) {
    const val = markerValue(ctx, s, ctx.seat, m)
    if (val <= 0 || u.location !== 'table') continue
    if (dist(at, m.pos) <= reach + s.data.constants.halfRange) best += val * 0.35
  }
  const v = best + worthOf(s, u) * 0.01 + (u.suppression > 0 ? -2 : 0)
  ctx.cache.set(key, v)
  return v
}

/** `activation.choose`: a face-up order now, or draw from the pool. */
export function activationChoose(ctx: AiCtx): Action | null {
  const s = ctx.view
  const p = ctx.pending
  const opts = p.options ?? []
  const units = opts.filter((o) => (o.action.payload as { unitId?: string }).unitId)
  const draw = opts.find((o) => (o.action.payload as { drawPool?: boolean }).drawPool)
  const beh = ctx.memory.stats.behaviour
  if (units.length === 0) {
    if (draw) {
      beh.poolDraws++
      return draw.action
    }
    return null
  }
  let bestU: { o: DecisionOption; v: number } | null = null
  for (const o of units) {
    const u = s.units[(o.action.payload as { unitId: string }).unitId]!
    const v = quickValue(ctx, u) + tieBreak(u.id)
    if (!bestU || v > bestU.v) bestU = { o, v }
  }
  if (!draw) {
    beh.ordersUsed++
    return bestU!.o.action
  }
  // the pool: expected value over the ranks left in the seat's own pool (it knows its own pool's contents by rank)
  const byRank = (draw.data as { byRank?: Record<string, number> } | undefined)?.byRank ?? {}
  let sum = 0
  let n = 0
  for (const [rank, count] of Object.entries(byRank)) {
    const cand = Object.values(s.units).filter((u) => u.seat === ctx.seat && u.order.state === 'pool' && u.rank.replace(/^.*\./, '') === rank.replace(/^.*\./, ''))
    if (cand.length === 0) continue
    const avg = cand.reduce((a, u) => a + quickValue(ctx, u), 0) / cand.length
    sum += avg * count
    n += count
  }
  const poolAvg = n > 0 ? sum / n : 0
  if (bestU!.v > poolAvg + 0.75) {
    beh.ordersUsed++
    return bestU!.o.action
  }
  beh.poolDraws++
  return draw.action
}

/** `activation.pick`: which of the units of the drawn rank. */
export function activationPick(ctx: AiCtx): Action | null {
  const s = ctx.view
  let best: { a: Action; v: number } | null = null
  for (const o of ctx.pending.options ?? []) {
    const u = s.units[(o.action.payload as { unitId: string }).unitId]
    if (!u) continue
    const v = quickValue(ctx, u) + tieBreak(u.id)
    if (!best || v > best.v) best = { a: o.action, v }
  }
  return best?.a ?? null
}

