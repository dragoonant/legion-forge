/**
 * Build-time data validation (node only; never imported by the client bundle).
 * Used by tools/validate-data.ts and tests/data/*.test.ts. Implements the V-rules of docs/spec/20-data-schema.md section 12
 * that can run before the engine exists (V-08 field registry and V-23 client names wait for M2/M3; V-07 waits for the hook registry).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import type { ArmyListData, BattleCardData, DataBundle, DataFile, Id, KeywordData, LayoutData, MapData, Source, UnitData, UpgradeData, Vec2, WeaponData } from './types'
import { MANIFEST, SCHEMA_NAMES, defName, schemaOf } from './manifest'
import { SCHEMAS, schemaId } from './schema'
import { bundleFromFiles } from './index'
import { codesIn, idsWithPrefix, recordsOf, unimplementedIn } from './refs'
import { armyListProblems } from './roster'
import { distToPolygon, pointInPolygon, polygonArea, polygonBounds, polygonsOverlap, segmentsCross } from './geometry'

const DATA_ROOT = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SOURCES = path.resolve(DATA_ROOT, '../../docs/sources')

export interface HookUse { name: string; usedBy: string[]; registered: boolean }
export interface FileSummary { path: string; def: string; records: number; ids: Id[] }

export interface ValidationResult {
  errors: string[]
  warnings: string[]
  files: number
  records: number
  hooks: HookUse[]
  summaries: FileSummary[]
  /** Present when every file passed its schema. */
  bundle?: DataBundle
}

export interface ValidateOptions {
  /** Code names the engine has registered; when given, any other name the data uses is an error (unless `allowPendingCodes`). */
  registeredCodes?: ReadonlySet<string>
  /** Report unregistered code names as pending (a warning, not an error); ON until the engine registry exists (M2). */
  allowPendingCodes?: boolean
  /** Directory of source extracts for the prose check (V-16); `false` skips it. Default: docs/sources when it exists. */
  sourcesDir?: string | false
  /** Files to validate instead of the real manifest (tests use this for reject cases). */
  manifest?: readonly DataFile[]
  /** Directory scanned for JSON files missing from the manifest (V-01); `false` skips the scan. Default: this folder. */
  dataDir?: string | false
}

const FOLDER_PREFIX: [RegExp, string[]][] = [
  [/^core\//, ['core']], [/^keywords\.json$/, ['kw']], [/^armies\/neutral\//, ['neu', 'core']], [/^battle\/recon\//, ['rec']],
  [/^battle\/standard\//, ['std']], [/^layouts\//, ['lay']],
]

function listJson(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listJson(full, base))
    else if (entry.name.endsWith('.json')) out.push(path.relative(base, full).split(path.sep).join('/'))
  }
  return out
}

const hasPrimary = (s: Source | Source[]): boolean => (Array.isArray(s) ? s : [s]).some((x) => x.kind === 'primary')
const sourcesOf = (s: Source | Source[]): Source[] => (Array.isArray(s) ? s : [s])

// ------------------------------------------------------------------ prose (V-16)
const words = (text: string): string[] => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
const SHINGLE = 12

function listTextFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'page-images' && entry.name !== 'node_modules') listTextFiles(full, out)
    } else if (/\.(txt|md)$/i.test(entry.name)) out.push(full)
  }
  return out
}

function checkProse(bundle: DataBundle, sourcesDir: string, errors: string[]): void {
  const shingles = new Map<string, Id>()
  const firstWords = new Set<string>()
  for (const [id, rec] of Object.entries(bundle.byId)) {
    const text = (rec as unknown as { text?: unknown }).text
    if (typeof text !== 'string') continue
    const w = words(text)
    for (let i = 0; i + SHINGLE <= w.length; i++) {
      const key = w.slice(i, i + SHINGLE).join(' ')
      if (!shingles.has(key)) shingles.set(key, id)
      firstWords.add(w[i])
    }
  }
  if (shingles.size === 0) return
  const reported = new Set<string>()
  for (const file of listTextFiles(sourcesDir)) {
    const w = words(fs.readFileSync(file, 'utf8'))
    for (let i = 0; i + SHINGLE <= w.length; i++) {
      if (!firstWords.has(w[i])) continue
      const hit = shingles.get(w.slice(i, i + SHINGLE).join(' '))
      if (hit && !reported.has(hit)) {
        reported.add(hit)
        errors.push(`${hit}: V-16 prose shares a ${SHINGLE}-word run with ${path.relative(sourcesDir, file).split(path.sep).join('/')} (write it in our own words)`)
      }
    }
  }
}

