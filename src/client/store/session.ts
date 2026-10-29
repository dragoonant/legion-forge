// Menu-flow store: which screen is showing (start -> briefing -> battle) and the pre-game configuration (sides, army lists,
// objective, bot tier, seed). The game itself lives in store/game.ts; this store only hands it a NewGameOptions.
import { create } from 'zustand'
import type { Seat } from '@/engine'
import { dataBundle, defaultLists, resolveList, type SeatBuild } from '../game/adapter'
import type { BotTier, SeatMode, UrlParams } from '../params'
import { useUi } from '../ui/uiStore'
import { useGame } from './game'

export type Screen = 'start' | 'briefing' | 'battle'

export interface Session {
  screen: Screen
  /** the seat you play against the bot */
  humanSeat: Seat
  seats: Record<Seat, SeatMode>
  seed: string
  builds: Record<Seat, SeatBuild>
  /** a forced Recon objective card, or null to draw one from the seed */
  objectiveId: string | null
  battle: string[] | null
  tier: BotTier
  setScreen(screen: Screen): void
  setSeed(seed: string): void
  setList(seat: Seat, listId: string): void
  setObjective(id: string | null): void
  setTier(tier: BotTier): void
  /** Watch bot vs bot: both seats are bots; everything else as set. */
  launchWatch(): void
  launch(): void
  /** start again with the same settings and a fresh seed */
  playAgain(): void
  backToMenu(): void
}

export function randomSeed(): string {
  return `lf-${Math.floor(Math.random() * 1_000_000).toString(36)}`
}

export function seatsFor(humanSeat: Seat): Record<Seat, SeatMode> {
  return { A: humanSeat === 'A' ? 'human' : 'bot', B: humanSeat === 'B' ? 'human' : 'bot' }
}

function initial(): Pick<Session, 'humanSeat' | 'seats' | 'seed' | 'builds' | 'objectiveId' | 'battle' | 'tier'> {
  const lists = defaultLists(dataBundle())
  return { humanSeat: 'A', seats: seatsFor('A'), seed: randomSeed(), builds: { A: { listId: lists.A }, B: { listId: lists.B } }, objectiveId: null, battle: null, tier: 'random' }
}

export const useSession = create<Session>((set, get) => ({
  screen: 'start',
  ...initial(),
  setScreen: (screen) => set({ screen }),
  setSeed: (seed) => set({ seed }),
  setList: (seat, listId) => set((s) => ({ builds: { ...s.builds, [seat]: { listId } } })),
  setObjective: (objectiveId) => set({ objectiveId, battle: objectiveId ? [objectiveId] : null }),
  setTier: (tier) => set({ tier }),
  launchWatch() {
    set({ seats: { A: 'bot', B: 'bot' } })
    get().launch()
  },
  launch() {
    const s = get()
    useUi.setState({ selected: null, hoverUnit: null, hoverOption: null, uiHidden: false })
    useGame.getState().newGame({ builds: s.builds, seats: s.seats, seed: s.seed, tier: s.tier, battle: s.battle })
    set({ screen: 'battle' })
  },
  playAgain() {
    set((s) => ({ seed: randomSeed(), seats: s.seats }))
    get().launch()
  },
  backToMenu() {
    useGame.getState().reset()
    set((s) => ({ screen: 'start', seats: seatsFor(s.humanSeat) }))
  },
}))

/** ?test=1: skip the menus. Chosen armies, seats, seed and battle cards, straight to the battle. */
export function startFromParams(p: UrlParams): void {
  const b = dataBundle()
  const defaults = defaultLists(b)
  const a = p.armies ? resolveList(b, p.armies[0], 'empire').id : defaults.A
  const c = p.armies ? resolveList(b, p.armies[1], 'rebels').id : defaults.B
  const seats = { A: p.seats[0], B: p.seats[1] }
  useSession.setState({
    humanSeat: seats.A === 'human' ? 'A' : seats.B === 'human' ? 'B' : 'A',
    seats,
    seed: p.seed ?? 'test',
    builds: { A: { listId: a }, B: { listId: c } },
    battle: p.battle,
    objectiveId: p.battle?.[0] ?? null,
    tier: p.tier ?? 'random',
  })
  useSession.getState().launch()
}
