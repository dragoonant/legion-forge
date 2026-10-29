// Action union (frozen after M2). The union itself lives in types.ts next to the payload map;
// this file holds constructors so callers never hand-build envelopes (client, AI and tests use act.*).
import type { Action, ActionOf, ActionPayloadMap, ActionType, PendingDecision, Pose2, Seat, ToolPose, TrooperPlacement } from './types'

export type { Action, ActionOf, ActionPayloadMap, ActionType }

/** What a constructor needs from the decision it answers. `seat` may be 'all' (then the answering seat is passed). */
type P = Pick<PendingDecision, 'id'> & { seat: Seat | 'all' }
type Choose = ActionPayloadMap['action.choose']

export function makeAction<K extends ActionType>(type: K, pending: P, payload: ActionPayloadMap[K], seat?: Seat): ActionOf<K> {
  const who = seat ?? pending.seat
  if (who === 'all') throw new Error(`makeAction(${type}): a decision for 'all' needs the answering seat`)
  return { type, seat: who, decisionId: pending.id, payload }
}

export const act = {
  pass: (p: P, seat?: Seat) => makeAction('pass', p, {}, seat),
  resign: (p: P, seat: Seat) => makeAction('resign', p, {}, seat),
  // setup
  battle: (p: P, cardId: string) => makeAction('setup.battle', p, { cardId }),
  autoBattle: (p: P) => makeAction('setup.battle', p, { auto: true }),
  deploy: (p: P, unitId: string, leader: Pose2, troopers?: TrooperPlacement[]) =>
    makeAction('setup.deploy', p, troopers ? { unitId, leader, troopers } : { unitId, leader }),
  // command phase (seat required: 'all' decisions)
  pick: (p: P, seat: Seat, cardId: string) => makeAction('command.pick', p, { cardId }, seat),
  issuer: (p: P, unitId: string) => makeAction('command.issuer', p, { unitId }),
  order: (p: P, unitId: string) => makeAction('command.order', p, { unitId }),
  orderDone: (p: P) => makeAction('command.order', p, { done: true }),
  // activation
  activate: (p: P, unitId: string) => makeAction('activation.choose', p, { unitId }),
  drawPool: (p: P) => makeAction('activation.choose', p, { drawPool: true }),
  pickUnit: (p: P, unitId: string) => makeAction('activation.pick', p, { unitId }),
  choose: (p: P, action: string, params: Omit<Choose, 'action'> = {}) => makeAction('action.choose', p, { action, ...params }),
  endActivation: (p: P) => makeAction('action.choose', p, { action: 'end' }),
  standby: (p: P, unitId: string, response?: string) =>
    makeAction('activation.standby', p, response ? { unitId, response } : { unitId }),
  // movement
  tool: (p: P, pose: ToolPose, leader: Pose2) => makeAction('move.tool', p, { ...pose, leader }),
  troopers: (p: P, placements: TrooperPlacement[]) => makeAction('move.troopers', p, { placements }),
  // attack
  defender: (p: P, unitId: string) => makeAction('attack.defender', p, { unitId }),
  pool: (p: P, weaponIds: Record<string, string>) => makeAction('attack.pool', p, { weaponIds }),
  extraDefender: (p: P, unitId: string) => makeAction('attack.extraDefender', p, { unitId }),
  noExtraDefender: (p: P) => makeAction('attack.extraDefender', p, { done: true }),
  spend: (p: P, choice: string, params?: Record<string, unknown>) =>
    makeAction('attack.spend', p, params ? { choice, params } : { choice }),
  allocate: (p: P, miniId: string) => makeAction('attack.allocate', p, { miniId }),
  // choices and battle
  keywordChoice: (p: P, option: string) => makeAction('keyword.choice', p, { option }),
  cardChoice: (p: P, option: string) => makeAction('card.choice', p, { option }),
  place: (p: P, x: number, z: number) => makeAction('battle.place', p, { x, z }),
  endChoice: (p: P, option: string) => makeAction('end.choice', p, { option }),
  confirm: (p: P, choice: 'continue' | 'concede') => makeAction('confirm', p, { choice }),
}
