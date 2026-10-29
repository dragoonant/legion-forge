# 00 - Architecture

Source of truth for module boundaries, the engine contract, the decision model, determinism, space and unit state of Legion Forge. Rules content lives in `10-rules-core.md` (R-x.y), battle cards in `11-battles.md`, the test IDs in `12-rules-test-checklist.md`, the worked turn in `13-golden.md`, data shapes in `20-data-schema.md`, the port of the copied Mancermundo code in `05-migration.md`. `src/engine/types.ts` is the code form of sections 2 to 7 and must not diverge from this file. Contracts are **frozen after M2**; later changes are additive and get a dated row in section 11.

Lineage: Mancermundo's contract (pure reducer, one `PendingDecision`, events, seeded RNG, replay, `view`, namespace-owner modules, `{"code"}` hooks, `query.*`, `suggest`) is kept in shape. Everything Necromunda-specific (fighters, facing arcs, Zone Mortalis walls and doors, hit/wound/save/Injury chain, nerve, bottle) is replaced by Legion's: units of miniatures led by a unit leader, a hidden simultaneous command-card pick, an order pool, a hinged movement tool, custom attack and defence dice, suppression and panic, a 72"x36" open table with terrain pieces, and battle cards. Where this file says "per R-x" the M0 rules research (`10-rules-core.md`) pins the detail; this file only fixes where it lives.

Edition neutrality (cheap only): the action catalogue, dice face tables, rank list, movement-tool geometry, base sizes and silhouettes, range-band length and rule constants are data (`src/data/core/`); statuses, token kinds and keyword ids are open string unions; `GameSetup.ruleset` names the edition (one value in v1, set at M0).

## 1. Modules

| Module | Path | May import | Must not | Runtime |
|---|---|---|---|---|
| engine | `src/engine/` | itself (+ type-only `src/data/types`) | DOM, React, Three, timers, `Math.random`, `Date` | node + browser + worker |
| data | `src/data/` | schemas only | code with side effects | JSON validated by `tools/validate-data.ts` (ajv) |
| ai | `src/ai/` | engine (read-only API), data | client, Three | node + worker |
| client | `src/client/` | engine, ai, data | mutate `GameState`, compute a rules number | browser |
| tools | `tools/` | anything (node) | be imported by `src` | node |
| tests | `tests/` | everything | - | vitest / playwright |
| legacy | `legacy/` | - | be imported by anything | outside `tsconfig` and vitest include; deleted when the port is done |

Dependency direction `data <- engine <- ai <- client`, enforced by `tests/boundaries.test.ts` (greps imports; also refuses any import of `legacy/`). Path alias `@/` -> `src/`.

### Engine files

```
src/engine/
  -- contract (frozen after M2) --
  types.ts        contract types (sections 2-7)
  actions.ts      act.* envelope constructors (no hand-built envelopes anywhere)
  events.ts       GameEvent union (section 5)
  hooks.ts        hook names, timing windows, registerHook/runHook, window opener
  rng.ts          seeded xoshiro128** + ScriptedRng + sha256/fnv1a       (KEEP from legacy)
  decider.ts      Decider + ReplayDecider                                  (KEEP)
  view.ts         view(state, seat) and redactEvents(events, seat): hidden picks, pool order, rng, log
  index.ts        createGame / step / legalActions / validate / replay / view / save / load / undo / suggest / query
  -- plumbing --
  registry.ts     ModuleDef, Ctx (emit, roll, draw, raise), reject        (ADAPT: dice kinds from data)
  apply.ts        envelope checks -> owner of pending.kind -> afterAction (engagement, cohesion flags) -> log + hash
  modules.ts      namespace -> module table (exactly one owner per namespace)
  state.ts        unit/mini helpers, immutable clone, canonical hash, EngineInvariantError
  bundle.ts       EngineBundle + bundleFromData (units, weapons, keywords, upgrades, cards, dice, battle cards)
  code-hooks.ts   registry of {"code"} escape hatches, params validators, fire counts for tests
  effects.ts      timed effects (until end of activation / round / game) and expiry
  -- space --
  geometry.ts     pure 2D/3D: segments, polygons, circles, rays, intervals    (ADAPT)
  footprint.ts    round and notched bases from data base sizes               (ADAPT)
  table.ts        compile a battlefield (terrain pieces, deployment zones, objective markers) into TableDef
  measure.ts      base-edge distance, range bands, "within range X", base contact, engagement
  tool.ts         movement tool: speed templates, hinge solving, swept base path, placement checks
  los.ts          silhouette ray sampling, LoS verdict, cover per terrain piece
  -- rules modules (namespace owners) --
  setup.ts        SET setup.*      army lists, battle-deck draft/selection, deployment, starting tokens
  command.ts      CMD command.*    hidden simultaneous pick (seat 'all'), reveal, priority, orders, order pool
  activation.ts   ACT activation.* turn alternation, order use or pool draw, rally, action ledger, standby
  movement.ts     MOV move.*       movement tool moves, trooper placement, cohesion, climb, difficult terrain, withdraw
  attack.ts       ATK attack.*     the attack pipeline (section 7.5) for ranged and melee
  melee.ts        MEL melee.*      charge, engagement, melee-only restrictions, leaving combat
  morale.ts       (no namespace)   suppression, suppressed, panic, courage sources, rally helper
  keywords.ts     KEY keyword.*    declarative keyword effects + code hooks at windows; keyword.choice
  commandCards.ts CC  card.*       command-card effects and their windows (owned decisions), card ledger
  battle.ts       BTL battle.*     objectives, deployments, conditions, scoring, victory, GameEnded
  endphase.ts     END end.*        token removal, scoring hand-off, round advance
  dice.ts         (no namespace)   attack d8 / defence d6 faces from data; exact pool distributions
  query.ts        (no namespace)   every number the UI or AI shows (section 7.7)
  armies/index.ts imports each faction's code-hook file once (empire.ts, rebels.ts); faction code lives only there
```

