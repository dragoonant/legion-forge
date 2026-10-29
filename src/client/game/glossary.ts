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
  { term: 'Suppressed', body: 'A unit holding as many suppression tokens as its courage. It gets one action fewer each activation and its cover is better by one step.' },
  { term: 'Exhausted', body: 'An upgrade or card that has been used this round. It stays unusable until it is readied again, usually by recovering.', aliases: ['Exhaust'] },
  { term: 'Ready', body: 'An upgrade or card that has not been used yet this round and can still be spent.' },
  { term: 'Defeated', body: 'A model or unit that has taken all the wounds it can bear and leaves the table.', aliases: ['Defeat'] },
  { term: 'Wound', body: 'Damage on a model. A model is defeated once its wounds equal what it can take.', aliases: ['Wounds'] },
  { term: 'Order token', body: 'Shows a unit\'s rank and whether it can act. Face up it is ready to activate; once the unit has acted the token is spent.', aliases: ['Order tokens'] },
  { term: 'Command card', body: 'Each round you pick one in secret. It sets your priority pips and says which units receive orders; once played it is out for the battle.', aliases: ['Command cards'] },
  { term: 'Activation', body: 'A unit\'s turn: rally, then two actions. Each unit activates once per round.', aliases: ['Activate', 'Activated'] },
  { term: 'Advantage', body: 'Tokens earned during the battle. A player holding one may pass instead of activating, and spends it to do so.', aliases: ['Advantage token', 'Advantage tokens'] },
  { term: 'Rally', body: 'At the start of its activation a unit rolls one white defence die per suppression token and sheds one token for each block or surge.' },
  { term: 'Observation', body: 'A marker for a unit that is watching the enemy. Recon does not use it yet; the card or keyword that grants it says what it does.' },
  { term: 'Commander', body: 'The army\'s leader, the top rank. A command card can name the commander to order it directly.' },
  { term: 'Operative', body: 'A rank for lone heroes and specialists, ordered by cards and tokens that call for the operative rank.' },
  { term: 'Corps', body: 'The backbone rank: the most common troopers, ordered by the cards and pool tokens that call for corps.' },
  { term: 'Special Forces', body: 'A rank for elite squads, ordered by the cards and pool tokens that call for special forces.' },
  { term: 'Support', body: 'A rank for support weapons teams, ordered by the cards and pool tokens that call for support.' },
  { term: 'Heavy', body: 'The rank of big weapons and walkers, ordered by the cards and pool tokens that call for heavy.' },
  { term: 'Intel', body: 'A marker a battle card hands out. The card that grants it says when to spend it and what it does.' },
  { term: 'Marked Target', body: 'A marker a battle card or ability places on an enemy unit. The card that grants it says what it does.' },
  { term: 'Vanguard', body: 'A marker a battle card hands out. The card that grants it says when to spend it and what it does.' },
  { term: 'Point of Interest', body: 'A marker on the table that battle cards use for scoring. Hold it to score what the card asks for.', aliases: ['Points of Interest'] },
  { term: 'Asset', body: 'A marker on the table that a unit can claim when a battle card allows it.' },
  { term: 'Ordnance', body: 'A marker a battle card hands out. The card that grants it says when to spend it and what it does.' },
  { term: 'Air Support', body: 'A marker a battle card hands out. The card that grants it says when to spend it and what it does.' },
  { term: 'Comms Scrambler', body: 'A marker a battle card hands out. The card that grants it says when to spend it and what it does.' },
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
