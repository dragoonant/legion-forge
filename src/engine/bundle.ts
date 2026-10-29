// EngineBundle from validated data (docs/spec/00-architecture.md "bundle.ts"). The engine never imports src/data at runtime
// (tests/engine/boundaries.test.ts), so the caller loads the data (`loadBundle()` from '@/data') and passes it in:
//
//   const bundle = bundleFromData(loadBundle())
//
// Mapping: dice via compileDice; constants = core/constants.json `values`; base radius = mm / 25.4 / 2 (exact, 8.1 rounding
// happens on distances); silhouettes keep their sample layout; layouts become TableLayouts; units, weapons, keywords, upgrades,
// command cards and battle cards are the data records themselves (read through the typed accessors below). The extra
// tables the flow modules need (formats, maps, unit types, actions, ranks, tokens, army lists, factions) ride along.
import type {
  ActionData,
  ArmyListData,
  BattleCardData,
  CommandCardData,
  DataBundle,
  FactionData,
  FormatData,
  KeywordData,
  MapData,
  RankData,
  TokenData,
  UnitData,
  UnitTypeData,
  UpgradeData,
  WeaponData,
} from '../data/types'
import { compileDice } from './dice'
import { baseRadiusIn } from './footprint'
import type {
  DiceDef,
  EngineBundle,
  GameData,
  GameState,
  MovementToolDef,
  RuleConstants,
  RuntimeBase,
  RuntimeRecord,
  RuntimeSilhouette,
  TableLayout,
} from './types'
import { EngineInvariantError } from './state'

export type { EngineBundle } from './types'

/** The ruleset string of `GameSetup.ruleset` for the data this engine ships (one value in v1). */
export const RULESET = 'amg-crb-2026-06-17'

const asRecords = <T>(m: Record<string, T>): Record<string, RuntimeRecord> => m as unknown as Record<string, RuntimeRecord>

export function bundleFromData(db: DataBundle): EngineBundle {
  const bases: Record<string, RuntimeBase> = {}
  for (const b of Object.values(db.bases)) {
    bases[b.id] = { id: b.id, radius: baseRadiusIn(b.diameterMm), notched: b.notched, silhouette: b.silhouette }
  }
  const silhouettes: Record<string, RuntimeSilhouette> = {}
  for (const s of Object.values(db.silhouettes)) {
    silhouettes[s.id] = { id: s.id, radius: s.radiusIn, height: s.heightIn, samples: { rings: s.samples.rings, perRing: s.samples.perRing, axis: s.samples.axis ?? false } }
  }
  const layouts: Record<string, TableLayout> = {}
  for (const l of Object.values(db.layouts)) layouts[l.id] = { id: l.id, size: { ...l.size }, pieces: l.pieces.map((p) => ({ ...p })) }
  const mt = db.movementTool
  const tool: MovementToolDef = { speeds: mt.speeds, widthIn: mt.widthIn, prongWidthIn: mt.prongWidthIn, hingeLimitDeg: mt.hingeLimitDeg }
  const data: GameData = {
    dataVersion: db.dataVersion,
    ruleset: RULESET,
    dice: compileDice(db.dice as unknown as DiceDef),
    constants: { ...db.constants.values } as RuleConstants,
    tool,
    bases,
    silhouettes,
    layouts,
    units: asRecords(db.units),
    weapons: asRecords(db.weapons),
    keywords: asRecords(db.keywords),
    upgrades: asRecords(db.upgrades),
    cards: asRecords(db.commandCards),
    battleCards: asRecords(db.battleCards),
    formats: asRecords(db.formats),
    maps: asRecords(db.maps),
    unitTypes: asRecords(db.unitTypes),
    actions: asRecords(db.actions),
    ranks: asRecords(db.ranks),
    tokens: asRecords(db.tokens),
    armyLists: asRecords(db.armyLists),
    factions: asRecords(db.factions),
  }
  return { data }
}

// ---------------------------------------------------------------------------
// Typed accessors over the snapshot (the engine reads records through these; unknown ids are programmer errors)
// ---------------------------------------------------------------------------

function need<T>(table: Record<string, RuntimeRecord> | undefined, id: string, what: string): T {
  const r = table?.[id]
  if (!r) throw new EngineInvariantError(`unknown ${what} ${id}`)
  return r as unknown as T
}

export const unitData = (d: GameData, id: string): UnitData => need<UnitData>(d.units, id, 'unit')
export const weaponData = (d: GameData, id: string): WeaponData => need<WeaponData>(d.weapons, id, 'weapon')
export const upgradeData = (d: GameData, id: string): UpgradeData => need<UpgradeData>(d.upgrades, id, 'upgrade')
export const keywordData = (d: GameData, id: string): KeywordData => need<KeywordData>(d.keywords, id, 'keyword')
export const cardData = (d: GameData, id: string): CommandCardData => need<CommandCardData>(d.cards, id, 'command card')
export const battleCardData = (d: GameData, id: string): BattleCardData => need<BattleCardData>(d.battleCards, id, 'battle card')
export const formatData = (d: GameData, id: string): FormatData => need<FormatData>(d.formats, id, 'format')
export const mapData = (d: GameData, id: string): MapData => need<MapData>(d.maps, id, 'map')
export const armyListData = (d: GameData, id: string): ArmyListData => need<ArmyListData>(d.armyLists, id, 'army list')
export const factionData = (d: GameData, id: string): FactionData => need<FactionData>(d.factions, id, 'faction')

export function unitTypeData(d: GameData, key: string): UnitTypeData | undefined {
  return d.unitTypes?.[key] as unknown as UnitTypeData | undefined
}
export function actionData(d: GameData, id: string): ActionData | undefined {
  return d.actions?.[id] as unknown as ActionData | undefined
}
export function rankData(d: GameData, key: string): RankData | undefined {
  return d.ranks?.[key] as unknown as RankData | undefined
}
export function tokenData(d: GameData): TokenData[] {
  return Object.values(d.tokens ?? {}) as unknown as TokenData[]
}

/** Points of a roster entry: the unit plus its upgrades. */
export function entryPoints(d: GameData, unit: string, upgrades: readonly string[]): number {
  return unitData(d, unit).points + upgrades.reduce((s, u) => s + upgradeData(d, u).points, 0)
}

/** Points a unit on the table is worth (for the tiebreak: points of own defeated units, upgrades included). */
export function unitPoints(state: GameState, unitId: string): number {
  const u = state.units[unitId]
  if (!u) throw new EngineInvariantError(`unknown unit ${unitId}`)
  return entryPoints(state.data, u.unitTypeId, u.upgrades)
}
