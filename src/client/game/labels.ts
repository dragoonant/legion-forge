// Names and sentences for everything the UI shows. Every unit, weapon, keyword, card, rank, token and battle-card name is read
// from the data snapshot the game carries (`state.data`) or from the data bundle; there is no name literal in the client. The
// sentences around the names (feed lines, prompt titles, rejection texts) are our own wording.
import type { Action, DecisionOption, GameData, GameEvent, GameState, PendingDecision, Rejection, Seat, Unit } from '@/engine'

/** What the labels need of a game: its data snapshot, units and origin (a GameState or a PlayerView both fit). */
export type Snap = Pick<GameState, 'data' | 'units' | 'origin'>

type Rec = { id: string; name?: string; text?: string; subtitle?: string | null; rank?: string; points?: number; pips?: number; [k: string]: unknown }

const rec = (table: Record<string, unknown> | undefined, id: string): Rec | undefined => table?.[id] as Rec | undefined

// ---- perspective: "You" and "Opponent" when a human plays one seat, the army names when two bots play
let perspective: Seat | null = null
export function setLabelPerspective(seat: Seat | null): void {
  perspective = seat
}
export const getLabelPerspective = (): Seat | null => perspective

// ---- names from data
export const unitTypeName = (d: GameData, id: string): string => rec(d.units, id)?.name ?? id
export const weaponName = (d: GameData, id: string): string => rec(d.weapons, id)?.name ?? id
export const upgradeName = (d: GameData, id: string): string => rec(d.upgrades, id)?.name ?? id
export const cardName = (d: GameData, id: string): string => rec(d.cards, id)?.name ?? id
export const cardText = (d: GameData, id: string): string => rec(d.cards, id)?.text ?? ''
export const battleCardName = (d: GameData, id: string): string => rec(d.battleCards, id)?.name ?? id
export const battleCardText = (d: GameData, id: string): string => rec(d.battleCards, id)?.text ?? ''
export const factionName = (d: GameData, key: string): string => rec(d.factions, key)?.name ?? key
export const rankName = (d: GameData, key: string): string => rec(d.ranks, key)?.name ?? key
const grantCache = new WeakMap<GameData, Map<string, string>>()

/** Names of the actions that cards, upgrades and keywords grant (`{ grant: { action: { id, name } } }` anywhere in the data). */
function grantedNames(d: GameData): Map<string, string> {
  let m = grantCache.get(d)
  if (m) return m
  m = new Map()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    const g = (o.grant as { action?: { id?: string; name?: string } } | undefined)?.action
    if (g?.id && g.name) m!.set(g.id, g.name)
    for (const x of Object.values(o)) if (x && typeof x === 'object') walk(x)
  }
  for (const table of [d.cards, d.upgrades, d.keywords]) walk(Object.values(table))
  grantCache.set(d, m)
  return m
}

/** An action by its data name: a core action (`move`), or one granted by a card, upgrade or keyword (`card:<id>`, `<id>`). */
export function actionName(d: GameData, key: string): string {
  const core = rec(d.actions, `core.action.${key}`)?.name
  if (core) return core
  const id = key.replace(/^(card|kw|free):/, '')
  return grantedNames(d).get(id) ?? humanize(id.split('.').pop() ?? id)
}
export const tokenName = (d: GameData, key: string): string => rec(d.tokens, key.includes('.') ? key : `core.token.${key}`)?.name ?? key
export const keywordRec = (d: GameData, id: string): Rec | undefined => rec(d.keywords, id)

/** "Pierce 2" style: the keyword's data name, with its X when it has one. */
export function keywordLabel(d: GameData, k: { id: string; x?: number; param?: string }): string {
  const name = rec(d.keywords, k.id)?.name ?? k.id
  return k.x !== undefined ? `${name} ${k.x}` : k.param ? `${name}: ${k.param}` : name
}

export function armyListName(d: GameData, listId: string): string {
  return rec(d.armyLists, listId)?.name ?? listId
}

export function armyOf(state: Snap, seat: Seat): { factionId: string; listId?: string } {
  return state.origin.setup.armies[seat]
}

export function seatName(state: Snap | null, seat: Seat | null): string {
  if (!seat) return ''
  if (perspective) return seat === perspective ? 'You' : 'Opponent'
  if (!state) return `Player ${seat}`
  return `${factionName(state.data, armyOf(state, seat).factionId)} (${seat})`
}

