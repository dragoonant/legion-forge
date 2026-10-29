// M2c review finding 28 (Divulge is offered at Resolve Setup Effects and forces the Round 1 pick) and the Infiltrate it unlocks
// (CRB p51, p61), all through `step` on the real data.
import { describe, expect, it } from 'vitest'
import '../../../src/engine'
import { unitKeywords } from '../../../src/engine/keywords'
import { advance, hasOption, must, newGame, optionAction, pick, toActivation, unitBy } from './helpers'
import { CLOSE, startOf } from './m2c-helpers'

const DD = 'emp.cc.darkness-descends'
const fresh = () => newGame({ cards: CLOSE, options: { autoDeploy: true, autoDivulge: false } })

describe('M2c Divulge and Infiltrate (review 28)', () => {
  it('RVW-28 Resolve Setup Effects offers the Divulge of Darkness Descends to its owner; declining ends the chance', () => {
    const g = fresh()
    expect(g.pending!.kind).toBe('card.choice')
    expect(g.pending!.seat).toBe('A')
    expect(g.pending!.context['cardId']).toBe(DD)
    expect(g.pending!.options!.map((o) => o.id)).toEqual(['divulge', 'decline'])
    const r = must(g.state, optionAction(g.state, 'decline'))
    expect(r.pending!.kind).toBe('command.pick')
    // played in Round 1 the card is an ordinary Permanent: Vader gets Reliable 2 and never Infiltrate
    const played = toActivation(pick(r, { A: DD, B: 'neu.cc.standing-orders' }))
    const vader = unitBy(played.state, 'A', 'emp.u.darth-vader-dlots')
    expect(unitKeywords(played.state, vader).map((k) => k.id)).not.toContain('kw.infiltrate')
    expect(vader.tokens.surge ?? 0).toBe(2)
  })

  it('RVW-28 a Divulged Darkness Descends gives Vader Infiltrate, must be the card played in Round 1, and gives no Reliable', () => {
    const g = fresh()
    const r = must(g.state, optionAction(g.state, 'divulge'))
    expect(r.pending!.kind).toBe('command.pick')
    const vader0 = unitBy(r.state, 'A', 'emp.u.darth-vader-dlots')
    expect(unitKeywords(r.state, vader0).map((k) => k.id)).toContain('kw.infiltrate')
    // seat A may pick nothing else in Round 1
    const aIds = r.pending!.options!.filter((o) => o.action.seat === 'A').map((o) => o.id)
    expect(aIds).toEqual([`A:${DD}`])
    expect(r.pending!.options!.some((o) => o.action.seat === 'B' && o.id !== `B:${DD}`)).toBe(true)
    const played = toActivation(pick(r, { A: DD, B: 'neu.cc.standing-orders' }))
    expect(unitBy(played.state, 'A', 'emp.u.darth-vader-dlots').tokens.surge ?? 0).toBe(0)
  })

  it('RVW-28 Infiltrate: when his activation starts an undeployed Vader may deploy inside allied Territory, or decline and enter by Move', () => {
    const g = fresh()
    const r = must(g.state, optionAction(g.state, 'divulge'))
    const played = toActivation(pick(r, { A: DD, B: 'neu.cc.standing-orders' }))
    const vader = unitBy(played.state, 'A', 'emp.u.darth-vader-dlots')
    expect(vader.location).toBe('reserve')
    let st = startOf(played.state, vader.id)
    expect(st.pending!.kind).toBe('setup.deploy')
    expect(st.pending!.context['infiltrate']).toBe(true)
    expect(st.pending!.canPass).toBe(true)
    // decline: the activation goes on, Vader still has to enter by Move
    const declined = must(st.state, { type: 'pass', seat: 'A', decisionId: st.pending!.id, payload: {} })
    expect(declined.pending!.kind).toBe('action.choose')
    expect(declined.state.units[vader.id]!.location).toBe('reserve')
    expect(hasOption(declined.state, 'move')).toBe(true)
    // accept: the engine's suggestion is a legal Territory spot
    st = advance(st, (p) => p.kind === 'action.choose')
    expect(st.state.units[vader.id]!.location).toBe('table')
    expect(st.state.activation.current!.actionsLeft).toBe(2)
  })
})
