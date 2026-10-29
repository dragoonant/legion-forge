// The term index behind every doorway: one lookup from a game term (keyword, token, rank, status, command or battle card, upgrade, rules
// word) to its own-words help. Built from the data bundle, so a record added to the data is covered by name; the glossary supplies the
// words the data has no text for. `splitTerms` cuts a plain string into plain runs and term runs for `Rich` to render. Pure TS.
import type { GameData } from '@/engine'
import { GLOSSARY } from './glossary'

export type TermKind = 'rules' | 'keyword' | 'token' | 'rank' | 'card' | 'battle' | 'upgrade'

export interface TermHelp {
  term: string
  body: string
  kind: TermKind
}

export type Segment = string | { text: string; help: TermHelp }

export interface TermIndex {
  /** every term with its help, in priority order (first one wins a name clash) */
  all: TermHelp[]
  lookup(name: string): TermHelp | null
  split(text: string): Segment[]
}

interface Rec {
  name?: string
  text?: string
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function recs(table: Record<string, unknown> | undefined): Rec[] {
  return table ? (Object.values(table) as Rec[]) : []
}

export function buildTermIndex(d: GameData): TermIndex {
  const all: TermHelp[] = []
  const byLower = new Map<string, TermHelp>()
  /** names the data supplies match case-sensitively (they are capitalised names); rules words match in any case */
  const sensitive = new Set<string>()
  const add = (name: string, body: string, kind: TermKind, caseSensitive: boolean) => {
    const key = name.trim().toLowerCase()
    if (!key || !body || byLower.has(key)) return
    const help: TermHelp = { term: name.trim(), body, kind }
    byLower.set(key, help)
    all.push(help)
    if (caseSensitive) sensitive.add(key)
  }
  for (const e of GLOSSARY) {
    add(e.term, e.body, 'rules', false)
    for (const a of e.aliases ?? []) byLower.set(a.trim().toLowerCase(), byLower.get(e.term.trim().toLowerCase()) ?? { term: e.term, body: e.body, kind: 'rules' })
  }
  const glossaryBody = (name: string): string => byLower.get(name.trim().toLowerCase())?.body ?? ''
  for (const k of recs(d.keywords)) if (k.name && k.text) add(k.name, k.text, 'keyword', true)
  for (const t of recs(d.tokens)) if (t.name) add(t.name, t.text ?? (glossaryBody(t.name) || glossaryBody(`${t.name} token`)), 'token', true)
  for (const r of recs(d.ranks)) if (r.name) add(r.name, r.text ?? glossaryBody(r.name), 'rank', true)
  for (const c of recs(d.cards)) if (c.name && c.text) add(c.name, c.text, 'card', true)
  for (const b of recs(d.battleCards)) if (b.name && b.text) add(b.name, b.text, 'battle', true)
  for (const u of recs(d.upgrades)) if (u.name && u.text) add(u.name, u.text, 'upgrade', true)

  // the phrases to look for: every name and alias, longest first so "Order pool" beats "Order"
  const phrases = [...byLower.keys()].sort((a, b) => b.length - a.length)
  const make = (keys: string[], flags: string): RegExp | null =>
    keys.length === 0 ? null : new RegExp(`(^|[^A-Za-z0-9])(${keys.map((k) => esc(k)).join('|')})(?![A-Za-z0-9])`, flags)
  const exact = make(phrases.filter((k) => sensitive.has(k)).map((k) => byLower.get(k)!.term), 'g')
  const loose = make(phrases.filter((k) => !sensitive.has(k)), 'gi')

  function split(text: string): Segment[] {
    if (!text) return []
    const hits: { start: number; end: number; help: TermHelp }[] = []
    for (const re of [exact, loose]) {
      if (!re) continue
      re.lastIndex = 0
      for (const m of text.matchAll(re)) {
        const lead = (m[1] ?? '').length
        const word = m[2]!
        const help = byLower.get(word.toLowerCase())
        if (!help) continue
        hits.push({ start: (m.index ?? 0) + lead, end: (m.index ?? 0) + lead + word.length, help })
      }
    }
    hits.sort((a, b) => a.start - b.start || b.end - a.end)
    const out: Segment[] = []
    let at = 0
    for (const h of hits) {
      if (h.start < at) continue
      if (h.start > at) out.push(text.slice(at, h.start))
      out.push({ text: text.slice(h.start, h.end), help: h.help })
      at = h.end
    }
    if (at < text.length) out.push(text.slice(at))
    return out
  }

  return { all, lookup: (name) => byLower.get(name.trim().toLowerCase()) ?? null, split }
}

let cached: { d: GameData; index: TermIndex } | null = null
/** The index of a data bundle, built once per bundle. */
export function termIndex(d: GameData): TermIndex {
  if (!cached || cached.d !== d) cached = { d, index: buildTermIndex(d) }
  return cached.index
}
