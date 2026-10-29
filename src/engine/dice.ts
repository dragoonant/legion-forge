// Dice (R-13): attack d8 (red, black, white) and defence d6 (red, white) faces come from data as parameters; rolls go
// through the Rng (a face index per die); upgrade/downgrade follow the colour ladders; `*Distribution` give the exact
// pool odds query.* shows. Pure: no state, no clock.
import type { Rng } from './rng'
import type {
  AttackColour,
  AttackFace,
  DefenceColour,
  DefenceFace,
  DiceDef,
  DiceTables,
  DieId,
} from './types'
import { EngineInvariantError } from './state'

// ---------------------------------------------------------------------------
// Face tables
// ---------------------------------------------------------------------------

function expand<F extends string>(sides: number, counts: Record<F, number>, order: readonly F[], what: string): F[] {
  const out: F[] = []
  for (const f of order) for (let i = 0; i < (counts[f] ?? 0); i++) out.push(f)
  if (out.length !== sides) throw new EngineInvariantError(`${what}: face counts sum to ${out.length}, not ${sides}`)
  return out
}

/** Expand the counts of `core/dice.json` into per-index face tables (index follows `faceOrder`). */
export function compileDice(def: DiceDef): DiceTables {
  const attack = {} as Record<AttackColour, AttackFace[]>
  for (const c of ['red', 'black', 'white'] as const) {
    attack[c] = expand(def.attack[c].sides, def.attack[c].faces, def.attack.faceOrder, `attack ${c}`)
  }
  const defence = {} as Record<DefenceColour, DefenceFace[]>
  for (const c of ['red', 'white'] as const) {
    defence[c] = expand(def.defence[c].sides, def.defence[c].faces, def.defence.faceOrder, `defence ${c}`)
  }
  return { attack, defence, ladder: { attack: [...def.ladder.attack], defence: [...def.ladder.defence] } }
}

/** The face names of a die in index order; 'd6' is '1'..'6'. */
export function facesOf(tables: DiceTables, die: DieId): string[] {
  if (die === 'd6') return ['1', '2', '3', '4', '5', '6']
  const [side, colour] = die.split(':') as ['atk' | 'def', string]
  return side === 'atk' ? tables.attack[colour as AttackColour] : tables.defence[colour as DefenceColour]
}

export function dieSides(tables: DiceTables, die: DieId): number {
  return facesOf(tables, die).length
}

export interface RolledDice {
  indexes: number[]
  faces: string[]
}

/** Roll `n` dice of one kind: one `rng.int(sides)` per die. */
export function rollDice(rng: Rng, tables: DiceTables, die: DieId, n: number): RolledDice {
  const faces = facesOf(tables, die)
  const indexes: number[] = []
  for (let i = 0; i < n; i++) indexes.push(rng.int(faces.length))
  return { indexes, faces: indexes.map((i) => faces[i]!) }
}

export function dieId(side: 'attack' | 'defence', colour: string): DieId {
  return `${side === 'attack' ? 'atk' : 'def'}:${colour}` as DieId
}

// ---------------------------------------------------------------------------
// Upgrade / downgrade (R-13.2, ATK-008)
// ---------------------------------------------------------------------------

export type Side = 'attack' | 'defence'

/** A die in a pool: its current colour and the effects that already changed it (one effect changes a die at most once). */
export interface PoolDie<C extends string = string> {
  colour: C
  changedBy: string[]
}

export function poolOf<C extends string>(colours: readonly C[]): PoolDie<C>[] {
  return colours.map((colour) => ({ colour, changedBy: [] }))
}

/**
 * Step a colour along its ladder (`ladder` is ordered weakest to strongest). Returns null at the end of the ladder:
 * red cannot be upgraded, white cannot be downgraded (a no-op, never an error).
 */
export function shiftColour<C extends string>(ladder: readonly C[], colour: C, dir: 1 | -1): C | null {
  const i = ladder.indexOf(colour)
  if (i < 0) throw new EngineInvariantError(`colour ${colour} is not on the ladder`)
  const j = i + dir
  return j < 0 || j >= ladder.length ? null : ladder[j]!
}

/** Change one die by `dir` steps for `effectId`; the same die is returned unchanged if the ladder ends or the effect already changed it. */
export function shiftDie<C extends string>(ladder: readonly C[], die: PoolDie<C>, dir: 1 | -1, effectId: string): PoolDie<C> {
  if (die.changedBy.includes(effectId)) return die
  const next = shiftColour(ladder, die.colour, dir)
  if (next === null) return die
  return { colour: next, changedBy: [...die.changedBy, effectId] }
}

export interface ColourShift {
  effectId: string
  party: 'attacker' | 'defender'
  dir: 1 | -1
  /** how many different dice the effect changes */
  count: number
}

const SHIFT_ORDER = (s: ColourShift): number => (s.dir === -1 ? 0 : 2) + (s.party === 'attacker' ? 0 : 1)

/**
 * Apply colour shifts in the rule order: attacker downgrades, defender downgrades, attacker upgrades, defender
 * upgrades. Each effect changes up to `count` distinct dice; unless `choose` says otherwise an upgrade takes the
 * weakest die and a downgrade the strongest die that can still move.
 */
