// GOLD-002: docs/spec/13-golden-examples.md GOLDEN-002 (command phase with a priority tie, orders, pools, first activations)
// replayed on the real Recon data. The golden's 6"-deep strip Territories are a fixture the Recon map card replaces (13-golden,
// setup paragraph), so deployment coordinates are not pinned; everything else is: priority, orders, pools, the activation
// sequence, the pool draws, the auto-pick and what each seat can see.
import { describe, expect, it } from 'vitest'
import { redactEvents, view, type GameState, type Seat, type StepResult } from '../../../src/engine'
import { createGame } from '../../../src/engine'
import { RULESET } from '../../../src/engine/bundle'
import { rosterFromList } from '../../../src/engine/setup'
import { GENERIC_A, GENERIC_B, CLOSE, ScriptedRng, answerOf, events, must, optionAction, pick, realBundle } from './helpers'

const ids = (r: StepResult): string[] => (r.pending?.options ?? []).map((o) => o.id)

function goldenGame(): StepResult {
  const bundle = realBundle()
  const A = rosterFromList(bundle.data, 'emp.list.recon-a')
  const B = rosterFromList(bundle.data, 'reb.list.recon-a')
  A.units = ['emp.u.darth-vader-dlots', 'emp.u.stormtroopers', 'emp.u.stormtroopers', 'emp.u.scout-troopers', 'emp.u.scout-troopers'].map((unit) => ({ unit, upgrades: [] }))
  B.units = ['reb.u.luke-hotr', 'reb.u.rebel-troopers', 'reb.u.rebel-troopers', 'reb.u.rebel-commandos', 'reb.u.wookiee-warriors-ff'].map((unit) => ({ unit, upgrades: [] }))
  A.commandHand = [...GENERIC_A]
  B.commandHand = [...GENERIC_B]
  const r = createGame({ ruleset: RULESET, format: 'recon', battle: { cards: CLOSE }, armies: { A, B }, blue: 'A' }, 'golden-2', bundle)
  return must(r.state, optionAction(r.state, 'edge:zMin'))
}

/** Answer move decisions with the engine suggestion until the move is over (the golden clicks destinations). */
function finishMoves(r: StepResult): StepResult {
  let cur = r
  while (cur.pending && (cur.pending.kind === 'move.tool' || cur.pending.kind === 'move.troopers')) cur = must(cur.state, answerOf(cur.state))
  return cur
}

const unitOfType = (s: GameState, seat: Seat, type: string, nth = 0) => Object.values(s.units).filter((u) => u.seat === seat && u.unitTypeId === type)[nth]!