## 2. Engine contract

```ts
step(state: GameState, action: Action, rng?: Rng): StepResult
interface StepResult {
  state: GameState;                 // new state, or the SAME reference when rejected
  events: GameEvent[];              // ordered; [ActionRejected] when rejected
  pending: PendingDecision | null;  // null only when state.phase === 'ended'
  rejection?: Rejection;
}
```

| Function | Purpose |
|---|---|
| `createGame(setup, seed, bundle)` | validates the setup (army legality per R-x and `20-data-schema.md`, ids, battle cards), compiles the table, raises the first decision. Throws `EngineInvariantError` on an invalid setup (setups come from the army picker or the sim, never a Decider). |
| `step(state, action, rng?)` | pure reducer; never throws on illegal input; throws only on corrupt state. |
| `legalActions(state, pending, seat?)` | enumerated answers for finite decisions; `seat` is required when `pending.seat === 'all'` and returns that seat's answers (empty only once that seat has answered). `null` for continuous decisions (`move.tool`, `move.troopers`, `setup.deploy`, `battle.place`). **Never empty for an open finite decision and a seat that still owes an answer.** Every member passes `validate`. |
| `validate(state, action)` | the same checks `step` runs, no mutation; the only legality test for continuous answers. |
| `replay(setup, seed, actions, bundle)` | folds `step` from `createGame`; returns `hashes` and `failedAt`. |
| `view(state, seat)` | `PlayerView`: strips `rng` and `log`, redacts the other seat's unrevealed command pick and the order of every order pool (section 3.2). Deciders see only a `PlayerView`. `redactEvents(events, seat)` does the same for an event batch. |
| `suggest(state, pending, seat?)` | engine default answer (deploy spot, tool placement toward a point, trooper placement); used by "do it for me", the random bot and the AI fallback. |
| `save / load / undo` | `SaveFile { version, engineVersion, setup, seed, actions, finalHash }`; undo vs AI only for actions that drew no RNG and revealed nothing. |

Reducer rules: state is immutable; no I/O, clock or `Math.random`; one action -> zero or more events -> exactly one new `pending`; every rule effect emits an event; the client rebuilds what it shows from events + state. Rolls with no choice (priority tie roll-off, rally dice, panic checks, pool draws) happen inside the step and are never decisions.

## 3. Decision model

```ts
type Seat = 'A' | 'B'
interface PendingDecision {
  id: string;                   // "d:<n>" monotonic
  seat: Seat | 'all';           // 'all' = simultaneous; each seat answers once
  kind: DecisionKind;           // "<namespace>.<verb>"
  window: TimingWindowId;       // section 4
  context: Record<string, unknown>; // ids and engine numbers (odds, bands, distances, suggestion); for 'all': answered: Seat[]
  options?: DecisionOption[];   // finite answers, each a ready-made Action with a label key and data
  constraints?: MoveConstraints;// continuous answers (tool geometry, region, cohesion rule)
  canPass: boolean;
}
```

