# 60 - Testing

Lean: tests protect a working build. About 10 focused tests per stage, not a coverage target. Engine tests are named by checklist ID from `12-rules-test-checklist.md` (`it('ATK-004 ...')`); before each push an agent greps the IDs present in tests and lists the uncovered ones in `STATUS.md`.

## 1. Commands and gates

| Gate | Command | Passes when |
|---|---|---|
| G1 | `npm run typecheck` | clean |
| G2 | `npm test` | every Vitest suite green (`tests/{engine,data,ai,client}`, `tests/boundaries.test.ts`) |
| G3 | `npm run validate:data` | `ok (<n> records)`, 0 problems, no `{unimplemented}` in a playable army |
| G4 | `npm run sim -- --games 100` | 100/100 games end by their battle cards, 0 invariant violations, 0 leaks, 0 bot rejections |
| G5 | `npm run bench:ai` | the gates of `40-ai.md` section 7 (from M4) |
| G6 | `npm run e2e` | Playwright specs pass, one full game to the end screen, no console errors |
| G7 | `npm run build` | builds; JS <= 2.5 MB gzip |

`npm run sim` flags: `--games N`, `--seed S`, `--matchup mirror|main|all`, `--battle <ids>|all`, `--rounds N` (off by default), `--replay tools/out/sim-report.json [index]`. Output: totals, event counters, wins by seat and faction, mean rounds, games/s; failing seeds with action logs in `tools/out/sim-report.json`.

## 2. Engine tests

- `ScriptedRng([...])` feeds exact die face indexes and pool draws in the order the rules draw them; it throws when the script runs dry or a value is out of range.
- Fixtures (`tests/fixtures/`): synthetic units (`units.ts`: a commander, two corps units, a support unit with chosen keywords), `dice.ts` (the real face tables), `tables.ts` (open table, one light-cover wall, one heavy-cover block, difficult terrain, a climbable piece), `real.ts` (slice armies through `bundleFromData`), `helpers.ts` (`startGame`, `place`, `edit`, `pick`, `activate`, `playOut`).
- Rules tests use synthetic fixtures so they survive data corrections; battle-card and army tests use the real data.
- **Dice faces:** each colour's face table tested face by face against the source (`DICE-*`), so no symbol sits on the wrong face.
- **Golden** (`golden.test.ts`, GOLDEN-001): the worked turn of `13-golden.md` with forced dice (command picks, priority, orders, two activations with a move, an attack with cover, dodge and suppression, the End phase), pinned as a digest: final hash, decision count, event counts, wounds and tokens per unit, points. Regenerate with `GOLDEN_PRINT=1`, read the changed events, paste the digest.
- **Action-fuzz** (`fuzz.test.ts`): random envelopes (wrong seat, wrong decision, out-of-range tool, bad ids, duplicate `'all'` answers) against seeded states: every one returns a `Rejection` with the same state reference; nothing throws.
- **Boundaries** (`tests/boundaries.test.ts`): import direction `data <- engine <- ai <- client`; no import from `legacy/` anywhere in `src/`, `tests/` or `tools/`.
- **Code hooks** (`code-hooks.test.ts`): every registered `{"code"}` hook has a params validator and fires in a real game (`hookFireCount > 0`); a query never counts as a firing.
- **Keyword behaviour:** one test per keyword used by a playable army, proving its effect at its window with forced dice (the test name carries the keyword id); a keyword without one fails the coverage check.
- **Hidden information** (`view.test.ts`): `view` and `redactEvents` hide the other seat's pick before the reveal and the pool's order always; the AI decider throws if it reads a redacted field.

## 3. Sim invariants (`tools/sim-core.ts`, checked after every step)

- no NaN or Infinity anywhere in the state;
- every mini's wounds within [0, max]; a defeated mini is off the table and never returns;
- every mini on the table is inside 72"x36", overlaps no other base and no impassable terrain;
- every unit is in cohesion after every move and placement, except where a rule sets an explicit waiver flag;
- suppression >= 0 and every token count >= 0;
- at most one order token per unit; face-up orders + pool + spent = units on the table for that seat;
- exactly one priority holder per round, decided by the revealed pips (roll-off only on a tie); each command card played at most as often as its rules allow, from the seat's own hand; orders issued <= the card's count and only to eligible units;
- action ledger legal: at most the allowed actions, repeat rules respected, free actions only where granted;
- every `DiceRolled` face exists in that die's table; `seq` increases by one;
- exactly one pending decision with a legal answer (every listed action passes `validate`; a continuous decision has a valid `suggest` or `canPass`) until the battle ends, then none;
- replay of the action log reproduces every hash; save/load round trip gives the same hash;
- **leak test per seat:** for every step, `view(state, s)` and `redactEvents(events, s)` contain no unrevealed command pick of the other seat and no pool order; changing the other seat's hidden pick (or the RNG) leaves seat `s`'s view byte-identical until the reveal or draw;
- the game ends within the battle cards' round count; at most `MAX_DECISIONS` = 4000; a **stall detector** fails when 200 consecutive decisions leave the progress key unchanged (phase, round, activations done, positions hash, wounds, tokens, points).

Sim bots are random-legal with light weights (move toward objectives and enemies via `suggest`, prefer attacks with LoS); test instruments, not a model of a player.

## 4. AI bench

`npm run bench:ai` (`40-ai.md` section 7): normal >= 95% decisive wins vs random in both seats on holdout seeds, fixed mirror and main matchups, normal >= easy, zero rejections, stalls and fallbacks, zero-action activations < 2%, mean decision < 50 ms. The bench doubles as a rules fuzzer: any engine rejection or invariant breach it finds is an engine bug first.

## 5. Playwright

`tests/e2e/play.spec.ts`: `?test=1&seats=human,bot&seed=e2e-1&speed=instant`, deploy, pick a command card, issue orders, move with the tool (`page.mouse` drags with >= 10 steps), attack, and play to the end screen. Also `home.spec.ts`, `watch.spec.ts` (AI vs AI to the end), `ui-consistency.spec.ts` (no native `title=`, every name resolves from data). Specs fail on console errors; screenshots go to `tools/out/` for the check-in. Each worktree uses its own `PW_PORT`.

## 6. Rules fidelity

Ambiguities are `RULING:` lines in `docs/needs-rules-check.md` with a status word; a test that pins a ruling names the ruling in a comment.
