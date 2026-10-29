// Test harness for the combat modules: a game state built from the real slice data (units, weapons, keywords, upgrades,
// command cards from src/data), a stand-in 'activation' module that starts attacks, fires windows and runs card actions, and
// helpers that answer decisions by option id with exactly the forced dice each step consumes.
import { loadBundle } from '../../../src/data'
import { startAttack, sufferWounds, woundSpecific } from '../../../src/engine/attack'
import { activateCard, runCardAction } from '../../../src/engine/commandCards'
import { compileDice } from '../../../src/engine/dice'
import { registerFrameResume } from '../../../src/engine/hooks'
import { fireWindow } from '../../../src/engine/keywords'
import { applySuppression, rallyRoll } from '../../../src/engine/morale'
import { resetModules, setModule, useStubModules } from '../../../src/engine/modules'
import { reject, type Ctx, type ModuleDef } from '../../../src/engine/registry'
import { createGame, step, ScriptedRng, type Action, type GameState, type StepResult, type Unit } from '../../../src/engine'
import type { AttackColour, DefenceColour, DiceDef, DieId, GameData, Seat, TerrainPieceDef } from '../../../src/engine/types'
import { attackModule } from '../../../src/engine/attack'
import { meleeModule } from '../../../src/engine/melee'
import { commandCardsModule } from '../../../src/engine/commandCards'
import { keywordsModule } from '../../../src/engine/keywords'
import { FIXTURE_DATA, FIXTURE_SETUP, SMALL_R, tableOf } from '../fixtures'

export const BUNDLE = loadBundle()
export { SMALL_R }

