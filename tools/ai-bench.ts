// npm run bench:ai -- --games 40 [--seed 1] [--start 0] [--tier normal] [--vs random|easy|normal] [--matchup mirror|main|all]
//                     [--holdout] [--jobs 4] [--rounds N] [--weights threat=0.7,...] [--vs-weights ...] [--out path]
// The tested tier plays both seats in turn (game g: seat A on even games, B on odd; the lists swap every cycle) against the
// opponent tier. Matchups rotate through the fixed Empire mirror and the main matchup (Empire vs Rebels); battle cards rotate
// through the Recon deck (objective x secondary x advantages). `--holdout` uses seeds and game indexes that tuning never touches.
// A win is the engine's result; only decisive results count toward the win rate (a draw at the round limit is reported apart).
// Gates (docs/spec/40-ai.md section 7): normal beats random >= 95%, zero rejections / stalls / fallbacks / unhandled kinds /
// errors, zero-action activations < 2%, mean decision < 50 ms. `--jobs N` plays the games in N processes.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Seat } from '../src/engine'
import { createAiDecider } from '../src/ai/decider'
import { aiBudgetMs, type Tier } from '../src/ai/tiers'
import { playMatch, type MatchResult } from './ai-match'
import { simBundle, simSetupFor, type Matchup } from './sim-setup'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback
}
const flag = (name: string) => process.argv.includes(`--${name}`)

function weightsArg(name: string): Record<string, number> | undefined {
  const t = arg(name, '')
  if (!t) return undefined
  return Object.fromEntries(t.split(',').map((kv) => [kv.split('=')[0]!.trim(), Number(kv.split('=')[1])]))
}

const OUT = arg('out', 'tools/out/bench-report.json')
const tier = arg('tier', 'normal') as Tier
const vs = arg('vs', 'random') as Tier
const games = Number(arg('games', '40'))
const holdout = flag('holdout')
const start = Number(arg('start', holdout ? '1000' : '0'))
const seed = arg('seed', holdout ? 'holdout' : 'tune')
const matchup = arg('matchup', 'all') as Matchup
const rounds = arg('rounds', '')
const jobs = Math.max(1, Number(arg('jobs', '1')))
const myWeights = weightsArg('weights')
const vsWeights = weightsArg('vs-weights')

interface Row {
  game: number
  seed: string
  aiSeat: Seat
  armies: Record<Seat, string>
  battle: string[]
  result: 'win' | 'loss' | 'draw' | 'unfinished'
  reason: string | null
  points: Record<Seat, number>
  rounds: number
  decisions: number
  ms: number
  stalled: boolean
  firstRejection: string | null
  rejections: number
  oppRejections: number
  ai: {
    decisions: number
    ms: number
    maxMs: number
    fallbacks: number
    unhandled: Record<string, number>
    errors: number
    hardStops: number
    capped: number
    samples: number[]
    byKind: Record<string, { n: number; ms: number; max: number; fallbacks: number }>
    behaviour: ReturnType<typeof createAiDecider>['memory']['stats']['behaviour']
  }
  seatStats: MatchResult['seats'][Seat]
  events: MatchResult['behaviour'][Seat]
  kinds: Record<string, number>
}

function playGame(g: number): Row {
  const bundle = simBundle()
  const setupFor = simSetupFor(bundle, { matchup, ...(rounds ? { rounds: Number(rounds) } : {}) })
  const setup = setupFor(g)
  const aiSeat: Seat = g % 2 === 0 ? 'A' : 'B'
  const other: Seat = aiSeat === 'A' ? 'B' : 'A'
  const gameSeed = `${seed}-${g}`
  const ai = createAiDecider(tier, { seed: `${gameSeed}:${aiSeat}`, ...(myWeights ? { weights: myWeights } : {}) })
  const opp = createAiDecider(vs, { seed: `${gameSeed}:${other}`, ...(vsWeights ? { weights: vsWeights } : {}) })
  const m = playMatch(setup, bundle, gameSeed, { [aiSeat]: ai, [other]: opp } as Record<Seat, typeof ai>)
  const result: Row['result'] = !m.ended ? 'unfinished' : m.winner === 'draw' || m.winner === null ? 'draw' : m.winner === aiSeat ? 'win' : 'loss'
  const st = ai.memory.stats
  return {
    game: g,
    seed: gameSeed,
    aiSeat,
    armies: { A: String(setup.armies.A.listId ?? setup.armies.A.factionId), B: String(setup.armies.B.listId ?? setup.armies.B.factionId) },
    battle: setup.battle && 'cards' in setup.battle ? setup.battle.cards : [],
    result,
    reason: m.reason,
    points: m.points,
    rounds: m.rounds,
    decisions: m.decisions,
    ms: m.ms,
    stalled: m.stalled || !m.ended,
    firstRejection: m.firstRejection,
    rejections: m.seats[aiSeat].rejections,
    oppRejections: m.seats[other].rejections,
    ai: { decisions: st.decisions, ms: st.ms, maxMs: st.maxMs, fallbacks: st.fallbacks, unhandled: st.unhandled, errors: st.errors, hardStops: st.hardStops, capped: st.capped, samples: st.samples, byKind: st.byKind, behaviour: st.behaviour },
    seatStats: m.seats[aiSeat],
    events: m.behaviour[aiSeat],
    kinds: m.kinds,
  }
}

