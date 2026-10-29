# 13 - Golden examples (forced dice)

Two worked sequences with every intermediate number, replayed by `tests/engine/golden.test.ts` as `GOLDEN-001` (attack) and `GOLDEN-002` (command phase and first activations). `60-testing.md` calls the chained replay of both "GOLDEN-001"; the digest it pins (hash, decision count, event counts, wounds and tokens per unit) is taken after GOLDEN-002 then GOLDEN-001 on the same game. Rule refs are `10-rules-core.md`; checklist ids are `12-rules-test-checklist.md`.

Dice are a forced stream of **face names** consumed in the order listed; the test maps each name to the first matching face index of `core/dice.json` for `ScriptedRng`. Random picks (`ctx.draw`) are forced indexes into the canonical list stated at each draw. Player choices the rules leave open are pinned as answers.

**Stats are Fan-source**: taken from `docs/sources/legionhq2-cards-extracted-2026-10-29.json` (Legion HQ 2 bundle, 2026-06-19 data), not yet checked by eye against the AMG card PDFs. Fixtures field each unit at its printed model count with **no upgrades** (the starter boxes add upgrade models; not used here). Keywords not named below are stripped from the fixture so they cannot fire.

| Unit | Rank | Models x wounds | Defence (surge) | Courage | Speed | Weapons (range: dice) | Attack surge | Keywords used |
|---|---|---|---|---|---|---|---|---|
| Darth Vader, Dark Lord of the Sith | Commander | 1 x 8 | red (-) | null ("-") | 1 | Vader's Lightsaber (melee) | - | - |
| Stormtroopers | Corps | 4 x 1 | red (-) | 1 | 2 | E-11 Blaster Rifle (1-3: 1 white); Bludgeon (melee: 1 white) | hit | Precise 1 |
| Scout Troopers | Special Forces | 4 x 1 | white (block) | 2 | 2 | EC-17 Hold-Out Blaster; Unarmed | - | - |
| Luke Skywalker, Hero of the Rebellion | Commander | 1 x 6 | red (-) | 3 | 2 | Anakin's Lightsaber; Luke's Blaster | crit | - |
| Rebel Troopers | Corps | 4 x 1 | white (block) | 1 | 2 | A-200 Blaster Rifle (1-3: 1 black); Unarmed (melee: 1 black) | - | Nimble |
| Rebel Commandos | Special Forces | 4 x 1 | white (block) | 2 | 2 | A-200 Blaster Rifle; Unarmed | hit | - |
| Wookiee Warriors, Freedom Fighters | Special Forces | 3 x 3 | white (-) | 2 | 2 | Ryyk Blade; Kashyyyk Pistol | hit | - |

Table: Recon, 36"x36", x and z in [-18, 18]. Seat A = Empire, seat B = Rebels. Bases are 27 mm (radius 0.531"). Small silhouette 1.69" (R-10.1).

## GOLDEN-001: Stormtroopers shoot Rebel Troopers in light cover (Aim, Dodge, Standby, suppression)

Setup (round 2, Activation phase, both units deployed, no suppression on either):
- Stormtroopers (A), order face up: ST-1 leader (0, -8), ST-2 (-1.5, -8.5), ST-3 (1.5, -8.5), ST-4 (0, -9.5). Tokens: none.
- Rebel Troopers (B), already activated this round: RT-1 leader (0, 4), RT-2 (-2, 4.5), RT-3 (-1, 5.5), RT-4 (3.5, 4). Tokens: 1 Dodge, 1 Standby.
- Terrain: one crate, scatter, open, **light cover**, blocks LOS, footprint x [-4, 1] by z [1.5, 2.5], height 1.0". Nothing else within 3" of any model.
- Geometry facts the fixture must reproduce (asserted first, via `query.losCover`): closest Rebel model to ST-1 is RT-1 at 10.937" (range 2); every Stormtrooper sees at least one Rebel; ST-1 sees all four Rebels; the crate blocks at least one ray from ST-1 to RT-1, RT-2 and RT-3 (each within 3" of the crate) and no ray to RT-4.

Forced stream: attack `hit, blank, blank, surge`; reroll `crit, hit`; cover `block, surge, blank`; defence `surge, blank`.

