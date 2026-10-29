// Command-line parsing shared by tools/sim.ts and its workers.
import { simBundle, simSetupFor, type Matchup } from './sim-setup'

export function argOf(argv: readonly string[], name: string, fallback: string): string {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback
}

export function setupFromArgs(argv: readonly string[]) {
  const bundle = simBundle()
  const battle = argOf(argv, 'battle', 'all')
  const rounds = argOf(argv, 'rounds', '')
  const setupFor = simSetupFor(bundle, {
    matchup: argOf(argv, 'matchup', 'all') as Matchup,
    battle: battle === 'all' ? 'all' : battle.split(','),
    ...(rounds ? { rounds: Number(rounds) } : {}),
  })
  return { bundle, setupFor }
}
