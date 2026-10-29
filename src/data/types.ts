/**
 * Hand-written mirror of the JSON Schemas in `schema/` (docs/spec/20-data-schema.md). The schemas are the contract;
 * `tests/data/schemas.test.ts` keeps the two honest by validating every record. Effect grammar nodes are typed loosely
 * (the engine narrows them when it implements a verb); everything else is exact.
 */
export type Id = string
export type Key = string

export interface Source {
  doc: string
  page?: number | string
  url?: string
  kind: 'primary' | 'fan'
  checked?: string
  covers?: string[]
}
export type Sources = Source | Source[]

export type Band = 0 | 1 | 2 | 3 | 4 | 5 | 'beyond'
export interface DicePool { red: number; black: number; white: number }
export type DefenceDie = 'red' | 'white'
export interface SurgeChart { attack: null | 'hit' | 'crit'; defence: null | 'block' }
export interface KeywordRef { id: Id; x?: number; param?: string }
export interface Vec2 { x: number; z: number }
export type Polygon = Vec2[]
export type ForceAffinity = 'dark' | 'light' | null

// ---- effects grammar (docs/spec/20-data-schema.md section 5)
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
export interface CodeRef { code: string; params?: Record<string, Json> }
export interface Unimplemented { unimplemented: string }
export type Condition = Record<string, Json>
export type Verb = CodeRef | Record<string, Json>
export interface Trigger {
  trigger: { window?: string; event?: string; self?: boolean; aura?: { range: Band; side: 'ally' | 'enemy'; filter?: Record<string, Json>; excludeSelf?: boolean } }
  when?: Condition
  do: Verb[]
  scope?: string | { pool: 'all' | 'otherRangedWeapons' | 'thisWeapon' }
  duration?: 'instant' | 'attack' | 'activation' | 'round' | 'game' | 'whileInPlay'
  optional?: boolean
  limit?: string | { perRound: number } | { perGame: number }
}
export interface Modifier {
  modifier: string
  op: 'add' | 'set' | 'min' | 'max'
  value: number | string | boolean | Record<string, Json>
  then?: { addResult: 'block' | 'hit' | 'crit'; n: number }
  when?: Condition
  scope?: string | { pool: 'all' | 'otherRangedWeapons' | 'thisWeapon' }
  duration?: string
  token?: Id
}
export interface ActionGrant { id: Id; name: string; kind: 'card' | 'free'; exhaust?: string; when?: Condition; do?: Verb[]; effects?: Effect[] }
export interface Grant { grant: { action: ActionGrant } | { slot: Key } }
export interface Native { native: string; params?: Record<string, Json> }
export type Effect = Trigger | Modifier | Grant | Native | CodeRef | Unimplemented

// ---- core
export interface DieDef<F extends string> { sides: number; faces: Record<F, number> }
export interface DiceData {
  id: Id
  attack: { red: DieDef<'hit' | 'crit' | 'surge' | 'blank'>; black: DieDef<'hit' | 'crit' | 'surge' | 'blank'>; white: DieDef<'hit' | 'crit' | 'surge' | 'blank'>; faceOrder: string[] }
  defence: { red: DieDef<'block' | 'surge' | 'blank'>; white: DieDef<'block' | 'surge' | 'blank'>; faceOrder: string[] }
  ladder: { attack: string[]; defence: string[] }
  source: Sources
}
export interface RankData { id: Id; key: Key; name: string; orderToken: Id; icon: string; source: Sources }
export interface FormatData {
  id: Id; name: string; maxPoints: number
  ranks: Record<'commander' | 'operative' | 'corps' | 'special-forces' | 'support' | 'heavy', [number, number]>
  table: { x: number; z: number }; rounds: number; instantWinVp: number; deck: 'fixed' | 'perPlayer'
  bluePlayer: 'redDefenceDie' | 'fourBlackDice'; edgeChoice: 'any' | 'long'; missionModification: boolean; playable: boolean; source: Sources
}
export interface TokenData { id: Id; name: string; lifetime: 'endPhase' | 'activation' | 'untilRemoved' | 'game'; cap?: number; sizeIn?: number; kind: 'unit' | 'objective' | 'advantage' | 'card'; source: Sources }
export interface BaseData { id: Id; name: string; diameterMm: number; notched: boolean; silhouette: Id; source: Sources }
export interface SilhouetteData { id: Id; name: string; radiusIn: number; heightIn: number; samples: { rings: number; perRing: number; axis?: boolean }; source: Sources }
export interface ConstantsData { id: Id; values: Record<string, number>; sources: Record<string, Sources> }
export interface MovementToolData {
  id: Id; speeds: Record<'1' | '2' | '3', { segments: [number, number]; hingeAt: number }>
  widthIn: number; prongWidthIn: number; hingeLimitDeg: number; source: Sources
}
export interface ActionData { id: Id; name: string; free: boolean; repeat: 'once' | 'unlimited'; restrictions: Condition[]; text?: string; source: Sources }
export interface UnitTypeData { id: Id; key: Key; name: string; base: Id; silhouette: Id; flags: { barricadeCover: boolean; attackAfterWithdraw: boolean; trooper: boolean }; source: Sources }
export interface SlotData { id: Id; key: Key; name: string; icon: string; source: Sources }
export interface KeywordData {
  id: Id; name: string; kind: 'unit' | 'weapon' | 'card'; param: 'none' | 'x' | 'rank' | 'unitType' | 'unit'
  effects: Effect[]; text: string; source: Sources
}

