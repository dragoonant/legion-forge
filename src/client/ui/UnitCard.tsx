// Unit card: stats, weapons with dice icons by colour, keywords with hover help, upgrades, tokens, suppression vs courage, wounds.
// Reads the unit's data record (and the live unit when there is one). Every name and keyword text comes from data. `cardModel` is the
// pure view-model (tests read it without React).
import type { CSSProperties } from 'react'
import type { GameData, GameState, Unit } from '@/engine'
import type { UnitData, WeaponData, UpgradeData } from '@/data/types'
import { factionName, rankName, tokenName, unitTypeName, upgradeName, weaponName, type Snap } from '../game/labels'
import { unitChips, woundPips } from '../figures/UnitPips'
import { DiceChips } from './AttackPrompts'
import { Keyword, KeywordList, Rich } from './Keyword'
import { RankGlyph } from './OrderPool'
import { colors, panel } from './theme'

export interface WeaponRow {
  id: string
  name: string
  dice: Record<string, number>
  range: string
  keywords: { id: string; x?: number; param?: string }[]
  viaUpgrade: string | null
}

export interface CardModel {
  typeId: string
  name: string
  subtitle: string | null
  rank: string
  rankName: string
  faction: string
  points: number
  minis: number
  wounds: number
  speed: number
  courage: number | null
  defence: string
  surge: { attack: string | null; defence: string | null }
  keywords: { id: string; x?: number; param?: string }[]
  weapons: WeaponRow[]
  upgrades: { id: string; name: string }[]
}

function rangeText(w: WeaponData): string {
  const { min, max } = w.range
  if (max === 0) return 'melee'
  return min === max ? `${min}` : `${min}-${max}`
}

export function cardModel(d: GameData, typeId: string, upgradeIds: readonly string[] = []): CardModel {
  const u = d.units[typeId] as unknown as UnitData
  const rows: WeaponRow[] = []
  const add = (id: string, via: string | null) => {
    const w = d.weapons[id] as unknown as WeaponData | undefined
    if (!w || rows.some((r) => r.id === id)) return
    rows.push({ id, name: weaponName(d, id), dice: { ...w.dice }, range: rangeText(w), keywords: w.keywords, viaUpgrade: via })
  }
  for (const id of u.weapons) add(id, null)
  const ups: { id: string; name: string }[] = []
  for (const id of upgradeIds) {
    const up = d.upgrades[id] as unknown as UpgradeData | undefined
    if (!up) continue
    ups.push({ id, name: upgradeName(d, id) })
    if (up.addsMinis?.weapon) add(up.addsMinis.weapon, id)
    for (const w of up.sides?.[0]?.weapons ?? []) add(w, id)
  }
  const keywords = [...u.keywords]
  for (const id of upgradeIds) {
    const up = d.upgrades[id] as unknown as UpgradeData | undefined
    for (const k of up?.keywords ?? []) if (!keywords.some((x) => x.id === k.id)) keywords.push(k)
  }
  return {
    typeId,
    name: unitTypeName(d, typeId),
    subtitle: u.subtitle,
    rank: u.rank,
    rankName: rankName(d, u.rank),
    faction: factionName(d, u.faction),
    points: u.points + upgradeIds.reduce((s, id) => s + ((d.upgrades[id] as unknown as UpgradeData | undefined)?.points ?? 0), 0),
    minis: u.minis,
    wounds: u.wounds,
    speed: u.speed,
    courage: u.courage,
    defence: u.defence,
    surge: { attack: u.surge.attack, defence: u.surge.defence },
    keywords,
    weapons: rows,
    upgrades: ups,
  }
}

const stat: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44, padding: '3px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 6 }

function Stat({ label, value, term }: { label: string; value: string | number; term?: string }) {
  return (
    <div style={stat}>
      <span style={{ fontSize: 9, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{term ? <Keyword term={term}>{label}</Keyword> : label}</span>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{value}</span>
    </div>
  )
}

export function UnitCardView({ d, typeId, upgrades = [], live, state, compact = false, style }: { d: GameData; typeId: string; upgrades?: readonly string[]; live?: Unit | null; state?: Snap & Pick<GameState, 'units'>; compact?: boolean; style?: CSSProperties }) {
  const m = cardModel(d, typeId, upgrades)
  const pips = live ? woundPips(live) : null
  const chips = live && state ? unitChips(state, live) : []
  return (
    <div data-testid="unit-card" data-unit-type={typeId} style={{ ...panel, padding: 10, width: compact ? 250 : 300, boxSizing: 'border-box', fontSize: 12, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <RankGlyph rank={m.rank} size={13} color={colors.accent} />
        <b style={{ fontSize: 15 }}>{m.name}</b>
        <span style={{ marginLeft: 'auto', color: colors.muted }}>{m.points} pts</span>
      </div>
      <div style={{ color: colors.muted, marginBottom: 6 }}>
        {m.subtitle ? `${m.subtitle} · ` : ''}<Rich text={m.rankName} d={d} /> · {m.faction}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
        <Stat label="Speed" value={m.speed} />
        <Stat label="Wounds" value={pips ? `${pips.left}/${pips.total}` : m.wounds} />
        <Stat label="Models" value={pips ? `${pips.models.left}/${pips.models.total}` : m.minis} />
        <Stat label="Courage" value={m.courage ?? '-'} term="Courage" />
        <Stat label="Defence" value={m.defence} />
      </div>
      {live && (
        <div style={{ marginBottom: 6, fontSize: 11 }}>
          <Keyword term="Suppression">Suppression</Keyword> {live.suppression}{m.courage !== null ? ` / courage ${m.courage}` : ''}
          {chips.length > 0 && <span style={{ color: colors.muted }}> · <Rich text={chips.map((c) => c.help).join(', ')} d={d} /></span>}
        </div>
      )}
      {!compact && m.weapons.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
          <tbody>
            {m.weapons.map((w) => (
              <tr key={w.id} data-weapon={w.id} style={{ borderTop: `1px solid ${colors.border}` }}>
                <td style={{ padding: '3px 0' }}>
                  <div style={{ fontWeight: 700 }}>{w.name}</div>
                  <div style={{ color: colors.muted, fontSize: 11 }}><KeywordList d={d} list={w.keywords} empty="no keywords" /></div>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top', padding: '3px 0' }}>
                  <DiceChips dice={w.dice} />
                  <div style={{ color: colors.muted, fontSize: 11 }}>range {w.range}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {m.keywords.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <KeywordList d={d} list={m.keywords} />
        </div>
      )}
      {m.upgrades.length > 0 && <div style={{ color: colors.muted }}>Upgrades: <Rich text={m.upgrades.map((u) => u.name).join(', ')} d={d} /></div>}
      {live && Object.entries(live.tokens).some(([, n]) => n > 0) && (
        <div style={{ color: colors.muted, marginTop: 3 }}><Rich text={Object.entries(live.tokens).filter(([, n]) => n > 0).map(([k, n]) => `${tokenName(d, k)} x${n}`).join(', ')} d={d} /></div>
      )}
    </div>
  )
}
