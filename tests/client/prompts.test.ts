// Prompt view-models and bodies (client/ui/*): option facts come off the engine's option data; the attack prompts render from decisions
// shaped like the combat module's (band, cover, odds, dice, spends) so they light up after the merge; an unknown decision kind renders
// as a generic option list and is never a dead end.
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { Action, DecisionOption, PendingDecision } from '../../src/engine'
import { optionFacts } from '../../src/client/game/optionFacts'
import { decisionHint, decisionTitle, optionLabel } from '../../src/client/game/labels'
import { OptionList, SpendPrompt } from '../../src/client/ui/AttackPrompts'
import { ActionMenu } from '../../src/client/ui/ActionMenu'
import { DIE_FILL } from '../../src/client/dice/DiceTray'
import { playGame } from './fixtures'

const played = playGame('prompts', (s, p) => !!p && p.kind === 'action.choose' && s.round >= 1)
const state = played.state
const [atk, def] = [Object.values(state.units).find((u) => u.seat === 'A')!, Object.values(state.units).find((u) => u.seat === 'B')!]

const act = (type: string, payload: unknown): Action => ({ type, seat: 'A', decisionId: 'd:900', payload }) as unknown as Action
const opt = (id: string, a: Action, data?: Record<string, unknown>, labelKey = 'x'): DecisionOption => ({ id, labelKey, action: a, ...(data ? { data } : {}) })
const pend = (kind: string, options: DecisionOption[], context: Record<string, unknown> = {}, canPass = false): PendingDecision =>
  ({ id: 'd:900', seat: 'A', kind, window: 'attack.poolFormed', context, options, canPass }) as unknown as PendingDecision

const html = (p: PendingDecision) => renderToStaticMarkup(createElement(OptionList, { pending: p, state }))

describe('option facts', () => {
  it('a target shows band, distance, cover, expected wounds, defeat and suppression chances', () => {
    const o = opt(`unit:${def.id}`, act('attack.defender', { unitId: def.id }), { distance: 7.25, band: 2, kinds: ['ranged'], visible: 3, cover: 'light', odds: { expectedWounds: 1.84, pDefeat: 0.12, pAnyHit: 0.93 } })
    const facts = optionFacts(o, pend('attack.defender', [o]), state).map((f) => f.text)
    expect(facts).toContain('band 2')
    expect(facts).toContain('7.3"')
    expect(facts).toContain('light cover')
    expect(facts).toContain('1.8 wounds expected')
    expect(facts).toContain('12% to defeat')
    expect(facts).toContain('93% to suppress')
  })

  it('a pool shows its dice; recommended pools are marked', () => {
    const o = opt('p1', act('attack.pool', { weaponIds: { [`${atk.id}.0`]: Object.keys(state.data.weapons)[0] } }), { kind: 'ranged', dice: { red: 2, black: 0, white: 1 }, auto: true })
    const facts = optionFacts(o, pend('attack.pool', [o]), state).map((f) => f.text)
    expect(facts.join(' ')).toMatch(/2 red, 1 white/)
    expect(facts).toContain('recommended')
  })

  it('the pool order row shows counts by rank with data rank names', () => {
    const o = opt('drawPool', act('activation.choose', { drawPool: true }), { poolSize: 5, byRank: { corps: 2, commander: 1 } })
    const t = optionFacts(o, pend('activation.choose', [o]), state)[0]!.text
    expect(t).toMatch(/2 Corps/)
    expect(t).toMatch(/1 Commander/)
  })

  it('actions show speed and free; card picks show pips', () => {
    expect(optionFacts(opt('move', act('action.choose', { action: 'move' }), { free: false, maxSpeed: 2 }), pend('action.choose', []), state).map((f) => f.text)).toEqual(['speed 2'])
    expect(optionFacts(opt('claim', act('action.choose', { action: 'claim' }), { free: true }), pend('action.choose', []), state).map((f) => f.text)).toEqual(['free'])
    expect(optionFacts(opt('c', act('command.pick', { cardId: 'x' }), { pips: 1 }), pend('command.pick', []), state)[0]!.text).toBe('1 pip')
  })
})

