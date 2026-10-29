// Presentation / UI settings: animation speed, camera feel, sound placeholders, reduced motion, odds on or off, graphics level.
// Persisted per browser in localStorage (every access guarded: private windows and node tests have no storage).
import { create } from 'zustand'
import { currentParams, type AnimSpeed } from '../params'
import { getFormFactor } from '../ui/formFactor'

export type { AnimSpeed }

const KEY = 'legionforge.settings.v1'

/** How the camera moves when the game moves it: 'steady' glides slowly, 'lively' snaps. */
export type CameraFeel = 'steady' | 'balanced' | 'lively'

export interface SoundLevels {
  master: number
  music: number
  effects: number
}

export interface Persisted {
  animSpeed: AnimSpeed
  lowGraphics: boolean
  /** the camera goes behind the shooter, then closes on the target, then back to the player's view */
  cinematicShots: boolean
  cameraFeel: CameraFeel
  /** no pulsing rings, no camera flights, no sliding banners */
  reduceMotion: boolean
  /** show the engine's odds (expected wounds, defeat chance) beside attack options and on target badges */
  showOdds: boolean
  /** placeholders until M6: stored and shown, nothing plays yet */
  sound: SoundLevels
  /** the first-turn hint strip was dismissed */
  hintsDismissed: boolean
}

const FEELS: readonly CameraFeel[] = ['steady', 'balanced', 'lively']

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function defaultSettings(): Persisted {
  return {
    animSpeed: 'normal',
    lowGraphics: getFormFactor().phone,
    cinematicShots: true,
    cameraFeel: 'balanced',
    reduceMotion: prefersReducedMotion(),
    showOdds: true,
    sound: { master: 80, music: 60, effects: 80 },
    hintsDismissed: false,
  }
}

const level = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : fallback)

/** Merge a stored blob over the defaults, dropping anything of the wrong type. Pure: unit-tested. */
export function mergeSettings(raw: unknown, base: Persisted = defaultSettings()): Persisted {
  const out: Persisted = { ...base, sound: { ...base.sound } }
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  if (r.animSpeed === 'slow' || r.animSpeed === 'normal' || r.animSpeed === 'fast' || r.animSpeed === 'instant') out.animSpeed = r.animSpeed
  if (typeof r.lowGraphics === 'boolean') out.lowGraphics = r.lowGraphics
  if (typeof r.cinematicShots === 'boolean') out.cinematicShots = r.cinematicShots
  if (typeof r.cameraFeel === 'string' && (FEELS as readonly string[]).includes(r.cameraFeel)) out.cameraFeel = r.cameraFeel as CameraFeel
  if (typeof r.reduceMotion === 'boolean') out.reduceMotion = r.reduceMotion
  if (typeof r.showOdds === 'boolean') out.showOdds = r.showOdds
  if (typeof r.hintsDismissed === 'boolean') out.hintsDismissed = r.hintsDismissed
  if (r.sound && typeof r.sound === 'object') {
    const s = r.sound as Record<string, unknown>
    out.sound = { master: level(s.master, out.sound.master), music: level(s.music, out.sound.music), effects: level(s.effects, out.sound.effects) }
  }
  return out
}

function load(): Persisted {
  let base = defaultSettings()
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    if (raw) base = mergeSettings(JSON.parse(raw), base)
  } catch {
    /* storage unavailable */
  }
  const fromUrl = currentParams().speed
  if (fromUrl) base.animSpeed = fromUrl
  return base
}

interface SettingsState extends Persisted {
  setAnimSpeed(s: AnimSpeed): void
  setLowGraphics(v: boolean): void
  setCinematicShots(v: boolean): void
  setCameraFeel(v: CameraFeel): void
  setReduceMotion(v: boolean): void
  setShowOdds(v: boolean): void
  setSound(k: keyof SoundLevels, v: number): void
  setHintsDismissed(v: boolean): void
  /** back to the defaults (the speed in the URL still wins) */
  resetAll(): void
}

const pick = (s: Persisted): Persisted => ({
  animSpeed: s.animSpeed,
  lowGraphics: s.lowGraphics,
  cinematicShots: s.cinematicShots,
  cameraFeel: s.cameraFeel,
  reduceMotion: s.reduceMotion,
  showOdds: s.showOdds,
  sound: { ...s.sound },
  hintsDismissed: s.hintsDismissed,
})

export const useSettings = create<SettingsState>((set, get) => {
  const put = (p: Partial<Persisted>) => {
    set(p)
    persist(get())
  }
  return {
    ...load(),
    setAnimSpeed: (animSpeed) => put({ animSpeed }),
    setLowGraphics: (lowGraphics) => put({ lowGraphics }),
    setCinematicShots: (cinematicShots) => put({ cinematicShots }),
    setCameraFeel: (cameraFeel) => put({ cameraFeel }),
    setReduceMotion: (reduceMotion) => put({ reduceMotion }),
    setShowOdds: (showOdds) => put({ showOdds }),
    setSound: (k, v) => put({ sound: { ...get().sound, [k]: level(v, get().sound[k]) } }),
    setHintsDismissed: (hintsDismissed) => put({ hintsDismissed }),
    resetAll: () => put(defaultSettings()),
  }
})

function persist(s: Persisted): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(pick(s)))
  } catch {
    /* ignore */
  }
}

/** Multiplier applied to every presentation pause. 'instant' = 0 (no waiting at all); 'slow' leaves time to read every roll and feed line. */
export function speedFactor(speed: AnimSpeed = useSettings.getState().animSpeed): number {
  return speed === 'instant' ? 0 : speed === 'fast' ? 0.35 : speed === 'slow' ? 2.5 : 1
}

/** Multiplier for camera tweens (the game's own flights and the presets). Reduced motion makes them cut (0). */
export function cameraTweenFactor(): number {
  const s = useSettings.getState()
  if (s.reduceMotion) return 0
  return s.cameraFeel === 'steady' ? 1.7 : s.cameraFeel === 'lively' ? 0.5 : 1
}
