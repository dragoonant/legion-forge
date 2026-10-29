// npx tsx tools/ai-watch.ts [--game 0] [--seed tune] [--tier normal] [--vs random] [--matchup main] [--map] [--trace]
// A narrated seeded game of the AI against another tier: command cards, activations, moves, attacks, points, and an ASCII map of
// the table at the end of each round (`--map`). `--trace` prints the scored candidates of every action.choose (AI_TRACE=1).
import { createGame, legalActions, step, view, type Action, type GameEvent, type GameState, type Seat } from '../src/engine'
import { createAiDecider } from '../src/ai/decider'
import type { Tier } from '../src/ai/tiers'
import { simBundle, simSetupFor, type Matchup } from './sim-setup'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : fallback
}
if (process.argv.includes('--trace')) process.env.AI_TRACE = '1'

const game = Number(arg('game', '0'))
const seed = arg('seed', 'tune')
const bundle = simBundle()
const setup = simSetupFor(bundle, { matchup: arg('matchup', 'main') as Matchup })(game)
const aiSeat: Seat = game % 2 === 0 ? 'A' : 'B'
const other: Seat = aiSeat === 'A' ? 'B' : 'A'
const gameSeed = `${seed}-${game}`
const deciders = {
  [aiSeat]: createAiDecider(arg('tier', 'normal') as Tier, { seed: `${gameSeed}:${aiSeat}` }),
  [other]: createAiDecider(arg('vs', 'random') as Tier, { seed: `${gameSeed}:${other}` }),
} as Record<Seat, ReturnType<typeof createAiDecider>>

function mapOf(s: GameState): string {
  const W = 72
  const H = 36
  const b = s.table.def.bounds
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'))
  const put = (x: number, z: number, ch: string) => {
    const cx = Math.floor(((x - b.minX) / (b.maxX - b.minX)) * (W - 1))
    const cz = Math.floor(((z - b.minZ) / (b.maxZ - b.minZ)) * (H - 1))
    if (cx >= 0 && cx < W && cz >= 0 && cz < H) grid[cz]![cx] = ch
  }
  for (const p of s.table.def.pieces) {
    for (let z = p.bbox.minZ; z <= p.bbox.maxZ; z += 0.5) for (let x = p.bbox.minX; x <= p.bbox.maxX; x += 0.5) if (p.cover !== 'none' || p.blocksLos) put(x, z, p.blocksLos ? '#' : ':')
  }
  for (const m of Object.values(s.table.objectives)) if (m.kind === 'poi') put(m.pos.x, m.pos.z, '*')
  for (const u of Object.values(s.units)) {
    if (u.location !== 'table') continue
    for (const m of u.minis) if (m.alive) put(m.pos.x, m.pos.z, m.id === u.leaderId ? u.id.replace(/\D/g, '').slice(-1) || '?' : u.seat === 'A' ? 'a' : 'b')
  }
  return grid.map((r) => r.join('')).reverse().join('\n')
}

function say(s: GameState, e: GameEvent): void {
  const tag = (id: string) => `${s.units[id]?.seat ?? '?'}:${id}`
  switch (e.type) {
    case 'RoundStarted':
      console.log(`\n=== round ${e.round} ===`)
      break
    case 'CommandCardsRevealed':
      console.log(`cards ${JSON.stringify(e.picks)}`)
      break
    case 'PriorityDecided':
      console.log(`priority ${e.holder}`)
      break
    case 'UnitActivated':
      console.log(`-- ${tag(e.unitId)} (${s.units[e.unitId]?.unitTypeId.split('.').pop()}) via ${e.via}`)
      break
    case 'ActionDeclared':
      console.log(`   ${e.action}${e.free ? ' (free)' : ''}`)
      break
    case 'UnitMoved':
      console.log(`   moved speed ${e.speed} -> (${e.leaderTo.x.toFixed(1)}, ${e.leaderTo.z.toFixed(1)})`)
      break
    case 'AttackDeclared':
      console.log(`   attack ${tag(e.attackerId)} -> ${tag(e.defenderId)}`)
      break
    case 'AttackEnded':
      console.log(`   attack ended: ${e.wounds} wounds`)
      break
    case 'UnitDefeated':
      console.log(`   !! ${tag(e.unitId)} defeated`)
      break
    case 'PointsScored':
      console.log(`   +${e.amount} VP to ${e.seat} (${e.reason})`)
      break
    case 'StandbyTriggered':
      console.log(`   standby ${tag(e.unitId)} triggered by ${tag(e.byUnitId)}`)
      break
    case 'RoundEnded':
      if (process.argv.includes('--map')) console.log(mapOf(s))
      console.log(`end of round ${e.round}: A ${s.players.A.points} VP, B ${s.players.B.points} VP`)
      break
    default:
      break
  }
}

let state = createGame(setup, gameSeed, bundle).state
console.log(`AI seat ${aiSeat}: ${state.players[aiSeat].armyId} vs ${state.players[other].armyId}; ${setup.battle && 'cards' in setup.battle ? setup.battle.cards.join(', ') : ''}`)
let n = 0
while (state.pending && n++ < 6000) {
  const pending = state.pending
  const owed: Seat[] = pending.seat === 'all' ? ['A', 'B'] : [pending.seat]
  for (const seat of owed) {
    if (!state.pending || state.pending.id !== pending.id) break
    const legal = legalActions(state, state.pending, seat)
    if (pending.seat === 'all' && legal && legal.length === 0) continue
    const action: Action = deciders[seat].decideSync(view(state, seat), state.pending, legal).action
    const r = step(state, action)
    if (r.rejection) {
      console.log(`REJECTED ${pending.kind}: ${r.rejection.code} ${r.rejection.reason}`)
      process.exit(1)
    }
    for (const e of r.events) say(r.state, e)
    state = r.state
  }
}
console.log(`\nresult: ${JSON.stringify(state.result)}`)
