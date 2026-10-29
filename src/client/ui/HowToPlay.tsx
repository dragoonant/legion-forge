// The how-to-play guide: a short own-words walk through a round, reachable from the start screen and from the battle. Every game term in
// it is a doorway (Rich).
import { HOW_TO_PLAY } from '../game/howto'
import { Rich } from './Keyword'
import { ModalFrame } from './ModalFrame'
import { colors } from './theme'
import { useUi } from './uiStore'

export function HowToPlay() {
  const open = useUi((s) => s.helpOpen)
  if (!open) return null
  return (
    <ModalFrame title="How to play" testId="how-to-play" width={640} onClose={() => useUi.setState({ helpOpen: false })}>
      <p style={{ margin: '0 0 8px', color: colors.muted, fontSize: 13, lineHeight: 1.45 }}>
        A short guide to a round of Recon. The rules are the game&apos;s own; this is the quick version.
      </p>
      {HOW_TO_PLAY.map((sec) => (
        <section key={sec.id} data-testid={`howto-${sec.id}`} style={{ padding: '8px 0', borderTop: `1px solid ${colors.border}` }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, color: colors.accent }}>{sec.title}</h3>
          {sec.lines.map((l, i) => (
            <p key={i} style={{ margin: '0 0 5px', fontSize: 13, lineHeight: 1.5 }}>
              <Rich text={l} />
            </p>
          ))}
        </section>
      ))}
    </ModalFrame>
  )
}
