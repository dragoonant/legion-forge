// Validates every JSON record under src/data against its schema and cross-references.
// M0 stub: no data exists yet. M1 replaces this with the ported validator (legacy/tools/validate-data.ts).
import { existsSync } from 'node:fs'

const dataDir = new URL('../src/data/', import.meta.url)
console.log(existsSync(dataDir) ? 'validate:data: src/data exists but the validator is not ported yet' : 'validate:data: no data yet (M0)')
