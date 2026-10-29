// The table: the mat (procedural texture), a frame around it, and a ground plane for the pointer lives in Board.tsx.
// 1 world unit = 1 inch, y up, the table centred on the origin (x in [minX, maxX], z in [minZ, maxZ]).
import { useMemo } from 'react'
import type { TableDef } from '@/engine'
import { tableTexture } from './floorTexture'

export interface TableSize {
  w: number
  d: number
  cx: number
  cz: number
}

export function tableSize(def: Pick<TableDef, 'bounds'>): TableSize {
  const b = def.bounds
  return { w: b.maxX - b.minX, d: b.maxZ - b.minZ, cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2 }
}

const FRAME = 1.2

export function Table({ def }: { def: Pick<TableDef, 'bounds'> }) {
  const t = tableSize(def)
  const tex = useMemo(() => tableTexture(t.w, t.d), [t.w, t.d])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[t.cx, 0, t.cz]} receiveShadow>
        <planeGeometry args={[t.w, t.d]} />
        <meshStandardMaterial map={tex} roughness={0.95} metalness={0} />
      </mesh>
      {/* frame: four slabs around the mat */}
      {([
        [t.cx, t.cz - t.d / 2 - FRAME / 2, t.w + FRAME * 2, FRAME],
        [t.cx, t.cz + t.d / 2 + FRAME / 2, t.w + FRAME * 2, FRAME],
        [t.cx - t.w / 2 - FRAME / 2, t.cz, FRAME, t.d],
        [t.cx + t.w / 2 + FRAME / 2, t.cz, FRAME, t.d],
      ] as const).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, -0.25, z]} receiveShadow>
          <boxGeometry args={[w, 0.5, d]} />
          <meshStandardMaterial color="#1a2030" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}
