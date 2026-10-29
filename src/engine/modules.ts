// Namespace -> module table. Exactly one owner per decision-kind namespace. Every module exists from M2a as a stub that
// owns its namespaces and rejects every answer with E_TODO; a later stage replaces its stub here and edits only its own
// module file. `setModule` / `resetModules` let tests install a fixture module in place of a stub.
import { EngineInvariantError } from './state'
import { stubModule, type Ctx, type ModuleDef } from './registry'

/** SET: army lists, battle selection, deployment. The stub raises the first decision so the flow is wired end to end. */
const setupStub: ModuleDef = {
  ...stubModule('setup', ['setup']),
  init(ctx: Ctx) {
    ctx.raise({
      kind: 'setup.battle',
      seat: 'A',
      window: 'setup.*',
      options: [{ id: 'auto', labelKey: 'setup.battle.auto', type: 'setup.battle', payload: { auto: true } }],
    })
  },
}

const DEFAULT_MODULES: ModuleDef[] = [
  setupStub,
  stubModule('command', ['command']), // CMD: hidden simultaneous pick, priority, orders, order pool
  stubModule('activation', ['activation', 'action']), // ACT: turn alternation, order use or pool draw, action ledger
  stubModule('movement', ['move']), // MOV: tool moves, trooper placement, cohesion, climb
  stubModule('attack', ['attack']), // ATK: the attack pipeline
  stubModule('melee', ['melee']), // MEL: charge, engagement
  stubModule('keywords', ['keyword']), // KEY
  stubModule('commandCards', ['card']), // CC
  stubModule('battle', ['battle', 'confirm']), // BTL: objectives, scoring, victory
  stubModule('endphase', ['end']), // END
]

let modules: ModuleDef[] = DEFAULT_MODULES.slice()
let table: Map<string, ModuleDef> | null = null

export function allModules(): readonly ModuleDef[] {
  return modules
}

function build(): Map<string, ModuleDef> {
  const m = new Map<string, ModuleDef>()
  for (const mod of modules) {
    for (const ns of mod.namespaces) {
      if (m.has(ns)) throw new EngineInvariantError(`namespace ${ns} has two owners`)
      m.set(ns, mod)
    }
  }
  return m
}

/** Replace the module with the same id (tests install fixture modules this way). */
export function setModule(def: ModuleDef): void {
  const i = modules.findIndex((m) => m.id === def.id)
  if (i < 0) throw new EngineInvariantError(`no module ${def.id} to replace`)
  modules = modules.map((m, j) => (j === i ? def : m))
  table = null
}

export function resetModules(): void {
  modules = DEFAULT_MODULES.slice()
  table = null
}

/** The module that owns a decision kind such as `action.choose` or `confirm`. */
export function moduleFor(kind: string): ModuleDef {
  table ??= build()
  const ns = kind.split('.')[0]!
  const mod = table.get(ns)
  if (!mod) throw new EngineInvariantError(`no module owns decision kind ${kind}`)
  return mod
}

/** The module that raises the first decision of a game. */
export function setupModule(): ModuleDef {
  table ??= build()
  return table.get('setup')!
}