### 3.1 Decision kinds (v1; the exact triggers per R-x)

| Kind | Seat | Payload / notes |
|---|---|---|
| `setup.battle` | per R-x (battle-deck selection) | `{ cardId }` per selection step; `options.autoBattle` lets the engine pick. |
| `setup.deploy` | deploying seat, alternating units per R-x | continuous `{ unitId, leader: {x,z,yaw}, troopers?: {x,z,yaw}[] }` inside `constraints.region`; troopers omitted = engine placement in cohesion. |
| `command.pick` | `'all'` | `{ cardId }` from the seat's remaining hand. Answers are stored in `state.command.picks` and hidden from the other seat (view, events) until both are in, then `CommandCardsRevealed`. |
| `command.issuer` | each seat in priority order, when several units could issue | `{ unitId }` (the commander or operative issuing per R-x). |
| `command.order` | issuing seat | `{ unitId }` one order at a time, or `{ done: true }` when the rules let a seat stop early; eligibility (range, rank, card restrictions) per R-x. |
| `activation.choose` | seat on turn | `{ unitId }` of a unit with a face-up order, or `{ drawPool: true }` (engine draws a random token of the remaining pool; then `activation.pick`). Option data: rank, suppression, standby. |
| `activation.pick` | seat on turn | after a pool draw: `{ unitId }` among that seat's order-less units of the drawn rank. |
| `action.choose` | active unit's seat | `{ action, ...params }` (move speed, weapon set, target, card action, keyword action) or `{ action: 'end' }`. Options carry engine numbers; `context.withheld` lists absent actions with a reason (`whyNot`). |
| `move.tool` | mover's seat | continuous: `{ speed, hinges: number[], length, yaw? }` = tool start against the leader's base, hinge angles, distance along the tool, final leader yaw (per R-x). `pass` cancels before anything resolved. |
| `move.troopers` | mover's seat | continuous: `{ placements: {miniId,x,z,yaw}[] }` after the leader moved; `context.suggestion` is the engine placement; validated for cohesion and overlap. |
| `attack.*` | per step (7.5) | `attack.defender`, `attack.pool` (`{ weaponIds }` per mini), `attack.extraDefender`, `attack.spend` (aim/reroll, surge tokens, dodge, card and keyword spends: one decision per window with options, never auto-assumed), `attack.allocate` when the defender chooses wound order per R-x. |
| `activation.standby` | seat holding a standby unit, when triggered | `{ unitId, response }` or pass (per R-x). |
| `keyword.choice` | any | enumerated choice raised by a keyword; `context.keyword` names it. |
| `card.choice` | any | enumerated choice raised by a command card; `context.cardId`. |
| `battle.place` | per battle card | continuous `{ x, z }` (objective tokens etc.) when a card has a player place something. |
| `end.choice` | per R-x | only if an End-phase rule offers one. |
| `confirm` | any | `{ choice: 'continue' \| 'concede' }` at battle end. |

No decision exists for: the tie roll-off, pool draws, rally rolls, panic checks, defence rolls, automatic wound allocation, token removal, scoring.

### 3.2 Simultaneous and hidden decisions

- `seat: 'all'` decisions stay open (same id) until every seat answered; `context.answered` lists who has, never what. A second answer from the same seat is `E_ALREADY_ANSWERED`. The step that takes the last answer resolves the decision.
- Hidden data: (1) a seat's command pick until `CommandCardsRevealed`; (2) the order of each order pool (the pool's size per rank is shown per R-x; which token comes next is RNG at draw time, so `view` hiding `rng` is what protects it); (3) a drawn token is shown to its seat when drawn and to the other seat when the unit is picked. `view` and `redactEvents` replace hidden ids with `{ hidden: true }`. The sim's leak test (60-testing) checks both.
- Every other fact is open information: army lists, remaining command cards, tokens, wounds, suppression.

### Decider
```ts
interface Decider { decide(view: PlayerView, pending: PendingDecision, legal: Action[] | null): Promise<Action>; cancel?(): void }
```
Human UI, AI, random bot and replay implement the same interface. The game loop (client store or `tools/sim-core.ts`) is the only caller of `step`; for `'all'` decisions it asks each seat's decider with that seat's `view` and `legalActions(state, pending, seat)`.