describe('attack prompts render from decisions shaped like the combat module', () => {
  it('attack.defender: a row per target with its facts, named from data', () => {
    const a = opt(`unit:${def.id}`, act('attack.defender', { unitId: def.id }), { distance: 5, band: 1, cover: 'none', odds: { expectedWounds: 2, pDefeat: 0, pAnyHit: 0.8 } })
    const out = html(pend('attack.defender', [a], { attackerId: atk.id }, true))
    expect(out).toContain(`data-testid="opt-unit:${def.id}"`)
    expect(out).toMatch(/band 1/)
    expect(out).toMatch(/no cover/)
    expect(out).toMatch(/2.0 wounds expected/)
  })

  it('attack.pool: dice chips by colour and the recommended pool as the primary button', () => {
    const w = Object.keys(state.data.weapons)[0]!
    const a = opt('auto', act('attack.pool', { weaponIds: { m: w } }), { kind: 'ranged', dice: { red: 3, black: 0, white: 0 }, auto: true })
    const b = opt('split', act('attack.pool', { weaponIds: { m: w } }), { kind: 'ranged', dice: { red: 0, black: 2, white: 0 }, auto: false })
    const out = html(pend('attack.pool', [a, b], { attackerId: atk.id, defenderId: def.id }))
    expect(out).toContain('data-dice="red"')
    expect(out).toContain('data-dice="black"')
    expect(out).toContain(DIE_FILL.red!.bg.replace('#', '#').toLowerCase())
  })

  it('attack.spend: aim, dodge and surge choices render with their labels and any engine fact', () => {
    const spends = [
      opt('reroll:hit+blank', act('attack.spend', { choice: 'reroll', params: { dice: [0, 1] } }), { faces: ['blank', 'hit'], auto: true }),
      opt('dodge:2', act('attack.spend', { choice: 'dodge', params: { n: 2 } }), { n: 2, auto: true }),
      opt('surge:0', act('attack.spend', { choice: 'surge', params: { n: 0 } }), { n: 0 }),
      opt('reroll:done', act('attack.spend', { choice: 'rerollDone' })),
      opt('weird', act('attack.spend', { choice: 'someFutureChoice' }), { extraFact: 7 }),
    ]
    const out = renderToStaticMarkup(createElement(SpendPrompt, { pending: pend('attack.spend', spends, { step: 'reroll', aim: 1, perAim: 2, dice: ['hit', 'blank', 'surge'] }), state }))
    expect(out).toContain('data-step="reroll"')
    expect(out).toContain('data-testid="opt-reroll:hit+blank"')
    expect(out).toMatch(/Reroll blank, hit/)
    expect(out).toMatch(/Spend 2 Dodge tokens/)
    expect(out).toMatch(/Spend none/)
    expect(out).toMatch(/Keep the dice as they are/)
    expect(out).toMatch(/some Future Choice/i)
    expect(out).toMatch(/extraFact 7/)
    expect(out).toContain('data-context="aim"')
    expect(out).toContain('data-testid="tray-die"')
  })

  it('attack.allocate and attack.extraDefender name models and units from data', () => {
    const m = atk.minis[0]!
    const out = html(pend('attack.allocate', [opt('m', act('attack.allocate', { miniId: m.id }))], { purpose: 'wound', unitId: atk.id }))
    expect(out).toContain('data-testid="opt-m"')
    const extra = html(pend('attack.extraDefender', [opt('done', act('attack.extraDefender', { done: true }))]))
    expect(extra).toMatch(/No further pools/)
  })

  it('titles name what each attack decision decides', () => {
    expect(decisionTitle(pend('attack.defender', [], { attackerId: atk.id }), state)).toMatch(/choose a target/)
    expect(decisionTitle(pend('attack.pool', [], { attackerId: atk.id, defenderId: def.id }), state)).toMatch(/attack pool/)
    expect(decisionTitle(pend('attack.spend', [], { step: 'reroll' }), state)).toMatch(/Aim/)
    expect(decisionTitle(pend('attack.spend', [], { step: 'dodge' }), state)).toMatch(/dodge/)
    expect(decisionTitle(pend('attack.spend', [], { step: 'surgeTokens' }), state)).toMatch(/surge/)
    expect(decisionTitle(pend('attack.allocate', [], { unitId: atk.id }), state)).toMatch(/wounds/)
    expect(decisionHint(pend('attack.defender', []))).toBeTruthy()
  })
})

describe('never a dead end', () => {
  it('an unknown decision kind renders its options as a generic list with labels', () => {
    const a = opt('opt-x', act('keyword.choice', { option: 'left' }), undefined, 'keyword.left')
    const b = opt('opt-y', act('keyword.choice', { option: 'right' }), undefined, 'keyword.right')
    const p = pend('future.kind', [a, b])
    expect(decisionTitle(p, state)).toBe('future.kind')
    const out = html(p)
    expect(out).toContain('data-testid="opt-opt-x"')
    expect(out).toContain('data-testid="opt-opt-y"')
    expect(optionLabel(a, p, state)).toBe('Left')
  })

  it('an option with an action type the labels do not know still gets a label (its id)', () => {
    const odd = opt('weird-id', { type: 'battle.place', seat: 'A', decisionId: 'd:1', payload: { x: 1, z: 2 } } as Action)
    expect(optionLabel(odd, pend('battle.place', [odd]), state).length).toBeGreaterThan(0)
  })
})

describe('the action menu of a real activation', () => {
  it('lists the engine options as buttons and greys the withheld ones with their reason', () => {
    const p = played.pending!
    expect(p.kind).toBe('action.choose')
    const out = renderToStaticMarkup(createElement(ActionMenu, { pending: p, state }))
    for (const o of p.options!) expect(out).toContain(`data-testid="opt-${o.id}"`)
    const withheld = (p.context.withheld as { action: string; whyNot: string }[]) ?? []
    for (const w of withheld) {
      if (!(p.options ?? []).some((o) => o.id === w.action)) expect(out).toContain(`data-testid="withheld-${w.action}"`)
    }
    expect(out).toContain('End activation')
  })
})
