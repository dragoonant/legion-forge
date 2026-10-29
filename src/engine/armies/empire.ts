// Empire (and shared keyword) code hooks: the `{ "code" }` escape hatches of 14-armies section 4 that no declarative form can
// express. Each is a CodeEffectDef (armies/registry.ts) run by the keyword interpreter at its windows, registered through
// `registerCodeHook` so `validate:data` and the firing tests see it. Faction code lives only in this folder.
import { sufferWounds } from '../attack'
import { markerFootprint, markersOf } from '../battle'
import { addEffect } from '../effects'
import { markFired, registerCodeHook } from '../code-hooks'
import { footprintGap2D, footprintsOverlap } from '../footprint'
import {
  gainToken,
  hasKeyword,
  isDroid,
  isTrooperType,
  keywordParam,
  poolAllHave,
  poolHasKeyword,
  unitDistance,
  unitRank,
  weaponKeywordList,
  weaponDef,
  rankKey,
  unitDef,
  isVehicle,
} from '../keywords'
import { distance, miniBody, withinBand } from '../measure'
import { applySuppression, isPanicked, isSuppressed } from '../morale'
import { minisSeenBy } from '../query'
import { aliveMinis, constants, getUnit, leaderOf, unitsOnTable } from '../state'
import { piecesOverlapping, pointOnTable } from '../table'
import type { Ctx } from '../registry'
import type { CodeOffer, GameState, Unit } from '../types'
import { registerCodeEffect, type CodeEnv } from './registry'

const ok = (): null => null

// ---------------------------------------------------------------------------
// Sniper Team (K-40): upgrade the pool's dice when unmoved and every model sees the defender; the surge-step cancel is
// offered by the attack machine (attack.spend 'sniper').
// ---------------------------------------------------------------------------

registerCodeHook({
  name: 'sniperTeam',
  kind: 'keyword',
  params: ok,
  install() {
    registerCodeEffect({
      name: 'sniperTeam',
      windows: ['attack.poolFormed'],
      run(ctx: Ctx, env: CodeEnv) {
        const pf = env.pool
        if (!pf || !env.attack || env.role !== 'attacker' || !env.owner || pf.sniperEligible) return
        const st = ctx.state
        // only an attack the unit makes during its own Activation (CRB p60), never a Standby shot
        if (st.activation.current?.unitId !== env.owner.id) return
        if (!pf.weapons.every((w) => weaponKeywordList(st, pf, w.weaponId).some((k) => k.id === 'kw.sniper-team'))) return
        if (env.attack.moved) return
        const def = getUnit(st, pf.defenderId)
        if (!aliveMinis(env.owner).every((m) => minisSeenBy(st, m, def).length > 0)) return
        // the rule needs at least one die to be upgraded: a pool that is already all red has nothing to upgrade and gets no cancel
        if (!pf.weapons.some((w) => ((weaponDef(st, w.weaponId).dice as { black?: number; white?: number }).black ?? 0) + ((weaponDef(st, w.weaponId).dice as { black?: number; white?: number }).white ?? 0) > 0)) return
        pf.shifts.push({ effectId: 'kw.sniper-team', party: 'attacker', dir: 1, count: 0 })
        pf.sniperEligible = true
        markFired('sniperTeam')
        ctx.emit({ type: 'KeywordFired', unitId: env.owner.id, keyword: 'kw.sniper-team', detail: { upgraded: pf.weapons.length } }, env.owner.seat)
      },
    })
  },
})

// ---------------------------------------------------------------------------
// Deflect (K-06): defending against a ranged attack the defence chart gains surge -> block, and before surges convert the
// attacker suffers 1 wound if the defence roll has at least one surge.
// ---------------------------------------------------------------------------

registerCodeHook({
  name: 'deflect',
  kind: 'keyword',
  params: ok,
  install() {
    registerCodeEffect({
      name: 'deflect',
      windows: ['defence.rolled'],
      run(ctx: Ctx, env: CodeEnv) {
        const pf = env.pool
        if (!pf || !env.attack || env.role !== 'defender' || !env.owner || pf.kind !== 'ranged') return
        const st = ctx.state
        const attacker = getUnit(st, ctx.state.attack!.attackerId)
        if (poolAllHave(st, pf, 'kw.high-velocity') || poolHasKeyword(st, pf, 'kw.immune-deflect')) return
        pf.defChart = 'block'
        markFired('deflect')
        const surges = pf.def.filter((f) => f === 'surge').length
        ctx.emit({ type: 'KeywordFired', unitId: env.owner.id, keyword: 'kw.deflect', detail: { surges } }, env.owner.seat)
        if (surges > 0 && attacker.location !== 'defeated') sufferWounds(ctx, attacker.id, 1, 'kw.deflect')
      },
    })
  },
})

