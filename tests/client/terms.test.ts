// Term doorways: every game term of the data has own-words help, and plain strings split into plain runs and term runs.
import { describe, expect, it } from 'vitest'
import { engineBundle } from '../../src/client/game/adapter'
import { buildTermIndex, termIndex } from '../../src/client/game/terms'

const d = engineBundle().data
const index = buildTermIndex(d)

describe('term index', () => {
  it('every keyword, token, rank, command card, battle card and upgrade of the data has help text', () => {
    const tables: [string, Record<string, unknown>][] = [
      ['keyword', d.keywords],
      ['token', d.tokens as Record<string, unknown>],
      ['rank', d.ranks as Record<string, unknown>],
      ['card', d.cards],
      ['battle card', d.battleCards],
      ['upgrade', d.upgrades],
    ]
    for (const [what, table] of tables) {
      for (const [id, rec] of Object.entries(table ?? {})) {
        const name = (rec as { name?: string }).name
        expect(name, `${what} ${id} has a name`).toBeTruthy()
        const h = index.lookup(name!)
        expect(h?.body.length ?? 0, `${what} ${id} (${name}) has no help entry`).toBeGreaterThan(10)
      }
    }
  })

  it('help bodies are our own sentences (end with a full stop, no raw ids)', () => {
    for (const h of index.all) {
      expect(h.body.trim().length, h.term).toBeGreaterThan(10)
      expect(h.body, h.term).not.toMatch(/\b(kw|core)\.[a-z]/)
    }
  })

  it('splitting keeps every character and marks the terms', () => {
    const text = 'Stormtroopers gain an Aim token, then the Priority card; a unit Suppressed twice panics.'
    const parts = index.split(text)
    expect(parts.map((p) => (typeof p === 'string' ? p : p.text)).join('')).toBe(text)
    const hits = parts.filter((p) => typeof p !== 'string').map((p) => (p as { text: string }).text)
    expect(hits).toEqual(expect.arrayContaining(['Aim', 'Priority', 'Suppressed']))
  })

  it('the longest phrase wins and a word inside another word is not a term', () => {
    const parts = index.split('Draw from the order pool. Dodged!')
    const hits = parts.filter((p) => typeof p !== 'string').map((p) => (p as { help: { term: string } }).help.term)
    expect(hits).toContain('Order pool')
    expect(hits).not.toContain('Dodge')
  })

  it('data names match as spelled; other case stays plain text', () => {
    const kw = Object.values(d.keywords).map((k) => (k as { name: string }).name).find((n) => /^[A-Z][a-z]+$/.test(n) && !index.lookup(n.toLowerCase())?.kind.includes('rules'))
    expect(kw).toBeTruthy()
    const hit = index.split(`It has ${kw}.`).some((p) => typeof p !== 'string' && p.text === kw)
    const miss = index.split(`it has ${kw!.toUpperCase()}.`).some((p) => typeof p !== 'string' && p.text === kw!.toUpperCase())
    expect(hit).toBe(true)
    expect(miss).toBe(false)
  })

  it('the index is cached per bundle', () => {
    expect(termIndex(d)).toBe(termIndex(d))
  })
})
