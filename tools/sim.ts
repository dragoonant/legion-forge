// npm run sim -- --games 50 --seed 1 [--matchup mirror|main|all] [--battle <ids>|all] [--rounds N] [--replay-every N] [--hash-every N]
//                [--workers N] [--replay tools/out/sim-report.json [index]]
// Two random-legal bots play seeded Recon games over the four starter lists and the Recon battle deck (matchups and missions
// rotate, seats swap); every step is checked against the invariants of sim-core.ts (60-testing section 3), every game is
// replayed from its log and must reproduce every hash. Games are independent, so they are spread over `--workers` threads
// (default: the cores available, at most 8); the report does not depend on the number of workers.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import { replay, setHashEvery, type Action } from '../src/engine'
import { mergeReports, runSim, type GameReport, type SimReport } from './sim-core'
import { argOf, setupFromArgs } from './sim-cli'

const argv = process.argv.slice(2)
const arg = (name: string, fallback: string): string => argOf(argv, name, fallback)

const OUT = 'tools/out/sim-report.json'

function replayMode(path: string, index: number): void {
  const report = JSON.parse(readFileSync(path, 'utf8')) as { failing: GameReport[] }
  const g = report.failing[index]
  if (!g) {
    console.error(`no failing game at index ${index}`)
    process.exit(2)
  }
  const { bundle, setupFor } = setupFromArgs(argv)
  const r = replay(setupFor(g.game), g.seed, g.actions as Action[], bundle)
  console.log(`replayed ${g.actions.length} actions of ${g.seed}: final hash ${r.state.hash}${r.rejection ? ` (rejected at ${r.failedAt}: ${r.rejection.reason})` : ''}`)
  for (const v of g.violations) console.log(`  [${v.decision}] ${v.rule}: ${v.message}`)
}

const mean = (xs: number[]): string => (xs.length === 0 ? '-' : (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1))

/** Play the games on `workers` threads and merge their reports. */
function runWorkers(games: number, seed: string, workers: number): Promise<SimReport> {
  const t0 = Date.now()
  return new Promise((resolve, reject) => {
    const reports: GameReport[] = []
    let running = workers
    for (let id = 0; id < workers; id++) {
      const w = new Worker(new URL('./sim-worker-boot.mjs', import.meta.url), { workerData: { argv, games, seed, id, workers } })
      w.on('message', (m: { type: string; report?: GameReport }) => {
        if (m.type === 'game') reports.push(m.report!)
      })
      w.on('error', reject)
      w.on('exit', (code) => {
        if (code !== 0) return reject(new Error(`sim worker ${id} exited with code ${code}`))
        if (--running === 0) resolve(mergeReports(reports, Date.now() - t0))
      })
    }
  })
}

async function main(): Promise<void> {
  const replayPath = arg('replay', '')
  if (replayPath) {
    replayMode(replayPath, Number(argv[argv.indexOf(replayPath) + 1] ?? 0) || 0)
    return
  }
  const games = Number(arg('games', '20'))
  const seed = arg('seed', '1')
  // a full state hash every Nth step (default 8) and at the end of the game; `--hash-every 1` hashes every step
  const hashEvery = Math.max(1, Number(arg('hash-every', '8')))
  setHashEvery(hashEvery)
  const workers = Math.max(1, Math.min(games, Number(arg('workers', String(Math.min(8, availableParallelism()))))))
  let report: SimReport
  if (workers <= 1) {
    const { bundle, setupFor } = setupFromArgs(argv)
    report = runSim({ games, seed, setupFor, bundle, replayEvery: Math.max(1, Number(arg('replay-every', '1'))) })
  } else {
    report = await runWorkers(games, seed, workers)
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ ...report, failing: report.failing }, null, 1))
  const perSec = report.ms > 0 ? ((games / report.ms) * 1000).toFixed(2) : 'inf'
  console.log(`sim: ${report.completed}/${report.games} games ended cleanly, ${report.decisions} decisions, ${report.rejections} rejections, ${report.violations} violations, ${report.ms} ms (${perSec} games/s${workers > 1 ? `, ${workers} workers` : ''})`)
  console.log(
    '     ' +
      Object.entries(report.stats)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join(' '),
  )
  const wins = { A: 0, B: 0, draw: 0 }
  for (const s of report.summaries) if (s.winner) wins[s.winner]++
  const reasons: Record<string, number> = {}
  for (const s of report.summaries) reasons[s.reason ?? 'none'] = (reasons[s.reason ?? 'none'] ?? 0) + 1
  console.log(`     wins A/B/draw ${wins.A}/${wins.B}/${wins.draw}; ended by ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', ')}; mean rounds ${mean(report.summaries.map((s) => s.rounds))}; mean points ${mean(report.summaries.map((s) => s.points.A + s.points.B))}`)
  for (const g of report.failing.slice(0, 5)) {
    console.log(` game ${g.game} (${g.seed}) ended=${g.ended}`)
    for (const v of g.violations.slice(0, 5)) console.log(`   [${v.decision}] ${v.rule}: ${v.message}`)
  }
  if (report.violations > 0 || report.completed !== report.games) process.exit(1)
}

void main()
