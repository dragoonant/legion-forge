// The attack pipeline (docs/spec/00 section 7.5, 10-rules-core R-12 to R-14): one machine for ranged and melee. An attack is
// a frame in `state.attack` (types.ts `AttackFrame`); each pool walks the named steps below and every step is a timing
// window. Every optional spend is an `attack.spend` decision with an `auto` option; wound allocation is automatic unless the
// remaining models differ (`attack.allocate`). A window whose effects need an answer suspends the machine; the keywords
// module resumes it through the frame-resume registered as 'attack'. The flow module starts an attack with `startAttack`
// and is called back through its own frame-resume when the attack ends.
import { coverCancelled, shiftColour } from './dice'
import { registerAttackSeam, loseStandby } from './activation'
import { dropOrderToken } from './command'
import { addEffect } from './effects'
import { getFrameResume, registerFrameResume, runHook } from './hooks'
import { aliveMinis, constants, EngineInvariantError, getUnit, leaderOf, unitsOnTable } from './state'
import { reject, type Ctx, type ModuleDef, type OptionInput } from './registry'
import {
  attackTargets,
  backupHits,
  blankAttack,
  blankPool,
  checkTarget,
  movedThisActivation,
  coverVerdict,
  attackOdds,
  distanceLeaderToUnit,
  engagedUnitIds,
  minisSeenByUnit,
  poolDiceCounts,
  poolOptions,
} from './query'
import {
  expireAttackEffects,
  fireWindow,
  foldBool,
  foldNumber,
  gainToken,
  hasKeyword,
  loseToken,
  miniWeapons,
  modValues,
  poolAllHave,
  poolHasKeyword,
  tokensOf,
  unitDef,
  upgradeDef,
  weaponDef,
  weaponTypes,
} from './keywords'
import { applySuppression, courageOf, dropAssets, refreshPanic } from './morale'
import { replaceAfterMelee } from './melee'
import type {
  Action,
  AtkDie,
  AttackColour,
  AttackFace,
  AttackFrame,
  AttackKind,
  DefenceColour,
  DefenceFace,
  GameState,
  Mini,
  PendingDecision,
  PoolFrame,
  PoolStep,
  PoolWeapon,
  Seat,
  ShiftRec,
  StartAttackInput,
  TimingWindowId,
  Unit,
} from './types'

const FRAME = 'attack'
const W = (w: string): TimingWindowId => w as TimingWindowId
const COLOURS: AttackColour[] = ['red', 'black', 'white']

// ---------------------------------------------------------------------------
// Frame access
// ---------------------------------------------------------------------------

function frame(state: GameState): AttackFrame {
  if (!state.attack) throw new EngineInvariantError('no attack in progress')
  return state.attack.data as unknown as AttackFrame
}

function poolOf(af: AttackFrame): PoolFrame {
  const pf = af.pools[af.current]
  if (!pf) throw new EngineInvariantError('no pool in resolution')
  return pf
}

function attackerOf(state: GameState): Unit {
  return getUnit(state, state.attack!.attackerId)
}

// ---------------------------------------------------------------------------
// Starting and finishing an attack
// ---------------------------------------------------------------------------

/**
 * Begin an attack by `attackerId` (an Attack action, Standby, Charge, or any free attack). The caller registered
 * `input.resume` with `registerFrameResume`; it is called with ('finished' | 'cancelled', data) when the attack is over
 * and must raise the next decision. Raises `attack.defender` (or `attack.spend` for Long Shot first).
 */
export function startAttack(ctx: Ctx, input: StartAttackInput): void {
  const attacker = getUnit(ctx.state, input.attackerId)
  const af: AttackFrame = {
    ...blankAttack(),
    resume: input.resume,
    resumeData: input.resumeData ?? {},
    free: !!input.free,
    rangedOnly: !!input.rangedOnly,
    meleeOnly: !!input.meleeOnly,
    forcedDefenderId: input.forcedDefenderId ?? null,
    moved: movedThisActivation(ctx.state, attacker),
    stage: 'declaring',
  }
  ctx.state.attack = { stage: 'declaring', attackerId: attacker.id, defenderId: null, data: af as unknown as Record<string, unknown> }
  advance(ctx)
}

function setStage(ctx: Ctx, stage: AttackFrame['stage']): void {
  frame(ctx.state).stage = stage
  ctx.state.attack!.stage = stage
}

function targetOpts(af: AttackFrame) {
  return { rangeBonus: af.rangeBonus, rangedOnly: af.rangedOnly, meleeOnly: af.meleeOnly, usedMinis: af.usedMinis, usedWeapons: af.usedWeapons }
}

function finishAttack(ctx: Ctx, outcome: 'finished' | 'cancelled'): void {
  const st = ctx.state
  const a = st.attack!
  const af = frame(st)
  const attacker = st.units[a.attackerId]!
  const defenderIds = [...new Set(af.pools.map((p) => p.defenderId))]
  const wounds = af.pools.reduce((s, p) => s + p.woundsSuffered, 0)
  const melee = af.pools.some((p) => p.kind === 'melee')
  if (outcome === 'finished') {
    ctx.emit({ type: 'AttackEnded', attackerId: attacker.id, defenderIds, wounds }, attacker.seat)
    if (melee) for (const d of defenderIds) replaceAfterMelee(ctx, attacker.id, d)
  }
  expireAttackEffects(ctx)
  if (outcome === 'finished') {
    // an attack removes a Standby token and an Aim is never kept past the pool (R-5.13)
    const sb = attacker.tokens['standby'] ?? 0
    if (sb > 0 && attacker.location !== 'defeated') loseToken(ctx, attacker.id, 'standby', sb, 'attack')
  }
  const resumeName = af.resume
  const data = { ...af.resumeData, attackerId: attacker.id, defenderIds, wounds, outcome }
  st.attack = null
  const fn = getFrameResume(resumeName)
  if (!fn) throw new EngineInvariantError(`no frame resume registered for ${resumeName}`)
  fn(ctx, outcome, data)
}

registerFrameResume(FRAME, (ctx) => advance(ctx))

// The Attack action, a granted free attack and a Standby response all go through the activation seam (activation.ts); the
// attack calls back through the 'activation.action' frame-resume when it ends.
registerAttackSeam({
  canStart(state, unitId, opts) {
    const targets = attackTargets(state, unitId, { ...(opts.weapons === 'ranged' ? { rangedOnly: true } : {}), ...(opts.weapons === 'melee' ? { meleeOnly: true } : {}) }).filter((t) => t.ok)
    return opts.against ? targets.some((t) => t.unitId === opts.against) : targets.length > 0
  },
  start(ctx, unitId, opts) {
    startAttack(ctx, {
      attackerId: unitId,
      resume: 'activation.action',
      free: opts.free,
      ...(opts.weapons === 'ranged' ? { rangedOnly: true } : {}),
      ...(opts.weapons === 'melee' ? { meleeOnly: true } : {}),
      ...(opts.against ? { forcedDefenderId: opts.against } : {}),
    })
  },
})

