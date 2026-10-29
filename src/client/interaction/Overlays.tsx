// Board overlays drawn from the engine's answers: the deployment ghost with its verdict, the movement tool (its two segments, the
// draggable hinge, the leader ghost with the cohesion preview), the trooper ghosts, target badges from the attack options' data, the
// range ruler and the LoS / cover probe. Nothing here decides legality: every colour is `validate`'s verdict, every ray and band is
// the engine's.
import { useEffect, useMemo, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { validate, type GameState, type PendingDecision, type Seat, type Vec2 } from '@/engine'
import { leaderOf } from '@/engine/state'
import { miniBody } from '@/engine/measure'
import { rangeBetween, losBetween } from '../game/engineQuery'
import { rejectionText, unitLabel } from '../game/labels'
import { barricadePolygon } from '@/engine/barricades'
import { chargeTarget, previewHinge, previewToward, type ToolPreview } from '../game/toolApi'
import { Procedural, lookFor } from '../figures/Procedural'
import { useUi, type Pt } from '../ui/uiStore'
import { colors } from '../ui/theme'
import {
  beginDrag,
  deployFacing,
  deployUnitFor,
  previewDeployTroopers,
  ptKey,
  rememberToolPreview,
} from './controller'

export const FX_CSS = `
@keyframes lf-pulse { 0%, 100% { opacity: 0.65 } 50% { opacity: 1 } }
@keyframes lf-float { from { opacity: 1; transform: translateY(0) } to { opacity: 0; transform: translateY(-26px) } }
`

const OK = '#45c98b'
const BAD = '#e5484d'

/** A value that follows `v` after it has been still for `ms` (previews recompute when the pointer settles). */
function useSettledValue<T>(v: T, ms: number): T {
  const [x, setX] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setX(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return x
}

function unitDimsOf(state: GameState, unitId: string): { radius: number; height: number; archetype?: string; faction?: string } {
  const u = state.units[unitId]!
  const base = state.data.bases[u.minis[0]!.baseSize]
  const sil = base ? state.data.silhouettes[base.silhouette] : undefined
  const ud = state.data.units[u.unitTypeId] as { figure?: { archetype?: string }; faction?: string } | undefined
  return { radius: base?.radius ?? 0.53, height: sil?.height ?? 1.7, ...(ud?.figure?.archetype ? { archetype: ud.figure.archetype } : {}), ...(ud?.faction ? { faction: ud.faction } : {}) }
}

/** The model's real base (the radius the engine uses for range, cohesion and overlap), drawn flat on the table in the verdict colour:
 *  a filled disc and a bold ring that show through the figure, so an illegal spot reads red at the true size of the base. */
export function BaseFootprint({ radius, color }: { radius: number; color: string }) {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]} renderOrder={5} name="base-footprint" userData={{ radius }}>
      <mesh>
        <circleGeometry args={[radius, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[radius * 0.9, radius, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function MiniGhost({ state, unitId, x, z, yaw, color, opacity = 0.55, leader = false, y = 0 }: { state: GameState; unitId: string; x: number; z: number; yaw: number; color: string; opacity?: number; leader?: boolean; y?: number }) {
  const d = unitDimsOf(state, unitId)
  return (
    <group position={[x, y, z]} rotation={[0, yaw, 0]}>
      <BaseFootprint radius={d.radius} color={color} />
      <Procedural height={d.height} baseRadius={d.radius} look={lookFor(d.archetype, d.faction)} seatColor={color} isLeader={leader} ghost={{ color, opacity }} />
    </group>
  )
}

function Ring({ x, z, r, color, y = 0.07, opacity = 0.9, dashed = false }: { x: number; z: number; r: number; color: string; y?: number; opacity?: number; dashed?: boolean }) {
  const pts = useMemo(() => Array.from({ length: 65 }, (_, i) => [x + Math.sin((i / 64) * Math.PI * 2) * r, y, z + Math.cos((i / 64) * Math.PI * 2) * r] as [number, number, number]), [x, z, r, y])
  return <Line points={pts} color={color} lineWidth={1.5} transparent opacity={opacity} dashed={dashed} dashSize={0.4} gapSize={0.3} />
}

function Tag({ x, z, y = 2.8, text, color, testId }: { x: number; z: number; y?: number; text: string; color: string; testId?: string }) {
  return (
    <Html position={[x, y, z]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
      <div data-testid={testId} style={{ font: '700 11px system-ui, sans-serif', color: '#10141c', background: color, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap', maxWidth: 260 }}>
        {text}
      </div>
    </Html>
  )
}

// ---------------------------------------------------------------- deployment

export function DeployLayer({ state, pending }: { state: GameState; pending: PendingDecision }) {
  const hover = useUi((s) => s.hover)
  const note = useUi((s) => s.hoverNote)
  const picked = useUi((s) => s.deployUnit)
  const facing = useUi((s) => s.facing)
  const unitId = deployUnitFor(pending, picked)
  const regions = (pending.context.regions as Vec2[][] | undefined) ?? []
  const settled = useSettledValue(hover, 40)
  const troopers = useMemo(() => (settled && unitId && note?.ok ? previewDeployTroopers(state, pending, unitId, settled) : []), [state, pending, unitId, settled, note?.ok])
  return (
    <group>
      {regions.map((poly, i) => (
        <Line key={i} points={[...poly, poly[0]!].map((p) => [p.x, 0.08, p.z] as [number, number, number])} color={colors.actable} lineWidth={2} transparent opacity={0.9} />
      ))}
      {hover && unitId && note && (
        <>
          <MiniGhost state={state} unitId={unitId} x={hover.x} z={hover.z} yaw={deployFacing(pending, facing)} color={note.ok ? OK : BAD} leader />
          {note.ok && troopers.map((t) => <MiniGhost key={t.miniId} state={state} unitId={unitId} x={t.x} z={t.z} yaw={deployFacing(pending, facing)} color={OK} opacity={0.35} />)}
          <Tag x={hover.x} z={hover.z} text={note.ok ? 'Deploy here' : note.text} color={note.ok ? OK : BAD} testId="deploy-note" />
        </>
      )}
    </group>
  )
}

// ---------------------------------------------------------------- barricades

/** The barricade ghost under the pointer, green where `validate` accepts it and red where it does not. */
export function BarricadeLayer({ pending }: { pending: PendingDecision }) {
  const hover = useUi((s) => s.hover)
  const note = useUi((s) => s.hoverNote)
  const facing = useUi((s) => s.facing)
  const yaw = deployFacing(pending, facing)
  if (!hover || !note) return null
  const poly = barricadePolygon(hover.x, hover.z, yaw)
  const colour = note.ok ? OK : BAD
  return (
    <group>
      <Line points={[...poly, poly[0]!].map((p) => [p.x, 0.12, p.z] as [number, number, number])} color={colour} lineWidth={3} />
      <Tag x={hover.x} z={hover.z} text={note.text} color={colour} testId="barricade-note" />
    </group>
  )
}

// ---------------------------------------------------------------- movement tool

/** The tool preview for the pending decision: hover (unlocked), or the locked destination with an optional dragged hinge. */
export function useToolPreview(state: GameState, pending: PendingDecision): { preview: ToolPreview | null; locked: boolean } {
  const hover = useUi((s) => s.hover)
  const target = useUi((s) => s.toolTarget)
  const hinge = useUi((s) => s.toolHinge)
  const aim: Pt | null = target ?? hover
  const settled = useSettledValue(aim, target ? 0 : 60)
  const key = `${pending.id}|${ptKey(settled)}|${hinge ? ptKey(hinge) : '-'}|${target ? 'L' : 'H'}`
  const preview = useMemo(() => {
    if (!settled) return null
    try {
      const base = previewToward(state, pending, settled)
      if (target && hinge && base.speed) return previewHinge(state, pending, base.speed, hinge, settled)
      return base
    } catch (e) {
      console.debug('[tool] preview failed', e)
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state])
  useEffect(() => {
    rememberToolPreview(key, target ? preview : null)
    const unitId = typeof pending.context.unitId === 'string' ? pending.context.unitId : null
    const foe = preview?.ok && preview.leader && unitId ? chargeTarget(state, unitId, preview.leader) : null
    useUi.setState({ toolNote: preview ? { ok: preview.ok, text: preview.ok ? `Speed ${preview.speed} tool${foe ? `: ends touching ${unitLabel(state, foe)}, a charge` : ''}` : (preview.reason ?? 'No legal placement') } : null })
    return () => rememberToolPreview(key, null)
  }, [key, preview, target]) // eslint-disable-line react-hooks/exhaustive-deps
  return { preview, locked: !!target }
}

export function MovePreviewLayer({ state, pending }: { state: GameState; pending: PendingDecision }) {
  const unitId = (pending.context.unitId as string | undefined) ?? null
  const { preview, locked } = useToolPreview(state, pending)
  const cohesion = pending.constraints?.cohesion?.distance ?? 3
  if (!unitId || !preview || !preview.shape) {
    return <MoveStartMarker state={state} unitId={unitId} />
  }
  const colour = preview.ok ? OK : BAD
  const unit = state.units[unitId]!
  const lead = preview.leader
  const rects = preview.shape.rects
  return (
    <group>
      <MoveStartMarker state={state} unitId={unitId} />
      {rects.map((r, i) => (
        <Line key={i} points={[...r, r[0]!].map((p) => [p.x, 0.1, p.z] as [number, number, number])} color={colour} lineWidth={2} transparent opacity={locked ? 1 : 0.7} />
      ))}
      {lead && (
        <>
          <MiniGhost state={state} unitId={unitId} x={lead.x} z={lead.z} yaw={lead.yaw} color={colour} leader />
          {preview.ok && <Ring x={lead.x} z={lead.z} r={cohesion} color="#9fe3ff" opacity={0.6} dashed />}
          {preview.troopers.map((t) => (
            <MiniGhost key={t.miniId} state={state} unitId={unitId} x={t.x} z={t.z} yaw={lead.yaw} color={t.outOfCohesion ? BAD : colour} opacity={0.35} />
          ))}
          <Tag
            x={lead.x}
            z={lead.z}
            text={preview.ok ? `Speed ${preview.speed} tool${preview.toolLength ? `, ${preview.toolLength}" long` : ''}` : (preview.reason ?? 'No legal placement')}
            color={colour}
            testId="tool-note"
          />
        </>
      )}
      {locked && preview.hinge && preview.speed && unit.location === 'table' && <HingeHandle at={preview.hinge} />}
    </group>
  )
}

function MoveStartMarker({ state, unitId }: { state: GameState; unitId: string | null }) {
  if (!unitId) return null
  const u = state.units[unitId]
  if (!u || u.location !== 'table') return null
  const lead = leaderOf(u)
  const r = miniBody(state, lead).baseRadius
  return <Ring x={lead.pos.x} z={lead.pos.z} r={r * 1.4} color={colors.selected} y={0.09} />
}

/** The hinge of the aimed tool: drag it to bend the tool. */
function HingeHandle({ at }: { at: Vec2 }) {
  return (
    <group
      position={[at.x, 0.7, at.z]}
      onPointerDown={(e) => {
        e.stopPropagation()
        beginDrag({ kind: 'hinge' })
      }}
    >
      <mesh renderOrder={20}>
        <sphereGeometry args={[0.6, 18, 14]} />
        <meshBasicMaterial color={colors.actable} depthTest={false} transparent opacity={0.95} />
      </mesh>
      {/* a finger needs a wider grip than the mark: an invisible sphere about an inch and a half across */}
      <mesh>
        <sphereGeometry args={[1.6, 10, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------- troopers

export function TroopersLayer({ state, pending }: { state: GameState; pending: PendingDecision }) {
  const unitId = (pending.context.unitId as string | undefined) ?? null
  const drag = useUi((s) => s.trooperDrag)
  const sel = useUi((s) => s.hoverOption)
  const sug = (pending.context.suggestion as { miniId: string; x: number; z: number; yaw: number }[]) ?? []
  // the engine's verdict on the whole placement as the player has dragged it (cohesion, overlap, terrain)
  const verdict = useMemo(() => {
    const placements = sug.map((p) => (drag[p.miniId] ? { ...p, x: Math.round(drag[p.miniId]!.x * 1000) / 1000, z: Math.round(drag[p.miniId]!.z * 1000) / 1000 } : p))
    const seat = pending.seat === 'all' ? 'A' : pending.seat
    return validate(state, { type: 'move.troopers', seat, decisionId: pending.id, payload: { placements } })
  }, [state, pending, drag, sug])
  useEffect(() => {
    useUi.setState({ toolNote: { ok: !verdict, text: verdict ? verdict.reason : 'The placement is legal' } })
  }, [verdict])
  if (!unitId) return null
  const unit = state.units[unitId]!
  const lead = leaderOf(unit)
  const cohesion = pending.constraints?.cohesion?.distance ?? 3
  return (
    <group>
      <Ring x={lead.pos.x} z={lead.pos.z} r={cohesion} color="#9fe3ff" opacity={0.7} dashed />
      {sug.map((t) => {
        const p = drag[t.miniId] ?? { x: t.x, z: t.z }
        const dragged = !!drag[t.miniId]
        const colour = verdict && dragged ? BAD : OK
        return (
          <group
            key={t.miniId}
            onPointerDown={(e) => {
              e.stopPropagation()
              useUi.setState({ hoverOption: t.miniId })
              beginDrag({ kind: 'trooper', id: t.miniId })
            }}
          >
            <MiniGhost state={state} unitId={unitId} x={p.x} z={p.z} yaw={t.yaw} color={colour} opacity={sel === t.miniId ? 0.85 : 0.6} />
            {/* a bigger invisible disc makes the ghost easy to grab */}
            <mesh position={[p.x, 0.2, p.z]} visible={false}>
              <cylinderGeometry args={[1.5, 1.5, 0.4, 12]} />
              <meshBasicMaterial />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// ---------------------------------------------------------------- targets

/** Band / cover / odds badges over the units an attack decision offers (all from the options' own data). */
export function TargetBadges({ state, pending, seat }: { state: GameState; pending: PendingDecision; seat: Seat }) {
  const rows = (pending.options ?? [])
    .filter((o) => o.action.seat === seat)
    .map((o) => ({ o, unitId: (o.action as { payload?: { unitId?: string } }).payload?.unitId }))
    .filter((r): r is { o: (typeof r)['o']; unitId: string } => !!r.unitId && !!state.units[r.unitId])
  return (
    <group>
      {rows.map(({ o, unitId }) => {
        const u = state.units[unitId]!
        const lead = leaderOf(u)
        const data = (o.data ?? {}) as { band?: number | string; cover?: string | null; odds?: { expectedWounds?: number; pDefeat?: number } | null; distance?: number }
        const bits: string[] = []
        if (data.band !== undefined) bits.push(`band ${data.band}`)
        if (data.cover) bits.push(data.cover === 'none' ? 'no cover' : `${data.cover} cover`)
        if (data.odds?.expectedWounds !== undefined) bits.push(`${data.odds.expectedWounds.toFixed(1)} wounds`)
        return (
          <Html key={unitId} position={[lead.pos.x, 3.4, lead.pos.z]} center zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
            <div data-testid={`target-badge-${unitId}`} style={{ font: '700 10px system-ui, sans-serif', color: '#10141c', background: colors.target, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
              {unitLabel(state, unitId)}
              {bits.length > 0 ? `: ${bits.join(', ')}` : ''}
            </div>
          </Html>
        )
      })}
    </group>
  )
}

// ---------------------------------------------------------------- measuring tools

/** Range ruler: rings at each 6" band from the selected unit's leader (base edge), the band numbers from the data constants. */
export function RulerLayer({ state }: { state: GameState }) {
  const sel = useUi((s) => s.selected)
  const point = useUi((s) => s.rulerPoint)
  const hover = useUi((s) => s.hover)
  const u = sel ? state.units[sel] : undefined
  if (!u || u.location !== 'table') return null
  const lead = leaderOf(u)
  const r0 = miniBody(state, lead).baseRadius
  const band = state.data.constants.rangeBand
  const bands = state.data.constants.maxBand
  const tint = ['#58b8ff', '#45c98b', '#ffd166', '#ff9f43', '#ff6b6b']
  const to = point ?? hover
  const gap = to ? Math.max(0, Math.round((Math.hypot(to.x - lead.pos.x, to.z - lead.pos.z) - r0) * 100) / 100) : null
  const bandOf = gap === null ? null : Math.max(1, Math.ceil(gap / band - 1e-9))
  return (
    <group>
      {Array.from({ length: bands }, (_, i) => (
        <group key={i}>
          <Ring x={lead.pos.x} z={lead.pos.z} r={r0 + band * (i + 1)} color={tint[i % tint.length]!} y={0.12} opacity={0.75} />
          <Tag x={lead.pos.x + r0 + band * (i + 1)} z={lead.pos.z} y={0.3} text={`${i + 1}`} color={tint[i % tint.length]!} />
        </group>
      ))}
      {to && gap !== null && (
        <>
          <Line points={[[lead.pos.x, 0.2, lead.pos.z], [to.x, 0.2, to.z]]} color="#ffffff" lineWidth={1.5} />
          <Tag x={to.x} z={to.z} y={0.9} text={`${gap.toFixed(1)}" (${bandOf && bandOf > bands ? 'beyond' : `band ${bandOf}`})`} color="#ffffff" testId="ruler-note" />
        </>
      )}
    </group>
  )
}

/** LoS / cover probe: the engine's rays between two picked units, tinted by the terrain piece that blocked them. */
export function LosLayer({ state }: { state: GameState }) {
  const pair = useUi((s) => s.losPair)
  const [a, b] = pair
  const view = useMemo(() => (a && b && a !== b ? losBetween(state, a, b) : null), [state, a, b])
  const range = useMemo(() => (a && b && a !== b ? rangeBetween(state, a, b) : null), [state, a, b])
  const tints = ['#ff9f43', '#c58bff', '#58b8ff', '#ff6bcb', '#9fe3a0']
  const pieceIds = view ? [...new Set(view.rays.flatMap((r) => r.blockers))] : []
  const lead = b ? state.units[b] : undefined
  return (
    <group>
      {view?.rays.map((r, i) => {
        const tint = r.clear ? '#45c98b' : tints[Math.max(0, pieceIds.indexOf(r.blockers[0] ?? '')) % tints.length]!
        return <Line key={i} points={[[r.from.x, r.from.y, r.from.z], [r.to.x, r.to.y, r.to.z]]} color={tint} lineWidth={1} transparent opacity={r.clear ? 0.45 : 0.7} />
      })}
      {view && lead && (
        <Tag
          x={leaderOf(lead).pos.x}
          z={leaderOf(lead).pos.z}
          y={3.2}
          testId="los-note"
          color="#ffffff"
          text={`${view.visible.length > 0 ? 'Visible' : 'No line of sight'}${range ? `, ${range.distance.toFixed(1)}" (band ${range.band})` : ''}, cover: ${view.cover}`}
        />
      )}
    </group>
  )
}

export function rejectionLine(code: string, reason: string): string {
  return rejectionText({ code: code as never, reason })
}
