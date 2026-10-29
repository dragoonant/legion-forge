// The battle canvas: the 36" x 36" Recon table, its terrain from the rules geometry, territories and objective tokens, the units at
// their engine positions, the overlays of the pending decision, and the camera. frameloop="demand": every async change calls
// invalidate() (animStore.setRepaint wires the director to it). The canvas draws the DISPLAY state (the presented-seq cursor), so
// nothing shows before the director has played it.
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { SRGBColorSpace } from 'three'
import type { GameState, Seat } from '@/engine'
import { BattleUnit, type UnitRole } from '../figures/BattleMini'
import { DeployLayer, FX_CSS, LosLayer, MovePreviewLayer, RulerLayer, TargetBadges, TroopersLayer } from '../interaction/Overlays'
import { GROUND_KINDS, cancelDecision, clickPoint, clickUnit, clickableUnits, endDrag, hoverPoint, isDragging } from '../interaction/controller'
import { setRepaint } from '../presentation/animStore'
import { useDisplayState, useSettled, type DisplayState } from '../presentation/presentedStore'
import { humanToAct, useGame } from '../store/game'
import { colors } from '../ui/theme'
import { useUi } from '../ui/uiStore'
import { CameraRig, homePose, type CameraPreset } from './CameraRig'
import { FxLayer } from './FxLayer'
import { Table, tableSize } from './Table'
import { Terrain } from './Terrain'
import { Objectives, Territories } from './Zones'

/** The battle frames the table a little wider than its edge: the HUD above and the prompt below cover its margins. */
const FRAME = 1.12

function Repaint() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    setRepaint(invalidate)
    invalidate()
    return () => setRepaint(() => {})
  }, [invalidate])
  return null
}

/** The invisible floor the pointer works on: hover shows the engine's verdict, a click answers the continuous decisions. */
function Ground({ minX, maxX, minZ, maxZ }: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  useEffect(() => {
    const up = () => endDrag()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[(minX + maxX) / 2, 0.02, (minZ + maxZ) / 2]}
      visible={false}
      name="ground"
      onPointerMove={(e) => {
        hoverPoint({ x: e.point.x, z: e.point.z })
      }}
      onPointerOut={() => {
        if (!isDragging()) hoverPoint(null)
      }}
      onClick={(e) => {
        if (e.delta > 6) return
        clickPoint({ x: e.point.x, z: e.point.z })
      }}
      onContextMenu={(e) => {
        // a right click that did not drag the camera cancels a pending move
        if (e.delta > 6) return
        if (cancelDecision()) e.nativeEvent.preventDefault()
      }}
    >
      <planeGeometry args={[maxX - minX + 4, maxZ - minZ + 4]} />
      <meshBasicMaterial />
    </mesh>
  )
}

function seatColorFor(viewer: Seat) {
  return (s: Seat): string => (s === viewer ? colors.mine : colors.theirs)
}

function Scene({ state }: { state: DisplayState }) {
  const live = useGame((s) => s.state)
  const pending = useGame((s) => s.pending)
  const viewer = useGame((s) => s.viewer)
  const settled = useSettled()
  const selected = useUi((s) => s.selected)
  const hoverUnit = useUi((s) => s.hoverUnit)
  const hoverOption = useUi((s) => s.hoverOption)
  const tool = useUi((s) => s.tool)
  const preset = useUi((s) => s.cameraPreset)
  const human = settled ? humanToAct() : null
  const sz = tableSize(state.table.def)
  const halfX = (sz.w / 2) * FRAME
  const halfZ = (sz.d / 2) * FRAME
  const camPreset: CameraPreset | null = preset ? { id: preset.id, n: preset.nonce } : null
  const seatColor = useMemo(() => seatColorFor(viewer), [viewer])
  // the live state is only drawn on when it is the state the player is looking at
  const lv: GameState | null = live && live.seq === state.seq ? live : null
  const kind = pending?.kind ?? ''
  const clickable = human && pending ? clickableUnits(pending, human) : new Set<string>()
  const groundDecision = !!human && GROUND_KINDS.includes(kind)
  const inspect = tool !== 'none' || !groundDecision
  const units = useMemo(() => Object.values(state.units).filter((u) => u.location === 'table'), [state.units])
  const activeId = state.activation.current?.unitId ?? null
  const roleOf = (id: string): UnitRole => {
    const isAttack = kind.startsWith('attack.')
    const can = clickable.has(id)
    return {
      actable: can && !isAttack,
      target: can && isAttack,
      selected: selected === id,
      hovered: hoverUnit === id || hoverOption === id || !!hoverOption?.startsWith(`${id}.`),
      picked: activeId === id && !can,
    }
  }
  return (
    <>
      <color attach="background" args={[colors.page]} />
      <fog attach="fog" args={[colors.page, 90, 170]} />
      <ambientLight intensity={0.9} color="#c9d3e6" />
      <hemisphereLight args={['#b9c6e0', '#3a3a30', 0.9]} />
      <directionalLight
        position={[-18, 40, 22]}
        intensity={2.6}
        color="#fff2dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={5}
        shadow-camera-far={100}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[20, 14, -22]} intensity={0.7} color="#9ab8ff" />
      <Table def={state.table.def} />
      <Territories state={state} seatColor={seatColor} />
      <Terrain pieces={state.table.def.pieces} />
      <Objectives state={state} seatColor={seatColor} />
      <Ground {...state.table.def.bounds} />
      <Suspense fallback={null}>
        {units.map((u) => {
          const canClick = clickable.has(u.id) || inspect
          return (
            <BattleUnit
              key={u.id}
              unit={u}
              state={state}
              role={roleOf(u.id)}
              seatColor={seatColor}
              {...(canClick ? { onClick: clickUnit } : {})}
              onHover={(id) => useUi.setState({ hoverUnit: id })}
            />
          )
        })}
      </Suspense>
      {lv && pending && human && pending.kind === 'setup.deploy' && <DeployLayer state={lv} pending={pending} />}
      {lv && pending && human && pending.kind === 'move.tool' && <MovePreviewLayer state={lv} pending={pending} />}
      {lv && pending && human && pending.kind === 'move.troopers' && <TroopersLayer state={lv} pending={pending} />}
      {lv && pending && human && kind.startsWith('attack.') && <TargetBadges state={lv} pending={pending} seat={human} />}
      {lv && tool === 'ruler' && <RulerLayer state={lv} />}
      {lv && tool === 'los' && <LosLayer state={lv} />}
      <FxLayer />
      <CameraRig halfX={halfX} halfZ={halfZ} preset={camPreset} />
      <Repaint />
    </>
  )
}

export function BoardCanvas() {
  const state = useDisplayState()
  const home = useMemo(() => {
    if (!state) return [0, 36, 24] as [number, number, number]
    const s = tableSize(state.table.def)
    return homePose((s.w / 2) * FRAME, (s.d / 2) * FRAME)
  }, [state?.table.def.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null
  return (
    <>
      <style>{FX_CSS}</style>
      <Canvas
        data-testid="board-canvas"
        camera={{ position: home, fov: 42, near: 0.2, far: 260 }}
        frameloop="demand"
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = SRGBColorSpace
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Scene state={state} />
      </Canvas>
    </>
  )
}