// ---------------------------------------------------------------------------
// The attack-level machine
// ---------------------------------------------------------------------------

function fireAttackWindow(ctx: Ctx, window: string): boolean {
  return fireWindow(ctx, window, {}, { name: FRAME })
}

/** Run the attack until it needs an answer or ends. */
export function advance(ctx: Ctx): void {
  for (let guard = 0; guard < 200; guard++) {
    const st = ctx.state
    if (!st.attack) return
    const af = frame(st)
    switch (af.stage) {
      case 'declaring': {
        if (!offerLongShot(ctx, af)) setStage(ctx, 'defender')
        else return
        break
      }
      case 'defender': {
        if (raiseDefender(ctx, af)) return
        break
      }
      case 'form': {
        raisePool(ctx, af)
        return
      }
      case 'extra': {
        if (raiseExtra(ctx, af)) return
        break
      }
      case 'resolve': {
        if (resolvePool(ctx) === 'suspended') return
        const af2 = frame(ctx.state)
        af2.current++
        if (af2.current >= af2.pools.length) {
          af2.current = af2.pools.length - 1
          setStage(ctx, 'closing')
          if (fireAttackWindow(ctx, 'attack.resolved')) return
          setStage(ctx, 'finished')
        }
        break
      }
      case 'closing': {
        setStage(ctx, 'finished')
        break
      }
      case 'finished': {
        finishAttack(ctx, 'finished')
        return
      }
    }
  }
  throw new EngineInvariantError('attack machine did not settle')
}

/** Long Shot (K-37): offered only when it would bring a defender into range. Returns true when a decision was raised. */
function offerLongShot(ctx: Ctx, af: AttackFrame): boolean {
  if (af.longShotAsked) return false
  af.longShotAsked = true
  const st = ctx.state
  const atk = attackerOf(st)
  if (tokensOf(atk, 'aim') < 1 || af.meleeOnly) return false
  const hasLongShot = aliveMinis(atk).some((m) => miniWeapons(st, atk, m.id).some((w) => weaponDef(st, w).keywords?.some((k: { id: string }) => k.id === 'kw.long-shot')))
  if (!hasLongShot) return false
  const before = new Set(attackTargets(st, atk.id, targetOpts(af)).filter((t) => t.ok).map((t) => t.unitId))
  const after = attackTargets(st, atk.id, { ...targetOpts(af), rangeBonus: af.rangeBonus + 1 }).filter((t) => t.ok && !before.has(t.unitId))
  if (after.length === 0) return false
  // a declaration pool lets weapon-keyword effects (Long Shot) be collected before any pool exists
  const decl = blankPool('', 'ranged', aliveMinis(atk).flatMap((m) => miniWeapons(st, atk, m.id).map((w) => ({ miniId: m.id, weaponId: w }))))
  af.pools = [decl]
  af.current = 0
  setStage(ctx, 'defender')
  const suspended = fireWindow(ctx, 'attack.declaring', {}, { name: FRAME })
  if (!suspended) {
    af.pools = []
    af.current = 0
  }
  return suspended
}

function clearDeclPool(af: AttackFrame): void {
  if (af.pools.length === 1 && af.pools[0]!.defenderId === '') {
    af.pools = []
    af.current = 0
  }
}

function raiseDefender(ctx: Ctx, af: AttackFrame): boolean {
  clearDeclPool(af)
  const st = ctx.state
  const atk = attackerOf(st)
  let targets = attackTargets(st, atk.id, targetOpts(af)).filter((t) => t.ok)
  if (af.forcedDefenderId) targets = targets.filter((t) => t.unitId === af.forcedDefenderId)
  if (targets.length === 0) {
    ctx.emit({ type: 'AttackSkipped', attackerId: atk.id, reason: 'noTarget' }, atk.seat)
    finishAttack(ctx, 'cancelled')
    return true
  }
  const options: OptionInput[] = targets.map((t) => {
    let odds: { expectedWounds: number; pDefeat: number; pAnyHit: number } | null = null
    try {
      const o = attackOdds(st, atk.id, t.unitId)
      odds = { expectedWounds: o.expectedWounds, pDefeat: o.pDefeat, pAnyHit: o.pAnyHit }
    } catch {
      odds = null
    }
    return {
      id: `unit:${t.unitId}`,
      labelKey: 'attack.defender',
      type: 'attack.defender',
      payload: { unitId: t.unitId },
      data: { distance: t.distance, band: t.band, kinds: t.kinds, visible: t.visible.length, cover: t.cover, odds },
    }
  })
  ctx.raise({
    kind: 'attack.defender',
    seat: atk.seat,
    window: W('attack.defenderDeclared'),
    context: { attackerId: atk.id, free: af.free, rangeBonus: af.rangeBonus },
    options,
    canPass: !af.pools.length,
  })
  return true
}

function raisePool(ctx: Ctx, af: AttackFrame): void {
  const st = ctx.state
  const atk = attackerOf(st)
  const defenderId = st.attack!.defenderId!
  const opts = poolOptions(st, atk.id, defenderId, targetOpts(af))
  if (opts.length === 0) throw new EngineInvariantError(`no pool can be formed against ${defenderId}`)
  const ordered = [...opts.filter((o) => o.auto), ...opts.filter((o) => !o.auto)]
  ctx.raise({
    kind: 'attack.pool',
    seat: atk.seat,
    window: W('attack.poolFormed'),
    context: { attackerId: atk.id, defenderId, pools: af.pools.length },
    options: ordered.map((o) => ({
      id: o.id,
      labelKey: 'attack.pool',
      type: 'attack.pool' as const,
      payload: { weaponIds: Object.fromEntries(o.weapons.map((w) => [w.miniId, w.weaponId])) },
      data: { kind: o.kind, dice: o.dice, auto: o.auto, weapons: o.weapons },
    })),
    canPass: false,
  })
}

