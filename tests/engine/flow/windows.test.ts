import { afterEach, describe, expect, it } from 'vitest'
import { getFrameResume, registerWindowOpener } from '../../../src/engine/hooks'
import { resetModules, setModule } from '../../../src/engine/modules'
import { reject, type ModuleDef } from '../../../src/engine/registry'
import { advance, edit, events, hasOption, must, newGame, optionAction, pick, place, unitBy } from './helpers'

const CARDS = ['rec.obj.close-the-pocket', 'rec.sec.bring-them-to-heel', 'rec.adv.cunning-deployment', 'rec.adv.fortified-position']

/** A fixture `card` module: answering its choice resumes the flow where the window stopped it. */
const fixtureCards: ModuleDef = {
  id: 'commandCards',
  namespaces: ['card'],
  handle: () => ({
    run(ctx) {
      ctx.emit({ type: 'CardEffect', cardId: 'fixture', detail: { answered: true } })
      getFrameResume('flow')!(ctx, 'finished', {})
    },
  }),
}

afterEach(() => {
  registerWindowOpener(null)
  resetModules()
})

describe('timing windows', () => {
  it('ACT-007 a window that raises a decision suspends the flow; answering it resumes the step that offered it', () => {
    const seen: string[] = []
    registerWindowOpener((ctx, window) => {
      seen.push(window)
      if (window !== 'activation.rallied') return false
      ctx.raise({ kind: 'card.choice', seat: 'A', window, options: [{ id: 'ok', labelKey: 'card.ok', type: 'card.choice', payload: { option: 'ok' } }] })
      return true
    })
    setModule(fixtureCards)
    const g = newGame({ generic: true, cards: CARDS, options: { autoDeploy: true } })
    const r = advance(pick(g, { A: 'neu.cc.ambush', B: 'neu.cc.push' }), (p) => p.kind === 'activation.choose')
    expect(seen).toEqual(expect.arrayContaining(['command.revealed', 'command.ordersIssued', 'activation.phaseStart']))
    const id = unitBy(r.state, 'A', 'emp.u.stormtroopers', 0).id
    const s = edit(r.state, (x) => {
      const u = x.units[id]!
      x.players.A.pool.tokens.splice(x.players.A.pool.tokens.indexOf(u.rank), 1)
      u.order.state = 'faceUp'
      place(u, 0, -10)
      x.pending = { ...x.pending!, options: [{ id: `unit:${id}`, labelKey: 'x', action: { type: 'activation.choose', seat: 'A', decisionId: x.pending!.id, payload: { unitId: id } } }] }
    })
    const started = must(s, s.pending!.options![0]!.action)
    // the window after rally opened a card choice: no action menu yet
    expect(started.pending!.kind).toBe('card.choice')
    expect(started.state.activation.current!.actionsLeft).toBe(0)
    const resumed = must(started.state, optionAction(started.state, 'ok'))
    expect(events(resumed, 'CardEffect')).toHaveLength(1)
    expect(resumed.pending!.kind).toBe('action.choose')
    expect(resumed.state.activation.current!.actionsLeft).toBe(2)
    expect(hasOption(resumed.state, 'aim')).toBe(true)
    // each window is offered once per scope: the resumed step does not offer it again
    expect(seen.filter((w) => w === 'activation.rallied')).toHaveLength(1)
    void reject
  })
})