// ---- armies
export interface FactionData { id: Key; name: string; prefix: Key; playable: boolean; forceAffinity: ForceAffinity; icon: string; source: Sources }
export interface UnitData {
  id: Id; name: string; subtitle: string | null; faction: Key; rank: Key; unitType: Key; unique: boolean; points: number; minis: number; wounds: number
  defence: DefenceDie; courage: number | null; speed: 1 | 2 | 3; surge: SurgeChart; base: Id; weapons: Id[]; keywords: KeywordRef[]; upgradeBar: Key[]
  forceAffinity: ForceAffinity; figure: { archetype: Key }; source: Sources
}
export interface WeaponData { id: Id; name: string; range: { min: number; max: number }; dice: DicePool; keywords: KeywordRef[]; flavour: Key; source: Sources }
export interface UpgradeRestrictions { units?: Id[]; unitTypes?: string[]; ranks?: Key[]; faction?: Key; forceAffinity?: 'dark' | 'light'; hasKeyword?: Id; not?: Record<string, Json> }
export interface UpgradeSide { name: string; keywords: KeywordRef[]; weapons: Id[]; effects: Effect[] }
export interface UpgradeData {
  id: Id; name: string; slot: Key; points: number; unique: boolean; restrictions?: UpgradeRestrictions; forceAffinity?: ForceAffinity
  addsMinis?: { count: number; label: string; weapon?: Id; leader?: boolean; persistent?: { keywords: KeywordRef[]; modifiers: Modifier[] } }
  grantsSlots?: Key[]; keywords?: KeywordRef[]; exhaust: 'none' | 'exhaust' | 'expend'; effects: Effect[]
  sides?: UpgradeSide[]; flip?: { window: string; optional: boolean }; text: string; source: Sources
}
export interface CommandCardData {
  id: Id; name: string; pips: number; faction: Key | null; restriction: null | { units: Id[]; op: 'or' | 'and' }
  orders: { named?: Id[]; count: number; filter?: { ranks?: Key[]; unitTypes?: string[]; units?: Id[] } }
  keywords?: ('permanent' | 'divulge')[]; divulge?: { window: string; effects: Effect[] }; returnsToHand?: boolean
  effects: Effect[]; text: string; source: Sources
}
export interface ArmyListData {
  id: Id; name: string; faction: Key; format: Key; assumedSet: string; units: { unit: Id; upgrades: Id[] }[]
  commandHand: Id[]; points: number; source: Sources
}

// ---- battle and layouts
export interface BattleCardData {
  id: Id; name: string; type: 'objective' | 'secondary' | 'advantage'; format: Key; faction: Key | null; map?: Id
  setup: Record<string, Json>[]; scoring: Record<string, Json>[]; special: Effect[]
  grants?: { claim?: { asset: string; ownerOnly: boolean; maxHeld: number; eligible?: Record<string, Json> } }
  text: string; source: Sources
}
export interface MapData {
  id: Id; name: string; format: Key; territories: { red: Polygon[]; blue: Polygon[] }
  pois: { id: Key; at: Vec2; tags: string[] }[]; source: Sources
}
export interface LayoutPiece {
  id: Key; kind: 'area' | 'obstacle' | 'barricade' | 'building'; footprint: Polygon; heightIn: number
  cover: 'none' | 'light' | 'heavy'; blocksLos: boolean; movement: 'open' | 'difficult' | 'impassable'; climbable: boolean
}
export interface LayoutData { id: Id; name: string; format: Key; size: { x: number; z: number }; pieces: LayoutPiece[]; source: Sources }

// ---- manifest and bundle
export type SchemaName = 'common' | 'core' | 'keyword' | 'army' | 'battle' | 'layout'
/** `<schema>#<def>`, for example `core#dice` or `army#unit`. */
export type DefRef =
  | 'core#dice' | 'core#rank' | 'core#format' | 'core#token' | 'core#base' | 'core#silhouette' | 'core#constants' | 'core#movementTool'
  | 'core#action' | 'core#unitType' | 'core#slot' | 'keyword#keyword'
  | 'army#faction' | 'army#unit' | 'army#weapon' | 'army#upgrade' | 'army#commandCard' | 'army#armyList'
  | 'battle#battleCard' | 'battle#map' | 'layout#layout'
export interface DataFile { path: string; def: DefRef; array: boolean; data: unknown }

export type DataRecord =
  | DiceData | RankData | FormatData | TokenData | BaseData | SilhouetteData | ConstantsData | MovementToolData | ActionData | UnitTypeData | SlotData
  | KeywordData | FactionData | UnitData | WeaponData | UpgradeData | CommandCardData | ArmyListData | BattleCardData | MapData | LayoutData

export interface DataBundle {
  dataVersion: string
  dice: DiceData
  constants: ConstantsData
  movementTool: MovementToolData
  ranks: Record<Key, RankData>
  formats: Record<Key, FormatData>
  tokens: Record<Id, TokenData>
  bases: Record<Id, BaseData>
  silhouettes: Record<Id, SilhouetteData>
  actions: Record<Id, ActionData>
  unitTypes: Record<Key, UnitTypeData>
  slots: Record<Key, SlotData>
  keywords: Record<Id, KeywordData>
  factions: Record<Key, FactionData>
  units: Record<Id, UnitData>
  weapons: Record<Id, WeaponData>
  upgrades: Record<Id, UpgradeData>
  commandCards: Record<Id, CommandCardData>
  armyLists: Record<Id, ArmyListData>
  battleCards: Record<Id, BattleCardData>
  maps: Record<Id, MapData>
  layouts: Record<Id, LayoutData>
  /** Every record by id (factions, ranks, formats, unit types and slots are also reachable by their short key above). */
  byId: Record<Id, DataRecord>
}
