// URL parameters (docs/spec/50-client.md section 8). Pure parsing: no DOM access, so it is unit-testable.
//   ?test=1&seats=human,bot&seed=<s>&armies=emp.list.recon-a,reb.list.recon-a&battle=<id>,<id>&speed=instant&tier=random
//        skips the menus and opens a battle (A = first army, B = second). `armies` takes list ids, or a faction prefix
//        (`emp`, `reb`) for that faction's first list; `battle` lists battle-card ids (objective, secondary, two advantages).
//   &watch=1   alias for seats=bot,bot: two bots play and the watch bar is shown (an explicit seats= wins)
//   ?ff=compact|desktop  forces the phone layout on or off
//   ?debug     installs window.__lf (also installed by ?test=1)
export type AnimSpeed = 'slow' | 'normal' | 'fast' | 'instant'
export type SeatMode = 'human' | 'bot'
export type BotTier = 'random' | 'easy' | 'normal' | 'hard'

export interface UrlParams {
  /** ?test=1: skip the menus and start a battle with the given or default armies */
  test: boolean
  debug: boolean
  fps: boolean
  /** ?ff=compact|desktop forces the phone layout on or off */
  ff: 'compact' | 'desktop' | null
  seats: [SeatMode, SeatMode]
  seed: string | null
  /** list ids or faction prefixes of the two armies */
  armies: [string, string] | null
  battle: string[] | null
  speed: AnimSpeed | null
  tier: BotTier | null
}

function mode(v: string | undefined, fallback: SeatMode): SeatMode {
  return v === 'human' || v === 'bot' ? v : fallback
}

function list(raw: string | null): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

export function parseParams(search: string): UrlParams {
  const q = new URLSearchParams(search)
  const seats = list(q.get('seats'))
  const speed = q.get('speed')
  const ff = q.get('ff')
  const tier = q.get('tier')
  const armies = list(q.get('armies'))
  const battle = list(q.get('battle'))
  return {
    test: q.get('test') === '1',
    debug: q.has('debug'),
    fps: q.has('fps'),
    ff: ff === 'compact' || ff === 'desktop' ? ff : null,
    seats: q.get('watch') === '1' && !q.has('seats') ? ['bot', 'bot'] : [mode(seats[0], 'human'), mode(seats[1], 'bot')],
    seed: q.get('seed'),
    armies: armies.length >= 2 ? [armies[0]!, armies[1]!] : null,
    battle: battle.length > 0 ? battle : null,
    speed: speed === 'slow' || speed === 'normal' || speed === 'fast' || speed === 'instant' ? speed : null,
    tier: tier === 'random' || tier === 'easy' || tier === 'normal' || tier === 'hard' ? tier : null,
  }
}

export function currentParams(): UrlParams {
  return parseParams(typeof location === 'undefined' ? '' : location.search)
}