// ------------------------------------------------------------------ effects (V-17)
const VERB_NAMES: readonly string[] = (SCHEMAS.common as { $defs: { Verb: { else: { propertyNames: { enum: string[] } } } } }).$defs.Verb.else.propertyNames.enum

/** Walk every `do` / `then` / `options` list under a node and check verb names (the schema leaves verb arguments open). */
function verbProblems(node: unknown, at: string, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n, i) => verbProblems(n, `${at}[${i}]`, out))
    return
  }
  if (!node || typeof node !== 'object') return
  const o = node as Record<string, unknown>
  for (const key of ['do', 'then']) {
    if (Array.isArray(o[key]) && (o[key] as unknown[]).every((v) => v && typeof v === 'object')) {
      for (const verb of o[key] as Record<string, unknown>[]) {
        const names = Object.keys(verb)
        if (names.length === 1 && names[0] !== 'code' && !VERB_NAMES.includes(names[0])) out.push(`${at}.${key}: V-17 unknown verb ${names[0]}`)
      }
    }
  }
  if (o.choose && typeof o.choose === 'object') {
    const options = (o.choose as { options?: unknown[][] }).options ?? []
    options.forEach((opt, i) => {
      for (const verb of opt as Record<string, unknown>[]) {
        const names = Object.keys(verb)
        if (names.length === 1 && names[0] !== 'code' && !VERB_NAMES.includes(names[0])) out.push(`${at}.choose.options[${i}]: V-17 unknown verb ${names[0]}`)
      }
    })
  }
  for (const [k, v] of Object.entries(o)) verbProblems(v, `${at}.${k}`, out)
}

function usesX(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(usesX)
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (o.x === true) return true
    return Object.values(o).some(usesX)
  }
  return false
}

/** KeywordRef-shaped nodes: objects whose keys are within {id, x, param} and whose id starts with `kw.` */
function keywordRefs(node: unknown, out: { id: string; x?: unknown; param?: unknown }[] = []): { id: string; x?: unknown; param?: unknown }[] {
  if (Array.isArray(node)) node.forEach((n) => keywordRefs(n, out))
  else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    const keys = Object.keys(o)
    if (typeof o.id === 'string' && o.id.startsWith('kw.') && keys.every((k) => k === 'id' || k === 'x' || k === 'param')) out.push(o as { id: string })
    for (const k of keys) keywordRefs(o[k], out)
  }
  return out
}

// ------------------------------------------------------------------ geometry (V-14, V-15, V-22)
function simplePolygon(poly: Vec2[]): boolean {
  if (poly.length < 3 || polygonArea(poly) < 1e-6) return false
  for (let i = 0; i < poly.length; i++) {
    for (let j = i + 1; j < poly.length; j++) {
      if (Math.abs(i - j) === 1 || (i === 0 && j === poly.length - 1)) continue
      if (segmentsCross(poly[i], poly[(i + 1) % poly.length], poly[j], poly[(j + 1) % poly.length])) return false
    }
  }
  return true
}

const insideTable = (p: Vec2, size: { x: number; z: number }): boolean => Math.abs(p.x) <= size.x / 2 + 1e-9 && Math.abs(p.z) <= size.z / 2 + 1e-9