// ---------------------------------------------------------------------------
// Compel (K-05): an allied non-Droid Corps Trooper unit within range 2 that rallied and is Suppressed but not Panicked
// may gain 1 suppression to make a free Move at the start of its Make Actions.
// ---------------------------------------------------------------------------

registerCodeHook({
  name: 'compel',
  kind: 'keyword',
  params: (p) => (p && typeof p['range'] !== 'number' ? 'compel needs a numeric range' : null),
  install() {
    registerCodeEffect({
      name: 'compel',
      windows: ['activation.rallied'],
      run(ctx: Ctx, env: CodeEnv) {
        const st = ctx.state
        const owner = env.owner
        const subject = env.subjectId ? st.units[env.subjectId] : null
        if (!owner || !subject || subject.id === owner.id || subject.seat !== owner.seat || subject.location !== 'table') return
        const rank = keywordParam(st, owner, 'kw.compel')
        if (rank && unitRank(subject) !== rankKey(rank)) return
        if (!isTrooperType(st, subject) || (env.params?.['excludeDroid'] && isDroid(st, subject))) return
        const range = Number(env.params?.['range'] ?? 2)
        if (!withinBand(unitDistance(st, subject, owner), range, constants(st))) return
        if (!isSuppressed(st, subject) || isPanicked(st, subject)) return
        env.offers.push({
          seat: subject.seat,
          unitId: subject.id,
          keyword: 'kw.compel',
          labelKey: 'keyword.compel',
          options: [
            { id: 'accept', labelKey: 'keyword.compel.accept', data: { suppression: 1 } },
            { id: 'decline', labelKey: 'keyword.skip' },
          ],
          payload: { subjectId: subject.id, ownerId: owner.id },
          code: 'compel',
        })
      },
      resolve(ctx: Ctx, offer: CodeOffer, option: string) {
        if (option !== 'accept') return
        const subjectId = String(offer.payload['subjectId'])
        // the free Move is paid for with the Suppression token: no token gained, no Move
        if (applySuppression(ctx, subjectId, 1, 'compel') <= 0) return
        const u = getUnit(ctx.state, subjectId)
        addEffect(ctx, { source: 'kw.compel', seat: u.seat, kind: 'freeAction', unitId: u.id, expires: 'activation', data: { action: 'core.action.move', startOfActions: true, source: 'kw.compel' } })
        markFired('compel')
        ctx.emit({ type: 'KeywordFired', unitId: String(offer.payload['ownerId']), keyword: 'kw.compel', detail: { subjectId } }, u.seat)
      },
    })
  },
})

// ---------------------------------------------------------------------------
// Command cards: Implacable, Vader's Might, Darkness Descends, Pinned Down
// ---------------------------------------------------------------------------

function returnOrderToPool(ctx: Ctx, unit: Unit): void {
  unit.order.state = 'pool'
  unit.activated = false
  unit.flags['returnedToPool'] = true
  ctx.state.players[unit.seat].pool.tokens.push(unit.rank)
}

registerCodeHook({
  name: 'implacable',
  kind: 'card',
  params: ok,
  install() {
    registerCodeEffect({
      name: 'implacable',
      windows: ['activation.start', 'activation.end'],
      run(ctx: Ctx, env: CodeEnv) {
        const owner = env.owner
        if (!owner || env.subjectId !== owner.id) return
        const st = ctx.state
        const rec = (owner.flags['implacable'] as { round: number; n: number } | undefined) ?? { round: st.round, n: 0 }
        const cur = rec.round === st.round ? rec : { round: st.round, n: 0 }
        if (env.window === 'activation.start') {
          cur.n++
          owner.flags['implacable'] = cur
          gainToken(ctx, owner.id, 'dodge', 1, 'implacable')
          if (cur.n >= 2) addEffect(ctx, { source: env.source, seat: owner.seat, kind: 'fewerActions', unitId: owner.id, expires: 'activation', data: { n: 1 } })
          markFired('implacable')
          ctx.emit({ type: 'CardEffect', cardId: env.source, detail: { unitId: owner.id, activation: cur.n } }, owner.seat)
        } else if (cur.n === 1 && owner.order.state !== 'pool' && owner.location === 'table') {
          env.offers.push({
            seat: owner.seat,
            unitId: owner.id,
            keyword: env.source,
            labelKey: 'card.implacable',
            options: [
              { id: 'accept', labelKey: 'card.implacable.accept', data: { wounds: 1 } },
              { id: 'decline', labelKey: 'keyword.skip' },
            ],
            payload: { unitId: owner.id },
            code: 'implacable',
          })
        }
      },
      resolve(ctx: Ctx, offer: CodeOffer, option: string) {
        if (option !== 'accept') return
        const u = getUnit(ctx.state, String(offer.payload['unitId']))
        sufferWounds(ctx, u.id, 1, 'implacable')
        if (u.location === 'table') returnOrderToPool(ctx, u)
        markFired('implacable')
        ctx.emit({ type: 'CardEffect', cardId: offer.keyword, detail: { unitId: u.id, returnedToPool: true } }, u.seat)
      },
    })
  },
})