/** A unit instance: its data name, numbered when its owner fields several of the same kind. */
export function unitLabel(state: Snap, unitId: string): string {
  const u = state.units[unitId]
  if (!u) return unitId
  const name = unitTypeName(state.data, u.unitTypeId)
  const same = Object.values(state.units).filter((x) => x.seat === u.seat && unitTypeName(state.data, x.unitTypeId) === name)
  return same.length > 1 ? `${name} #${same.indexOf(u) + 1}` : name
}

export function unitSubtitle(d: GameData, u: Unit): string {
  return rec(d.units, u.unitTypeId)?.subtitle ?? ''
}

export function miniLabel(state: Snap, miniId: string): string {
  const uid = miniId.split('.')[0]!
  return state.units[uid] ? unitLabel(state, uid) : miniId
}

export const EDGE_TEXT: Record<string, string> = { zMax: 'the near edge', zMin: 'the far edge', xMax: 'the right edge', xMin: 'the left edge' }

const WHY_NOT: Record<string, string> = {
  undeployed: 'This unit is not on the table yet: it can only move in.',
  engaged: 'It is engaged with an enemy, so it cannot move normally.',
  notEngaged: 'It is not engaged with an enemy.',
  noActions: 'No actions are left this activation.',
  alreadyUsed: 'Already done once this activation.',
  noTarget: 'No enemy can be attacked right now.',
  nothingToRecover: 'There is no suppression to remove.',
  notTrooper: 'Only trooper units can go on standby.',
  hasToken: 'It already holds a standby token.',
  afterAttack: 'It already attacked this activation.',
  afterWithdraw: 'It withdrew this activation.',
  afterStandby: 'It went on standby this activation.',
  speed: 'Its speed is too low.',
  noClimbable: 'There is nothing to climb within reach.',
  panicked: 'A panicked unit cannot do this.',
  notAvailable: 'That is not available right now.',
  used: 'Already used.',
  exhausted: 'This card is exhausted until the Ready phase.',
  expended: 'This card has been expended for the battle.',
  unavailable: 'Not available right now.',
}
export const whyNotText = (code: string): string => WHY_NOT[code] ?? code

const REJECT: Record<string, string> = {
  E_OUT_OF_RANGE: 'That is out of reach.',
  E_OVERLAP: 'Bases would overlap.',
  E_TERRAIN: 'Terrain is in the way.',
  E_OFF_TOOL: 'The tool does not fit there.',
  E_COHESION: 'The unit would break cohesion.',
  E_ENGAGED: 'An engaged unit cannot do that.',
  E_NOT_VISIBLE: 'No line of sight.',
  E_TODO: 'That rule is not available yet in this build.',
}
export function rejectionText(r: Pick<Rejection, 'code' | 'reason'>): string {
  const base = REJECT[r.code]
  return base && !r.reason ? base : r.reason || base || r.code
}

// ---- decisions
export function decisionTitle(p: PendingDecision, state: Snap): string {
  const d = state.data
  const c = p.context as Record<string, unknown>
  const unit = (id: unknown) => (typeof id === 'string' ? unitLabel(state, id) : 'the unit')
  switch (p.kind) {
    case 'setup.battle':
      return 'Choose the table edge you deploy from'
    case 'setup.deploy':
      return 'Deploy a unit inside your territory'
    case 'command.pick':
      return 'Pick a command card for this round'
    case 'command.issuer':
      return 'Choose who issues the orders'
    case 'command.order': {
      const card = typeof c.cardId === 'string' ? cardName(d, c.cardId) : 'the card'
      return `${card}: give an order to a unit (${String(c.remaining ?? '')} left)`
    }
    case 'activation.choose':
      return 'Choose a unit to activate'
    case 'activation.pick':
      return `The pool gave a ${rankName(d, String(c.rank))} token: pick the unit to activate`
    case 'action.choose':
      return `${unit(c.unitId)}: choose an action (${String(c.actionsLeft)} left)`
    case 'move.tool':
      if (c.kind === 'controlled') return `${unit(c.unitId)}: you place its movement tool (speed ${String(c.maxSpeed ?? 1)})`
      if (c.kind === 'withdraw') return `${unit(c.unitId)}: withdraw from the melee`
      return `${unit(c.unitId)}: place the movement tool`
    case 'move.troopers':
      return `${unit(c.unitId)}: set down the rest of the unit`
    case 'attack.defender':
      return `${unit(c.attackerId)}: choose a target`
    case 'attack.pool':
      return `${unit(c.attackerId)}: form the attack pool against ${unit(c.defenderId)}`
    case 'attack.extraDefender':
      return `${unit(c.attackerId)}: add a pool against another unit?`
    case 'attack.spend':
      return attackStepTitle(String(c.step ?? ''))
    case 'attack.allocate':
      return `${unit(c.unitId)}: choose which model takes the wounds`
    case 'activation.standby':
      return 'A standby unit may react'
    case 'keyword.choice': {
      const name = typeof c.keyword === 'string' ? keywordLabel(d, { id: c.keyword }) : 'A keyword'
      return `${name}${c.unitId ? ` (${unit(c.unitId)})` : ''}: ${choiceStage(String(c.stage ?? ''))}`
    }
    case 'card.choice': {
      const name = typeof c.cardId === 'string' ? cardName(d, c.cardId) : 'A command card'
      return `${name}: ${choiceStage(String(c.stage ?? ''))}`
    }
    case 'battle.place':
      if (c.terrain === 'barricade') return `Place a barricade${typeof c.left === 'number' ? ` (${c.left} left to place)` : ''}`
      return 'Place a token on the table'
    case 'end.choice':
      return 'End phase choice'
    case 'confirm':
      return 'The battle is over'
    default:
      return String(p.kind)
  }
}