export function applyColourShifts<C extends string>(
  ladder: readonly C[],
  pool: readonly PoolDie<C>[],
  shifts: readonly ColourShift[],
  choose?: (candidates: number[], pool: readonly PoolDie<C>[], shift: ColourShift) => number,
): PoolDie<C>[] {
  const out = pool.map((d) => ({ ...d, changedBy: [...d.changedBy] }))
  const ordered = shifts.map((s, i) => ({ s, i })).sort((a, b) => SHIFT_ORDER(a.s) - SHIFT_ORDER(b.s) || a.i - b.i)
  for (const { s } of ordered) {
    for (let n = 0; n < s.count; n++) {
      const candidates = out
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => !d.changedBy.includes(s.effectId) && shiftColour(ladder, d.colour, s.dir) !== null)
        .map(({ i }) => i)
      if (candidates.length === 0) break
      let pick: number
      if (choose) pick = choose(candidates, out, s)
      else {
        const rank = (i: number) => ladder.indexOf(out[i]!.colour)
        pick = candidates.reduce((best, i) => ((s.dir === 1 ? rank(i) < rank(best) : rank(i) > rank(best)) ? i : best), candidates[0]!)
      }
      out[pick] = shiftDie(ladder, out[pick]!, s.dir, s.effectId)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Exact distributions (query.attackOdds / defenceOdds)
// ---------------------------------------------------------------------------

export type AttackSurge = 'hit' | 'crit' | 'blank'
export type DefenceSurge = 'block' | 'blank'

/** Joint distribution of a pool's (hits, crits): `p[h][c]`. */
export interface HitCritDist {
  dice: number
  p: number[][]
}

/** Exact (hits, crits) distribution of attack dice after surge conversion (`surge`: the chart, or blank for none). */
export function attackDistribution(tables: DiceTables, colours: readonly AttackColour[], surge: AttackSurge): HitCritDist {
  let p: number[][] = [[1]]
  let n = 0
  for (const colour of colours) {
    const faces = tables.attack[colour]
    const sides = faces.length
    const next: number[][] = Array.from({ length: n + 2 }, () => new Array<number>(n + 2).fill(0))
    for (let h = 0; h <= n; h++) {
      for (let c = 0; c <= n - h; c++) {
        const pr = p[h]?.[c] ?? 0
        if (pr === 0) continue
        for (const f of faces) {
          const eff: 'hit' | 'crit' | 'blank' = f === 'surge' ? surge : f
          const nh = h + (eff === 'hit' ? 1 : 0)
          const nc = c + (eff === 'crit' ? 1 : 0)
          next[nh]![nc]! += pr / sides
        }
      }
    }
    p = next
    n++
  }
  return { dice: n, p }
}

/** P(blocks = b) for `n` defence dice of one colour; surges count as blocks only with a chart. */
export function defenceBlockDistribution(tables: DiceTables, colour: DefenceColour, n: number, surge: DefenceSurge): number[] {
  const faces = tables.defence[colour]
  const pBlock = faces.filter((f) => f === 'block' || (f === 'surge' && surge === 'block')).length / faces.length
  const out: number[] = []
  let choose = 1
  for (let b = 0; b <= n; b++) {
    out.push(choose * Math.pow(pBlock, b) * Math.pow(1 - pBlock, n - b))
    choose = (choose * (n - b)) / (b + 1)
  }
  return out
}

/**
 * Wounds = hits + crits - blocks, never below 0 (R-12.10), with one defence die per remaining hit or crit. Returns
 * P(wounds = w) for w = 0..dice. Cover, Dodge and tokens are applied by the caller before this (they change the
 * (hits, crits) input; see `reduceHits`).
 */
export function woundDistribution(attack: HitCritDist, tables: DiceTables, defence: DefenceColour, surge: DefenceSurge): number[] {
  const out = new Array<number>(attack.dice + 1).fill(0)
  for (let h = 0; h <= attack.dice; h++) {
    for (let c = 0; c <= attack.dice - h; c++) {
      const pr = attack.p[h]?.[c] ?? 0
      if (pr === 0) continue
      const n = h + c
      const blocks = defenceBlockDistribution(tables, defence, n, surge)
      for (let b = 0; b <= n; b++) out[Math.max(0, n - b)]! += pr * blocks[b]!
    }
  }
  return out
}

/** Distribution after cancelling up to `k` hits (never crits), e.g. Dodge tokens: hits are cancelled first. */
export function reduceHits(dist: HitCritDist, k: number): HitCritDist {
  const p: number[][] = Array.from({ length: dist.dice + 1 }, () => new Array<number>(dist.dice + 1).fill(0))
  for (let h = 0; h <= dist.dice; h++) {
    for (let c = 0; c <= dist.dice - h; c++) {
      const pr = dist.p[h]?.[c] ?? 0
      if (pr !== 0) p[Math.max(0, h - k)]![c]! += pr
    }
  }
  return { dice: dist.dice, p }
}

export function expectedOf(dist: readonly number[]): number {
  return dist.reduce((s, pr, i) => s + pr * i, 0)
}

/** P(hits + crits >= 1) of a pool distribution. */
export function pAtLeastOneSuccess(dist: HitCritDist): number {
  return 1 - (dist.p[0]?.[0] ?? 0)
}

// ---------------------------------------------------------------------------
// Rolled cover (R-11.4)
// ---------------------------------------------------------------------------

/** Hits cancelled by a rolled cover pool (one white defence die per hit): light = blocks, heavy = blocks and surges. */
export function coverCancelled(faces: readonly DefenceFace[], cover: 'none' | 'light' | 'heavy'): number {
  if (cover === 'none') return 0
  return faces.filter((f) => f === 'block' || (cover === 'heavy' && f === 'surge')).length
}

/** P(cancelled = k) for a cover pool of `hits` white defence dice. */
export function coverDistribution(tables: DiceTables, hits: number, cover: 'none' | 'light' | 'heavy'): number[] {
  if (cover === 'none') return [1, ...new Array<number>(hits).fill(0)]
  return defenceBlockDistribution(tables, 'white', hits, cover === 'heavy' ? 'block' : 'blank')
}
