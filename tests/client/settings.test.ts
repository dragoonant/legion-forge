// Settings: the stored blob merges over the defaults and anything of the wrong type is dropped; the store persists every change.
import { beforeAll, describe, expect, it } from 'vitest'
import { cameraTweenFactor, defaultSettings, mergeSettings, useSettings } from '../../src/client/presentation/settings'

const mem = new Map<string, string>()
beforeAll(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 } as Storage
})

describe('settings', () => {
  it('merges a stored blob over the defaults and ignores bad values', () => {
    const d = defaultSettings()
    const m = mergeSettings({ animSpeed: 'fast', cameraFeel: 'lively', showOdds: false, reduceMotion: true, sound: { master: 150, music: -5, effects: 'x' }, lowGraphics: 'yes', animSpeedX: 1 }, d)
    expect(m.animSpeed).toBe('fast')
    expect(m.cameraFeel).toBe('lively')
    expect(m.showOdds).toBe(false)
    expect(m.reduceMotion).toBe(true)
    expect(m.sound).toEqual({ master: 100, music: 0, effects: d.sound.effects })
    expect(m.lowGraphics).toBe(d.lowGraphics)
    expect(mergeSettings(null, d)).toEqual(d)
    expect(mergeSettings({ animSpeed: 'warp', cameraFeel: 'wild' }, d)).toEqual(d)
  })

  it('every change is persisted and read back', () => {
    const s = useSettings.getState()
    s.setAnimSpeed('slow')
    s.setCameraFeel('steady')
    s.setReduceMotion(true)
    s.setShowOdds(false)
    s.setSound('music', 12)
    const stored = JSON.parse(mem.get('legionforge.settings.v1')!)
    expect(stored).toMatchObject({ animSpeed: 'slow', cameraFeel: 'steady', reduceMotion: true, showOdds: false, sound: { music: 12 } })
    expect(mergeSettings(stored).sound.music).toBe(12)
  })

  it('reduced motion makes camera tweens cut; the feel scales them', () => {
    const s = useSettings.getState()
    s.setReduceMotion(false)
    s.setCameraFeel('steady')
    expect(cameraTweenFactor()).toBeGreaterThan(1)
    s.setCameraFeel('lively')
    expect(cameraTweenFactor()).toBeLessThan(1)
    s.setReduceMotion(true)
    expect(cameraTweenFactor()).toBe(0)
  })

  it('back to defaults', () => {
    useSettings.getState().resetAll()
    expect(useSettings.getState().animSpeed).toBe('normal')
    expect(useSettings.getState().showOdds).toBe(true)
  })
})