const STAGE_TEXT: Record<string, string> = { use: 'use it?', option: 'choose an option', pick: 'choose a unit', distribute: 'distribute the effect', offer: 'make a choice', divulge: 'reveal it before the battle?' }
const choiceStage = (stage: string): string => STAGE_TEXT[stage] ?? 'make a choice'

/** What each step of the attack pipeline asks (the engine's `context.step` of an `attack.spend`). */
function attackStepTitle(step: string): string {
  switch (step) {
    case 'reroll':
      return 'Aim: choose dice to reroll'
    case 'surgeTokens':
      return 'Attacker: spend surge tokens?'
    case 'dodge':
      return 'Defender: spend dodge tokens?'
    case 'defSurgeTokens':
      return 'Defender: spend surge tokens?'
    case 'sniper':
      return 'Attacker: cancel the attack?'
    default:
      return step ? `Attack step: ${step}` : 'Attack choice'
  }
}

/** The same hint worded for a finger (tap, confirm bar), or null when the click wording already fits. */
export function touchHint(p: PendingDecision): string | null {
  switch (p.kind) {
    case 'setup.deploy':
      return 'Pick a unit below, then tap your territory to stage it. Tap the ghost again, or Place here, to set it down.'
    case 'command.issuer':
    case 'command.order':
      return 'Tap a highlighted unit on the table, or a row below, then confirm.'
    case 'activation.choose':
      return 'Tap a unit with a face-up order token and confirm, or draw from the pool.'
    case 'activation.pick':
      return 'Tap one of the highlighted units and confirm.'
    case 'move.tool':
      if (p.context.kind === 'controlled' || p.context.kind === 'withdraw') return null
      return 'Tap where the leader should end. Drag the gold hinge to bend the tool; the point rides above your finger. Confirm to commit.'
    case 'move.troopers':
      return 'The engine placed the rest of the unit. Drag a model to adjust (it rides above your finger), then confirm.'
    case 'attack.defender':
      return 'Tap the unit to shoot or fight, then confirm. Each row shows its range band, cover and expected wounds.'
    case 'battle.place':
      return p.context.terrain === 'barricade' ? 'Tap the table to stage the barricade; tap it again, or Turn, to adjust and place it.' : null
    default:
      return null
  }
}

