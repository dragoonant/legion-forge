// Namespace -> module table. Exactly one owner per decision-kind namespace. Every module exists from M2a as a stub that
// owns its namespaces and rejects every answer with E_TODO; a later stage replaces its stub here and edits only its own
// module file. `setModule` / `resetModules` let tests install a fixture module in place of a stub.
import { attackModule } from './attack'
import { commandCardsModule } from './commandCards'
import { fireWindow, keywordsModule } from './keywords'
import { meleeModule } from './melee'
import { activationModule, afterActionResolved, afterEndWindow, afterRallied, afterStartWindow, nextTurn } from './activation'
import { battleModule } from './battle'
import { afterOrders, afterReveal, commandModule } from './command'
import { afterRoundEnd, afterScoring, afterStart, endphaseModule } from './endphase'
import { registerFrameResume, registerWindowOpener } from './hooks'
import { afterMoveEndedWindow, movementModule, resumeAfterMove } from './movement'
import { setupModule as setupModuleDef } from './setup'
import { EngineInvariantError } from './state'
import { stubModule, type Ctx, type ModuleDef } from './registry'
import { flowOf } from './battle'

// All ten modules are real (M2b-flow + M2b-combat merged).
const DEFAULT_MODULES: ModuleDef[] = [
  setupModuleDef, // SET: army lists, blue player, mission draw, Prepared Position deployment
  commandModule, // CMD: hidden simultaneous pick, priority, orders, order pool
  activationModule, // ACT: turn alternation, order use or pool draw, action ledger, standby
  movementModule, // MOV: tool moves, trooper placement, cohesion, climb
  attackModule, // ATK: pool, dice, cover, spend, allocate, wounds
  meleeModule, // MEL: melee contact and attacks
  keywordsModule, // KEY: keyword windows and code hooks
  commandCardsModule, // CC: command cards
  battleModule, // BTL: objectives, scoring, victory
  endphaseModule, // END
]

/**
 * A timing window offered to the registered window opener (`registerWindowOpener`) may raise a decision of the card or
 * keyword modules; whoever answers it calls `getFrameResume('flow')?.(ctx, 'finished', {})` and the flow continues at the
 * step that offered the window.
 */
const RESUMERS: Record<string, (ctx: Ctx) => void> = {
  'cmd.revealed': afterReveal,
  'cmd.issued': afterOrders,
  'act.phaseStarted': nextTurn,
  'act.started': afterStartWindow,
  'act.rallied': afterRallied,
  'act.ended': afterEndWindow,
  'act.resolved': afterActionResolved,
  'move.ended': afterMoveEndedWindow,
  'move.charged': resumeAfterMove,
  'end.started': afterStart,
  'end.scored': afterScoring,
  'round.ended': afterRoundEnd,
}

export function resumeFlow(ctx: Ctx): void {
  const flow = flowOf(ctx.state)
  const name = flow.resume
  if (!name) throw new EngineInvariantError('resumeFlow with nothing suspended')
  const fn = RESUMERS[name]
  if (!fn) throw new EngineInvariantError(`unknown flow continuation ${name}`)
  flow.resume = null
  fn(ctx)
}

registerFrameResume('flow', (ctx) => resumeFlow(ctx))

// Every lifecycle window the flow passes (`openWindow`) runs the keyword / upgrade / command-card effects that trigger there.
// A decision they raise (a keyword.choice or card.choice) suspends the flow; the interpreter calls the 'flow' frame-resume
// after the last answer and `resumeFlow` continues at the step that offered the window.
registerWindowOpener((ctx, window, info) => {
  const { kind: _kind, unitId, ...rest } = info
  return fireWindow(ctx, window, { ...rest, ...(unitId ? { unitId } : {}) }, { name: 'flow' })
})

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

/**
 * Replace every module with the M2a stub (the setup stub raises the first decision, everything else rejects with E_TODO):
 * the contract tests exercise the plumbing with the bare fixture bundle, which has no formats, units or battle cards.
 */
export function useStubModules(): void {
  modules = [
    {
      ...stubModule('setup', ['setup']),
      init(ctx: Ctx) {
        ctx.raise({
          kind: 'setup.battle',
          seat: 'A',
          window: 'setup.*',
          options: [{ id: 'auto', labelKey: 'setup.battle.auto', type: 'setup.battle', payload: { auto: true } }],
        })
      },
    },
    ...DEFAULT_MODULES.slice(1).map((m) => stubModule(m.id, m.namespaces)),
  ]
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
