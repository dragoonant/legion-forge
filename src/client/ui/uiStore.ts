// Transient UI state shared by the DOM overlay and the 3D interaction layer: selection, hover, the deploy pick, the hovered board
// point, the tool placement being aimed, the measuring tools, open panels. Never holds engine truth; resets when a decision changes.
import { create } from 'zustand'

export interface Pt {
  x: number
  z: number
}

export type CameraRequest = 'home' | 'top' | 'left' | 'right'
export type ToolMode = 'none' | 'ruler' | 'los'

interface UiState {
  /** the unit whose card is shown */
  selected: string | null
  hoverUnit: string | null
  /** an option id hovered in the prompt (highlights the unit it names) */
  hoverOption: string | null
  /** deployment: the unit picked to place next, and the facing (radians) it is set up with; null keeps the engine's default */
  deployUnit: string | null
  facing: number | null
  /** the board point under the pointer */
  hover: Pt | null
  /** the verdict of the current hover position for the pending continuous decision */
  hoverNote: { ok: boolean; text: string } | null
  /** movement tool: the destination clicked (locked) and the hinge point dragged, if any */
  toolTarget: Pt | null
  toolHinge: Pt | null
  /** trooper adjustments dragged by the player: mini id -> position */
  trooperDrag: Record<string, Pt>
  /** the engine's verdict on the tool being aimed (set by the overlay) */
  toolNote: { ok: boolean; text: string } | null
  /** deployment: place every remaining unit with the engine's own spots */
  autoDeploy: boolean
  feedOpen: boolean
  /** the briefing / objective panel is open */
  briefingOpen: boolean
  cameraPreset: { id: CameraRequest; nonce: number } | null
  /** the measuring tool (key M): range ruler from the selected unit, or the LoS/cover probe between two units */
  tool: ToolMode
  /** LoS tool: the two units picked (attacker first) */
  losPair: string[]
  /** ruler: a clicked point */
  rulerPoint: Pt | null
  /** every overlay panel is hidden, leaving the board and the show/hide button (H). One flag: no panel keeps its own. */
  uiHidden: boolean
  setUiHidden(hidden: boolean): void
  toggleUi(): void
  set(p: Partial<UiState>): void
  resetDecision(): void
  requestCamera(id: CameraRequest): void
}

export const useUi = create<UiState>((set) => ({
  selected: null,
  hoverUnit: null,
  hoverOption: null,
  deployUnit: null,
  facing: null,
  hover: null,
  hoverNote: null,
  toolTarget: null,
  toolHinge: null,
  trooperDrag: {},
  toolNote: null,
  autoDeploy: false,
  feedOpen: true,
  briefingOpen: false,
  cameraPreset: null,
  tool: 'none',
  losPair: [],
  rulerPoint: null,
  uiHidden: false,
  setUiHidden: (uiHidden) => set({ uiHidden }),
  toggleUi: () => set((s) => ({ uiHidden: !s.uiHidden })),
  set: (p) => set(p),
  resetDecision: () => set({ facing: null, hover: null, hoverNote: null, hoverOption: null, toolTarget: null, toolHinge: null, trooperDrag: {}, toolNote: null }),
  requestCamera: (id) => set((s) => ({ cameraPreset: { id, nonce: (s.cameraPreset?.nonce ?? 0) + 1 } })),
}))
