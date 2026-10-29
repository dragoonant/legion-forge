import { MANIFEST } from '../../src/data/manifest'
import type { DataFile } from '../../src/data/types'

/** A deep copy of the real manifest with one mutation applied to a named file's data. */
export function mutated(path: string, change: (data: any) => void): DataFile[] {
  return MANIFEST.map((f) => {
    const data = structuredClone(f.data)
    if (f.path === path) change(data)
    return { ...f, data }
  })
}

export const NO_SOURCES = { sourcesDir: false as const, dataDir: false as const, allowPendingCodes: true }