/** One line on how to answer (what to click), by decision kind. */
export function decisionHint(p: PendingDecision): string {
  switch (p.kind) {
    case 'setup.battle':
      return 'Pick an edge. The blue player chooses first; your territory is on that side.'
    case 'setup.deploy':
      return 'Pick a unit below, then click the table inside your territory. Q and E turn it.'
    case 'command.pick':
      return 'Pick one card face down. Both players reveal together; fewer pips take priority.'
    case 'command.issuer':
    case 'command.order':
      return 'Click a highlighted unit on the table, or a row below.'
    case 'activation.choose':
      return 'Click a unit with a face-up order token, or draw from the pool.'
    case 'activation.pick':
      return 'Click one of the highlighted units.'
    case 'action.choose':
      return 'Pick an action. Greyed actions say why they are unavailable.'
    case 'move.tool':
      if (p.context.kind === 'controlled') return 'The enemy unit makes this move but you place the tool. Push it where it hurts: off a marker, out of cover, into your fire.'
      if (p.context.kind === 'withdraw') return 'Speed 1. The unit may not end touching an enemy, and most units cannot attack after withdrawing.'
      return 'Click where the leader should end. Drag the hinge to bend the tool. A leader with a melee weapon may end touching an enemy to charge. Confirm to commit, Escape to cancel.'
    case 'move.troopers':
      return 'The engine placed the rest of the unit. Drag a model to adjust, then confirm.'
    case 'attack.defender':
      return 'Pick the unit to shoot or fight. Each row shows its range band, cover and expected wounds.'
    case 'attack.pool':
      return 'Choose which weapons join the pool. The recommended pool is highlighted.'
    case 'attack.spend':
      return spendHint(String(p.context.step ?? ''))
    case 'attack.allocate':
      return 'Pick the model that takes the wounds.'
    case 'attack.extraDefender':
      return 'You may add pools against other enemy units, or finish.'
    case 'battle.place':
      return p.context.terrain === 'barricade' ? 'Click the table to set the barricade down, in your own or contested ground and clear of other barricades. Q and E turn it.' : 'Click the table to place it.'
    default:
      return 'Choose one of the options.'
  }
}

function spendHint(step: string): string {
  switch (step) {
    case 'reroll':
      return 'Each aim token lets you reroll a few dice. Pick which faces to reroll, or finish.'
    case 'surgeTokens':
    case 'defSurgeTokens':
      return 'A surge token turns one surge face into the die\'s listed result. Pick how many to spend.'
    case 'dodge':
      return 'Each dodge token cancels one hit before the defence dice are rolled.'
    case 'sniper':
      return 'The sniper rule lets the attacker cancel the whole attack.'
    default:
      return 'Choose one of the options.'
  }
}

export function pickLabel(state: Snap, cardId: string): string {
  return cardName(state.data, cardId)
}

/** Label for one option of a pending decision (names from data, numbers from the engine's option data). */
export function optionLabel(opt: DecisionOption, p: PendingDecision, state: Snap): string {
  const d = state.data
  const a: Action = opt.action
  const data = (opt.data ?? {}) as Record<string, unknown>
  switch (a.type) {
    case 'setup.battle':
      if (a.payload.auto) return 'Let the engine choose'
      return `Deploy from ${EDGE_TEXT[String(data.edge ?? '')] ?? String(data.edge)}`
    case 'command.pick':
      return cardName(d, a.payload.cardId)
    case 'command.issuer':
    case 'command.order':
      return 'unitId' in a.payload && a.payload.unitId ? unitLabel(state, a.payload.unitId) : 'Done'
    case 'activation.choose':
      return a.payload.drawPool ? 'Draw from the order pool' : unitLabel(state, a.payload.unitId ?? '')
    case 'activation.pick':
      return unitLabel(state, a.payload.unitId)
    case 'action.choose': {
      const act = a.payload.action
      if (act === 'end') return 'End activation'
      if (act === 'cardAction') return typeof data.name === 'string' ? data.name : actionName(d, String(a.payload.params?.actionId ?? 'card action'))
      if (act === 'free') {
        const what = typeof data.action === 'string' ? actionName(d, data.action) : 'action'
        const src = typeof data.source === 'string' ? (d.cards[data.source] ? cardName(d, data.source) : d.upgrades[data.source] ? upgradeName(d, data.source) : keywordRec(d, data.source) ? keywordLabel(d, { id: data.source }) : '') : ''
        return `Free ${what}${src ? ` (${src})` : ''}`
      }
      if (act === 'recover' && a.payload.params && typeof a.payload.params.remove === 'number') {
        return a.payload.params.remove > 0 ? `${actionName(d, 'recover')}: remove ${a.payload.params.remove} suppression` : actionName(d, 'recover')
      }
      return actionName(d, act.replace(/^(card|kw):/, ''))
    }
    case 'attack.defender':
    case 'attack.extraDefender':
      return 'unitId' in a.payload && a.payload.unitId ? unitLabel(state, a.payload.unitId) : 'No further pools'
    case 'attack.pool': {
      const ids = Object.values(a.payload.weaponIds)
      const names = [...new Set(ids.map((w) => weaponName(d, w)))]
      return names.join(' + ') || 'Attack pool'
    }
    case 'attack.spend':
      return spendLabel(a.payload.choice, state, data)
    case 'attack.allocate': {
      const ws = Array.isArray(data.weapons) ? [...new Set((data.weapons as string[]).map((w) => weaponName(d, w)))] : []
      return ws.length > 0 ? `Model with ${ws.join(' and ')}` : `A model of ${miniLabel(state, a.payload.miniId)}`
    }
    case 'activation.standby':
      return a.payload.unitId ? `${unitLabel(state, a.payload.unitId)}${a.payload.response ? `: ${a.payload.response}` : ''}` : 'Do not react'
    case 'keyword.choice':
    case 'card.choice':
      return choiceLabel(String(a.payload.option), opt, state)
    case 'end.choice':
      return String(a.payload.option)
    case 'confirm':
      return a.payload.choice === 'concede' ? 'Concede' : 'Continue'
    case 'pass':
      return 'Pass'
    default:
      return opt.id
  }
}

