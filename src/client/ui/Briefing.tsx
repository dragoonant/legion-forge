// Briefing screen: before the battle both army lists (unit cards from data), how the Recon battle runs and how to play it. The battle
// cards themselves are drawn once the table edge is chosen, so the objective is described from the choice made on the start screen
// (or "drawn from the seed"). Begin starts the game.
import { useState } from 'react'
import type { Seat } from '@/engine'
import { dataBundle, engineBundle, objectiveCards } from '../game/adapter'
import { armyListName, factionName } from '../game/labels'
import { useSession } from '../store/session'
import { Rich } from './Keyword'
import { UnitCardView } from './UnitCard'
import { colors, menuPage, plate, sectionTitle } from './theme'
import { Btn, TouchStyle } from './widgets'

const STEPS = [
  'Command phase: both players secretly pick a command card. Fewer pips takes priority; the card tells which units get orders.',
  'Activation phase: players take turns activating a unit that holds a face-up order, or draw an order token from the pool at random.',
  'Each activation gives two actions: move with the hinged tool, attack, aim, dodge, recover or stand by. Suppressed units get fewer actions.',
  'End phase: points are scored for the objectives, tokens clear, and a new round begins. The battle ends after the last round or at the instant-win score.',
]

const KEYS = [
  'Click a gold-ringed unit or a row in the prompt to answer. Hover a unit for its card.',
  'Right mouse drag turns the camera, middle drag or W A S D pans, the wheel zooms. Presets are in the top bar.',
  'M cycles the measuring tools, H hides the panels, Escape cancels, Enter confirms a move.',
]

function Roster({ seat }: { seat: Seat }) {
  const builds = useSession((s) => s.builds)
  const [open, setOpen] = useState<string | null>(null)
  const d = engineBundle().data
  const list = d.armyLists?.[builds[seat].listId] as unknown as { id: string; faction: string; units: { unit: string; upgrades: string[] }[]; points: number } | undefined
  if (!list) return null
  return (
    <div style={{ ...plate, padding: 12, flex: '1 1 320px', minWidth: 0 }} data-testid={`roster-${seat}`}>
      <h2 style={sectionTitle}>{seat === 'A' ? 'Your army' : 'Opponent'}</h2>
      <div style={{ fontWeight: 800, margin: '4px 0' }}>{factionName(d, list.faction)}: {armyListName(d, list.id)} <span style={{ color: colors.muted, fontWeight: 400 }}>({list.points} pts)</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {list.units.map((e, i) => {
          const key = `${seat}${i}`
          return (
            <div key={key}>
              <Btn onClick={() => setOpen(open === key ? null : key)} style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }} aria-expanded={open === key}>
                <span>{(d.units[e.unit] as { name?: string })?.name}{e.upgrades.length ? ` + ${e.upgrades.length} upgrade${e.upgrades.length === 1 ? '' : 's'}` : ''}</span>
                <span style={{ opacity: 0.7 }}>{open === key ? 'hide' : 'card'}</span>
              </Btn>
              {open === key && <div style={{ marginTop: 4 }}><UnitCardView d={d} typeId={e.unit} upgrades={e.upgrades} style={{ width: '100%' }} /></div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Briefing() {
  const s = useSession()
  const objective = objectiveCards(dataBundle()).find((o) => o.id === s.objectiveId)
  return (
    <main className="lf-menu" data-testid="briefing" style={{ ...menuPage, padding: 'max(18px, var(--safe-top)) 16px 36px', boxSizing: 'border-box' }}>
      <TouchStyle />
      <div style={{ maxWidth: 940, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ margin: '10px 0 0', fontSize: 28, color: colors.accent, textAlign: 'center' }}>Briefing</h1>
        <section style={{ ...plate, padding: 14 }}>
          <h2 style={sectionTitle}>The battle</h2>
          <p style={{ margin: '6px 0' }}>
            {objective ? <><b>{objective.name}.</b> <Rich text={objective.text} /></> : 'The objective is drawn from the seed once the table edge is chosen; it is shown under Objectives in the battle.'}
          </p>
          <ol style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.5 }}>
            {STEPS.map((t) => (
              <li key={t}><Rich text={t} /></li>
            ))}
          </ol>
        </section>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Roster seat="A" />
          <Roster seat="B" />
        </div>
        <section style={{ ...plate, padding: 14 }}>
          <h2 style={sectionTitle}>Controls</h2>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.5 }}>
            {KEYS.map((t) => (
              <li key={t}><Rich text={t} /></li>
            ))}
          </ul>
        </section>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Btn data-testid="briefing-back" onClick={() => s.setScreen('start')}>Back</Btn>
          <Btn variant="primary" data-testid="begin-battle" onClick={() => s.launch()} style={{ fontSize: 17, padding: '12px 28px' }}>Begin battle</Btn>
        </div>
      </div>
    </main>
  )
}
