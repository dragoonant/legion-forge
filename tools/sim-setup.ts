// Game set-ups the sim rotates through (shared by tools/sim.ts and tests): the four Recon lists, the Recon battle deck.
import { bundleFromData } from '../src/engine/bundle'
import { rosterFromList } from '../src/engine/setup'
import { loadBundle } from '../src/data'
import type { EngineBundle, GameSetup } from '../src/engine'
import { RULESET } from '../src/engine/bundle'

export const EMPIRE_LISTS = ['emp.list.recon-a', 'emp.list.recon-b']
export const REBEL_LISTS = ['reb.list.recon-a', 'reb.list.recon-b']

export type Matchup = 'mirror' | 'main' | 'all'

let cached: EngineBundle | null = null
export function simBundle(): EngineBundle {
  return (cached ??= bundleFromData(loadBundle()))
}

/** Battle card ids by type for the format, sorted. */
export function reconCards(bundle: EngineBundle): { objective: string[]; secondary: string[]; advantage: string[] } {
  const all = Object.values(bundle.data.battleCards).map((r) => r as unknown as { id: string; type: string; format: string })
  const of = (type: string) => all.filter((c) => c.format === 'recon' && c.type === type).map((c) => c.id).sort()
  return { objective: of('objective'), secondary: of('secondary'), advantage: of('advantage') }
}

/**
 * Game g: the matchup rotates (mirror: Empire vs Empire / Rebels vs Rebels; main: Empire vs Rebels; all: all of them), the seats
 * swap on odd rounds, and the mission rotates through objective x secondary x advantage pair. `battle`: card ids to restrict to, or all.
 */
export function simSetupFor(bundle: EngineBundle, opts: { matchup?: Matchup; battle?: string[] | 'all'; rounds?: number } = {}): (game: number) => GameSetup {
  const matchup = opts.matchup ?? 'all'
  const cards = reconCards(bundle)
  const pairs: [string, string][] = []
  const emp = EMPIRE_LISTS
  const reb = REBEL_LISTS
  if (matchup === 'main' || matchup === 'all') for (const a of emp) for (const b of reb) pairs.push([a, b])
  if (matchup === 'mirror' || matchup === 'all') {
    for (const a of emp) for (const b of emp) pairs.push([a, b])
    for (const a of reb) for (const b of reb) pairs.push([a, b])
  }
  const restrict = opts.battle && opts.battle !== 'all' ? opts.battle : null
  const only = (ids: string[]) => (restrict ? ids.filter((i) => restrict.includes(i)) : ids)
  const objs = only(cards.objective).length ? only(cards.objective) : cards.objective
  const secs = only(cards.secondary).length ? only(cards.secondary) : cards.secondary
  const advs = only(cards.advantage).length >= 2 ? only(cards.advantage) : cards.advantage
  const d = bundle.data
  return (game) => {
    const [la, lb] = pairs[game % pairs.length]!
    const swap = Math.floor(game / pairs.length) % 2 === 1
    const obj = objs[game % objs.length]!
    const sec = secs[Math.floor(game / objs.length) % secs.length]!
    const a1 = advs[game % advs.length]!
    const a2 = advs[(game + 1) % advs.length]!
    return {
      ruleset: RULESET,
      format: 'recon',
      battle: { cards: [obj, sec, a1, a2] },
      armies: swap ? { A: rosterFromList(d, lb), B: rosterFromList(d, la) } : { A: rosterFromList(d, la), B: rosterFromList(d, lb) },
      ...(opts.rounds !== undefined ? { options: { maxRounds: opts.rounds } } : {}),
    }
  }
}