const label = (r: Row) => {
  const a = r.armies[r.aiSeat].replace(/^.*list\./, '')
  const o = r.armies[r.aiSeat === 'A' ? 'B' : 'A'].replace(/^.*list\./, '')
  return `game ${String(r.game).padStart(4)} ${r.aiSeat} ${a} v ${o} ${r.battle[0]?.replace('rec.obj.', '').slice(0, 9).padEnd(9)} ${r.result.padEnd(4)} ${r.reason ?? '-'} r${r.rounds} pts=${r.points.A}-${r.points.B} dec=${r.decisions} ai=${Math.round(r.ai.ms)}ms rej=${r.rejections} fb=${r.ai.fallbacks}${r.firstRejection ? ` REJ(${r.firstRejection.slice(0, 160)})` : ''}`
}

async function runParent(): Promise<void> {
  const t0 = Date.now()
  const rows: Row[] = []
  const per = Array.from({ length: jobs }, () => [] as number[])
  for (let i = 0; i < games; i++) per[i % jobs]!.push(start + i)
  const children = per
    .filter((list) => list.length > 0)
    .map(
      (list) =>
        new Promise<void>((resolve) => {
          const args = ['--import', 'tsx', 'tools/ai-bench.ts', '--child', list.join(','), ...process.argv.slice(2)]
          const c = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'], env: process.env })
          let buf = ''
          c.stdout.on('data', (d: Buffer) => {
            buf += d.toString()
            let i
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i)
              buf = buf.slice(i + 1)
              if (line.startsWith('ROW ')) {
                const r = JSON.parse(line.slice(4)) as Row
                rows.push(r)
                console.log(label(r))
              } else if (line) console.log(line)
            }
          })
          c.on('close', () => resolve())
        }),
    )
  await Promise.all(children)
  rows.sort((a, b) => a.game - b.game)
  report(rows, Date.now() - t0)
}

function pctile(xs: number[], p: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!
}

