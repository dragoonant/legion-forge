# 05 - Migration from the Mancermundo code base

How the copied Mancermundo (Necromunda) code base in `legacy/` becomes Legion Forge, file by file: what is kept, what is changed, what is thrown away, and which milestone owns each file. Engine contract and module roles are those of `docs/spec/00-architecture.md` (Mancermundo's `docs/spec/00-architecture.md` is the reference until M0 has written ours); the rules content that replaces the Necromunda content is specified in `10-rules-core.md` and the data shapes in `20-data-schema.md`.

## 0. Purpose, boundary and method

**Purpose.** On 2026-10-28 the whole Mancermundo code base was copied into the quarantined folder `legacy/` (`legacy/src/{engine,ai,client,data}`, `legacy/tests`, `legacy/tools`, `legacy/public`): 332 files, 66,545 lines. This file gives every one of them a verdict, a one-line change for Legion, and an owning stage, so an implementer knows what to copy, what to rewrite and what to leave behind without reading the legacy tree.

**Boundary rule.** Nothing in `src/`, `tests/` or `tools/` may import from `legacy/` (`tests/boundaries.test.ts` greps for it and fails the build). `legacy/` is outside the `tsconfig` include and the vitest include, so it never compiles. Files get into `src/` only by being ported under this table; a file is never ported by importing it, and prose or data from a DELETE file is never copied (all Legion text is our own wording, all numbers come from the sources in `docs/sources/`).

**Method.**

1. A stage ports its KEEP and ADAPT rows with `git mv legacy/<path> <destination>` (history follows the file), then edits the ADAPT ones as the row says. The destination keeps the legacy relative path unless the row names a new file name (for example `src/engine/shoot.ts` becomes `src/engine/attack.ts`).
2. A stage owns a file in this table only once. If a file of an earlier stage would import a file of a later stage, the file moves up to the earlier stage (this table was checked for that: `src/client/ui/Keyword.tsx`, `game/glossary.ts`, the watch-mode files, `EndScreen.tsx` and the audio code are M3 for this reason, although their polish comes later).
3. DELETE rows are not ported. They stay in `legacy/` as reference for structure until `legacy/` is deleted, so after a stage lands, the files still under `legacy/` for that stage are exactly its DELETE rows. A KEEP or ADAPT file of a landed stage still sitting in `legacy/` is a miss.
4. An ADAPT file that imports a DELETE file in the legacy tree (`fight.ts`, `zm.ts`, `nav.ts`, `wargear.ts`, `ports.ts`, `skills/*`, `ZmBoard.tsx`, `markStore.ts`, the ZM data files) must lose that import in the same stage; the DELETE row says what to lift out first, if anything.
5. Two legacy imports reach across stages and are stubbed: `tools/validate-data.ts` imports the engine code-hook registry (stubbed in M1, `--allow-pending-codes` on until M2), and `src/client/store/game.ts` imports `@/ai` (M3 uses the random bot, M4 adds the import).
6. `PLAN.md` also lists M2b (vehicles) and M8 (hot-seat) besides the seven stages used here; they have no rows of their own. M2b grows `footprint.ts` (notched bases), `movement.ts` and `attack.ts`; M8 grows `store/game.ts`, `session.ts` and `view.ts` (hidden command picks on one screen).

**Deleting `legacy/`.** Delete `legacy/` after the last stage that ports from it has landed and its gates are green. By this table that is M7, unless M5 or M6 (which run on the owner's PC) land later, in which case it is whichever of M5, M6, M7 lands last. In the commit before the deletion, take `git rev-parse HEAD` and record it in `HANDOFF.md` as "last commit that had `legacy/`" (with the date), so the old tree stays one `git show <sha>:legacy/<path>` away. The deletion commit is the only commit that touches `legacy/` after M0 other than the `git mv` operations.

## 1. Verdicts

- **KEEP**: copied as is. The only edits allowed are import paths and project-name strings (a storage key, a save kind, a page title).
- **ADAPT**: copied, then changed as the row says. The row names the new file name when it changes.
- **DELETE**: Necromunda-only. Not ported; stays in `legacy/` as reference until the folder is deleted. Where Legion needs a file with a similar job, it is a new file written from the spec, not a port.

Stages: M1 data, M2 engine, M3 client (playable against the random bot), M4 utility AI, M5 art, M6 audio, M7 polish.

## 2. Summary

Counts are files, with total lines (`wc -l`) in brackets. The 4 PNG icons count as files with 0 lines. 184 table rows cover 332 files.

| Stage | KEEP | ADAPT | DELETE | Total |
|---|---|---|---|---|
| M1 data | 1 (91) | 21 (4,204) | 40 (9,216) | 62 (13,511) |
| M2 engine | 3 (432) | 63 (16,824) | 23 (6,898) | 89 (24,154) |
| M3 client | 31 (4,918) | 87 (14,672) | 4 (842) | 122 (20,432) |
| M4 utility AI | 3 (172) | 21 (3,945) | 4 (522) | 28 (4,639) |
| M5 art | 6 (663) | 7 (953) | 3 (150) | 16 (1,766) |
| M6 audio | 2 (522) | 5 (1,252) | 0 (0) | 7 (1,774) |
| M7 polish | 0 (0) | 4 (269) | 4 (0) | 8 (269) |
| **Total** | **46 (6,798)** | **208 (42,119)** | **78 (17,628)** | **332 (66,545)** |

By lines: 10% is KEEP, 63% ADAPT, 26% DELETE. The ADAPT bulk is the engine rules modules, the client prompts and the AI planner; the KEEP bulk is the effects engine (`vfx/`), audio manager, presentation stores and tooling.

M7 owns few files because the phone layer, keyword help, end screen, save and settings files are imported by the M3 shell and therefore port with it; M7 finishes them (help text for every slice keyword, phone checks, PWA metadata) and owns the phone end-to-end specs. M5 and M6 are mostly tooling: the figures, models, textures and sounds themselves are assets, not ported code.

## 3. File table

Rows are ordered by stage, then source (`src/`, `tests/`, `tools/`, `public/`). A group row lists its file count in brackets.

### M1 - Data (62 files, 13,511 lines)

| Legacy path | Verdict | What changes for Legion | Stage |
|---|---|---|---|
| `src/data/geometry.ts` | KEEP | Plain 2D polygon helpers for the validator and layout tests (terrain and deployment footprints); unchanged. | M1 |
| `src/data/types.ts` | ADAPT | Mirror of the new schemas: unit (miniatures, rank, points, speed, courage, wounds, defence die, base size, silhouette, weapon and upgrade slots), weapon (dice pool, band min/max, keywords), keyword, upgrade, command card, battle card (objective, deployment, condition), terrain; House, FighterType, StarterGang, Wargear, Skill and ZM types go. | M1 |
| `src/data/refs.ts` | ADAPT | Id index and ref kinds over the new record types (unit to weapons, upgrades, keywords; card to faction); CORE_SKILL_SETS dropped. | M1 |
| `src/data/validate.ts` | ADAPT | Keep the ajv set-up, the `source` check, the code-hook usage list and the refusal of `{"unimplemented"}` in a playable army; replace the loadout-slot, two-slot-weapon and starter-gang checks with army legality (points, rank limits, upgrade slots, command-card list). | M1 |
| `src/data/{index,manifest}.ts` | ADAPT | Bundle loader, `CODE_HOOKS` list and MANIFEST over the new area indexes (core, units, upgrades, cards, battle, terrain); schema-name table updated. | M1 |
| `src/data/roster.ts` | ADAPT | Starter gangs become army lists: `armyFromList`, points total and legality helpers; gang composition and weapon-slot rules go. | M1 |
| `src/data/schema/index.ts` | ADAPT | Schema table gains unit, upgrade, card, battle and terrain; schema id base renamed. | M1 |
| `src/data/schema/common.schema.json` | ADAPT | Keep ids, `source`, `{"code"}` and `{"unimplemented"}` nodes and dice-expression types; add band (1-5), speed (1-3), pip and surge-conversion types; drop Necromunda enums (postures, ammo). | M1 |
| `src/data/schema/core.schema.json` | ADAPT | Core records become the action catalogue, attack and defence dice faces, constants and keywords; Firepower, Injury and Scatter face schemas go. | M1 |
| `src/data/schema/item.schema.json` | ADAPT | Weapon record (dice pool per colour, band min/max, keywords) and upgrade card record; the wargear and armour-save shape goes. | M1 |
| `src/data/schema/scenario.schema.json` | ADAPT | Becomes the battle-deck card schema (objective, deployment, condition); scoring and victory expression nodes kept, casket, crew-cap and tile-deployment fields dropped. | M1 |
| `src/data/schema/{gang,zm}.schema.json (2)` | DELETE | House, fighter type, starter gang, ZM tile and board records are Necromunda-only; the unit, army and terrain schemas are new files. | M1 |
| `src/data/{core,gangs,scenarios}/index.ts (3)` | ADAPT | Area index files (`DataFile[]`): core lists the kept core files, `gangs/` becomes `units/` (plus upgrades) and `scenarios/` becomes `battle/`; created empty first so later data work never touches the same index. | M1 |
| `src/data/core/actions.json` | ADAPT | Legion action catalogue: move, attack, aim, dodge, standby, recover, free actions and card or keyword actions; cost is action or free (two actions per activation); Simple/Basic/Double and posture statuses go. | M1 |
| `src/data/core/dice.json` | ADAPT | Red, black and white attack dice (8 faces: hit, crit, surge, blank) and red and white defence dice (6 faces: block, surge, blank) with the printed face counts; D3, Firepower, Injury and Scatter go. | M1 |
| `src/data/core/constants.json` | ADAPT | Range bands 1-5 of 6", tool lengths for speed 1-3, cohesion distance, token caps, base sizes, order-token rules; nerve, rally, retreat, run-for-cover and hit-modifier constants go. | M1 |
| `src/data/core/traits.json` | ADAPT | Renamed `keywords.json`: the Legion keyword list with an `implemented` flag per keyword; every Necromunda trait name goes. | M1 |
| `src/data/core/{weapons,wargear,skills,fighter-rules}.json (4)` | DELETE | Necromunda catalogues (weapons, armour and equipment, skill sets, fighter rules); Legion weapons and upgrades are new records beside their units. | M1 |
| `src/data/gangs/{goliath,escher}/*.json (16)` | DELETE | Goliath and Escher houses, fighters, weapons, equipment lists, starter gangs and house skills; read only for how a faction folder is laid out. | M1 |
| `src/data/zm/** (13)` | DELETE | Zone Mortalis tiles, boards, structural checks and index (doors, ducts, terminals); Legion has a plain table with terrain pieces. | M1 |
| `src/data/scenarios/{forgotten-riches,smash-and-grab,tunnel-skirmish}.json (3)` | DELETE | Necromunda scenarios (caskets, crew caps, tile deployment); battle cards are new records from the battle deck source. | M1 |
| `tests/data/{schemas,core}.test.ts (2)` | ADAPT | Keep the ajv harness; accept and reject cases rewritten for the new record types, dice face counts and the keyword list. | M1 |
| `tests/data/{gangs,boards}.test.ts (2)` | DELETE | Starter-gang rosters and Zone Mortalis board checks; unit and army tests are new files. | M1 |
| `tools/validate-data.ts` | ADAPT | Replaces the M0 stub in `tools/`; same CLI (`--print`, `--quiet`, `--no-sources`), prints units, weapons and cards; its import of the engine code-hook registry is stubbed until M2 lands the registry, so `--allow-pending-codes` is on until then. | M1 |

### M2 - Engine (89 files, 24,154 lines)

| Legacy path | Verdict | What changes for Legion | Stage |
|---|---|---|---|
| `src/engine/rng.ts` | KEEP | Seeded xoshiro128**, ScriptedRng, sha256 and fnv1a; unchanged. | M2 |
| `src/engine/decider.ts` | KEEP | `Decider` and `ReplayDecider`; unchanged (the caller asks once per seat when a decision is for `all`). | M2 |
| `src/engine/geometry.ts` | KEEP | Pure 2D segments, polygons, circles and intervals; `incrementCost` stays but is never called. | M2 |
| `src/engine/footprint.ts` | ADAPT | Round and oval footprints become rectangular bases from the unit data (facing matters; notched vehicle bases arrive in M2b); gap, overlap and polygon helpers kept. | M2 |
| `src/engine/types.ts` | ADAPT | Contract rewrite: `PendingDecision.seat` may be `all` with per-seat answered state, units, miniatures, order pool, tokens, command cards, battle deck, `Phase` = command, activation, end, `BoardDef` = table, terrain pieces, deployment zones; Envelope, StepResult, SaveFile and Rejection keep their shape. | M2 |
| `src/engine/events.ts` | ADAPT | Event families for command picks and reveal, priority, order tokens, activation and actions, attack steps (pool, rerolls, surges, wounds), suppression, panic, scoring; injury, nerve, door and casket events go. | M2 |
| `src/engine/actions.ts` | ADAPT | `act.*` constructors for the new decision kinds (command pick, order issue, activate, tool placement, weapon, target, aim, reroll, dodge, confirm); fight, bottle and casket constructors go. | M2 |
| `src/engine/registry.ts` | ADAPT | `Ctx.roll` takes a die kind (d8 attack colour, d6 defence colour) and emits the faces; `reject`, `stubModule` and the module shape kept. | M2 |
| `src/engine/apply.ts` | ADAPT | Envelope check accepts an action from any seat still owing a pick when `pending.seat` is `all` (it rejects `action.seat !== pending.seat` today) and holds a secret pick until both are in; afterAction drops the nerve drain and engagement refresh; log and hash kept. | M2 |
| `src/engine/modules.ts` | ADAPT | Namespace table: setup, command, activation, movement, attack, keywords, endphase, battle, choices (plus the `dice.reroll` override); one owner per namespace. | M2 |
| `src/engine/index.ts` | ADAPT | createGame, step, legalActions, validate, replay, view, save, load, undo and suggest kept; legalActions and the auto-pass handle `all` decisions; suggest answers tool placement. | M2 |
| `src/engine/view.ts` | ADAPT | Beyond stripping `rng` and `log`: hides the other seat's face-down command pick until both have chosen and the contents of its face-down order pool (the count shows); the leak test is rewritten. | M2 |
| `src/engine/state.ts` | ADAPT | Unit and miniature helpers (getUnit, leader, miniaturesOf, seatUnits, enemiesOf, order pool, token counters); cloneState, canon, hashState, EngineInvariantError, SEATS and otherSeat kept; fighter and posture helpers go. | M2 |
| `src/engine/hooks.ts` | ADAPT | Registry, window opener and frame resumes kept; HOOK_NAMES replaced by Legion points (attack pool, reroll, surge conversion, defence pool, cover, wound apply, suppression, courage, tool speed, action available, activation start and end, phase end). | M2 |
| `src/engine/code-hooks.ts` | ADAPT | `CodeHookDef.kind` becomes unit, upgrade, keyword, card or battle; params validator and fire counts kept. | M2 |
| `src/engine/effects.ts` | ADAPT | Timed effects kept; expiry keys re-keyed to units (end of activation, round, phase, `startOfActivation:<unitId>`). | M2 |
| `src/engine/bundle.ts` | ADAPT | `EngineBundle` and `bundleFromData` over units, weapons, keywords, upgrades, command cards, battle cards and terrain (parse dice pools and band ranges); houses, fighter types and boards go. | M2 |
| `src/engine/board.ts` | ADAPT | Compiles the 72" x 36" table, terrain pieces (footprint, height, light or heavy cover) and deployment zones into `BoardDef`; polygon and region helpers kept; tiles, rotation, outline walls, doors, ducts, terminals and caskets removed. | M2 |
| `src/engine/los.ts` | ADAPT | Line of sight from a miniature to a target using silhouettes and terrain height, with the light or heavy cover verdict; `losLines` stay so the client draws what the engine judged; the 17-ray wall test and vision arc go. | M2 |
| `src/engine/measure.ts` | ADAPT | Range band 1-5 from base edge to base edge, cohesion distance and base contact (engaged); path proximity (`withinPath`) goes. | M2 |
| `src/engine/movement.ts` | ADAPT | Hinged tool at speed 1-3: leader placement along the tool, the rest of the unit placed in cohesion, collision with bases and terrain, climbing and crossing low terrain; waypoint validation, sampling and `planMove` kept; charge, retreat, run for cover, knockback and the 1" rule go. | M2 |
| `src/engine/setup.ts` | ADAPT | `createGame` from two army lists: battle-deck draw (objective, deployment, condition), table and terrain, alternating deployment of units into zones; roles, crew selection, casket placement and tile deployment go. | M2 |
| `src/engine/priority.ts` | ADAPT | Becomes `command.ts`: Command phase where both seats pick a command card at once (`seat: all`), reveal together, fewest pips takes priority (tie rule), then order tokens go to units in range of a commander. | M2 |
| `src/engine/activation.ts` | ADAPT | Round skeleton and alternating activations of units: a unit with a face-up order or one drawn at random from the face-down pool, 2 actions plus free actions, the action menu from data, the unit's miniatures moved as a chain led by the leader; Simple/Basic/Double accounting, postures, group activation and Broken go. | M2 |
| `src/engine/shoot.ts` | ADAPT | Becomes `attack.ts`: weapon and target, band and LoS check, red/black/white pool, aim rerolls, surge conversion, cover, dodge, defence dice, pierce and impact, keyword hooks, wounds; melee is the same pipeline at base contact; frame and resume skeleton kept. | M2 |
| `src/engine/hits.ts` | ADAPT | Becomes wound application: remove miniatures and promote a new leader, add suppression after the attack; wound roll, armour save, Injury dice, pinning, Blast markers and door targets go. | M2 |
| `src/engine/traits.ts` | ADAPT | Becomes `keywords.ts`: ids and lifetime hooks for the declarative Legion keywords, read where the attack pipeline needs them; the Necromunda weapon-trait list goes. | M2 |
| `src/engine/dice.ts` | ADAPT | Rolls of d8 attack colours and d6 defence colours from the data faces, exact pool odds (hit, crit, block) and reroll helpers; D3, D66, 2D6 tests, Firepower, Injury and Scatter go. | M2 |
| `src/engine/query.ts` | ADAPT | `query.*` owns the displayed numbers: band, LoS and cover verdicts, attack pool and expected hits and wounds, tool reach, cohesion, priority, objective points; injury, nerve, charge and fight numbers go. | M2 |
| `src/engine/casualties.ts` | ADAPT | Casualty log of removed miniatures and destroyed units (who, how, round) feeding scoring; the nerve queue goes. | M2 |
| `src/engine/morale.ts` | ADAPT | Becomes suppression, panic and courage: suppression tokens, panic when suppression reaches courage, rally in the End phase; the nerve queue, Broken and Running for Cover go. | M2 |
| `src/engine/endphase.ts` | ADAPT | End phase: remove tokens, score objectives, clean up timed effects; Bottle, fleeing, recovery and assist go. | M2 |
| `src/engine/scenarios.ts` | ADAPT | Becomes `battle.ts`: objective, deployment and condition cards with scoring and victory at the round limit; scenario hook windows and result kept; caskets, crew cap and tile deployment go. | M2 |
| `src/engine/skills.ts` | ADAPT | Becomes `choices.ts`: owns the `choice` namespace (keyword and card options) and the `dice.reroll` override that aim and card rerolls answer; Necromunda skill handlers go. | M2 |
| `src/engine/fight.ts` | DELETE | Necromunda close-combat exchange, charge, escape and Coup de Grace; Legion melee is an attack at base contact in `attack.ts`. Lift `resumeSequence`, `answerChoice` and `resumeAfterMove` into `attack.ts` and `activation.ts` first. | M2 |
| `src/engine/nav.ts` | DELETE | Visibility-graph path distances; Legion moves with the tool and measures straight bands, so the engine has no path search (the AI keeps a coarse field of its own). | M2 |
| `src/engine/{wargear,zm,ports,board-checks}.ts (4)` | DELETE | Armour-save item, doors, ducts, terminals and caskets, the door and casket hit ports, and the ZM deployment-fit check; none exist in Legion. | M2 |
| `src/engine/skills/*.ts (9)` | DELETE | Necromunda skill code hooks and skill actions (Hurl, Somersault, stance, passives, choices); Legion keyword and card hooks are new files. | M2 |
| `tests/data/scenarios.test.ts` | ADAPT | Becomes the battle-deck test (needs `board.ts` to check deployment zones): every objective, deployment and condition card is legal and carries a `source`. | M2 |
| `tests/engine/boundaries.test.ts` | ADAPT | Keeps the layering checks (engine imports nothing outside itself, ai/client direction); module table updated. The M0 `tests/boundaries.test.ts` (legacy import ban) stays as is. | M2 |
| `tests/engine/{smoke,view}.test.ts (2)` | ADAPT | Contract tests (deterministic hash, rejection keeps the state reference, replay reproduces hashes, no hidden-info leak) on the Legion fixture; the view test adds command picks and the order pool. | M2 |
| `tests/engine/{dice,query,setup,round}.test.ts (4)` | ADAPT | Same harness, cases rewritten: attack and defence die odds, query numbers, army setup and deployment, Command / Activation / End phase order and priority. | M2 |
| `tests/engine/{act,move,status}.test.ts (3)` | ADAPT | Action economy and order draws, tool movement and cohesion, unit status and tokens. | M2 |
| `tests/engine/{vis,board}.test.ts (2)` | ADAPT | LoS, silhouette and cover cases; board test keeps polygon compile and deployment-zone cases, drops tiles and doors. | M2 |
| `tests/engine/{shoot,trait,nerve}.test.ts (3)` | ADAPT | Attack pipeline with forced dice, one test per slice keyword, suppression, panic and courage. | M2 |
| `tests/engine/{end,scen}.test.ts (2)` | ADAPT | End-phase token removal and scoring; battle-deck objectives, deployments and conditions; bottle, recovery and casket cases go. | M2 |
| `tests/engine/{golden,code-hooks,sim}.test.ts (3)` | ADAPT | Golden forced-dice round of the starter armies (LCG dice stream kept), a firing test for every `{"code"}` hook, short sim gate. | M2 |
| `tests/engine/{cc,inj,blast,zm,nav,skl-combat,skl-passive}.test.ts (7)` | DELETE | Close combat, injury dice, blast markers, Zone Mortalis, path navigation and Necromunda skills. | M2 |
| `tests/data/bundle-adapter.test.ts` | ADAPT | `bundleFromData` on the real slice data: dice pools, band ranges, keyword refs. | M2 |
| `tests/fixtures/{gang,boards,helpers}.ts (3)` | ADAPT | Synthetic bundle of two small armies (commander, corps unit with leader, heavy-weapon unit) with weapons, keywords, a command card and battle cards; open table, light and heavy terrain, deployment zones; helpers renamed to units. | M2 |
| `tests/fixtures/{attack,real,scenario}.ts (3)` | ADAPT | Forced-dice attack builders; the real slice data through the adapter; a battle-deck game taken to the first activation. | M2 |
| `tests/fixtures/melee.ts` | DELETE | Close-combat fixtures; melee tests use the attack builders. | M2 |
| `tools/sim-core.ts` | ADAPT | Random-legal bots answer `all` decisions once per seat; invariants: no NaN, tokens within caps, at most 2 actions per activation, each order drawn once, cohesion holds after a move, nobody off the table, no hidden-info leak in `view`. | M2 |
| `tools/{sim,sim-setup}.ts (2)` | ADAPT | Army pairings (Empire vs Rebels) and battle-deck rotation instead of houses, scenarios and boards; report format kept. | M2 |
| `tools/board-svg.ts` | ADAPT | Draws the table, terrain, deployment zones, bases, LoS lines and move tool of a sim game; tiles, doors and casket spots go. | M2 |

### M3 - Client (playable vs random bot) (122 files, 20,432 lines)

| Legacy path | Verdict | What changes for Legion | Stage |
|---|---|---|---|
| `src/main.tsx` | ADAPT | Replaces the M0 placeholder page; mounts the app (`?lab` and `?gallery` routes kept); storage and title strings renamed. | M3 |
| `src/client/App.tsx` | ADAPT | Screens: start, army picker, briefing, battle, end; audio and music mounts kept. | M3 |
| `src/client/params.ts` | ADAPT | URL params `armies=emp,reb`, `battle`, `seed`, `watch`, `test`; `gangs`, `mission`, `layout` and `teams` go. | M3 |
| `src/client/store/game.ts` | ADAPT | The only caller of `step`; the bot loop and presentation wait kept but a decision for `all` is answered per seat (today `seats[pending.seat]`); autosave via saveGame; it imports `@/ai` for the utility tier, so M3 ports it with that tier stubbed to the random bot and M4 adds the import. | M3 |
| `src/client/store/session.ts` | ADAPT | Screen flow and seat modes; setup from army picks and a battle-deck choice instead of starter gang, scenario and board. | M3 |
| `src/client/store/saveGame.ts` | ADAPT | Save envelope and storage kept; the meta holds army list ids, battle cards and a Continue-card summary instead of starter gangs, scenario and board; validity check runs against the new data; storage key and save kind renamed. | M3 |
| `src/client/store/testHooks.ts` | ADAPT | `window.__ms` read-only views and `dispatch` kept; the deploy and route probes (`suggestSpot`, `deployOk`, `routeOk`) follow the new controller (deployment zones, tool placement). | M3 |
| `src/client/bot/randomBot.ts` | ADAPT | Answers continuous kinds (tool placement) with `engine.suggest` and `all` decisions for its own seat. | M3 |
| `src/client/presentation/{animStore,announceStore,feedStore,fxStore,idleStore,presentedStore,settings}.ts (7)` | KEEP | Animation, banner, feed, effect, idle and presented-state cursors, and settings store; only the settings storage key is renamed. | M3 |
| `src/client/presentation/director.ts` | ADAPT | Beats for the new events: command reveal, priority banner, order tokens, tool move, attack dice, surge and wound, suppression and panic, objective scoring; injury, nerve, door and scatter beats go. | M3 |
| `src/client/presentation/{deployCamera,shotCamera,heldVolley}.ts (3)` | ADAPT | Deployment framing for zones, shot camera and held volleys for a unit firing several miniatures at once. | M3 |
| `src/client/presentation/markStore.ts` | DELETE | Blast circles and flamer templates; Legion has no templates (range and LoS overlays come from `query`). | M3 |
| `src/client/game/{adapter,defaults}.ts (2)` | ADAPT | `GameSetup` from two army lists and a battle-deck choice; default pairing Empire vs Rebels. | M3 |
| `src/client/game/{labels,promptLabels}.ts (2)` | ADAPT | Feed lines and prompt titles for the new events and decision kinds, all names read from data. | M3 |
| `src/client/game/odds.ts` | ADAPT | View-models over `query.*`: expected hits, wounds, block and suppression chances; injury and nerve odds go. | M3 |
| `src/client/game/gangs.ts` | ADAPT | Becomes `armies.ts`: army list rows for the picker (units, ranks, upgrades, weapon pools, points) from the engine bundle. | M3 |
| `src/client/game/scenario.ts` | ADAPT | Becomes the briefing text builder from the drawn objective, deployment and condition cards; round structure lines are the three phases. | M3 |
| `src/client/board/Board.tsx` | ADAPT | Table, terrain pieces, miniatures on bases, overlays and camera; ZmBoard swapped for new `Table` and `Terrain` components. | M3 |
| `src/client/board/{CameraRig.tsx,touchCamera.ts,cameraApi.ts}` | ADAPT | Pan limits and zoom range for a 72" x 36" table; touch gestures kept; `cameraApi` global name strings renamed. | M3 |
| `src/client/board/Vfx.tsx` | KEEP | R3F mount for the effects layer; unchanged. | M3 |
| `src/client/board/Zones.tsx` | ADAPT | Draws deployment zones, objective markers and the range-band ruler; blast and template marks go. | M3 |
| `src/client/board/{floorTexture,wallTexture}.ts (2)` | ADAPT | Procedural table mat and terrain plating stand-ins until M5 textures. | M3 |
| `src/client/board/{ZmBoard.tsx,zmGeometry.ts} (2)` | DELETE | Zone Mortalis tiles, walls and doors; the Legion table and terrain are new components. | M3 |
| `src/client/figures/BattleFighter.tsx` | ADAPT | Becomes `BattleMini`: a miniature on its base at the engine position, unit leader marker, order, aim, dodge, suppression and panic cues; pinned and seriously-injured postures go. | M3 |
| `src/client/figures/FighterPips.tsx` | ADAPT | Token chips: wounds, order, aim, dodge, standby, suppression, panic; ammo and flesh-wound chips go. | M3 |
| `src/client/figures/Procedural.tsx` | ADAPT | Stand-in archetypes for Stormtrooper, Rebel trooper, commanders and heavy weapons instead of gang bodies. | M3 |
| `src/client/figures/{bodyManifest,glbLoader}.ts (2)` | KEEP | GLB body lookup (a missing manifest is not an error) and loader; M5 supplies the models. | M3 |
| `src/client/dice/DiceTray.tsx` | ADAPT | Tray rows per step (attack pool, rerolls, defence pool) with red, black and white d8 glyphs and red and white d6 glyphs, surge faces marked; Firepower, Injury and Scatter faces go. | M3 |
| `src/client/dice/{trayEvents,trayStore}.ts (2)` | ADAPT | Engine events to tray rows for the Legion attack steps; every face comes off the event. | M3 |
| `src/client/interaction/controller.ts` | ADAPT | Click and hover handling for army deployment, the hinged movement tool (drag the joint, speed 1-3), unit and target picks; door, route-cost and casket handling go. | M3 |
| `src/client/interaction/Overlays.tsx` | ADAPT | Tool outline and base ghosts, band rings, LoS lines and cover verdicts drawn from `query`; door and route-cost overlays go. | M3 |
| `src/client/ui/{Tooltip,BottomSheet,widgets,collapse,formFactor,hudLayout,promptParts,RotatePrompt,EventFeed}.* (9)` | KEEP | Tooltip, bottom sheet, widgets, collapse, form factor, HUD layout, prompt parts, rotate prompt and event feed; unchanged. | M3 |
| `src/client/ui/uiStore.ts` | ADAPT | Selection, hover, deploy pick and sheet state kept; fighter and door fields become unit, miniature and (tool) placement fields, door focus goes. | M3 |
| `src/client/ui/theme.ts` | ADAPT | Starbound Legions palette and colour roles on the same HUD layout (decision D12). | M3 |
| `src/client/ui/BattleScreen.tsx` | ADAPT | Battle shell and prompt host for the new decision kinds; the end screen is mounted here. | M3 |
| `src/client/ui/BattleHud.tsx` | ADAPT | Round, phase, priority, command card slot, order pool counts, units left and objective points; bottled and fighters-down readouts go. | M3 |
| `src/client/ui/DecisionPrompt.tsx` | ADAPT | Bodies for command pick (simultaneous), order issue, activate, tool placement, deploy and a generic option list for the rest. | M3 |
| `src/client/ui/{AttackPrompts,GamePrompts}.tsx (2)` | ADAPT | Weapon cards (dice pool, band range, keywords) with engine odds, target list with band and cover badges, aim and dodge choices, reroll picker; fight, bottle, assist and casket prompts go. | M3 |
| `src/client/ui/Panels.tsx` | ADAPT | FighterCard becomes UnitCard: speed, wounds, courage, defence die, weapons table, upgrades, keywords, tokens. | M3 |
| `src/client/ui/FighterStrip.tsx` | ADAPT | Hovered or selected unit card slot (sheet on phones); reads UnitCard. | M3 |
| `src/client/ui/ScenarioPanel.tsx` | ADAPT | Objective, deployment and condition cards and the score, from `query`. | M3 |
| `src/client/ui/{StartScreen,Briefing}.tsx (2)` | ADAPT | Start menu with battle and army pick; briefing from the drawn cards; project-name strings renamed. | M3 |
| `src/client/ui/GangPicker.tsx` | ADAPT | Becomes `ArmyPicker`: choose a faction and a preset army list per seat, read-only roster with unit cards. | M3 |
| `src/client/ui/CasualtyTray.tsx` | ADAPT | Tray of destroyed units and removed miniatures per seat; out-of-action and fled lists go. | M3 |
| `src/client/ui/EndScreen.tsx` | ADAPT | Result, round count, objective points and casualties from the engine log; polished in M7. | M3 |
| `src/client/lab/{Lab.tsx,LabFighter.tsx,LabOverlays.tsx,placement.ts} (4)` | ADAPT | Lab viewer: army and terrain pick, LoS probe between two miniatures showing the engine's `losLines` and cover verdict, tool preview, seeded sim stepper; first piece to port, it makes M2 visible. | M3 |
| `src/client/dev/scenarios.ts` | ADAPT | Dev fixtures (`?test=1&fixture=`): a shot at a real target, a command phase, an objective turn; each plays the real engine forward and returns null when unreachable. | M3 |
| `src/client/weaponFlavour.ts` | ADAPT | Flavour enum becomes blaster families (pistol, rifle, repeater, heavy, ion, thrown, melee); read from the weapon record. | M3 |
| `src/client/vfx/{atlas,engine,instance,renderer,types,warmup}.ts (6)` | KEEP | Effects engine, atlas, renderer and shader warm-up; unchanged. | M3 |
| `src/client/vfx/{api,families,recipes}.ts (3)` | ADAPT | Families and recipes for blaster bolts (red and blue), ion, thermal detonator blast and melee sweep; slugga, shokka, harpoon, knives and flame recipes go; `api.ts` reads units and miniatures (it reads `state.fighters`, posture and Blaze today) and drops the seriously-injured drip. | M3 |
| `src/client/audio/{manager,instance,settings,index}.ts + AudioControl.tsx (5)` | KEEP | Audio manager, instance, settings and control; the code ports now because App and the director import it, the assets come in M6 (check the manager survives a missing file when porting); only the settings key is renamed. | M3 |
| `src/client/audio/music.ts` | ADAPT | Music plan keeps the title, alternating battle tracks, tense and end pieces; the tense trigger (a gang bottled or half its crew down) becomes units panicked or the battle running late. | M3 |
| `src/client/audio/{eventSounds,ids}.ts (2)` | ADAPT | Event-to-sound map for the new events and the sound id catalogue; Necromunda ids (hive, house, bottle) go; the id-to-mp3 consistency test is an M6 test, so ids may lack files until then. | M3 |
| `src/client/ui/{WatchControls,BotDecisionCard}.tsx (2)` | ADAPT | Watch bar (pause, step, speed) kept; the decision card shows the bot's pick with pool odds and, for the secret command pick, only after the reveal. BattleScreen imports both, so they port now and run on random bots until M4. | M3 |
| `src/client/game/botDecision.ts` | ADAPT | Decision-card view-model over the new kinds, same label and odds helpers as the prompts. | M3 |
| `src/client/store/pacing.ts` | ADAPT | Watch-mode pacing rules kept; the set of decision kinds that start an attack (`shoot.*`, `fight.*` today) becomes the Legion attack kinds. | M3 |
| `src/client/presentation/followCamera.ts` | ADAPT | Follow-the-action camera looks at the acting unit or miniature (reads `fighterId` and `state.fighters` today). | M3 |
| `src/client/ui/Keyword.tsx` | ADAPT | Keyword chip with hover help reads the keyword record (name, own-words rule text) from data; M7 completes the help text of every slice keyword. | M3 |
| `src/client/game/glossary.ts` | ADAPT | Glossary structure kept; entries rewritten for Legion terms in our own words, names from data; M7 completes it. | M3 |
| `tests/client/{presentation,store,prompts,params,saveGame,diceTray,screens}.test.ts (7)` | ADAPT | Same pure-logic harness on Legion states: presentation cursor, store flow incl. `all` decisions, prompt view-models, params, save round trip, tray rows, army picker and briefing data. | M3 |
| `tests/client/{figurePips,weaponFlavour,vfx}.test.ts (3)` | ADAPT | Token chips, flavour map and effect family classification for the new weapons. | M3 |
| `tests/client/noNativeTooltips.test.ts` | KEEP | No native `title=` tooltips anywhere in `src/client`; unchanged. | M3 |
| `tests/client/zmBoard.test.ts` | DELETE | Zone Mortalis mesh counts; a table and terrain test is new. | M3 |
| `tests/fixtures/presentation.ts` | ADAPT | Presented-state fixtures over the Legion game fixture. | M3 |
| `tests/e2e/{helpers,home,play}.spec.ts (3)` | ADAPT | Home screen and one full game against the random bot (deploy by clicks, command pick, tool move, shoot, end the round); helpers read the new `__ms` shape. | M3 |
| `tests/e2e/{gang-picker,lab}.spec.ts (2)` | ADAPT | Army picker flow and lab screenshots of the table with terrain and both armies; no page errors. | M3 |
| `tests/client/watch.test.ts` | ADAPT | Pacing, step and pause on attacks, decision card model; fixtures swapped. | M3 |
| `tests/e2e/watch.spec.ts` | ADAPT | Watched game from the start screen to the end screen with random bots (re-run on the utility AI in M4); H key hides panels. | M3 |
| `tests/client/glossary.test.ts` | ADAPT | Every glossary term resolves to a data record or a rule line; no copied text. | M3 |

### M4 - Utility AI (28 files, 4,639 lines)

| Legacy path | Verdict | What changes for Legion | Stage |
|---|---|---|---|
| `src/ai/{index,worker,workerClient}.ts (3)` | KEEP | AI package surface, Web Worker host and its client with in-process fallback; the message protocol already carries one seat's view, so `all` decisions need no change. | M4 |
| `src/ai/intern.ts` | ADAPT | Interning signature hashes terrain polygons instead of walls, doors and obstacles. | M4 |
| `src/ai/decider.ts` | ADAPT | Dispatch table on the new kinds; builds the view for the bot's own seat when the decision is for `all` (today `viewOf(state, pending.seat)`); fallback chain and counters kept. | M4 |
| `src/ai/random.ts` | ADAPT | Pass and random answers use the answering seat; tool placement answered with `suggest` or a random legal placement. | M4 |
| `src/ai/tiers.ts` | ADAPT | Tier set and work budget kept; weight names become threat, damage, suppression, objective, cohesion, command. | M4 |
| `src/ai/eval.ts` | ADAPT | Unit value from miniatures left, wounds, points and objective hold; outcomes from `query.expectedOutcome` (hits, wounds, suppression). | M4 |
| `src/ai/threat.ts` | ADAPT | Exposure at a spot: enemy units with LoS, the band's dice pool, cover and suppression. | M4 |
| `src/ai/moves.ts` | ADAPT | Activation planner over two actions plus free actions (move+attack, aim+attack, move+move, dodge, standby, recover), tool-placement candidates, order and command-card scoring; door, casket, charge and posture planning go. | M4 |
| `src/ai/{shoot,shots}.ts (2)` | ADAPT | Weapon, target, aim and reroll choices valued from the engine pool odds; the plan and the sub-decisions share one valuation. | M4 |
| `src/ai/setup.ts` | ADAPT | Deployment of units into zones and battle-deck picks; role, crew and casket picks go. | M4 |
| `src/ai/goals.ts` | ADAPT | Goals: objective markers, cover, and the ideal band for each weapon; door and casket goals go. | M4 |
| `src/ai/field.ts` | ADAPT | Grid distance fields with impassable terrain in place of closed doors; coarse ranking only, the tool judges the real move. | M4 |
| `src/ai/sight.ts` | ADAPT | Per-decision memo around the new engine LoS call. | M4 |
| `src/ai/{fight,end,skills}.ts (3)` | DELETE | Close combat policy, bottle and recovery choices, and Necromunda skill choices; rerolls and surge order are decided in `shoot.ts`. | M4 |
| `tests/ai/{decider,worker,field,planner}.test.ts (4)` | ADAPT | Fixtures swapped; decider covers every decision kind including `all`, planner cases rewritten for tool moves and aim or attack pairs. | M4 |
| `tests/ai/skills.test.ts` | DELETE | Necromunda skill policy tests. | M4 |
| `tools/{ai-bench,ai-match,ai-pairing}.ts (3)` | ADAPT | Bench normal vs random with Empire and Rebels in both seats, battle-deck rotation, holdout seeds; counters for rejections, stalls, fallbacks and zero-action activations kept. | M4 |
| `tools/ai-watch.ts` | ADAPT | Narrated seeded game (command picks, activations, attacks, scoring) with an ASCII table map; door and loot flags go. | M4 |

### M5 - Art (16 files, 1,766 lines)

| Legacy path | Verdict | What changes for Legion | Stage |
|---|---|---|---|
| `tools/art/{contact_sheet,decode_bundle,hf-concepts}.py (3)` | KEEP | Contact sheet, Gemini bundle decoder and Hugging Face concept helper; generic. | M5 |
| `tools/art/{v2_prompts,v2_promptsmd}.py (2)` | ADAPT | MGSD Star Wars miniature prompts, one standalone prompt per unit with the per-item reference gate; gang and house wording and the project name go. | M5 |
| `tools/models/{finalize-attachments,measure-sockets}.py (2)` | KEEP | Weapon-attachment finishing and socket measuring on fused body GLBs; generic. | M5 |
| `tools/models/finalize-terrain.py` | ADAPT | Terrain GLB finishing for Legion terrain pieces (footprint and height from data); slug handling kept. | M5 |
| `tools/models/shoot-figures.mjs` | ADAPT | QC screenshots of `?gallery` per faction and unit instead of per team. | M5 |
| `tools/models/{attachments,terrain}.json (2)` | DELETE | Per-slug data for Necromunda weapons and ruins; rewritten for Legion weapons and terrain once the models exist. | M5 |
| `tools/textures/gen-mats.mjs` | ADAPT | Seamless mat generator and blender kept; the mat list and prompts become table and terrain surfaces. | M5 |
| `tools/textures/picks.json` | DELETE | Seed picks for the Necromunda mats. | M5 |
| `tools/vfx/chunk-cycles.mjs` | KEEP | Static-import cycle check of a dist directory; generic. | M5 |
| `tools/vfx/{shoot,probe-prod}.mjs (2)` | ADAPT | Effect screenshot jobs use Legion weapon ids; the probe's `/mancermundo/` base path becomes the Legion Forge base. | M5 |

### M6 - Audio (7 files, 1,774 lines)

| Legacy path | Verdict | What changes for Legion | Stage |
|---|---|---|---|
| `tests/client/{eventSounds,audioUnlock}.test.ts (2)` | ADAPT | Every sound id has an mp3 and every event maps to a known id (until this test lands, ids may lack files); the audio unlock test is unchanged. | M6 |
| `tools/{gen-audio,measure-audio}.ts (2)` | KEEP | Audio Studio generation and loudness/trim measuring; generic. | M6 |
| `tools/audio-manifest.json` | ADAPT | Keep the UI, dice and generic hit entries; replace hive, house and Necromunda weapon sounds with blasters, ion, detonators, walkers and score stings; comment line renamed. | M6 |
| `tools/build-sounds-page.ts` | ADAPT | Generates `public/sounds.html` from the manifest; page title renamed. | M6 |
| `public/sounds.html` | ADAPT | Regenerated by `build-sounds-page.ts` from the Legion manifest. | M6 |

### M7 - Polish (8 files, 269 lines)

| Legacy path | Verdict | What changes for Legion | Stage |
|---|---|---|---|
| `tests/e2e/{mobile-smoke,mobile-watch,ui-consistency}.spec.ts (3)` | ADAPT | Phone layout (44 px targets, no sideways scroll) and cross-screen consistency on the Legion screens. | M7 |
| `public/manifest.webmanifest` | ADAPT | App name, short name and colours. | M7 |
| `public/icons/*.png (4)` | DELETE | Mancermundo icons; Legion Forge icons are new art. | M7 |

## 4. New files with no legacy source

These are not rows (nothing to port); they are listed so a stage does not look for a legacy file that does not exist. Names are proposals and may change when the specs are written.

- **M1**: `src/data/schema/{unit,army,terrain}.schema.json`, `src/data/units/**` (Empire and Rebel slice units with weapons and upgrades), `src/data/cards/**` (command cards), `src/data/battle/**` (objective, deployment and condition cards), `src/data/terrain/**` (terrain pieces with footprint, height and cover class).
- **M2**: `src/engine/{command,attack,keywords,choices,battle}.ts` (renamed ports, see rows), `src/engine/cards.ts` (command-card effects), `src/engine/cohesion.ts` (coherency check and repair), the silhouette table reader inside `los.ts`, and the test files for command phase, order pool, tool movement, cohesion, attack pipeline and each slice keyword.
- **M3**: `src/client/board/{Table,Terrain}.tsx`, `src/client/ui/{CommandHand,OrderPool}.tsx`, `tests/client/table.test.ts`.
- **M4**: `src/ai/{command,orders}.ts` (command-card pick and order-token scoring).
- **M5, M6, M7**: assets only (`public/assets/**`, `public/audio/**`) plus new Legion Forge icons.

## 5. Riskiest ADAPT items

Ranked by how much of the Legion rules or contract each one carries and how little of the legacy code survives. Give these to the session model for review, not to a Sonnet implementer alone.

1. **`engine/apply.ts` + `types.ts` (with `view.ts`, `store/game.ts`, `ai/decider.ts`, `bot/randomBot.ts`): `seat: all`.** The legacy engine has one answering seat per decision: `apply.ts` rejects `action.seat !== pending.seat`, `index.ts` builds its auto-pass from `pending.seat`, the store indexes `seats[pending.seat]`, the AI builds `viewOf(state, pending.seat)`. A simultaneous secret command pick needs per-seat answered state, a pick that stays hidden until both are in, and every caller changed together, or the game hangs or leaks.
2. **`engine/activation.ts` (1,185 lines).** Alternating unit activations from a face-down order pool drawn at random, face-up orders, two actions plus free actions, a unit moving as a chain of miniatures. The legacy skeleton is built around single fighters, postures and Simple/Basic/Double costs; little survives but the frame.
3. **`engine/movement.ts` + `footprint.ts`.** The hinged tool (speed 1-3), unit leader first, the rest in cohesion, collision with rectangular bases and terrain, climbing. The legacy code validates free-form waypoint paths of circular bases; the tool is a different constraint and the AI and the client controller both depend on its shape.
4. **`engine/los.ts`.** Silhouette-based line of sight and light or heavy cover per attack. The legacy 17-ray wall test has no heights or silhouettes. Cover and LoS decide every attack, and the client draws the lines the engine judged, so an error here is visible and systemic.
5. **`engine/shoot.ts` to `attack.ts` (1,388 lines).** The red/black/white pool, aim rerolls, surge conversion, cover, dodge, defence dice, pierce and impact, and every keyword hook, with the frame and resume machinery kept from a different sequence. Rules-dense; the first place a wrong printed number would hide.

Also watch: `ai/moves.ts` (911 lines, the planner has to learn tool placement), `client/interaction/controller.ts` (dragging the hinged tool), `engine/board.ts` (712 lines mostly Zone Mortalis), and `store/game.ts` (the bot loop and presentation wait with simultaneous decisions).
