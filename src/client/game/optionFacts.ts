// The engine's numbers shown beside a decision option (docs/spec/50 section 3): range band, cover, expected wounds, defeat chance,
// dice counts, pool counts, speed. Everything is read off the option's own `data` (set by the engine); nothing is derived here.
import type { DecisionOption, PendingDecision } from '@/engine'
import { rankName, type Snap } from './labels'

export interface Fact {
  id: string
  text: string
}

const pct = (p: number): string => `${Math.round(p * 100)}%`

/** `showOdds` false drops the engine's expected-wounds / defeat / suppression chances (a setting); range, band and cover always show. */
export function optionFacts(opt: DecisionOption, p: PendingDecision, state: Snap, showOdds = true): Fact[] {
  const d = (opt.data ?? {}) as Record<string, unknown>
  const out: Fact[] = []
  const push = (id: string, text: string) => out.push({ id, text })
  switch (opt.action.type) {
    case 'attack.defender':
    case 'attack.extraDefender': {
      if (d.band !== undefined) push('band', `band ${String(d.band)}`)
      if (typeof d.distance === 'number') push('dist', `${d.distance.toFixed(1)}"`)
      if (typeof d.cover === 'string') push('cover', d.cover === 'none' ? 'no cover' : `${d.cover} cover`)
      const odds = d.odds as { expectedWounds?: number; pDefeat?: number; pAnyHit?: number } | null | undefined
      if (!showOdds) return out
      if (odds?.expectedWounds !== undefined) push('wounds', `${odds.expectedWounds.toFixed(1)} wounds expected`)
      if (odds?.pDefeat !== undefined && odds.pDefeat > 0.005) push('defeat', `${pct(odds.pDefeat)} to defeat`)
      if (odds?.pAnyHit !== undefined) push('supp', `${pct(odds.pAnyHit)} to suppress`)
      return out
    }
    case 'attack.pool': {
      const dice = d.dice as Record<string, number> | undefined
      if (dice) push('dice', Object.entries(dice).filter(([, n]) => n > 0).map(([c, n]) => `${n} ${c}`).join(', ') || 'no dice')
      if (typeof d.kind === 'string') push('kind', d.kind)
      if (d.auto === true) push('auto', 'recommended')
      return out
    }
    case 'action.choose': {
      if (typeof d.maxSpeed === 'number') push('speed', `speed ${d.maxSpeed}`)
      if (d.free === true) push('free', 'free')
      return out
    }
    case 'activation.choose': {
      if (opt.action.payload.drawPool) {
        const by = d.byRank as Record<string, number> | undefined
        if (by) push('pool', Object.entries(by).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${rankName(state.data, r)}`).join(', '))
      }
      return out
    }
    case 'attack.allocate': {
      if (typeof d.wounds === 'number' && typeof d.maxWounds === 'number') push('wounds', `wounds ${d.wounds}/${d.maxWounds}`)
      if (typeof d.count === 'number' && d.count > 1) push('count', `${d.count} alike`)
      return out
    }
    case 'command.pick': {
      if (typeof d.pips === 'number') push('pips', `${d.pips} pip${d.pips === 1 ? '' : 's'}`)
      return out
    }
    case 'command.order':
    case 'command.issuer': {
      if (typeof d.rank === 'string') push('rank', rankName(state.data, d.rank))
      return out
    }
    default:
      void p
      return out
  }
}