/** More pools against a different enemy unit (R-12.4). Returns true when a decision was raised. */
function raiseExtra(ctx: Ctx, af: AttackFrame): boolean {
  const st = ctx.state
  const atk = attackerOf(st)
  const taken = new Set(af.pools.map((p) => p.defenderId))
  const cands = unitsOnTable(st)
    .filter((u) => u.seat !== atk.seat && !taken.has(u.id))
    .filter((u) => !af.forcedDefenderId)
    .filter((u) => checkTarget(st, atk.id, u.id, targetOpts(af)).ok && poolOptions(st, atk.id, u.id, targetOpts(af)).length > 0)
  if (cands.length === 0) {
    setStage(ctx, 'resolve')
    af.current = 0
    return false
  }
  ctx.raise({
    kind: 'attack.extraDefender',
    seat: atk.seat,
    window: W('attack.poolFormed'),
    context: { attackerId: atk.id },
    options: [
      ...cands.map((u) => ({
        id: `unit:${u.id}`,
        labelKey: 'attack.extraDefender',
        type: 'attack.extraDefender' as const,
        payload: { unitId: u.id },
        data: { distance: distanceLeaderToUnit(st, atk, u) },
      })),
      { id: 'done', labelKey: 'attack.extraDone', type: 'attack.extraDefender' as const, payload: { done: true as const } },
    ],
    canPass: false,
  })
  return true
}

// ---------------------------------------------------------------------------
// Pool resolution (steps R-12.5 to R-12.11)
// ---------------------------------------------------------------------------

const SHIFT_ORDER = (s: ShiftRec): number => (s.dir === -1 ? 0 : 2) + (s.party === 'attacker' ? 0 : 1)

export function applyShifts(ctx: Ctx, pf: PoolFrame): void {
  const ladder = ctx.state.data.dice.ladder.attack
  const sorted = pf.shifts.map((s, i) => ({ s, i })).sort((a, b) => SHIFT_ORDER(a.s) - SHIFT_ORDER(b.s) || a.i - b.i)
  for (const { s } of sorted) {
    const limit = s.count === 0 ? Infinity : s.count
    let done = 0
    const colours: string[] = []
    while (done < limit) {
      const cand = pf.dice
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => (!s.weaponId || d.weaponId === s.weaponId) && !d.changedBy.includes(s.effectId) && shiftColour(ladder, d.colour, s.dir) !== null)
      if (cand.length === 0) break
      const rank = (c: AttackColour) => ladder.indexOf(c)
      const pick = cand.reduce((best, x) => ((s.dir === 1 ? rank(x.d.colour) < rank(best.d.colour) : rank(x.d.colour) > rank(best.d.colour)) ? x : best), cand[0]!)
      const next = shiftColour(ladder, pick.d.colour, s.dir)!
      colours.push(`${pick.d.colour}>${next}`)
      pick.d.colour = next
      pick.d.changedBy.push(s.effectId)
      done++
    }
    if (done > 0) ctx.emit({ type: 'DiceShifted', side: 'attack', dir: s.dir, n: done, source: s.effectId, colours })
  }
  pf.shifts = []
}

function rollInto(ctx: Ctx, dice: AtkDie[], which: number[], purpose: string): void {
  const tables = ctx.state.data.dice
  for (const colour of COLOURS) {
    const idx = which.filter((i) => dice[i]!.colour === colour)
    if (idx.length === 0) continue
    const rolled = ctx.roll(purpose, idx.length, `atk:${colour}` as 'atk:red')
    idx.forEach((di, k) => {
      dice[di]!.face = tables.attack[colour][rolled[k]!]!
    })
  }
}

function count(dice: readonly AtkDie[], face: AttackFace): number {
  return dice.filter((d) => d.face === face).length
}

export function attackSurgeChart(state: GameState, atk: Unit): 'hit' | 'crit' | null {
  const mods = modValues(state, atk, 'attackSurge', { role: 'attacker' }).filter((m) => m.op === 'set')
  if (mods.length > 0) return mods[mods.length - 1]!.value as 'hit' | 'crit'
  return (unitDef(state, atk).surge?.attack ?? null) as 'hit' | 'crit' | null
}

export function defenceSurgeChart(state: GameState, def: Unit, pf: PoolFrame): 'block' | null {
  if (pf.defChart === 'block') return 'block'
  const mods = modValues(state, def, 'defenceSurge', { role: 'defender' }).filter((m) => m.op === 'set')
  if (mods.length > 0) return mods[mods.length - 1]!.value === 'block' ? 'block' : null
  return unitDef(state, def).surge?.defence === 'block' ? 'block' : null
}

/** Dice chosen by an Aim reroll: the engine's `auto` choice (worthless dice first, strongest colours first). */
function autoRerollPick(state: GameState, atk: Unit, pf: PoolFrame, k: number): number[] {
  const chart = attackSurgeChart(state, atk)
  const surgeUseful = chart !== null || tokensOf(atk, 'surge') > 0 || poolHasKeyword(state, pf, 'kw.critical')
  const power = (c: AttackColour) => ({ red: 3, black: 2, white: 1 })[c]
  const worth = (d: AtkDie) => (d.face === 'blank' ? 0 : d.face === 'surge' && !surgeUseful ? 0 : -1)
  return pf.dice
    .map((d, i) => ({ d, i, w: worth(d) }))
    .filter((x) => x.w === 0)
    .sort((a, b) => power(b.d.colour) - power(a.d.colour) || a.i - b.i)
    .slice(0, k)
    .map((x) => x.i)
}

function aimDice(state: GameState, atk: Unit): number {
  return foldNumber(constants(state)['aimRerollDice'] ?? 2, modValues(state, atk, 'aimRerolls', { role: 'attacker' }).map((m) => ({ ...m, value: Number(m.value) })))
}

type Spend = { id: string; choice: string; params?: Record<string, unknown>; data?: Record<string, unknown> }

function raiseSpend(ctx: Ctx, seat: Seat, step: string, window: string, options: Spend[], context: Record<string, unknown>): void {
  ctx.raise({
    kind: 'attack.spend',
    seat,
    window: W(window),
    context: { step, ...context },
    options: options.map((o) => ({
      id: o.id,
      labelKey: `attack.spend.${o.choice}`,
      type: 'attack.spend' as const,
      payload: o.params ? { choice: o.choice, params: o.params } : { choice: o.choice },
      ...(o.data ? { data: o.data } : {}),
    })),
    canPass: false,
  })
}

function faceNames(dice: readonly AtkDie[]): string[] {
  return dice.map((d) => d.face)
}

type PoolResult = 'suspended' | 'done'

function fireP(ctx: Ctx, pf: PoolFrame, window: string): boolean {
  if (pf.windows.includes(window)) return false
  pf.windows.push(window)
  return fireAttackWindow(ctx, window)
}

