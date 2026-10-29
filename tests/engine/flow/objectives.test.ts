import { describe, expect, it } from 'vitest'
import {
  bd,
  checkObjectivePlacement,
  closestLegalSpot,
  contests,
  dropAssets,
  markersOf,
  onActivationEnd,
  onEndPhaseStart,
  onStepEvents,
  scoreEndPhase,
  securedBy,
} from '../../../src/engine/battle'
import { actionMenu } from '../../../src/engine/activation'
import { hookFireCount, resetFireCounts } from '../../../src/engine/code-hooks'
import { compilePiece } from '../../../src/engine/table'
import { leaderOf } from '../../../src/engine/state'
import type { GameState, Unit } from '../../../src/engine'
import { CLOSE, advance, ctxFor, edit, events, newGame, pick, place, unitBy } from './helpers'

const INTERCEPT = ['rec.obj.intercept-signals', 'rec.sec.bring-them-to-heel', 'rec.adv.fortified-position', 'rec.adv.cunning-deployment']
const BUNKER = ['rec.obj.bunker-assault', 'rec.sec.bring-them-to-heel', 'rec.adv.fortified-position', 'rec.adv.cunning-deployment']
const SCAN = ['rec.obj.close-the-pocket', 'rec.sec.surface-scan', 'rec.adv.fortified-position', 'rec.adv.cunning-deployment']
const MISSION = ['rec.obj.close-the-pocket', 'rec.sec.recon-mission', 'rec.adv.fortified-position', 'rec.adv.cunning-deployment']

/** Round 2, everything quiet; the test places units as it needs. Blue (A) sits on the +z edge. */
function scene(cards: string[], patch: (s: GameState) => void = () => undefined): GameState {
  const g = newGame({ generic: true, cards, options: { autoDeploy: true } })
  return edit(g.state, (s) => {
    s.round = 2
    s.phase = 'end'
    s.command.priority = 'A'
    patch(s)
  })
}

const A = (s: GameState, i = 0) => unitBy(s, 'A', 'emp.u.stormtroopers', i)
const B = (s: GameState, i = 0) => unitBy(s, 'B', 'reb.u.rebel-troopers', i)
const centre = (s: GameState) => markersOf(s, 'poi').find((m) => m.tags.includes('centre'))!

