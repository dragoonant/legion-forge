// Registry of code effects (the `{ "code": "<hook>" }` escape hatches of keywords, upgrades and command cards). It lives in
// its own file with no runtime imports so faction files (empire.ts, rebels.ts) and keywords.ts can both use it without an
// import cycle that would touch an uninitialised module. A code effect declares the windows it runs in; the keyword
// interpreter (keywords.ts) calls `run` at each of them for every unit or card that carries the `code` effect.
import type { Ctx } from '../registry'
import type { AttackFrame, CodeOffer, PoolFrame, Unit } from '../types'

export interface CodeEnv {
  window: string
  params: Record<string, unknown> | undefined
  /** the unit that has the keyword or upgrade, or the unit a card names (null for an unnamed card) */
  owner: Unit | null
  /** the unit the window is about (activating, moved, ordered, attacker...) */
  subjectId: string | null
  /** the seat that controls the effect */
  seat: 'A' | 'B'
  /** keyword, upgrade or card id the effect belongs to */
  source: string
  attack: AttackFrame | null
  pool: PoolFrame | null
  /** the owner's role in the running attack */
  role: 'attacker' | 'defender' | null
  /** offers a code effect wants turned into decisions (collected after `run` returns) */
  offers: CodeOffer[]
  /** free data the window passes along */
  info: Record<string, unknown>
}

export interface CodeEffectDef {
  name: string
  windows: string[]
  run(ctx: Ctx, env: CodeEnv): void
  /** called when a seat answered one of the offers `run` made; `more` raises a follow-up offer (a second choice) */
  resolve?(ctx: Ctx, offer: CodeOffer, option: string, more: (next: CodeOffer) => void): void
  /** a card action (free or full) a code effect provides, executed through `runCardAction` in commandCards.ts */
  action?: {
    id: string
    /** the card that provides it; the action is available while that card's effects are in play */
    card: string
    free: boolean
    /** may the unit take it now? */
    available(ctx: Ctx, unitId: string): boolean
    /** start the action; raise offers through `more` when a choice is needed */
    run(ctx: Ctx, unitId: string, more: (offer: CodeOffer) => void): void
  }
}

const effects = new Map<string, CodeEffectDef>()

export function registerCodeEffect(def: CodeEffectDef): void {
  effects.set(def.name, def)
}

export function getCodeEffect(name: string): CodeEffectDef | undefined {
  return effects.get(name)
}

export function codeEffectNames(): string[] {
  return [...effects.keys()].sort()
}
