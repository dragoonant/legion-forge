// Event union (00-architecture section 5). Frozen after M2. Every event carries the seq of the accepted action that
// caused it, the round and phase it happened in, and the seat it concerns. Hidden fields (a seat's unrevealed command
// pick, a drawn pool token's rank) are replaced with `{ hidden: true }` by `redactEvents` (view.ts).
import type { DecisionKind, DieId, GameResult, Hidden, Phase, RejectionCode, Seat, TimingWindowId, Vec2, Vec3 } from './types'

export interface EventBase {
  seq: number
  round: number
  phase: Phase
  seat: Seat | null
}

export type GameEventBody =
  // game
  | { type: 'GameCreated'; seed: string; engineVersion: string }
  | { type: 'RoundStarted'; round: number }
  | { type: 'PhaseStarted'; name: Phase }
  | { type: 'PhaseEnded'; name: Phase }
  | { type: 'RoundEnded'; round: number }
  | { type: 'GameEnded'; result: GameResult }
  // setup
  | { type: 'BattleCardChosen'; cardId: string }
  | { type: 'UnitDeployed'; unitId: string; minis: { miniId: string; pos: Vec3; yaw: number }[] }
  // command
  | { type: 'CommandCardPicked'; seat: Seat; cardId: string | Hidden }
  | { type: 'CommandCardsRevealed'; picks: Partial<Record<Seat, string>> }
  | { type: 'PriorityDecided'; holder: Seat; pips: Partial<Record<Seat, number>>; rolloff?: { faces: string[]; roller: Seat } }
  | { type: 'OrderIssued'; unitId: string; by: string }
  | { type: 'OrderPoolFormed'; seat: Seat; size: number; byRank: Record<string, number> }
  | { type: 'PoolTokenDrawn'; seat: Seat; rank: string | Hidden }
  // activation
  | { type: 'UnitActivated'; unitId: string; via: 'order' | 'pool'; rank?: string }
  | { type: 'Rallied'; unitId: string; dice: string[]; removed: number }
  | { type: 'ActionDeclared'; unitId: string; action: string; free: boolean }
  | { type: 'ActionResolved'; unitId: string; action: string }
  | { type: 'ActionCancelled'; unitId: string; action: string }
  | { type: 'ActivationEnded'; unitId: string; actionsUsed: number }
  | { type: 'StandbyTriggered'; unitId: string; byUnitId: string }
  // movement
  | {
      type: 'UnitMoved'
      unitId: string
      speed: number
      toolPath: Vec2[]
      leaderFrom: Vec3
      leaderTo: Vec3
      minis: { miniId: string; pos: Vec3; yaw: number }[]
    }
  | { type: 'TroopersPlaced'; unitId: string; minis: { miniId: string; pos: Vec3; yaw: number; outOfCohesion?: boolean }[] }
  | { type: 'Climbed'; unitId: string; from: number; to: number }
  | { type: 'CohesionBroken'; unitId: string; reason: string }
  // attack
  | { type: 'AttackDeclared'; attackerId: string; defenderId: string }
  | { type: 'PoolFormed'; attackerId: string; dice: Record<string, number> }
  | { type: 'AttackRolled'; faces: string[] }
  | { type: 'Rerolled'; indexes: number[]; faces: string[] }
  | { type: 'SurgesConverted'; side: 'attack' | 'defence'; converted: number; tokens: number }
  | { type: 'CoverApplied'; cover: 'none' | 'light' | 'heavy'; byTerrainId: string[] }
  | { type: 'DodgeSpent'; unitId: string; cancelled: number }
  | { type: 'DefenceRolled'; faces: string[] }
  | { type: 'Compared'; hits: number; crits: number; blocks: number; wounds: number }
  | { type: 'WoundsAssigned'; miniId: string; wounds: number }
  | { type: 'MiniDefeated'; unitId: string; miniId: string }
  | { type: 'UnitDefeated'; unitId: string }
  | { type: 'SuppressionChanged'; unitId: string; from: number; to: number; reason: string }
  // morale
  | { type: 'PanicChecked'; unitId: string; suppression: number; courage: number | null; panicked: boolean }
  | { type: 'UnitPanicked'; unitId: string }
  | { type: 'CourageSourceUsed'; unitId: string; sourceId: string }
  // tokens
  | { type: 'TokenChanged'; unitId: string; kind: string; from: number; to: number }
  | { type: 'EffectStarted'; effectId: string; source: string; kind: string }
  | { type: 'EffectEnded'; effectId: string; source: string }
  // cards and keywords
  | { type: 'CardEffect'; cardId: string; detail: Record<string, unknown> }
  | { type: 'KeywordFired'; unitId: string; keyword: string; detail?: Record<string, unknown> }
  // battle
  | { type: 'ObjectiveChanged'; objectiveId: string; detail: Record<string, unknown> }
  | { type: 'PointsScored'; seat: Seat; amount: number; reason: string }
  // dice and draws: one DiceRolled per physical roll; `faces` are face names ('d6': '1'..'6'), `indexes` the face indexes
  | { type: 'DiceRolled'; purpose: string; die: DieId; indexes: number[]; faces: string[]; final: boolean }
  | { type: 'Drawn'; purpose: string; n: number; index: number }
  // meta
  | { type: 'ActionRejected'; code: RejectionCode; reason: string }
  | { type: 'DecisionRequested'; decisionId: string; kind: DecisionKind; window: TimingWindowId }

export type GameEvent = GameEventBody & EventBase
export type EventType = GameEventBody['type']
