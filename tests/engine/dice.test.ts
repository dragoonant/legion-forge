import { describe, expect, it } from 'vitest'
import {
  applyColourShifts,
  attackDistribution,
  compileDice,
  coverCancelled,
  defenceBlockDistribution,
  expectedOf,
  poolOf,
  reduceHits,
  rollDice,
  shiftColour,
  shiftDie,
  woundDistribution,
} from '../../src/engine/dice'
import { ScriptedRng } from '../../src/engine/rng'
import type { AttackFace, DefenceFace } from '../../src/engine/types'
import { DICE_DEF, TABLES } from './fixtures'

const all = (n: number) => Array.from({ length: n }, (_, i) => i)

function roll(die: Parameters<typeof rollDice>[2]): string[] {
  const sides = die === 'd6' ? 6 : die.startsWith('atk') ? 8 : 6
  return rollDice(new ScriptedRng(all(sides)), TABLES, die, sides).faces
}

function counts(faces: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of faces) out[f] = (out[f] ?? 0) + 1
  return out
}

describe('dice', () => {
  it('DICE-001 red attack die: 5 hit, 1 crit, 1 surge, 1 blank, face by face', () => {
    const faces = roll('atk:red')
    expect(faces).toEqual(['hit', 'hit', 'hit', 'hit', 'hit', 'crit', 'surge', 'blank'])
  })

  it('DICE-002 black attack die: 3 hit, 1 crit, 1 surge, 3 blank', () => {
    expect(counts(roll('atk:black'))).toEqual({ hit: 3, crit: 1, surge: 1, blank: 3 })
    expect(roll('atk:black')[0]).toBe('hit')
    expect(roll('atk:black')[7]).toBe('blank')
  })

  it('DICE-003 white attack die: 1 hit, 1 crit, 1 surge, 5 blank', () => {
    expect(roll('atk:white')).toEqual(['hit', 'crit', 'surge', 'blank', 'blank', 'blank', 'blank', 'blank'])
  })

  it('DICE-004 red defence 3 block 1 surge 2 blank; white defence 1 block 1 surge 4 blank', () => {
    expect(roll('def:red')).toEqual(['block', 'block', 'block', 'surge', 'blank', 'blank'])
    expect(roll('def:white')).toEqual(['block', 'surge', 'blank', 'blank', 'blank', 'blank'])
  })

  it('DICE-004 a script naming an index outside the die throws instead of guessing', () => {
    expect(() => rollDice(new ScriptedRng([8]), TABLES, 'atk:red', 1)).toThrow()
    expect(() => rollDice(new ScriptedRng([]), TABLES, 'atk:red', 1)).toThrow(/exhausted/)
  })

  it('DICE-004 face counts that do not add up to the sides are refused when compiling', () => {
    const bad = structuredClone(DICE_DEF)
    bad.attack.red.faces.hit = 4
    expect(() => compileDice(bad)).toThrow(/face counts/)
  })

  it('DICE-005 upgrade white->black->red and white->red defence; red cannot go up, white cannot go down (no error)', () => {
    expect(shiftColour(TABLES.ladder.attack, 'white', 1)).toBe('black')
    expect(shiftColour(TABLES.ladder.attack, 'black', 1)).toBe('red')
    expect(shiftColour(TABLES.ladder.attack, 'red', 1)).toBeNull()
    expect(shiftColour(TABLES.ladder.attack, 'white', -1)).toBeNull()
    expect(shiftColour(TABLES.ladder.defence, 'white', 1)).toBe('red')
    expect(shiftColour(TABLES.ladder.defence, 'red', 1)).toBeNull()
    const red = { colour: 'red', changedBy: [] }
    expect(shiftDie(TABLES.ladder.attack, red, 1, 'fx')).toBe(red)
  })

  it('DICE-006 one effect cannot change the same die twice', () => {
    const d1 = shiftDie(TABLES.ladder.attack, { colour: 'white', changedBy: [] }, 1, 'fx')
    expect(d1.colour).toBe('black')
    expect(shiftDie(TABLES.ladder.attack, d1, 1, 'fx')).toBe(d1)
    expect(shiftDie(TABLES.ladder.attack, d1, 1, 'other').colour).toBe('red')
    // an effect that upgrades 2 dice touches 2 different dice, never one die twice
    const pool = applyColourShifts(TABLES.ladder.attack, poolOf(['white', 'white']), [{ effectId: 'fx', party: 'attacker', dir: 1, count: 2 }])
    expect(pool.map((d) => d.colour)).toEqual(['black', 'black'])
  })

  it('DICE-006 shifts apply attacker downgrades, defender downgrades, attacker upgrades, defender upgrades', () => {
    const order: string[] = []
    applyColourShifts(
      TABLES.ladder.attack,
      poolOf(['red', 'red', 'red', 'red']),
      [
        { effectId: 'defUp', party: 'defender', dir: 1, count: 1 },
        { effectId: 'atkUp', party: 'attacker', dir: 1, count: 1 },
        { effectId: 'defDown', party: 'defender', dir: -1, count: 1 },
        { effectId: 'atkDown', party: 'attacker', dir: -1, count: 1 },
      ],
      (cands, _pool, shift) => {
        order.push(shift.effectId)
        return cands[0]!
      },
    )
    expect(order).toEqual(['atkDown', 'defDown', 'atkUp', 'defUp'])
  })

  it('DICE-007 four white dice with surge-to-hit: P(no hit or crit) is (5/8)^4 and the distribution sums to 1', () => {
    const d = attackDistribution(TABLES, ['white', 'white', 'white', 'white'], 'hit')
    expect(d.p[0]![0]).toBeCloseTo(Math.pow(5 / 8, 4), 12)
    const total = d.p.flat().reduce((s, x) => s + x, 0)
    expect(total).toBeCloseTo(1, 12)
    // each die: hit or surge (2/8) is a hit, crit 1/8
    const expectedHits = d.p.reduce((s, row, h) => s + h * row.reduce((a, b) => a + b, 0), 0)
    expect(expectedHits).toBeCloseTo(4 * (2 / 8), 12)
  })

  it('DICE-007 with no surge chart surges are blanks', () => {
    const d = attackDistribution(TABLES, ['red'], 'blank')
    expect(d.p[1]![0]).toBeCloseTo(5 / 8, 12)
    expect(d.p[0]![1]).toBeCloseTo(1 / 8, 12)
    expect(d.p[0]![0]).toBeCloseTo(2 / 8, 12)
  })

  it('DICE-007 wounds = hits + crits - blocks, never below 0; Dodge removes hits only', () => {
    // 1 red die, surge to blank, against 1 red defence die (3/6 block): wounds P(1) = P(hit or crit) * 1/2 = 6/8 * 1/2
    const atk = attackDistribution(TABLES, ['red'], 'blank')
    const w = woundDistribution(atk, TABLES, 'red', 'blank')
    expect(w[1]).toBeCloseTo((6 / 8) * 0.5, 12)
    expect(w[0]).toBeCloseTo(1 - (6 / 8) * 0.5, 12)
    // a Dodge token cancels a hit but not a crit
    const dodged = reduceHits(atk, 1)
    expect(dodged.p[0]![1]).toBeCloseTo(1 / 8, 12)
    expect(dodged.p[0]![0]).toBeCloseTo(7 / 8, 12)
    expect(expectedOf(defenceBlockDistribution(TABLES, 'red', 2, 'block'))).toBeCloseTo(2 * (4 / 6), 12)
  })

  it('COVER-008 light cover cancels one hit per block (surges nothing); COVER-009 heavy per block and surge', () => {
    const faces: DefenceFace[] = ['block', 'surge', 'blank', 'surge']
    expect(coverCancelled(faces, 'light')).toBe(1)
    expect(coverCancelled(faces, 'heavy')).toBe(3)
    expect(coverCancelled(faces, 'none')).toBe(0)
    const atk: AttackFace[] = ['hit']
    expect(atk.length).toBe(1)
  })
})
