// Melee and engagement (R-16): moving into base contact, the three-step placement into contact, engaged units, Withdraw
// restrictions and re-placement after a melee attack removes models. Melee attacks themselves run through the ordinary
// attack pipeline (attack.ts); a move into melee is a `move.*` decision owned by the movement module, which uses the
// helpers here. This module owns the `melee` namespace but has no decisions of its own yet.
import { footprintGap2D, footprintsOverlap } from './footprint'
import { round3 } from './geometry'
import { inBaseContact, miniBody } from './measure'
import { engagedUnitIds } from './query'
import { reject, type Ctx, type ModuleDef } from './registry'
import { aliveMinis, constants, getUnit, leaderOf, unitsOnTable } from './state'
import { isVehicle, miniWeapons, unitDef, weaponDef, weaponTypes } from './keywords'
import { piecesOverlapping } from './table'
import { markerFootprint } from './battle'
import type { GameState, Mini, Unit, Vec2 } from './types'

export const meleeModule: ModuleDef = {
  id: 'melee',
  namespaces: ['melee'],
  handle(_state, action) {
    return reject('E_TODO', `${action.type}: moves into melee are move.* decisions; melee has no decisions of its own`)
  },
}

/** The unit's leader has a melee weapon, so it may move into base contact with an enemy (R-16.1, RULING: leader reading). */
export function canMoveIntoMelee(state: GameState, unit: Unit): boolean {
  const lead = leaderOf(unit)
  return miniWeapons(state, unit, lead.id).some((w) => weaponTypes(weaponDef(state, w)).includes('melee'))
}

/** Engaged: a Trooper unit in melee with an enemy unit (vehicles are never Engaged, R-16.3). */
export function isEngaged(state: GameState, unit: Unit): boolean {
  return !isVehicle(state, unit) && engagedUnitIds(state, unit).length > 0
}

/** Units the unit is in melee with right now. */
export function meleeTargets(state: GameState, unit: Unit): string[] {
  return engagedUnitIds(state, unit)
}

export interface WithdrawRules {
  speed: 1
  /** Attack is withheld after a Withdraw, except for Creature and Heavy Troopers (R-16.5, R-20.2) */
  blocksAttack: boolean
  blocksStandby: true
  mayMoveIntoMelee: false
}

export function withdrawRules(state: GameState, unit: Unit): WithdrawRules {
  const t = String(unitDef(state, unit).unitType ?? 'trooper')
  return { speed: 1, blocksAttack: !/(creature|heavy)/.test(t), blocksStandby: true, mayMoveIntoMelee: false }
}

// ---------------------------------------------------------------------------
// Contact placement
// ---------------------------------------------------------------------------

export interface ContactPlacement {
  miniId: string
  x: number
  z: number
}

const TOUCH = 0.0003

function others(state: GameState): { id: string; unitId: string; seat: string; pos: Vec2; r: number }[] {
  const out: { id: string; unitId: string; seat: string; pos: Vec2; r: number }[] = []
  for (const u of unitsOnTable(state)) {
    for (const m of aliveMinis(u)) {
      const b = miniBody(state, m)
      out.push({ id: m.id, unitId: u.id, seat: u.seat, pos: { x: m.pos.x, z: m.pos.z }, r: b.baseRadius })
    }
  }
  return out
}

/**
 * Place `minis` of `moverUnit` into base contact with models of `targetUnit`, one after another (each placed model blocks
 * the next). A model never overlaps another model, terrain that cannot be stood on, or the table edge, and never touches
 * models of a second enemy unit (R-16.1). Models with no legal spot are reported in `failed`.
 */
export function placeIntoContact(state: GameState, moverUnit: Unit, minis: Mini[], targetUnit: Unit): { placements: ContactPlacement[]; failed: string[] } {
  const c = constants(state)
  const all = others(state)
  const placements: ContactPlacement[] = []
  const failed: string[] = []
  const targetMinis = aliveMinis(targetUnit)
  const tokens = Object.values(state.table.objectives).filter((o) => o.kind === 'poi').map((o) => markerFootprint(state, o))
  const moving = new Set(minis.map((m) => m.id))
  for (const m of minis) {
    const body = miniBody(state, m)
    const here: Vec2 = { x: m.pos.x, z: m.pos.z }
    const sorted = [...targetMinis].sort((a, b) => Math.hypot(a.pos.x - here.x, a.pos.z - here.z) - Math.hypot(b.pos.x - here.x, b.pos.z - here.z))
    let best: { p: Vec2; d: number } | null = null
    for (const t of sorted.slice(0, 4)) {
      const tb = miniBody(state, t)
      const dist = body.baseRadius + tb.baseRadius + TOUCH
      for (let k = 0; k < 36; k++) {
        const ang = (Math.PI * 2 * k) / 36
        const p: Vec2 = { x: round3(t.pos.x + Math.sin(ang) * dist), z: round3(t.pos.z + Math.cos(ang) * dist) }
        const fp = { pos: p, baseRadius: body.baseRadius }
        const bd = state.table.def.bounds
        if (p.x - body.baseRadius < bd.minX || p.x + body.baseRadius > bd.maxX || p.z - body.baseRadius < bd.minZ || p.z + body.baseRadius > bd.maxZ) continue
        // never on impassable terrain, a barricade or an obstacle (a model that cannot stand there is placed elsewhere), never on a token
        if (piecesOverlapping(state.table.def, fp).some((pc) => pc.movement === 'impassable' || pc.kind === 'barricade' || pc.kind === 'obstacle' || pc.kind === 'building')) continue
        if (tokens.some((tk) => Math.hypot(tk.pos.x - p.x, tk.pos.z - p.z) < tk.baseRadius + body.baseRadius - 1e-6)) continue
        let ok = true
        for (const o of all) {
          if (o.id === m.id) continue
          if (moving.has(o.id) && !placements.some((pl) => pl.miniId === o.id)) continue // not yet placed: will move anyway
          const pos = placements.find((pl) => pl.miniId === o.id) ?? o.pos
          const gap = footprintGap2D(fp, { pos: pos as Vec2, baseRadius: o.r })
          if (footprintsOverlap(fp, { pos: pos as Vec2, baseRadius: o.r }) && gap <= 0) {
            ok = false
            break
          }
          // never touch a second enemy unit
          if (o.seat !== moverUnit.seat && o.unitId !== targetUnit.id && gap <= c.contactEpsilon + 1e-9) {
            ok = false
            break
          }
        }
        if (!ok) continue
        const d = Math.hypot(p.x - here.x, p.z - here.z)
        if (!best || d < best.d) best = { p, d }
      }
      if (best) break
    }
    if (best) placements.push({ miniId: m.id, x: best.p.x, z: best.p.z })
    else failed.push(m.id)
  }
  return { placements, failed }
}