1. A activates Stormtroopers via its order (`activation.choose`). Rally: 0 tokens, no dice (R-15.3).
2. Action 1: Aim. Stormtroopers gain 1 Aim (`TokenChanged aim 0->1`).
3. Standby window (R-5.12): the Stormtroopers' action resolved within range 2 (10.94" <= 12") and in LOS of the Rebel Troopers, who hold Standby, outside their activation. `activation.standby` is raised for B; **B passes**. The token stays (passing spends nothing). Checks ACT-018.
4. Action 2: Attack. Declare defender Rebel Troopers: in range 2 of the E-11 (1-3) and in ST-1's LOS (R-12.2).
5. Pool: all 4 Stormtroopers are eligible and add an E-11: **4 white attack dice** (R-12.3). No second pool.
6. Up/downgrade: none. Roll: ST-1..4 = `hit, blank, blank, surge`.
7. Reroll (R-12.5): `attack.spend` offers the Aim token with up to 2 + Precise 1 = 3 dice. A spends it on the two blanks only. Reroll = `crit, hit`. Dice: hit, crit, hit, surge. Aim 1->0. Checks ATK-009.
8. Convert surges: the surge chart turns the surge into a hit. Pool = **3 hits, 1 crit**. Suppression flag set (a hit or crit exists at the end of Roll Attack Dice, R-12.11).
9. Obscured (R-11.2): RT-1, RT-2, RT-3 obscured by the crate (light); RT-4 not. 3 of 4 >= half, so **cover; light**. Rebels are not Suppressed (0 < courage 1), so no improvement (R-11.3).
10. Cover pool: 1 white defence die per hit = 3 dice, `block, surge, blank`. Light cover cancels 1 hit per block only: **2 hits, 1 crit** remain (R-11.4). Checks COVER-008.
11. Dodge (R-12.6): `attack.spend` offers the Dodge; **B spends 1**. It cancels 1 hit: **1 hit, 1 crit**. Dodge 1->0. The crit cannot be dodged.
12. Modify attack dice: nothing. Backup: no (Rebel Troopers are Corps, R-14.6).
13. Defence: 1 + 1 = **2 white defence dice**; roll `surge, blank`; the Rebel defence surge chart turns the surge into a block: **1 block** (R-12.8).
14. Compare: 2 - 1 = **1 wound** (R-12.10). Ranged cap: ST-1 sees all 4 models, cap = 4 (R-14.3).
15. Assign: all non-leader models are identical 1-wound troopers, so allocation is automatic (R-14.2): the first non-leader in roster order, **RT-2, is defeated** (`WoundsAssigned`, `MiniDefeated`). Rebel Troopers: RT-1, RT-3, RT-4 remain.
16. Suppression (R-12.11): ranged, flag set, unit survives: Rebel Troopers **0 -> 1 suppression** (`SuppressionChanged reason: attack`). They are now **Suppressed** (1 >= 1), not Panicked (needs 2). Gaining suppression removes their **Standby 1 -> 0** (R-5.13; checks TOK-001).
17. Attack resolved. Nimble fires (the defender spent a Dodge this attack): Rebel Troopers **gain 1 Dodge** (`KeywordFired Nimble`). No Standby window opens (no token left). Stormtroopers have used 2 actions; activation ends, order token face down.

Assertions: attackDice = 4 white; afterReroll = {hit 2, crit 1, surge 1}; afterSurge = {hit 3, crit 1}; obscured = {RT-1, RT-2, RT-3}; cover = light; coverCancelled = 1; dodgeCancelled = 1; defenceDice = 2; blocks = 1; wounds = 1; defeated = [RT-2]; Rebel Troopers suppression = 1, dodge = 1, standby = 0; Stormtroopers aim = 0; decisions in order: activation.choose, action.choose (aim), activation.standby (pass), action.choose (attack), attack.defender, attack.pool, attack.spend (aim), attack.spend (dodge, seat B), then the next seat's activation.choose.

Variant pins (separate small tests, same fixture): with Rebels at 1 suppression before the attack, cover improves to **heavy** and the cover surge also cancels (2 cancelled, COVER-007); with the crate moved so RT-1 is 3.1" from it, only 2 of 4 are obscured, still cover (COVER-005).

## GOLDEN-002: Command phase with a priority tie, orders, pools and first activations

Setup: round 1, start of the Command phase, after Recon setup with **A blue**, A's edge z = -18, B's edge z = +18; fixture Territories are 6"-deep strips along each player's edge (the real Recon Map card replaces this fixture in `11-battles.md`). No unit has Prepared Position, so every unit is undeployed (R-3.10). Both hands contain the generic Push (2 pips, 2 units; Fan-source orders count, R-4.7).

