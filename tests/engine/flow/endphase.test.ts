import { describe, expect, it } from 'vitest'
import { load, save, step, type GameState, type StepResult } from '../../../src/engine'
import { beginEndPhase } from '../../../src/engine/endphase'
import { checkWipeout } from '../../../src/engine/battle'
import { canon, hashState } from '../../../src/engine/state'
import { advance, ctxFor, edit, events, must, newGame, optionAction, pick, place, realBundle, unitBy, withData } from './helpers'

const CARDS = ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.cunning-deployment', 'rec.adv.fortified-position']

/** Round 2's Activation phase over, ready for `beginEndPhase`: everyone activated, cards revealed. */
function endScene(patch: (s: GameState) => void = () => undefined, o: { rounds?: number } = {}): GameState {
  const g = newGame({ generic: true, cards: CARDS, options: { autoDeploy: true, ...(o.rounds ? { maxRounds: o.rounds } : {}) } })
  const r = pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.assault' })
  return edit(r.state, (s) => {
    s.round = 2
    s.phase = 'activation'
    s.command.priority = 'A'
    s.command.picks = { A: 'neu.cc.ambush', B: 'neu.cc.assault' }
    s.command.revealed = true
    for (const u of Object.values(s.units)) {
      u.activated = true
      u.order.state = 'spent'
    }
    s.players.A.pool.tokens = []
    s.players.B.pool.tokens = []
    patch(s)
  })
}

const run = (state: GameState) => {
  const ctx = ctxFor(state)
  beginEndPhase(ctx)
  return ctx
}

