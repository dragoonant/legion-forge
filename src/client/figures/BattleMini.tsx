// One unit on the table: its live miniatures on their bases at the engine positions (the presented state), the unit badge over the
// leader, and the highlight rings by colour role. Handlers are attached only when the open decision (or the inspector) can use a
// click on the unit; otherwise clicks fall through to the table behind (KB gotcha).
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { Mini, Seat, Unit } from '@/engine'
import { animPosition } from '../presentation/animStore'
import type { DisplayState } from '../presentation/presentedStore'
import { colors } from '../ui/theme'
import { Procedural, lookFor } from './Procedural'
import { UnitBadge } from './UnitPips'

export interface UnitRole {
  /** the decision can act on this unit now */
  actable: boolean
  selected: boolean
  hovered: boolean
  /** an attack / pool target of the open decision */
  target: boolean
  /** picked already (a multi-step choice) */
  picked: boolean
}

export interface UnitDims {
  radius: number
  height: number
}

export function unitDims(state: DisplayState, unit: Unit): UnitDims {
  const m = unit.minis[0]!
  const base = state.data.bases[m.baseSize]
  const sil = base ? state.data.silhouettes[base.silhouette] : undefined
  return { radius: base?.radius ?? 0.53, height: sil?.height ?? 1.7 }
}

function MiniFigure({ mini, unit, state, dims, seatColor, dim }: { mini: Mini; unit: Unit; state: DisplayState; dims: UnitDims; seatColor: string; dim: boolean }) {
  const ref = useRef<Group>(null)
  const ud = state.data.units[unit.unitTypeId] as { figure?: { archetype?: string }; faction?: string } | undefined
  const look = lookFor(ud?.figure?.archetype, ud?.faction)
  useFrame((s) => {
    const g = ref.current
    if (!g) return
    const a = animPosition(mini.id)
    if (a) {
      g.position.set(a.x, mini.pos.y, a.z)
      g.rotation.y = a.heading
      s.invalidate()
    } else {
      g.position.set(mini.pos.x, mini.pos.y, mini.pos.z)
      g.rotation.y = mini.yaw
    }
  })
  return (
    <group ref={ref} position={[mini.pos.x, mini.pos.y, mini.pos.z]} rotation={[0, mini.yaw, 0]} name={`mini-${mini.id}`}>
      <Procedural height={dims.height} baseRadius={dims.radius} look={look} seatColor={seatColor} isLeader={mini.id === unit.leaderId} dim={dim} />
    </group>
  )
}

export function BattleUnit({
  unit,
  state,
  role,
  seatColor,
  onClick,
  onHover,
}: {
  unit: Unit
  state: DisplayState
  role: UnitRole
  seatColor: (s: Seat) => string
  onClick?: (unitId: string) => void
  onHover?: (unitId: string | null) => void
}) {
  const dims = unitDims(state, unit)
  const minis = unit.minis.filter((m) => m.alive)
  const leader = minis.find((m) => m.id === unit.leaderId) ?? minis[0]
  if (!leader || unit.location !== 'table') return null
  const ringColour = role.target ? colors.target : role.selected ? colors.selected : role.picked ? colors.picked : role.actable ? colors.actable : role.hovered ? '#ffffff' : null
  const handlers = onClick
    ? {
        onClick: (e: { delta: number; stopPropagation(): void }) => {
          if (e.delta > 6) return
          e.stopPropagation()
          onClick(unit.id)
        },
      }
    : {}
  const hover = onHover
    ? { onPointerOver: () => onHover(unit.id), onPointerOut: () => onHover(null) }
    : {}
  return (
    <group name={`unit-${unit.id}`} userData={{ unit: unit.id }} {...handlers} {...hover}>
      {minis.map((m) => (
        <MiniFigure key={m.id} mini={m} unit={unit} state={state} dims={dims} seatColor={seatColor(unit.seat)} dim={unit.order.state === 'spent'} />
      ))}
      {ringColour &&
        minis.map((m) => (
          <mesh key={`ring-${m.id}`} position={[m.pos.x, m.pos.y + 0.16, m.pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[dims.radius * 1.05, dims.radius * 1.3, 28]} />
            <meshBasicMaterial color={ringColour} transparent opacity={role.actable && !role.selected && !role.target ? 0.9 : 0.95} depthWrite={false} />
          </mesh>
        ))}
      <group position={[leader.pos.x, leader.pos.y, leader.pos.z]}>
        <UnitBadge unit={unit} state={state} y={dims.height + 1.0} />
      </group>
    </group>
  )
}