Units: A = Vader, ST-A, ST-B (Stormtroopers), SC-A, SC-B (Scout Troopers): 5 units. B = Luke, RT-A, RT-B (Rebel Troopers), CMD (Rebel Commandos), WW (Wookiee Warriors): 5 units.

Forced stream: priority die `blank`; A's pool draw index 1; B's pool draw index 1.

1. `command.pick` (seat `'all'`). A answers Push: event `CommandCardPicked { seat: A }`; in B's view the card id is `{ hidden: true }` and `context.answered = [A]` (CMD-001). B answers Push. Both in: `CommandCardsRevealed { A: Push, B: Push }`.
2. Card effects: Push has none.
3. Priority (R-4.4): 2 pips vs 2 pips, a tie. The blue player (A) rolls one red defence die: `blank`. Not a block, so **B has priority** (`PriorityDecided { holder: B, pips: 2, rolloff: { roller: A, face: blank } }`; CMD-004).
4. Nominate (R-4.5): one Commander unit each (Luke, Vader), so no `command.issuer` decision.
5. Orders, B first (R-4.6): `command.order` for B offers all 5 B units and no "done"; B answers **WW**, then **RT-A**. Then A: **Vader**, then **ST-A**. Four `OrderIssued` events, each a face-up token of the unit's rank.
6. Order pools (R-4.8), canonical token order = rank order from data (commander, operative, corps, special forces, support, heavy): A = [corps (ST-B), special (SC-A), special (SC-B)]; B = [commander (Luke), corps (RT-B), special (CMD)]. `OrderPoolFormed` shows sizes per rank only.
7. Pass pool (R-4.9): 5 vs 5 units, difference 0: none.
8. Activation phase, B's turn (priority, ACT-001). `activation.choose` for B lists WW, RT-A and `drawPool`. B picks **WW** (`UnitActivated via order`). Rally: 0 tokens, no dice. WW is undeployed: `action.choose` offers only Move (ACT-017).
   - Move 1 (deploy, R-6.6): click leader destination (6, 10.469). The engine fits a straight Speed-2 tool (7.0") from the edge point (6, 18) perpendicular to the edge; the leader touches its tip (11.0 - 0.531 = 10.469). Troopers placed by `suggest` in cohesion. WW is now on the table.
   - Move 2: click (6, 2.407). Straight Speed-2 from the leader's base edge (6, 9.938) toward -z, tip at 2.938, leader centre 2.407.
   - Order token face down; `ActivationEnded { actionsUsed: 2 }`.
9. A's turn: `activation.choose` lists Vader, ST-A, `drawPool`. A picks **drawPool**: `ctx.draw` over A's pool, index **1** = **special forces**. `PoolTokenDrawn { seat: A, rank }` shows the rank to A and `{ hidden: true }` to B. `activation.pick` offers SC-A and SC-B (ACT-003); A picks **SC-B** (`UnitActivated via pool`, now visible to B). SC-B deploys: Move to (-6, -10.469) from edge point (-6, -18), then Dodge (SC-B gains 1 Dodge). A's pool is now [corps, special].
10. B's turn: B picks **drawPool**: index **1** of [commander, corps, special] = **corps**. The only un-ordered, unactivated B corps unit is RT-B (RT-A holds a face-up order), so it is **picked automatically** with no `activation.pick` decision. RT-B deploys with one Move to (-6, 10.469) and takes Dodge.

Assertions: priority = B; rolloff face = blank, roller = A; orders = {WW, RT-A, Vader, ST-A}; pool sizes after formation A {corps 1, special 2}, B {commander 1, corps 1, special 1}; pass pools empty; activation sequence = [WW (order), SC-B (pool, special), RT-B (pool, corps, auto-pick)]; B's view never contains A's card id before the reveal nor the drawn rank before `UnitActivated`; positions: WW leader (6, 2.407), SC-B leader (-6, -10.469), RT-B leader (-6, 10.469); SC-B dodge 1, RT-B dodge 1.

Variant pins: A Push vs B Ambush (1 pip) gives B priority with **no** die rolled (CMD-003); with A fielding 7 units against B's 5, B's pass pool gets 1 token (CMD-013).
