import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(__dirname, '../../src/ai')
const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))

describe('AI package boundaries', () => {
  it('AI-040 imports only the engine, itself and nothing from legacy or the client; no Math.random', () => {
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      for (const m of src.matchAll(/^(?:import|export)\s+(?:type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
        const spec = m[1]!
        if (spec.startsWith('./') || spec.startsWith('@/engine')) continue
        bad.push(`${f}: ${spec}`)
      }
      const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
      if (/Math\.random/.test(code)) bad.push(`${f}: Math.random`)
    }
    expect(bad).toEqual([])
  })
})