const FACE_WORD: Record<string, string> = { hit: 'hit', crit: 'critical', surge: 'surge', blank: 'blank', block: 'block' }

function spendLabel(choice: string, state: Snap, data: Record<string, unknown>): string {
  const d = state.data
  const n = typeof data.n === 'number' ? data.n : null
  switch (choice) {
    case 'surge':
    case 'defSurge':
      return n === 0 ? 'Spend none' : `Spend ${n} ${tokenName(d, 'surge')} token${n === 1 ? '' : 's'}`
    case 'dodge':
      return n === 0 ? 'Spend none' : `Spend ${n} ${tokenName(d, 'dodge')} token${n === 1 ? '' : 's'}`
    case 'reroll': {
      const faces = Array.isArray(data.faces) ? (data.faces as string[]) : []
      return `Reroll ${faces.map((f) => FACE_WORD[f] ?? f).join(', ') || 'dice'}`
    }
    case 'rerollDone':
      return 'Keep the dice as they are'
    case 'sniperCancel':
      return `Cancel the attack (${keywordLabel(d, { id: 'kw.sniper-team' })})`
    case 'sniperKeep':
      return 'Keep the attack'
    default:
      return choice.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._:]/g, ' ')
  }
}

/** keyword.choice / card.choice options: use, skip, opt:<i>, unit:<id>, done, or a code offer's own option. */
function choiceLabel(option: string, opt: DecisionOption, state: Snap): string {
  const data = (opt.data ?? {}) as Record<string, unknown>
  if (option === 'use') return 'Use it'
  if (option === 'skip') return 'Skip it'
  if (option === 'divulge') return 'Divulge it (it will be this round\'s card)'
  if (option === 'decline') return 'Keep it hidden'
  if (option === 'done') return 'Done'
  if (option.startsWith('unit:')) return unitLabel(state, option.slice(5))
  if (option.startsWith('opt:')) {
    const verbs = Array.isArray(data.verbs) ? (data.verbs as string[]).map(humanize).join(' and ') : ''
    return `Option ${Number(option.slice(4)) + 1}${verbs ? `: ${verbs}` : ''}`
  }
  const tail = opt.labelKey.split('.').pop() ?? option
  return humanize(tail === 'option' ? option : tail)
}

export const humanize = (s: string): string => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._:-]+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase())

