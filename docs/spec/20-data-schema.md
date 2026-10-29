# 20 - Data schema

All game content is declarative JSON under `src/data/`, validated by `tools/validate-data.ts` (also run by `tests/data/*.test.ts`) against JSON Schema 2020-12 files in `src/data/schema/`, and typed by hand in `src/data/types.ts`. Every record has an `id`, a display `name` and a `source`. All prose (`text`) is our own wording, never AMG, FFG or Lucasfilm text; names of units, weapons, keywords and cards may match the game.

**Freeze rule: this schema is a draft until the M1 dry run has encoded every slice record** (the 9 unit records, their weapons, every upgrade in the `14-armies.md` 2.3 and 3.3 tables, the named, faction and generic command cards of both hands, the 40 keywords plus Ion X, the 9 Recon battle cards and 3 Recon maps, the core files, one Recon layout and the four Recon lists). Shape changes found by the dry run are made then; after the dry run the schema freezes and later changes are additive with a row in `00-architecture.md` section 11.

Content lives in `14-armies.md` (units, upgrades, cards, keywords) and `11-battle.md` (formats, battle cards, maps). Where they disagree on shape this file wins; on content they win.

## 1. File layout

| Path | Def (`<schema>#/$defs/<def>`) | Content |
|---|---|---|
| `core/dice.json` | `core#/dice` (one object) | attack d8 red/black/white and defence d6 red/white face tables; upgrade/downgrade ladders |
| `core/ranks.json` | `core#/rank[]` | commander, operative, corps, special-forces, support, heavy: name, order-token kind, icon key |
| `core/formats.json` | `core#/format[]` | `recon` and `standard`: max points, rank min/max, table size, rounds, instant-win VP, deck kind (`fixed` or `perPlayer`), blue-player method, edge choice |
| `core/tokens.json` | `core#/token[]` | aim, dodge, surge, standby, suppression, observation, wound, order, commander, advantage, intel, marked-target, vanguard, objective kinds (poi, asset), advantage-card tokens; per token: lifetime, cap, removed-in-End-phase flag, size in inches |
| `core/bases.json` | `core#/base[]` | base sizes (small 27 mm in v1; medium, large, huge, notched later) with diameter in mm and the silhouette each uses |
| `core/silhouettes.json` | `core#/silhouette[]` | small and large trooper silhouette cylinders (radius and height in inches) and LOS sample-point layout |
| `core/constants.json` | `core#/constants` | range band 6", half range 3", max band 5, contact epsilon, cohesion distance and vertical rule, standby range, backup range, commander courage range, height-band size |
| `core/movement-tool.json` | `core#/movementTool` | speed-1/2/3 tool segment lengths, hinge position, prong width (measured, Unsourced until checked) |
| `core/actions.json` | `core#/action[]` | move, attack, aim, dodge, recover, standby, withdraw, climb, claim (battle), with `free`, repeat and restriction rules |
| `core/unit-types.json` | `core#/unitType[]` | trooper, wookiee-trooper, ... with base default and rule flags (barricade cover, withdraw-attack) |
| `core/upgrade-slots.json` | `core#/slot[]` | force, command, training, gear, grenades, comms, heavy-weapon, personnel, ... (icon key, display name) |
| `keywords.json` | `keyword#/keyword[]` | every keyword the data uses (`14-armies.md` section 4): param kind, window or modifier, effect, or `{"code"}` / `{"unimplemented"}` |
| `armies/<faction>/faction.json` | `army#/faction` | id, name, `playable`, force affinity default, icon key |
| `armies/<faction>/units.json` | `army#/unit[]` | unit cards |
| `armies/<faction>/weapons.json` | `army#/weapon[]` | weapons on unit cards and on that faction's upgrades |
| `armies/<faction>/upgrades.json` | `army#/upgrade[]` | faction upgrade cards |
| `armies/<faction>/command-cards.json` | `army#/commandCard[]` | faction and character command cards |
| `armies/<faction>/lists.json` | `army#/armyList[]` | pre-built lists (the four Recon lists of `14-armies.md`) |
| `armies/neutral/{weapons,upgrades,command-cards}.json` | as above | generic upgrades (Force, command, training, gear, grenades, comms) and generic command cards (Ambush, Push, Assault, Standing Orders) |
| `battle/recon/{objectives,secondaries,advantages,maps}.json` | `battle#/battleCard[]`, `battle#/map[]` | the fixed Recon deck |
| `battle/standard/{objectives,secondaries,advantages,maps}.json` | same | the Standard card pool |
| `layouts/<id>.json` | `layout#/layout` | terrain layouts per format (36x36 Recon, 72x36 Standard) |
| `schema/*.schema.json` | - | `common`, `core`, `keyword`, `army`, `battle`, `layout` |
| `index.ts`, `manifest.ts` | - | `loadBundle(): DataBundle` (byId maps, `dataVersion`), `CODE_HOOKS` usage list, manifest of every file and its def; area indexes `core/index.ts`, `armies/index.ts`, `battle/index.ts`, `layouts/index.ts` so parallel stages never edit the same index |

