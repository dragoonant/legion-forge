// URL parameters (client/params.ts): defaults, the army pair, watch mode and junk handling.
import { describe, expect, it } from 'vitest'
import { parseParams } from '../../src/client/params'

describe('parseParams', () => {
  it('an empty address is the menu: human against bot, nothing chosen', () => {
    const p = parseParams('')
    expect(p).toMatchObject({ test: false, debug: false, fps: false, ff: null, seed: null, armies: null, battle: null, speed: null, tier: null })
    expect(p.seats).toEqual(['human', 'bot'])
  })

  it('?test=1 with seats, seed, armies, battle cards, speed and tier', () => {
    const p = parseParams('?test=1&seats=bot,human&seed=abc&armies=emp,reb.list.recon-b&battle=rec.obj.bunker-assault&speed=instant&tier=random')
    expect(p.test).toBe(true)
    expect(p.seats).toEqual(['bot', 'human'])
    expect(p).toMatchObject({ seed: 'abc', armies: ['emp', 'reb.list.recon-b'], battle: ['rec.obj.bunker-assault'], speed: 'instant', tier: 'random' })
  })

  it('?watch=1 is two bots unless seats says otherwise; ?seats=bot,bot is the same', () => {
    expect(parseParams('?watch=1').seats).toEqual(['bot', 'bot'])
    expect(parseParams('?watch=1&seats=human,bot').seats).toEqual(['human', 'bot'])
    expect(parseParams('?seats=bot,bot').seats).toEqual(['bot', 'bot'])
  })

  it('armies are a pair; one value is not a pair', () => {
    expect(parseParams('?armies=emp').armies).toBeNull()
  })

  it('?ff only takes compact or desktop, junk is ignored', () => {
    expect(parseParams('?ff=compact').ff).toBe('compact')
    expect(parseParams('?ff=desktop').ff).toBe('desktop')
    const p = parseParams('?ff=huge&speed=warp&seats=a,b&tier=godlike')
    expect(p.ff).toBeNull()
    expect(p.speed).toBeNull()
    expect(p.tier).toBeNull()
    expect(p.seats).toEqual(['human', 'bot'])
  })
})
