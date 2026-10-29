// npm run sim -- --games 50 --seed 1 [--matchup mirror|main|all] [--battle <ids>|all] [--rounds N] [--replay-every N] [--replay tools/out/sim-report.json [index]]
// Two random-legal bots play seeded Recon games over the four starter lists and the Recon battle deck (matchups and missions
// rotate, seats swap); every step is checked against the invariants of sim-core.ts (60-testing section 3). Until the attack
// module is merged, attacks are not offered: games are decided by movement and objectives.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { replay, type Action } from '../src/engine'
import { runSim, type GameReport } from './sim-core'
import { simBundle, simSetupFor, type Matchup } from './sim-setup'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback
}

const OUT = 'tools/out/sim-report.json'

function setupFromArgs() {
  const bundle = simBundle()
  const battle = arg('battle', 'all')
  const rounds = arg('rounds', '')
  const setupFor = simSetupFor(bundle, {
    matchup: arg('matchup', 'all') as Matchup,
    battle: battle === 'all' ? 'all' : battle.split(','),
    ...(rounds ? { rounds: Number(rounds) } : {}),
  })
  return { bundle, setupFor }
}

function replayMode(path: string, index: number): void {
  const report = JSON.parse(readFileSync(path, 'utf8')) as { failing: GameReport[] }
  const g = report.failing[index]
  if (!g) {
    console.error(`no failing game at index ${index}`)
    process.exit(2)
  }
  const { bundle, setupFor } = setupFromArgs()
  const r = replay(setupFor(g.game), g.seed, g.actions as Action[], bundle)
  console.log(`replayed ${g.actions.length} actions of ${g.seed}: final hash ${r.state.hash}${r.rejection ? ` (rejected at ${r.failedAt}: ${r.rejection.reason})` : ''}`)
  for (const v of g.violations) console.log(`  [${v.decision}] ${v.rule}: ${v.message}`)
}

const mean = (xs: number[]): string => (xs.length === 0 ? '-' : (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1))

const replayPath = arg('replay', '')
if (replayPath) {
  replayMode(replayPath, Number(process.argv[process.argv.indexOf(replayPath) + 1] ?? 0) || 0)
} else {
  const games = Number(arg('games', '20'))
  const seed = arg('seed', '1')
  const { bundle, setupFor } = setupFromArgs()
  const report = runSim({ games, seed, setupFor, bundle, replayEvery: Math.max(1, Number(arg('replay-every', '1'))) })
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ ...report, failing: report.failing }, null, 1))
  const perSec = report.ms > 0 ? ((games / report.ms) * 1000).toFixed(2) : 'inf'
  console.log(`sim: ${report.completed}/${report.games} games ended cleanly, ${report.decisions} decisions, ${report.rejections} rejections, ${report.violations} violations, ${report.ms} ms (${perSec} games/s)`)
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
