// Engine events -> dice-tray rows. Pure apart from the tray store writes: every face comes off the event, nothing is rolled or
// recomputed here.
import type { GameEvent } from '@/engine'
import { unitLabel, type Snap } from '../game/labels'
import { trayBegin, trayMerge, trayRow, trayVerdict, type RowKind, type TrayDie } from './trayStore'

/** The label and kind of a roll by its engine purpose (`attack`, `attack.reroll`, `defence`, `cover`, `rally`, `priority`...). */
export function rollKind(purpose: string): { kind: RowKind; label: string; reroll: boolean } {
  const p = purpose.toLowerCase()
  if (p.startsWith('defence')) return { kind: 'defence', label: p.includes('extra') ? 'Extra defence dice' : 'Defence roll', reroll: false }
  if (p.startsWith('cover')) return { kind: 'cover', label: 'Cover roll', reroll: false }
  if (p.startsWith('rally')) return { kind: 'rally', label: 'Rally roll', reroll: false }
  if (p.startsWith('blueplayer')) return { kind: 'other', label: 'Blue player roll', reroll: false }
  if (p.startsWith('priority')) return { kind: 'priority', label: 'Priority roll-off', reroll: false }
  if (p.includes('reroll') || p.includes('aim')) return { kind: 'attack', label: 'Reroll', reroll: true }
  if (p.startsWith('attack') || p.startsWith('melee') || p.startsWith('pool')) return { kind: 'attack', label: 'Attack roll', reroll: false }
  return { kind: 'other', label: 'Roll', reroll: false }
}

export function diceFor(die: string, faces: readonly string[]): TrayDie[] {
  if (die === 'd6') return faces.map((face) => ({ side: 'd6', colour: null, face }))
  const [side, colour] = die.split(':') as ['atk' | 'def', 'red' | 'black' | 'white']
  return faces.map((face) => ({ side, colour, face }))
}

/** Apply one event to the tray (no-op for events the tray does not show). `state` supplies names. */
export function trayEvent(ev: GameEvent, state: Snap): void {
  switch (ev.type) {
    case 'AttackDeclared':
      trayBegin(`${unitLabel(state, ev.attackerId)} attacks ${unitLabel(state, ev.defenderId)}`)
      break
    case 'DiceRolled': {
      const k = rollKind(ev.purpose)
      if (k.kind === 'rally' || k.kind === 'priority' || k.kind === 'other') trayBegin(k.label)
      // the dice of one pool roll (one event per colour) share a row
      if (!trayMerge(k.label, diceFor(ev.die, ev.faces))) trayRow({ kind: k.kind, seat: ev.seat, label: k.label, dice: diceFor(ev.die, ev.faces), verdict: '', reroll: k.reroll })
      break
    }
    case 'Compared':
      trayVerdict(`${ev.crits} crit, ${ev.hits} hit vs ${ev.blocks} block: ${ev.wounds} wound${ev.wounds === 1 ? '' : 's'}`)
      break
    default:
      break
  }
}
