// Draws the director's transient effects: tracers and floating texts. Reads fxStore; each effect removes itself after its time.
import { Html, Line } from '@react-three/drei'
import { useFx } from '../presentation/fxStore'

export function FxLayer() {
  const list = useFx((s) => s.list)
  return (
    <group name="fx">
      {list.map((f) =>
        f.kind === 'tracer' ? (
          <Line key={f.id} points={[f.from, f.to]} color={f.color} lineWidth={3} transparent opacity={0.9} />
        ) : (
          <Html key={f.id} position={f.to} center zIndexRange={[16, 0]} style={{ pointerEvents: 'none' }}>
            <div data-testid="fx-text" style={{ font: '800 14px system-ui, sans-serif', color: f.color, textShadow: '0 1px 3px #000, 0 0 6px #000', whiteSpace: 'nowrap', animation: 'lf-float 900ms ease-out forwards' }}>
              {f.text}
            </div>
          </Html>
        ),
      )}
    </group>
  )
}