function mapProblems(map: MapData, size: { x: number; z: number }, out: string[]): void {
  const at = map.id
  for (const side of ['red', 'blue'] as const) {
    map.territories[side].forEach((poly, i) => {
      if (!simplePolygon(poly)) out.push(`${at}: V-14 ${side} territory ${i} is not a valid polygon`)
      if (!poly.every((p) => insideTable(p, size))) out.push(`${at}: V-14 ${side} territory ${i} leaves the table`)
    })
  }
  for (const r of map.territories.red) for (const b of map.territories.blue) if (polygonsOverlap(r, b)) out.push(`${at}: V-14 a red and a blue territory overlap`)
  map.pois.forEach((p, i) => {
    if (!insideTable(p.at, size)) out.push(`${at}: V-14 POI ${p.id} is off the table`)
    for (let j = i + 1; j < map.pois.length; j++) {
      const q = map.pois[j]
      if (Math.hypot(p.at.x - q.at.x, p.at.z - q.at.z) < 2 - 1e-9) out.push(`${at}: V-14 POIs ${p.id} and ${q.id} are closer than 2 in`)
    }
  })
}

function layoutProblems(layout: LayoutData, maps: MapData[], out: string[]): void {
  const at = layout.id
  for (const p of layout.pieces) {
    if (!simplePolygon(p.footprint)) out.push(`${at}: V-15 piece ${p.id} is not a valid polygon`)
    if (!p.footprint.every((v) => insideTable(v, layout.size))) out.push(`${at}: V-15 piece ${p.id} leaves the table`)
  }
  const impassable = layout.pieces.filter((p) => p.movement === 'impassable')
  for (const map of maps) {
    // V-15 (approximation): along each table edge, the part of a territory's boundary that lies on the edge may not be covered by impassable pieces.
    for (const side of ['red', 'blue'] as const) {
      for (const poly of map.territories[side]) {
        const b = polygonBounds(poly)
        const edges: { axis: 'x' | 'z'; at: number; from: number; to: number }[] = []
        const hx = layout.size.x / 2
        const hz = layout.size.z / 2
        if (Math.abs(b.z0 + hz) < 1e-9) edges.push({ axis: 'z', at: -hz, from: b.x0, to: b.x1 })
        if (Math.abs(b.z1 - hz) < 1e-9) edges.push({ axis: 'z', at: hz, from: b.x0, to: b.x1 })
        if (Math.abs(b.x0 + hx) < 1e-9) edges.push({ axis: 'x', at: -hx, from: b.z0, to: b.z1 })
        if (Math.abs(b.x1 - hx) < 1e-9) edges.push({ axis: 'x', at: hx, from: b.z0, to: b.z1 })
        for (const e of edges) {
          const spans = impassable
            .map((p) => polygonBounds(p.footprint))
            .filter((pb) => (e.axis === 'z' ? pb.z0 <= e.at + 3 && pb.z1 >= e.at - 3 : pb.x0 <= e.at + 3 && pb.x1 >= e.at - 3))
            .map((pb) => (e.axis === 'z' ? [pb.x0, pb.x1] : [pb.z0, pb.z1]))
            .sort((a, c) => a[0] - c[0])
          let reach = e.from
          for (const [s0, s1] of spans) if (s0 <= reach + 1e-9) reach = Math.max(reach, s1)
          if (reach >= e.to - 1e-9) out.push(`${at}: V-15 impassable pieces block the whole ${side} entry edge of ${map.id}`)
        }
      }
    }
    // V-22: every POI of every map of this format is a legal objective-token spot (2 in token: radius 1)
    for (const poi of map.pois) {
      for (const piece of layout.pieces) {
        const d = distToPolygon(poi.at, piece.footprint)
        const overlaps = d < 1 - 1e-9 || pointInPolygon(poi.at, piece.footprint)
        if (!overlaps) continue
        if (piece.movement === 'impassable') out.push(`${at}: V-22 ${map.id} ${poi.id} sits on impassable piece ${piece.id}`)
        else if (piece.kind !== 'area') out.push(`${at}: V-22 ${map.id} ${poi.id} is partly over ${piece.kind} ${piece.id}`)
      }
    }
  }
}