function sameFootprintFree(state: GameState, moving: Unit, deltas: { x: number; z: number }): boolean {
  const ids = new Set(moving.minis.map((m) => m.id))
  const everyone = unitsOnTable(state).flatMap((u) => aliveMinis(u).filter((m) => !ids.has(m.id)))
  for (const m of aliveMinis(moving)) {
    const b = miniBody(state, m)
    const p = { x: m.pos.x + deltas.x, z: m.pos.z + deltas.z }
    if (!pointOnTable(state.table.def, p)) return false
    if (p.x - b.baseRadius < state.table.def.bounds.minX || p.x + b.baseRadius > state.table.def.bounds.maxX) return false
    if (p.z - b.baseRadius < state.table.def.bounds.minZ || p.z + b.baseRadius > state.table.def.bounds.maxZ) return false
    const fp = { pos: p, baseRadius: b.baseRadius }
    if (piecesOverlapping(state.table.def, fp).some((pc) => pc.movement === 'impassable')) return false
    for (const poi of markersOf(state, 'poi')) if (footprintsOverlap(fp, markerFootprint(state, poi))) return false
    for (const o of everyone) {
      const ob = miniBody(state, o)
      if (footprintsOverlap(fp, ob) && footprintGap2D(fp, ob) <= 0) return false
    }
  }
  return true
}

registerCodeHook({
  name: 'vadersMight',
  kind: 'card',
  params: ok,
  install() {
    registerCodeEffect({
      name: 'vadersMight',
      windows: [],
      run() {
        /* a card action: see `action` */
      },
      resolve(ctx: Ctx, offer: CodeOffer, option: string, more: (o: CodeOffer) => void) {
        const st = ctx.state
        if (option === 'cancel' || option === 'stay') return
        if (offer.payload['stage'] === 'target') {
          const targetId = option.replace(/^unit:/, '')
          const target = getUnit(st, targetId)
          const options: CodeOffer['options'] = []
          const half = constants(st).halfRange
          for (const d of [half / 2, half]) {
            for (let k = 0; k < 8; k++) {
              const a = (Math.PI * 2 * k) / 8
              const delta = { x: Math.round(Math.sin(a) * d * 1000) / 1000, z: Math.round(Math.cos(a) * d * 1000) / 1000 }
              if (sameFootprintFree(st, target, delta)) options.push({ id: `to:${delta.x},${delta.z}`, labelKey: 'card.vadersMight.to', data: { dx: delta.x, dz: delta.z } })
            }
          }
          options.push({ id: 'stay', labelKey: 'card.vadersMight.stay' })
          more({ ...offer, options, payload: { ...offer.payload, stage: 'dest', targetId } })
          return
        }
        const targetId = String(offer.payload['targetId'])
        const [dx, dz] = option.replace(/^to:/, '').split(',').map(Number) as [number, number]
        const target = getUnit(st, targetId)
        const from = { ...leaderOf(target).pos }
        for (const m of target.minis) m.pos = { x: Math.round((m.pos.x + dx) * 1000) / 1000, y: m.pos.y, z: Math.round((m.pos.z + dz) * 1000) / 1000 }
        ctx.emit({
          type: 'UnitMoved',
          unitId: target.id,
          speed: 0,
          toolPath: [],
          leaderFrom: from,
          leaderTo: { ...leaderOf(target).pos },
          minis: aliveMinis(target).map((m) => ({ miniId: m.id, pos: m.pos, yaw: m.yaw })),
        })
        markFired('vadersMight')
        const vaderSeat = getUnit(st, offer.unitId).seat
        if (target.seat !== vaderSeat) {
          const n = aliveMinis(target).length
          const idx = ctx.roll('vadersMight', n, 'def:white')
          const faces = idx.map((i) => st.data.dice.defence.white[i]!)
          const w = faces.filter((f) => f === 'block' || f === 'surge').length
          ctx.emit({ type: 'CardEffect', cardId: 'emp.cc.vaders-might', detail: { targetId, dice: faces, wounds: w } }, vaderSeat)
          if (w > 0) sufferWounds(ctx, target.id, w, 'vadersMight')
        }
      },
      action: {
        id: 'emp.act.vaders-might',
        card: 'emp.cc.vaders-might',
        free: true,
        available(ctx, unitId) {
          const st = ctx.state
          const u = getUnit(st, unitId)
          const inPlay = st.effects.some((e) => e.kind === 'cardEffect' && e.data?.cardId === 'emp.cc.vaders-might' && e.seat === u.seat)
          const used = st.effects.some((e) => e.kind === 'limit' && e.data?.key === `vadersMight:${unitId}`)
          return inPlay && !used && !isPanicked(st, u)
        },
        run(ctx, unitId, more) {
          const st = ctx.state
          const u = getUnit(st, unitId)
          addEffect(ctx, { source: 'emp.cc.vaders-might', seat: u.seat, kind: 'limit', unitId, expires: 'activation', data: { key: `vadersMight:${unitId}` } })
          const cands = unitsOnTable(st).filter((o) => o.id !== u.id && !/heavy/.test(String(unitDef(st, o).rank ?? o.rank)) && !isVehicle(st, o) && withinBand(unitDistance(st, o, u), 1, constants(st)))
          more({
            seat: u.seat,
            unitId,
            keyword: 'emp.cc.vaders-might',
            labelKey: 'card.vadersMight',
            options: [...cands.map((o) => ({ id: `unit:${o.id}`, labelKey: 'card.vadersMight.target', data: { unitId: o.id } })), { id: 'cancel', labelKey: 'keyword.skip' }],
            payload: { stage: 'target' },
            code: 'vadersMight',
          })
        },
      },
    })
  },
})

