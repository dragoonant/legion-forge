// Glue between the data bundle, the engine bundle and a GameSetup. `bundleFromData` and `rosterFromList` live in the engine; this
// file caches the bundles and assembles the setup the start screen produces. Pure functions: safe in node tests.
import { loadBundle, type DataBundle } from '@/data'
import type { EngineBundle, GameSetup, Seat } from '@/engine'
import { rosterFromList } from '@/engine/setup'
import { RULESET, bundleFromData } from '@/engine/bundle'

let cached: DataBundle | null = null
export function dataBundle(): DataBundle {
  cached ??= loadBundle()
  return cached
}

let cachedEngine: EngineBundle | null = null
export function engineBundle(): EngineBundle {
  cachedEngine ??= bundleFromData(dataBundle())
  return cachedEngine
}

/** What a seat brings: one of the pre-built Recon army lists. */
export interface SeatBuild {
  listId: string
}

export interface SetupOptions {
  /** battle card ids to force (the rest are drawn by the engine from the seed) */
  battle?: string[] | null
  /** the engine answers those set-up decisions; deployment and the edge stay the players' */
  options?: GameSetup['options']
}

export function buildGameSetup(builds: Record<Seat, SeatBuild>, opts: SetupOptions = {}): GameSetup {
  const data = engineBundle().data
  return {
    ruleset: RULESET,
    format: 'recon',
    battle: { cards: opts.battle ?? [] },
    armies: { A: rosterFromList(data, builds.A.listId), B: rosterFromList(data, builds.B.listId) },
    ...(opts.options ? { options: opts.options } : {}),
  }
}

export interface ListRow {
  id: string
  name: string
  faction: string
  factionName: string
  points: number
}

/** Every playable Recon list, factions in data order. */
export function reconLists(b: DataBundle = dataBundle()): ListRow[] {
  return Object.values(b.armyLists)
    .filter((l) => l.format === 'recon' && (b.factions[l.faction]?.playable ?? true))
    .sort((a, c) => (a.id < c.id ? -1 : 1))
    .map((l) => ({ id: l.id, name: l.name, faction: l.faction, factionName: b.factions[l.faction]?.name ?? l.faction, points: l.points }))
}

export function factionsWithLists(b: DataBundle = dataBundle()): { key: string; name: string }[] {
  const seen = new Map<string, string>()
  for (const l of reconLists(b)) seen.set(l.faction, l.factionName)
  return [...seen.entries()].map(([key, name]) => ({ key, name })).sort((a, c) => (a.key < c.key ? -1 : 1))
}

/** A list id from a full id, a faction prefix (`emp`) or a faction key (`empire`): the first matching list. */
export function resolveList(b: DataBundle, raw: string | undefined | null, fallbackFaction: string): ListRow {
  const rows = reconLists(b)
  const want = (raw ?? '').trim()
  const hit = rows.find((r) => r.id === want) ?? rows.find((r) => r.faction === want || r.id.startsWith(`${want}.`) || r.id.startsWith(want))
  return hit ?? rows.find((r) => r.faction === fallbackFaction) ?? rows[0]!
}

export function defaultLists(b: DataBundle = dataBundle()): Record<Seat, string> {
  const rows = reconLists(b)
  const emp = rows.find((r) => r.faction === 'empire') ?? rows[0]!
  const reb = rows.find((r) => r.faction === 'rebels') ?? rows[1] ?? rows[0]!
  return { A: emp.id, B: reb.id }
}

export function objectiveCards(b: DataBundle = dataBundle()): { id: string; name: string; text: string }[] {
  return Object.values(b.battleCards)
    .filter((c) => c.format === 'recon' && c.type === 'objective')
    .sort((a, c) => (a.id < c.id ? -1 : 1))
    .map((c) => ({ id: c.id, name: c.name, text: c.text }))
}
