// Terrain drawn from the rules geometry: every piece of the compiled table is an extruded footprint of its real height, so what you
// see is what the engine measures (area terrain footprints, barricades and walls as boxes with height, buildings as solid blocks).
// Decoration (trees on forest areas) is deterministic from the piece id and never rules geometry.
import { useMemo } from 'react'
import { DoubleSide, ExtrudeGeometry, Shape } from 'three'
import type { TerrainPiece, Vec2 } from '@/engine'

/** An extruded polygon standing on y = 0: shape points are (x, -z) so that the rotation puts them on the table plane. */
export function prismGeometry(footprint: readonly Vec2[], height: number): ExtrudeGeometry {
  const shape = new Shape()
  footprint.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)))
  shape.closePath()
  const g = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  return g
}

function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

function rand(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

export interface TerrainStyle {
  color: string
  edge: string
  opacity: number
  roughness: number
}

/** Colour by what the piece does for the rules: cover and movement, not by name. */
export function terrainStyle(p: Pick<TerrainPiece, 'kind' | 'cover' | 'movement' | 'blocksLos'>): TerrainStyle {
  if (p.kind === 'area') return { color: p.movement === 'difficult' ? '#2f5a34' : '#3d6a3a', edge: '#7fbf7a', opacity: 0.38, roughness: 1 }
  if (p.kind === 'building') return { color: '#59616f', edge: '#9aa8bd', opacity: 1, roughness: 0.7 }
  // obstacles and barricades: low walls
  return { color: p.cover === 'heavy' ? '#7a6a52' : '#6d7480', edge: '#c9b790', opacity: 1, roughness: 0.75 }
}

function Trees({ piece }: { piece: TerrainPiece }) {
  const trees = useMemo(() => {
    const r = rand(hash(piece.id))
    const b = piece.bbox
    const area = (b.maxX - b.minX) * (b.maxZ - b.minZ)
    const n = Math.min(14, Math.max(3, Math.round(area / 2.2)))
    const out: { x: number; z: number; h: number; s: number }[] = []
    for (let i = 0; i < n; i++) {
      out.push({ x: b.minX + 0.5 + r() * Math.max(0.1, b.maxX - b.minX - 1), z: b.minZ + 0.5 + r() * Math.max(0.1, b.maxZ - b.minZ - 1), h: piece.heightIn * (0.7 + r() * 0.5), s: 0.55 + r() * 0.35 })
    }
    return out
  }, [piece])
  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh position={[0, t.h * 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.14, t.h * 0.4, 6]} />
            <meshStandardMaterial color="#4a3826" roughness={1} />
          </mesh>
          <mesh position={[0, t.h * 0.65, 0]} castShadow>
            <coneGeometry args={[t.s, t.h * 0.75, 7]} />
            <meshStandardMaterial color="#2c5a30" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function TerrainPieceMesh({ piece }: { piece: TerrainPiece }) {
  const geo = useMemo(() => prismGeometry(piece.footprint, Math.max(0.05, piece.heightIn)), [piece])
  const style = terrainStyle(piece)
  const translucent = style.opacity < 1
  return (
    <group data-piece={piece.id} name={`terrain-${piece.id}`}>
      <mesh geometry={geo} castShadow={!translucent} receiveShadow>
        <meshStandardMaterial color={style.color} roughness={style.roughness} transparent={translucent} opacity={style.opacity} side={translucent ? DoubleSide : undefined} depthWrite={!translucent} />
      </mesh>
      {/* a thin outline at the foot so the footprint reads on the mat */}
      <lineLoop position={[0, 0.03, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(piece.footprint.flatMap((p) => [p.x, 0, p.z])), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={style.edge} />
      </lineLoop>
      {piece.kind === 'area' && <Trees piece={piece} />}
    </group>
  )
}

export function Terrain({ pieces }: { pieces: readonly TerrainPiece[] }) {
  return (
    <group name="terrain">
      {pieces.map((p) => (
        <TerrainPieceMesh key={p.id} piece={p} />
      ))}
    </group>
  )
}