// ---- events
export function reasonText(d: GameData, reason: string): string {
  // reasons carry card ids and rule keys; ids that name a battle card or command card are shown by their data name
  return reason
    .split(/[|:]/)
    .map((t) => (d.battleCards[t] ? battleCardName(d, t) : d.cards[t] ? cardName(d, t) : t.replace(/[_]/g, ' ')))
    .join(', ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** One feed line for an event, or null when it is not worth a line. `state` is the state after the step (names). */
export function describeEvent(ev: GameEvent, state: Snap): string | null {
  const d = state.data
  const U = (id: string) => unitLabel(state, id)
  const S = (s: Seat | null) => seatName(state, s)
  /** third or second person verb for the seat ("Opponent scores", "You score") */
  const V = (s: Seat | null, third: string, second: string) => (seatName(state, s) === 'You' ? second : third)
  switch (ev.type) {
    case 'RoundStarted':
      return `Round ${ev.round} begins.`
    case 'PhaseStarted':
      return ev.name === 'command' ? 'Command phase.' : ev.name === 'activation' ? 'Activation phase.' : ev.name === 'end' ? 'End phase.' : null
    case 'BluePlayerDecided':
      return `${S(ev.blue)} ${V(ev.blue, 'is', 'are')} the blue player.`
    case 'EdgeChosen':
      return `Blue deploys from ${EDGE_TEXT[ev.edge] ?? ev.edge}.`
    case 'BattleCardChosen':
      return `Battle card: ${battleCardName(d, ev.cardId)}.`
    case 'UnitDeployed':
      return `${U(ev.unitId)} deploys.`
    case 'CommandCardPicked':
      return `${S(ev.seat)} picked a command card.`
    case 'CommandCardsRevealed': {
      const parts = (['A', 'B'] as const).filter((s) => ev.picks[s]).map((s) => `${S(s)}: ${cardName(d, ev.picks[s]!)}`)
      return `Cards revealed. ${parts.join('; ')}.`
    }
    case 'PriorityDecided':
      return `${S(ev.holder)} ${V(ev.holder, 'has', 'have')} priority${ev.rolloff ? ' after a roll-off' : ''}.`
    case 'OrderIssued':
      return `${U(ev.unitId)} received an order.`
    case 'OrderPoolFormed':
      return `${S(ev.seat)} ${V(ev.seat, 'has', 'have')} ${ev.size} order token${ev.size === 1 ? '' : 's'} in the pool.`
    case 'PoolTokenDrawn':
      return `${S(ev.seat)} drew a token from the order pool.`
    case 'UnitActivated':
      return `${U(ev.unitId)} activates${ev.via === 'pool' ? ' from the pool' : ''}.`
    case 'Rallied':
      return `${U(ev.unitId)} rallies: ${ev.removed} suppression removed.`
    case 'ActionDeclared':
      return ev.action === 'end' ? null : `${U(ev.unitId)}: ${actionName(d, ev.action)}.`
    case 'ActionCancelled':
      return `${U(ev.unitId)} cancelled ${actionName(d, ev.action)}.`
    case 'ActivationEnded':
      return `${U(ev.unitId)} ends its activation.`
    case 'StandbyTriggered':
      return `${U(ev.unitId)} reacts on standby to ${U(ev.byUnitId)}.`
    case 'UnitMoved':
      return `${U(ev.unitId)} moves (speed ${ev.speed}).`
    case 'Climbed':
      return `${U(ev.unitId)} climbs.`
    case 'CohesionBroken':
      return `${U(ev.unitId)} is out of cohesion.`
    case 'AttackDeclared':
      return `${U(ev.attackerId)} attacks ${U(ev.defenderId)}.`
    case 'PoolFormed': {
      const bits = Object.entries(ev.dice).filter(([, n]) => n > 0).map(([c, n]) => `${n} ${c}`)
      return `Attack pool: ${bits.join(', ') || 'no dice'}.`
    }
    case 'AttackRolled':
      return `Attack roll: ${ev.faces.join(', ')}.`
    case 'Rerolled':
      return `Reroll: ${ev.faces.join(', ')}.`
    case 'SurgesConverted':
      return `${ev.converted} ${ev.side} surge${ev.converted === 1 ? '' : 's'} converted.`
    case 'CoverApplied':
      return ev.cover === 'none' ? null : `${ev.cover === 'heavy' ? 'Heavy' : 'Light'} cover applies.`
    case 'DodgeSpent':
      return `${U(ev.unitId)} spends dodge: ${ev.cancelled} hit${ev.cancelled === 1 ? '' : 's'} cancelled.`
    case 'DefenceRolled':
      return `Defence roll: ${ev.faces.join(', ')}.`
    case 'Compared':
      return `${ev.crits} crit, ${ev.hits} hit against ${ev.blocks} block: ${ev.wounds} wound${ev.wounds === 1 ? '' : 's'}.`
    case 'WoundsAssigned':
      return `${miniLabel(state, ev.miniId)} takes ${ev.wounds} wound${ev.wounds === 1 ? '' : 's'}.`
    case 'MiniDefeated':
      return `A model of ${U(ev.unitId)} is defeated.`
    case 'UnitDefeated':
      return `${U(ev.unitId)} is defeated.`
    case 'SuppressionChanged':
      return `${U(ev.unitId)} suppression ${ev.from} to ${ev.to}.`
    case 'PanicChecked':
      return `${U(ev.unitId)} panic check: ${ev.panicked ? 'panicked' : 'holds'}.`
    case 'UnitPanicked':
      return `${U(ev.unitId)} panics.`
    case 'TokenChanged':
      return ev.kind === 'order' ? null : `${U(ev.unitId)} ${tokenName(d, ev.kind)}: ${ev.from} to ${ev.to}.`
    case 'CardEffect':
      return `${d.cards[ev.cardId] ? cardName(d, ev.cardId) : battleCardName(d, ev.cardId)} takes effect.`
    case 'KeywordFired':
      return `${U(ev.unitId)}: ${keywordOrCard(d, ev.keyword)}.`
    case 'PointsScored':
      return `${S(ev.seat)} ${V(ev.seat, 'scores', 'score')} ${ev.amount} (${reasonText(d, ev.reason)}).`
    case 'PassTokensGranted':
      return `${S(ev.seat)} ${V(ev.seat, 'gains', 'gain')} ${ev.n} advantage token${ev.n === 1 ? '' : 's'}.`
    case 'Passed':
      return `${S(ev.seat)} ${V(ev.seat, 'passes', 'pass')}${ev.spentToken ? ' (advantage token)' : ''}.`
    case 'UnitPromoted':
      return `${U(ev.unitId)} takes command.`
    case 'RoundEnded':
      return `Round ${ev.round} ends.`
    case 'GameEnded':
      return ev.result.winner === 'draw' ? 'The battle is a draw.' : `${S(ev.result.winner)} ${V(ev.result.winner, 'wins', 'win')} the battle.`
    case 'WeaponsAdded':
      return `${ev.weapons.length} weapon${ev.weapons.length === 1 ? '' : 's'} join the ${ev.kind} pool: ${[...new Set(ev.weapons.map((w) => weaponName(d, w.weaponId)))].join(', ')}.`
    case 'DiceShifted':
      return `${ev.n} ${ev.side} di${ev.n === 1 ? 'e' : 'ce'} ${ev.dir > 0 ? 'upgraded' : 'downgraded'} (${keywordOrCard(d, ev.source)}).`
    case 'ResultsCancelled':
      return `${ev.n} ${ev.result === 'all' ? 'result' : ev.result}${ev.n === 1 ? '' : 's'} cancelled (${keywordOrCard(d, ev.source)}).`
    case 'ResultsChanged':
      return `${ev.n} ${FACE_WORD[ev.from] ?? ev.from} changed to ${FACE_WORD[ev.to] ?? ev.to} (${keywordOrCard(d, ev.source)}).`
    case 'CoverRolled':
      return `Cover roll (${ev.level}): ${ev.cancelled} hit${ev.cancelled === 1 ? '' : 's'} cancelled.`
    case 'WoundsSuffered':
      return `${U(ev.unitId)} suffers ${ev.n} wound${ev.n === 1 ? '' : 's'}.`
    case 'LeaderReplaced':
      return `${U(ev.unitId)} has a new leader.`
    case 'AttackSkipped':
      return `${U(ev.attackerId)} has nobody to attack.`
    case 'AttackEnded':
      return `${U(ev.attackerId)} finishes its attack: ${ev.wounds} wound${ev.wounds === 1 ? '' : 's'} dealt.`
    case 'MeleeContact':
      return `${U(ev.unitId)} makes contact with ${U(ev.targetId)}.`
    case 'ObjectiveChanged':
      return null
    default:
      return null
  }
}

/** A source id of an effect: a keyword, a command card or a battle card, by its data name. */
function keywordOrCard(d: GameData, id: string): string {
  if (d.keywords[id]) return keywordLabel(d, { id })
  if (d.upgrades[id]) return upgradeName(d, id)
  if (d.cards[id]) return cardName(d, id)
  if (d.battleCards[id]) return battleCardName(d, id)
  return id.replace(/^kw\./, '').replace(/[-_.]/g, ' ')
}

/** Rows for the dice log: faces of one physical roll. */
export function diceOf(ev: GameEvent): { purpose: string; die: string; faces: string[] } | null {
  return ev.type === 'DiceRolled' ? { purpose: ev.purpose, die: ev.die, faces: ev.faces } : null
}