// ------------------------------------------------------------------ main
export function validateAll(options: ValidateOptions = {}): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const manifest = options.manifest ?? MANIFEST

  // V-01 schemas
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true, allErrors: true, multipleOfPrecision: 6 })
  addFormats(ajv)
  for (const name of SCHEMA_NAMES) {
    const schema = SCHEMAS[name] as { $id?: string } | undefined
    if (!schema) throw new Error(`schema ${name} is not registered`)
    ajv.addSchema(schema, schemaId(name))
  }

  const summaries: FileSummary[] = []
  let records = 0
  let schemaErrors = 0
  for (const file of manifest) {
    const validate = ajv.getSchema(`${schemaId(schemaOf(file.def))}#/$defs/${defName(file.def)}`)
    if (!validate) {
      errors.push(`${file.path}: V-01 no schema def ${file.def}`)
      schemaErrors++
      continue
    }
    const recs = recordsOf(file)
    summaries.push({ path: file.path, def: file.def, records: recs.length, ids: recs.map((r) => String(r.id)) })
    records += recs.length
    recs.forEach((rec, i) => {
      if (!validate(rec)) {
        for (const e of validate.errors ?? []) {
          schemaErrors++
          errors.push(`${file.path}${file.array ? `[${i}]` : ''} (${String(rec.id)}): V-01 ${e.instancePath || '/'} ${e.message}${e.params && 'additionalProperty' in e.params ? ` (${String(e.params.additionalProperty)})` : ''}`)
        }
      }
    })
  }
  if (options.dataDir !== false) {
    const dir = options.dataDir ?? DATA_ROOT
    const listed = new Set(manifest.map((f) => f.path))
    for (const rel of listJson(dir)) {
      if (rel.startsWith('schema/')) continue
      if (!listed.has(rel)) errors.push(`${rel}: V-01 JSON file is in no manifest`)
    }
  }
  if (schemaErrors > 0) return { errors, warnings, files: manifest.length, records, hooks: [], summaries }

  // V-02 ids
  const where = new Map<Id, string>()
  const factionPrefix = new Map<string, string>() // folder -> prefix
  for (const f of manifest) if (f.def === 'army#faction') factionPrefix.set(f.path.split('/')[1], String((f.data as { prefix: string }).prefix))
  for (const f of manifest) {
    const allowed =
      FOLDER_PREFIX.find(([re]) => re.test(f.path))?.[1] ?? (f.path.startsWith('armies/') ? [factionPrefix.get(f.path.split('/')[1]) ?? '?'] : [])
    for (const rec of recordsOf(f)) {
      const id = String(rec.id)
      if (where.has(id)) errors.push(`${f.path}: V-02 duplicate id ${id} (also in ${where.get(id)})`)
      where.set(id, f.path)
      if (f.def !== 'army#faction' && f.def !== 'core#format' && !allowed.includes(id.split('.')[0])) errors.push(`${f.path}: V-02 id ${id} does not start with ${allowed.join(' or ')}`)
    }
  }

  const bundle = bundleFromFiles(manifest)
  const all = Object.values(bundle.byId)
  const exists = (id: string) => id in bundle.byId

  // V-04 / V-19 references (generic: any string that looks like a record id must resolve)
  const REF = /^(emp|reb|neu|core)\.(u|w|up|cc|list|token|action|dice)\.|^(rec|std)\.(obj|sec|adv|map)\.|^kw\./
  for (const f of manifest) {
    for (const rec of recordsOf(f)) {
      const strings = [...idsWithPrefix(rec, 'emp.'), ...idsWithPrefix(rec, 'reb.'), ...idsWithPrefix(rec, 'neu.'), ...idsWithPrefix(rec, 'core.'), ...idsWithPrefix(rec, 'rec.'), ...idsWithPrefix(rec, 'std.'), ...idsWithPrefix(rec, 'kw.')]
      for (const s of strings) if (s !== rec.id && REF.test(s) && !exists(s)) errors.push(`${f.path}: ${String(rec.id)}: V-04 reference ${s} does not resolve`)
    }
  }
  const slotKey = (k: string, at: string) => {
    if (!bundle.slots[k]) errors.push(`${at}: V-19 unknown upgrade slot ${k}`)
  }
  const rankKey = (k: string, at: string) => {
    if (!bundle.ranks[k]) errors.push(`${at}: V-19 unknown rank ${k}`)
  }
  const unitTypeKey = (k: string, at: string) => {
    if (k !== 'trooper-any' && !bundle.unitTypes[k]) errors.push(`${at}: V-19 unknown unit type ${k}`)
  }
  const factionKey = (k: string, at: string) => {
    if (!bundle.factions[k]) errors.push(`${at}: V-04 unknown faction ${k}`)
  }
  for (const u of Object.values(bundle.units)) {
    factionKey(u.faction, u.id)
    rankKey(u.rank, u.id)
    unitTypeKey(u.unitType, u.id)
    u.upgradeBar.forEach((s) => slotKey(s, u.id))
    if (!bundle.bases[u.base]) errors.push(`${u.id}: V-04 unknown base ${u.base}`)
    u.weapons.forEach((w) => !bundle.weapons[w] && errors.push(`${u.id}: V-04 unknown weapon ${w}`))
    const det = u.keywords.find((k) => k.id === 'kw.detachment')
    if (det?.param && !bundle.units[det.param]) errors.push(`${u.id}: V-04 Detachment names unknown unit ${det.param}`)
  }
  for (const w of Object.values(bundle.weapons)) w.keywords.forEach((k) => !bundle.keywords[k.id] && errors.push(`${w.id}: V-04 unknown keyword ${k.id}`))
  for (const up of Object.values(bundle.upgrades)) {
    slotKey(up.slot, up.id)
    up.grantsSlots?.forEach((s) => slotKey(s, up.id))
    up.restrictions?.ranks?.forEach((r) => rankKey(r, up.id))
    up.restrictions?.unitTypes?.forEach((t) => unitTypeKey(t, up.id))
    if (up.restrictions?.faction) factionKey(up.restrictions.faction, up.id)
    if (up.addsMinis?.weapon && !bundle.weapons[up.addsMinis.weapon]) errors.push(`${up.id}: V-04 unknown weapon ${up.addsMinis.weapon}`)
    // V-18
    if (up.sides && up.sides.length !== 2) errors.push(`${up.id}: V-18 a two-sided upgrade has exactly two sides`)
    if (up.sides && !up.flip) errors.push(`${up.id}: V-18 sides need a flip rule`)
    if (up.flip && !up.sides) errors.push(`${up.id}: V-18 flip without sides`)
  }
  for (const c of Object.values(bundle.commandCards)) {
    if (c.faction) factionKey(c.faction, c.id)
    c.orders.filter?.ranks?.forEach((r) => rankKey(r, c.id))
    c.orders.filter?.unitTypes?.forEach((t) => unitTypeKey(t, c.id))
    if (c.pips === 4 && !c.returnsToHand) errors.push(`${c.id}: V-04 a 4-pip card must be Standing Orders (returnsToHand)`)
  }
  for (const l of Object.values(bundle.armyLists)) {
    factionKey(l.faction, l.id)
    if (!bundle.formats[l.format]) errors.push(`${l.id}: V-04 unknown format ${l.format}`)
    l.units.forEach((e) => {
      if (!bundle.units[e.unit]) errors.push(`${l.id}: V-04 unknown unit ${e.unit}`)
      e.upgrades.forEach((u) => !bundle.upgrades[u] && errors.push(`${l.id}: V-04 unknown upgrade ${u}`))
    })
    l.commandHand.forEach((c) => !bundle.commandCards[c] && errors.push(`${l.id}: V-04 unknown command card ${c}`))
  }
  for (const f of Object.values(bundle.formats)) Object.keys(f.ranks).forEach((r) => rankKey(r, f.id))
  for (const t of Object.values(bundle.unitTypes)) {
    if (!bundle.bases[t.base]) errors.push(`${t.id}: V-04 unknown base ${t.base}`)
    if (!bundle.silhouettes[t.silhouette]) errors.push(`${t.id}: V-04 unknown silhouette ${t.silhouette}`)
  }
  for (const b of Object.values(bundle.bases)) if (!bundle.silhouettes[b.silhouette]) errors.push(`${b.id}: V-04 unknown silhouette ${b.silhouette}`)
  for (const r of Object.values(bundle.ranks)) if (!bundle.tokens[r.orderToken]) errors.push(`${r.id}: V-19 unknown order token ${r.orderToken}`)

  // V-09 keyword references
  for (const f of manifest) {
    for (const rec of recordsOf(f)) {
      for (const ref of keywordRefs(rec)) {
        const kw = bundle.keywords[ref.id]
        const at = `${f.path}: ${String(rec.id)}`
        if (!kw) {
          errors.push(`${at}: V-09 unknown keyword ${ref.id}`)
          continue
        }
        if (kw.param === 'x' && typeof ref.x !== 'number') errors.push(`${at}: V-09 ${ref.id} needs x`)
        if (kw.param !== 'x' && ref.x !== undefined) errors.push(`${at}: V-09 ${ref.id} takes no x`)
        const wantsParam = kw.param === 'rank' || kw.param === 'unitType' || kw.param === 'unit'
        if (wantsParam && typeof ref.param !== 'string') errors.push(`${at}: V-09 ${ref.id} needs a ${kw.param} param`)
        if (!wantsParam && ref.param !== undefined) errors.push(`${at}: V-09 ${ref.id} takes no param`)
        if (kw.param === 'rank' && typeof ref.param === 'string') rankKey(ref.param, at)
        if (kw.param === 'unitType' && typeof ref.param === 'string') unitTypeKey(ref.param, at)
        if (kw.param === 'unit' && typeof ref.param === 'string' && !bundle.units[ref.param]) errors.push(`${at}: V-09 ${ref.id} param ${ref.param} is not a unit`)
      }
    }
  }
  for (const kw of Object.values(bundle.keywords) as KeywordData[]) {
    if (usesX(kw.effects) && kw.param !== 'x') errors.push(`${kw.id}: V-09 effects use X but the keyword has no X parameter`)
    if (kw.param === 'x' && !usesX(kw.effects) && !kw.effects.some((e) => 'unimplemented' in e || 'native' in e || 'code' in e)) errors.push(`${kw.id}: V-09 takes X but never uses it`)
  }

  // V-10 weapons and dice
  for (const w of Object.values(bundle.weapons) as WeaponData[]) {
    if (w.range.min > w.range.max) errors.push(`${w.id}: V-10 range min ${w.range.min} is above max ${w.range.max}`)
    if (w.dice.red + w.dice.black + w.dice.white < 1) errors.push(`${w.id}: V-10 empty dice pool`)
  }
  for (const [colour, die] of Object.entries({ ...Object.fromEntries(Object.entries(bundle.dice.attack).filter(([k]) => k !== 'faceOrder').map(([k, v]) => [`attack ${k}`, v])), ...Object.fromEntries(Object.entries(bundle.dice.defence).filter(([k]) => k !== 'faceOrder').map(([k, v]) => [`defence ${k}`, v])) })) {
    const d = die as { sides: number; faces: Record<string, number> }
    const sum = Object.values(d.faces).reduce((a, b) => a + b, 0)
    if (sum !== d.sides) errors.push(`core/dice.json: V-10 ${colour} die faces sum to ${sum}, not ${d.sides}`)
  }
  for (const [kind, order] of [['attack', bundle.dice.attack.faceOrder], ['defence', bundle.dice.defence.faceOrder]] as const) {
    const faces = Object.keys((bundle.dice[kind].red as { faces: object }).faces)
    if (JSON.stringify(faces) !== JSON.stringify(order)) errors.push(`core/dice.json: V-10 ${kind} faceOrder ${order.join(',')} does not match the face table order ${faces.join(',')}`)
  }
  if (bundle.constants.values.maxBand > 5) errors.push('core/constants.json: V-10 at most 5 range bands')

  // V-11 / V-12 / V-24 lists
  for (const l of Object.values(bundle.armyLists) as ArmyListData[]) {
    errors.push(...armyListProblems(bundle, l).map((m) => `V-11/12/24 ${m}`))
  }

  // V-13 battle decks
  const cards = Object.values(bundle.battleCards) as BattleCardData[]
  for (const fmt of Object.values(bundle.formats)) {
    const deck = cards.filter((c) => c.format === fmt.id)
    if (deck.length === 0) {
      if (fmt.playable) errors.push(`${fmt.id}: V-13 format is playable but has no battle deck`)
      continue
    }
    for (const type of ['objective', 'secondary', 'advantage'] as const) {
      const n = deck.filter((c) => c.type === type).length
      if (n !== 3) errors.push(`${fmt.id}: V-13 ${n} ${type} cards, a deck needs 3`)
    }
    for (const c of deck) {
      if (c.type === 'objective') {
        const m = c.map ? bundle.maps[c.map] : undefined
        if (!m) errors.push(`${c.id}: V-13 objective needs a ${fmt.id} map`)
        else if (m.format !== fmt.id) errors.push(`${c.id}: V-13 map ${m.id} belongs to ${m.format}`)
      } else if (c.map) errors.push(`${c.id}: V-13 only objectives have maps`)
      if (c.faction) factionKey(c.faction, c.id)
    }
  }

  // V-14 maps and tags, V-15 / V-22 layouts
  for (const m of Object.values(bundle.maps) as MapData[]) {
    const fmt = bundle.formats[m.format]
    if (!fmt) errors.push(`${m.id}: V-04 unknown format ${m.format}`)
    else mapProblems(m, fmt.table, errors)
  }
  for (const c of cards) {
    if (!c.map || !bundle.maps[c.map]) continue
    const tags = new Set(bundle.maps[c.map].pois.flatMap((p) => p.tags))
    const used: string[] = []
    const scan = (n: unknown) => {
      if (Array.isArray(n)) n.forEach(scan)
      else if (n && typeof n === 'object') {
        for (const [k, v] of Object.entries(n)) {
          if ((k === 'tag' || k === 'notTag') && typeof v === 'string') used.push(v)
          else scan(v)
        }
      }
    }
    scan(c.scoring)
    scan(c.setup)
    for (const t of used) if (!tags.has(t)) errors.push(`${c.id}: V-14 uses POI tag "${t}" that map ${c.map} does not define`)
  }
  for (const l of Object.values(bundle.layouts) as LayoutData[]) {
    layoutProblems(l, (Object.values(bundle.maps) as MapData[]).filter((m) => m.format === l.format), errors)
    if (!bundle.formats[l.format]) errors.push(`${l.id}: V-04 unknown format ${l.format}`)
  }

  // V-17 effects (windows, modifiers, limits and durations are enums in the schema; verbs are checked here)
  for (const f of manifest) {
    for (const rec of recordsOf(f)) verbProblems(rec, `${f.path}: ${String(rec.id)}`, errors)
  }

  // V-05 / V-20 / V-21 / V-25 playable reach
  const roots: Id[] = []
  const playableFactions = Object.values(bundle.factions).filter((x) => x.playable)
  for (const fac of playableFactions) {
    for (const u of Object.values(bundle.units) as UnitData[]) if (u.faction === fac.id) roots.push(u.id)
    for (const l of Object.values(bundle.armyLists) as ArmyListData[]) if (l.faction === fac.id) roots.push(l.id)
  }
  for (const fmt of Object.values(bundle.formats)) if (fmt.playable) for (const c of cards) if (c.format === fmt.id) roots.push(c.id)
  for (const m of Object.values(bundle.maps) as MapData[]) if (bundle.formats[m.format]?.playable) roots.push(m.id)
  const reach = new Set<Id>()
  const queue = [...roots]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (reach.has(id) || !exists(id)) continue
    reach.add(id)
    const rec = bundle.byId[id]
    for (const prefix of ['emp.', 'reb.', 'neu.', 'core.', 'rec.', 'std.', 'kw.']) for (const s of idsWithPrefix(rec, prefix)) if (exists(s) && !reach.has(s)) queue.push(s)
  }
  for (const id of [...reach].sort()) {
    for (const reason of unimplementedIn(bundle.byId[id])) errors.push(`${id}: V-05 reachable from a playable faction or deck but marked unimplemented (${reason})`)
  }
  const fanBacklog: string[] = []
  for (const id of [...reach].sort()) {
    const rec = bundle.byId[id] as unknown as { source?: Source | Source[]; points?: number }
    if (!rec.source) continue
    const srcs = sourcesOf(rec.source)
    const isUnitOrUpgrade = id.includes('.u.') || id.includes('.up.')
    if (isUnitOrUpgrade && !srcs.some((s) => s.kind === 'primary')) errors.push(`${id}: V-25 no primary source before the faction is playable (points and printed numbers)`)
    if (isUnitOrUpgrade && rec.points !== undefined && !srcs.some((s) => s.kind === 'primary' && (!s.covers || s.covers.includes('points') || s.covers.includes('stats')))) {
      errors.push(`${id}: V-25 points have no primary source`)
    }
    if (!hasPrimary(rec.source) || srcs.some((s) => s.kind === 'fan' && s.covers)) fanBacklog.push(id)
  }
  if (fanBacklog.length > 0) warnings.push(`V-21 ${fanBacklog.length} reachable records rest partly on Legion HQ data only: ${fanBacklog.join(', ')}`)
  for (const fac of playableFactions) {
    for (const u of Object.values(bundle.units) as UnitData[]) if (u.faction === fac.id && !u.figure?.archetype) errors.push(`${u.id}: V-20 no figure archetype`)
    for (const w of Object.values(bundle.weapons) as WeaponData[]) if (w.id.startsWith(`${fac.prefix}.`) && !w.flavour) errors.push(`${w.id}: V-20 no flavour`)
  }

  // V-06 code hooks
  const usage = new Map<string, Set<string>>()
  for (const f of manifest) for (const rec of recordsOf(f)) for (const name of codesIn(rec)) usage.set(name, (usage.get(name) ?? new Set()).add(String(rec.id)))
  const hooks: HookUse[] = [...usage.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, ids]) => ({ name, usedBy: [...ids].sort(), registered: options.registeredCodes?.has(name) ?? false }))
  const pending = hooks.filter((h) => !h.registered)
  if (pending.length > 0) {
    if (options.allowPendingCodes) warnings.push(`V-06 ${pending.length} code hooks pending (engine registry lands in M2): ${pending.map((h) => h.name).join(', ')}`)
    else for (const h of pending) errors.push(`${h.usedBy.join(', ')}: V-06 code hook ${h.name} is not registered`)
  }

  // V-16 prose
  const sourcesDir = options.sourcesDir === undefined ? DEFAULT_SOURCES : options.sourcesDir
  if (sourcesDir && fs.existsSync(sourcesDir)) checkProse(bundle, sourcesDir, errors)

  // V-03 (name and source presence are required by the schemas; kept as an explicit sweep for records the schemas do not cover)
  for (const rec of all) {
    const r = rec as unknown as { name?: string; source?: unknown; sources?: Record<string, unknown>; values?: Record<string, number> }
    if (!r.source && !r.sources) errors.push(`${String((rec as { id: string }).id)}: V-03 no source`)
    if (r.values && r.sources) for (const k of Object.keys(r.values)) if (!(k in r.sources)) errors.push(`${String((rec as { id: string }).id)}: V-03 constant ${k} has no source`)
    if (r.name !== undefined && r.name.trim() === '') errors.push(`${String((rec as { id: string }).id)}: V-03 empty name`)
  }

  return { errors, warnings, files: manifest.length, records, hooks, summaries, bundle }
}
