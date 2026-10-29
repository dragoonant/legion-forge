import { describe, expect, it } from 'vitest'
import { act, DECISION_KINDS, legalActions, view, type Action, type DecisionKind, type PendingDecision } from '@/engine'
import { answerOk, createAiDecider, POLICIES } from '../../src/ai/decider'
import { newGame, play } from './helpers'

describe('AI decider', () => {
  it('AI-001 has one policy for every decision kind the engine can raise', () => {
    expect(Object.keys(POLICIES).sort()).toEqual([...DECISION_KINDS].sort())
  })

  it('AI-002 answers every decision kind of real games with a legal action, no fallback, no rejection', () => {
    const seen = new Set<DecisionKind>()
    let fallbacks = 0
    let illegal = 0
    const rejections: string[] = []
    for (const [game, matchup] of [[0, 'main'], [3, 'mirror'], [5, 'main']] as const) {
      const r = play(game, { A: 'normal', B: 'normal' }, 330, (s) => {
        seen.add(s.pending.kind)
        if (s.fallback) fallbacks++
        if (!answerOk(s.state, s.legal, s.action)) illegal++
      }, matchup)
      rejections.push(...r.rejections)
    }
    expect(rejections).toEqual([])
    expect(illegal).toBe(0)
    expect(fallbacks).toBe(0)
    // the decisions a game reaches in its first rounds
    for (const k of ['setup.battle', 'command.pick', 'activation.choose', 'activation.pick', 'action.choose', 'move.tool', 'move.troopers', 'attack.defender', 'attack.pool', 'attack.allocate', 'keyword.choice'] as const) {
      expect(seen.has(k), `kind ${k} was never raised`).toBe(true)
    }
  }, 120_000)

  it('AI-003 answers the rarely raised kinds with a member of the offered options; a kind it cannot answer is counted as a fallback', () => {
    const g = newGame(0)
    const base = g.state
    const mk = (kind: DecisionKind, options: PendingDecision['options'], seat: 'A' | 'B' = 'A'): PendingDecision => ({ id: base.pending!.id, seat, kind, window: 'setup.*', context: {}, ...(options ? { options } : {}), canPass: false })
    const d = createAiDecider('normal', { seed: 'syn' })
    const tests: [DecisionKind, PendingDecision][] = [
      ['confirm', mk('confirm', [{ id: 'continue', labelKey: 'confirm', action: act.confirm({ id: base.pending!.id, seat: 'A' }, 'continue') }, { id: 'concede', labelKey: 'confirm', action: act.confirm({ id: base.pending!.id, seat: 'A' }, 'concede') }])],
      ['end.choice', mk('end.choice', [{ id: 'skip', labelKey: 'x', action: act.endChoice({ id: base.pending!.id, seat: 'A' }, 'skip') }, { id: 'go', labelKey: 'x', action: act.endChoice({ id: base.pending!.id, seat: 'A' }, 'go') }])],
      ['command.issuer', mk('command.issuer', Object.values(base.units).filter((u) => u.seat === 'A').slice(0, 3).map((u) => ({ id: u.id, labelKey: 'x', action: act.issuer({ id: base.pending!.id, seat: 'A' }, u.id), data: { rank: u.rank } })))],
    ]
    for (const [kind, pending] of tests) {
      const legal = pending.options!.map((o) => o.action) as Action[]
      const r = d.decideSync(view(base, 'A'), pending, legal)
      expect(r.fallback, kind).toBe(false)
      expect(legal.some((a) => JSON.stringify(a) === JSON.stringify(r.action)), kind).toBe(true)
    }
    // a continuous kind that the engine is not asking for cannot be validated: it is answered, and counted
    const fb = d.decideSync(view(base, 'A'), mk('battle.place', undefined), null)
    expect(fb.fallback).toBe(true)
    expect(d.memory.stats.fallbacks).toBe(1)
    expect(fb.action).toBeTruthy()
  })

  it('AI-004 plays a whole Recon game to the end with the engine accepting every answer', () => {
    const r = play(1, { A: 'normal', B: 'random' }, 6000)
    expect(r.rejections).toEqual([])
    expect(r.state.phase).toBe('ended')
    expect(r.deciders.A.memory.stats.fallbacks).toBe(0)
    expect(Object.keys(r.deciders.A.memory.stats.unhandled)).toEqual([])
  }, 120_000)
})

describe('AI and the M2c decisions', () => {
  it('AI-006 places a barricade legally (Fortified Position) with a policy, not the fallback', () => {
    let seen = 0
    let bad = 0
    for (let g = 0; g < 8 && seen === 0; g++) {
      play(g, { A: 'normal', B: 'normal' }, 60, (s) => {
        if (s.pending.kind !== 'battle.place' || s.pending.context.terrain !== 'barricade') return
        seen++
        if (s.fallback || !answerOk(s.state, s.legal, s.action)) bad++
        expect((s.action.payload as { yaw?: number }).yaw).toBeDefined()
      })
    }
    expect(seen).toBeGreaterThan(0)
    expect(bad).toBe(0)
  }, 60_000)

  it('AI-007 withdraws from a melee, pushes an enemy with Force Push, and answers both without the fallback', () => {
    let withdraws = 0
    let pushes = 0
    let engaged = 0
    let fallbacks = 0
    const r = play(4, { A: 'normal', B: 'normal' }, 4000, (s) => {
      if (Object.values(s.state.units).some((u) => u.engagedWith.length > 0)) engaged++
      if (s.pending.kind === 'move.tool' && s.pending.context.kind === 'withdraw') withdraws++
      if (s.pending.kind === 'move.tool' && s.pending.context.kind === 'controlled') {
        pushes++
        // the pushed unit is the enemy's, and the push is a Move we place (or a pass if nothing fits)
        expect(s.state.units[String(s.pending.constraints?.unitId)]!.seat).not.toBe(s.seat)
      }
      if (s.fallback) fallbacks++
    }, 'mirror')
    expect(r.rejections).toEqual([])
    expect(r.state.phase).toBe('ended')
    expect(engaged).toBeGreaterThan(0)
    expect(withdraws).toBeGreaterThan(0)
    expect(pushes).toBeGreaterThan(0)
    expect(fallbacks).toBe(0)
  }, 120_000)
})

describe('AI determinism', () => {
  it('AI-005 gives the same answer for the same view and seed, and does not depend on the order of the options', () => {
    const picks: string[] = []
    play(0, { A: 'normal', B: 'normal' }, 120, (s) => {
      if (!['activation.pick', 'command.order', 'attack.defender'].includes(s.pending.kind) || (s.pending.options?.length ?? 0) < 2) return
      const v = view(s.state, s.seat)
      const a1 = createAiDecider('normal', { seed: 'det' }).decideSync(v, s.pending, s.legal).action
      const a2 = createAiDecider('normal', { seed: 'det' }).decideSync(v, s.pending, s.legal).action
      expect(a2).toEqual(a1)
      const rev = { ...s.pending, options: [...s.pending.options!].reverse() }
      const a3 = createAiDecider('normal', { seed: 'det' }).decideSync(v, rev, s.legal ? [...s.legal].reverse() : null).action
      expect(a3, `${s.pending.kind} depends on option order`).toEqual(a1)
      picks.push(s.pending.kind)
    })
    expect(picks.length).toBeGreaterThan(3)
  }, 60_000)
})

void legalActions
