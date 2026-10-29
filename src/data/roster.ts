import type { ArmyListData, DataBundle, Id, UnitData, UpgradeData } from './types'

/**
 * Army-list legality (docs/spec/20-data-schema.md V-11, V-12, V-24) and points, on a loaded bundle. Used by the validator for the
 * pre-built lists, and by the team builder and the engine's game setup later. Every function returns problem strings (empty = legal).
 */
export function upgradePoints(bundle: DataBundle, id: Id): number {
  return bundle.upgrades[id]?.points ?? 0
}

export function entryPoints(bundle: DataBundle, entry: ArmyListData['units'][number]): number {
  return (bundle.units[entry.unit]?.points ?? 0) + entry.upgrades.reduce((s, u) => s + upgradePoints(bundle, u), 0)
}

export function listPoints(bundle: DataBundle, list: ArmyListData): number {
  return list.units.reduce((s, e) => s + entryPoints(bundle, e), 0)
}

const isTrooperType = (bundle: DataBundle, key: string): boolean => bundle.unitTypes[key]?.flags.trooper === true

function restrictionProblems(bundle: DataBundle, unit: UnitData, up: UpgradeData): string[] {
  const out: string[] = []
  const r = up.restrictions
  if (!r) return out
  const bad = (m: string) => out.push(`${up.id} on ${unit.id}: ${m}`)
  if (r.units && !r.units.includes(unit.id)) bad('not one of the units this upgrade allows')
  if (r.unitTypes && !r.unitTypes.some((t) => t === unit.unitType || (t === 'trooper-any' && isTrooperType(bundle, unit.unitType)))) bad('unit type not allowed')
  if (r.ranks && !r.ranks.includes(unit.rank)) bad('rank not allowed')
  if (r.faction && r.faction !== unit.faction) bad('faction not allowed')
  if (r.forceAffinity && unit.forceAffinity !== r.forceAffinity) bad(`needs a ${r.forceAffinity}-side unit`)
  if (r.hasKeyword && !unit.keywords.some((k) => k.id === r.hasKeyword)) bad(`unit lacks ${r.hasKeyword}`)
  return out
}

/** V-11 for one unit entry: slots (granted ones included), restrictions, duplicates, Heavy Weapon Team, single Leader. */
export function entryProblems(bundle: DataBundle, entry: ArmyListData['units'][number]): string[] {
  const unit = bundle.units[entry.unit]
  if (!unit) return [`unknown unit ${entry.unit}`]
  const out: string[] = []
  const ups = entry.upgrades.map((id) => bundle.upgrades[id])
  if (ups.some((u) => !u)) return [`${unit.id}: unknown upgrade in ${entry.upgrades.join(', ')}`]
  const chosen = ups as UpgradeData[]
  if (new Set(entry.upgrades).size !== entry.upgrades.length) out.push(`${unit.id}: an upgrade card appears more than once`)
  const available: Record<string, number> = {}
  for (const s of unit.upgradeBar) available[s] = (available[s] ?? 0) + 1
  for (const u of chosen) for (const s of u.grantsSlots ?? []) available[s] = (available[s] ?? 0) + 1
  const used: Record<string, number> = {}
  for (const u of chosen) {
    used[u.slot] = (used[u.slot] ?? 0) + 1
    out.push(...restrictionProblems(bundle, unit, u))
  }
  for (const [slot, n] of Object.entries(used)) if (n > (available[slot] ?? 0)) out.push(`${unit.id}: ${n} ${slot} upgrades but only ${available[slot] ?? 0} ${slot} icons`)
  if (unit.keywords.some((k) => k.id === 'kw.heavy-weapon-team') && !chosen.some((u) => u.slot === 'heavy-weapon')) out.push(`${unit.id}: Heavy Weapon Team needs a heavy weapon upgrade`)
  const leaders = chosen.filter((u) => u.keywords?.some((k) => k.id === 'kw.leader')).length
  if (leaders > 1) out.push(`${unit.id}: more than one Leader upgrade`)
  return out
}