## 4. Timing windows

`TimingWindowId` is shared by engine, data (keyword and card `window`), AI and UI. A window opens a decision only when a seat can actually act there; otherwise hooks run silently.

`setup.*`, `round.start`, `command.picked`, `command.revealed`, `command.priority`, `command.ordersIssued`, `activation.phaseStart`, `activation.start` (before rally), `activation.rallied`, `action.declared`, `move.started`, `move.ended` (standby triggers per R-x), `action.resolved`, `attack.defenderDeclared`, `attack.poolFormed`, `attack.rolled`, `attack.rerolled`, `attack.surgesConverted`, `attack.coverApplied`, `attack.modified`, `defence.rolled`, `defence.surgesConverted`, `defence.modified`, `attack.compared`, `attack.woundsAssigned`, `attack.suppression`, `attack.resolved`, `melee.charged`, `mini.defeated`, `unit.defeated`, `activation.end`, `end.start`, `end.scoring`, `round.end`, `battle.end`.

Order when both seats could act in one window: the active seat first, then the other; outside activations the priority holder first.

## 5. Actions and events

Envelope `{ type, seat, decisionId, seq, payload }`; `type` = the DecisionKind answered, or `pass` / `resign`. `seq` assigned on accept. Action ids inside `action.choose` come from `src/data/core/actions.json` (move, attack, aim, dodge, standby, recover, card and keyword actions add `card:<id>` / `kw:<id>`), each with `free: boolean` and repeat rules from data per R-x.

Event families (all carry `seq`, `round`, `phase`, `seat`; hidden fields are redacted by `redactEvents`):

- game: `GameCreated`, `RoundStarted`, `PhaseStarted`, `PhaseEnded`, `RoundEnded`, `GameEnded { result }`.
- setup: `BattleCardChosen`, `UnitDeployed { unitId, minis }`.
- command: `CommandCardPicked { seat, cardId? }` (cardId hidden from the other seat), `CommandCardsRevealed { picks }`, `PriorityDecided { holder, pips, rolloff? }`, `OrderIssued { unitId, by }`, `OrderPoolFormed { seat, size, byRank }`, `PoolTokenDrawn { seat, rank }` (rank hidden from the other seat until `UnitActivated`).
- activation: `UnitActivated { unitId, via: 'order' \| 'pool' }`, `Rallied { unitId, dice, removed }`, `ActionDeclared`, `ActionResolved`, `ActionCancelled`, `ActivationEnded { unitId, actionsUsed }`, `StandbyTriggered`.
- movement: `UnitMoved { unitId, speed, toolPath, leaderFrom, leaderTo, minis }`, `TroopersPlaced`, `Climbed`, `CohesionBroken` (only where a rule allows it).
- attack: `AttackDeclared`, `PoolFormed { dice }`, `AttackRolled`, `Rerolled`, `SurgesConverted`, `CoverApplied { cover, byTerrainId }`, `DodgeSpent`, `DefenceRolled`, `Compared { hits, crits, blocks, wounds }`, `WoundsAssigned { miniId, wounds }`, `MiniDefeated`, `UnitDefeated`, `SuppressionChanged { unitId, from, to, reason }`.
- morale: `PanicChecked`, `UnitPanicked`, `CourageSourceUsed`.
- tokens: `TokenChanged { unitId, kind, from, to }` (aim, dodge, standby, surge, keyword tokens; open union).
- cards and keywords: `CardEffect { cardId, detail }`, `KeywordFired { unitId, keyword, detail }`.
- battle: `ObjectiveChanged`, `PointsScored { seat, amount, reason }`.
- dice: `DiceRolled { purpose, die: 'atk:red' \| 'atk:black' \| 'atk:white' \| 'def:red' \| 'def:white' \| 'd6', faces, final }` for every physical roll.
- meta: `ActionRejected`, `DecisionRequested`.

## 6. Determinism, log, replay

`Rng` = xoshiro128** seeded from `sha256(seed)`; `state.rng` is authoritative. Every roll goes through `ctx.roll(purpose, n, die)` (a die index mapped through the face table in `core/dice.json`) and every random pick through `ctx.draw(purpose, n)`; both emit events. `state.log` is append-only (hidden picks included, which is why `view` strips it); `state.hash` = fnv1a of canonical state minus log, recomputed per step; `replay` reproduces the hash at every seq. `ScriptedRng` feeds exact face indexes and draws for checklist tests and throws when the script runs dry. `ENGINE_VERSION` 0.1.0 at M0, 1.0.0 at the M2 freeze.