function resolvePool(ctx: Ctx): PoolResult {
  for (let guard = 0; guard < 100; guard++) {
    const st = ctx.state
    const af = frame(st)
    const pf = poolOf(af)
    const atk = attackerOf(st)
    const def = getUnit(st, pf.defenderId)
    const step: PoolStep = pf.step
    switch (step) {
      case 'start': {
        pf.step = 'roll'
        st.attack!.defenderId = pf.defenderId
        if (fireP(ctx, pf, 'attack.poolFormed')) return 'suspended'
        break
      }
      case 'roll': {
        pf.dice = []
        for (const w of pf.weapons) {
          const dc = weaponDef(st, w.weaponId).dice as Record<AttackColour, number>
          for (const c of COLOURS) for (let i = 0; i < (dc[c] ?? 0); i++) pf.dice.push({ colour: c, face: 'blank', weaponId: w.weaponId, changedBy: [] })
        }
        applyShifts(ctx, pf)
        rollInto(ctx, pf.dice, pf.dice.map((_, i) => i), 'attack')
        ctx.emit({ type: 'AttackRolled', faces: faceNames(pf.dice) }, atk.seat)
        pf.step = 'reroll'
        if (fireP(ctx, pf, 'attack.rolled')) return 'suspended'
        break
      }
      case 'reroll': {
        const aim = tokensOf(atk, 'aim')
        const k = aimDice(st, atk)
        const auto = autoRerollPick(st, atk, pf, k)
        if (aim > 0 && auto.length > 0 && !pf.windows.includes('rerollDone')) {
          raiseReroll(ctx, atk, def, pf, k, auto)
          return 'suspended'
        }
        pf.step = 'surges'
        if (fireP(ctx, pf, 'attack.rerolled')) return 'suspended'
        break
      }
      case 'surges': {
        if (!pf.windows.includes('surgeWindow')) {
          pf.windows.push('surgeWindow')
          // Critical X converts surges to crits first (K-33), then the chart converts the rest
          if (fireP(ctx, pf, 'attack.surgesConverted')) return 'suspended'
        }
        const chart = attackSurgeChart(st, atk)
        if (!pf.windows.includes('chartDone')) {
          pf.windows.push('chartDone')
          let converted = 0
          if (chart) {
            for (const d of pf.dice) {
              if (d.face === 'surge') {
                d.face = chart
                converted++
              }
            }
          }
          if (converted > 0) ctx.emit({ type: 'SurgesConverted', side: 'attack', converted, tokens: 0 }, atk.seat)
        }
        const surges = count(pf.dice, 'surge')
        const tokens = tokensOf(atk, 'surge')
        if (surges > 0 && tokens > 0 && !chart && !pf.windows.includes('surgeTokensDone')) {
          pf.step = 'surgeTokens'
          const max = Math.min(surges, tokens)
          raiseSpend(
            ctx,
            atk.seat,
            'surgeTokens',
            'attack.surgesConverted',
            Array.from({ length: max + 1 }, (_, n) => ({ id: `surge:${n}`, choice: 'surge', params: { n }, data: { n, auto: n === max } })).reverse(),
            { surges, tokens },
          )
          return 'suspended'
        }
        if (finishSurges(ctx, pf, atk)) return 'suspended'
        break
      }
      case 'surgeTokens': {
        // only reached after the answer was applied (the handler moves the step on)
        if (finishSurges(ctx, pf, atk)) return 'suspended'
        break
      }
      case 'sniper': {
        pf.step = pf.cancelled ? 'suppression' : 'cover'
        break
      }
      case 'cover': {
        resolveCover(ctx, pf, atk, def)
        pf.step = 'dodge'
        break
      }
      case 'dodge': {
        if (!pf.windows.includes('dodgeAsked')) {
          pf.windows.push('dodgeAsked')
          const allowed = foldBool(true, modValues(st, atk, 'dodgeAllowed', { role: 'attacker' })) && !poolAllHave(st, pf, 'kw.high-velocity')
          const tokens = tokensOf(def, 'dodge')
          const benefit = hasKeyword(st, def, 'kw.block') && pf.crits > 0
          const max = Math.min(tokens, Math.max(pf.hits, benefit ? 1 : 0))
          if (allowed && max > 0) {
            raiseSpend(
              ctx,
              def.seat,
              'dodge',
              'attack.coverApplied',
              Array.from({ length: max + 1 }, (_, n) => ({ id: `dodge:${n}`, choice: 'dodge', params: { n }, data: { n, auto: n === Math.min(tokens, pf.hits) } })).reverse(),
              { hits: pf.hits, crits: pf.crits, tokens },
            )
            return 'suspended'
          }
        }
        pf.step = 'modifyAtk'
        if (fireP(ctx, pf, 'attack.coverApplied')) return 'suspended'
        break
      }
      case 'modifyAtk': {
        pf.step = 'defRoll'
        if (fireP(ctx, pf, 'attack.modified')) return 'suspended'
        break
      }
      case 'defRoll': {
        if (!pf.windows.includes('backup')) {
          pf.windows.push('backup')
          const b = backupHits(st, atk, def, pf.kind)
          if (b > 0) {
            const n = Math.min(b, pf.hits)
            pf.hits -= n
            if (n > 0) ctx.emit({ type: 'ResultsCancelled', side: 'attack', source: 'backup', result: 'hit', n }, def.seat)
          }
        }
        rollDefence(ctx, pf, def)
        pf.step = 'defSurges'
        if (fireP(ctx, pf, 'defence.rolled')) return 'suspended'
        break
      }
      case 'defSurges': {
        const chart = defenceSurgeChart(st, def, pf)
        const surges = pf.def.filter((f) => f === 'surge').length
        const tokens = tokensOf(def, 'surge')
        if (surges > 0 && tokens > 0 && !chart && !pf.windows.includes('defSurgeTokensDone')) {
          pf.step = 'defSurgeTokens'
          const max = Math.min(surges, tokens)
          raiseSpend(
            ctx,
            def.seat,
            'defSurgeTokens',
            'defence.surgesConverted',
            Array.from({ length: max + 1 }, (_, n) => ({ id: `defSurge:${n}`, choice: 'defSurge', params: { n }, data: { n, auto: n === max } })).reverse(),
            { surges, tokens },
          )
          return 'suspended'
        }
        finishDefSurges(ctx, pf, def)
        if (fireP(ctx, pf, 'defence.surgesConverted')) return 'suspended'
        break
      }
      case 'defSurgeTokens': {
        finishDefSurges(ctx, pf, def)
        if (fireP(ctx, pf, 'defence.surgesConverted')) return 'suspended'
        break
      }
      case 'modifyDef': {
        pf.step = 'compare'
        if (fireP(ctx, pf, 'defence.modified')) return 'suspended'
        break
      }
      case 'compare': {
        pf.wounds = Math.max(0, pf.hits + pf.crits - pf.blocks)
        ctx.emit({ type: 'Compared', hits: pf.hits, crits: pf.crits, blocks: pf.blocks, wounds: pf.wounds }, atk.seat)
        pf.step = 'wounds'
        pf.allocLeft = pf.wounds
        if (pf.kind === 'ranged') {
          const seen = minisSeenByUnit(st, atk, def)
          const cap = seen.reduce((s, m) => s + m.maxWounds, 0)
          pf.allocLeft = Math.min(pf.wounds, cap)
        }
        if (fireP(ctx, pf, 'attack.compared')) return 'suspended'
        break
      }
      case 'wounds': {
        if (assignLoop(ctx, af, pf) === 'suspended') return 'suspended'
        if (pf.woundsSuffered > 0) {
          af.woundsTaken[def.id] = (af.woundsTaken[def.id] ?? 0) + pf.woundsSuffered
          ctx.emit({ type: 'WoundsSuffered', unitId: def.id, n: pf.woundsSuffered, source: 'attack' }, def.seat)
        }
        pf.step = 'suppression'
        break
      }
      case 'suppression': {
        if (!pf.windows.includes('woundsEvent')) {
          pf.windows.push('woundsEvent')
          if (pf.woundsSuffered > 0 && fireWindow(ctx, 'WoundsSuffered', { unitId: def.id }, { name: FRAME })) return 'suspended'
        }
        if (fireP(ctx, pf, 'attack.woundsAssigned')) return 'suspended'
        const defAlive = def.location === 'table' && aliveMinis(def).length > 0
        if (pf.kind === 'ranged' && pf.suppressFlag && defAlive && !pf.windows.includes('suppressionWindow')) {
          pf.windows.push('suppressionWindow')
          pf.step = 'done'
          // Suppressive / Overwhelm add their token in this window, only when the base token is due (R-12.11)
          applySuppression(ctx, def.id, 1, 'attack')
          if (fireP(ctx, pf, 'attack.suppression')) return 'suspended'
        } else pf.step = 'done'
        break
      }
      case 'done':
        return 'done'
    }
  }
  throw new EngineInvariantError('pool did not settle')
}