function applyPlacements(state: GameState, unit: Unit, placements: ContactPlacement[]): void {
  for (const pl of placements) {
    const m = unit.minis.find((x) => x.id === pl.miniId)!
    m.pos = { x: pl.x, y: m.pos.y, z: pl.z }
  }
  void state
}

export interface MeleePlan {
  /** step 1: the mover's other models into contact with the enemy unit */
  mover: ContactPlacement[]
  /** step 2: the enemy leader, when it is not already in contact */
  enemyLeader: ContactPlacement | null
  /** step 3: the enemy's remaining models */
  enemyRest: ContactPlacement[]
  failed: string[]
}

/** The three placement steps after a mover's leader ended in contact (R-16.1): used by the movement module's `move.troopers`. */
export function planMeleeContact(state: GameState, moverId: string, enemyId: string): MeleePlan {
  const mover = getUnit(state, moverId)
  const enemy = getUnit(state, enemyId)
  const c = constants(state)
  const failed: string[] = []
  const moverOthers = aliveMinis(mover).filter((m) => m.id !== mover.leaderId)
  const r1 = placeIntoContact(state, mover, moverOthers, enemy)
  failed.push(...r1.failed)
  // work on a scratch copy so the enemy steps see the mover's new positions
  const scratch = JSON.parse(JSON.stringify(state)) as GameState
  applyPlacements(scratch, getUnit(scratch, moverId), r1.placements)
  const sEnemy = getUnit(scratch, enemyId)
  const sMover = getUnit(scratch, moverId)
  const eLead = leaderOf(sEnemy)
  const inContact = aliveMinis(sMover).some((m) => inBaseContact(miniBody(scratch, m), miniBody(scratch, eLead), c))
  let enemyLeader: ContactPlacement | null = null
  if (!inContact) {
    const r2 = placeIntoContact(scratch, sEnemy, [eLead], sMover)
    failed.push(...r2.failed)
    enemyLeader = r2.placements[0] ?? null
    if (enemyLeader) applyPlacements(scratch, sEnemy, [enemyLeader])
  }
  const rest = aliveMinis(sEnemy).filter((m) => m.id !== sEnemy.leaderId)
  const r3 = placeIntoContact(scratch, sEnemy, rest, sMover)
  failed.push(...r3.failed)
  return { mover: r1.placements, enemyLeader, enemyRest: r3.placements, failed }
}

/** Does any model of `a` touch any model of `b`? */
export function unitsInContact(state: GameState, a: Unit, b: Unit): boolean {
  const c = constants(state)
  return aliveMinis(a).some((x) => aliveMinis(b).some((y) => inBaseContact(miniBody(state, x), miniBody(state, y), c)))
}

/**
 * After a melee attack removed models (R-16.6): the attacker re-places its leader, then any model out of contact, into
 * contact with the unit it fought; then the defender does the same. A unit that cannot get back into contact stays put and
 * is no longer in melee. Placement is automatic (RULING Port choice: the nearest legal spot).
 */
export function replaceAfterMelee(ctx: Ctx, attackerId: string, defenderId: string): void {
  const st = ctx.state
  const atk = st.units[attackerId]
  const def = st.units[defenderId]
  if (!atk || !def || atk.location !== 'table' || def.location !== 'table') return
  const c = constants(st)
  const touching = (m: Mini, other: Unit) => aliveMinis(other).some((o) => inBaseContact(miniBody(st, m), miniBody(st, o), c))
  const fix = (unit: Unit, other: Unit): void => {
    const lead = unit.minis.find((m) => m.id === unit.leaderId && m.alive) ?? aliveMinis(unit)[0]
    if (!lead) return
    const order = [lead, ...aliveMinis(unit).filter((m) => m.id !== lead.id)]
    const out: { miniId: string; pos: { x: number; y: number; z: number } }[] = []
    for (const m of order) {
      if (touching(m, other)) continue
      const r = placeIntoContact(st, unit, [m], other)
      const pl = r.placements[0]
      if (!pl) continue
      m.pos = { x: pl.x, y: m.pos.y, z: pl.z }
      out.push({ miniId: m.id, pos: m.pos })
    }
    if (out.length > 0) ctx.emit({ type: 'MeleeContact', unitId: unit.id, targetId: other.id, minis: out }, unit.seat)
  }
  fix(atk, def)
  fix(def, atk)
}