Note: `05-migration.md` sketches `units/`, `cards/` and `terrain/` folders and "objective, deployment, condition" battle cards; that is superseded here. Deployment and Condition cards are FFG-era and on the edition leak list; current battle cards are Objective, Secondary, Advantage and Map.

## 2. Ids

Lowercase kebab, dot-namespaced by owner: `core.die.atk-red`, `core.rank.corps`, `core.token.dodge`, `core.base.small`, `core.w.unarmed-black`, `kw.precise`, `emp.u.stormtroopers`, `emp.w.e11`, `emp.up.stormtrooper-squad`, `emp.cc.implacable`, `emp.list.recon-a`, `reb.*`, `neu.up.force-push`, `neu.cc.standing-orders`, `rec.obj.bunker-assault`, `rec.sec.surface-scan`, `rec.adv.advanced-intel`, `rec.map.bunker-assault`, `std.obj.payload`, `lay.recon.forest-1`. Faction prefixes: `emp` (Galactic Empire), `reb` (Rebel Alliance), `neu` (any faction); later `rep`, `sep`, `mer`. The display `name` is the only string the client shows (CLAUDE.md conventions); ids never reach the screen.

## 3. Shared primitives (`common.schema.json`)

| Def | Shape |
|---|---|
| `Id` | pattern `^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$` |
| `Name` | non-empty string (display name) |
| `Text` | own-words prose; optional on most records |
| `Source` | `{ doc: string, page?: integer \| string, url?: string, kind: "primary" \| "fan", checked?: string, covers?: string[] }`; `page` or `url` required; `doc` is a key of `docs/spec/sources.md` or a short key used in the content specs (`CRB`, `RECON`, `BC`, `EU`, `RU`, `EUP`, `RUP`, `GUP`, `EC`, `RC`, `ERR`, `LHQ`) or `"own design"` (layouts only); `checked` records an eye check (`"by-eye 2026-10-29"`); `covers` lists the fields this source vouches for when a record has several sources |
| `Sources` | `Source` or a non-empty array of `Source` (stats from the card, points from ERR) |
| `Inches` | number, rounded to 0.001 |
| `Band` | integer 0-5 (0 = melee) or `"beyond"` |
| `DicePool` | `{ red: int>=0, black: int>=0, white: int>=0 }`, at least one die |
| `DefenceDie` | `"red" \| "white"` |
| `SurgeChart` | `{ attack: null \| "hit" \| "crit", defence: null \| "block" }` |
| `KeywordRef` | `{ id: Id, x?: integer, param?: string \| Id }` (`x` for "X" keywords, `param` for Compel's rank/type or Detachment's unit) |
| `Vec2` `{x, z}`; `Polygon` (3+ `Vec2`, counter-clockwise seen from above) | |
| `TimingWindowId` | enum of `00-architecture.md` section 4 plus additive rows (`attack.declaring`) |
| `Condition`, `Effect`, `Modifier`, `Expr` | section 5 |
| `CodeRef` | `{ code: string (camelCase), params?: object }` |
| `Unimplemented` | `{ unimplemented: string }` (the reason) |

## 4. Core files

### 4.1 Dice (`core/dice.json`)

```json
{ "id": "core.dice",
  "attack": {
    "red":   { "sides": 8, "faces": { "hit": 5, "crit": 1, "surge": 1, "blank": 1 } },
    "black": { "sides": 8, "faces": { "hit": 3, "crit": 1, "surge": 1, "blank": 3 } },
    "white": { "sides": 8, "faces": { "hit": 1, "crit": 1, "surge": 1, "blank": 5 } } },
  "defence": {
    "red":   { "sides": 6, "faces": { "block": 3, "surge": 1, "blank": 2 } },
    "white": { "sides": 6, "faces": { "block": 1, "surge": 1, "blank": 4 } } },
  "ladder": { "attack": ["white", "black", "red"], "defence": ["white", "red"] },
  "faceOrder": "faces are indexed in the order listed, so ScriptedRng scripts name face indexes",
  "source": { "doc": "primer", "page": "Dice", "kind": "fan", "checked": "Unsourced: check physical dice" } }
```
Face counts are Unsourced (no AMG document lists them); the validator checks each die's face counts sum to `sides`.