function raiseReroll(ctx: Ctx, atk: Unit, def: Unit, pf: PoolFrame, k: number, auto: number[]): void {
  const power = (c: AttackColour) => ({ red: 3, black: 2, white: 1 })[c]
  const byFace = new Map<string, number[]>()
  pf.dice.forEach((d, i) => byFace.set(d.face, [...(byFace.get(d.face) ?? []), i]))
  for (const list of byFace.values()) list.sort((a, b) => power(pf.dice[b]!.colour) - power(pf.dice[a]!.colour) || a - b)
  const faces = [...byFace.keys()]
  const options: Spend[] = []
  const autoFaces = auto.map((i) => pf.dice[i]!.face).sort()
  const rec = (fi: number, left: number, chosen: { face: string; idx: number[] }[]): void => {
    if (fi >= faces.length) {
      const n = chosen.reduce((s, c) => s + c.idx.length, 0)
      if (n === 0) return
      const label = chosen.flatMap((c) => c.idx.map(() => c.face)).sort()
      const isAuto = label.length === autoFaces.length && label.every((f, i) => f === autoFaces[i])
      options.push({
        id: `reroll:${label.join('+')}`,
        choice: 'reroll',
        params: { dice: chosen.flatMap((c) => c.idx).sort((a, b) => a - b) },
        data: { faces: label, auto: isAuto },
      })
      return
    }
    const face = faces[fi]!
    const pool = byFace.get(face)!
    for (let take = 0; take <= Math.min(left, pool.length); take++) rec(fi + 1, left - take, take > 0 ? [...chosen, { face, idx: pool.slice(0, take) }] : chosen)
  }
  rec(0, k, [])
  options.sort((a, b) => Number(b.data!['auto']) - Number(a.data!['auto']))
  options.push({ id: 'reroll:done', choice: 'rerollDone' })
  raiseSpend(ctx, atk.seat, 'reroll', 'attack.rerolled', options, { aim: tokensOf(atk, 'aim'), perAim: k, dice: faceNames(pf.dice), defenderId: def.id })
}

/** Remaining surges become blanks; offers the Sniper Team cancel. Returns true when a decision was raised. */
function finishSurges(ctx: Ctx, pf: PoolFrame, atk: Unit): boolean {
  for (const d of pf.dice) if (d.face === 'surge') d.face = 'blank'
  pf.hits = count(pf.dice, 'hit')
  pf.crits = count(pf.dice, 'crit')
  pf.suppressFlag = pf.kind === 'ranged' && pf.hits + pf.crits > 0
  pf.windows.push('surgeTokensDone')
  // Sniper Team: offer the cancel once, after surges are converted
  if (pf.sniperEligible && !pf.sniperOffered && pf.hits + pf.crits > 0) {
    pf.sniperOffered = true
    pf.step = 'sniper'
    raiseSpend(
      ctx,
      atk.seat,
      'sniper',
      'attack.surgesConverted',
      [
        { id: 'sniper:cancel', choice: 'sniperCancel', data: { woundIfCrit: pf.crits > 0 ? 1 : 0 } },
        { id: 'sniper:keep', choice: 'sniperKeep', data: { auto: true } },
      ],
      { hits: pf.hits, crits: pf.crits },
    )
    return true
  }
  pf.step = 'cover'
  return false
}

function resolveCover(ctx: Ctx, pf: PoolFrame, atk: Unit, def: Unit): void {
  const st = ctx.state
  if (pf.kind === 'melee') return
  const verdict = coverVerdict(st, atk, def)
  const level = verdict.level
  ctx.emit({ type: 'CoverApplied', cover: level, byTerrainId: verdict.scan.byTerrainId }, def.seat)
  const blast = !foldBool(true, modValues(st, atk, 'coverCancelsHits', { role: 'attacker' }))
  pf.cover = { level, base: verdict.scan.base, obscured: verdict.scan.obscured, total: verdict.scan.total, byTerrainId: verdict.scan.byTerrainId, dice: [], cancelled: 0 }
  if (level === 'none' || pf.hits === 0 || blast) return
  const lp = modValues(st, def, 'coverPool', { role: 'defender' }).filter((m) => Number(m.value) < 0)
  const fewer = lp.reduce((s, m) => s + -Number(m.value), 0)
  const auto = lp.reduce((s, m) => s + (m.then?.addResult === 'block' ? m.then.n : 0), 0)
  const n = Math.max(0, pf.hits - fewer)
  const tables = st.data.dice
  let faces: DefenceFace[] = []
  if (n > 0) {
    const idx = ctx.roll('cover', n, 'def:white')
    faces = idx.map((i) => tables.defence.white[i]!)
  }
  const cancelled = Math.min(pf.hits, coverCancelled(faces, level) + auto)
  pf.cover.dice = faces
  pf.cover.cancelled = cancelled
  pf.hits -= cancelled
  ctx.emit({ type: 'CoverRolled', level, obscured: verdict.scan.obscured, total: verdict.scan.total, dice: faces, cancelled }, def.seat)
}

