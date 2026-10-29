// Rebel code hooks: Battle Shield's flipCard (a two-sided upgrade card turned at the start of the unit's activation).
import { markFired, registerCodeHook } from '../code-hooks'
import { upgradeDef, upgradeSide } from '../keywords'
import type { Ctx } from '../registry'
import type { CodeOffer } from '../types'
import { registerCodeEffect, type CodeEnv } from './registry'

registerCodeHook({
  name: 'flipCard',
  kind: 'upgrade',
  params: () => null,
  install() {
    registerCodeEffect({
      name: 'flipCard',
      windows: ['activation.start'],
      run(ctx: Ctx, env: CodeEnv) {
        const owner = env.owner
        if (!owner || env.subjectId !== owner.id) return
        const ud = upgradeDef(ctx.state, env.source)
        const sides = (ud?.sides ?? []) as { name: string }[]
        if (sides.length < 2) return
        const cur = upgradeSide(owner, env.source)
        const next = (cur + 1) % sides.length
        env.offers.push({
          seat: owner.seat,
          unitId: owner.id,
          keyword: env.source,
          labelKey: 'upgrade.flip',
          options: [
            { id: 'flip', labelKey: 'upgrade.flip.to', data: { side: next, name: sides[next]!.name } },
            { id: 'keep', labelKey: 'keyword.skip', data: { side: cur, name: sides[cur]!.name } },
          ],
          payload: { unitId: owner.id, upgradeId: env.source, side: next },
          code: 'flipCard',
        })
      },
      resolve(ctx: Ctx, offer: CodeOffer, option: string) {
        if (option !== 'flip') return
        const u = ctx.state.units[String(offer.payload['unitId'])]!
        const sides = { ...((u.flags['cardSide'] as Record<string, number> | undefined) ?? {}) }
        sides[String(offer.payload['upgradeId'])] = Number(offer.payload['side'])
        u.flags['cardSide'] = sides
        markFired('flipCard')
        ctx.emit({ type: 'KeywordFired', unitId: u.id, keyword: String(offer.payload['upgradeId']), detail: { flipped: Number(offer.payload['side']) } }, u.seat)
      },
    })
  },
})
