// The event feed: what has happened, in order, written by the director as each beat plays (nothing appears before its beat).
// Consecutive dice lines are grouped. Every game term in a line is a doorway to its help. On the desktop the box folds to a title pill
// (the chevron); on a phone it is the Log drawer (`fill`).
import { useEffect, useRef } from 'react'
import { groupFeed, useFeedStore } from '../presentation/feedStore'
import { CollapseButton, CollapsedTab, useCollapsed } from './collapse'
import { Rich } from './Keyword'
import { colors, fontStack, panel } from './theme'
import { useUi } from './uiStore'
import { seatColor } from './widgets'

export function EventFeed({ fill = false }: { fill?: boolean }) {
  const feed = useFeedStore((s) => s.feed)
  const shown = useUi((s) => s.feedOpen)
  const [folded] = useCollapsed('feed')
  const open = shown || fill
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [feed.length, open, folded])
  if (!open) return null
  if (folded && !fill) return <CollapsedTab id="feed" title="Log" testId="collapsed-feed" />
  const groups = groupFeed(feed.slice(-120))
  const lines = (
    <>
      {groups.length === 0 && <div style={{ color: colors.muted }}>Nothing has happened yet.</div>}
      {groups.map((g) => (
        <div key={g[0]!.id} style={{ borderLeft: `3px solid ${g[0]!.seat ? seatColor(g[0]!.seat) : colors.border}`, paddingLeft: 6, marginBottom: 3, color: g[0]!.dice ? colors.muted : colors.text }}>
          {g.map((e) => (
            <div key={e.id}><Rich text={e.text} /></div>
          ))}
        </div>
      ))}
      <div ref={end} />
    </>
  )
  if (fill) return <div data-testid="event-feed" style={{ fontFamily: fontStack, fontSize: 12, lineHeight: 1.4 }}>{lines}</div>
  return (
    <div
      data-testid="event-feed"
      style={{ ...panel, width: 270, maxHeight: '42vh', overflowY: 'auto', padding: '6px 8px', fontFamily: fontStack, fontSize: 12, lineHeight: 1.4, pointerEvents: 'auto', boxSizing: 'border-box', scrollbarWidth: 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4, position: 'sticky', top: -6, zIndex: 1, background: colors.bgSolid, padding: '4px 0', borderBottom: `1px solid ${colors.border}` }}>
        <b style={{ fontSize: 12 }}>Log</b>
        <CollapseButton id="feed" title="log" />
      </div>
      {lines}
    </div>
  )
}