registerCodeHook({
  name: 'darknessDescends',
  kind: 'card',
  params: (p) => (p && p['part'] !== 'permanent' && p['part'] !== 'divulge' ? 'darknessDescends part must be permanent or divulge' : null),
  install() {
    registerCodeEffect({
      name: 'darknessDescends',
      windows: ['card.revealed', 'setup.resolve'],
      run(ctx: Ctx, env: CodeEnv) {
        const part = env.params?.['part']
        const st = ctx.state
        const divulged = (st.battle.data['divulged'] as Record<string, boolean> | undefined) ?? {}
        const vader = env.owner
        if (!vader) return
        if (part === 'permanent' && env.window === 'card.revealed') {
          if (divulged[env.source]) return
          addEffect(ctx, { source: env.source, seat: vader.seat, kind: 'keyword', unitId: vader.id, expires: 'game', data: { keyword: { id: 'kw.reliable', x: 2 } } })
        } else if (part === 'divulge' && env.window === 'setup.resolve') {
          st.battle.data['divulged'] = { ...divulged, [env.source]: true }
          addEffect(ctx, { source: env.source, seat: vader.seat, kind: 'keyword', unitId: vader.id, expires: 'game', data: { keyword: { id: 'kw.infiltrate' } } })
        } else return
        markFired('darknessDescends')
        ctx.emit({ type: 'CardEffect', cardId: env.source, detail: { unitId: vader.id, part } }, vader.seat)
      },
    })
  },
})

registerCodeHook({
  name: 'orderTokenToPool',
  kind: 'card',
  params: ok,
  install() {
    registerCodeEffect({
      name: 'orderTokenToPool',
      windows: ['attack.resolved'],
      run(ctx: Ctx, env: CodeEnv) {
        const st = ctx.state
        if (!st.attack || !env.attack) return
        const attacker = getUnit(st, st.attack.attackerId)
        if (attacker.seat !== env.seat) return
        const r = unitRank(attacker)
        if (r !== 'support' && r !== 'heavy') return
        for (const pf of env.attack.pools) {
          const d = st.units[pf.defenderId]
          if (d && d.order.state === 'faceUp' && d.location !== 'defeated') {
            d.order.state = 'pool'
            st.players[d.seat].pool.tokens.push(d.rank)
            markFired('orderTokenToPool')
            ctx.emit({ type: 'CardEffect', cardId: env.source, detail: { unitId: d.id, returned: true } }, env.seat)
          }
        }
      },
    })
  },
})

export { hasKeyword, distance }
