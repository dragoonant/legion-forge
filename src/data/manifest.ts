import type { DataFile, DefRef, SchemaName } from './types'
import { CORE_FILES } from './core'
import { ARMY_FILES } from './armies'
import { BATTLE_FILES } from './battle'
import { LAYOUT_FILES } from './layouts'

/** Every data file with the schema def it validates against, assembled from the four area indexes. */
export const MANIFEST: DataFile[] = [...CORE_FILES, ...ARMY_FILES, ...BATTLE_FILES, ...LAYOUT_FILES]

export const SCHEMA_NAMES: readonly SchemaName[] = ['common', 'core', 'keyword', 'army', 'battle', 'layout']

export const schemaOf = (def: DefRef): SchemaName => def.split('#')[0] as SchemaName
export const defName = (def: DefRef): string => def.split('#')[1]