/** V-11 for a whole list. */
export function armyListProblems(bundle: DataBundle, list: ArmyListData): string[] {
  const out: string[] = []
  const format = bundle.formats[list.format]
  const faction = bundle.factions[list.faction]
  if (!format) return [`${list.id}: unknown format ${list.format}`]
  if (!faction) return [`${list.id}: unknown faction ${list.faction}`]
  const total = listPoints(bundle, list)
  if (total !== list.points) out.push(`${list.id}: points say ${list.points}, the recomputed sum is ${total}`)
  if (total > format.maxPoints) out.push(`${list.id}: ${total} points exceeds the ${format.name} maximum of ${format.maxPoints}`)

  const counts: Record<string, number> = {}
  const unitCounts: Record<Id, number> = {}
  const uniqueNames: Record<string, number> = {}
  for (const e of list.units) {
    const u = bundle.units[e.unit]
    if (!u) {
      out.push(`${list.id}: unknown unit ${e.unit}`)
      continue
    }
    out.push(...entryProblems(bundle, e).map((m) => `${list.id}: ${m}`))
    if (u.faction !== list.faction) out.push(`${list.id}: ${u.id} belongs to ${u.faction}, not ${list.faction}`)
    unitCounts[u.id] = (unitCounts[u.id] ?? 0) + 1
    if (!u.keywords.some((k) => k.id === 'kw.detachment')) counts[u.rank] = (counts[u.rank] ?? 0) + 1
    if (u.unique) uniqueNames[u.name] = (uniqueNames[u.name] ?? 0) + 1
    for (const id of e.upgrades) {
      const up = bundle.upgrades[id]
      if (up?.unique) uniqueNames[up.name] = (uniqueNames[up.name] ?? 0) + 1
      if (up && !id.startsWith('neu.') && !id.startsWith(`${faction.prefix}.`)) out.push(`${list.id}: ${id} belongs to another faction`)
    }
  }
  for (const [name, n] of Object.entries(uniqueNames)) if (n > 1) out.push(`${list.id}: unique name "${name}" appears ${n} times across units and upgrades`)
  for (const [rank, [min, max]] of Object.entries(format.ranks)) {
    const n = counts[rank] ?? 0
    if (n < min || n > max) out.push(`${list.id}: ${n} ${rank} units, ${format.name} allows ${min}-${max}`)
  }
  for (const e of list.units) {
    const u = bundle.units[e.unit]
    const det = u?.keywords.find((k) => k.id === 'kw.detachment')
    if (!det || !det.param) continue
    const same = list.units.filter((x) => x.unit === u.id).length
    const parents = unitCounts[det.param] ?? 0
    if (same > parents) out.push(`${list.id}: ${same} ${u.name} detachments but only ${parents} parent unit(s) ${det.param}`)
  }
  out.push(...commandHandProblems(bundle, list))
  return out
}

/** V-12: seven cards, two each of 1, 2 and 3 pips plus Standing Orders, no duplicates, restrictions satisfied by the list. */
export function commandHandProblems(bundle: DataBundle, list: ArmyListData): string[] {
  const out: string[] = []
  const hand = list.commandHand
  if (hand.length !== 7) out.push(`${list.id}: command hand has ${hand.length} cards, needs 7`)
  if (new Set(hand).size !== hand.length) out.push(`${list.id}: command hand has duplicate cards`)
  const pips: Record<number, number> = {}
  const inList = new Set(list.units.map((e) => e.unit))
  for (const id of hand) {
    const c = bundle.commandCards[id]
    if (!c) {
      out.push(`${list.id}: unknown command card ${id}`)
      continue
    }
    pips[c.pips] = (pips[c.pips] ?? 0) + 1
    if (c.faction !== null && c.faction !== list.faction) out.push(`${list.id}: ${id} belongs to ${c.faction}`)
    if (c.restriction) {
      const hits = c.restriction.units.filter((u) => inList.has(u)).length
      const ok = c.restriction.op === 'or' ? hits >= 1 : hits === c.restriction.units.length
      if (!ok) out.push(`${list.id}: ${id} needs ${c.restriction.units.join(c.restriction.op === 'or' ? ' or ' : ' and ')} in the list`)
    }
  }
  for (const p of [1, 2, 3]) if ((pips[p] ?? 0) !== 2) out.push(`${list.id}: ${pips[p] ?? 0} cards of ${p} pips, needs 2`)
  if ((pips[4] ?? 0) !== 1 || !hand.includes('neu.cc.standing-orders')) out.push(`${list.id}: the hand needs Standing Orders`)
  return out
}