### 4.2 Formats (`core/formats.json`)

```json
{ "id": "recon", "name": "Recon", "maxPoints": 600,
  "ranks": { "commander": [1, 1], "operative": [0, 1], "corps": [2, 4],
             "special-forces": [0, 2], "support": [0, 2], "heavy": [0, 1] },
  "table": { "x": 36, "z": 36 }, "rounds": 5, "instantWinVp": 12,
  "deck": "fixed", "bluePlayer": "redDefenceDie", "edgeChoice": "any", "missionModification": false,
  "source": { "doc": "RECON", "page": 2, "kind": "primary" } }
```
Standard: `maxPoints` 1000, ranks 1-2 / 0-2 / 3-6 / 0-3 / 0-3 / 0-2, table 72 x 36, `deck: "perPlayer"`, `bluePlayer: "fourBlackDice"`, `edgeChoice: "long"`, `missionModification: true` [CRB p16-19].

### 4.3 Other core records (shapes)

- `rank`: `{ id, name, orderToken: Id, icon: string, source }`.
- `token`: `{ id, name, lifetime: "endPhase" | "activation" | "untilRemoved" | "game", cap?: int, sizeIn?: Inches, kind: "unit" | "objective" | "advantage" | "card", source }`.
- `base`: `{ id, name, diameterMm: number, notched: boolean, silhouette: Id, source }`; v1 has only `core.base.small` (27 mm).
- `silhouette`: `{ id, name, radiusIn: Inches, heightIn: Inches, samples: { rings: int, perRing: int }, source }` (template dimensions measured; Unsourced).
- `constants`: one object with named numbers; every number has a `source` entry in a sibling `sources` map (`{ "rangeBand": {doc: "CRB", page: 11, kind: "primary"} }`).
- `movementTool`: `{ speeds: { "1": { segments: [Inches, Inches], hingeAt: Inches }, "2": ..., "3": ... }, prongWidthIn, source }`.
- `action`: `{ id, name, free: boolean, repeat: "once" | "unlimited", restrictions: Condition[], source }`.
- `unitType`: `{ id, name, base: Id, silhouette: Id, flags: { barricadeCover: boolean, attackAfterWithdraw: boolean, ... }, source }`.

## 5. Effects grammar

Keywords, upgrades, command cards and battle cards share one grammar. An entry in an `effects` array is exactly one of: a **trigger**, a **modifier**, a **grant**, a `CodeRef`, or an `Unimplemented`.

### 5.1 Trigger

```json
{ "trigger": { "window": "move.ended", "self": true },
  "when": { "moveKind": "standard", "fromAction": true },
  "do": [ { "gainToken": { "token": "core.token.dodge", "n": { "x": true } } } ],
  "scope": "self", "duration": "instant", "optional": false, "limit": "unlimited" }
```

