// GOLD-001: docs/spec/13-golden-examples.md GOLDEN-001 replayed with the forced dice (Stormtroopers shoot Rebel Troopers in
// light cover: Aim, Dodge, Nimble, suppression). The Standby window of step 3 belongs to the activation module (M2b-flow);
// everything from "Attack" on is this module. GOLD-002 (command phase) needs the command and activation modules.
import { afterEach, describe, expect, it } from 'vitest'
import { losCover, attackTargets } from '../../../src/engine/query'
import { box } from '../fixtures'
import { atk, beginAttack, choose, def, eventsOf, game, idx, menu, ok, optionIds, script, u, unit, uninstallModules } from './harness'

afterEach(uninstallModules)

function goldenState() {
  const st = unit({ id: 'ST', seat: 'A', data: 'emp.u.stormtroopers', at: [[0, -8], [-1.5, -8.5], [1.5, -8.5], [0, -9.5]], order: 'faceUp', tokens: { aim: 1 } })
  const rt = unit({ id: 'RT', seat: 'B', data: 'reb.u.rebel-troopers', at: [[0, 4], [-2, 4.5], [-1, 5.5], [3.5, 4]], order: 'spent', tokens: { dodge: 1, standby: 1 } })
  return game([st, rt], { pieces: [box('crate', -4, 1.5, 1, 2.5, { heightIn: 1, cover: 'light' })] })
}

describe('GOLD', () => {
  it('GOLD-001 Stormtroopers shoot Rebel Troopers in light cover (Aim, Dodge, Nimble, suppression)', () => {
    const s0 = goldenState()
    // geometry facts: ST-1 sees all four Rebels, RT-1 is the closest at 10.937", the crate obscures RT-1..RT-3 only
    const lc = losCover(s0, 'ST', 'RT')
    expect(lc.visible.sort()).toEqual(['RT.1', 'RT.2', 'RT.3', 'RT.4'])
    const t = attackTargets(s0, 'ST').find((x) => x.unitId === 'RT')!
    expect(t.distance).toBeCloseTo(10.937, 2)
    expect(t.band).toBe(2)
    expect(lc.scan.minis.filter((m) => m.obscured).map((m) => m.id).sort()).toEqual(['RT.1', 'RT.2', 'RT.3'])
    expect(lc.level).toBe('light')

    // decisions: attack.defender -> attack.pool -> attack.spend (aim) -> attack.spend (dodge, seat B)
    let r = ok(menu(s0, { action: 'attack', unitId: 'ST' }))
    expect(r.pending!.kind).toBe('attack.defender')
    expect(r.pending!.seat).toBe('A')
    r = ok(choose(r.state, 'unit:RT'))
    expect(r.pending!.kind).toBe('attack.pool')
    const pool = r.pending!.options!.find((o) => (o.data as { auto: boolean }).auto)!
    expect((pool.data as { dice: Record<string, number> }).dice).toEqual({ red: 0, black: 0, white: 4 })

    // roll: hit, blank, blank, surge
    r = ok(choose(r.state, pool.id, script(atk('white', 'hit', 'blank', 'blank', 'surge'))))
    expect(eventsOf(r, 'AttackRolled')[0]!.faces).toEqual(['hit', 'blank', 'blank', 'surge'])
    expect(r.pending!.kind).toBe('attack.spend')
    expect(r.pending!.context['step']).toBe('reroll')
    expect(r.pending!.context['perAim']).toBe(3) // 2 + Precise 1
    // the engine's auto reroll is the two blanks only (the surge converts to a hit)
    const autoOpt = r.pending!.options![0]!
    expect((autoOpt.data as { faces: string[] }).faces).toEqual(['blank', 'blank'])

    // reroll the blanks: crit, hit; then surge conversion, cover (block, surge, blank) and the Dodge decision for seat B
    r = ok(choose(r.state, autoOpt.id, script(atk('white', 'crit', 'hit'), def('white', 'block', 'surge', 'blank'))))
    expect(eventsOf(r, 'Rerolled')[0]!.faces).toEqual(['crit', 'hit'])
    expect(u(r.state, 'ST').tokens['aim'] ?? 0).toBe(0)
    const cover = eventsOf(r, 'CoverRolled')[0]!
    expect(cover.level).toBe('light')
    expect(cover.dice).toEqual(['block', 'surge', 'blank'])
    expect(cover.cancelled).toBe(1)
    expect(r.pending!.kind).toBe('attack.spend')
    expect(r.pending!.seat).toBe('B')
    expect(r.pending!.context['step']).toBe('dodge')
    expect(r.pending!.context['hits']).toBe(2)
    expect(r.pending!.context['crits']).toBe(1)

    // Dodge 1 cancels one hit; defence: 2 dice (hit + crit left), surge converts to a block by the Rebel chart
    r = ok(choose(r.state, 'dodge:1', script(def('white', 'surge', 'blank'))))
    const cmp = eventsOf(r, 'Compared')[0]!
    expect(cmp).toMatchObject({ hits: 1, crits: 1, blocks: 1, wounds: 1 })
    expect(eventsOf(r, 'DodgeSpent')[0]).toMatchObject({ unitId: 'RT', cancelled: 1 })
    expect(eventsOf(r, 'DefenceRolled')[0]!.faces).toEqual(['surge', 'blank'])
    expect(eventsOf(r, 'MiniDefeated').map((e) => e.miniId)).toEqual(['RT.2'])

    // aftermath: 0 -> 1 suppression, Standby lost, Nimble gives a Dodge back, the machine is back at the menu
    const rt = u(r.state, 'RT')
    expect(rt.suppression).toBe(1)
    expect(rt.tokens['standby'] ?? 0).toBe(0)
    expect(rt.tokens['dodge']).toBe(1)
    expect(eventsOf(r, 'SuppressionChanged')[0]).toMatchObject({ unitId: 'RT', from: 0, to: 1, reason: 'attack' })
    expect(eventsOf(r, 'KeywordFired').map((e) => e.keyword)).toContain('kw.nimble')
    expect(rt.minis.filter((m) => m.alive).map((m) => m.id)).toEqual(['RT.1', 'RT.3', 'RT.4'])
    expect(r.state.attack).toBeNull()
    expect(r.pending!.kind).toBe('action.choose')
    expect(optionIds(r.state)).toEqual([])
    void idx
  })

  it('GOLD-001 variant: a Suppressed defender improves light cover to heavy and the cover surge also cancels (COVER-007)', () => {
    const s0 = goldenState()
    u(s0, 'RT').suppression = 1
    u(s0, 'ST').tokens = {}
    let r = beginAttack(s0, 'ST', 'RT')
    r = ok(choose(r.state, r.pending!.options![0]!.id, script(atk('white', 'hit', 'hit', 'hit', 'blank'), def('white', 'block', 'surge', 'blank'))))
    expect(eventsOf(r, 'CoverRolled')[0]).toMatchObject({ level: 'heavy', cancelled: 2 })
    expect(r.pending!.context).toMatchObject({ step: 'dodge', hits: 1 })
  })

  it.todo('GOLD-002 command phase with a priority tie, orders, pools and first activations (needs the command and activation modules of M2b-flow)')
})
