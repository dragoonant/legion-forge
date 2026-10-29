// Setup decisions (docs/spec/40-ai.md section 3): the table edge and where units that start deployed stand. Units without
// Prepared Position enter by their first Move, which the activation planner handles.
import { act, validate } from '@/engine'
import type { Action, Vec2 } from '@/engine'
import { round3 } from '@/engine/geometry'
import { footprintInsidePolygon } from '@/engine/footprint'
import { miniBody } from '@/engine/measure'
import { leaderOf } from '@/engine/state'
import { hash32, overlay, tieBreak } from './eval'
import { stateValue } from './moves'
import type { AiCtx } from './tiers'

type Edge = 'zMax' | 'xMax' | 'zMin' | 'xMin'

/** The strip of the table along an edge, 9" deep and 24" wide (the Territory a seat sitting there starts in). */
function strip(edge: Edge): { minX: number; maxX: number; minZ: number; maxZ: number } {
  switch (edge) {
    case 'zMax':
      return { minX: -12, maxX: 12, minZ: 9, maxZ: 18 }
    case 'zMin':
      return { minX: -12, maxX: 12, minZ: -18, maxZ: -9 }
    case 'xMax':
      return { minX: 9, maxX: 18, minZ: -12, maxZ: 12 }
    default:
      return { minX: -18, maxX: -9, minZ: -12, maxZ: 12 }
  }
}

const opposite: Record<Edge, Edge> = { zMax: 'zMin', zMin: 'zMax', xMax: 'xMin', xMin: 'xMax' }

/** How much cover and sight-blocking a strip of the table holds. */
function coverIn(ctx: AiCtx, box: ReturnType<typeof strip>): number {
  let v = 0
  for (const p of ctx.view.table.def.pieces) {
    const cx = (p.bbox.minX + p.bbox.maxX) / 2
    const cz = (p.bbox.minZ + p.bbox.maxZ) / 2
    if (cx < box.minX || cx > box.maxX || cz < box.minZ || cz > box.maxZ) continue
    v += (p.cover === 'heavy' ? 1.5 : p.cover === 'light' ? 1 : 0) + (p.blocksLos ? 0.5 : 0)
  }
  return v
}

/** `setup.battle`: the edge whose strip holds the most cover for us and the least for them. */
export function battle(ctx: AiCtx): Action | null {
  const opts = ctx.pending.options ?? []
  let best: { a: Action; v: number } | null = null
  for (const o of opts) {
    const edge = (o.data as { edge?: Edge } | undefined)?.edge
    if (!edge) continue
    const v = coverIn(ctx, strip(edge)) - 0.5 * coverIn(ctx, strip(opposite[edge])) + (hash32(`${ctx.seed}${edge}`) % 1000) * 1e-6
    if (!best || v > best.v) best = { a: o.action, v }
  }
  if (best) return best.a
  const first = opts.find((o) => (o.action.payload as { cardId?: string }).cardId) ?? opts[0]
  return first?.action ?? null
}

/** `setup.deploy`: the best of a spread of spots inside the region (position value of the unit standing there). */
export function deploy(ctx: AiCtx): Action | null {
  const p = ctx.pending
  const c = p.constraints
  const region = c?.region
  const unitId = c?.unitId ?? (p.context.unitIds as string[] | undefined)?.[0]
  if (!region || !unitId) return null
  const s = ctx.view
  const unit = s.units[unitId]
  if (!unit) return null
  const lead = leaderOf(unit)
  const r = miniBody(s, lead).baseRadius
  const xs = region.map((q) => q.x)
  const zs = region.map((q) => q.z)
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  const enemyDir = unit.seat === 'A' ? 1 : -1
  const pts: Vec2[] = []
  const n = ctx.tier === 'easy' ? 16 : 40
  for (let i = 0; i < n; i++) pts.push({ x: round3(box.minX + ctx.rand() * (box.maxX - box.minX)), z: round3(box.minZ + ctx.rand() * (box.maxZ - box.minZ)) })
  const scored = pts
    .filter((q) => footprintInsidePolygon({ pos: q, baseRadius: r + 1.2 }, region))
    .map((q) => ({ q, v: stateValue(ctx, overlay(s, unitId, { leaderAt: q, yaw: enemyDir > 0 ? Math.PI : 0 }), unitId) + tieBreak(`${q.x},${q.z}`) }))
    .sort((a, b) => b.v - a.v)
  for (const { q } of scored) {
    const a = act.deploy(p, unitId, { x: q.x, z: q.z, yaw: enemyDir > 0 ? Math.PI : 0 })
    if (validate(s, a) === null) return a
  }
  return null
}
