// Procedural stand-in for a miniature (M5 replaces it with the Hunyuan3D models): MGSD-style capsule body with a big head, a weapon
// box, the faction's two paint hues and a base disc with a seat-colour rim. Origin at the base centre, y up, front +Z, 1 unit = 1 inch.
// The look comes from the unit's data (`figure.archetype`, faction); heights and radii come from the base and silhouette records.
import { useMemo } from 'react'
import { Color, DoubleSide } from 'three'

export interface Look {
  /** armour / clothing, trim, head */
  major: string
  minor: string
  head: string
  /** relative body height and width */
  tall: number
  wide: number
  cape?: boolean
  visor?: string
}

const LOOKS: Record<string, Look> = {
  stormtrooper: { major: '#e6e8ee', minor: '#2b2d33', head: '#eceef4', tall: 1, wide: 1, visor: '#15161a' },
  'scout-trooper': { major: '#d9dbe0', minor: '#6a6f7a', head: '#e0e2e8', tall: 1, wide: 0.95, visor: '#15161a' },
  'darth-vader': { major: '#16171b', minor: '#7a1c1c', head: '#101114', tall: 1.2, wide: 1.1, cape: true, visor: '#3a3c44' },
  'luke-skywalker': { major: '#1d1d22', minor: '#c9b48a', head: '#d9b48f', tall: 1.05, wide: 1 },
  'rebel-trooper': { major: '#8b8f62', minor: '#d9d1b8', head: '#d9d1b8', tall: 1, wide: 1 },
  'rebel-commando': { major: '#6e7f55', minor: '#4b3a2a', head: '#8a7a5a', tall: 1, wide: 1 },
  'wookiee-warrior': { major: '#6b4a2e', minor: '#3b2a1a', head: '#7a5636', tall: 1.2, wide: 1.25 },
}
const FACTION_DEFAULT: Record<string, Look> = {
  empire: { major: '#d6d8de', minor: '#2b2d33', head: '#e0e2e8', tall: 1, wide: 1, visor: '#15161a' },
  rebels: { major: '#8b8f62', minor: '#d9d1b8', head: '#d9d1b8', tall: 1, wide: 1 },
}
const NEUTRAL: Look = { major: '#8a93a6', minor: '#3a4256', head: '#c8cfdb', tall: 1, wide: 1 }

export function lookFor(archetype: string | undefined, faction: string | undefined): Look {
  return (archetype ? LOOKS[archetype] : undefined) ?? (faction ? FACTION_DEFAULT[faction] : undefined) ?? NEUTRAL
}

export interface ProceduralProps {
  /** silhouette height in inches (from data) */
  height: number
  baseRadius: number
  look: Look
  /** seat colour for the base rim */
  seatColor: string
  isLeader?: boolean
  dim?: boolean
  /** translucent ghost: colour override and opacity (placement previews) */
  ghost?: { color: string; opacity: number }
}

export function Procedural({ height: H, baseRadius: R, look, seatColor, isLeader, dim, ghost }: ProceduralProps) {
  const cols = useMemo(() => ({ major: new Color(look.major), minor: new Color(look.minor), head: new Color(look.head), visor: new Color(look.visor ?? look.minor), seat: new Color(seatColor) }), [look, seatColor])
  const bodyH = H * 0.5 * look.tall
  const bodyR = R * 0.62 * look.wide
  const headR = H * 0.2
  const legsH = H * 0.2
  const op = ghost?.opacity ?? 1
  const mat = (c: Color) => ({ color: ghost ? ghost.color : c, transparent: ghost !== undefined || dim === true, opacity: ghost ? op : dim ? 0.55 : 1, depthWrite: ghost === undefined })
  return (
    <group>
      {/* base disc with the seat rim */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R, 0.12, 24]} />
        <meshStandardMaterial {...mat(new Color('#14161b'))} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.125, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R * 0.86, R * 0.99, 28]} />
        <meshBasicMaterial color={ghost ? ghost.color : cols.seat} transparent opacity={ghost ? op : 1} side={DoubleSide} depthWrite={false} />
      </mesh>
      {/* legs */}
      <mesh position={[-bodyR * 0.45, 0.12 + legsH / 2, 0]} castShadow>
        <cylinderGeometry args={[bodyR * 0.32, bodyR * 0.36, legsH, 8]} />
        <meshStandardMaterial {...mat(cols.minor)} roughness={0.7} />
      </mesh>
      <mesh position={[bodyR * 0.45, 0.12 + legsH / 2, 0]} castShadow>
        <cylinderGeometry args={[bodyR * 0.32, bodyR * 0.36, legsH, 8]} />
        <meshStandardMaterial {...mat(cols.minor)} roughness={0.7} />
      </mesh>
      {/* torso */}
      <mesh position={[0, 0.12 + legsH + bodyH / 2, 0]} castShadow>
        <capsuleGeometry args={[bodyR, Math.max(0.05, bodyH - bodyR * 1.6), 6, 12]} />
        <meshStandardMaterial {...mat(cols.major)} roughness={0.55} />
      </mesh>
      {/* belt trim */}
      <mesh position={[0, 0.12 + legsH + bodyH * 0.25, 0]}>
        <cylinderGeometry args={[bodyR * 1.02, bodyR * 1.02, bodyH * 0.12, 12]} />
        <meshStandardMaterial {...mat(cols.minor)} roughness={0.6} />
      </mesh>
      {/* head */}
      <mesh position={[0, 0.12 + legsH + bodyH + headR * 0.6, 0]} castShadow>
        <sphereGeometry args={[headR, 14, 12]} />
        <meshStandardMaterial {...mat(cols.head)} roughness={0.5} />
      </mesh>
      {look.visor && (
        <mesh position={[0, 0.12 + legsH + bodyH + headR * 0.7, headR * 0.72]}>
          <boxGeometry args={[headR * 1.2, headR * 0.4, headR * 0.5]} />
          <meshStandardMaterial {...mat(cols.visor)} roughness={0.3} />
        </mesh>
      )}
      {/* weapon */}
      <mesh position={[bodyR * 1.05, 0.12 + legsH + bodyH * 0.55, R * 0.55]} castShadow>
        <boxGeometry args={[0.12, 0.16, R * 1.7]} />
        <meshStandardMaterial {...mat(new Color('#2a2c33'))} roughness={0.4} metalness={0.4} />
      </mesh>
      {look.cape && (
        <mesh position={[0, 0.12 + legsH + bodyH * 0.55, -bodyR * 0.9]} castShadow>
          <boxGeometry args={[bodyR * 2.1, bodyH * 1.05, 0.06]} />
          <meshStandardMaterial {...mat(cols.minor)} roughness={0.9} />
        </mesh>
      )}
      {/* leader marker: a tall gold crest ring over the head */}
      {isLeader && (
        <mesh position={[0, 0.12 + legsH + bodyH + headR * 1.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[headR * 0.7, 0.045, 8, 20]} />
          <meshBasicMaterial color={ghost ? ghost.color : '#ffd166'} transparent={ghost !== undefined} opacity={op} />
        </mesh>
      )}
    </group>
  )
}