export const DATA: GameData = {
  ...FIXTURE_DATA,
  dataVersion: 'combat-test',
  dice: compileDice(BUNDLE.dice as unknown as DiceDef),
  constants: { ...(BUNDLE.constants.values as Record<string, number>) } as GameData['constants'],
  units: BUNDLE.units as unknown as GameData['units'],
  weapons: BUNDLE.weapons as unknown as GameData['weapons'],
  keywords: BUNDLE.keywords as unknown as GameData['keywords'],
  upgrades: BUNDLE.upgrades as unknown as GameData['upgrades'],
  cards: BUNDLE.commandCards as unknown as GameData['cards'],
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export interface UnitSpec {
  id: string
  seat: Seat
  /** data unit id such as 'emp.u.stormtroopers' */
  data: string
  /** positions of the card's models; the first is the leader (a Heavy Weapon Team / Captain leader can be set with `leader`) */
  at: [number, number][]
  upgrades?: string[]
  /** extra models added by upgrades, each with its own weapon */
  extra?: { at: [number, number]; weapon: string; upgradeId?: string; maxWounds?: number }[]
  suppression?: number
  tokens?: Record<string, number>
  order?: 'none' | 'faceUp' | 'pool' | 'spent'
  location?: Unit['location']
  /** override the first model's wounds, for multi-wound units */
  wounds?: number[]
}

export function unit(spec: UnitSpec): Unit {
  const def = DATA.units[spec.data] as unknown as { rank: string; minis: number; wounds: number; weapons: string[] }
  const minis = spec.at.map(([x, z], i) => ({
    id: `${spec.id}.${i + 1}`,
    isLeader: i === 0,
    pos: { x, y: 0, z },
    yaw: spec.seat === 'A' ? 0 : Math.PI,
    baseSize: 'small',
    wounds: spec.wounds?.[i] ?? 0,
    maxWounds: def.wounds,
    alive: true,
  }))
  ;(spec.extra ?? []).forEach((e, k) =>
    minis.push({
      id: `${spec.id}.u${k + 1}`,
      isLeader: false,
      pos: { x: e.at[0], y: 0, z: e.at[1] },
      yaw: 0,
      baseSize: 'small',
      wounds: 0,
      maxWounds: e.maxWounds ?? def.wounds,
      alive: true,
      weaponIds: [e.weapon],
      ...(e.upgradeId ? { upgradeId: e.upgradeId } : {}),
    } as (typeof minis)[number]),
  )
  return {
    id: spec.id,
    seat: spec.seat,
    unitTypeId: spec.data,
    rank: def.rank,
    minis,
    leaderId: minis[0]!.id,
    location: spec.location ?? 'table',
    order: { state: spec.order ?? 'none' },
    activated: false,
    suppression: spec.suppression ?? 0,
    tokens: { ...(spec.tokens ?? {}) },
    keywords: [],
    weapons: [...def.weapons],
    upgrades: [...(spec.upgrades ?? [])],
    engagedWith: [],
    flags: {},
  }
}

// ---------------------------------------------------------------------------
// Game state and the stand-in flow module
// ---------------------------------------------------------------------------

export interface GameOpts {
  pieces?: TerrainPieceDef[]
  seed?: string
  round?: number
  hand?: Partial<Record<Seat, string[]>>
}

function raiseMenu(ctx: Ctx): void {
  const seat = ctx.state.activation.turn ?? 'A'
  ctx.raise({ kind: 'action.choose', seat, window: 'action.resolved', context: { menu: true }, canPass: false })
}

registerFrameResume('test.flow', (ctx) => raiseMenu(ctx))

export type MenuPayload =
  | { action: 'attack'; unitId: string; forced?: string; rangedOnly?: boolean; meleeOnly?: boolean; free?: boolean }
  | { action: 'fire'; window: string; info?: Record<string, unknown>; resume?: boolean }
  | { action: 'cardAction'; unitId: string; actionId: string }
  | { action: 'activateCard'; seat: Seat; cardId: string }
  | { action: 'rally'; unitId: string }
  | { action: 'wound'; unitId: string; n: number }
  | { action: 'woundMini'; unitId: string; miniId: string; n: number }
  | { action: 'suppress'; unitId: string; n: number }
  | { action: 'menu' }

const flow: ModuleDef = {
  id: 'activation',
  namespaces: ['activation', 'action'],
  handle(_state, action) {
    if (action.type !== 'action.choose') return reject('E_TODO', 'the stand-in flow only handles action.choose')
    const p = action.payload.params as unknown as MenuPayload
    return {
      run(ctx) {
        switch (p.action) {
          case 'attack':
            ctx.state.activation.turn = ctx.state.units[p.unitId]!.seat
            startAttack(ctx, {
              attackerId: p.unitId,
              resume: 'test.flow',
              ...(p.forced ? { forcedDefenderId: p.forced } : {}),
              ...(p.rangedOnly ? { rangedOnly: true } : {}),
              ...(p.meleeOnly ? { meleeOnly: true } : {}),
              ...(p.free ? { free: true } : {}),
            })
            return
          case 'fire':
            if (!fireWindow(ctx, p.window, p.info ?? {}, p.resume === false ? undefined : { name: 'test.flow' })) raiseMenu(ctx)
            return
          case 'cardAction':
            if (!runCardAction(ctx, p.unitId, p.actionId, { name: 'test.flow' })) raiseMenu(ctx)
            return
          case 'activateCard':
            activateCard(ctx, p.seat, p.cardId)
            raiseMenu(ctx)
            return
          case 'wound':
            sufferWounds(ctx, p.unitId, p.n, 'test')
            raiseMenu(ctx)
            return
          case 'woundMini':
            woundSpecific(ctx, p.unitId, p.miniId, p.n, 'test')
            raiseMenu(ctx)
            return
          case 'suppress':
            applySuppression(ctx, p.unitId, p.n, 'test')
            raiseMenu(ctx)
            return
          case 'rally':
            rallyRoll(ctx, ctx.state.units[p.unitId]!)
            raiseMenu(ctx)
            return
          default:
            raiseMenu(ctx)
        }
      },
    }
  },
}

export function installModules(): void {
  useStubModules() // the bare fixture has no formats or battle cards; the real flow modules need the real bundle
  setModule(attackModule)
  setModule(meleeModule)
  setModule(keywordsModule)
  setModule(commandCardsModule)
  setModule(flow)
}

export function uninstallModules(): void {
  resetModules()
}

/** A game in the Activation phase with the given units, the menu pending for seat A. */
export function game(units: Unit[], opts: GameOpts = {}): GameState {
  installModules()
  const r = createGame({ ...FIXTURE_SETUP, ruleset: 'test' }, opts.seed ?? 'combat', { data: { ...DATA, ruleset: 'test' } })
  const s: GameState = { ...r.state }
  s.table = { ...s.table, def: tableOf(opts.pieces ?? []) }
  s.units = Object.fromEntries(units.map((u) => [u.id, u]))
  s.phase = 'activation'
  s.round = opts.round ?? 2
  s.players = { A: { ...s.players.A, hand: opts.hand?.A ?? [] }, B: { ...s.players.B, hand: opts.hand?.B ?? [] } }
  s.pending = {
    id: `d:${s.nextDecision}`,
    seat: 'A',
    kind: 'action.choose',
    window: 'action.resolved',
    context: { menu: true },
    canPass: false,
  }
  s.nextDecision += 1
  return s
}

// ---------------------------------------------------------------------------
// Driving
// ---------------------------------------------------------------------------

/** Forced dice: face names per die kind map to the first matching face index of the real tables. */
export function idx(die: DieId, face: string): number {
  const tables = DATA.dice
  if (die === 'd6') return Number(face) - 1
  const [side, colour] = die.split(':') as ['atk' | 'def', string]
  const faces = side === 'atk' ? tables.attack[colour as AttackColour] : tables.defence[colour as DefenceColour]
  const i = faces.indexOf(face as never)
  if (i < 0) throw new Error(`no ${face} face on ${die}`)
  return i
}

export const atk = (colour: AttackColour, ...faces: string[]): number[] => faces.map((f) => idx(`atk:${colour}` as DieId, f))
export const def = (colour: DefenceColour, ...faces: string[]): number[] => faces.map((f) => idx(`def:${colour}` as DieId, f))
export const script = (...parts: number[][]): ScriptedRng => new ScriptedRng(parts.flat())

export function ok(r: StepResult): StepResult {
  if (r.rejection) throw new Error(`rejected ${r.rejection.code}: ${r.rejection.reason}`)
  return r
}

/** Answer the pending decision with a menu action. */
export function menu(state: GameState, payload: MenuPayload, rng?: ScriptedRng): StepResult {
  const p = state.pending!
  return step(state, { type: 'action.choose', seat: p.seat as Seat, decisionId: p.id, payload: { action: 'x', params: payload as unknown as Record<string, unknown> } }, rng)
}

/** Answer the pending decision with one of its options, by id. */
export function choose(state: GameState, optionId: string, rng?: ScriptedRng): StepResult {
  const p = state.pending!
  const o = p.options?.find((x) => x.id === optionId)
  if (!o) throw new Error(`no option ${optionId} in ${p.kind}; have ${(p.options ?? []).map((x) => x.id).join(', ')}`)
  return step(state, o.action, rng)
}

export function passIt(state: GameState): StepResult {
  const p = state.pending!
  return step(state, { type: 'pass', seat: p.seat as Seat, decisionId: p.id, payload: {} } as Action)
}

export function optionIds(state: GameState): string[] {
  return (state.pending?.options ?? []).map((o) => o.id)
}

/** Run a list of [optionId, rng] answers. */
export function run(state: GameState, ...answers: [string, ScriptedRng?][]): StepResult {
  let r: StepResult = { state, events: [], pending: state.pending }
  for (const [id, rng] of answers) r = ok(choose(r.state, id, rng))
  return r
}

export function eventsOf<T extends string>(r: { events: readonly { type: string }[] }, type: T) {
  return r.events.filter((e) => e.type === type) as (Extract<import('../../../src/engine').GameEvent, { type: T }>)[]
}

/** Start an attack by `attackerId` and answer: the defender, the pool (auto). Returns the result after the pool is formed. */
export function beginAttack(state: GameState, attackerId: string, defenderId: string, extra: Partial<Extract<MenuPayload, { action: 'attack' }>> = {}): StepResult {
  let r = ok(menu(state, { action: 'attack', unitId: attackerId, ...extra }))
  r = ok(choose(r.state, `unit:${defenderId}`))
  return r
}

export const xy = (...pts: [number, number][]): [number, number][] => pts

export function u(state: GameState, id: string): Unit {
  return state.units[id]!
}

/** A copy of the state whose data holds a patched unit record (a droid stand-in, a changed courage...). */
export function withUnitDef(state: GameState, id: string, patch: Record<string, unknown>, as?: string): GameState {
  const base = state.data.units[id] as Record<string, unknown>
  const newId = as ?? id
  return { ...state, data: { ...state.data, units: { ...state.data.units, [newId]: { ...base, ...patch, id: newId } as never } } }
}
