// Dice tray rows come off the engine's DiceRolled events: colour and face per die, one row per roll, the Compared outcome on the last row.
import { beforeEach, describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/engine'
import { diceFor, rollKind, trayEvent } from '../../src/client/dice/trayEvents'
import { trayClear, useTray } from '../../src/client/dice/trayStore'
import { installStorage, playGame } from './fixtures'

const ev = <T extends GameEvent['type']>(type: T, rest: Omit<Extract<GameEvent, { type: T }>, 'type' | 'seq' | 'round' | 'phase' | 'seat'>): GameEvent =>
  ({ type, seq: 1, round: 1, phase: 'activation', seat: 'A', ...rest }) as GameEvent

describe('dice tray', () => {
  beforeEach(() => {
    installStorage()
    trayClear()
  })
  const state = playGame('tray-names', (s) => s.round >= 1).state

  it('attack dice are d8 by colour, defence dice d6, a plain die has no colour', () => {
    expect(diceFor('atk:red', ['hit', 'crit', 'blank'])).toEqual([
      { side: 'atk', colour: 'red', face: 'hit' },
      { side: 'atk', colour: 'red', face: 'crit' },
      { side: 'atk', colour: 'red', face: 'blank' },
    ])
    expect(diceFor('def:white', ['block'])[0]).toEqual({ side: 'def', colour: 'white', face: 'block' })
    expect(diceFor('d6', ['4'])[0]).toEqual({ side: 'd6', colour: null, face: '4' })
    expect(diceFor('atk:black', ['surge'])[0]!.colour).toBe('black')
  })

  it('rolls are told apart by purpose', () => {
    expect(rollKind('defence').kind).toBe('defence')
    expect(rollKind('cover').kind).toBe('cover')
    expect(rollKind('rally').kind).toBe('rally')
    expect(rollKind('priority').kind).toBe('priority')
    expect(rollKind('attack.reroll').reroll).toBe(true)
    expect(rollKind('attack').kind).toBe('attack')
    expect(rollKind('bluePlayer:A').label).toBe('Blue player roll')
  })

  it('an attack clears the tray; its rolls become rows and Compared sets the verdict', () => {
    const [u0, u1] = Object.keys(state.units)
    trayEvent(ev('DiceRolled', { purpose: 'rally', die: 'def:white', indexes: [0], faces: ['block'], final: true }), state)
    trayEvent(ev('AttackDeclared', { attackerId: u0!, defenderId: u1! }), state)
    expect(useTray.getState().rows).toHaveLength(0)
    trayEvent(ev('DiceRolled', { purpose: 'attack', die: 'atk:red', indexes: [0, 1], faces: ['hit', 'blank'], final: true }), state)
    // the next colour of the same pool joins the row
    trayEvent(ev('DiceRolled', { purpose: 'attack', die: 'atk:white', indexes: [2], faces: ['surge'], final: true }), state)
    trayEvent(ev('DiceRolled', { purpose: 'defence', die: 'def:red', indexes: [0], faces: ['block'], final: true }), state)
    trayEvent(ev('Compared', { hits: 1, crits: 0, blocks: 1, wounds: 0 }), state)
    const t = useTray.getState()
    expect(t.rows.map((r) => r.kind)).toEqual(['attack', 'defence'])
    expect(t.rows[0]!.dice.map((d) => d.face)).toEqual(['hit', 'blank', 'surge'])
    expect(t.rows[0]!.dice.map((d) => d.colour)).toEqual(['red', 'red', 'white'])
    expect(t.rows[1]!.verdict).toMatch(/0 wounds/)
    expect(t.title).toMatch(/attacks/)
  })

  it('the real game rolls only ever show faces the data dice have', () => {
    const played = playGame('tray-faces', (s) => s.round >= 2)
    for (const e of played.events) {
      if (e.type !== 'DiceRolled') continue
      trayEvent(e, played.state)
    }
    for (const row of useTray.getState().rows) for (const d of row.dice) expect(d.face.length).toBeGreaterThan(0)
  })
})