describe('contesting and securing', () => {
  it('OBJ-001 a unit contests a token when its leader is within 3 inches; at 3.1 it does not', () => {
    const s = scene(CLOSE)
    const m = centre(s)
    const edge = (gap: number) =>
      edit(s, (x) => {
        // base radius 0.531 and a 1" token radius: centre distance = gap + 1.531
        place(A(x), 0, gap + 1.531)
      })
    expect(contests(edge(3.0), A(edge(3.0)), centre(edge(3.0)))).toBe(true)
    expect(contests(edge(3.1), A(edge(3.1)), centre(edge(3.1)))).toBe(false)
    // a Panicked unit and an undeployed unit never contest
    const panic = edit(edge(1), (x) => void (A(x).suppression = 2))
    expect(contests(panic, A(panic), centre(panic))).toBe(false)
    const reserve = edit(edge(1), (x) => void (A(x).location = 'reserve'))
    expect(contests(reserve, A(reserve), centre(reserve))).toBe(false)
    void m
  })

  it('OBJ-002 two contesting units against one secure the token; one against one secures nothing', () => {
    const two = scene(CLOSE, (x) => {
      place(A(x, 0), 0, 3)
      place(A(x, 1), 2.5, 2.5)
      place(B(x), 0, -3)
    })
    expect(securedBy(two, centre(two))).toBe('A')
    const tie = edit(two, (x) => place(A(x, 1), 14, 14))
    expect(securedBy(tie, centre(tie))).toBeNull()
    const none = edit(two, (x) => {
      place(A(x, 0), 14, 14)
      place(A(x, 1), 14, 15)
      place(B(x), 15, 14)
    })
    expect(securedBy(none, centre(none))).toBeNull()
  })

  it('OBJ-003 a Claim free action moves an unclaimed Asset onto the claiming unit; only contesting, eligible units are offered it', () => {
    const base = scene(SCAN, (x) => {
      // drop the setup scanners; one unclaimed Scanner of seat A lies near (3, 5)
      for (const id of Object.keys(x.table.objectives)) if (x.table.objectives[id]!.kind === 'asset') delete x.table.objectives[id]
      x.table.objectives['asset:Scanner:test'] = { id: 'asset:Scanner:test', pos: { x: 3, z: 5 }, tags: ['asset:Scanner', 'owner:A'], heldBy: null, kind: 'asset' }
      place(A(x, 0), 3, 7.5)
      place(A(x, 1), 14, 14)
      place(B(x), 3, 3.5)
      x.phase = 'activation'
    })
    const menuOf = (s: GameState, u: Unit) => {
      const t = edit(s, (x) => void (x.activation.current = { unitId: u.id, seat: u.seat, via: 'order', actionsLeft: 2, performed: [], declared: null }))
      return actionMenu(t, t.units[u.id]!)
    }
    expect(menuOf(base, A(base, 0)).items.map((i) => i.action)).toContain('claim')
    expect(menuOf(base, A(base, 1)).items.map((i) => i.action)).not.toContain('claim')
    // the enemy cannot claim a Scanner that is not its own
    expect(menuOf(base, B(base)).items.map((i) => i.action)).not.toContain('claim')
  })

  it('OBJ-004 a unit drops its Assets before its leader is removed; the opponent places them within 3 inches of that leader', () => {
    const s = scene(SCAN, (x) => {
      for (const id of Object.keys(x.table.objectives)) if (x.table.objectives[id]!.kind === 'asset') delete x.table.objectives[id]
      const u = A(x)
      place(u, 5, 5)
      x.table.objectives['asset:Scanner:held'] = { id: 'asset:Scanner:held', pos: { x: 5, z: 5 }, tags: ['asset:Scanner', 'owner:A'], heldBy: u.id, kind: 'asset' }
    })
    const ctx = ctxFor(s)
    const u = A(ctx.state)
    const dropped = dropAssets(ctx, u)
    expect(dropped).toEqual(['asset:Scanner:held'])
    const m = ctx.state.table.objectives['asset:Scanner:held']!
    expect(m.heldBy).toBeNull()
    const lead = leaderOf(u)
    expect(Math.hypot(m.pos.x - lead.pos.x, m.pos.z - lead.pos.z) - 0.531 - 0.5).toBeLessThanOrEqual(3 + 1e-6)
    expect(checkObjectivePlacement(ctx.state, m.pos, 'asset', m.id).ok).toBe(true)
  })

  it('OBJ-005 placement on impassable terrain, partly over non-area terrain or on a height-2 obstacle is rejected; after setup the closest legal spot is used', () => {
    const s = scene(CLOSE, (x) => {
      const tall = compilePiece({ id: 'tall', kind: 'obstacle', footprint: [{ x: -16, z: -8 }, { x: -12, z: -8 }, { x: -12, z: -4 }, { x: -16, z: -4 }], heightIn: 8, cover: 'heavy', blocksLos: true, movement: 'open', climbable: true })
      x.table.def = { ...x.table.def, pieces: [...x.table.def.pieces, tall] }
    })
    expect(checkObjectivePlacement(s, { x: -8, z: 12 }, 'asset')).toMatchObject({ ok: false, reason: expect.stringContaining('impassable') })
    // t3 is a 0.5"-deep wall: a 1" token would hang over its edge
    expect(checkObjectivePlacement(s, { x: 0, z: -6.75 }, 'asset')).toMatchObject({ ok: false, reason: expect.stringContaining('partly over') })
    // a token fully on a 2-band (8") obstacle is refused
    expect(checkObjectivePlacement(s, { x: -14, z: -6 }, 'asset')).toMatchObject({ ok: false, reason: expect.stringContaining('height 2') })
    expect(checkObjectivePlacement(s, { x: -14.5, z: 0 }, 'asset').ok).toBe(true)
    // the closest legal spot to a point inside the building is outside it
    const spot = closestLegalSpot(s, { x: -8, z: 12 }, 'asset', 6)!
    expect(checkObjectivePlacement(s, spot, 'asset').ok).toBe(true)
  })
})

