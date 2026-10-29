import type { DataBundle, DataFile, DataRecord, DefRef, Id } from './types'
import { MANIFEST } from './manifest'
import { codesIn, recordsOf } from './refs'

export const DATA_VERSION = '0.1.0'
export type { DataBundle } from './types'

/**
 * Code hooks the data references, derived from the data itself (no generated file, so a stage adding data needs no shared-file
 * edit); the engine registers an implementation for each (`src/engine/code-hooks.ts`, M2).
 */
export const CODE_HOOKS: readonly { name: string; usedBy: string[] }[] = (() => {
  const usage = new Map<string, Set<string>>()
  for (const f of MANIFEST) {
    for (const rec of recordsOf(f)) {
      for (const name of codesIn(rec)) usage.set(name, (usage.get(name) ?? new Set()).add(String(rec.id)))
    }
  }
  return [...usage.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, ids]) => ({ name, usedBy: [...ids].sort() }))
})()

const MAPS: Partial<Record<DefRef, keyof DataBundle>> = {
  'core#token': 'tokens', 'core#base': 'bases', 'core#silhouette': 'silhouettes', 'core#action': 'actions', 'keyword#keyword': 'keywords',
  'army#unit': 'units', 'army#weapon': 'weapons', 'army#upgrade': 'upgrades', 'army#commandCard': 'commandCards', 'army#armyList': 'armyLists',
  'battle#battleCard': 'battleCards', 'battle#map': 'maps', 'layout#layout': 'layouts',
}
const BY_KEY: Partial<Record<DefRef, keyof DataBundle>> = { 'core#rank': 'ranks', 'core#format': 'formats', 'core#unitType': 'unitTypes', 'core#slot': 'slots', 'army#faction': 'factions' }

/** Group already-validated files into a bundle. Throws when a singleton record is missing. */
export function bundleFromFiles(files: readonly DataFile[]): DataBundle {
  const b = {
    dataVersion: DATA_VERSION, ranks: {}, formats: {}, tokens: {}, bases: {}, silhouettes: {}, actions: {}, unitTypes: {}, slots: {}, keywords: {},
    factions: {}, units: {}, weapons: {}, upgrades: {}, commandCards: {}, armyLists: {}, battleCards: {}, maps: {}, layouts: {}, byId: {},
  } as Record<string, unknown> & { byId: Record<Id, DataRecord> }
  for (const f of files) {
    for (const rec of recordsOf(f)) {
      const r = rec as unknown as DataRecord & { id: Id; key?: string }
      b.byId[r.id] = r
      if (f.def === 'core#dice') b.dice = r
      else if (f.def === 'core#constants') b.constants = r
      else if (f.def === 'core#movementTool') b.movementTool = r
      else if (BY_KEY[f.def]) (b[BY_KEY[f.def]!] as Record<string, unknown>)[r.key ?? r.id] = r
      else if (MAPS[f.def]) (b[MAPS[f.def]!] as Record<string, unknown>)[r.id] = r
    }
  }
  for (const k of ['dice', 'constants', 'movementTool'] as const) if (!b[k]) throw new Error(`data bundle is missing ${k}`)
  return b as unknown as DataBundle
}

let cached: DataBundle | undefined
/** The whole content bundle (module-level cache; the data is immutable). */
export function loadBundle(): DataBundle {
  return (cached ??= bundleFromFiles(MANIFEST))
}
