// The table definition is static, but a state that crosses a worker boundary is structured-cloned on every request, and the
// engine caches geometry per polygon object (`polyBoxes` in geometry.ts). Interning the definition (one object per distinct table,
// found by a signature of its geometry) keeps those caches warm across requests.
import type { GameState, PlayerView, TableDef } from '@/engine'

const interned = new Map<string, TableDef>()

function signature(def: TableDef): string {
  let h = 2166136261
  const mix = (n: number) => {
    h ^= Math.round(n * 1000) | 0
    h = Math.imul(h, 16777619)
  }
  for (const p of def.pieces) for (const q of p.footprint) (mix(q.x), mix(q.z))
  return `${def.id}|${def.pieces.length}|${h >>> 0}`
}

/** The view with its table definition replaced by the interned copy (a new view object; the input is not touched). */
export function internBoard<T extends GameState | PlayerView>(state: T): T {
  const sig = signature(state.table.def)
  let def = interned.get(sig)
  if (!def) {
    if (interned.size >= 12) interned.clear()
    interned.set(sig, state.table.def)
    def = state.table.def
  }
  return def === state.table.def ? state : { ...state, table: { ...state.table, def } }
}