describe('Recon battle cards', () => {
  it('BTL-001 Close the Pocket: 2 VP for the centre Stockpile and 1 VP for each other one, from round 2 only', () => {
    const s = scene(CLOSE, (x) => {
      place(A(x, 0), 0, 3)
      place(A(x, 1), 4, 3)
      place(B(x, 0), 12, -3)
      place(B(x, 1), 15, -3)
    })
    const early = ctxFor(edit(s, (x) => void (x.round = 1)))
    scoreEndPhase(early)
    expect(early.state.players.A.points + early.state.players.B.points).toBe(0)
    const ctx = ctxFor(s)
    scoreEndPhase(ctx)
    // Bring Them to Heel adds nothing here (no suppression)
    expect(ctx.state.players.A.points).toBe(2)
    expect(ctx.state.players.B.points).toBe(1)
  })

  it('BTL-002 Bunker Assault: wounds on enemy Bunkers (2 with a Commander, Operative or Special Forces unit), destroyed at 3, 3 VP when destroyed', () => {
    resetFireCounts()
    const s = scene(BUNKER, (x) => {
      // A (blue, +z) has enemy Bunkers at z = -6; two Scout Troopers (Special Forces) and a unit secure (12, -6)
      place(unitBy(x, 'A', 'emp.u.scout-troopers', 0), 12, -3.5)
      place(unitBy(x, 'A', 'emp.u.scout-troopers', 1), 10, -3.5)
    })
    const bunker = markersOf(s, 'poi').find((m) => m.pos.x === 12 && m.pos.z === -6)!
    expect(bunker.tags).toContain('enemyOf:blue')
    const ctx = ctxFor(s)
    onEndPhaseStart(ctx)
    expect(bd(ctx.state).wounds[bunker.id]).toBe(2)
    expect(ctx.state.table.objectives[bunker.id]).toBeDefined()
    ctx.emit({ type: 'RoundEnded', round: 2 })
    onEndPhaseStart(ctx)
    expect(ctx.state.table.objectives[bunker.id]).toBeUndefined()
    expect(Object.keys(bd(ctx.state).destroyedThisPhase)).toEqual([bunker.id])
    scoreEndPhase(ctx)
    expect(ctx.state.players.A.points).toBe(3)
    expect(hookFireCount('bunkerAssault')).toBeGreaterThan(0)
  })

  it('BTL-003 Intercept Signals: 1 VP per Comms Tower outside your Territory that you secure or contest with an Intel unit; Intel picks follow the setup rule', () => {
    const g = newGame({ generic: true, cards: INTERCEPT, options: { autoDeploy: true } })
    const picks = bd(g.state).picks
    expect(picks.picked).toHaveLength(6)
    const intel = Object.values(g.state.units).filter((u) => (u.tokens.intel ?? 0) > 0)
    expect(intel).toHaveLength(4)
    expect(intel.filter((u) => u.seat === 'A')).toHaveLength(2)
    // each seat's Intel units came from the other seat's own picks
    for (const u of intel) expect(picks.picked).toContain(u.id)
    const s = scene(INTERCEPT, (x) => {
      for (const u of Object.values(x.units)) u.tokens = {}
      // tower at (0, -12) is in red's Territory: A has an Intel unit contesting it alone, B nothing: A is not outnumbered
      place(A(x, 0), 0, -9.5)
      A(x, 0).tokens.intel = 1
      // tower at (0, 12) is in A's own Territory: A secures it, but it scores nothing
      place(A(x, 1), 0, 9.5)
      place(unitBy(x, 'A', 'emp.u.scout-troopers', 0), 1, 9.5)
    })
    const ctx = ctxFor(s)
    scoreEndPhase(ctx)
    expect(ctx.state.players.A.points).toBe(1)
    expect(ctx.state.players.B.points).toBe(0)
  })

  it('BTL-004 Surface Scan: 1 VP when you control 2 Scanner holders outside your Territory; none if one stands in it', () => {
    const s = scene(SCAN, (x) => {
      for (const id of Object.keys(x.table.objectives)) if (x.table.objectives[id]!.kind === 'asset') delete x.table.objectives[id]
      for (const [i, u] of [A(x, 0), A(x, 1)].entries()) {
        place(u, -6 + i * 4, -8)
        x.table.objectives[`asset:Scanner:${u.id}`] = { id: `asset:Scanner:${u.id}`, pos: { x: 0, z: 0 }, tags: ['asset:Scanner', 'owner:A'], heldBy: u.id, kind: 'asset' }
      }
    })
    const ctx = ctxFor(s)
    scoreEndPhase(ctx)
    expect(ctx.state.players.A.points).toBe(1)
    const inside = edit(s, (x) => place(A(x, 1), 13, 14))
    const c2 = ctxFor(inside)
    scoreEndPhase(c2)
    expect(c2.state.players.A.points).toBe(0)
  })

  it('BTL-005 Bring Them to Heel: 1 VP when more enemy units are Suppressed than your own; a Panicked enemy fills a table row once per round', () => {
    resetFireCounts()
    const s = scene(CLOSE, (x) => {
      place(B(x), 12, -10)
      place(B(x, 1), 14, -10)
      B(x).suppression = 1
      B(x, 1).suppression = 4
    })
    const ctx = ctxFor(s)
    scoreEndPhase(ctx)
    expect(ctx.state.players.A.points).toBe(1)
    // a unit gaining suppression while an enemy unit is Panicked marks the row for 2 VP
    const c2 = ctxFor(s)
    c2.emit({ type: 'SuppressionChanged', unitId: B(s).id, from: 0, to: 1, reason: 'attack' })
    onStepEvents(c2)
    expect(c2.state.players.A.points).toBe(2)
    expect(hookFireCount('scoringTable')).toBe(1)
    // the same row is marked once; and only once per round
    c2.emit({ type: 'SuppressionChanged', unitId: B(s).id, from: 1, to: 2, reason: 'attack' })
    onStepEvents(c2)
    expect(c2.state.players.A.points).toBe(2)
  })

  it('BTL-006 Recon Mission: a Scanner holder that ends its activation within range 2 and LoS of 2 enemy units scores 1 VP (once a round) and gives them Observation', () => {
    const s = scene(MISSION, (x) => {
      for (const id of Object.keys(x.table.objectives)) if (x.table.objectives[id]!.kind === 'asset') delete x.table.objectives[id]
      const u = A(x)
      place(u, 0, -12)
      x.table.objectives['asset:Scanner:m'] = { id: 'asset:Scanner:m', pos: { x: 0, z: -12 }, tags: ['asset:Scanner', 'owner:A'], heldBy: u.id, kind: 'asset' }
      place(B(x, 0), 5, -12)
      place(B(x, 1), -5, -12)
    })
    const ctx = ctxFor(s)
    onActivationEnd(ctx, A(ctx.state))
    expect(ctx.state.players.A.points).toBe(1)
    expect(B(ctx.state, 0).tokens.observation).toBe(1)
    expect(B(ctx.state, 1).tokens.observation).toBe(1)
    onActivationEnd(ctx, A(ctx.state))
    expect(ctx.state.players.A.points).toBe(1)
  })

  it('BTL-007 Advantage cards at the start of the first Activation phase: Advanced Intel adds a pass token, Cunning Deployment gives 3 units a Dodge', () => {
    const g = newGame({ generic: true, cards: ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.advanced-intel', 'rec.adv.cunning-deployment'], options: { autoDeploy: true } })
    const r = advance(pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.push' }), (p) => p.kind === 'activation.choose')
    // A is blue and holds Advanced Intel, B holds Cunning Deployment
    expect(r.state.players.A.passTokens).toBe(1)
    expect(r.state.players.B.passTokens ?? 0).toBe(0)
    // 3 Dodge tokens from Cunning Deployment plus the one Prepared Position gives B's Strike Team
    expect(Object.values(r.state.units).filter((u) => u.seat === 'B').reduce((n, u) => n + (u.tokens.dodge ?? 0), 0)).toBe(4)
    expect(r.pending!.canPass).toBe(true)
    void events
  })

  it('BTL-008 Surface Scan and Recon Mission start with Scanners on the units each player picked', () => {
    const scan = newGame({ generic: true, cards: SCAN, options: { autoDeploy: true } })
    const held = markersOf(scan.state, 'asset')
    expect(held).toHaveLength(4)
    expect(held.filter((m) => m.tags.includes('owner:A'))).toHaveLength(2)
    const mission = newGame({ generic: true, cards: MISSION, options: { autoDeploy: true } })
    expect(markersOf(mission.state, 'asset')).toHaveLength(2)
  })
})
