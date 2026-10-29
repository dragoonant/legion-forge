// Transient board effects, written only by the director so nothing shows before its beat: a tracer from the attacker to the defender
// and floating texts (wounds, defeats, suppression, panic). The renderer is board/FxLayer.tsx; M5/M7 replace these with the real
// effects engine.
import { create } from 'zustand'

export type FxKind = 'tracer' | 'text'

export interface Fx {
  id: number
  kind: FxKind
  /** performance.now() at spawn */
  t0: number
  dur: number
  from: [number, number, number]
  to: [number, number, number]
  color: string
  text: string
}

interface FxState {
  list: Fx[]
}

let nextId = 1
export const useFx = create<FxState>(() => ({ list: [] }))

export function spawnFx(fx: Partial<Fx> & Pick<Fx, 'kind' | 'to'>): void {
  const full: Fx = { id: nextId++, t0: performance.now(), dur: 600, from: fx.to, color: '#ffffff', text: '', ...fx }
  useFx.setState((s) => ({ list: [...s.list.slice(-24), full] }))
  if (typeof setTimeout !== 'undefined') setTimeout(() => useFx.setState((s) => ({ list: s.list.filter((f) => f.id !== full.id) })), full.dur + 150)
}

export function clearFx(): void {
  useFx.setState({ list: [] })
}