## 7. Space, units and the pipeline

### 7.1 Table and coordinates

| Item | Definition |
|---|---|
| Units | 1.0 = 1 inch; base mm converted once at load (`mm / 25.4`). Positions and lengths rounded to 1/1000 inch after every placement (canonical for the hash). |
| Axes | Y up, table plane XZ, right-handed; miniature front = +Z at yaw 0; yaw in radians, clockwise from above. |
| Table | 72" x 36": x in [-36, 36], z in [-18, 18]; seat edges and deployment zones come from the battle card (data). |
| Range | range band = 6" (data constant); band n covers (6(n-1), 6n]; beyond the last band per R-x. Measured base edge to base edge per R-x. |
| Terrain | data pieces `{ id, footprint: Polygon, height, cover: 'none' \| 'light' \| 'heavy', blocksLos, movement: 'open' \| 'difficult' \| 'impassable', climbable }`; categories and their exact effects per R-x. Props are decoration, never rules geometry. |
| Bases | sizes from data (small, medium, large, huge per R-x), round or notched (notched bases arrive with vehicles, M2b). |
| Silhouettes | per base size from data: a vertical volume (radius, height) sampled for LoS. |

### 7.2 Measuring, contact, engagement, cohesion

- Distance = closest base edges; "within range X" = distance <= 6X (inclusive per R-x). Base contact: gap <= `CONTACT_EPS` = 0.002".
- Engaged (derived, never authored): units with miniatures in base contact per R-x; recomputed in `apply.afterAction`, cached as `unit.engagedWith`.
- Cohesion: every trooper within the cohesion distance of the unit leader (horizontal and vertical limits from data, per R-x). Checked after every move and placement; a rule that allows breaking it (e.g. a defeated leader replaced) sets an explicit flag the sim accepts.

### 7.3 Movement tool

The tool's segments, lengths and hinge points per speed (1-3) come from `core/movementTool.json` (measured per R-x). A move is a continuous decision: the engine solves the hinged polyline from the leader's base front, sweeps the base along it, rejects overlap with impassable terrain, other bases and engaged enemies (`E_OVERLAP`, `E_TERRAIN`), applies difficult terrain (speed reduction per R-x) and climbing (vertical moves per R-x), then asks `move.troopers` (or places them with `suggest`). `query.toolPreview(state, unitId, speed, hinges, length)` returns the swept path, the leader ghost, the trooper placement and the verdict, so the client and AI draw and score exactly what `validate` will accept. Notched bases and pivots: later (M2b).

### 7.4 Line of sight and cover

- LoS from a miniature: rays from sample points on the attacker's silhouette to sample points on the target's silhouette (counts and layout from data); blocked by terrain with `blocksLos` (3D intersection with the footprint prism) and per R-x by other units. A mini has LoS if any ray is clear.
- Cover: each sampled ray that is obscured is attributed to the first terrain piece (or unit, per R-x) that obscures it; the defender's cover level comes from the obscuring pieces and the share of obscured minis per R-x. `CoverApplied.byTerrainId` and `query.losCover` return the rays and attributions so the client draws what the engine judged.

### 7.5 Attack pipeline (`attack.ts`, one machine for ranged and melee)

Named steps, each a timing window (4) and a frame in `state.attack`: `declareDefender` -> `formPool` -> `extraDefender` -> `rollAttack` (roll, reroll, convert surges) -> `dodgeAndCover` -> `modifyAttack` -> `rollDefence` (roll, convert surges) -> `modifyDefence` -> `compare` -> `assignWounds` -> `suppression` -> next pool or resolved. The exact order, what each step may do and the melee differences are per R-x; adding a step later is additive. Dice faces (crit, hit, surge, blank; block, surge, blank) come from data and are tested face by face. Keywords and cards act only at these windows.

### 7.6 Unit and game state

