// The how-to-play guide and the first-turn hints: every section has text, the hints name decision kinds the engine really raises, and
// every game term the guide uses resolves to help.
import { describe, expect, it } from 'vitest'
import { engineBundle } from '../../src/client/game/adapter'
import { FIRST_HINTS, HOW_TO_PLAY, hintFor } from '../../src/client/game/howto'
import { termIndex } from '../../src/client/game/terms'

describe('how to play', () => {
  it('covers rounds, orders, actions, the movement tool, cover and suppression', () => {
    const ids = HOW_TO_PLAY.map((s) => s.id)
    for (const need of ['round', 'orders', 'actions', 'move', 'attack', 'suppression']) expect(ids).toContain(need)
    for (const s of HOW_TO_PLAY) {
      expect(s.lines.length, s.id).toBeGreaterThan(0)
      for (const l of s.lines) expect(l.length).toBeGreaterThan(30)
    }
  })

  it('the guide uses game terms that resolve to help (doorways)', () => {
    const idx = termIndex(engineBundle().data)
    const found = new Set<string>()
    for (const s of HOW_TO_PLAY) for (const l of s.lines) for (const p of idx.split(l)) if (typeof p !== 'string') found.add(p.help.term)
    for (const t of ['Aim', 'Dodge', 'Recover', 'Suppressed', 'Order pool', 'Priority']) expect([...found], t).toContain(t)
  })

  it('first-turn hints name known decision kinds and say something', () => {
    const kinds = ['setup.battle', 'setup.deploy', 'command.pick', 'command.issuer', 'command.order', 'activation.choose', 'activation.pick', 'action.choose', 'move.tool', 'attack.defender']
    expect(Object.keys(FIRST_HINTS).sort()).toEqual([...kinds].sort())
    for (const k of kinds) expect(hintFor(k)!.length).toBeGreaterThan(20)
    expect(hintFor('confirm')).toBeNull()
  })
})
