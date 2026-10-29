// Barricades (CRB p12): scatter terrain a player places in Setup with Fortified Position. A barricade is at most 3" wide,
// 1" tall and 1" deep (RULING Port choice: the maximum size is used), open terrain that gives heavy Cover to Trooper units that
// are not Creature or Heavy Troopers, and no model may end a Move overlapping one. It cannot overlap Objective or Advantage
// tokens. The card says "none within range 1 of another" and "in your own or Contested Territory".
import { distToPolygonBoundary, pointInPolygon, round3 } from './geometry'
import { markersOf, markerFootprint, bd } from './battle'
import { compilePiece, pointOnTable } from './table'
import { polygonsOverlap } from './tool'
import { getFrameResume } from './hooks'
import { EngineInvariantError } from './state'
import { makeAction } from './actions'
import { otherSeat } from './state'
import { reject, type Ctx, type Handled } from './registry'
import type { Action, GameState, PendingDecision, Polygon, Seat } from './types'

export const BARRICADE = { width: 3, depth: 1, height: 1 } as const

/** The footprint rectangle of a barricade centred at (x, z) turned by `yaw` radians. */
export function barricadePolygon(x: number, z: number, yaw: number): Polygon {
  const hw = BARRICADE.width / 2
  const hd = BARRICADE.depth / 2
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, lz]) => ({ x: round3(x + lx! * c + lz! * s), z: round3(z - lx! * s + lz! * c) }))
}

/** Gap between two simple polygons (0 when they overlap). */
function polygonGap(a: Polygon, b: Polygon): number {
  if (polygonsOverlap(a, b)) return 0
  let best = Infinity
  for (const p of a) best = Math.min(best, distToPolygonBoundary(p, b))
  for (const p of b) best = Math.min(best, distToPolygonBoundary(p, a))
  return best
}

export type BarricadeCheck = { ok: true } | { ok: false; reason: string }

/** May `seat` set a barricade down here? Own or Contested Territory (never touching the enemy's), apart from every other barricade. */
export function checkBarricade(state: GameState, seat: Seat, x: number, z: number, yaw: number, minApart: number): BarricadeCheck {
  if (![x, z, yaw].every(Number.isFinite)) return { ok: false, reason: 'malformed placement' }
  const poly = barricadePolygon(x, z, yaw)
  if (!poly.every((p) => pointOnTable(state.table.def, p))) return { ok: false, reason: 'off the table' }
  for (const enemy of bd(state).territories[otherSeat(seat)]) {
    if (polygonsOverlap(poly, enemy) || poly.some((p) => pointInPolygon(p, enemy))) return { ok: false, reason: 'in enemy Territory' }
  }
  for (const piece of state.table.def.pieces) {
    if (polygonsOverlap(poly, piece.footprint)) return { ok: false, reason: `overlaps ${piece.id}` }
    if (piece.kind === 'barricade' && polygonGap(poly, piece.footprint) <= minApart + 1e-9) return { ok: false, reason: 'within range 1 of another barricade' }
  }
  for (const m of [...markersOf(state, 'poi'), ...markersOf(state, 'asset')]) {
    const f = markerFootprint(state, m)
    if (pointInPolygon(f.pos, poly) || distToPolygonBoundary(f.pos, poly) < f.baseRadius - 1e-6) return { ok: false, reason: 'overlaps a token' }
  }
  for (const u of Object.values(state.units)) {
    if (u.location !== 'table') continue
    for (const m of u.minis) {
      if (m.alive && (pointInPolygon(m.pos, poly) || distToPolygonBoundary(m.pos, poly) < 0.55)) return { ok: false, reason: 'overlaps a model' }
    }
  }
  return { ok: true }
}

/** Put the barricade on the table: a new compiled table definition (the old one is shared with earlier states). */
export function placeBarricade(ctx: Ctx, seat: Seat, x: number, z: number, yaw: number): string {
  const s = ctx.state
  const d = bd(s)
  const id = `bar.${seat}.${d.barricades.length + 1}`
  const piece = compilePiece({ id, kind: 'barricade', footprint: barricadePolygon(x, z, yaw), heightIn: BARRICADE.height, cover: 'heavy', blocksLos: true, movement: 'open', climbable: false })
  s.table.def = { ...s.table.def, pieces: [...s.table.def.pieces, piece] }
  d.barricades.push({ id, seat, x: round3(x), z: round3(z), yaw: round3(yaw) })
  ctx.emit({ type: 'ObjectiveChanged', objectiveId: id, detail: { barricade: true, seat, x: round3(x), z: round3(z), yaw: round3(yaw) } }, seat)
  return id
}

