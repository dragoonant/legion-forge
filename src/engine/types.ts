// Contract types for the engine: the code form of docs/spec/00-architecture.md sections 2-8.
// Must not diverge from that file. Frozen after M2: changes are additive and get a dated row in its change log.
//
// The engine never imports src/data at runtime. It consumes a runtime-shaped bundle: the `Runtime*` records below and
// `EngineBundle` (bundle.ts, next stage, maps validated JSON onto them). Space and dice code takes these shapes as plain
// typed parameters so it can be tested without any data file.

export interface RngState {
  s: [number, number, number, number]
}

export type Seat = 'A' | 'B'
export type Phase = 'setup' | 'command' | 'activation' | 'end' | 'ended'

export interface Vec2 {
  x: number
  z: number
}
export interface Vec3 {
  x: number
  y: number
  z: number
}
export type Polygon = Vec2[]
export interface Segment2 {
  a: Vec2
  b: Vec2
}

// ---------------------------------------------------------------------------
// Runtime data records (what the engine reads; 20-data-schema.md after parsing)
// ---------------------------------------------------------------------------

export type AttackColour = 'red' | 'black' | 'white'
export type DefenceColour = 'red' | 'white'
export type AttackFace = 'hit' | 'crit' | 'surge' | 'blank'
export type DefenceFace = 'block' | 'surge' | 'blank'
/** A physical die: `atk:<colour>`, `def:<colour>` or a plain `d6` (priority tie roll-offs use `def:red`). */
export type DieId = 'atk:red' | 'atk:black' | 'atk:white' | 'def:red' | 'def:white' | 'd6'

/** The shape of `core/dice.json` (counts per face in `faceOrder`; the face index of ScriptedRng follows that order). */
export interface DiceDef {
  attack: Record<AttackColour, { sides: number; faces: Record<AttackFace, number> }> & { faceOrder: AttackFace[] }
  defence: Record<DefenceColour, { sides: number; faces: Record<DefenceFace, number> }> & { faceOrder: DefenceFace[] }
  ladder: { attack: AttackColour[]; defence: DefenceColour[] }
}

/** Expanded face tables: index = die face index (what `Rng.int(sides)` returns). */
export interface DiceTables {
  attack: Record<AttackColour, AttackFace[]>
  defence: Record<DefenceColour, DefenceFace[]>
  ladder: { attack: AttackColour[]; defence: DefenceColour[] }
}

/** Rule numbers the engine reads (core/constants.json `values`); inches unless named otherwise. */
export interface RuleConstants {
  rangeBand: number
  halfRange: number
  maxBand: number
  contactEpsilon: number
  cohesionDistance: number
  heightBandSize: number
  [key: string]: number
}

export interface RuntimeSilhouette {
  id: string
  radius: number
  height: number
  /** sample layout for LoS rays: `rings` horizontal rims from base to top, `perRing` points each, plus axis points */
  samples: { rings: number; perRing: number; axis: boolean }
}

export interface RuntimeBase {
  id: string
  /** radius in inches (diameterMm / 25.4 / 2) */
  radius: number
  notched: boolean
  silhouette: string
}

export interface MovementToolDef {
  speeds: Record<'1' | '2' | '3', { segments: [number, number]; hingeAt: number }>
  widthIn: number
  prongWidthIn: number
  hingeLimitDeg: number
}

export type TerrainKind = 'area' | 'obstacle' | 'barricade' | 'building'
export type CoverValue = 'none' | 'light' | 'heavy'
export type MovementClass = 'open' | 'difficult' | 'impassable'

/** A terrain piece as authored in a layout (`layout#/layout.pieces[]`). */
export interface TerrainPieceDef {
  id: string
  kind: TerrainKind
  footprint: Polygon
  heightIn: number
  cover: CoverValue
  blocksLos: boolean
  movement: MovementClass
  climbable: boolean
}

