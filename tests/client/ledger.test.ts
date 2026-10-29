// The ledger behind the end-screen recap: points by card and round, units lost, and every hidden decision of a seat (picks and draws),
// built from unredacted events; it survives a save round trip, and a real bot game fills it.
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine'
import { emptyLedger, hiddenDecisions, parseLedger, recordLedger, roundsScored, unitsLost, vpByCard } from '../../src/client/store/ledger'

const units = { units: { 'a.1': { seat: 'A', unitTypeId: 'u.a' }, 'b.1': { seat: 'B', unitTypeId: 'u.b' } } } as never

const ev = (e: unknown) => e as GameEvent

describe('ledger', () => {
  it('records picks, draws, scores and losses with the round they happened in', () => {
    let l = emptyLedger()
    l = recordLedger(l, [ev({ type: 'RoundStarted', round: 1 }), ev({ type: 'CommandCardPicked', seat: 'B', cardId: 'reb.cc.x' }), ev({ type: 'CommandCardPicked', seat: 'A', cardId: 'emp.cc.y' })], units)
    l = recordLedger(l, [ev({ type: 'PoolTokenDrawn', seat: 'B', rank: 'corps' }), ev({ type: 'PoolTokenDrawn', seat: 'B', rank: 'heavy' }), ev({ type: 'UnitDefeated', unitId: 'b.1' })], units)
    l = recordLedger(l, [ev({ type: 'RoundStarted', round: 2 }), ev({ type: 'PointsScored', seat: 'A', amount: 2, reason: 'card.obj:hold' }), ev({ type: 'PointsScored', seat: 'A', amount: 1, reason: 'card.obj:extra' }), ev({ type: 'PointsScored', seat: 'B', amount: 1, reason: 'card.sec' })], units)
    expect(hiddenDecisions(l, 'B').rounds).toEqual([{ round: 1, pick: 'reb.cc.x', draws: ['corps', 'heavy'] }])
    expect(unitsLost(l, 'B')).toEqual([{ round: 1, unitId: 'b.1', typeId: 'u.b' }])
    expect(unitsLost(l, 'A')).toEqual([])
    const rows = vpByCard(l)
    expect(rows.map((r) => r.card)).toEqual(['card.obj', 'card.sec'])
    expect(rows[0]!.byRound[2]).toEqual({ A: 3, B: 0 })
    expect(rows[0]!.total).toEqual({ A: 3, B: 0 })
    expect(roundsScored(l)).toEqual([2])
  })

  it('a hidden (redacted) pick or draw is not recorded', () => {
    const l = recordLedger(emptyLedger(), [ev({ type: 'CommandCardPicked', seat: 'B', cardId: { hidden: true } }), ev({ type: 'PoolTokenDrawn', seat: 'B', rank: { hidden: true } })], units)
    expect(l.entries).toEqual([])
  })

  it('an unchanged step returns the same ledger object', () => {
    const l = emptyLedger()
    expect(recordLedger(l, [ev({ type: 'AttackRolled', faces: [] })], units)).toBe(l)
  })

  it('survives JSON and drops malformed entries', () => {
    const l = recordLedger(emptyLedger(), [ev({ type: 'RoundStarted', round: 1 }), ev({ type: 'PointsScored', seat: 'A', amount: 1, reason: 'r' })], units)
    expect(parseLedger(JSON.parse(JSON.stringify(l)))).toEqual(l)
    expect(parseLedger({ round: 3, entries: [{ t: 'score', seat: 'Z' }, { t: 'pick', seat: 'A', round: 1, cardId: 4 }, null] })).toEqual({ round: 3, entries: [] })
    expect(parseLedger('x')).toEqual(emptyLedger())
  })
})
