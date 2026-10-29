// Shared fixtures for the engine tests: the real dice and movement-tool data, synthetic constants, bases, silhouettes and
// terrain, and a bundle for the contract tests. Rules tests use synthetic geometry so they survive data corrections.
import diceJson from '../../src/data/core/dice.json'
import toolJson from '../../src/data/core/movement-tool.json'
import { compileDice } from '../../src/engine/dice'
import { baseRadiusIn } from '../../src/engine/footprint'
import type { LosBody } from '../../src/engine/los'
import { compileTable, openTable } from '../../src/engine/table'
import type { Mover, Obstacle, ToolWorld } from '../../src/engine/tool'
import type {
  DiceDef,
  EngineBundle,
  GameData,
  GameSetup,
  MovementToolDef,
  RuleConstants,
  TableDef,
  TerrainPieceDef,
  Vec2,
} from '../../src/engine/types'

export const DICE_DEF = diceJson as unknown as DiceDef
export const TABLES = compileDice(DICE_DEF)

export const TOOL: MovementToolDef = {
  speeds: toolJson.speeds as MovementToolDef['speeds'],
  widthIn: toolJson.widthIn,
  prongWidthIn: toolJson.prongWidthIn,
  hingeLimitDeg: toolJson.hingeLimitDeg,
}

export const CONSTANTS: RuleConstants = {
  rangeBand: 6,
  halfRange: 3,
  maxBand: 5,
  contactEpsilon: 0.002,
  cohesionDistance: 3,
  heightBandSize: 6,
}

export const SMALL_R = baseRadiusIn(27)
export const SMALL_SAMPLES = { rings: 2, perRing: 8, axis: true }
export const SMALL_H = 1.69

export function box(id: string, x0: number, z0: number, x1: number, z1: number, over: Partial<TerrainPieceDef> = {}): TerrainPieceDef {
  return {
    id,
    kind: 'obstacle',
    footprint: [
      { x: x0, z: z0 },
      { x: x1, z: z0 },
      { x: x1, z: z1 },
      { x: x0, z: z1 },
    ],
    heightIn: 3,
    cover: 'light',
    blocksLos: true,
    movement: 'open',
    climbable: false,
    ...over,
  }
}

export function tableOf(pieces: TerrainPieceDef[] = [], size: { x: number; z: number } = { x: 72, z: 36 }): TableDef {
  return compileTable({ id: 'test', size, pieces })
}

export function worldOf(pieces: TerrainPieceDef[] = [], others: Obstacle[] = []): ToolWorld {
  return { table: tableOf(pieces), tool: TOOL, constants: CONSTANTS, others }
}

export function moverAt(x: number, z: number, over: Partial<Mover> = {}): Mover {
  return { pos: { x, z }, y: 0, baseRadius: SMALL_R, silhouetteHeight: SMALL_H, maxSpeed: 2, canEngage: true, ...over }
}

export function obstacle(id: string, x: number, z: number, enemy = false): Obstacle {
  return { id, pos: { x, z }, baseRadius: SMALL_R, enemy }
}

export function body(id: string, x: number, z: number, y = 0): LosBody {
  return { id, pos: { x, y, z }, baseRadius: SMALL_R, height: SMALL_H, samples: SMALL_SAMPLES }
}

export function at(x: number, z: number): Vec2 {
  return { x, z }
}

// ---------------------------------------------------------------------------
// Bundle for the contract tests
// ---------------------------------------------------------------------------

export const FIXTURE_DATA: GameData = {
  dataVersion: 'test',
  ruleset: 'test',
  dice: TABLES,
  constants: CONSTANTS,
  tool: TOOL,
  bases: { small: { id: 'small', radius: SMALL_R, notched: false, silhouette: 'sil.small' } },
  silhouettes: { 'sil.small': { id: 'sil.small', radius: SMALL_R, height: SMALL_H, samples: SMALL_SAMPLES } },
  layouts: {},
  units: {},
  weapons: {},
  keywords: {},
  upgrades: {},
  cards: {},
  battleCards: {},
}

export const FIXTURE_BUNDLE: EngineBundle = { data: FIXTURE_DATA }

export const FIXTURE_SETUP: GameSetup = {
  ruleset: 'test',
  battle: { auto: true },
  armies: {
    A: { factionId: 'a', units: [], commandHand: ['a1', 'a2', 'a3'] },
    B: { factionId: 'b', units: [], commandHand: ['b1', 'b2', 'b3'] },
  },
}

export { openTable }
