// Glossary and keyword help: every glossary term resolves to a body in our own words, and every unit / weapon keyword of the data has
// hover help read from its record (name and text), so a keyword added to the data is covered without editing the client.
import { describe, expect, it } from 'vitest'
import { engineBundle } from '../../src/client/game/adapter'
import { GLOSSARY, keywordHelp, lookupTerm, termsIn } from '../../src/client/game/glossary'

describe('glossary', () => {
  it('every term and alias resolves; bodies are sentences', () => {
    for (const e of GLOSSARY) {
      expect(lookupTerm(e.term)?.body).toBe(e.body)
      for (const a of e.aliases ?? []) expect(lookupTerm(a)?.term).toBe(e.term)
      expect(e.body.length).toBeGreaterThan(30)
      expect(e.body.endsWith('.')).toBe(true)
    }
    expect(lookupTerm('  SUPPRESSION ')?.term).toBe('Suppression')
    expect(lookupTerm('no such term')).toBeNull()
  })

  it('terms are found in plain sentences', () => {
    expect(termsIn('It gains Aim and a dodge token').map((e) => e.term).sort()).toEqual(['Aim', 'Dodge'])
  })

  it('every keyword record has hover help: its data name and its own text', () => {
    const d = engineBundle().data
    for (const id of Object.keys(d.keywords)) {
      const h = keywordHelp(d, { id, x: 1 })
      expect(h.title.length, id).toBeGreaterThan(0)
      expect(h.title).not.toBe(id)
      expect(h.body.length, id).toBeGreaterThan(10)
    }
  })
})