- `trigger`: `{ window: TimingWindowId }` or `{ event: GameEvent type }` (e.g. `SuppressionChanged`, `UnitDefeated`, `OrderIssued`), plus `self: true` (only for this unit's own window) or `aura: { range: Band, side: "ally" | "enemy", filter?: UnitFilter, excludeSelf?: boolean }`.
- `when` (Condition): all keys optional, ANDed. Keys: `attackKind` (`ranged` | `melee`), `role` (`attacker` | `defender`), `spent` (`{ token, min }` in this attack), `poolOnly` (weapon keyword id), `unitMoved` (bool, this activation), `order` (`faceUp` | `none`), `rank` (Id or list), `unitType`, `suppressed`, `panicked`, `within` (`{ range, of: "leader" | Id }`), `defenderHasKeyword`, `defenderIsVehicle`, `round` (`{ min?, max? }`), `firstOfRound` (bool), `contesting` (token filter), `holding` (asset id), `moveKind` (`standard` | `climb` | `jump` | `deploy`), `fromAction` (bool), `startedMelee` (bool), `poolHasWeapon` (Id), `byThisCard` (bool), `phase`.
- `do` (Effect list), verbs: `gainToken {token, n}`, `removeToken {token, n | "all", distribute?: { range, side, chooser: "owner" }}`, `grantKeyword {keyword: KeywordRef, duration}`, `grantFreeAction {action, weapons?: "melee" | "ranged", target?: "engaged" | "lastDefender", ignoreAttackLimit?}`, `extraAction {n}`, `fewerActions {n}`, `sufferWounds {n, who}`, `dealWounds {to: "attacker", amount: Expr}`, `upgradeDice {n, weapons?}`, `downgradeDice {n | "all", weapons?}`, `convertSurge {to, max}`, `changeResult {from, to, max}`, `cancelResult {result, max}`, `rollDice {die, n: Expr, per?: "figure", outcome: {face: verb}}`, `readyCards {slot, max}`, `addPassToken {n}`, `orderTokenTo {where: "pool"}`, `chooseUnits {n, filter, then: Effect[]}`, `placeToken {token, region, by}`, `code`.
- `scope`: `self` | `pool` (or `{ pool: "all" | "otherRangedWeapons" | "thisWeapon" }`) | `attack` | `chosen` | `aura` (with the trigger's aura).
- `duration`: `instant` | `attack` | `activation` | `round` | `game` | `whileInPlay`; timed results go to `state.effects` (`effects.ts`) and expire there.
- `optional: true` makes the engine raise `keyword.choice` / `card.choice` / `battle.choice` when the trigger fires and the effect is usable (never auto-applied, `00-architecture.md` settled items).
- `limit`: `unlimited` | `oncePerAttack` | `oncePerActivation` | `oncePerRound` | `oncePerGame` | `{ perRound: n }` | `{ perGame: n }`.

### 5.2 Modifier

A passive number change that the owning step reads; no window.

```json
{ "modifier": "coverPool", "op": "add", "value": -1, "then": { "addResult": "block", "n": 1 }, "scope": "self" }
```

Modifier names (closed list, extended additively): `coverPool`, `coverValue`, `rallyDie`, `aimRerolls`, `pierceAllowed`, `dodgeAllowed`, `targetableFrom` (max band), `canContest`, `canBackup`, `moveSpeed`, `climbHeight`, `difficultTerrain`, `defenceSurge`, `attackSurge`, `defenceDice`, `courage`, `cohesionRange`, `orderLimit`, `endPhaseSuppressionRemoval`, `panicImmuneAura`. `op`: `add` | `set` | `min` | `max`; `value`: number or `Expr`; optional `when` and `scope` as for triggers. `query.*` reports every modifier that changed a number (for the "why" text in the UI).

### 5.3 Grant

`{ "grant": { "action": { id, name, kind: "card" | "free", effects: [...] } } }` adds a card action or free action (Jump X, Data Recovery, Force Choke's action, Claim); `{ "grant": { "slot": "training" } }` adds an upgrade icon.

### 5.4 Expr

`number` | `{ "x": true }` (the keyword's X) | `{ "stat": "courage" }` | `{ "tokens": "core.token.suppression" }` | `{ "sub": [Expr, Expr], "min"?: number }` | `{ "count": "woundsSuffered" }`. Nothing else; anything richer is a code hook.

### 5.5 Examples (slice)

```json
{ "id": "kw.precise", "name": "Precise", "param": "x",
  "effects": [ { "modifier": "aimRerolls", "op": "add", "value": { "x": true }, "scope": "self" } ],
  "text": "Each Aim token spent lets the unit reroll X more dice.",
  "source": { "doc": "CRB", "page": 53, "kind": "primary" } }

{ "id": "kw.deflect", "name": "Deflect", "param": "none",
  "effects": [ { "code": "deflect" } ],
  "text": "Against ranged attacks its defence surges become blocks, and the attacker takes a wound if any surge was rolled.",
  "source": { "doc": "CRB", "page": 49, "kind": "primary" } }

{ "id": "kw.ion", "name": "Ion", "param": "x",
  "effects": [ { "unimplemented": "no vehicle or droid unit in v1; returns with M2b" } ],
  "source": { "doc": "CRB", "page": 59, "kind": "primary" } }
```

## 6. Unit (`army#/unit`)

```json
{ "id": "emp.u.stormtroopers", "name": "Stormtroopers", "subtitle": null, "faction": "empire",
  "rank": "corps", "unitType": "trooper", "unique": false, "points": 42,
  "minis": 4, "wounds": 1, "defence": "red", "courage": 1, "speed": 2,
  "surge": { "attack": "hit", "defence": null },
  "base": "core.base.small",
  "weapons": ["emp.w.bludgeon", "emp.w.e11"],
  "keywords": [ { "id": "kw.precise", "x": 1 } ],
  "upgradeBar": ["heavy-weapon", "personnel", "gear", "grenades"],
  "forceAffinity": null,
  "figure": { "archetype": "stormtrooper" },
  "source": [ { "doc": "EU", "page": 1, "kind": "primary", "checked": "by-eye 2026-10-29" },
              { "doc": "LHQ", "url": "legionhq2 bundle id ay", "kind": "fan", "covers": ["upgradeBar"] } ] }
```

- `courage`: integer or `null` for "-" (never suppressed; panic aura when Commander, `14-armies.md` 2.6).
- `minis`: the printed count; added figures come from upgrades. `unique` is the bullet; `subtitle` names versions (rules may reference it).
- `forceAffinity`: `"dark" | "light" | null` (Force upgrade restrictions); faction default from `faction.json`.
- `figure.archetype` names the client figure (30-figures, later); it is the only client-facing field without rules meaning and is exempt from V-08.

## 7. Weapon (`army#/weapon`)

```json
{ "id": "emp.w.dlt19x", "name": "DLT-19x Sniper Rifle",
  "range": { "min": 2, "max": 5 }, "dice": { "red": 0, "black": 2, "white": 1 },
  "keywords": [ { "id": "kw.high-velocity" }, { "id": "kw.overwhelm" }, { "id": "kw.sniper-team" } ],
  "flavour": "blaster-heavy",
  "source": { "doc": "EUP", "page": 4, "kind": "primary", "checked": "by-eye 2026-10-29" } }
```

- `range.min` 0 = melee; a weapon with `min 0` and `max >= 1` is both melee and ranged (Saboteur charges). Kind is derived, never stored.
- `flavour` (client sound/vfx family) is required and exempt from V-08 like `figure`.
- Weapons shared by many units (Unarmed with 1 black) live once in `armies/neutral/weapons.json` as `core.w.unarmed-black`.

## 8. Upgrade (`army#/upgrade`)

```json
{ "id": "emp.up.sonic-charge-saboteur", "name": "Sonic Charge Saboteur", "slot": "heavy-weapon",
  "points": 17, "unique": false,
  "restrictions": { "units": ["emp.u.scout-troopers"] },
  "addsMinis": { "count": 1, "label": "Sonic Charge Saboteur", "weapon": "emp.w.sonic-charge" },
  "exhaust": "none",
  "effects": [ { "trigger": { "window": "attack.poolFormed", "self": true },
                 "when": { "poolHasWeapon": "emp.w.sonic-charge" },
                 "do": [ { "grantKeyword": { "keyword": { "id": "kw.assault", "x": 1 }, "duration": "attack" } } ],
                 "scope": { "pool": "otherRangedWeapons" } } ],
  "source": { "doc": "EUP", "page": 4, "kind": "primary", "checked": "by-eye 2026-10-29" } }
```

- `slot`: an id from `core/upgrade-slots.json`. `restrictions`: `{ units?, unitTypes?, ranks?, faction?, forceAffinity?, hasKeyword?, not? }` (all ANDed; `units` is an OR list).
- `addsMinis`: `{ count, label, weapon?, leader?: boolean, persistent?: { keywords, modifiers } }` (the Squad's Indomitable and range-1 cohesion persist after its figures die).
- `grantsSlots`: extra upgrade icons (Captain: training; Specialist: gear).
- `keywords`: keywords the unit gains (Leader on Captain figures; Fear's Demoralize 1).
- `exhaust`: `none` | `exhaust` | `expend`; Recover and Master of the Force ready exhausted cards.
- `sides`: for two-sided cards, `[{ name, keywords, weapons, effects }, ...]` with `flip: { window, optional }` (Battle Shield Wookiee); points counted once.
- `scope` may narrow a pool effect: `{ "pool": "all" | "otherRangedWeapons" | "thisWeapon" }`.

## 9. Command card (`army#/commandCard`)

```json
{ "id": "reb.cc.my-ally-is-the-force", "name": "My Ally Is the Force", "pips": 2,
  "faction": "rebels",
  "restriction": { "units": ["reb.u.luke-hotr", "reb.u.luke-jedi-knight"], "op": "or" },
  "orders": { "count": 2, "filter": { "unitTypes": ["trooper-any"] } },
  "effects": [ { "trigger": { "event": "OrderIssued" }, "when": { "byThisCard": true },
                 "do": [ { "gainToken": { "token": "core.token.dodge", "n": 1 } } ], "scope": "chosen" } ],
  "source": { "doc": "RC", "page": 4, "kind": "primary", "checked": "by-eye 2026-10-29" } }
```

- `orders`: `{ named?: [Id] (the card's character must be among the ordered), count: int (additional units), filter?: { ranks?, unitTypes?, units? } }`; "Luke Skywalker & 2 units" = `named: [luke], count: 2`.
- `restriction`: `null` for generic cards; `op: "or" | "and"` per R-3.3; a restriction may name a subtitle (`I Am a Jedi`: Jedi Knight only, per ERR).
- `keywords`: `["permanent"]`, `["divulge"]`; `divulge: { window, effects }`; `returnsToHand: true` for Standing Orders.

## 10. Battle cards, maps, layouts

### 10.1 Battle card (`battle#/battleCard`)

```json
{ "id": "rec.obj.close-the-pocket", "name": "Close the Pocket", "type": "objective",
  "format": "recon", "faction": null, "map": "rec.map.close-the-pocket",
  "setup": [ { "placeFromMap": { "token": "poi", "label": "Stockpile" } } ],
  "scoring": [ { "at": "end.scoring", "fromRound": 2,
                 "count": { "tokens": { "tag": "centre" }, "state": "secured" }, "vp": 2 },
               { "at": "end.scoring", "fromRound": 2,
                 "count": { "tokens": { "notTag": "centre" }, "state": "secured" }, "vp": 1 } ],
  "special": [],
  "text": "Hold the three supply dumps; the middle one is worth double.",
  "source": { "doc": "RECON", "page": "PDF p5", "kind": "primary", "checked": "by-eye 2026-10-29" } }
```

- `type`: `objective | secondary | advantage`; `format`: `recon | standard`; `faction` for faction-locked Advantage cards.
- `setup[]` steps: `placeFromMap {token, label}`, `placeByPlayer {token, label, count, region: ["contested" | "allied" | "centre"], minFromEdge?, minFromShortEdge?, withinOfLongEdges?, minApart?, order: "blueFirst"}`, `chooseUnits {who: "each", order: "blueFirst", count, filter, from: "own" | "enemy" | "opponentsPick", grant: {token} | {asset}}`, `placeTerrain {piece, max, region, minApart}`, `cardTokens {n}`, `code`.
- `scoring[]`: `{ at: "end.start" | "end.scoring" | "end.end" | TimingWindowId | {event}, fromRound?, count: Count, vp: number | [{ min, vp }] (step table), cap?: { perRound?, perGame? }, then?: Effect[] }`. `Count`: `{ tokens: TokenFilter, state: "secured" | "contested" | "controlled" | "held", territory?: "allied" | "enemy" | "contested" | "notAllied", completely?: boolean, alsoWithin?: {...} }` or `{ compare: { left: UnitCount, op: ">", right: UnitCount } }` or `{ table: { rows: [{ label, condition, vp: { blue, red } }], trigger, perRound } }` (handled by the `scoringTable` hook).
- `special[]`: triggers, modifiers, grants (Claim, card actions), code refs.
- `grants.claim`: `{ asset, ownerOnly: boolean, maxHeld: int, eligible?: UnitFilter }`.

### 10.2 Map (`battle#/map`)

```json
{ "id": "rec.map.bunker-assault", "name": "Bunker Assault", "format": "recon",
  "territories": {
    "red":  [ [ {"x": -12, "z": -18}, {"x": 12, "z": -18}, {"x": 12, "z": -9}, {"x": -12, "z": -9} ] ],
    "blue": [ [ {"x": -12, "z": 9}, {"x": 12, "z": 9}, {"x": 12, "z": 18}, {"x": -12, "z": 18} ] ] },
  "pois": [ { "id": "b1", "at": {"x": 12, "z": -6}, "tags": ["enemyOf:blue"] },
            { "id": "b2", "at": {"x": 12, "z": 6},  "tags": ["enemyOf:red"] },
            { "id": "b3", "at": {"x": -12, "z": -6}, "tags": ["enemyOf:blue"] },
            { "id": "b4", "at": {"x": -12, "z": 6},  "tags": ["enemyOf:red"] } ],
  "source": { "doc": "RECON", "page": "PDF p5", "kind": "primary", "checked": "by-eye 2026-10-29, +-0.5 in" } }
```
Coordinates are the canonical frame of `11-battle.md` B-5.1 (red edge at -z); the battle's `mapRotation` is applied at game creation.

### 10.3 Layout (`layout#/layout`)

```json
{ "id": "lay.recon.forest-1", "name": "Forest Clearing", "format": "recon",
  "size": { "x": 36, "z": 36 },
  "pieces": [ { "id": "t1", "kind": "area", "footprint": [ ... ], "heightIn": 4.0,
                "cover": "light", "blocksLos": true, "movement": "difficult", "climbable": false } ],
  "source": { "doc": "own design", "page": "-", "kind": "primary" } }
```
`kind`: `area | obstacle | barricade | building`; height band = ceil(heightIn / 6) per the range-tool height rule (CRB p14); props are decoration in the client only.

### 10.4 Army list (`army#/armyList`)

```json
{ "id": "emp.list.recon-a", "name": "Full box", "faction": "empire", "format": "recon",
  "assumedSet": "starter-v1",
  "units": [ { "unit": "emp.u.darth-vader-dlots", "upgrades": [] },
             { "unit": "emp.u.stormtroopers", "upgrades": ["emp.up.stormtrooper-squad", "emp.up.dlt19-stormtrooper"] } ],
  "commandHand": ["emp.cc.implacable", "emp.cc.vaders-might", "emp.cc.new-ways", "emp.cc.fear-and-dead-men",
                  "emp.cc.master-of-evil", "emp.cc.darkness-descends", "neu.cc.standing-orders"],
  "points": 588,
  "source": { "doc": "14-armies.md", "page": "2.5", "kind": "primary" } }
```
`GameSetup.armies[seat]` is built from a list by `src/data/roster.ts` (`armyFromList`).

## 11. `{"code"}` and `{"unimplemented"}` policy

1. Declarative first: use `code` only when section 5 cannot express the rule; add a declarative verb or modifier instead when two or more records would share the code.
2. Shape `{ "code": "<camelCaseName>", "params": { ... } }`, allowed only inside `effects`, `special`, `setup` and `scoring`; never for stats, points, dice or ranges.
3. Registration: core and battle hooks in `src/engine/code-hooks.ts`; faction hooks in `src/engine/armies/<faction>.ts` (imported once by `armies/index.ts`), each with a params validator and a fire counter.
4. Proof: every registered hook has a test that plays a real game fixture until `hookFireCount(name) > 0` (CLAUDE.md, never cut).
5. Hooks never raise decisions from lifecycle points; a choice goes through `keyword.choice`, `card.choice` or `battle.choice` at the next decision point.
6. `{ "unimplemented": "<why>" }` may stand in for any effect, keyword or record; it is legal in data and refused in anything reachable from a playable faction or a playable battle deck (V-05).
7. Slice code hooks: keywords `compel`, `deflect`, `sniperTeam`; cards `implacable`, `vadersMight`, `darknessDescends`, `orderTokenToPool`, `flipCard`; battle `bunkerAssault`, `scoringTable` (Recon), then `relocateSecured`, `entryEdgeRestriction`, `destroyBase`, `ordnanceStrike`, `strafingRun` (Standard).

## 12. Validation rules (`tools/validate-data.ts`)

ajv 8 + ajv-formats, strict, `allErrors`, schemas registered by `$id` (`https://legion-forge.dev/schemas/<name>.schema.json`), `additionalProperties: false` on every object (`unevaluatedProperties: false` where `allOf` composes). Output `ok (<n> records)` or `path: V-xx message`; non-zero exit on any error. Warnings (W) print but do not fail.

| Rule | Check |
|---|---|
| V-01 | Every file listed in a manifest validates against its def; any JSON file under `src/data/` missing from every manifest is an error. |
| V-02 | Ids are unique across the whole bundle and match the owner prefix of their folder (`armies/empire/*` -> `emp.`). |
| V-03 | Every record has a non-empty `name` and a `source` (or `Sources`) with `doc`, `page` or `url`, and `kind`. |
| V-04 | Every reference resolves: unit -> weapons, keywords, base, slots; upgrade -> restriction units, weapon, slots; command card -> restriction units; list -> units, upgrades, cards; battle card -> map, map POI tags; keyword `param` Ids (Detachment unit). |
| V-05 | A faction with `playable: true` reaches no `{"unimplemented"}`: through its units' keywords, weapons and weapon keywords, the upgrades and command cards used by its lists; a battle deck or format marked playable reaches none through its cards. The message names the record and the reason. |
| V-06 | Every `code` name is registered and its `params` pass the hook's validator. |
| V-07 | Every registered hook name appears in a firing test (`tests/engine/code-hooks.test.ts` or the faction's test file lists it); checked by `tests/data/hooks.test.ts`. |
| V-08 | **No field the engine does not interpret**: schemas allow only properties listed in `src/data/fields.ts` (the field-usage registry, each entry naming the engine module that reads it); `tests/data/fields.test.ts` greps `src/engine` and `src/ai` for each listed field. Exempt: `id`, `name`, `text`, `source`, `figure`, `flavour`, `subtitle` (display and provenance). |
| V-09 | Keyword refs: the id exists in `keywords.json`; `x` present exactly when the keyword's `param` is `x`; `param` present exactly when it is `rank`, `unitType` or `unit`. |
| V-10 | Weapons: `range.min <= range.max`; dice pool not empty; at most 5 bands. Dice: face counts sum to `sides`. |
| V-11 | Army lists: total points equal the recomputed sum and are within the format's maximum; rank counts within the format (Detachment units excluded from maximums, each Detachment matched to its own parent unit); unique names capped across card types; each upgrade fits a free slot (granted slots included), meets its restrictions, appears at most once per unit; Heavy Weapon Team units carry a heavy weapon; at most one Leader upgrade per unit. |
| V-12 | Command hands: exactly 7 cards, two each of 1, 2 and 3 pips, no duplicates, Standing Orders included; every restriction satisfied by the list (`or` = one, `and` = all; subtitles respected). |
| V-13 | Battle decks: the Recon deck is exactly 3 objective + 3 secondary + 3 advantage, each objective with a `recon` map; a Standard deck is 3 + 3 + 3 with no duplicates and its 3 maps; faction-locked Advantage cards only in their faction's deck. |
| V-14 | Maps: Territories inside the table, not overlapping each other; POIs inside the table, at least 2" apart (no overlap); every POI tag a card uses exists. |
| V-15 | Layouts: pieces inside the table; footprints valid polygons; no impassable piece fully blocking a player's whole entry edge inside any Territory of any map of that format. |
| V-16 | Prose check: no prose field (`text`) shares a 12-word run with any file in `docs/sources/` (skipped when the folder is absent, e.g. CI). |
| V-17 | Effects: every `window` is a known TimingWindowId, every `modifier` name is in the closed list, every verb known, every `limit` and `duration` valid. |
| V-18 | Two-sided upgrades have exactly two sides; points counted once. |
| V-19 | Every token id used by data exists in `core/tokens.json`; every slot id in `core/upgrade-slots.json`; every rank in `core/ranks.json`. |
| V-20 | Playable faction completeness: every unit has a `figure.archetype` and every weapon a `flavour` (client tests rely on both). |
| V-21 | W: a playable faction or deck with values whose only source is `kind: "fan"` prints the count and record ids (the "check by eye" backlog). |
| V-22 | Every POI position of every map of a format is a legal objective-token spot (R-18.5: not on impassable terrain, not partly over non-area terrain, not on an obstacle of height 2+) in every layout of that format. |
| V-23 | Every display name the client uses comes from data: `tests/client/names.test.ts` fails on a unit, weapon, keyword or card name written as a string literal in `src/client/`. |
| V-24 | Rank, faction and format ids in a list match the list's own `faction` and `format`; a Recon list may not use Standard-only cards and vice versa. |
| V-25 | `points` and every printed number on units, weapons and upgrades carry a source with `kind: "primary"` before the faction is marked playable (ERR counts as primary). |

## 13. Implementer brief (M1)

1. Write the schemas and `fields.ts` first, then the dry run: encode every slice record listed in the freeze rule. Note every shape that did not fit; fix the schema once; then freeze (`00-architecture.md` 11 row).
2. Faction data first with `playable: false`; flip to `true` only when V-05 passes for the four lists.
3. The validator, `index.ts` loader and `roster.ts` are adapted from `legacy/` per `05-migration.md`; keep the ajv set-up, the source check and the code-hook usage list.
4. Keep generic cards and generic upgrades in `armies/neutral/` so a second faction never duplicates them.
