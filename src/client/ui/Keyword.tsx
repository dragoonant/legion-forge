// Hoverable game terms. <Keyword term="Suppression"> underlines the text and shows the glossary body in the shared Tooltip;
// <KeywordChip d={data} k={{ id, x }}> does the same for a unit or weapon keyword, reading its name and own-words text from the data
// record. Touch: a tap on a keyword in running text opens its tooltip; a keyword inside a button lets the tap through.
import { useRef, type ReactNode, type SyntheticEvent } from 'react'
import type { GameData } from '@/engine'
import { keywordHelp, lookupTerm } from '../game/glossary'
import { colors } from './theme'
import { Tooltip } from './Tooltip'

const underline = { borderBottom: `1px dotted ${colors.muted}`, cursor: 'help' } as const

function Tip({ title, body, children }: { title: string; body: ReactNode; children: ReactNode }) {
  const touch = useRef(false)
  return (
    <Tooltip title={title} body={body}>
      <span
        data-keyword={title}
        style={underline}
        onPointerDown={(e: SyntheticEvent) => {
          touch.current = (e.nativeEvent as PointerEvent).pointerType === 'touch'
        }}
        onClick={(e: SyntheticEvent) => {
          const inButton = !!(e.currentTarget as HTMLElement).parentElement?.closest('button, [role="button"]')
          if (touch.current && !inButton) {
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
  const entry = lookupTerm(term)
  const label = children ?? term
  if (!entry) return <>{label}</>
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
