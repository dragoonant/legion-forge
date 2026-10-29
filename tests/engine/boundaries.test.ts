import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 00-architecture section 1: the engine imports only itself (and type-only src/data/types) and uses no DOM, timers,
// Math.random or Date, so it runs in node, the browser and a worker with the same results.
const dir = join(__dirname, '../../src/engine')
const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))

describe('engine boundaries', () => {
  it('engine files import only relative engine modules (plus type-only data types)', () => {
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      for (const m of src.matchAll(/^(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
        const spec = m[2]!
        if (spec.startsWith('./')) continue
        if (m[1] && /^(@\/|\.\.\/)data\/types$/.test(spec)) continue
        bad.push(`${f}: ${spec}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('engine files use no Math.random, Date, timers or DOM globals', () => {
    const bad: string[] = []
    for (const f of files) {
      const code = readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
        .join('\n')
      if (/Math\.random|\bDate\.|new Date|setTimeout|setInterval|\bwindow\.|\bdocument\.|performance\.now/.test(code)) bad.push(f)
    }
    expect(bad).toEqual([])
  })
})