function rollDefence(ctx: Ctx, pf: PoolFrame, def: Unit): void {
  const st = ctx.state
  const tables = st.data.dice
  const colour = (unitDef(st, def).defence ?? 'white') as DefenceColour
  const n = pf.hits + pf.crits
  pf.defColour = colour
  pf.def = []
  if (n === 0) return
  const extra = Math.max(0, foldNumber(0, modValues(st, def, 'defenceDice', { role: 'defender' }).map((m) => ({ ...m, value: Number(m.value) }))))
  const idx = ctx.roll('defence', n, `def:${colour}` as 'def:red')
  pf.def = idx.map((i) => tables.defence[colour][i]!)
  if (extra > 0) {
    const ex = ctx.roll('defence.extra', extra, 'def:white')
    pf.def.push(...ex.map((i) => tables.defence.white[i]!))
  }
  ctx.emit({ type: 'DefenceRolled', faces: [...pf.def] }, def.seat)
}

function finishDefSurges(ctx: Ctx, pf: PoolFrame, def: Unit): void {
  const st = ctx.state
  const chart = defenceSurgeChart(st, def, pf)
  const surges = pf.def.filter((f) => f === 'surge').length
  let blocks = pf.def.filter((f) => f === 'block').length
  let converted = 0
  if (chart === 'block') {
    converted = surges
    blocks += surges
  } else {
    const tokens = pf.spent.defender['surge'] ?? 0
    converted = Math.min(tokens, surges)
    blocks += converted
  }
  pf.blocks = blocks
  if (converted > 0) ctx.emit({ type: 'SurgesConverted', side: 'defence', converted, tokens: chart ? 0 : converted }, def.seat)
  pf.windows.push('defSurgeTokensDone')
  pf.step = 'modifyDef'
}

// ---------------------------------------------------------------------------
// Wounds, defeat, leader replacement (R-14)
// ---------------------------------------------------------------------------

function signature(state: GameState, unit: Unit, m: Mini): string {
  return `${miniWeapons(state, unit, m.id).join('+')}|${m.upgradeId ?? ''}|${m.maxWounds}|${m.wounds}`
}

/** Models that must take the next wound (R-14.2): most-wounded non-leader first, then any non-leader, the leader last. */
export function nextTakers(unit: Unit): Mini[] {
  const alive = aliveMinis(unit)
  if (alive.length === 1) return alive
  const non = alive.filter((m) => m.id !== unit.leaderId)
  const wounded = non.filter((m) => m.wounds > 0)
  if (wounded.length > 0) {
    const top = Math.max(...wounded.map((m) => m.wounds))
    return wounded.filter((m) => m.wounds === top)
  }
  return non.length > 0 ? non : alive
}

function weaponWorth(state: GameState, unit: Unit, m: Mini): number {
  return miniWeapons(state, unit, m.id).reduce((s, w) => {
    const d = weaponDef(state, w).dice as Record<AttackColour, number>
    return s + (d.red ?? 0) * 3 + (d.black ?? 0) * 2 + (d.white ?? 0)
  }, 0)
}

/** Classes of identical candidates, the cheapest-to-lose first (the auto choice). */
function classes(state: GameState, unit: Unit, minis: Mini[]): Mini[][] {
  const groups = new Map<string, Mini[]>()
  for (const m of minis) groups.set(signature(state, unit, m), [...(groups.get(signature(state, unit, m)) ?? []), m])
  return [...groups.values()].sort((a, b) => weaponWorth(state, unit, a[0]!) - weaponWorth(state, unit, b[0]!))
}

/** Apply up to `n` wounds to one model; returns wounds taken. Handles defeat of the model and of the unit. */
function woundMini(ctx: Ctx, unit: Unit, m: Mini, n: number, source: string): number {
  const take = Math.min(n, m.maxWounds - m.wounds)
  if (take <= 0) return 0
  m.wounds += take
  ctx.emit({ type: 'WoundsAssigned', miniId: m.id, wounds: take }, unit.seat)
  if (m.wounds >= m.maxWounds) {
    m.alive = false
    ctx.emit({ type: 'MiniDefeated', unitId: unit.id, miniId: m.id }, unit.seat)
    runHook('mini.defeated', { seat: unit.seat, state: ctx.state, engine: ctx, unitId: unit.id, data: { miniId: m.id, source } })
    if (m.id === unit.leaderId) m.isLeader = false
    if (aliveMinis(unit).length === 0) defeatUnit(ctx, unit)
  }
  return take
}

export function defeatUnit(ctx: Ctx, unit: Unit): void {
  dropAssets(ctx, unit) // before the leader leaves: the Asset lands within half range of it (R-18.3)
  unit.location = 'defeated'
  dropOrderToken(ctx, unit) // its token leaves the order pool (WND-008)
  loseStandby(ctx, unit)
  unit.order.state = 'none'
  unit.suppression = 0
  ctx.emit({ type: 'UnitDefeated', unitId: unit.id }, unit.seat)
  runHook('unit.defeated', { seat: unit.seat, state: ctx.state, engine: ctx, unitId: unit.id })
  refreshPanic(ctx)
}

function setLeader(ctx: Ctx, unit: Unit, miniId: string): void {
  const from = unit.leaderId
  for (const m of unit.minis) m.isLeader = m.id === miniId
  unit.leaderId = miniId
  ctx.emit({ type: 'LeaderReplaced', unitId: unit.id, from, to: miniId }, unit.seat)
}

/** The wound loop of one pool; returns 'suspended' when it raised `attack.allocate`. */
function assignLoop(ctx: Ctx, _af: AttackFrame, pf: PoolFrame): PoolResult {
  const st = ctx.state
  const def = getUnit(st, pf.defenderId)
  for (let guard = 0; guard < 500; guard++) {
    if (def.location === 'defeated' || aliveMinis(def).length === 0) return 'done'
    const leader = def.minis.find((m) => m.id === def.leaderId)
    if (!leader || !leader.alive) {
      const alive = aliveMinis(def)
      const cls = classes(st, def, alive)
      if (cls.length === 1) setLeader(ctx, def, cls[0]![0]!.id)
      else {
        raiseAllocate(ctx, def, 'leader', cls, pf.allocLeft)
        return 'suspended'
      }
    }
    if (pf.allocLeft <= 0) return 'done'
    const cls = classes(st, def, nextTakers(def))
    if (cls.length > 1) {
      raiseAllocate(ctx, def, 'wound', cls, pf.allocLeft)
      return 'suspended'
    }
    const m = cls[0]![0]!
    const took = woundMini(ctx, def, m, pf.allocLeft, 'attack')
    pf.allocLeft -= took
    pf.woundsSuffered += took
    if (!m.alive) pf.defeated.push(m.id)
  }
  throw new EngineInvariantError('wound loop did not settle')
}

