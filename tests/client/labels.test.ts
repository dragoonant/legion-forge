// Every displayed name comes from data: feed lines, prompt titles and option labels of a real game never show a raw record id, and
// every unit, weapon, keyword, card and battle card of the data resolves to its data name.
import { describe, expect, it } from 'vitest'
import { dataBundle, engineBundle } from '../../src/client/game/adapter'
import { cardName, decisionTitle, describeEvent, keywordLabel, optionLabel, rejectionText, unitLabel, unitTypeName, weaponName, battleCardName, setLabelPerspective, whyNotText } from '../../src/client/game/labels'
import { playGame } from './fixtures'

const RAW_ID = /\b(emp|reb|neu|rec|core|kw|lay)\.[a-z]/

describe('names from data', () => {
  const d = engineBundle().data
  it('every unit, weapon, keyword, card and battle card id resolves to a name that is not the id', () => {
    for (const id of Object.keys(d.units)) expect(unitTypeName(d, id)).not.toBe(id)
    for (const id of Object.keys(d.weapons)) expect(weaponName(d, id)).not.toBe(id)
    for (const id of Object.keys(d.cards)) expect(cardName(d, id)).not.toBe(id)
    for (const id of Object.keys(d.battleCards)) expect(battleCardName(d, id)).not.toBe(id)
    for (const id of Object.keys(d.keywords)) expect(keywordLabel(d, { id })).not.toBe(id)
  })

  it('keyword labels carry their X', () => {
    expect(keywordLabel(d, { id: 'kw.pierce', x: 2 })).toMatch(/2$/)
  })

  it('numbers duplicate units of one owner so they can be told apart', () => {
    const played = playGame('labels-units', (s) => s.round >= 1)
    for (const seat of ['A', 'B'] as const) {
      const names = Object.values(played.state.units).filter((u) => u.seat === seat).map((u) => unitLabel(played.state, u.id))
      expect(new Set(names).size).toBe(names.length)
    }
    const stormtroopers = Object.values(played.state.units).filter((u) => u.unitTypeId === 'emp.u.stormtroopers')
    if (stormtroopers.length > 1) expect(unitLabel(played.state, stormtroopers[0]!.id)).toMatch(/#1$/)
  })
})

describe('feed lines and prompts of a real game', () => {
  it('no event line, title or option label shows a raw record id, in both perspectives', () => {
    const played = playGame('labels-game', (s) => s.round >= 3)
    for (const persp of [null, 'A'] as const) {
      setLabelPerspective(persp)
      for (const ev of played.events) {
        const line = describeEvent(ev, played.state)
        if (line) expect(line, `${ev.type}: ${line}`).not.toMatch(RAW_ID)
      }
    }
    setLabelPerspective(null)
  })

  it('every decision kind the bots met has a title and every option a label, none a raw id', () => {
    const kinds = new Set<string>()
    let checked = 0
    playGame('labels-prompts', (s, p) => {
      if (!p) return false
      kinds.add(p.kind)
      const title = decisionTitle(p, s)
      expect(title, p.kind).not.toBe(p.kind)
      expect(title).not.toMatch(RAW_ID)
      for (const o of p.options ?? []) {
        const label = optionLabel(o, p, s)
        expect(label.length, `${p.kind}/${o.id}`).toBeGreaterThan(0)
        expect(label, `${p.kind}/${o.id}: ${label}`).not.toMatch(RAW_ID)
        checked++
      }
      return s.round >= 3
    })
    expect(kinds.has('command.pick')).toBe(true)
    expect(kinds.has('action.choose')).toBe(true)
    expect(checked).toBeGreaterThan(50)
  })

  it('"You" takes the second-person verb', () => {
    const played = playGame('labels-you', (s) => s.round >= 2)
    setLabelPerspective('A')
    const lines = played.events.map((e) => describeEvent(e, played.state)).filter((l): l is string => !!l)
    expect(lines.some((l) => /^You (are|have|score|gain|pass)\b/.test(l))).toBe(true)
    expect(lines.some((l) => /^You (is|has|scores|gains|passes)\b/.test(l))).toBe(false)
    setLabelPerspective(null)
  })
})

describe('texts', () => {
  it('every withheld reason the engine can give has a sentence; rejections read as sentences', () => {
    for (const code of ['undeployed', 'engaged', 'notEngaged', 'noActions', 'alreadyUsed', 'noTarget', 'nothingToRecover', 'notTrooper', 'hasToken', 'afterAttack', 'afterWithdraw', 'afterStandby', 'speed', 'noClimbable', 'panicked', 'notAvailable', 'used', 'unavailable']) {
      expect(whyNotText(code)).not.toBe(code)
    }
    expect(rejectionText({ code: 'E_TERRAIN', reason: 'the tool crosses impassable terrain' })).toBe('the tool crosses impassable terrain')
    expect(rejectionText({ code: 'E_TODO', reason: '' })).toMatch(/not available/)
  })

  it('the data bundle is the one the engine bundle snapshots', () => {
    expect(Object.keys(engineBundle().data.units).length).toBe(Object.keys(dataBundle().units).length)
  })
})
