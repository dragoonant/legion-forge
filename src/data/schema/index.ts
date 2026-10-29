// schema frozen after M1 dry run, 2026-10-29
//
// The six JSON Schema 2020-12 files below were exercised by encoding every slice record (9 units, their weapons, every upgrade in
// docs/spec/14-armies.md 2.3 and 3.3, both command hands, 41 keywords, the 9 Recon battle cards, 3 Recon maps, the core files, one
// Recon layout and the four Recon lists). From here on a change is additive and gets a row in docs/spec/00-architecture.md section 11.
// The changes the dry run made to docs/spec/20-data-schema.md are listed in tools/out/m1-data.md.
import common from './common.schema.json'
import core from './core.schema.json'
import keyword from './keyword.schema.json'
import army from './army.schema.json'
import battle from './battle.schema.json'
import layout from './layout.schema.json'

/** `common` is referenced by `$ref` from the others. */
export const SCHEMAS: Record<string, object> = { common, core, keyword, army, battle, layout }

export const SCHEMA_ID_BASE = 'https://legion-forge.dev/schemas/'
export const schemaId = (name: string): string => `${SCHEMA_ID_BASE}${name}.schema.json`