function raiseAllocate(ctx: Ctx, def: Unit, purpose: 'wound' | 'leader', cls: Mini[][], wounds: number): void {
  const st = ctx.state
  ctx.raise({
    kind: 'attack.allocate',
    seat: def.seat,
    window: W(purpose === 'wound' ? 'attack.woundsAssigned' : 'mini.defeated'),
    context: { purpose, unitId: def.id, wounds },
    options: cls.map((c, i) => ({
      id: `mini:${c[0]!.id}`,
      labelKey: purpose === 'wound' ? 'attack.allocate.wound' : 'attack.allocate.leader',
      type: 'attack.allocate' as const,
      payload: { miniId: c[0]!.id },
      data: { miniId: c[0]!.id, weapons: miniWeapons(st, def, c[0]!.id), wounds: c[0]!.wounds, maxWounds: c[0]!.maxWounds, count: c.length, auto: i === 0 },
    })),
    canPass: false,
  })
}

/**
 * Deal lethal-or-not wounds to a named model (an effect that names a model, R-14.5) and replace a defeated leader at once
 * (R-14.4; automatic: the owner's pick among identical models, else the cheapest to lose).
 */
export function woundSpecific(ctx: Ctx, unitId: string, miniId: string, n: number, source: string): number {
  const unit = getUnit(ctx.state, unitId)
  const m = unit.minis.find((x) => x.id === miniId && x.alive)
  if (!m) return 0
  const took = woundMini(ctx, unit, m, n, source)
  if (took > 0) {
    ctx.emit({ type: 'WoundsSuffered', unitId, n: took, source }, unit.seat)
    if (unit.location !== 'defeated') {
      const leader = unit.minis.find((x) => x.id === unit.leaderId)
      if (!leader || !leader.alive) setLeader(ctx, unit, classes(ctx.state, unit, aliveMinis(unit))[0]![0]!.id)
    }
  }
  return took
}

/**
 * Wounds dealt outside an attack roll (R-14.5): no defence, no suppression. The sufferer assigns them in the normal order;
 * the engine picks the cheapest model among equals (RULING Port choice: effect wounds are allocated automatically).
 */
export function sufferWounds(ctx: Ctx, unitId: string, n: number, source: string): number {
  const unit = getUnit(ctx.state, unitId)
  let left = n
  let total = 0
  while (left > 0 && unit.location !== 'defeated' && aliveMinis(unit).length > 0) {
    const leader = unit.minis.find((m) => m.id === unit.leaderId)
    if (!leader || !leader.alive) setLeader(ctx, unit, classes(ctx.state, unit, aliveMinis(unit))[0]![0]!.id)
    const m = classes(ctx.state, unit, nextTakers(unit))[0]![0]!
    const took = woundMini(ctx, unit, m, left, source)
    left -= took
    total += took
  }
  if (total > 0) {
    ctx.emit({ type: 'WoundsSuffered', unitId, n: total, source }, unit.seat)
    if (unit.location !== 'defeated') {
      const leader = unit.minis.find((m) => m.id === unit.leaderId)
      if (!leader || !leader.alive) setLeader(ctx, unit, classes(ctx.state, unit, aliveMinis(unit))[0]![0]!.id)
    }
    fireWindow(ctx, 'WoundsSuffered', { unitId })
  }
  return total
}

// ---------------------------------------------------------------------------
// The module: answers to attack.* decisions
// ---------------------------------------------------------------------------

function lookupPool(state: GameState, action: Extract<Action, { type: 'attack.pool' }>): { kind: AttackKind; weapons: PoolWeapon[] } | { error: string; code: 'E_ACTION_RESTRICTED' | 'E_INVALID_TARGET' } {
  const af = frame(state)
  const atk = attackerOf(state)
  const defenderId = state.attack!.defenderId!
  const entries = Object.entries(action.payload.weaponIds)
  if (entries.length === 0) return { error: 'a pool needs at least one weapon', code: 'E_ACTION_RESTRICTED' }
  const kinds = new Set<AttackKind>()
  const weapons: PoolWeapon[] = []
  for (const [miniId, weaponId] of entries) {
    const m = atk.minis.find((x) => x.id === miniId && x.alive)
    if (!m) return { error: `${miniId} is not a model of the attacking unit`, code: 'E_ACTION_RESTRICTED' }
    if (af.usedMinis.includes(miniId)) return { error: `${miniId} already added a weapon`, code: 'E_ACTION_RESTRICTED' }
    if (!miniWeapons(state, atk, miniId).includes(weaponId)) return { error: `${miniId} cannot use ${weaponId}`, code: 'E_ACTION_RESTRICTED' }
    if (af.usedWeapons.includes(weaponId)) return { error: `${weaponId} is already in another pool`, code: 'E_ACTION_RESTRICTED' }
    weapons.push({ miniId, weaponId })
    for (const t of weaponTypes(weaponDef(state, weaponId))) kinds.add(t)
  }
  // a weapon with both icons takes the kind of the pool: melee against a unit the attacker is engaged with, ranged otherwise
  const allowed = new Set<AttackKind>(['melee', 'ranged'])
  for (const w of weapons) {
    const own = weaponTypes(weaponDef(state, w.weaponId))
    for (const k of [...allowed]) if (!own.includes(k)) allowed.delete(k)
  }
  if (allowed.size === 0) return { error: 'melee and ranged weapons cannot share a pool', code: 'E_ACTION_RESTRICTED' }
  const kind: AttackKind = allowed.size === 1 ? [...allowed][0]! : engagedUnitIds(state, atk).includes(defenderId) ? 'melee' : 'ranged'
  return { kind, weapons }
}