describe('the End phase', () => {
  it('END-001 End-phase steps happen in order: start effects, Objective score, Secondary score, discard, token removal, promote, round advance', () => {
    const state = endScene((s) => {
      // A holds the centre Stockpile: 2 VP from round 2
      place(unitBy(s, 'A', 'emp.u.stormtroopers', 0), 0, 2.5)
      unitBy(s, 'A', 'emp.u.stormtroopers', 0).tokens.aim = 1
      unitBy(s, 'A', 'emp.u.stormtroopers', 0).suppression = 1
    })
    const ctx = run(state)
    const order = ctx.events.map((e) => e.type)
    const idx = (t: string) => order.indexOf(t as never)
    expect(idx('PhaseStarted')).toBeGreaterThanOrEqual(0)
    const endStart = ctx.events.findIndex((e) => e.type === 'PhaseStarted' && e.name === 'end')
    const scored = idx('PointsScored')
    const discard = idx('CardDiscarded')
    const tokens = idx('TokenChanged')
    const supp = idx('SuppressionChanged')
    const rounds = idx('RoundEnded')
    expect(endStart).toBeGreaterThanOrEqual(0)
    expect(scored).toBeGreaterThan(endStart)
    expect(discard).toBeGreaterThan(scored)
    expect(tokens).toBeGreaterThan(discard)
    expect(supp).toBeGreaterThan(discard)
    expect(rounds).toBeGreaterThan(Math.max(tokens, supp))
    expect(idx('RoundStarted')).toBeGreaterThan(rounds)
    expect(ctx.state.round).toBe(3)
    // A holds the centre Stockpile (2 VP); B scores 1 VP for Bring Them to Heel (one enemy unit is Suppressed, none of its own)
    expect(ctx.state.players.A.points).toBe(2)
    expect(ctx.state.players.B.points).toBe(1)
    expect(ctx.events.filter((e) => e.type === 'PointsScored').map((e) => (e.type === 'PointsScored' ? e.reason : ''))).toEqual(['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel'])
  })

  it('END-002 revealed command cards go to the discard pile and are never offered again; Standing Orders stays in hand', () => {
    const state = endScene((s) => {
      s.command.picks = { A: 'neu.cc.standing-orders', B: 'neu.cc.assault' }
    })
    const ctx = run(state)
    expect(ctx.state.players.B.hand).not.toContain('neu.cc.assault')
    expect(ctx.state.players.B.played).toContain('neu.cc.assault')
    expect(ctx.state.players.A.hand).toContain('neu.cc.standing-orders')
    expect(ctx.state.players.A.played).not.toContain('neu.cc.standing-orders')
    const offered = ctx.state.pending!.options!.map((o) => o.id)
    expect(offered).not.toContain('B:neu.cc.assault')
    expect(offered).toContain('A:neu.cc.standing-orders')
  })

  it('END-003 Aim, Dodge, Observation, Surge and Standby tokens are cleared, exactly 1 suppression is removed, pass pools are emptied; other tokens survive', () => {
    const state = endScene((s) => {
      const u = unitBy(s, 'A', 'emp.u.stormtroopers', 0)
      Object.assign(u.tokens, { aim: 2, dodge: 1, observation: 1, surge: 1, standby: 1, foo: 2, intel: 1 })
      u.suppression = 3
      unitBy(s, 'B', 'reb.u.rebel-troopers', 0).suppression = 0
      s.players.A.passTokens = 2
    })
    const ctx = run(state)
    const u = unitBy(ctx.state, 'A', 'emp.u.stormtroopers', 0)
    expect(u.tokens).toEqual({ foo: 2, intel: 1 })
    expect(u.suppression).toBe(2)
    expect(unitBy(ctx.state, 'B', 'reb.u.rebel-troopers', 0).suppression).toBe(0)
    expect(ctx.state.players.A.passTokens).toBe(0)
  })

  it('TOK-003 token kinds are an open union: an unknown keyword token survives the End phase and a save/load round trip', () => {
    const state = endScene((s) => void (unitBy(s, 'A', 'emp.u.scout-troopers', 0).tokens['kw.mystery'] = 3))
    const ctx = run(state)
    expect(unitBy(ctx.state, 'A', 'emp.u.scout-troopers', 0).tokens['kw.mystery']).toBe(3)
    const copy = JSON.parse(JSON.stringify(ctx.state)) as GameState
    expect(canon(copy.units)).toBe(canon(ctx.state.units))
    expect(hashState(copy)).toBe(hashState(ctx.state))
    // a played game saves and loads to the same hash
    const g = advance(newGame({ generic: true, cards: CARDS, options: { autoDeploy: true } }), (p, s) => s.seq > 40 && p.kind !== 'command.pick')
    const l = load(save(g.state), realBundle())
    expect(l.state.hash).toBe(g.state.hash)
  })

  it('END-004 with the last Commander dead a Trooper unit is promoted, priority player first, and gets a Commander order next round', () => {
    const state = endScene((s) => {
      const v = unitBy(s, 'A', 'emp.u.darth-vader-dlots')
      v.location = 'defeated'
      v.minis.forEach((m) => (m.alive = false))
    })
    const ctx = run(state)
    expect(ctx.state.pending!.kind).toBe('end.choice')
    expect(ctx.state.pending!.seat).toBe('A')
    const pending = ctx.state.pending!
    const choice = pending.options![1]!
    expect(pending.options!.length).toBeGreaterThan(1)
    const r = must(ctx.state, choice.action)
    const promoted = r.state.units[choice.id]!
    expect(promoted.rank).toBe('commander')
    expect(events(r, 'UnitPromoted')[0]).toMatchObject({ unitId: choice.id })
    expect(r.state.round).toBe(3)
    // next round's pool: the promoted unit's token is a Commander token once orders are given
    const done = advance(r, (p) => p.kind === 'activation.choose')
    expect(done.state.players.A.pool.tokens.filter((t) => t === 'commander').length + Object.values(done.state.units).filter((u) => u.seat === 'A' && u.rank === 'commander' && u.order.state === 'faceUp').length).toBe(1)
  })

  it('END-004 priority player promotes first when both need a Commander; one candidate is promoted without a decision', () => {
    const state = endScene((s) => {
      for (const u of Object.values(s.units)) if (u.rank === 'commander') {
        u.location = 'defeated'
        u.minis.forEach((m) => (m.alive = false))
      }
      // B has a single Trooper unit left
      for (const u of Object.values(s.units)) if (u.seat === 'B' && u.unitTypeId !== 'reb.u.rebel-troopers') u.location = 'defeated'
      Object.values(s.units).filter((u) => u.seat === 'B' && u.unitTypeId === 'reb.u.rebel-troopers').slice(1).forEach((u) => (u.location = 'defeated'))
    })
    const ctx = run(state)
    expect(ctx.state.pending!.kind).toBe('end.choice')
    expect(ctx.state.pending!.seat).toBe('A')
    expect(ctx.events.filter((e) => e.type === 'UnitPromoted')).toHaveLength(0)
    const r = must(ctx.state, ctx.state.pending!.options![0]!.action)
    const promos = r.events.filter((e) => e.type === 'UnitPromoted')
    expect(promos).toHaveLength(2)
    expect(r.events.find((e) => e.type === 'UnitPromoted')).toMatchObject({ seat: 'A' })
    expect(promos[1]).toMatchObject({ seat: 'B' })
  })

  it('END-005 with no Commander and no Trooper unit to promote the seat gets no command.pick next round', () => {
    const state = withData(
      endScene((s) => {
        for (const u of Object.values(s.units)) if (u.seat === 'A' && u.rank === 'commander') {
          u.location = 'defeated'
          u.minis.forEach((m) => (m.alive = false))
        }
      }),
      (d) => ({ ...d, unitTypes: { ...d.unitTypes, trooper: { ...(d.unitTypes!.trooper as object), flags: { trooper: false } } as never } }),
    )
    const ctx = run(state)
    expect(ctx.state.pending!.kind).toBe('command.pick')
    expect(ctx.state.pending!.context.seats).toEqual(['B'])
    expect(ctx.events.filter((e) => e.type === 'UnitPromoted')).toHaveLength(0)
  })
})

