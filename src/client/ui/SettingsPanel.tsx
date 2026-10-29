// Settings: animation speed, camera feel, reduced motion, show odds, graphics, and the sound levels (placeholders until audio lands).
// Everything persists per browser through presentation/settings.ts.
import type { ReactNode } from 'react'
import { useSettings, type AnimSpeed, type CameraFeel, type SoundLevels } from '../presentation/settings'
import { ModalFrame } from './ModalFrame'
import { colors } from './theme'
import { useUi } from './uiStore'
import { Btn } from './widgets'

const SPEEDS: { id: AnimSpeed; label: string }[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
  { id: 'instant', label: 'Instant' },
]
const FEELS: { id: CameraFeel; label: string }[] = [
  { id: 'steady', label: 'Steady' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'lively', label: 'Lively' },
]
const SOUNDS: { id: keyof SoundLevels; label: string }[] = [
  { id: 'master', label: 'Master volume' },
  { id: 'music', label: 'Music' },
  { id: 'effects', label: 'Effects' },
]

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ padding: '10px 0', borderTop: `1px solid ${colors.border}` }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: colors.muted, margin: '2px 0 6px', lineHeight: 1.35 }}>{hint}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
    </div>
  )
}

function Choice<T extends string>({ value, options, onPick, name }: { value: T; options: { id: T; label: string }[]; onPick: (v: T) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <Btn key={o.id} role="radio" aria-checked={value === o.id} data-testid={`${name}-${o.id}`} variant={value === o.id ? 'active' : 'base'} onClick={() => onPick(o.id)}>
          {o.label}
        </Btn>
      ))}
    </div>
  )
}

function Toggle({ on, label, onChange, testId }: { on: boolean; label: string; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', minHeight: 32 }}>
      <input type="checkbox" data-testid={testId} checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 20, height: 20, accentColor: colors.accent }} />
      <span>{label}</span>
    </label>
  )
}

export function SettingsPanel() {
  const open = useUi((s) => s.settingsOpen)
  const s = useSettings()
  if (!open) return null
  return (
    <ModalFrame title="Settings" testId="settings-panel" onClose={() => useUi.setState({ settingsOpen: false })}>
      <Row title="Animation speed" hint="How long banners, dice and movement are given. Instant skips every pause.">
        <Choice name="speed" value={s.animSpeed} options={SPEEDS} onPick={s.setAnimSpeed} />
      </Row>
      <Row title="Camera feel" hint="How quickly the camera glides when the game moves it, and when you use the presets.">
        <Choice name="feel" value={s.cameraFeel} options={FEELS} onPick={s.setCameraFeel} />
      </Row>
      <Row title="Motion and odds">
        <Toggle on={s.reduceMotion} label="Reduce motion (no pulsing, no camera flights)" onChange={s.setReduceMotion} testId="set-reduce-motion" />
        <Toggle on={s.showOdds} label="Show odds (expected wounds, defeat chance)" onChange={s.setShowOdds} testId="set-show-odds" />
        <Toggle on={s.lowGraphics} label="Low graphics (no shadows, lighter drawing)" onChange={s.setLowGraphics} testId="set-low-graphics" />
      </Row>
      <Row title="Sound" hint="There is no audio in the game yet. These levels are saved for when it arrives.">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, width: '100%' }}>
          {SOUNDS.map((o) => (
            <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32 }}>
              <span style={{ width: 120, flex: '0 0 auto' }}>{o.label}</span>
              <input type="range" min={0} max={100} value={s.sound[o.id]} data-testid={`sound-${o.id}`} aria-label={o.label} onChange={(e) => s.setSound(o.id, Number(e.target.value))} style={{ flex: 1, minWidth: 0, accentColor: colors.accent }} />
              <span style={{ width: 28, textAlign: 'right', color: colors.muted }}>{s.sound[o.id]}</span>
            </label>
          ))}
        </div>
      </Row>
      <div style={{ paddingTop: 10, borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: colors.muted }}>Saved in this browser.</span>
        <Btn data-testid="settings-reset" onClick={() => s.resetAll()}>Back to defaults</Btn>
      </div>
    </ModalFrame>
  )
}