```ts
interface Mini { id: string; isLeader: boolean; pos: Vec3; yaw: number; baseSize: string; wounds: number; maxWounds: number; alive: boolean }
interface Unit {
  id: string; seat: Seat; unitTypeId: string; rank: string        // rank ids from data
  minis: Mini[]; leaderId: string
  location: 'reserve' | 'table' | 'defeated'
  order: { state: 'none' | 'faceUp' | 'pool' | 'spent' }          // at most one order token per unit
  activated: boolean
  suppression: number; tokens: Record<string, number>             // aim, dodge, standby, surge, ... (open union)
  keywords: { id: string; x?: number; params?: Record<string, unknown> }[]
  weapons: string[]; upgrades: string[]
  engagedWith: string[]                                           // derived cache
  flags: Record<string, unknown>                                  // e.g. cohesionWaived, panicked (derived where possible)
}
interface Activation { unitId: string; seat: Seat; via: 'order' | 'pool'; actionsLeft: number;
  performed: { action: string; free: boolean }[]; declared: { action: string; params?: object } | null }
interface GameState {
  version: 1; engineVersion: string; seed: string; ruleset: string
  phase: 'setup' | 'command' | 'activation' | 'end' | 'ended'
  round: number; seq: number; nextDecision: number
  pending: PendingDecision | null; rng: RngState; hash: string; log: Action[]
  origin: { setup: GameSetup }; data: GameData                    // snapshot of every record used
  table: TableState                                               // { def: TableDef, objectives, markers }
  players: Record<Seat, { armyId: string; hand: string[]; played: string[]; points: number; pool: OrderPool }>
  units: Record<string, Unit>
  command: { picks: Partial<Record<Seat, string>>; revealed: boolean; priority: Seat | null; issuing: CommandIssue | null }
  activation: { turn: Seat | null; current: Activation | null; drawn: { seat: Seat; rank: string } | null }
  attack: AttackState | null; effects: ActiveEffect[]; battle: BattleState
  result: GameResult | null       // { winner: Seat | 'draw', points, reason: 'battle' | 'resign' | 'concede' | 'roundLimit' }
}
interface OrderPool { tokens: string[] }   // ranks, unordered: draws pick by rng; view exposes counts only
interface GameSetup { ruleset: string; battle: { cards: string[] } | { auto: true };
  armies: Record<Seat, { factionId: string; listId?: string; units: RosterUnit[]; commandHand: string[] }>;
  options?: { autoDeploy?: boolean; autoBattle?: boolean; maxRounds?: number; firstPriority?: Seat } }
```

### 7.7 query.* (the only source of displayed numbers)

`rangeBand`, `distance`, `inRange`, `engagedWith`, `cohesion(unitId)`, `toolPreview`, `moveOptions(unitId)` (speeds, modifiers, reasons), `losCover(attackerUnitId, defenderUnitId)` (rays, blockers, cover per terrain), `attackTargets(unitId)` (eligible defenders, band, LoS, cover, weapons in range), `attackPool(attacker, weaponIds, defender)`, `attackOdds(...)` -> `{ pHits, pCrits, expectedWounds, woundDist, pDefeat, suppressionAdded }`, `defenceOdds`, `rallyOdds(unitId)`, `panicOdds(unitId)`, `courageSource(unitId)`, `actionMenu(unitId)` with `withheld`/`whyNot`, `orderTargets(issuerId)`, `poolView(seat)`, `priorityPreview(seatPick?)` (own pick only), `standbyEligible`, `keywordsOf(unitId)` (ids and data names), `battleView` (objectives, scores, round, victory projection). The client and the AI read these; neither re-derives a rule.

## 8. Error handling

`step` never throws on bad input: `rejection { code, reason, details? }`, same state, pending unchanged, `events = [ActionRejected]`. Codes: `E_WRONG_DECISION`, `E_WRONG_SEAT`, `E_ALREADY_ANSWERED`, `E_NOT_AN_OPTION`, `E_OUT_OF_RANGE`, `E_OVERLAP`, `E_TERRAIN`, `E_OFF_TOOL` (not a legal tool placement), `E_COHESION`, `E_ENGAGED`, `E_NO_ACTIONS`, `E_ACTION_RESTRICTED`, `E_INVALID_TARGET`, `E_NOT_VISIBLE`, `E_CARD_RESTRICTED`, `E_PASS_NOT_ALLOWED`, `E_GAME_OVER`, `E_SCHEMA`, `E_TODO` (a rule stubbed until a later stage). Programmer errors throw `EngineInvariantError`.

## 9. Keywords and command cards

