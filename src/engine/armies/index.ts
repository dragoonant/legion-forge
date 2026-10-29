// Imports each faction's code-hook file once and installs every registered hook. Also holds the two Recon battle-card
// hooks, which belong to no faction. NOTE (M2b-combat): `bunkerAssault` and `scoringTable` are minimal: they act on the
// objective markers / battle data the battle module maintains (tags `bunker`, `enemyOf:<seat>`, `securedBy:<seat>`) and
// are driven by `runBattleHook` at the windows the battle card names; the battle stage owns the full scoring.
import { installCodeHooks, markFired, registerCodeHook } from '../code-hooks'
import type { Ctx } from '../registry'
import { otherSeat } from '../state'
import type { Seat } from '../types'
import './empire'
import './rebels'
import { getCodeEffect, registerCodeEffect, type CodeEnv } from './registry'

registerCodeHook({
  name: 'bunkerAssault',
  kind: 'battle',
  params: (p) => (p && typeof p['woundsToDestroy'] !== 'number' ? 'bunkerAssault needs woundsToDestroy' : null),
  install() {
    registerCodeEffect({
      name: 'bunkerAssault',
      windows: ['end.start'],
      run(ctx: Ctx, env: CodeEnv) {
        const st = ctx.state
        const from = Number(env.params?.['fromRound'] ?? 2)
        if (st.round < from) return
        const need = Number(env.params?.['woundsToDestroy'] ?? 3)
        const bonusRanks = (env.params?.['bonusRanks'] as string[] | undefined) ?? []
        const wounds = (st.battle.data['bunkerWounds'] as Record<string, number> | undefined) ?? {}
        const destroyed = (st.battle.data['destroyed'] as string[] | undefined) ?? []
        for (const seat of (st.battle.blue ? [st.battle.blue, otherSeat(st.battle.blue)] : ['A', 'B']) as Seat[]) {
          for (const o of Object.values(st.table.objectives)) {
            if (!o.tags.includes('bunker') || !o.tags.includes(`enemyOf:${seat}`) || !o.tags.includes(`securedBy:${seat}`) || destroyed.includes(o.id)) continue
            const bonus = Object.values(st.units).some((u) => u.seat === seat && u.location === 'table' && bonusRanks.includes(u.rank.replace(/^core\.rank\./, '')) && o.tags.includes(`contestedBy:${u.id}`))
            wounds[o.id] = (wounds[o.id] ?? 0) + 1 + (bonus ? 1 : 0)
            ctx.emit({ type: 'ObjectiveChanged', objectiveId: o.id, detail: { wounds: wounds[o.id], seat } })
            if ((wounds[o.id] ?? 0) >= need) {
              destroyed.push(o.id)
              ctx.emit({ type: 'ObjectiveChanged', objectiveId: o.id, detail: { destroyed: true, seat } })
            }
            markFired('bunkerAssault')
          }
        }
        st.battle.data['bunkerWounds'] = wounds
        st.battle.data['destroyed'] = destroyed
      },
    })
  },
})

registerCodeHook({
  name: 'scoringTable',
  kind: 'battle',
  params: () => null,
  install() {
    registerCodeEffect({
      name: 'scoringTable',
      windows: ['SuppressionChanged'],
      run(ctx: Ctx, env: CodeEnv) {
        // records that a unit gained suppression this round; the battle module offers the column marks from it
        const st = ctx.state
        const log = (st.battle.data['suppressionGains'] as { round: number; unitId: string }[] | undefined) ?? []
        st.battle.data['suppressionGains'] = [...log, { round: st.round, unitId: env.subjectId ?? '' }]
        markFired('scoringTable')
      },
    })
  },
})

/** Run a battle-card code hook (`bunkerAssault`, `scoringTable`) at a window; the battle module calls this where the card says. */
export function runBattleHook(ctx: Ctx, name: string, window: string, params: Record<string, unknown> | undefined, info: Record<string, unknown> = {}): void {
  const def = getCodeEffect(name)
  if (!def || !def.windows.includes(window)) throw new Error(`battle hook ${name} does not run at ${window}`)
  def.run(ctx, { window, params, owner: null, subjectId: typeof info['unitId'] === 'string' ? info['unitId'] : null, seat: (info['seat'] as Seat | undefined) ?? 'A', source: name, attack: null, pool: null, role: null, offers: [], info })
}

installCodeHooks(['sniperTeam', 'deflect', 'compel', 'implacable', 'vadersMight', 'darknessDescends', 'orderTokenToPool', 'flipCard', 'bunkerAssault', 'scoringTable'])

export const ARMY_HOOKS = ['bunkerAssault', 'compel', 'darknessDescends', 'deflect', 'flipCard', 'implacable', 'orderTokenToPool', 'scoringTable', 'sniperTeam', 'vadersMight'] as const
