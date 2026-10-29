// Territories (the deployment zones of the battle card, drawn from `battle.data.territories`) and objective tokens (the table's
// markers: points of interest and assets). Everything is read from the display state; secured status comes from the engine.
import { useMemo } from 'react'
import { DoubleSide, Shape } from 'three'
import { Html } from '@react-three/drei'
import type { GameState, Seat, Vec2 } from '@/engine'
import { markerFootprint, securedBy, labelOf } from '@/engine/battle'
import type { DisplayState } from '../presentation/presentedStore'
import { colors } from '../ui/theme'

function PolygonFill({ poly, color, opacity }: { poly: readonly Vec2[]; color: string; opacity: number }) {
  const shape = useMemo(() => {
    const s = new Shape()
    poly.forEach((p, i) => (i === 0 ? s.moveTo(p.x, -p.z) : s.lineTo(p.x, -p.z)))
    s.closePath()
    return s
  }, [poly])
  const line = useMemo(() => new Float32Array(poly.flatMap((p) => [p.x, 0.04, p.z])), [poly])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} side={DoubleSide} depthWrite={false} />
      </mesh>
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[line, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.8} />
      </lineLoop>
    </group>
  )
}

export function Territories({ state, seatColor }: { state: DisplayState; seatColor: (s: Seat) => string }) {
  const t = (state.battle.data as { territories?: Record<Seat, Vec2[][]> }).territories
  if (!t) return null
  return (
    <group name="territories">
      {(['A', 'B'] as const).flatMap((seat) => (t[seat] ?? []).map((poly, i) => <PolygonFill key={`${seat}${i}`} poly={poly} color={seatColor(seat)} opacity={0.1} />))}
    </group>
  )
}

export function Objectives({ state, seatColor }: { state: DisplayState; seatColor: (s: Seat) => string }) {
  const g = state as unknown as GameState
  const markers = Object.values(state.table.objectives).sort((a, b) => (a.id < b.id ? -1 : 1))
  return (
    <group name="objectives">
      {markers.map((m) => {
        if (m.heldBy) return null
        const r = markerFootprint(g, m).baseRadius
        let owner: Seat | null = null
        try {
          owner = securedBy(g, m)
        } catch {
          owner = null
        }
        const color = owner ? seatColor(owner) : colors.ground
        const label = labelOf(m)
        return (
          <group key={m.id} position={[m.pos.x, 0, m.pos.z]} name={`objective-${m.id}`} userData={{ objective: m.id }}>
            <mesh position={[0, 0.12, 0]} castShadow>
              <cylinderGeometry args={[r, r, 0.24, 24]} />
              <meshStandardMaterial color="#1c2230" roughness={0.6} metalness={0.3} />
            </mesh>
            <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[r * 0.45, r * 0.82, 32]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <Html position={[0, 0.9, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
              <div data-testid={`objective-${m.id}`} style={{ font: '800 10px system-ui, sans-serif', color: '#10141c', background: color, borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap', opacity: 0.92 }}>
                {label ?? (m.kind === 'poi' ? 'POI' : m.kind)}
                {owner ? ' held' : ''}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
