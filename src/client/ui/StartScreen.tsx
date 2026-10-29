// Start screen (Starbound skin): pick your side and one of the Recon army lists for each seat, the objective, the bot tier and the seed,
// then go to the briefing. Carries the "unofficial, non-commercial fan project" notice. Every faction, list and card name is data.
import { useMemo } from 'react'
import { dataBundle, factionsWithLists, objectiveCards, reconLists } from '../game/adapter'
import { useSession, randomSeed } from '../store/session'
import type { BotTier } from '../params'
import type { Seat } from '@/engine'
import { colors, menuPage, plate, sectionTitle } from './theme'
import { Btn, TouchStyle } from './widgets'

const TIERS: { id: BotTier; label: string; ready: boolean }[] = [
  { id: 'normal', label: 'Normal (plans its activations)', ready: true },
  { id: 'easy', label: 'Easy (plans less, forgives mistakes)', ready: true },
  { id: 'random', label: 'Random (plays any legal move)', ready: true },
]

function SidePicker({ seat, title }: { seat: Seat; title: string }) {
  const builds = useSession((s) => s.builds)
  const setList = useSession((s) => s.setList)
  const b = dataBundle()
  const lists = useMemo(() => reconLists(b), [b])
  const current = lists.find((l) => l.id === builds[seat].listId)
  const factions = factionsWithLists(b)
  const ofFaction = lists.filter((l) => l.faction === current?.faction)
  return (
    <div style={{ ...plate, padding: 14, flex: '1 1 300px', minWidth: 0 }} data-testid={`side-${seat}`}>
      <h2 style={sectionTitle}>{title}</h2>
      <div style={{ display: 'flex', gap: 6, margin: '10px 0' }} role="radiogroup" aria-label={`${title} faction`}>
        {factions.map((f) => (
          <Btn
            key={f.key}
            role="radio"
            aria-checked={current?.faction === f.key}
            data-testid={`faction-${seat}-${f.key}`}
            variant={current?.faction === f.key ? 'active' : 'base'}
            onClick={() => {
              const first = lists.find((l) => l.faction === f.key)
              if (first) setList(seat, first.id)
            }}
            style={{ flex: 1 }}
          >
            {f.name}
          </Btn>
        ))}
      </div>
      <div role="radiogroup" aria-label={`${title} army list`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ofFaction.map((l) => (
          <Btn key={l.id} role="radio" aria-checked={current?.id === l.id} data-testid={`list-${seat}-${l.id}`} variant={current?.id === l.id ? 'active' : 'base'} onClick={() => setList(seat, l.id)} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left' }}>
            <span>{l.name}</span>
            <span style={{ opacity: 0.8 }}>{l.points} pts</span>
          </Btn>
        ))}
      </div>
    </div>
  )
}

export function StartScreen() {
  const s = useSession()
  const objectives = objectiveCards()
  return (
    <main className="lf-menu" data-testid="start-screen" style={{ ...menuPage, padding: 'max(18px, var(--safe-top)) 16px 36px', boxSizing: 'border-box' }}>
      <TouchStyle />
      <div style={{ maxWidth: 940, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ textAlign: 'center', marginTop: 12 }}>
          <h1 style={{ margin: 0, fontSize: 40, letterSpacing: '0.06em', color: colors.accent }}>Legion Forge</h1>
          <p style={{ margin: '6px 0 0', color: colors.muted }}>Command your squads in a 3D skirmish on the Recon table. You play against a bot.</p>
        </header>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <SidePicker seat="A" title="Your side" />
          <SidePicker seat="B" title="Opponent" />
        </div>
        <section style={{ ...plate, padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={sectionTitle}>Objective</span>
            <select data-testid="objective-select" value={s.objectiveId ?? ''} onChange={(e) => s.setObjective(e.target.value || null)} style={{ background: colors.button, color: colors.text, border: `1px solid ${colors.buttonBorder}`, borderRadius: 6, padding: 8 }}>
              <option value="">Random (from the seed)</option>
              {objectives.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={sectionTitle}>Bot</span>
            <select data-testid="tier-select" value={s.tier} onChange={(e) => s.setTier(e.target.value as BotTier)} style={{ background: colors.button, color: colors.text, border: `1px solid ${colors.buttonBorder}`, borderRadius: 6, padding: 8 }}>
              {TIERS.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.ready}>{t.label}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={sectionTitle}>Seed</span>
            <span style={{ display: 'flex', gap: 6 }}>
              <input data-testid="seed-input" value={s.seed} onChange={(e) => s.setSeed(e.target.value)} style={{ flex: 1, minWidth: 0, background: colors.button, color: colors.text, border: `1px solid ${colors.buttonBorder}`, borderRadius: 6, padding: 8 }} />
              <Btn data-testid="seed-roll" onClick={() => s.setSeed(randomSeed())}>New</Btn>
            </span>
          </label>
        </section>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn variant="primary" data-testid="start-battle" onClick={() => s.setScreen('briefing')} style={{ fontSize: 17, padding: '12px 28px' }}>Review and start</Btn>
          <Btn data-testid="watch-bots" onClick={() => s.launchWatch()} style={{ padding: '12px 18px' }}>Watch two bots play</Btn>
        </div>
        <footer data-testid="fan-notice" style={{ textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>
          Unofficial, non-commercial fan project. Not affiliated with or endorsed by Atomic Mass Games, Lucasfilm or Disney. Star Wars and Star Wars: Legion are trademarks of their owners, used only to name the game this port follows. Rules text and prose here are our own; all art is original. Made by evilgouki.
        </footer>
      </div>
    </main>
  )
}
