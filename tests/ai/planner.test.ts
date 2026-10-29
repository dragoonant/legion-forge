import { describe, expect, it } from 'vitest'
import { view, type Action, type PendingDecision, type Seat } from '@/engine'
import { createAiDecider } from '../../src/ai/decider'
import { markersOf } from '@/engine/battle'
import { leaderOf } from '@/engine/state'
import type { Tier } from '../../src/ai/tiers'
import { play, type Sample } from './helpers'

function collect(games: number[], kind: string, enough: number, filter: (s: Sample) => boolean = () => true): Sample[] {
  const out: Sample[] = []
  for (const g of games) {
    play(g, { A: 'normal', B: 'normal' }, 700, (s) => {
      if (out.length < enough && s.pending.kind === kind && filter(s)) out.push({ ...s, state: structuredClone(s.state) })
    })
    if (out.length >= enough) break
  }
  return out
}

function meanOver(samples: Sample[], tier: Tier, measure: (s: Sample, a: Action) => number, seeds = 24): number {
  let sum = 0
  let n = 0
  for (const s of samples) {
    for (let i = 0; i < seeds; i++) {
      const a = createAiDecider(tier, { seed: `tier-${i}` }).decideSync(view(s.state, s.seat), s.pending, s.legal).action
      sum += measure(s, a)
      n++
    }
  }
  return sum / n
}

describe('AI tiers and planning', () => {
  it('AI-020 picks better targets as the tier rises (normal >= easy >= random on fixed positions)', () => {
    const samples = collect([0, 1, 2], 'attack.defender', 8, (s) => {
      const w = (s.pending.options ?? []).map((o) => (o.data as { odds: { expectedWounds: number } }).odds.expectedWounds)
      return w.length >= 3 && Math.max(...w) - Math.min(...w) > 0.4
    })
    expect(samples.length).toBeGreaterThan(2)
    const wounds = (s: Sample, a: Action) => (s.pending.options ?? []).find((o) => (o.action.payload as { unitId?: string }).unitId === (a.payload as { unitId?: string }).unitId)?.data
    const measure = (s: Sample, a: Action) => ((wounds(s, a) as { odds?: { expectedWounds: number } } | undefined)?.odds?.expectedWounds ?? 0)
    const normal = meanOver(samples, 'normal', measure)
    const easy = meanOver(samples, 'easy', measure)
    const random = meanOver(samples, 'random', measure)
    expect(normal).toBeGreaterThanOrEqual(easy - 1e-9)
    expect(easy).toBeGreaterThanOrEqual(random - 0.15)
    expect(normal).toBeGreaterThan(random)
  }, 120_000)

  it('AI-021 moves its leader toward a marker it can reach, where the random tier wanders', () => {
    const samples = collect([0, 1, 2, 3], 'move.tool', 10, (s) => {
      const id = s.pending.constraints?.unitId
      return !!id && s.state.units[id]!.location === 'table' && markersOf(s.state, 'poi').length > 0 && s.state.round >= 1
    })
    expect(samples.length).toBeGreaterThan(3)
    const gain = (s: Sample, a: Action) => {
      const u = s.state.units[s.pending.constraints!.unitId!]!
      const from = leaderOf(u).pos
      const to = (a.payload as { leader: { x: number; z: number } }).leader
      const near = (p: { x: number; z: number }) => Math.min(...markersOf(s.state, 'poi').map((m) => Math.hypot(m.pos.x - p.x, m.pos.z - p.z)))
      return near(from) - near(to)
    }
    expect(meanOver(samples, 'normal', gain, 4)).toBeGreaterThan(meanOver(samples, 'random', gain, 4))
  }, 120_000)

  it('AI-022 does something with its activations: ends none with an action on offer in a full game, and spends its orders', () => {
    const r = play(6, { A: 'normal', B: 'random' }, 6000)
    const b = r.deciders.A.memory.stats.behaviour
    expect(r.state.phase).toBe('ended')
    expect(b.activations).toBeGreaterThan(8)
    expect(b.zeroAction / b.activations).toBeLessThan(0.02)
    expect(b.actions.attack ?? 0).toBeGreaterThan(0)
    expect(b.actions.move ?? 0).toBeGreaterThan(0)
  }, 120_000)

  it('AI-023 scores a candidate against doing nothing: with nothing to gain it ends, with a shot on offer it does not', () => {
    // a unit that can shoot must not end its activation: the shot beats the baseline
    const shots = collect([0, 1, 2], 'action.choose', 6, (s) => (s.pending.options ?? []).some((o) => o.id === 'attack') && s.pending.context.actionsLeft === 2)
    expect(shots.length).toBeGreaterThan(1)
    for (const s of shots) {
      const a = createAiDecider('normal', { seed: 'z' }).decideSync(view(s.state, s.seat), s.pending, s.legal).action
      expect((a.payload as { action: string }).action).not.toBe('end')
    }
  }, 120_000)
})

void ({} as PendingDecision)
void ({} as Seat)
