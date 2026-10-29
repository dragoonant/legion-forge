// The threat map (docs/spec/40-ai.md section 4): the points a unit expects to lose at a spot before the round ends, from each
// enemy unit that can still act. The odds come from `query.attackOdds` (through `typicalValue`, an open-ground engagement cached
// across decisions); only the reach test, the cover discount and the sight-line discount are geometry, and they are
// deliberately coarse: the engine judges the real attack, this map only ranks spots.
import { piecesWithin } from '@/engine/table'
import { segmentPolygonIntervals, pointInPolygon } from '@/engine/geometry'
import { miniBody } from '@/engine/measure'
import { leaderOf } from '@/engine/state'
import type { GameState, TerrainPiece, Unit, Vec2 } from '@/engine'
import { dist, leaderPos, maxRange, onTable, otherSeat, reachOf, typicalValue } from './eval'
import type { AiCtx } from './tiers'

export interface Enemy {
  unit: Unit
  /** how likely it still gets to act before our next chance (1 face-up order, less from the pool, little once activated) */
  weight: number
  pos: Vec2
  range: number
  reach: number
}

/** Heuristic discounts (not rules): the cover a spot is judged to give and the sight-line penalty. */
export const COVER_FACTOR = { none: 1, light: 0.8, heavy: 0.62 } as const
const BLOCKED_FACTOR = 0.35
/** How strongly an enemy's fire is shared over the other targets it could pick. */
const SHARE = 0.6

export function enemiesOf(ctx: AiCtx): Enemy[] {
  const hit = ctx.cache.get('enemies') as Enemy[] | undefined
  if (hit) return hit
  const s = ctx.view
  const out: Enemy[] = onTable(s, otherSeat(ctx.seat)).map((e) => {
    let weight = e.order.state === 'faceUp' ? 1 : e.order.state === 'pool' ? 0.85 : 0.3
    if (e.activated && (e.tokens.standby ?? 0) > 0) weight = Math.max(weight, 0.6)
    return { unit: e, weight, pos: leaderPos(e), range: maxRange(s, e), reach: reachOf(s, e) }
  })
  ctx.cache.set('enemies', out)
  return out
}

function friendsOf(ctx: AiCtx, exceptId: string): Vec2[] {
  const hit = ctx.cache.get('friends') as { id: string; p: Vec2 }[] | undefined
  const all = hit ?? onTable(ctx.view, ctx.seat).map((u) => ({ id: u.id, p: leaderPos(u) }))
  if (!hit) ctx.cache.set('friends', all)
  return all.filter((f) => f.id !== exceptId).map((f) => f.p)
}

export function coverAt(state: GameState, pos: Vec2, radius: number): keyof typeof COVER_FACTOR {
  const pieces = state.table.def.pieces.filter((p) => p.cover !== 'none')
  if (pieces.length === 0) return 'none'
  const near = piecesWithin(pieces, { pos, baseRadius: radius }, 0.6)
  let best: keyof typeof COVER_FACTOR = 'none'
  for (const p of near) {
    if (p.cover === 'heavy') return 'heavy'
    if (p.cover === 'light') best = 'light'
  }
  return best
}

/** Is the straight line between two points cut by a piece that blocks sight (a piece an endpoint stands inside does not count)? */
export function losBlocked(state: GameState, a: Vec2, b: Vec2): boolean {
  for (const p of state.table.def.pieces as TerrainPiece[]) {
    if (!p.blocksLos) continue
    if (Math.max(a.x, b.x) < p.bbox.minX || Math.min(a.x, b.x) > p.bbox.maxX || Math.max(a.z, b.z) < p.bbox.minZ || Math.min(a.z, b.z) > p.bbox.maxZ) continue
    if (pointInPolygon(a, p.footprint) || pointInPolygon(b, p.footprint)) continue
    if (segmentPolygonIntervals(a, b, p.footprint).length > 0) return true
  }
  return false
}


/** Expected points `unit` (as it stands in `state`) loses to the enemies that can reach it, scaled by the tier's threat weight. */
export function threatAt(ctx: AiCtx, state: GameState, unit: Unit): number {
  if (ctx.params.threatScale <= 0) return 0
  const at = leaderPos(unit)
  const radius = miniBody(state, leaderOf(unit)).baseRadius
  const cf = COVER_FACTOR[coverAt(state, at, radius)]
  const dodge = unit.tokens.dodge ?? 0
  let sum = 0
  const friends = friendsOf(ctx, unit.id)
  for (const e of enemiesOf(ctx)) {
    const d = dist(e.pos, at)
    const far = e.range + e.reach * 0.85 + radius
    if (d > far + 2) continue
    const near = d <= far ? 1 : (far + 2 - d) / 2
    // an enemy unit attacks one target: it splits its fire over everything of ours it could choose
    let others = 0
    for (const f of friends) if (dist(e.pos, f) <= far) others++
    const seen = e.range > 0 && losBlocked(state, e.pos, at) ? BLOCKED_FACTOR : 1
    const v = typicalValue(ctx, state, e.unit, unit, dodge)
    sum += (e.weight * near * seen * cf * v) / (1 + SHARE * others)
  }
  return sum * ctx.w.threat * ctx.params.threatScale
}
