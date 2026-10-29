// Menu data and screens: the four Recon lists, list resolution from URL values, the setup the start screen builds is legal for the
// engine, the start screen carries the fan-project notice, the briefing lists both armies from data, unit cards read their data.
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createGame } from '../../src/engine'
import { setupProblems } from '../../src/engine/setup'
import { buildGameSetup, dataBundle, defaultLists, engineBundle, factionsWithLists, objectiveCards, reconLists, resolveList } from '../../src/client/game/adapter'
import { useSession, seatsFor, startFromParams } from '../../src/client/store/session'
import { useGame } from '../../src/client/store/game'
import { parseParams } from '../../src/client/params'
import { Briefing } from '../../src/client/ui/Briefing'
import { StartScreen } from '../../src/client/ui/StartScreen'
import { UnitCardView, cardModel } from '../../src/client/ui/UnitCard'
import { installStorage } from './fixtures'

describe('army lists and setup', () => {
  const b = dataBundle()
  it('there are four Recon lists, two per faction', () => {
    const rows = reconLists(b)
    expect(rows).toHaveLength(4)
    expect(factionsWithLists(b).map((f) => f.key)).toEqual(['empire', 'rebels'])
    expect(rows.filter((r) => r.faction === 'empire')).toHaveLength(2)
  })

  it('URL values resolve to lists: a full id, a faction prefix, a faction key, junk falls back', () => {
    expect(resolveList(b, 'reb.list.recon-b', 'empire').id).toBe('reb.list.recon-b')
    expect(resolveList(b, 'emp', 'rebels').faction).toBe('empire')
    expect(resolveList(b, 'rebels', 'empire').faction).toBe('rebels')
    expect(resolveList(b, 'nonsense', 'rebels').faction).toBe('rebels')
  })

  it('every pairing of the four lists is a setup the engine accepts and plays', () => {
    const rows = reconLists(b)
    for (const a of rows) {
      for (const c of rows) {
        const setup = buildGameSetup({ A: { listId: a.id }, B: { listId: c.id } })
        expect(setupProblems(engineBundle().data, setup)).toEqual([])
      }
    }
    const d = defaultLists(b)
    const g = createGame(buildGameSetup({ A: { listId: d.A }, B: { listId: d.B } }), 'screens', engineBundle())
    expect(g.pending).not.toBeNull()
  })

  it('a chosen objective is forced; the others are drawn', () => {
    const [first] = objectiveCards(b)
    expect(objectiveCards(b).length).toBeGreaterThanOrEqual(3)
    const d = defaultLists(b)
    const g = createGame(buildGameSetup({ A: { listId: d.A }, B: { listId: d.B } }, { battle: [first!.id] }), 'forced-objective', engineBundle())
    expect(g.state.origin.setup.battle).toEqual({ cards: [first!.id] })
  })
})

describe('session', () => {
  it('seats follow the chosen human seat', () => {
    expect(seatsFor('A')).toEqual({ A: 'human', B: 'bot' })
    expect(seatsFor('B')).toEqual({ A: 'bot', B: 'human' })
  })

  it('?test=1 starts a battle from the URL: armies, seats, seed and speed', () => {
    installStorage()
    startFromParams(parseParams('?test=1&seats=bot,bot&seed=url-seed&armies=emp.list.recon-b,reb.list.recon-b'))
    const s = useSession.getState()
    expect(s.screen).toBe('battle')
    expect(s.builds.A.listId).toBe('emp.list.recon-b')
    expect(s.builds.B.listId).toBe('reb.list.recon-b')
    const g = useGame.getState()
    expect(g.meta?.seed).toBe('url-seed')
    expect(g.seats).toEqual({ A: 'bot', B: 'bot' })
    expect(g.viewer).toBe('A')
    useGame.getState().reset()
    useSession.setState({ screen: 'start' })
  })
})

describe('screens', () => {
  it('the start screen names both sides from data, the lists and carries the fan-project notice', () => {
    const out = renderToStaticMarkup(createElement(StartScreen))
    expect(out).toContain('data-testid="start-screen"')
    expect(out).toMatch(/Unofficial, non-commercial fan project/)
    expect(out).toContain('Galactic Empire')
    expect(out).toContain('Rebel Alliance')
    expect(out).toContain('data-testid="list-A-emp.list.recon-a"')
    expect(out).toContain('data-testid="start-battle"')
    expect(out).toContain('data-testid="watch-bots"')
  })

  it('the briefing lists every unit of both armies from data', () => {
    const out = renderToStaticMarkup(createElement(Briefing))
    expect(out).toContain('data-testid="briefing"')
    expect(out).toContain('data-testid="roster-A"')
    expect(out).toContain('data-testid="roster-B"')
    expect(out).toContain('Darth Vader')
    expect(out).toContain('begin-battle')
  })

  it('a unit card model reads stats, weapons and upgrades from the data records', () => {
    const d = engineBundle().data
    const m = cardModel(d, 'emp.u.stormtroopers', ['emp.up.stormtrooper-squad', 'emp.up.dlt19-stormtrooper'])
    expect(m.name).toBe('Stormtroopers')
    expect(m.speed).toBe(2)
    expect(m.courage).toBe(1)
    expect(m.weapons.length).toBeGreaterThanOrEqual(2)
    expect(m.weapons.every((w) => Object.values(w.dice).some((n) => n > 0))).toBe(true)
    expect(m.upgrades.map((u) => u.name).length).toBe(2)
    expect(m.points).toBeGreaterThan(0)
    const out = renderToStaticMarkup(createElement(UnitCardView, { d, typeId: 'emp.u.stormtroopers', upgrades: ['emp.up.stormtrooper-squad'] }))
    expect(out).toContain('Stormtroopers')
    expect(out).toContain('data-weapon=')
  })
})