- Keywords are data records `{ id, name, source, window, effect }` where `effect` is declarative JSON (token grants, dice modifications, range or speed changes, action grants, restrictions) or `{ "code": "<hook>", params }`. Code hooks are registered in `code-hooks.ts` or `armies/<faction>.ts`, validate their params at load, and count firings for tests.
- `{ "unimplemented": "<why>" }` is allowed in data, and `validate:data` refuses it in any army marked `playable: true`.
- A new timing is a new window in section 4 (additive), never an army branch in a rules module.
- Command cards: data `{ id, name, source, pips, orders, issuer, effect, window }`; `commandCards.ts` applies effects at their windows and owns `card.choice`. The card ledger (`players.played`) is open information.

## 10. Performance budgets

`step` p50 < 0.5 ms (p99 < 3 ms excluding LoS enumeration); `legalActions` < 5 ms; `query.attackTargets` (LoS + cover for 10 vs 10 units) < 10 ms; `toolPreview` < 1 ms; headless sim >= 5 games/s (random bots, slice armies); AI normal p50 < 50 ms per decision in a worker (3 s hard stop); client 60 fps with the slice on the table; JS <= 2.5 MB gzip; `GameState` JSON < 150 KB.

## Settled items

- Pre-measuring is allowed for human and AI per R-x; every `query` distance is available before committing.
- Engagement and cohesion are derived from geometry after every step.
- Rolls with no choice are automatic; the presentation director plays them from `DiceRolled`.
- Every spend the rules make optional (aim, dodge, surge tokens, cards, keywords) is a decision with options when it is usable; never assumed.

## 11. Contract change log (additive only)