export interface TableLayout {
  id: string
  size: { x: number; z: number }
  pieces: TerrainPieceDef[]
}

/** A compiled terrain piece: the authored piece plus its height band and bounding box. */
export interface TerrainPiece extends TerrainPieceDef {
  /** ceil(heightIn / heightBandSize): the range-tool height rule (R-8.5) */
  heightBand: number
  bbox: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export interface TableDef {
  id: string
  size: { x: number; z: number }
  /** x in [minX, maxX], z in [minZ, maxZ], centred on the origin */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  pieces: TerrainPiece[]
  /** named deployment polygons (battle cards fill them; empty for a bare table) */
  zones: Record<string, Polygon>
}

export interface ObjectiveMarker {
  id: string
  pos: Vec2
  tags: string[]
  /** unit id when carried as an Asset */
  heldBy?: string | null
  /** `poi` markers obscure like 3" heavy area terrain (R-18.2) */
  kind: string
}

export interface TableState {
  def: TableDef
  objectives: Record<string, ObjectiveMarker>
  markers: Record<string, unknown>
}

/** Open record placeholder; bundle.ts (next stage) tightens each into its runtime type. */
export interface RuntimeRecord {
  id: string
  name?: string
  [key: string]: unknown
}

/** Snapshot of every record a game uses; copied into the state so `step` needs no bundle. */
export interface GameData {
  dataVersion: string
  ruleset: string
  dice: DiceTables
  constants: RuleConstants
  tool: MovementToolDef
  bases: Record<string, RuntimeBase>
  silhouettes: Record<string, RuntimeSilhouette>
  layouts: Record<string, TableLayout>
  units: Record<string, RuntimeRecord>
  weapons: Record<string, RuntimeRecord>
  keywords: Record<string, RuntimeRecord>
  upgrades: Record<string, RuntimeRecord>
  cards: Record<string, RuntimeRecord>
  battleCards: Record<string, RuntimeRecord>
}

/** What `createGame` consumes. bundle.ts (next stage) builds it from validated data with `bundleFromData`. */
export interface EngineBundle {
  data: GameData
}

// ---------------------------------------------------------------------------
// Units and game state (00 section 7.6)
// ---------------------------------------------------------------------------

export interface Mini {
  id: string
  isLeader: boolean
  pos: Vec3
  /** radians, clockwise from above; +Z at yaw 0 */
  yaw: number
  baseSize: string
  wounds: number
  maxWounds: number
  alive: boolean
  /** set when cohesion could not be met at the last placement (R-7.2); informational, legal */
  outOfCohesion?: boolean
}

export type OrderState = 'none' | 'faceUp' | 'pool' | 'spent'

export interface Unit {
  id: string
  seat: Seat
  unitTypeId: string
  rank: string
  minis: Mini[]
  leaderId: string
  location: 'reserve' | 'table' | 'defeated'
  order: { state: OrderState }
  activated: boolean
  suppression: number
  tokens: Record<string, number>
  keywords: { id: string; x?: number; params?: Record<string, unknown> }[]
  weapons: string[]
  upgrades: string[]
  /** derived cache, recomputed after every step */
  engagedWith: string[]
  flags: Record<string, unknown>
}

export interface Activation {
  unitId: string
  seat: Seat
  via: 'order' | 'pool'
  actionsLeft: number
  /** `move`: the action was a Move action (a Move, Climb, Withdraw, free Move or a Jump), what Relentless and Standby read */
  performed: { action: string; free: boolean; move?: boolean }[]
  declared: { action: string; params?: Record<string, unknown> } | null
  /** the unit began its Make Actions step Panicked (CRB p23): it is tested once, then fixed for the activation */
  panickedAtStart?: boolean
}

export interface OrderPool {
  /** rank ids, unordered: draws pick by rng; `view` exposes counts only */
  tokens: string[]
}

export interface PlayerState {
  armyId: string
  hand: string[]
  played: string[]
  points: number
  pool: OrderPool
}

export interface CommandIssue {
  issuerId: string | null
  seat: Seat
  remaining: number
  cardId: string
}

export interface AttackState {
  stage: string
  attackerId: string
  defenderId: string | null
  data: Record<string, unknown>
}

export interface ActiveEffect {
  id: string
  source: string
  seat: Seat
  kind: string
  unitId?: string
  /** `activation` | `round` | `phase` | `game` | `startOfActivation:<unitId>` */
  expires: string
  data?: Record<string, unknown>
}

export interface BattleState {
  blue: Seat | null
  cards: string[]
  data: Record<string, unknown>
}

export interface GameResult {
  winner: Seat | 'draw'
  points: Record<Seat, number>
  reason: 'battle' | 'resign' | 'concede' | 'roundLimit'
}

export interface RosterUnit {
  unit: string
  upgrades: string[]
  id?: string
}

export interface GameSetup {
  ruleset: string
  battle: { cards: string[] } | { auto: true }
  armies: Record<Seat, { factionId: string; listId?: string; units: RosterUnit[]; commandHand: string[] }>
  /** which compiled layout of `GameData.layouts` to play on (additive, M2a); default: the first one */
  layout?: string
  options?: { autoDeploy?: boolean; autoBattle?: boolean; maxRounds?: number; firstPriority?: Seat; /** decline every Divulge offer without asking (tests and demos that do not care) */ autoDivulge?: boolean }
}

export interface GameState {
  version: 1
  engineVersion: string
  seed: string
  ruleset: string
  phase: Phase
  round: number
  seq: number
  nextDecision: number
  pending: PendingDecision | null
  rng: RngState
  hash: string
  log: Action[]
  /** seq of the last accepted action that rolled, drew or revealed; undo refuses to cross it */
  undoFence: number
  origin: { setup: GameSetup }
  data: GameData
  table: TableState
  players: Record<Seat, PlayerState>
  units: Record<string, Unit>
  command: { picks: Partial<Record<Seat, string>>; revealed: boolean; priority: Seat | null; issuing: CommandIssue | null }
  activation: { turn: Seat | null; current: Activation | null; drawn: { seat: Seat; rank: string } | null }
  attack: AttackState | null
  effects: ActiveEffect[]
  nextEffect: number
  battle: BattleState
  result: GameResult | null
}

// ---------------------------------------------------------------------------
// Decisions, actions, rejections (00 sections 3, 4, 5, 8)
// ---------------------------------------------------------------------------

export const TIMING_WINDOWS = [
  'setup.*',
  'round.start',
  'command.picked',
  'command.revealed',
  'command.priority',
  'command.ordersIssued',
  'activation.phaseStart',
  'activation.start',
  'activation.rallied',
  'action.declared',
  'move.started',
  'move.ended',
  'action.resolved',
  'attack.defenderDeclared',
  'attack.poolFormed',
  'attack.rolled',
  'attack.rerolled',
  'attack.surgesConverted',
  'attack.coverApplied',
  'attack.modified',
  'defence.rolled',
  'defence.surgesConverted',
  'defence.modified',
  'attack.compared',
  'attack.woundsAssigned',
  'attack.suppression',
  'attack.resolved',
  'melee.charged',
  'mini.defeated',
  'unit.defeated',
  'activation.end',
  'end.start',
  'end.scoring',
  'round.end',
  'battle.end',
] as const

export type TimingWindowId = (typeof TIMING_WINDOWS)[number]

export const DECISION_KINDS = [
  'setup.battle',
  'setup.deploy',
  'command.pick',
  'command.issuer',
  'command.order',
  'activation.choose',
  'activation.pick',
  'action.choose',
  'move.tool',
  'move.troopers',
  'attack.defender',
  'attack.pool',
  'attack.extraDefender',
  'attack.spend',
  'attack.allocate',
  'activation.standby',
  'keyword.choice',
  'card.choice',
  'battle.place',
  'end.choice',
  'confirm',
] as const

export type DecisionKind = (typeof DECISION_KINDS)[number]

export interface Pose2 {
  x: number
  z: number
  yaw: number
}

/** A pose of the hinged movement tool (R-6.3): where segment 1 starts, its heading, and the hinge angles (radians). */
export interface ToolPose {
  /** speed number of the tool used (1-3): selects the tool length */
  speed: number
  /** start of segment 1: on the leader's base circle (or on the table edge when deploying) */
  start: Vec2
  /** heading of segment 1 (radians, +Z = 0, clockwise); radial from the base when moving */
  heading: number
  /** hinge angles; the two-segment tool has exactly one (positive = clockwise) */
  hinges: number[]
  /** a Climb move: speed 1 only, vertical change up to one height band (R-6.9) */
  climb?: boolean
}

export interface TrooperPlacement {
  miniId: string
  x: number
  z: number
  yaw: number
}

/** Payload of the answer to each decision kind, plus `pass` and `resign`. */
export interface ActionPayloadMap {
  'setup.battle': { cardId?: string; auto?: true }
  'setup.deploy': { unitId: string; leader: Pose2; troopers?: TrooperPlacement[] }
  'command.pick': { cardId: string }
  'command.issuer': { unitId: string }
  'command.order': { unitId?: string; done?: true }
  'activation.choose': { unitId?: string; drawPool?: true }
  'activation.pick': { unitId: string }
  'action.choose': {
    action: string
    speed?: number
    weaponIds?: string[]
    targetId?: string
    params?: Record<string, unknown>
  }
  'move.tool': ToolPose & { leader: Pose2 }
  'move.troopers': { placements: TrooperPlacement[] }
  'attack.defender': { unitId: string }
  /** miniId -> weaponId: each model adds at most one weapon */
  'attack.pool': { weaponIds: Record<string, string> }
  'attack.extraDefender': { unitId?: string; done?: true }
  'attack.spend': { choice: string; params?: Record<string, unknown> }
  'attack.allocate': { miniId: string }
  'activation.standby': { unitId?: string; response?: string }
  'keyword.choice': { option: string }
  'card.choice': { option: string }
  'battle.place': { x: number; z: number }
  'end.choice': { option: string }
  confirm: { choice: 'continue' | 'concede' }
  pass: Record<string, never>
  resign: Record<string, never>
}

export type ActionType = keyof ActionPayloadMap

export type ActionOf<K extends ActionType> = {
  type: K
  seat: Seat
  decisionId: string
  /** assigned on accept; optional on input */
  seq?: number
  payload: ActionPayloadMap[K]
}

/** Discriminated union generated from the payload map. */
export type Action = { [K in ActionType]: ActionOf<K> }[ActionType]

export interface DecisionOption {
  id: string
  labelKey: string
  action: Action
  data?: Record<string, unknown>
}

/** Continuous answers: where a tool pose, trooper placement or deployment spot may go. */
export interface MoveConstraints {
  kind: 'tool' | 'troopers' | 'deploy' | 'place'
  unitId?: string
  /** deploy and place: the polygon the base must lie wholly within */
  region?: Polygon
  /** tool: the fastest tool the unit may use after modifiers */
  maxSpeed?: number
  /** troopers: the cohesion rule in force */
  cohesion?: { distance: number; vertical: number }
}

export interface PendingDecision {
  /** "d:<n>" monotonic */
  id: string
  /** 'all' = simultaneous: each seat in `context.seats` (default both) answers once; `context.answered` lists who has */
  seat: Seat | 'all'
  kind: DecisionKind
  window: TimingWindowId
  /** ids and engine numbers for this choice (odds, bands, distances, suggestions); for 'all': `answered: Seat[]` */
  context: Record<string, unknown>
  options?: DecisionOption[]
  constraints?: MoveConstraints
  canPass: boolean
}

export type RejectionCode =
  | 'E_WRONG_DECISION'
  | 'E_WRONG_SEAT'
  | 'E_ALREADY_ANSWERED'
  | 'E_NOT_AN_OPTION'
  | 'E_OUT_OF_RANGE'
  | 'E_OVERLAP'
  | 'E_TERRAIN'
  | 'E_OFF_TOOL'
  | 'E_COHESION'
  | 'E_ENGAGED'
  | 'E_NO_ACTIONS'
  | 'E_ACTION_RESTRICTED'
  | 'E_INVALID_TARGET'
  | 'E_NOT_VISIBLE'
  | 'E_CARD_RESTRICTED'
  | 'E_PASS_NOT_ALLOWED'
  | 'E_GAME_OVER'
  | 'E_SCHEMA'
  /** a rule stubbed until a later stage */
  | 'E_TODO'

export interface Rejection {
  code: RejectionCode
  reason: string
  details?: Record<string, unknown>
}

/** Marks a field the viewer may not see. */
export interface Hidden {
  hidden: true
}

/**
 * Per-seat redacted view handed to deciders. Strips `rng`, `log`, and also `seed` and `hash` (both determine hidden
 * data); hides the other seat's unrevealed command pick, the order of each order pool (counts per rank remain) and a
 * drawn pool token's rank until its unit is picked.
 */
export type PlayerView = Omit<GameState, 'rng' | 'log' | 'seed' | 'hash' | 'command' | 'players' | 'activation'> & {
  viewer: Seat
  command: Omit<GameState['command'], 'picks'> & { picks: Partial<Record<Seat, string | Hidden>> }
  players: Record<Seat, Omit<PlayerState, 'pool'> & { pool: { size: number; byRank: Record<string, number> } }>
  activation: Omit<GameState['activation'], 'drawn'> & { drawn: { seat: Seat; rank: string | Hidden } | null }
}

export interface StepResult {
  state: GameState
  events: import('./events').GameEvent[]
  pending: PendingDecision | null
  rejection?: Rejection
}

export interface SaveFile {
  version: 1
  engineVersion: string
  setup: GameSetup
  seed: string
  actions: Action[]
  finalHash: string
}

// --- M2b-flow ---
// Additive (docs/spec/00-architecture.md section 11, 2026-10-29 M2b-flow row). Interfaces merge with the declarations above.

/** Tables the flow modules read beyond the first bundle (bundleFromData fills them; optional so older fixtures stay valid). */
export interface GameData {
  formats?: Record<string, RuntimeRecord>
  maps?: Record<string, RuntimeRecord>
  unitTypes?: Record<string, RuntimeRecord>
  actions?: Record<string, RuntimeRecord>
  ranks?: Record<string, RuntimeRecord>
  tokens?: Record<string, RuntimeRecord>
  armyLists?: Record<string, RuntimeRecord>
  factions?: Record<string, RuntimeRecord>
}

export interface GameSetup {
  /** `core/formats.json` key; default 'recon' */
  format?: string
  /** force the blue player (tests and the sim); the blue roll is skipped */
  blue?: Seat
}

export interface PlayerState {
  /** Advantage tokens in the pass pool (R-4.9) */
  passTokens?: number
}

export interface Mini {
  /** the upgrade card that added this model (squad, heavy weapon, captain...) */
  upgradeId?: string
  /** the one weapon only this model may use (heavy-weapon trooper) */
  weaponId?: string
}

/** One Move in progress (the `move.tool` then `move.troopers` pair). `free`: a free Move (Standby) that costs no action. */
export interface MoveFrame {
  unitId: string
  seat: Seat
  kind: 'move' | 'climb' | 'withdraw' | 'standby' | 'deploy' | 'controlled'
  maxSpeed: number
  free: boolean
  /** a Scout or Jump Move: difficult terrain does not slow it (CRB p52, p54) */
  ignoreDifficult?: boolean
  /** a Jump X Move: terrain up to this height is ignored or stood on (CRB p52) */
  jumpHeight?: number
  /** the enemy unit this Move put the leader in base contact with (a Move into Melee, CRB p28) */
  meleeWith?: string
}

/** The flow machine's private state, kept in `state.battle.data.flow`. */
export interface FlowState {
  /** name of the continuation a suspended timing window resumes (see modules.ts `resumeFlow`) */
  resume: string | null
  /** timing windows already offered (`<window>|<scope>`), so each is offered once */
  opened: string[]
  lastPass: Record<Seat, boolean>
  /** the last pool draw found no unit: the next pass is free (R-5.3) */
  deadDraw: boolean
  /** seats still to nominate a commander and issue orders, priority first */
  issueSeats: Seat[]
  /** activations started so far (scopes activation windows) */
  activations: number
  move: MoveFrame | null
  /** a Standby window in progress: the triggering enemy unit, the standby units that already answered, and whether one is mid-response */
  standby: { triggerUnitId: string; done: string[]; responding: boolean; then: 'move.ended' | 'action.resolved'; frame: MoveFrame | null } | null
  /** setup deployment cursor: the seat that places next */
  deployTurn: Seat | null
}

/** Battle bookkeeping in `state.battle.data` (Recon cards, territories, caps, marks). */
export interface BattleData {
  format: string
  /** the table edge blue sits on: 'zMax' | 'xMax' | 'zMin' | 'xMin' (canonical map frame: blue at +z) */
  edge: string
  rotation: number
  territories: Record<Seat, Polygon[]>
  objective: string
  secondary: string
  advantage: Record<Seat, string>
  /** Wound tokens on POIs (Bunker Assault) */
  wounds: Record<string, number>
  /** POIs destroyed in the current End phase: id -> its tags (the marker itself is removed) */
  destroyedThisPhase: Record<string, string[]>
  /** scoring caps used: `<card>|<rule>|<seat>|game` or `...|r<round>` */
  caps: Record<string, number>
  /** marked rows of scoring tables: `<card>|<seat>|<row>` -> round marked */
  marks: Record<string, number>
  /** chooseUnits results by name */
  picks: Record<string, string[]>
  flow: FlowState
}

// ---------------------------------------------------------------------------
// --- M2b-combat --- (append only; attack pipeline, keywords, morale, command-card state shapes)
// ---------------------------------------------------------------------------

/**
 * Per-model loadout (declaration merge into `Mini`): `weaponIds` are the only weapons this model may add to a pool
 * (upgrade models such as a heavy weapon trooper); absent means the unit's base weapons (`Unit.weapons`).
 */
export interface Mini {
  weaponIds?: string[]
  /** the upgrade card that added this model, when it did */
  upgradeId?: string
}

export type AttackKind = 'ranged' | 'melee'

export interface PoolWeapon {
  miniId: string
  weaponId: string
}

/** One attack die of a pool: its current colour and face, the weapon that contributed it and the effects that changed its colour. */
export interface AtkDie {
  colour: AttackColour
  face: AttackFace
  weaponId: string
  changedBy: string[]
}

export interface ShiftRec {
  effectId: string
  party: 'attacker' | 'defender'
  dir: 1 | -1
  /** number of different dice the effect changes; 0 = all */
  count: number
  /** restrict to the dice of one weapon (Assault X: "that weapon's dice") */
  weaponId?: string
}

/** A keyword gained for the pool (Assault from a Saboteur, Pierce from Duelist), optionally only for some weapons. */
export interface GrantedKw {
  id: string
  x?: number
  /** weapon ids that gain it; absent = the whole pool */
  weaponIds?: string[]
}

export type PoolStep =
  | 'start'
  | 'roll'
  | 'reroll'
  | 'surges'
  | 'cover'
  | 'dodge'
  | 'modifyAtk'
  | 'defRoll'
  | 'defSurges'
  | 'modifyDef'
  | 'compare'
  | 'wounds'
  | 'suppression'
  | 'surgeTokens'
  | 'sniper'
  | 'defSurgeTokens'
  | 'done'

export interface CoverRecord {
  level: CoverValue
  /** cover before the Suppressed improvement and Sharpshooter */
  base: CoverValue
  obscured: number
  total: number
  byTerrainId: string[]
  /** the cover dice rolled (white defence faces) and the hits they cancelled */
  dice: DefenceFace[]
  cancelled: number
}

export interface PoolFrame {
  defenderId: string
  kind: AttackKind
  weapons: PoolWeapon[]
  step: PoolStep
  /** windows already fired for this pool (each opens at most once) */
  windows: string[]
  /** effect keys already executed this pool (windows are re-collected until nothing new fires) */
  fired: string[]
  granted: GrantedKw[]
  shifts: ShiftRec[]
  dice: AtkDie[]
  /** tokens each side spent in this pool, by token kind */
  spent: { attacker: Record<string, number>; defender: Record<string, number> }
  /** a hit or crit existed when Roll Attack Dice ended (R-12.11) */
  suppressFlag: boolean
  cover: CoverRecord | null
  hits: number
  crits: number
  defColour: DefenceColour
  def: DefenceFace[]
  defChart: 'block' | null
  blocks: number
  wounds: number
  /** extra suppression from Suppressive / Overwhelm */
  extraSuppression: number
  /** Sniper Team: the pool was upgraded, so the surge-step cancel is offered */
  sniperEligible: boolean
  sniperOffered: boolean
  /** the whole pool was cancelled (Sniper Team) */
  cancelled: boolean
  /** wounds actually suffered by the defender (after the ranged cap) */
  woundsSuffered: number
  /** models defeated in this pool */
  defeated: string[]
  /** wounds still to assign while the allocate loop is mid-way */
  allocLeft: number
}

export interface AttackFrame {
  /** the frame-resume name registered with `registerFrameResume` that continues the caller when the attack ends */
  resume: string
  resumeData: Record<string, unknown>
  free: boolean
  rangedOnly: boolean
  meleeOnly: boolean
  forcedDefenderId: string | null
  /** the unit moved this activation (Cumbersome, Sniper Team) */
  moved: boolean
  /** extra range bands granted by Long Shot for this attack */
  rangeBonus: number
  longShotAsked: boolean
  stage: 'declaring' | 'defender' | 'form' | 'extra' | 'resolve' | 'closing' | 'finished'
  usedMinis: string[]
  usedWeapons: string[]
  pools: PoolFrame[]
  current: number
  /** wounds the defending units suffered, by unit id (Fear and Dead Men) */
  woundsTaken: Record<string, number>
  /** defenders whose `attack.resolved` effects have run (each distinct defender gets its own pass, CRB p53, p51) */
  resolvedFor?: string[]
}

/** What the flow module passes to `startAttack`. */
export interface StartAttackInput {
  attackerId: string
  resume: string
  resumeData?: Record<string, unknown>
  free?: boolean
  rangedOnly?: boolean
  meleeOnly?: boolean
  /** the Standby free attack and Charge name their only legal defender */
  forcedDefenderId?: string
}

/** A free action granted by a keyword or card (`ActiveEffect.kind === 'freeAction'`, `data`). */
export interface FreeActionGrant {
  action: string
  weapons?: 'melee' | 'ranged'
  target?: string
  ignoreAttackLimit?: boolean
  /** the unit must take it at the start of its Make Actions (Compel) */
  startOfActions?: boolean
  source: string
}

/** A pending offer a code effect hands the keywords module to turn into a decision. */
export interface CodeOffer {
  seat: Seat
  unitId: string
  keyword: string
  labelKey: string
  options: { id: string; labelKey: string; data?: Record<string, unknown> }[]
  /** free-form payload handed back to the code effect's `resolve` */
  payload: Record<string, unknown>
  /** the code effect that made the offer */
  code: string
}
