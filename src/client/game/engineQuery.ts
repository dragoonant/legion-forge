// The client's window onto the engine's numbers (docs/spec/00 section 7.7). The client never derives a rules number: distances,
// bands, rays, cover and odds come from the engine's `query` module (`@/engine/query`; the engine index does not re-export it yet).
import * as query from '@/engine/query'
import type { GameState, Unit } from '@/engine'
import { unitsOnTable } from '@/engine/state'
import { rangeBand, type RangeBand } from '@/engine/measure'
import type { RayResult } from '@/engine/los'

export type { RangeBand }

export interface TargetRow {
  unitId: string
  ok: boolean
  reason?: string
  distance: number
  band: RangeBand
  kinds: string[]
  visible: string[]
  cover: string | null
}

export interface OddsRow {
  expectedWounds: number
  pDefeat: number
  pAnyHit: number
  suppressionAdded: number
  dice: Record<string, number>
  cover: string
}

export const hasEngineQuery = (): boolean => true

/** Base-edge distance from one unit's leader to the nearest model of another, and its range band (the engine's own measure). */
export function rangeBetween(state: GameState, aId: string, bId: string): { distance: number; band: RangeBand } | null {
  const a = state.units[aId]
  const b = state.units[bId]
  if (!a || !b || a.location !== 'table' || b.location !== 'table') return null
  try {
    const d = query.distanceLeaderToUnit(state, a, b)
    if (!Number.isFinite(d)) return null
    return { distance: d, band: rangeBand(d, state.data.constants) }
  } catch {
    return null
  }
}

export interface LosView {
  /** engine ray list from the attacker leader to every model of the defender */
  rays: RayResult[]
  /** model ids with a clear ray */
  visible: string[]
  cover: string
  byTerrainId: string[]
}

export function losBetween(state: GameState, attackerId: string, defenderId: string): LosView | null {
  const atk = state.units[attackerId]
  const def = state.units[defenderId]
  if (!atk || !def || atk.location !== 'table' || def.location !== 'table') return null
  try {
    // the engine's own verdict: the same function the attack step uses, with its rays and the terrain each blocked ray is attributed to
    const r = query.losCover(state, attackerId, defenderId)
    const rays = r.scan.minis.flatMap((m) => m.rays ?? [])
    return { rays, visible: r.visible, cover: r.level, byTerrainId: r.scan.byTerrainId }
  } catch {
    return null
  }
}

export function targetsOf(state: GameState, unitId: string): TargetRow[] {
  try {
    return query.attackTargets(state, unitId) as unknown as TargetRow[]
  } catch {
    return []
  }
}

export function oddsOf(state: GameState, attackerId: string, defenderId: string): OddsRow | null {
  try {
    return query.attackOdds(state, attackerId, defenderId) as unknown as OddsRow
  } catch {
    return null
  }
}

/** Units of a seat that stand on the table (for HUD counts). */
export const onTable = (state: GameState, seat: 'A' | 'B'): Unit[] => unitsOnTable(state).filter((u) => u.seat === seat)