/** The engine's pick: the legal spot nearest the table centre, long side across the table. */
export function suggestBarricade(state: GameState, seat: Seat, minApart: number): { x: number; z: number; yaw: number } | null {
  const b = state.table.def.bounds
  const cands: { x: number; z: number; yaw: number; d: number }[] = []
  for (let x = Math.ceil(b.minX + 2); x <= b.maxX - 2; x += 2) {
    for (let z = Math.ceil(b.minZ + 2); z <= b.maxZ - 2; z += 2) {
      for (const yaw of [0, Math.PI / 2]) cands.push({ x, z, yaw, d: Math.hypot(x, z) })
    }
  }
  cands.sort((p, q) => p.d - q.d || p.x - q.x || p.z - q.z || p.yaw - q.yaw)
  for (const c of cands) if (checkBarricade(state, seat, c.x, c.z, c.yaw, minApart).ok) return { x: c.x, z: c.z, yaw: c.yaw }
  return null
}

export interface BarricadeStep {
  seat: Seat
  cardId: string
  left: number
  minApart: number
}

/** The placement steps the Advantage cards ask for, blue first. */
export function barricadeSteps(state: GameState, order: Seat[]): BarricadeStep[] {
  const out: BarricadeStep[] = []
  for (const seat of order) {
    const cardId = bd(state).advantage[seat]
    const card = state.data.battleCards[cardId] as { setup?: { placeTerrain?: { piece: string; max: number; minApart?: number } }[] } | undefined
    for (const e of card?.setup ?? []) {
      if (e.placeTerrain && e.placeTerrain.piece === 'core.terrain.barricade') out.push({ seat, cardId, left: e.placeTerrain.max, minApart: (e.placeTerrain.minApart ?? 6) })
    }
  }
  return out
}

/**
 * Raise the next barricade placement (or place automatically under `autoDeploy` / `autoBattle`). True when a decision was
 * raised; false when every step is done and the setup goes on.
 */
export function nextBarricade(ctx: Ctx): boolean {
  const s = ctx.state
  const d = bd(s)
  const auto = !!(s.origin.setup.options?.autoDeploy || s.origin.setup.options?.autoBattle)
  while (d.barricadeSteps.length > 0) {
    const step = d.barricadeSteps[0]!
    if (step.left <= 0) {
      d.barricadeSteps.shift()
      continue
    }
    if (auto) {
      const spot = suggestBarricade(s, step.seat, step.minApart)
      if (!spot) {
        d.barricadeSteps.shift()
        continue
      }
      placeBarricade(ctx, step.seat, spot.x, spot.z, spot.yaw)
      step.left--
      continue
    }
    ctx.raise({
      kind: 'battle.place',
      seat: step.seat,
      window: 'setup.*',
      context: { terrain: 'barricade', cardId: step.cardId, left: step.left, minApart: step.minApart, width: BARRICADE.width, depth: BARRICADE.depth, height: BARRICADE.height },
      constraints: { kind: 'place' },
      canPass: true,
    })
    return true
  }
  return false
}

function continueSetup(ctx: Ctx): void {
  if (nextBarricade(ctx)) return
  const fn = getFrameResume('setup.barricades')
  if (!fn) throw new EngineInvariantError('no frame resume registered for setup.barricades')
  fn(ctx, 'finished', {})
}

/** `battle.place` for a barricade (a pass ends the card's placements: "up to 3"). */
export function handleBarricadePlace(state: GameState, action: Action, pending: PendingDecision): Handled {
  const step = bd(state).barricadeSteps[0]
  if (!step) return reject('E_WRONG_DECISION', 'no barricade is waiting to be placed')
  if (action.type === 'pass') {
    return {
      run(ctx) {
        bd(ctx.state).barricadeSteps.shift()
        continueSetup(ctx)
      },
    }
  }
  if (action.type !== 'battle.place') return reject('E_WRONG_DECISION', 'expected a barricade placement')
  const { x, z, yaw } = action.payload
  const check = checkBarricade(state, step.seat, x, z, yaw ?? 0, step.minApart)
  if (!check.ok) return reject('E_TERRAIN', check.reason)
  void pending
  return {
    run(ctx) {
      const st = bd(ctx.state).barricadeSteps[0]!
      placeBarricade(ctx, st.seat, x, z, yaw ?? 0)
      st.left--
      continueSetup(ctx)
    },
  }
}

/** The engine's answer to a barricade placement decision. */
export function suggestBarricadeAction(state: GameState, pending: PendingDecision, seat: Seat): Action | null {
  const step = bd(state).barricadeSteps[0]
  if (!step) return null
  const spot = suggestBarricade(state, step.seat, step.minApart)
  return spot ? makeAction('battle.place', pending, spot, seat) : null
}