describe('victory', () => {
  const withPoints = (a: number, b: number, rounds?: number) =>
    endScene((s) => {
      s.players.A.points = a
      s.players.B.points = b
    }, { rounds })

  it('END-006 12 VP against 11 at the end of an End phase ends the game; 12 against 12 does not', () => {
    const win = run(withPoints(12, 11))
    expect(win.state.phase).toBe('ended')
    expect(win.state.result).toMatchObject({ winner: 'A', reason: 'battle' })
    expect(win.state.pending).toBeNull()
    const tie = run(withPoints(12, 12))
    expect(tie.state.phase).toBe('command')
    expect(tie.state.round).toBe(3)
    const behind = run(withPoints(11, 14))
    expect(behind.state.result).toMatchObject({ winner: 'B' })
  })

  it('END-007 a player left with no undefeated units loses immediately, also mid-activation', () => {
    const g = newGame({ generic: true, cards: CARDS, options: { autoDeploy: true } })
    const r = advance(pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.push' }), (p) => p.kind === 'activation.choose')
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const s = edit(r.state, (x) => {
      const u = x.units[id]!
      if (u.order.state === 'pool') x.players.A.pool.tokens.splice(x.players.A.pool.tokens.indexOf(u.rank), 1)
      u.order.state = 'faceUp'
      place(u, 0, -10)
      x.pending = { ...x.pending!, seat: 'A', options: [{ id: `unit:${id}`, labelKey: 'x', action: { type: 'activation.choose', seat: 'A', decisionId: x.pending!.id, payload: { unitId: id } } }] }
      for (const b of Object.values(x.units)) if (b.seat === 'B') {
        b.location = 'defeated'
        b.minis.forEach((m) => (m.alive = false))
      }
    })
    const started = must(s, s.pending!.options![0]!.action)
    const done = must(started.state, optionAction(started.state, 'aim'))
    expect(done.state.phase).toBe('ended')
    expect(events(done, 'GameEnded')[0]).toMatchObject({ result: { winner: 'A', reason: 'battle' } })
  })

  it('END-008 after the last round the higher VP wins; equal VP goes to the player whose own defeated units are worth fewer points; else a draw', () => {
    const more = run(withPoints(4, 2, 2))
    expect(more.state.result).toMatchObject({ winner: 'A', reason: 'roundLimit' })
    const lostA = endScene((s) => {
      s.players.A.points = 3
      s.players.B.points = 3
      const u = unitBy(s, 'A', 'emp.u.stormtroopers', 0)
      u.location = 'defeated'
      u.minis.forEach((m) => (m.alive = false))
    }, { rounds: 2 })
    expect(run(lostA).state.result).toMatchObject({ winner: 'B', reason: 'roundLimit' })
    const level = run(withPoints(3, 3, 2))
    expect(level.state.result).toMatchObject({ winner: 'draw' })
  })

  it('END-009 undeployed units count as undefeated for the wipe-out check', () => {
    const state = endScene((s) => {
      for (const u of Object.values(s.units)) if (u.seat === 'B') u.location = 'reserve'
      for (const u of Object.values(s.units)) if (u.seat === 'A') u.location = 'defeated'
    })
    const ctx = ctxFor(state)
    // A has nothing, B has only units in reserve: B wins, which proves B was counted
    expect(checkWipeout(ctx)).toBe(true)
    expect(ctx.state.result).toMatchObject({ winner: 'B' })
    const both = endScene((s) => {
      for (const u of Object.values(s.units)) u.location = 'reserve'
    })
    expect(checkWipeout(ctxFor(both))).toBe(false)
    void step
    void (undefined as unknown as StepResult)
  })
})
