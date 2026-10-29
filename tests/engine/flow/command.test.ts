import { describe, expect, it } from 'vitest'
import { redactEvents, step, view } from '../../../src/engine'
import { afterOrders, beginRound } from '../../../src/engine/command'
import { CLOSE, ScriptedRng, advance, ctxFor, edit, events, must, newGame, optionAction, pick, unitBy } from './helpers'

const generic = () => newGame({ generic: true, cards: CLOSE, options: { autoDeploy: true } })
const real = () => newGame({ cards: CLOSE, options: { autoDeploy: true } })

describe('the Command phase', () => {
  it('CMD-001 command.pick is for both seats, the first pick is invisible to the other seat until the reveal, a second pick and a foreign card are refused', () => {
    const g = generic()
    expect(g.pending!.kind).toBe('command.pick')
    expect(g.pending!.seat).toBe('all')
    const a = must(g.state, optionAction(g.state, 'A:neu.cc.assault', 'A'))
    expect(a.state.command.picks.A).toBe('neu.cc.assault')
    expect(view(a.state, 'B').command.picks.A).toEqual({ hidden: true })
    expect(view(a.state, 'A').command.picks.A).toBe('neu.cc.assault')
    const ev = redactEvents(a.events, 'B').find((e) => e.type === 'CommandCardPicked')
    expect(ev).toMatchObject({ type: 'CommandCardPicked', cardId: { hidden: true } })
    expect(a.state.pending!.context.answered).toEqual(['A'])
    const again = step(a.state, { type: 'command.pick', seat: 'A', decisionId: a.state.pending!.id, payload: { cardId: 'neu.cc.ambush' } })
    expect(again.rejection?.code).toBe('E_ALREADY_ANSWERED')
    const foreign = step(a.state, { type: 'command.pick', seat: 'B', decisionId: a.state.pending!.id, payload: { cardId: 'emp.cc.coordinated-fire' } })
    expect(foreign.rejection?.code).toBe('E_NOT_AN_OPTION')
    const b = must(a.state, optionAction(a.state, 'B:neu.cc.push', 'B'))
    expect(b.state.command.revealed).toBe(true)
    expect(view(b.state, 'B').command.picks.A).toBe('neu.cc.assault')
  })

  it('CMD-002 a player with no undefeated Commander or Operative plays no card, and the other player has priority', () => {
    const g = generic()
    const dead = edit(g.state, (s) => {
      for (const u of Object.values(s.units)) if (u.seat === 'A' && (u.rank === 'commander' || u.rank === 'operative')) {
        u.location = 'defeated'
        u.minis.forEach((m) => (m.alive = false))
      }
    })
    const ctx = ctxFor(dead)
    beginRound(ctx, 2)
    expect(ctx.state.pending!.seat).toBe('all')
    expect(ctx.state.pending!.context.seats).toEqual(['B'])
    expect(ctx.state.pending!.options!.every((o) => o.action.seat === 'B')).toBe(true)
    const r = must(ctx.state, optionAction(ctx.state, 'B:neu.cc.assault', 'B'))
    expect(r.state.command.priority).toBe('B')
  })

  it('CMD-003 fewer pips takes priority with no roll', () => {
    const g = generic()
    const r = pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.assault' })
    const ev = events(r, 'PriorityDecided')[0]!
    expect(ev).toMatchObject({ holder: 'A', pips: { A: 1, B: 3 } })
    expect(ev).not.toHaveProperty('rolloff')
    expect(r.state.command.priority).toBe('A')
    expect(events(r, 'DiceRolled')).toHaveLength(0)
  })

  it('CMD-004 equal pips: one red defence die; a block gives the roller priority, a surge or blank the other seat', () => {
    const g = generic()
    const first = must(g.state, optionAction(g.state, 'A:neu.cc.push', 'A'))
    // red defence faces: 0-2 block, 3 surge, 4-5 blank
    const block = must(first.state, optionAction(first.state, 'B:neu.cc.push', 'B'), new ScriptedRng([1]))
    expect(block.state.command.priority).toBe('A')
    expect(events(block, 'PriorityDecided')[0]).toMatchObject({ rolloff: { faces: ['block'], roller: 'A' } })
    const blank = must(first.state, optionAction(first.state, 'B:neu.cc.push', 'B'), new ScriptedRng([5]))
    expect(blank.state.command.priority).toBe('B')
    const surge = must(first.state, optionAction(first.state, 'B:neu.cc.push', 'B'), new ScriptedRng([3]))
    expect(surge.state.command.priority).toBe('B')
  })

  it('CMD-006 with one Commander unit no command.issuer is raised; with two it is', () => {
    const g = generic()
    const one = pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.assault' })
    expect(events(one, 'DecisionRequested').some((e) => e.type === 'DecisionRequested' && e.kind === 'command.issuer')).toBe(false)
    const two = edit(g.state, (s) => {
      unitBy(s, 'A', 'emp.u.stormtroopers', 0).rank = 'commander'
    })
    const r = pick({ ...g, state: two, pending: two.pending }, { A: 'neu.cc.ambush', B: 'neu.cc.assault' })
    expect(r.pending!.kind).toBe('command.issuer')
    expect(r.pending!.seat).toBe('A')
    expect(r.pending!.options).toHaveLength(2)
  })

  it('CMD-007 a character card forces its named unit as the commander', () => {
    const g = real()
    const two = edit(g.state, (s) => {
      unitBy(s, 'A', 'emp.u.stormtroopers', 0).rank = 'commander'
    })
    const r = pick({ ...g, state: two, pending: two.pending }, { A: 'emp.cc.master-of-evil', B: 'neu.cc.standing-orders' })
    expect(r.pending!.kind).toBe('command.order')
    expect(r.pending!.context.issuerId).toBe(unitBy(r.state, 'A', 'emp.u.darth-vader-dlots').id)
    expect(events(r, 'DecisionRequested').some((e) => e.type === 'DecisionRequested' && e.kind === 'command.issuer')).toBe(false)
  })

  it('CMD-008 orders are issued priority seat first; a unit far out of range and LoS of the commander still receives one', () => {
    const g = real()
    const r = pick(g, { A: 'emp.cc.master-of-evil', B: 'neu.cc.standing-orders' })
    // A (3 pips) has priority over B (4 pips); every unit is in reserve, nowhere near Vader
    expect(r.state.command.priority).toBe('A')
    expect(r.pending!.seat).toBe('A')
    // Master of Evil names Vader: he is ordered first (no choice, CRB p22), the other two orders go anywhere
    const vader = unitBy(r.state, 'A', 'emp.u.darth-vader-dlots')
    expect(vader.order.state).toBe('faceUp')
    const ids = r.pending!.options!.map((o) => o.id)
    expect(ids).toHaveLength(Object.values(r.state.units).filter((u) => u.seat === 'A').length - 1)
    expect(ids).not.toContain(vader.id)
    const target = unitBy(r.state, 'A', 'emp.u.scout-troopers', 0)
    const done = must(r.state, optionAction(r.state, target.id))
    expect(done.state.units[target.id]!.order.state).toBe('faceUp')
  })

  it('CMD-009 command.order offers no "done" while an eligible unit remains; Assault with two eligible units issues two and loses the third', () => {
    const g = generic()
    const r = pick(g, { A: 'neu.cc.push', B: 'neu.cc.ambush' })
    // B (1 pip) has priority and 6 eligible units for its single order
    expect(r.pending!.kind).toBe('command.order')
    const seat = r.pending!.seat as 'A' | 'B'
    const noDone = step(r.state, { type: 'command.order', seat, decisionId: r.pending!.id, payload: { done: true } })
    expect(noDone.rejection?.code).toBe('E_NOT_AN_OPTION')
    const noPass = step(r.state, { type: 'pass', seat, decisionId: r.pending!.id, payload: {} })
    expect(noPass.rejection?.code).toBe('E_PASS_NOT_ALLOWED')
    // five of A's seven units already hold orders: Assault (3) reaches only the two left
    const edited = edit(g.state, (s) => {
      Object.values(s.units).filter((u) => u.seat === 'A').slice(0, 5).forEach((u) => (u.order.state = 'faceUp'))
    })
    const r2 = pick({ ...g, state: edited, pending: edited.pending }, { A: 'neu.cc.assault', B: 'neu.cc.standing-orders' })
    expect(events(r2, 'OrderIssued').filter((e) => e.seat === 'A')).toHaveLength(2)
  })

  it('CMD-010 a unit that already holds an order is not an option', () => {
    const g = generic()
    const ordered = unitBy(g.state, 'A', 'emp.u.stormtroopers', 0)
    const edited = edit(g.state, (s) => {
      s.units[ordered.id]!.order.state = 'faceUp'
    })
    const r = pick({ ...g, state: edited, pending: edited.pending }, { A: 'neu.cc.push', B: 'neu.cc.assault' })
    expect(r.pending!.kind).toBe('command.order')
    expect(r.pending!.options!.map((o) => o.id)).not.toContain(ordered.id)
  })

  it('CMD-011 Standing Orders returns to the hand at the end of the Command phase and is never in the discard pile', () => {
    const g = generic()
    let r = pick(g, { A: 'neu.cc.standing-orders', B: 'neu.cc.ambush' })
    r = advance(r, (p, s) => p.kind === 'command.pick' && s.round === 2)
    expect(r.state.round).toBe(2)
    expect(r.state.players.A.hand).toContain('neu.cc.standing-orders')
    expect(r.state.players.A.played).not.toContain('neu.cc.standing-orders')
    expect(r.state.players.B.hand).not.toContain('neu.cc.ambush')
    expect(r.state.players.B.played).toContain('neu.cc.ambush')
  })

  it('CMD-012 the order pool holds one rank token per unit without an order; view shows counts per rank, never the token order', () => {
    const g = real()
    const r = pick(g, { A: 'neu.cc.standing-orders', B: 'neu.cc.standing-orders' })
    const done = advance(r, (p) => p.kind === 'activation.choose')
    for (const seat of ['A', 'B'] as const) {
      const units = Object.values(done.state.units).filter((u) => u.seat === seat)
      const pooled = units.filter((u) => u.order.state === 'pool')
      expect(done.state.players[seat].pool.tokens).toHaveLength(pooled.length)
      expect(done.state.players[seat].pool.tokens).toEqual(pooled.map((u) => u.rank).sort())
      const pv = view(done.state, seat === 'A' ? 'B' : 'A').players[seat].pool
      expect(Object.keys(pv).sort()).toEqual(['byRank', 'size'])
      expect(pv.size).toBe(pooled.length)
    }
  })

  it('CMD-013 the player with fewer units gets (difference - 1) pass tokens: 8 v 12 gives 3, 5 v 6 and 5 v 5 give none', () => {
    // no Advanced Intel in this deck: it would add a pass token of its own at the start of round 1
    const g = newGame({ cards: ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.cunning-deployment', 'rec.adv.fortified-position'], options: { autoDeploy: true } })
    const withCounts = (a: number, b: number) =>
      edit(g.state, (s) => {
        s.command.priority = 'A'
        for (const [seat, n] of [['A', a], ['B', b]] as const) {
          const mine = Object.values(s.units).filter((u) => u.seat === seat)
          let i = 0
          while (mine.length < n) {
            const c = structuredClone(mine[0]!)
            c.id = `${seat}x${i++}`
            c.minis.forEach((m, k) => (m.id = `${c.id}.${k}`))
            c.leaderId = `${c.id}.0`
            s.units[c.id] = c
            mine.push(c)
          }
          // surplus units are defeated so the count is exactly n
          Object.values(s.units).filter((u) => u.seat === seat).slice(n).forEach((u) => (u.location = 'defeated'))
        }
      })
    const run = (a: number, b: number) => {
      const ctx = ctxFor(withCounts(a, b))
      afterOrders(ctx)
      return ctx.state.players
    }
    const p = run(8, 12)
    expect(p.A.passTokens).toBe(3)
    expect(p.B.passTokens ?? 0).toBe(0)
    const q = run(5, 6)
    expect((q.A.passTokens ?? 0) + (q.B.passTokens ?? 0)).toBe(0)
    const z = run(5, 5)
    expect((z.A.passTokens ?? 0) + (z.B.passTokens ?? 0)).toBe(0)
  })
})
