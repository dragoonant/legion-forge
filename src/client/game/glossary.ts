// Glossary of the rules terms the UI links: each entry is a short "what it is, what it does" in our own words (never printed rules
// text). Unit keywords, weapon keywords and card text are not here: they are read from their data records (`text`), so a new
// keyword in the data is covered automatically (`keywordHelp`). Pure TS, no React.
import type { GameData } from '@/engine'
import { keywordLabel, keywordRec } from './labels'

export interface GlossaryEntry {
  term: string
  body: string
  aliases?: string[]
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: 'Suppression', body: 'Tokens that pile up on a unit under fire. At its courage the unit is suppressed (fewer actions, better cover); at twice its courage it panics.' },
  { term: 'Courage', body: 'How many suppression tokens a unit can carry before it is suppressed. Twice that and it panics. A dash means it never gains suppression.' },
  { term: 'Panic', body: 'A panicked unit cannot act on its own: it spends its turn shedding suppression and cannot hold objectives.', aliases: ['Panicked'] },
  { term: 'Aim', body: 'A token that lets the attacker reroll a few dice of its attack roll.' },
  { term: 'Dodge', body: 'A token that lets the defender cancel hits before the defence dice are rolled.' },
  { term: 'Surge', body: 'A token that converts one surge face on a die to its listed result.' },
  { term: 'Standby', body: 'A trooper unit on standby may react right after an enemy unit moves or attacks near it, with a free move or attack.' },
  { term: 'Cover', body: 'Terrain between attacker and defender improves the defender\'s odds. Light cover cancels hits on some dice; heavy cover is stronger.' },
  { term: 'Range band', body: 'Distances are counted in bands of 6 inches, measured from base edge to base edge. Weapons list the bands they reach.', aliases: ['Band'] },
  { term: 'Cohesion', body: 'Every other model of a unit must stay within a short distance of its leader and in line of sight of it.' },
  { term: 'Engaged', body: 'Models in base contact with an enemy. An engaged unit can only withdraw or fight; it cannot be shot at or shoot normally.' },
  { term: 'Order pool', body: 'Order tokens that were not given face up are shuffled into a bag; a seat that has no face-up order to use draws one at random.' },
  { term: 'Priority', body: 'The command card with fewer pips takes priority this round: that player starts the activation phase.' },
  { term: 'Pips', body: 'The number of dots on a command card. Fewer pips means priority; the card also tells how many orders you can give.' },
  { term: 'Recover', body: 'An action: remove suppression tokens and ready exhausted upgrades.' },
  { term: 'Withdraw', body: 'An action for an engaged unit: it moves away slowly, ending the engagement.' },
  { term: 'Hit', body: 'An attack die face that deals a wound unless blocked.' },
  { term: 'Critical', body: 'An attack die face that deals a wound and cannot be stopped by light cover.', aliases: ['Crit'] },
  { term: 'Block', body: 'A defence die face that cancels one hit or critical.' },
]

const INDEX = new Map<string, GlossaryEntry>()
for (const e of GLOSSARY) {
  INDEX.set(e.term.toLowerCase(), e)
  for (const a of e.aliases ?? []) INDEX.set(a.toLowerCase(), e)
}

export function lookupTerm(term: string): GlossaryEntry | null {
  return INDEX.get(term.trim().toLowerCase()) ?? null
}

/** Hover help for a keyword id: the data record's name and its own `text`. */
export function keywordHelp(d: GameData, k: { id: string; x?: number; param?: string }): { title: string; body: string } {
  const rec = keywordRec(d, k.id)
  return { title: keywordLabel(d, k), body: rec?.text ?? '' }
}

/** Entries whose term appears in a plain sentence (for tests: every term resolves to a body). */
export function termsIn(text: string): GlossaryEntry[] {
  const found = new Set<GlossaryEntry>()
  const low = text.toLowerCase()
  for (const [k, e] of INDEX) if (low.includes(k)) found.add(e)
  return [...found]
}
