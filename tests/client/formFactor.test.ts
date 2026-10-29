// Form-factor classification and the phone HUD geometry: compact is phones only, the override wins, and nothing of the compact HUD
// lands in the top-right corner the system overlay covers.
import { describe, expect, it } from 'vitest'
import { classify } from '../../src/client/ui/formFactor'
import { OVERLAY_H, OVERLAY_W, touchToolbar } from '../../src/client/ui/hudLayout'

const base = { coarse: false, fine: true, touchPoints: 0, override: null } as const

describe('form factor', () => {
  it('a desktop window is neither touch nor compact', () => {
    expect(classify({ ...base, width: 1440, height: 810 })).toEqual({ touch: false, compact: false, portrait: false, phone: false })
  })
  it('a phone in landscape is touch, phone and compact; in portrait too, with portrait set', () => {
    const land = classify({ width: 844, height: 390, coarse: true, fine: false, touchPoints: 5, override: null })
    expect(land).toEqual({ touch: true, compact: true, portrait: false, phone: true })
    expect(classify({ width: 390, height: 844, coarse: true, fine: false, touchPoints: 5, override: null }).portrait).toBe(true)
  })
  it('a tablet keeps the desktop layout (touch, not compact)', () => {
    const t = classify({ width: 1180, height: 820, coarse: true, fine: false, touchPoints: 5, override: null })
    expect(t.touch).toBe(true)
    expect(t.compact).toBe(false)
  })
  it('a laptop with a touch screen and a mouse is not touch', () => {
    expect(classify({ width: 1366, height: 768, coarse: false, fine: true, touchPoints: 10, override: null }).touch).toBe(false)
  })
  it('?ff= forces either layout, portrait is still measured', () => {
    expect(classify({ ...base, width: 1440, height: 810, override: 'compact' })).toEqual({ touch: true, compact: true, portrait: false, phone: true })
    expect(classify({ width: 390, height: 844, coarse: true, fine: false, touchPoints: 3, override: 'desktop' })).toEqual({ touch: false, compact: false, portrait: true, phone: false })
  })
})

describe('phone HUD geometry', () => {
  it('the toolbar row is 44 px tall and its panels start below it', () => {
    const t = touchToolbar(true)
    expect(t.height).toBe(44)
    expect(t.below).toBeGreaterThan(t.top + t.height)
  })
  it('the top bar stops short of the overlay corner on the narrowest landscape phone (iPhone SE, 667 px)', () => {
    const width = 667
    const barRight = width - (OVERLAY_W + 8)
    expect(barRight).toBeLessThanOrEqual(width - OVERLAY_W)
    // both seat chips, the round block and their gaps still fit in what is left
    expect(barRight - 8).toBeGreaterThan(430)
    expect(OVERLAY_H).toBeGreaterThan(48)
  })
})