function report(rows: Row[], wallMs: number): void {
  const wins = rows.filter((r) => r.result === 'win').length
  const losses = rows.filter((r) => r.result === 'loss').length
  const draws = rows.filter((r) => r.result === 'draw').length
  const unfinished = rows.filter((r) => r.result === 'unfinished').length
  const decisive = wins + losses
  const winRate = decisive ? wins / decisive : 0
  const samples = rows.flatMap((r) => r.ai.samples)
  const aiMs = rows.reduce((a, r) => a + r.ai.ms, 0)
  const aiDec = rows.reduce((a, r) => a + r.ai.decisions, 0)
  const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0)
  const rejections = sum((r) => r.rejections)
  const oppRejections = sum((r) => r.oppRejections)
  const fallbacks = sum((r) => r.ai.fallbacks)
  const errors = sum((r) => r.ai.errors)
  const hardStops = sum((r) => r.ai.hardStops)
  const capped = sum((r) => r.ai.capped)
  const stalls = rows.filter((r) => r.stalled).length
  const unhandled: Record<string, number> = {}
  for (const r of rows) for (const [k, v] of Object.entries(r.ai.unhandled)) unhandled[k] = (unhandled[k] ?? 0) + v
  const acts = sum((r) => r.ai.behaviour.activations)
  const zero = sum((r) => r.ai.behaviour.zeroAction)
  const empty = sum((r) => r.seatStats.emptyActivations)
  const evActs = sum((r) => r.seatStats.activations)
  const byKind: Record<string, { n: number; ms: number; max: number; fallbacks: number }> = {}
  for (const r of rows)
    for (const [k, v] of Object.entries(r.ai.byKind)) {
      const a = (byKind[k] ??= { n: 0, ms: 0, max: 0, fallbacks: 0 })
      a.n += v.n
      a.ms += v.ms
      a.max = Math.max(a.max, v.max)
      a.fallbacks += v.fallbacks
    }
  const kinds: Record<string, number> = {}
  for (const r of rows) for (const [k, v] of Object.entries(r.kinds)) kinds[k] = (kinds[k] ?? 0) + v
  const group = (key: (r: Row) => string) => {
    const out: Record<string, { games: number; wins: number; losses: number; draws: number }> = {}
    for (const r of rows) {
      const g = (out[key(r)] ??= { games: 0, wins: 0, losses: 0, draws: 0 })
      g.games++
      if (r.result === 'win') g.wins++
      else if (r.result === 'loss') g.losses++
      else g.draws++
    }
    return out
  }
  const bySeat = group((r) => `seat ${r.aiSeat}`)
  const byMatchup = group((r) => (r.armies.A.split('.')[0] === r.armies.B.split('.')[0] ? 'mirror ' : 'main ') + r.armies[r.aiSeat].split('.')[0])
  const byObjective = group((r) => r.battle[0] ?? '?')
  const byReason: Record<string, number> = {}
  for (const r of rows) byReason[r.reason ?? 'none'] = (byReason[r.reason ?? 'none'] ?? 0) + 1
  const tok = (k: 'aim' | 'dodge' | 'standby') => ({ gained: sum((r) => r.events.tokens[k].gained), spent: sum((r) => r.events.tokens[k].spent), expired: sum((r) => r.events.tokens[k].expired) })
  const points: Record<string, number> = {}
  for (const r of rows) for (const [k, v] of Object.entries(r.events.points)) points[k] = (points[k] ?? 0) + v
  const behaviour = {
    zeroActionActivations: zero,
    emptyActivationsByEvents: empty,
    activations: acts,
    eventActivations: evActs,
    attacks: sum((r) => r.events.attacks),
    attacksPerGame: rows.length ? sum((r) => r.events.attacks) / rows.length : 0,
    attackWounds: sum((r) => r.events.attackWounds),
    tokens: { aim: tok('aim'), dodge: tok('dodge'), standby: tok('standby') },
    standbyTriggers: sum((r) => r.events.standbyTriggers),
    charges: sum((r) => r.events.charges),
    meleeContacts: sum((r) => r.events.meleeContacts),
    meleePools: sum((r) => r.events.meleePools),
    claims: sum((r) => r.events.claims),
    pointsByReason: points,
    pointsPerGame: rows.length ? Object.values(points).reduce((a, b) => a + b, 0) / rows.length : 0,
    ordersUsed: sum((r) => r.events.ordersUsed),
    poolDraws: sum((r) => r.events.poolDraws),
    unitsDefeated: sum((r) => r.events.unitsDefeated),
    actionMix: rows.reduce<Record<string, number>>((m, r) => {
      for (const [k, v] of Object.entries(r.seatStats.actions)) m[k] = (m[k] ?? 0) + v
      return m
    }, {}),
  }
  const rep = {
    tier,
    vs,
    matchup,
    holdout,
    seed,
    start,
    games: rows.length,
    budgetMs: aiBudgetMs(),
    wins,
    losses,
    draws,
    unfinished,
    decisive,
    winRate,
    byReason,
    bySeat,
    byMatchup,
    byObjective,
    meanDecisionMs: aiDec ? aiMs / aiDec : 0,
    p50DecisionMs: pctile(samples, 0.5),
    p95DecisionMs: pctile(samples, 0.95),
    maxDecisionMs: Math.max(0, ...rows.map((r) => r.ai.maxMs)),
    decisions: aiDec,
    rejections,
    opponentRejections: oppRejections,
    fallbacks,
    unhandledKinds: unhandled,
    policyErrors: errors,
    hardStops,
    capped,
    stalls,
    zeroActionShare: acts ? zero / acts : 0,
    behaviour,
    decisionKindsSeen: kinds,
    timingByKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, { n: v.n, meanMs: v.ms / Math.max(1, v.n), maxMs: v.max, fallbacks: v.fallbacks }])),
    wallMs,
    rows: rows.map((r) => ({ ...r, ai: { ...r.ai, samples: undefined } })),
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(rep, null, 1))
  console.log(
    `bench ${tier} vs ${vs} (${matchup}${holdout ? ', holdout' : ''}): ${wins}W ${losses}L ${draws}D ${unfinished}U of ${rows.length} (decisive win rate ${(winRate * 100).toFixed(1)}%), ` +
      `decision mean ${rep.meanDecisionMs.toFixed(1)} ms / p50 ${rep.p50DecisionMs.toFixed(1)} / p95 ${rep.p95DecisionMs.toFixed(1)} (max ${rep.maxDecisionMs.toFixed(0)}), hardStops ${hardStops}, capped ${capped}, ` +
      `rejections ${rejections}+${oppRejections}, fallbacks ${fallbacks}, unhandled ${JSON.stringify(unhandled)}, errors ${errors}, stalls ${stalls}, zero-action ${(rep.zeroActionShare * 100).toFixed(1)}% of ${acts} (${empty}/${evActs} empty by events), ${(wallMs / 1000).toFixed(0)} s`,
  )
  console.log('  ended by: ' + JSON.stringify(byReason))
  for (const [t, g] of [['seat', bySeat], ['faction', byMatchup], ['objective', byObjective]] as const) for (const [k, v] of Object.entries(g).sort((a, b) => (a[0] < b[0] ? -1 : 1))) console.log(`  ${t.padEnd(9)} ${k.padEnd(34)} ${v.wins}W ${v.losses}L ${v.draws}D of ${v.games}`)
  console.log('  decision kinds seen (both seats): ' + Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '))
  console.log('  action mix: ' + Object.entries(behaviour.actionMix).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '))
  console.log(`  tokens (gained/spent/expired): aim ${tok('aim').gained}/${tok('aim').spent}/${tok('aim').expired} dodge ${tok('dodge').gained}/${tok('dodge').spent}/${tok('dodge').expired} standby ${tok('standby').gained}/${tok('standby').spent}/${tok('standby').expired}; standby triggers ${behaviour.standbyTriggers}; charges ${behaviour.charges} withdraws ${behaviour.actionMix.withdraw ?? 0} melee contacts ${behaviour.meleeContacts} pools ${behaviour.meleePools}; attacks/game ${behaviour.attacksPerGame.toFixed(1)}; claims ${behaviour.claims}; VP/game ${behaviour.pointsPerGame.toFixed(1)} ${JSON.stringify(points)}; orders ${behaviour.ordersUsed} pool draws ${behaviour.poolDraws}`)
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].ms - a[1].ms).slice(0, 6)) console.log(`  ${k.padEnd(22)} n=${String(v.n).padStart(5)} mean ${(v.ms / Math.max(1, v.n)).toFixed(1).padStart(6)} ms  max ${v.max.toFixed(0).padStart(4)}  fallbacks ${v.fallbacks}`)
  const gateWin = !(tier === 'normal' && vs === 'random') || winRate >= 0.95
  const gateTier = !(tier === 'normal' && vs === 'easy') || winRate >= 0.5
  const clean = rejections === 0 && oppRejections === 0 && stalls === 0 && fallbacks === 0 && Object.keys(unhandled).length === 0 && errors === 0 && (tier !== 'normal' || (rep.zeroActionShare < 0.02 && rep.meanDecisionMs < 50))
  if (!gateWin || !gateTier || !clean) {
    console.log(`GATE FAILED: ${!gateWin ? 'win rate below 95%; ' : ''}${!gateTier ? 'normal does not beat easy; ' : ''}${!clean ? 'rejections/stalls/fallbacks/unhandled/errors/zero-action/mean time not clean' : ''}`)
    process.exitCode = 1
  } else console.log('GATE OK')
}

const childList = arg('child', '')
if (childList) {
  for (const g of childList.split(',').map(Number)) {
    const r = playGame(g)
    process.stdout.write(`ROW ${JSON.stringify(r)}\n`)
  }
} else {
  await runParent()
}