describe('GOLD', () => {
  it('GOLD-002 command phase with a priority tie, orders, pools and first activations', () => {
    let r = goldenGame()
    expect(r.pending!.kind).toBe('command.pick')
    const s0 = r.state
    // every unit starts undeployed (no Prepared Position in these lists)
    expect(Object.values(s0.units).every((u) => u.location === 'reserve')).toBe(true)

    // 1. both pick Push; the first pick is hidden from the other seat (CMD-001)
    r = must(s0, optionAction(s0, 'A:neu.cc.push', 'A'))
    expect(view(r.state, 'B').command.picks.A).toEqual({ hidden: true })
    expect(r.state.pending!.context.answered).toEqual(['A'])
    // 3. a 2-2 tie: A (blue) rolls the red defence die: blank (index 4) -> B has priority (CMD-004)
    r = must(r.state, optionAction(r.state, 'B:neu.cc.push', 'B'), new ScriptedRng([4]))
    expect(events(r, 'PriorityDecided')[0]).toMatchObject({ holder: 'B', pips: { A: 2, B: 2 }, rolloff: { faces: ['blank'], roller: 'A' } })
    expect(r.state.command.priority).toBe('B')

    // 4-5. one Commander each, so no command.issuer; B orders first: WW then RT-A, then A: Vader then ST-A
    expect(r.pending!.kind).toBe('command.order')
    expect(r.pending!.seat).toBe('B')
    expect(ids(r)).toHaveLength(5)
    expect(ids(r)).not.toContain('done')
    const ww = unitOfType(r.state, 'B', 'reb.u.wookiee-warriors-ff')
    const rtA = unitOfType(r.state, 'B', 'reb.u.rebel-troopers', 0)
    const rtB = unitOfType(r.state, 'B', 'reb.u.rebel-troopers', 1)
    const vader = unitOfType(r.state, 'A', 'emp.u.darth-vader-dlots')
    const stA = unitOfType(r.state, 'A', 'emp.u.stormtroopers', 0)
    const scB = unitOfType(r.state, 'A', 'emp.u.scout-troopers', 1)
    r = must(r.state, optionAction(r.state, ww.id))
    r = must(r.state, optionAction(r.state, rtA.id))
    expect(r.pending!.seat).toBe('A')
    r = must(r.state, optionAction(r.state, vader.id))
    r = must(r.state, optionAction(r.state, stA.id))
    expect(r.pending!.kind).toBe('activation.choose')
    // 6-7. order pools by rank, no pass tokens (5 v 5)
    const formed = events(r, 'OrderPoolFormed')
    expect(formed).toHaveLength(2)
    expect(r.state.players.A.pool.tokens.slice().sort()).toEqual(['corps', 'special-forces', 'special-forces'])
    expect(r.state.players.B.pool.tokens.slice().sort()).toEqual(['commander', 'corps', 'special-forces'])
    // 5 units against 5: R-4.9 grants nothing (the battle cards' own pass tokens, if any, come from CardEffect events)
    expect(Object.values(r.state.units).filter((u) => u.seat === 'A')).toHaveLength(5)
    expect(events(r, 'PassTokensGranted').every((e) => e.type === 'PassTokensGranted' && events(r, 'CardEffect').some((c) => c.type === 'CardEffect' && c.detail.passTokens === e.n))).toBe(true)
    // the opponent sees the pool as counts per rank, never the token order
    expect(view(r.state, 'A').players.B.pool).toEqual({ size: 3, byRank: { commander: 1, corps: 1, 'special-forces': 1 } })

    // 8. B's turn: WW, RT-A and drawPool; WW is undeployed, so only Move; two moves deploy it, order token face down
    expect(r.pending!.seat).toBe('B')
    expect(ids(r).sort()).toEqual([`unit:${ww.id}`, `unit:${rtA.id}`, 'drawPool'].sort())
    r = must(r.state, optionAction(r.state, `unit:${ww.id}`))
    expect(events(r, 'UnitActivated')[0]).toMatchObject({ unitId: ww.id, via: 'order' })
    expect(r.pending!.kind).toBe('action.choose')
    expect(ids(r).filter((i) => i !== 'end')).toEqual(['move'])
    r = finishMoves(must(r.state, optionAction(r.state, 'move')))
    expect(r.state.units[ww.id]!.location).toBe('table')
    r = finishMoves(must(r.state, optionAction(r.state, 'move')))
    const ended = r.events.filter((e) => e.type === 'ActivationEnded')
    expect(ended[0]).toMatchObject({ unitId: ww.id, actionsUsed: 2 })
    expect(r.state.units[ww.id]!.order.state).toBe('spent')

    // 9. A draws from the pool at index 1 of [corps, special-forces, special-forces] -> special forces; the draw is hidden from B
    expect(r.pending!.seat).toBe('A')
    expect(ids(r).sort()).toEqual([`unit:${vader.id}`, `unit:${stA.id}`, 'drawPool'].sort())
    r = must(r.state, optionAction(r.state, 'drawPool'), new ScriptedRng([1]))
    expect(events(r, 'PoolTokenDrawn')[0]).toMatchObject({ seat: 'A', rank: 'special-forces' })
    expect(redactEvents(r.events, 'B').find((e) => e.type === 'PoolTokenDrawn')).toMatchObject({ rank: { hidden: true } })
    expect(r.pending!.kind).toBe('activation.pick')
    expect(ids(r).sort()).toEqual([`unit:${unitOfType(r.state, 'A', 'emp.u.scout-troopers', 0).id}`, `unit:${scB.id}`].sort())
    r = must(r.state, optionAction(r.state, `unit:${scB.id}`))
    expect(events(r, 'UnitActivated')[0]).toMatchObject({ unitId: scB.id, via: 'pool' })
    r = finishMoves(must(r.state, optionAction(r.state, 'move')))
    expect(r.state.units[scB.id]!.location).toBe('table')
    r = must(r.state, optionAction(r.state, 'dodge'))
    expect(r.state.units[scB.id]!.tokens.dodge).toBe(1)
    expect(r.state.players.A.pool.tokens.slice().sort()).toEqual(['corps', 'special-forces'])
    expect(r.pending!.kind).toBe('activation.choose')

    // 10. B draws at index 1 of [commander, corps, special-forces] -> corps; RT-A holds a face-up order, so RT-B is picked automatically
    expect(r.pending!.seat).toBe('B')
    r = must(r.state, optionAction(r.state, 'drawPool'), new ScriptedRng([1]))
    expect(events(r, 'PoolTokenDrawn')[0]).toMatchObject({ seat: 'B', rank: 'corps' })
    expect(events(r, 'UnitActivated')[0]).toMatchObject({ unitId: rtB.id, via: 'pool', rank: 'corps' })
    expect(r.pending!.kind).toBe('action.choose')
    r = finishMoves(must(r.state, optionAction(r.state, 'move')))
    r = must(r.state, optionAction(r.state, 'dodge'))
    expect(r.state.units[rtB.id]!.location).toBe('table')
    // the Dodge action adds one token (an advantage card may have given another when RT-B was deployed)
    expect(r.events.find((e) => e.type === 'TokenChanged' && e.unitId === rtB.id && e.kind === 'dodge')).toMatchObject({ to: r.state.units[rtB.id]!.tokens.dodge, from: r.state.units[rtB.id]!.tokens.dodge! - 1 })
  })

  it('GOLD-002 variants: 1 pip against 2 pips gives priority with no die (CMD-003)', () => {
    let r = goldenGame()
    r = pick(r, { A: 'neu.cc.push', B: 'neu.cc.ambush' })
    expect(events(r, 'PriorityDecided')[0]).toMatchObject({ holder: 'B', pips: { A: 2, B: 1 } })
    expect(events(r, 'DiceRolled')).toHaveLength(0)
  })
})