export const attackModule: ModuleDef = {
  id: 'attack',
  namespaces: ['attack'],
  explain(state, action) {
    if (!state.attack) return null
    if (action.type === 'attack.defender') {
      const af = frame(state)
      const atk = attackerOf(state)
      const check = checkTarget(state, atk.id, action.payload.unitId, targetOpts(af))
      if (!state.units[action.payload.unitId]) return { code: 'E_INVALID_TARGET', reason: `${action.payload.unitId} is not a unit` }
      if (check.reason === 'noLos') return { code: 'E_NOT_VISIBLE', reason: 'the attacking leader has no line of sight to that unit' }
      if (check.reason === 'engaged') return { code: 'E_ENGAGED', reason: 'engaged units can neither make nor receive ranged attacks' }
      return { code: 'E_INVALID_TARGET', reason: `that unit cannot be attacked (${check.reason ?? 'not eligible'})`, details: { reason: check.reason } }
    }
    if (action.type === 'attack.pool') {
      const r = lookupPool(state, action)
      if ('error' in r) return { code: r.code, reason: r.error }
      return { code: 'E_ACTION_RESTRICTED', reason: 'that is not a legal pool: same-named weapons stay together and every eligible model has line of sight' }
    }
    return null
  },
  handle(state, action, pending) {
    if (!state.attack) return reject('E_WRONG_DECISION', 'no attack in progress')
    if (action.type === 'pass') {
      if (pending.kind !== 'attack.defender') return reject('E_PASS_NOT_ALLOWED', 'this decision cannot be passed')
      return {
        run(ctx) {
          const atk = attackerOf(ctx.state)
          ctx.emit({ type: 'AttackSkipped', attackerId: atk.id, reason: 'cancelled' }, atk.seat)
          finishAttack(ctx, 'cancelled')
        },
      }
    }
    switch (action.type) {
      case 'attack.defender': {
        const unitId = action.payload.unitId
        return {
          run(ctx) {
            const af = frame(ctx.state)
            ctx.state.attack!.defenderId = unitId
            const atk = attackerOf(ctx.state)
            ctx.emit({ type: 'AttackDeclared', attackerId: atk.id, defenderId: unitId }, atk.seat)
            setStage(ctx, 'form')
            if (fireWindow(ctx, 'attack.defenderDeclared', {}, { name: FRAME })) return
            void af
            advance(ctx)
          },
        }
      }
      case 'attack.pool': {
        const r = lookupPool(state, action)
        if ('error' in r) return reject(r.code, r.error)
        return {
          run(ctx) {
            const af = frame(ctx.state)
            const atk = attackerOf(ctx.state)
            const defenderId = ctx.state.attack!.defenderId!
            const pf = blankPool(defenderId, r.kind, r.weapons)
            af.pools.push(pf)
            for (const w of r.weapons) {
              af.usedMinis.push(w.miniId)
              if (!af.usedWeapons.includes(w.weaponId)) af.usedWeapons.push(w.weaponId)
            }
            ctx.emit({ type: 'WeaponsAdded', attackerId: atk.id, defenderId, kind: r.kind, weapons: r.weapons }, atk.seat)
            ctx.emit({ type: 'PoolFormed', attackerId: atk.id, dice: poolDiceCounts(ctx.state, r.weapons) }, atk.seat)
            setStage(ctx, 'extra')
            advance(ctx)
          },
        }
      }
      case 'attack.extraDefender': {
        const p = action.payload
        return {
          run(ctx) {
            const af = frame(ctx.state)
            if (p.done || !p.unitId) {
              setStage(ctx, 'resolve')
              af.current = 0
            } else {
              ctx.state.attack!.defenderId = p.unitId
              const atk = attackerOf(ctx.state)
              ctx.emit({ type: 'AttackDeclared', attackerId: atk.id, defenderId: p.unitId }, atk.seat)
              setStage(ctx, 'form')
            }
            advance(ctx)
          },
        }
      }
      case 'attack.spend':
        return { run: (ctx) => applySpend(ctx, pending, action.payload.choice, action.payload.params ?? {}) }
      case 'attack.allocate':
        return { run: (ctx) => applyAllocate(ctx, pending, action.payload.miniId) }
      default:
        return reject('E_WRONG_DECISION', `${action.type} is not an attack decision`)
    }
  },
}

function applySpend(ctx: Ctx, pending: PendingDecision, choice: string, params: Record<string, unknown>): void {
  const st = ctx.state
  const af = frame(st)
  const pf = poolOf(af)
  const atk = attackerOf(st)
  const def = getUnit(st, pf.defenderId)
  switch (choice) {
    case 'rerollDone':
      pf.windows.push('rerollDone')
      break
    case 'reroll': {
      const which = (params['dice'] as number[]) ?? []
      loseToken(ctx, atk.id, 'aim', 1, 'aim')
      pf.spent.attacker['aim'] = (pf.spent.attacker['aim'] ?? 0) + 1
      rollInto(ctx, pf.dice, which, 'reroll')
      ctx.emit({ type: 'Rerolled', indexes: which, faces: which.map((i) => pf.dice[i]!.face) }, atk.seat)
      break
    }
    case 'surge': {
      const n = Number(params['n'] ?? 0)
      let left = n
      for (const d of pf.dice) {
        if (left > 0 && d.face === 'surge') {
          d.face = 'hit'
          left--
        }
      }
      loseToken(ctx, atk.id, 'surge', n - left, 'surge')
      pf.spent.attacker['surge'] = (pf.spent.attacker['surge'] ?? 0) + (n - left)
      ctx.emit({ type: 'SurgesConverted', side: 'attack', converted: n - left, tokens: n - left }, atk.seat)
      pf.windows.push('surgeTokensDone')
      break
    }
    case 'sniperCancel': {
      const crits = pf.crits
      pf.cancelled = true
      for (const d of pf.dice) d.face = 'blank'
      pf.hits = 0
      pf.crits = 0
      ctx.emit({ type: 'ResultsCancelled', side: 'attack', source: 'kw.sniper-team', result: 'all', n: pf.dice.length }, atk.seat)
      if (crits > 0) sufferWounds(ctx, def.id, 1, 'kw.sniper-team')
      pf.step = 'suppression'
      break
    }
    case 'sniperKeep':
      pf.step = 'cover'
      break
    case 'dodge': {
      const n = Number(params['n'] ?? 0)
      if (n > 0) {
        loseToken(ctx, def.id, 'dodge', n, 'dodge')
        const cancel = Math.min(n, pf.hits)
        pf.hits -= cancel
        pf.spent.defender['dodge'] = n
        ctx.emit({ type: 'DodgeSpent', unitId: def.id, cancelled: cancel }, def.seat)
      }
      break
    }
    case 'defSurge': {
      const n = Number(params['n'] ?? 0)
      loseToken(ctx, def.id, 'surge', n, 'surge')
      pf.spent.defender['surge'] = (pf.spent.defender['surge'] ?? 0) + n
      break
    }
    default:
      throw new EngineInvariantError(`unknown attack.spend choice ${choice} (${pending.id})`)
  }
  advance(ctx)
}

function applyAllocate(ctx: Ctx, pending: PendingDecision, miniId: string): void {
  const st = ctx.state
  const af = frame(st)
  const pf = poolOf(af)
  const def = getUnit(st, pf.defenderId)
  const purpose = String(pending.context['purpose'])
  if (purpose === 'leader') setLeader(ctx, def, miniId)
  else {
    const m = def.minis.find((x) => x.id === miniId)!
    const took = woundMini(ctx, def, m, pf.allocLeft, 'attack')
    pf.allocLeft -= took
    pf.woundsSuffered += took
    if (!m.alive) pf.defeated.push(m.id)
  }
  advance(ctx)
}

// helpers re-exported for the keywords module and tests
export { gainToken, addEffect, courageOf }
export type { DefenceFace }