| Date | Stage | Change |
|---|---|---|
| 2026-10-29 | M0 | Initial Legion contract over Mancermundo's (`legacy/`). Kept: `step` / `StepResult` / `validate` / `replay` / `save` / `load` / `undo` / `suggest`, the envelope, `PendingDecision`, `Decider`, `Rng`, registry, code hooks, hash and replay rules. Added: `seat: 'all'`, `context.answered`, `legalActions(state, pending, seat?)`, `redactEvents`, `ctx.draw`, `E_ALREADY_ANSWERED`, `E_OFF_TOOL`, `E_COHESION`, `E_ENGAGED`, `E_CARD_RESTRICTED`, `E_TERRAIN`. Replaced: phases, namespaces, decision kinds, windows, events, state (fighter -> unit of minis), space (Zone Mortalis -> 72"x36" table with terrain pieces, silhouette LoS). |
| 2026-10-29 | M2a | Space and plumbing landed. Additive: `Rng.int(n)` (every die and draw is a face or pool index; scripts name indexes), `ctx.draw` / `ctx.reveal` / `ctx.lastAnswer`, events `Drawn` and `DiceRolled.indexes`, `GameState.undoFence`, `GameSetup.layout`, `PlayerView` also drops `seed` and `hash`, `pending.context.seats` (seats owing an 'all' answer), `move.tool` payload `{ speed, start, heading, hinges, leader, climb? }`, `EngineBundle` defined in `types.ts`, `E_OUT_OF_RANGE` for an off-table leader, `ModuleDef.init` / `suggest`, `setModule` / `resetModules` test seam. |
| 2026-10-29 | M2b-flow | Flow modules landed. Additive: `GameData` also carries `formats, maps, unitTypes, actions, ranks, tokens, armyLists, factions` (optional); `GameSetup.format` (default `recon`) and `GameSetup.blue` (forces the blue player); `PlayerState.passTokens`; `Mini.upgradeId` / `Mini.weaponId` (heavy-weapon models); `BattleData` and `FlowState` in `state.battle.data`; events `BluePlayerDecided`, `EdgeChosen`, `PoolTokenRemoved`, `PassTokensGranted`, `Passed`, `UnitPromoted`, `CardDiscarded`, `CardReturned` (`FlowEventBody`); `setup.battle` also answers with `cardId: 'edge:<zMax|xMax|zMin|xMin>'`; `bundleFromData(db)` takes the loaded data (the engine never imports it); `registerAttackSeam` (activation.ts) and the `'activation.action'` / `'flow'` frame resumes are the seams the combat modules use; `useStubModules()` for contract tests. |
| 2026-10-29 | M2b-combat | Attack pipeline, keywords, morale, cards. Additive. **Types** (`// --- M2b-combat ---` blocks): `Mini.weaponIds` / `Mini.upgradeId` (declaration merge: weapons of upgrade models; absent = the card's weapons), `AttackFrame` / `PoolFrame` / `AtkDie` / `CoverRecord` / `StartAttackInput` / `FreeActionGrant` / `CodeOffer`; window `attack.declaring` (Long Shot) and `card.revealed` (cast to `TimingWindowId`, as in 14-armies 4.4). **Events**: `WeaponsAdded`, `DiceShifted`, `ResultsCancelled`, `ResultsChanged`, `CoverRolled`, `WoundsSuffered`, `LeaderReplaced`, `AttackSkipped`, `AttackEnded`, `MeleeContact`. **Entry points** (functions, no state of their own): `attack.startAttack(ctx, { attackerId, resume, free?, rangedOnly?, meleeOnly?, forcedDefenderId? })` (the caller registers `resume` with `registerFrameResume`; it is called with `'finished' \| 'cancelled'` and must raise the next decision), `keywords.fireWindow(ctx, window, info, resume?)` (true = a `keyword.choice` / `card.choice` was raised; the interpreter calls the frame-resume after the last answer; without `resume` optional effects are skipped), `commandCards.activateCard / divulgeCard / onOrderIssued / cardActions / runCardAction / orderSpec / orderTargets / cardPlayable / cardReturnsToHand`, `morale.rallyRoll / actionsFor / panicRelief / applySuppression / removeSuppression / refreshPanic / isSuppressed / isPanicked`, `melee.canMoveIntoMelee / planMeleeContact / withdrawRules / isEngaged`, `armies.runBattleHook`. **Decisions**: `attack.defender` (pass cancels before any pool), `attack.pool` (options per `pool:<kind>:all\|only:<weapon>\|except:<weapon>`, `auto` flagged), `attack.extraDefender`, `attack.spend` (`context.step`: reroll, surgeTokens, dodge, defSurgeTokens, sniper; choices `reroll`, `rerollDone`, `surge`, `dodge`, `defSurge`, `sniperCancel`, `sniperKeep`), `attack.allocate` (`context.purpose` wound or leader), `keyword.choice` / `card.choice` (`context.stage` use, option, pick, distribute, offer; options `use` `skip` `opt:<i>` `unit:<id>` `done`). **State conventions**: token keys are the short names `aim dodge surge standby observation` (suppression is `Unit.suppression`); `ActiveEffect.kind` values `cardEffect`, `keyword` (data.keyword), `modifier`, `limit`, `freeAction` (data = `FreeActionGrant`; the activation module offers and consumes it), `extraAction` / `fewerActions` (read with `keywords.actionDelta`), `controlledMove`; `unit.flags`: `removedKeywords`, `cardSide`, `exhausted`, `expended`, `panicked`, `returnedToPool`, `movedThisActivation`, `implacable`; `battle.data`: `dropped`, `divulged`, `bunkerWounds`, `destroyed`, `suppressionGains`. Unit keywords, weapons per model and dice are derived from `GameData` records (`units`, `weapons`, `keywords`, `upgrades`, `cards` as raw data JSON), so `bundle.ts` must pass those records through unchanged. |
| 2026-10-29 | M2-integrate | Flow and combat merged. Additive: `MoveFrame.kind` also `'controlled'` (a move its opponent places: Force Push); `AttackOpts.weapons` (a granted free attack limited to melee or ranged); `activation.grantedFreeActions(state, unitId)`. **Wiring**: `modules.ts` registers all ten modules and the window opener (`openWindow` -> `keywords.fireWindow(window, { unitId }, { name: 'flow' })`, resumed by the `flow` frame-resume); `attack.ts` registers the attack seam (frame-resume `activation.action`); `command.ts` activates the revealed cards (`activateCard`) and fires `OrderIssued` per order (frame-resume `command.issue`); activation uses `morale.ts` for courage, Suppressed, Panicked, rally, panic relief and the allowance (`actionsFor` reads `extraAction` / `fewerActions`); `morale.dropAssets` is `battle.dropAssets`; `defeatUnit` calls `dropAssets`, `dropOrderToken` and `loseStandby`; movement sets `movedThisActivation` and calls `refreshPanic`. **Action menu**: `free:<effectId>` items for granted free actions (a `startOfActions` grant is the only item), `card:<actionId>` items for upgrade and command-card actions; `unit.flags.returnedToPool` keeps a unit activatable. `validate:data` takes the engine's registered hooks; pending hooks are off unless `--allow-pending-codes`. Token keys are the short names everywhere. |
