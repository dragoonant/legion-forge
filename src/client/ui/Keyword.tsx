// Hoverable game terms. <Keyword term="Suppression"> underlines the text and shows the help in the shared Tooltip;
// <KeywordChip d={data} k={{ id, x }}> does the same for a unit or weapon keyword, reading its name and own-words text from the data
// record; <Rich text="..."> finds every known term in a plain string (keywords, tokens, statuses, cards, ranks) and makes each one a
// doorway. Touch: a tap on a term in running text opens its tooltip; a term inside a button lets the tap through to the button.
import { useRef, type ReactNode, type SyntheticEvent } from 'react'
import type { GameData } from '@/engine'
import { engineBundle } from '../game/adapter'
import { keywordHelp, lookupTerm } from '../game/glossary'
import { termIndex } from '../game/terms'
import { colors } from './theme'
import { Tooltip } from './Tooltip'

const underline = { borderBottom: `1px dotted ${colors.muted}`, cursor: 'help' } as const

const insideButton = (e: SyntheticEvent): boolean => !!(e.currentTarget as HTMLElement).parentElement?.closest('button, [role="button"], a[href]')

/** A term with its tooltip: underlined text; a tap opens the help unless the term sits inside a button. */
export function Tip({ title, body, children }: { title: string; body: ReactNode; children: ReactNode }) {
  const touch = useRef(false)
  return (
    <Tooltip title={title} body={body} tapPassesThrough={insideButton}>
      <span
        data-keyword={title}
        style={underline}
        onPointerDown={(e: SyntheticEvent) => {
          touch.current = (e.nativeEvent as PointerEvent).pointerType === 'touch'
        }}
        onClick={(e: SyntheticEvent) => {
          // in running text the tap belongs to the tooltip; inside a button it goes on to the button
          if (touch.current && !insideButton(e)) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
        {children}
      </span>
    </Tooltip>
  )
}

/** One glossary term with its tooltip. `children` is what is shown (default: the term). Unknown terms render plain. */
export function Keyword({ term, children }: { term: string; children?: ReactNode }) {
  const entry = lookupTerm(term) ?? termIndex(engineBundle().data).lookup(term)
  const label = children ?? term
  if (!entry || !entry.body) return <>{label}</>
  return <Tip title={entry.term} body={entry.body}>{label}</Tip>
}

/** A unit or weapon keyword (name with X) with its data text as help. */
export function KeywordChip({ d, k }: { d: GameData; k: { id: string; x?: number; param?: string } }) {
  const h = keywordHelp(d, k)
  if (!h.body) return <>{h.title}</>
  return <Tip title={h.title} body={h.body}>{h.title}</Tip>
}

export function KeywordList({ d, list, empty = null }: { d: GameData; list: readonly { id: string; x?: number; param?: string }[] | undefined; empty?: ReactNode }) {
  if (!list || list.length === 0) return <>{empty}</>
  return (
    <>
      {list.map((k, i) => (
        <span key={`${k.id}-${i}`}>
          {i > 0 && ', '}
          <KeywordChip d={d} k={k} />
        </span>
      ))}
    </>
  )
}

/** Plain text in which every game term is a doorway to its help. Use it for any sentence the game shows. */
export function Rich({ text, d }: { text: string | null | undefined; d?: GameData }) {
  if (!text) return null
  const index = termIndex(d ?? engineBundle().data)
  const parts = index.split(text)
  if (parts.length === 1 && typeof parts[0] === 'string') return <>{text}</>
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <Tip key={i} title={p.help.term} body={p.help.body}>{p.text}</Tip>
        ),
      )}
    </>
  )
}
