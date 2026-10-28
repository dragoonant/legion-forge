import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// legacy/ holds the Mancermundo code base this project was copied from. It is quarantined: nothing in src/, tests/
// or tools/ may import from it; files are ported into src/ by the table in docs/spec/05-migration.md.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('boundaries', () => {
  it('nothing imports from legacy/', () => {
    const offenders = ['src', 'tests', 'tools']
      .flatMap(files)
      .filter((f) => /from\s+['"][^'"]*legacy\//.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
