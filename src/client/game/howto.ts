// The how-to-play guide: a short, own-words walk through a round of Recon. Plain data so the guide, the first-turn hint strip and the
// tests share it; the text is read through <Rich>, so every game term in it is a doorway to its help.

export interface HowToSection {
  id: string
  title: string
  /** one short paragraph or a few bullet lines */
  lines: string[]
}

export const HOW_TO_PLAY: HowToSection[] = [
  {
    id: 'round',
    title: 'A round',
    lines: [
      'A battle lasts five rounds, or until one side reaches twelve victory points. Each round has three phases.',
      'Command phase: both players secretly pick one Command card. The card with fewer pips takes priority, which means that player activates first, and the card says which units receive orders.',
      'Activation phase: players take turns activating one unit each until every unit has acted.',
      'End phase: objectives are scored, short-lived tokens are cleared, every unit sheds one suppression token and a new round begins.',
    ],
  },
  {
    id: 'orders',
    title: 'Orders and the pool',
    lines: [
      'A unit that was given an order has a face-up Order token. On your turn you may activate any unit with a face-up token.',
      'If you have no face-up token to use, you draw one at random from your Order pool. The token shows a rank, and you activate a unit of that rank. The pool is hidden, so you only see how many of each rank are left.',
    ],
  },
  {
    id: 'actions',
    title: 'What a unit does',
    lines: [
      'An activation starts with a rally, where a unit sheds suppression, and then gives two actions: Move, Attack, Aim, Dodge, Recover and sometimes Standby or a card action.',
      'Aim lets you reroll attack dice. Dodge cancels hits before the defence dice are rolled. Recover removes suppression. A Standby unit gets a free reaction when an enemy moves close.',
      'The action menu lists everything the unit can do and says why anything greyed out is unavailable.',
    ],
  },
  {
    id: 'move',
    title: 'The movement tool',
    lines: [
      'Moving uses a hinged tool, not a free measure. Choose a speed, then place where the leader should end. The tool bends at its hinge, so drag the gold hinge to steer around terrain.',
      'The ghost shows where the leader and the rest of the unit would stand, green when the move is allowed and red, with the reason, when it is not. Confirm to commit.',
      'On a touch screen, tap to aim, drag the hinge with one finger (the point is held above your finger so you can see it), and tap Confirm.',
    ],
  },
  {
    id: 'attack',
    title: 'Attacks and cover',
    lines: [
      'Pick a target in range and line of sight. Each row shows the range band, the cover the target would get and the engine\'s expected wounds. Rolled dice appear in the dice tray, one row per roll.',
      'Cover is rolled: the defender rolls a white die per hit. Light cover cancels a hit on each block, heavy cover on each block or surge. A suppressed unit gets cover one step better.',
    ],
  },
  {
    id: 'suppression',
    title: 'Suppression and panic',
    lines: [
      'A ranged attack that scores a hit and does not destroy its target adds one suppression token to it.',
      'A unit with as many tokens as its courage is suppressed and loses an action. At twice its courage it panics: it cannot act, cannot hold objectives and spends its turn shedding tokens.',
    ],
  },
  {
    id: 'win',
    title: 'Winning',
    lines: [
      'Objective cards score victory points at set moments, and some units or tokens on the table decide who earns them. Open Objectives in the battle to read this game\'s cards.',
      'When the battle ends, the higher score wins. The end screen shows where every point came from and what the AI chose in secret.',
    ],
  },
  {
    id: 'touch',
    title: 'Controls',
    lines: [
      'Mouse: right-drag turns the camera, middle-drag or W A S D pans, the wheel zooms. Q and E turn a unit being deployed. M cycles the ruler and sight lines, H hides the panels, Escape cancels, Enter confirms a move.',
      'Touch: one finger pans the board, two fingers pinch to zoom, twist to turn and slide up or down to tilt. Tap a gold-ringed unit and confirm in the bar to activate or target it.',
      'Every underlined word is a doorway: hover it, or tap it, for a short explanation.',
    ],
  },
]

/** The first-turn hints: what the player should do now, by decision kind. Shown once in a thin strip until dismissed. */
export const FIRST_HINTS: Record<string, string> = {
  'setup.battle': 'Pick the table edge your army deploys from. The blue player chooses first.',
  'setup.deploy': 'Pick a unit in the prompt, then point at your side of the table. The ghost is green where the unit can stand and red, with the reason, where it cannot.',
  'command.pick': 'Choose a Command card face down. Fewer pips takes priority, the card says who gets orders.',
  'command.issuer': 'Choose which unit gives out the orders.',
  'command.order': 'Give a unit an order: click a gold-ringed unit or a row in the prompt.',
  'activation.choose': 'Activate a unit that has a face-up Order token, or draw from the Order pool.',
  'activation.pick': 'The pool gave you a rank: activate one of the highlighted units.',
  'action.choose': 'Each activation gives two actions. Pick one; greyed-out actions explain why they are unavailable.',
  'move.tool': 'Aim the movement tool: pick a spot, then drag the gold hinge to bend the path. Green means legal.',
  'attack.defender': 'Choose a target. Each row shows the range band, cover and the expected wounds.',
}

/** The kinds the strip may show, in the order a first round meets them. */
export const hintFor = (kind: string): string | null => FIRST_HINTS[kind] ?? null
