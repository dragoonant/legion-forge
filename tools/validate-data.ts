/**
 * npm run validate:data [-- --print lists] [--allow-pending-codes] [--no-sources] [--quiet]
 *
 * Validates every JSON record under src/data (docs/spec/20-data-schema.md section 12). Prints `ok (<n> records)` (after a table of the
 * data files) or `path: V-xx message` lines and exits non-zero. Every `{ "code": ... }` hook the data uses must be registered in
 * the engine (src/engine/armies, battle.ts); --allow-pending-codes is the opt-in for data that runs ahead of the engine.
 */
import { validateAll } from '../src/data/validate'
import '../src/engine/armies'
import '../src/engine/battle'
import { registeredCodeHooks } from '../src/engine/code-hooks'
import { armyListProblems, listPoints } from '../src/data/roster'
import type { DataBundle } from '../src/data/types'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const printWhat = args.includes('--print') ? args[args.indexOf('--print') + 1] : undefined

const result = validateAll({ registeredCodes: new Set<string>(registeredCodeHooks()), allowPendingCodes: flag('--allow-pending-codes'), sourcesDir: flag('--no-sources') ? false : undefined })

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))

function printFiles(): void {
  console.log('data files')
  for (const f of result.summaries) console.log(`  ${pad(f.path, 36)} ${pad(f.def, 20)} ${f.records}`)
}

function printLists(bundle: DataBundle): void {
  for (const l of Object.values(bundle.armyLists)) {
    const problems = armyListProblems(bundle, l)
    console.log(`\n${l.name} (${l.id}) ${listPoints(bundle, l)}/${bundle.formats[l.format]?.maxPoints} points${problems.length ? '  PROBLEMS' : ''}`)
    for (const e of l.units) {
      const u = bundle.units[e.unit]
      console.log(`  ${pad(u?.name + (u?.subtitle ? ` (${u.subtitle})` : ''), 36)} ${pad(u?.rank ?? '?', 15)} ${u?.points} + ${e.upgrades.map((id) => bundle.upgrades[id]?.name).join(', ') || '-'}`)
    }
  }
}

if (!flag('--quiet')) {
  printFiles()
  if (printWhat === 'lists' && result.bundle) printLists(result.bundle)
  if (result.hooks.length > 0) {
    console.log('\ncode hooks used by data')
    for (const h of result.hooks) console.log(`  ${pad(h.name, 26)} ${h.registered ? 'registered' : 'pending   '} ${h.usedBy.join(', ')}`)
  }
  console.log('')
}
for (const w of result.warnings) console.warn(`W ${w}`)

if (result.errors.length > 0) {
  for (const line of result.errors) console.error(line)
  console.error(`${result.errors.length} problem(s)`)
  process.exit(1)
}
console.log(`ok (${result.records} records)`)
