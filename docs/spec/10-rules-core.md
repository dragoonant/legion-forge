# 10 - Core rules specification

Edition: AMG **Core Rule Book effective 2026-06-17** (`docs/sources/amg-legion-core-rules-2026-06-17.txt`, "[CRB] pN" = printed page), with the Errata Reference (2026-06-17) and the Recon Rule Book (effective 2025-04-30, "[RECON]"). Everything below is our own paraphrase for engineers, never rules text. Rule ids `R-x.y` are stable and referenced by `12-rules-test-checklist.md`; every interpretation is a `RULING:` line in `docs/needs-rules-check.md` with the same id. The edition leak list in `docs/knowledge-base/star-wars-legion-rules-primer.md` applies: nothing on it is implemented.

Conventions: 1 world unit = 1 inch, y up. "Range n" = 6" band n; "half range" = 3" (the rulebook's half-range icon). "Leader" = unit leader. Keywords are out of scope (their own checklist later); a keyword is named here only where the core rules reserve a hook for it.

## 1. General principles

- R-1.1 Special rules on cards and keywords beat these core rules; when a "can" and a "cannot" collide, "cannot" wins [CRB p5].
- R-1.2 Simultaneous effects: the priority holder resolves theirs first; with no priority holder (setup, before round 1) the blue player goes first; a player orders their own simultaneous effects [CRB p6]. "After X" means once X has fully resolved.
- R-1.3 Open and secret information: the command hand's contents are secret; hand size, discards, the card ledger, tokens, wounds and army lists are open [CRB p18]. Digital: `view` redacts only the hand, the unrevealed pick and pool order (00-architecture 3.2).
- R-1.4 Any distance may be measured at any time [CRB p11]. Digital: every `query.*` distance is available before committing (pre-measuring allowed for human and AI).
- R-1.5 Stacking: tokens may rest on terrain and tokens, never on miniatures; miniatures may rest on tokens and terrain, never on each other; terrain never rests on tokens or miniatures [CRB p5].
- R-1.6 Base contact means bases touching. Across an elevation step two objects still count as in contact when, seen from above, there is no gap between them and the vertical gap is no more than either object's silhouette height [CRB p5]. Digital: horizontal gap <= `CONTACT_EPS` and vertical gap <= max silhouette height.
- R-1.7 Allied = controlled by that player; enemy = controlled by the other [CRB p6].

## 2. Game structure and victory

- R-2.1 A game is up to 5 rounds; each round is Command phase, Activation phase, End phase [CRB p21].
- R-2.2 Victory, checked in this order [CRB p20]: (a) at any moment, if only one player still has undefeated units, that player wins immediately (undeployed units count as undefeated); (b) at the end of any End phase, a player with 12+ VP and strictly more VP than the opponent wins; (c) after round 5 the higher VP wins; on equal VP the player whose own defeated units are worth fewer points wins; otherwise a draw.
- R-2.3 Recon [RECON p2]: 600-point armies, 36"x36" table, one fixed Recon battle deck, all other rules as a standard game, so R-2.1 and R-2.2 apply unchanged. Standard: 1000 points, 72"x36" [CRB p16, p18]. Table size is data per format.

## 3. Setup

- R-3.1 Setup order [CRB p16, p44]: build army, command hand and battle deck; establish battlefield; declare terrain; place terrain; determine blue player; build mission; resolve setup effects; deploy in Prepared Positions.
- R-3.2 Army limits [CRB p16]: one faction; standard ranks Commander 1-2, Operative 0-2, Corps 3-6, Special Forces 0-3, Support 0-3, Heavy 0-2, max 1000 points. Recon [RECON p2]: Commander exactly 1, Operative 0-1, Corps 2-4, Special Forces 0-2, Support 0-2, Heavy 0-1, max 600. Unique/limited bullets cap same-name cards across card types [CRB p17]. A unit cannot take the same upgrade twice. Enforced by `createGame` (setup validation, never a decision).
- R-3.3 Command hand [CRB p18]: exactly 7 cards: two each of 1, 2 and 3 pips, no duplicates, plus the 4-pip Standing Orders. Unit-restricted cards need the named unit(s) in the army ("or" = at least one, "and" = all).
- R-3.4 Battle deck, standard [CRB p18]: 9 cards (3 Objective, 3 Secondary Objective, 3 Advantage, no duplicates) plus the 3 Map cards paired with the Objectives. Recon uses the fixed Recon deck instead [RECON p2]. Card contents live in `11-battles.md`.
- R-3.5 Terrain [CRB p12-14, p19]: the tabletop has players agree each piece's type, cover, height and LOS behaviour. Digital: every battlefield is a data record with these properties fixed; nothing is negotiated in game.
- R-3.6 Blue player, standard [CRB p19]: each player rolls 4 black attack dice; most crits wins, then most hits, then most surges; full tie rerolls. Automatic (no decision). Recon [RECON p2]: one player rolls a red defence die; a block makes the roller blue, anything else makes the other player blue.
- R-3.7 Build the mission, standard [CRB p19]: each player shuffles their three sub-decks. Blue reveals the top Objective or Secondary card of their own deck; the opponent reveals the other type from theirs; each reveals their own top Advantage. Then, blue first, players alternate until each has modified twice. A modification is one of: replace the Objective with the top of your Objective deck; replace the Secondary with the top of your Secondary deck; replace your Advantage with your next one; make the opponent replace their Advantage with their next one; take the blue token; pass. An empty sub-deck is rebuilt from that player's shuffled discards of that type, the one just discarded among them. Decision `setup.battle`.
- R-3.8 Mission setup, standard [CRB p19]: blue picks a long edge (red gets the opposite); the territory touching your edge is your allied Territory; resolve Objective setup, then Secondary setup, then each Advantage, blue first. Recon [RECON p2]: after the blue roll, blue picks any table edge (red the opposite), then blue draws one random Objective and one random Secondary, each player draws a random Advantage; resolve setup in the same order.
- R-3.9 Resolve setup effects, blue first [CRB p20]. Then Prepared Position units are placed, alternating, blue first: leader completely within allied Territory, the rest in cohesion and within allied Territory, never on impassable terrain; the unit gains 1 Dodge [CRB p20, p53]. Decision `setup.deploy` (continuous) only for these units.
- R-3.10 No other unit is placed before round 1. Undeployed units enter on their first Move (R-6.6) [CRB p24]. An undeployed unit is in range and LOS of allied undeployed units only and of nothing else [CRB p12].

## 4. Command phase

- R-4.1 Steps [CRB p21, p44]: select and play cards; resolve card effects; determine priority; nominate commanders and issue orders; create order pools; create pass pool.
- R-4.2 Each player secretly picks one card from their hand, then both reveal. A player with no undefeated Commander or Operative unit and no unit holding a Commander token plays no card [CRB p21]. A character card is playable only while its unit is in the army and undefeated. Decision `command.pick`, seat `'all'`, hidden until both are in.
- R-4.3 Card effect order [CRB p21, p44]: on-reveal effects (blue first); untimed effects (blue first); when-issuing-orders effects (priority first); start-of-Activation-phase effects (priority first); during-Activation-phase effects (priority first).
- R-4.4 Priority [CRB p21]: fewer pips wins. Tie: one player rolls a red defence die; block = roller has priority, anything else = the other player. If only one player played a card, that player has priority; if neither did, roll as for a tie. Automatic; `PriorityDecided { rolloff }`.
- R-4.5 Nominate [CRB p22]: if the card belongs to specific units, one of them is the commander; otherwise any one Commander-rank unit. Decision `command.issuer` only when more than one unit qualifies.
- R-4.6 Issue orders, priority player first [CRB p22]: the card states how many units and which types. A unit may receive an order only if it has none this phase and matches the card's type limit. **No range or LOS limit applies.** The commander must issue every order it can; orders that cannot be issued are lost. Each ordered unit gets a face-up order token of its rank. A unit never holds more than one order per round. Decision `command.order` with no "done" option while an eligible unit remains.
- R-4.7 Generic cards [CRB p22 shows three]: Ambush 1 pip / 1 unit, Assault 3 pips / 3 units, Standing Orders 4 pips / 1 unit and returns to the hand at the end of the Command phase (so it is never discarded). Push 2 pips / 2 units (not pictured; Fan-source). Card data lives in `20-data-schema.md` records.
- R-4.8 Order pool [CRB p22]: each player takes one rank token per undefeated unit without an order and shuffles them (undeployed units included). Pool sizes per rank are open; draw order is RNG at draw time.
- R-4.9 Pass pool [CRB p22]: the player with fewer undefeated units gets Advantage tokens equal to (difference - 1); none on a difference of 0 or 1.

## 5. Activation phase and actions

- R-5.1 Steps [CRB p22-23, p44]: start-of-phase effects; then turns alternate, priority first; end-of-phase effects once every unit has activated and both pools are empty.
- R-5.2 On a turn the active player either activates an allied unit with a face-up order, or draws a random token from their pool and activates an un-ordered, unactivated unit of that rank [CRB p23]. Decisions `activation.choose` then `activation.pick`; when exactly one unit matches the drawn rank it is picked automatically.
- R-5.3 Dead draw [CRB p23]: a drawn rank with no eligible unit is removed from the game; the player may then pass, otherwise must choose again (order or another draw).
- R-5.4 Passing [CRB p23]: a player whose last turn this round was not a pass may spend one pass-pool token to pass. A player with nothing left to activate passes automatically (no token spent), so the other player activates their remaining units in a row.
- R-5.5 A unit's activation [CRB p23, p44]: start-of-activation effects; rally (R-15.3); make actions; end-of-activation effects; place the order token (flip the face-up token, or attach the drawn token, face down). The unit is then activated for the round.
- R-5.6 Action budget [CRB p23]: 2 actions; Suppressed after rally: 1 (Droid Troopers keep 2 [CRB p39]); Panicked at the start of Make Actions: no actions and no free actions (R-15.5).
- R-5.7 Core actions [CRB p15, p24]: Move (Standard Move or Climb), Attack, Aim (+1 Aim), Dodge (+1 Dodge), Recover (remove any number of suppression tokens and ready any number of exhausted upgrade cards), Standby (+1 Standby; Trooper and Ground Vehicle units only), card actions (cost 1; two-icon card actions cost 2).
- R-5.8 Repeat limits [CRB p15, p24, p30, p37]: each action at most once per activation except Move; different card actions may each be taken; only one Attack action per turn, free or not; Attack and Standby never in the same activation; Withdraw forbids Attack (except Creature and Heavy Troopers) and Standby in that activation (R-16.5).
- R-5.9 Free card actions [CRB p15, p24]: cost nothing, only during Make Actions (so not while Panicked), each instance once per activation, and never a way to take a non-Move action twice.
- R-5.10 Moves granted by abilities are not Move actions unless the ability says so [CRB p27].
- R-5.11 Undeployed unit [CRB p24]: when it activates it must deploy, and it can take no non-Move action until it has deployed. Digital: `action.choose` offers only Move (and free actions that are moves) until deployed.
- R-5.12 Standby trigger [CRB p37]: in the Activation phase, once an enemy unit that is within range 2 and in LOS of any miniature of an allied Trooper or Ground Vehicle unit holding a Standby token makes an attack, a Move or an action, and it is not that allied unit's own activation, and the trigger was not caused by the allied player's own effect, the allied unit may spend the token to make one free action: Move or Attack. The free attack may only target the triggering unit. The token is spent before any "after this attack/move" effects, and not until all of the attacker's pools have resolved. Decision `activation.standby` (pass allowed).
- R-5.13 Standby loss [CRB p37]: a unit loses its Standby token when it makes a Move, an attack or an action, or gains one or more suppression tokens. A unit holds at most 1 Standby token.

## 6. Movement

- R-6.1 Speed [CRB p8, p25]: the unit's speed is the longest Movement Tool it may use; it may always choose a shorter tool. Modifiers: difficult terrain -1 (min 1, R-6.7), Climb sets 1 (R-6.9), Withdraw sets 1 before other modifiers (R-16.5). Only one Movement Tool and one Range Tool may be in use at a time [CRB p11].
- R-6.2 Tool geometry (digital; not stated in the rulebook, so data in `core/movementTool.json`, RULING Unsourced): each tool is two straight segments joined by one hinge; overall centreline lengths Speed-1 **4.5"**, Speed-2 **7.0"**, Speed-3 **9.5"** (community measurements, hinge at the midpoint), tool width **1.0"**, each end forked into two prongs. Hinge range **±135°** from straight. To be replaced by a measurement of the starter-set tools.
- R-6.3 Standard Move, small base [CRB p25]: put the tool flat with one end wholly against the leader's base; bend the hinge freely; pick up the leader and set it down touching any part of the tool; then pick up and place every other model in cohesion (R-7). Other models may be set aside temporarily to make room. Digital tool pose: start angle θ on the leader's base circle, segment 1 leaves the base radially (an end can only lie flush against a round base at one tangent point), hinge angle φ, then a free leader position `{x,z,yaw}` whose base disc touches or overlaps the tool footprint.
- R-6.4 Legality check (`validate` for `move.tool`, in this order; first failure is the rejection code): (1) tool length <= effective speed (`E_ACTION_RESTRICTED`); (2) tool footprint overlaps no impassable terrain and no obstacle taller than the mover's silhouette (Climb: taller than one height band above the current surface) (`E_TERRAIN`); the tool may cross miniatures and objective tokens, and may overhang the table edge; (3) leader base touches the footprint (`E_OFF_TOOL`); (4) leader base fully on the table, overlapping no miniature, POI, barricade or impassable terrain, not partially overlapping obstacle terrain, vertical change within limits (R-6.8, R-6.9) (`E_OVERLAP` / `E_TERRAIN`); (5) leader not touching an enemy model unless this is a move into melee (R-16.1) (`E_ENGAGED`); (6) after `move.troopers`, if any miniature of the unit began or ended in difficult terrain or the tool crossed it, the tool must fit the reduced speed (`E_TERRAIN`). No swept-base path check for small bases: models are picked up and placed [CRB p25, p27].
- R-6.5 Fitting a path (D15, digital only): the player clicks a leader destination T. The engine tries tools from shortest to longest: first straight (θ toward T, φ = 0), then a search over θ (72 steps) and φ (5° steps), keeping the legal pose that reaches T with the smallest |φ| and then the smallest θ deviation. Dragging the hinge: the hinge point is constrained to the circle of radius (base radius + segment-1 length) around the leader (for deployment: to the line parallel to the edge at segment-1 length), so a drag sets θ; φ is then re-solved to point at T. If T is unreachable, `suggest` returns the nearest reachable legal leader position with the failing check as the reason. `query.toolPreview` returns exactly what `validate` will accept.
- R-6.6 Deploying [CRB p24-25]: an undeployed unit's Move starts with both prongs of one tool end touching the table edge inside allied Territory (digital: segment 1 perpendicular to the edge, start point inside the Territory's edge span); vertical change is measured from that edge. Only undeployed units deploy. The rest of R-6.3/6.4 applies.
- R-6.7 Difficult terrain [CRB p13, p27]: a Standard Move whose unit starts or ends with any miniature in difficult terrain, or whose tool overlaps difficult terrain, has speed -1 (min 1).
- R-6.8 Obstacles [CRB p13, p27]: a Standard Move may go onto or over obstacle terrain shorter than the mover's silhouette, and from an obstacle may change height by up to the silhouette height; anything taller needs a Climb. A trooper on an obstacle must overlap it completely, never hang off it, also when deploying or placed. Notched bases may never Climb.
- R-6.9 Climb [CRB p28]: a Move at speed 1 (cannot be increased); vertical change up to height 1 (up to 6"); the tool may overlap obstacle terrain up to one height band above the surface the unit is on.
- R-6.10 Impassable terrain [CRB p13, p27]: no moving or climbing onto or through it without a special rule.
- R-6.11 Through miniatures [CRB p26]: models may pass through any miniatures (only bases matter) but never end overlapping one. Objective tokens may be crossed [CRB p20]; POIs may not be overlapped at the end (R-18.2).
- R-6.12 Table edge [CRB p25]: no unit may voluntarily end a move with any base partly off the table. Digital: such a placement is rejected; small bases never need the "stop at the edge" fallback.
- R-6.13 Notched bases (M2b, vehicles and notched heavy troopers) [CRB p26, p39]: optional 90° turn about the centre, tool in the front notch, full move (rear notch at the far end) or partial move (stop anywhere, base aligned to the segment reached), stop early when impeded, troopers copy the leader's facing; Pivot and Reverse (speed -1) where the unit type allows. Spec details at M2b.

## 7. Cohesion

- R-7.1 Whenever a leader changes position in any way, every other model of the unit is placed in cohesion [CRB p23, p25]: within half range (3") of the leader, measured horizontally without the measurement crossing impassable terrain; with LOS to the leader; and within a vertical distance of the leader's silhouette height. Placement obeys R-6.4 (4)-(5) for each model. Decision `move.troopers` (continuous) with `context.suggestion`.
- R-7.2 A model that cannot be placed in cohesion is placed as close as possible to the leader instead [CRB p23, p25]. Digital: the engine computes that spot; such a model is flagged `outOfCohesion` and the placement is legal.
- R-7.3 Cohesion is required only at these placements; a unit later left out of cohesion (losses, effects) stays legal until its leader next moves.

## 8. Range and measuring

- R-8.1 Range is the shortest horizontal distance between two objects, base edge to base edge for miniatures, vertical ignored [CRB p11].
- R-8.2 Bands [CRB p11]: range 1 = 0-6", range 2 = 6-12" ... range 5 = 24-30", beyond range 5 beyond that; half range = 3". Melee range is base contact, never measured. Digital: band n covers (6(n-1), 6n], band 1 includes 0.
- R-8.3 Within / completely within / not within [CRB p12]: an object is within range X if any part is inside; a unit is within if at least one model is; completely within needs the whole object (every model); not within needs every model fully outside. An object is within any range of itself.
- R-8.4 Weapon range [CRB p11, p32]: "a-b" = minimum a, maximum b; a single number is the maximum. Checked from the attacking leader to the closest model of the defender.
- R-8.5 Height [CRB p14]: a terrain part's height is the band its top falls in measured upward (top in (0,6"] = height 1). For moving or climbing, measure the part being moved to minus the height of the surface the models stand on.

## 9. Terrain

- R-9.1 Kinds [CRB p12-13]: scatter (small props), area (a footprint whose whole volume up to its tallest point counts), obstacle (large, tall; may need a Climb). Each piece is also open, difficult or impassable, and provides none, light or heavy cover; complex pieces may have parts with different behaviour. Digital: `table.ts` pieces carry `{ kind, footprint, height, movement, cover, blocksLos, parts? }`.
- R-9.2 Barricades [CRB p12]: scatter, at most 3"x1"x1", open terrain; heavy cover for Trooper units that are not Creature or Heavy Troopers, nothing for those; no trooper may end a move or be placed overlapping one; objective and advantage tokens never on or overlapping them.
- R-9.3 Area terrain and LOS [CRB p12]: its volume blocks LOS; a model overlapping a piece of area terrain disregards that piece for its own LOS lines; a model overlapping area terrain is always obscured (by that piece, for R-11.2).

## 10. Line of sight and silhouettes

- R-10.1 Silhouettes [CRB p30]: a vertical cylinder over the model's base. Small-base troopers use the small template; Creature, Emplacement and Heavy Troopers the large template; vehicles a cylinder from the base to the top of the hull (no guns, antennas or crew). Digital: radius = base radius; height from data: small **1.69"**, large **2.70"** (measured from the templates printed on [CRB p65], RULING Unsourced); vehicle heights per unit in data.
- R-10.2 LOS between two models exists if any straight line from any point of one silhouette reaches any point of the other unobstructed [CRB p30]. Digital: rays between sample points (data: rim points top and bottom plus axis points) in 3D; any clear ray = LOS.
- R-10.3 Blockers [CRB p31]: terrain flagged as blocking (solid shape or obscuring nature such as smoke); vehicle silhouettes (ground vehicles as area terrain, M2b). Trooper silhouettes never block; models never block LOS to or from their own unit.
- R-10.4 Unit-level LOS uses the leader for declaring a defender (R-12.2) and each model for pool eligibility (R-12.3).

## 11. Cover

- R-11.1 Cover values [CRB p14]: none 0, light 1, heavy 2; never above 2; improvements resolve before reductions.
- R-11.2 Obscured, ranged attacks only [CRB p34, p37]: check each defending model from the attacking leader. A model is obscured if LOS to it is completely blocked, or if any line from the leader's silhouette to its silhouette is blocked by terrain that is within half range (3") of that model and that the attacking leader is not in base contact with. Digital: per sampled ray, attribute the blocking terrain pieces; a model is obscured by every qualifying piece that blocks at least one of its rays; overlapping area terrain obscures automatically (R-9.3); POIs count as heavy area terrain for this check only (R-18.2).
- R-11.3 Cover [CRB p34]: if at least half the defending models are obscured, the unit has cover; heavy if any obscured model is obscured by heavy-cover terrain, otherwise light. Then a Suppressed defender improves cover by 1 (none -> light, light -> heavy).
- R-11.4 Rolled cover [CRB p34]: with cover, the defender rolls one white defence die per hit (not crits). Light cancels one hit per block; heavy cancels one hit per block or surge.
- R-11.5 Melee attacks skip obscuring and cover entirely and go to Dodge [CRB p34].

## 12. The attack sequence

- R-12.1 Attacks normally come from an Attack action but may come from other rules [CRB p30]. Steps [CRB p30, p45] are the windows of `attack.ts` (00-architecture 7.5).
- R-12.2 Declare defender [CRB p31]: an enemy unit inside the range of one or more of the attacker's weapons and with at least one model in LOS of the attacking leader, both measured from the leader; otherwise the attack cannot be made. Engaged units can neither make nor receive ranged attacks (R-16.3).
- R-12.3 Form the pool [CRB p32]: each model with LOS to any defending model may add up to one weapon it can use. A weapon is unusable if the defender is outside its range band from the leader, or if it is ranged and the defender is in melee with the attacker. Melee and ranged weapons never share a pool; a weapon with both icons is fixed as one type when added; same-named weapons all go in the same pool; a pool needs at least one weapon; each model adds a weapon only once per attack sequence. Weapons on miniature-adding upgrades are used only by those models; a heavy-weapon card's weapon by one model per sequence [CRB p17]. Exhaust/expend a card when its weapon is added.
- R-12.4 Additional defender [CRB p33]: while weapons and unused eligible models remain, the attacker may form another pool against a different enemy unit (no same-named weapon in two pools). Pools then resolve one at a time, attacker's choice, steps R-12.5 to R-12.12 each.
- R-12.5 Roll attack dice [CRB p33]: (a) up/downgrades: attacker downgrades, defender downgrades, attacker upgrades, defender upgrades (R-13.2); (b) roll; (c) rerolls: each Aim token rerolls up to 2 different dice (plus Precise X), spent one token at a time after seeing earlier rerolls; a die may be rerolled again with another token but once per token; Observation tokens on the defender reroll 1 die each [CRB p53]; (d) convert surges: every surge becomes what the attacker's surge chart says (hit or crit), otherwise blank; each Surge token turns one surge into a hit.
- R-12.6 Dodge and cover [CRB p34]: (a) count obscured models (R-11.2); (b) cover type (R-11.3); (c) roll the cover pool; (d) apply cover (R-11.4); (e) the defender may spend any number of Dodge tokens, each cancelling one hit (never a crit), even with no hits left.
- R-12.7 Modify attack dice [CRB p34]: attacker's effects, then defender's. Backup is applied here (R-14.6).
- R-12.8 Roll defence dice [CRB p34, p45]: (a) one defence die per remaining hit and crit, of the defender's colour; (b) up/downgrades in the R-12.5(a) order; (c) roll; (d) rerolls; (e) convert surges: chart result (block) or blank; each Surge token turns one surge into a block.
- R-12.9 Modify defence dice [CRB p35]: defender's effects, then attacker's.
- R-12.10 Compare [CRB p35]: wounds = (hits + crits) - blocks, minimum 0. Assign them (R-14).
- R-12.11 Suppression [CRB p36]: after steps 1-9, if the attack was ranged, there was at least one hit or crit in the pool during the Roll Attack Dice step, and the defender was not defeated, the defender gains 1 suppression (R-15.1).
- R-12.12 Next pool [CRB p36]: repeat steps 4-11 for each remaining pool; then the Attack action ends.
- R-12.13 Cancelled results are removed from the pool [CRB p33]. Every optional spend (Aim, Dodge, Surge tokens, cards, keywords) is a decision `attack.spend` with options; never assumed.

## 13. Dice

- R-13.1 Faces [CRB p5]: attack dice (red, black, white) show hit, crit, surge or blank; defence dice (red, white) show block, surge or blank. The rulebook gives no counts; the engine uses the community-standard d8/d6 tables (RULING Unsourced): red attack 5 hit, 1 crit, 1 surge, 1 blank; black attack 3/1/1/3; white attack 1/1/1/5; red defence 3 block, 1 surge, 2 blank; white defence 1/1/4. Data in `core/dice.json`, face order fixed there for `ScriptedRng`.
- R-13.2 Upgrade/downgrade [CRB p33]: replace the die with the next colour: attack white <-> black <-> red, defence white <-> red; red cannot go up, white cannot go down; an unspecified colour is chosen by the effect's controller; one effect changes a die at most once.

## 14. Wounds, defeat and Backup

- R-14.1 The defending player assigns wounds one model at a time until all are suffered or the model is defeated (wound tokens = wound threshold), then the next model [CRB p35].
- R-14.2 Order [CRB p35]: the wounded model with the most wound tokens must take wounds first until defeated (ties: owner's choice); the leader takes wounds only when it is the last model. Digital: automatic unless the remaining eligible models differ (weapon, upgrade, threshold), then decision `attack.allocate`.
- R-14.3 Ranged wound cap [CRB p35]: if the attacker sees only some defending models, the unit suffers at most the sum of the wound thresholds of the models in LOS.
- R-14.4 Defeat [CRB p35]: a defeated model is removed. A leader defeated while others remain is replaced at once: the owner picks a model, which becomes the leader in place. When every model is defeated the unit is defeated, its order tokens are removed and it drops its Assets first (R-18.3).
- R-14.5 Effects that deal or assign wounds outside an attack roll no defence and cause no suppression; the sufferer assigns them normally unless the effect names a model [CRB p35].
- R-14.6 Backup [CRB p31]: a Commander or Operative Trooper unit defending against a ranged attack whose attacking leader is not within range 2 may cancel up to 2 hits in Modify Attack Dice, if it is within half range of and has LOS to the leader of an allied Corps Trooper unit that is not Suppressed.

## 15. Suppression, panic and courage

- R-15.1 Suppression tokens [CRB p15, p24]: Vehicles never take them; a unit with null courage ("-") can never gain them and loses any it has on gaining null courage.
- R-15.2 States [CRB p15]: Suppressed when tokens >= courage; Panicked when tokens >= 2 x courage. Panic check courage [CRB p24]: if one or more allied Commander units within range 3 have higher courage, use the highest of them; a null-courage Commander within range 3 means allied units never panic. Suppressed always uses the unit's own courage.
- R-15.3 Rally [CRB p23]: at every activation, roll one white defence die per suppression token; remove one token per block or surge. Automatic (`Rallied`).
- R-15.4 Suppressed after rally at the start of Make Actions: one fewer action (R-5.6); in an attack it improves cover (R-11.3).
- R-15.5 Panicked at the start of Make Actions: no actions or free actions; if it made none because of panic, at the end of the activation it removes suppression equal to its courage [CRB p23]. A Panicked unit cannot contest objectives [CRB p20]; when a unit panics it drops every Asset it holds.
- R-15.6 Droid Troopers become Suppressed but lose no action [CRB p39]; the AI keyword's forced action is a keyword (later checklist).
- R-15.7 Recover removes any number of tokens (R-5.7); the End phase removes one per unit (R-17.3).

## 16. Melee and engagement

- R-16.1 Moving into melee [CRB p5, p28]: the only way into base contact with an enemy. A unit whose leader has a melee weapon may move or place its leader into base contact with an enemy model; then (1) the mover places its other models in base contact with models of that enemy unit; (2) if the enemy leader is not in contact, its owner places it in contact; (3) the enemy places its remaining models into contact with the mover's unit. Models that cannot reach contact are still placed in cohesion. No model may ever touch models of two enemy units. Digital: steps (1)-(3) are `move.troopers` decisions for each seat in turn.
- R-16.2 Two units with opposing models in base contact are in Melee [CRB p28].
- R-16.3 Engaged [CRB p29]: Trooper units in Melee with each other are Engaged. An Engaged unit may not move (Withdraw aside), may not shoot, and may not be shot. Vehicles can be in Melee but are never Engaged.
- R-16.4 Melee attacks [CRB p31-32]: every model of a unit in Melee may add a melee weapon even without its own base contact, subject to R-12.3 LOS. Digital: a melee pool may only target a unit the attacker is in Melee with.
- R-16.5 Withdraw [CRB p29]: an Engaged unit leaves Melee with a Move action at speed 1 (set before other modifiers); speed 0 cannot withdraw; no moving into melee, no Standby and no attack in that activation (Creature and Heavy Troopers may still attack).
- R-16.6 After an attack in Melee removes models [CRB p35]: the attacker re-places its leader, then any model out of cohesion or out of contact, into contact with a unit it was in Melee with; then the defender does the same; models that cannot reach contact are placed in cohesion; if a unit cannot get back into contact at all, it stays put and is no longer in Melee.

## 17. End phase

- R-17.1 Steps [CRB p38, p45]: start-of-End-phase effects; score VP; discard command cards; remove tokens; update order pool and promote; end-of-End-phase effects; advance the round counter (after round 5 the game ends, R-2.2).
- R-17.2 Score the Objective card, then the Secondary card [CRB p38] (`11-battles.md`).
- R-17.3 Discard each revealed command card for the rest of the game (Standing Orders has already returned to hand, R-4.7). Clear every Aim, Dodge, Observation, Surge and Standby token; remove 1 suppression from each unit; empty both pass pools [CRB p38].
- R-17.4 Promote [CRB p38]: a player with no Commander unit left (and no Field Commander unit holding a Commander token) must, priority first, promote a Trooper unit to Commander rank; its order token becomes a Commander token. With no Trooper unit to promote, that player plays no command cards for the rest of the game (R-4.2).

## 18. Objectives

- R-18.1 Tokens [CRB p20]: Assets (carried) and POIs (secured). Cards say which are used and how they score.
- R-18.2 POIs [CRB p20]: a 2" token (or a miniature on a 2" base, still a token); models, advantage and objective tokens may not overlap a POI; for obscuring and cover only, a POI is heavy-cover area terrain, a 2"-wide cylinder 3" tall; otherwise it never blocks LOS.
- R-18.3 Contesting and Assets [CRB p20]: a unit contests a token if its leader is within half range of it and the unit is not Panicked. A card-granted Claim free action lets an eligible contesting unit take an unclaimed Asset onto its card. A unit drops its Assets when it panics or is defeated; the opponent places a dropped Asset within half range of that unit's leader.
- R-18.4 Securing [CRB p20]: for a securable token, the player with more contesting units secures it (ties: nobody).
- R-18.5 Placement limits [CRB p20]: not on impassable terrain, not partly over non-area terrain, not on obstacles of height 2+; after setup, if no legal spot is in range, the closest legal spot. Decision `battle.place` (continuous).

## 19. Tokens

- R-19.1 Kinds and lifetimes [CRB p10, p38]: Aim, Dodge, Surge, Standby (max 1), Observation: removed in the End phase. Suppression: until removed (R-15). Wound: on models. Order: face up / pool / face down; Commander: marks the active Commander (promotion). Advantage: pass pool and Advantage-card effects. Objective tokens (R-18). Vehicle damage, Ion, Poison, Immobilize, Shield, Charge, Incognito, Smoke and similar are keyword tokens (later checklists). Token kinds are an open union in `Unit.tokens`.
- R-19.2 Exhaust/expend [CRB p17]: cards start ready; exhausted cards are turned and cannot pay another exhaust cost until readied (Recover readies them); expended cards are gone for the game.

## 20. Unit types (core part)

- R-20.1 [CRB p5, p39]: Troopers, Clone, Droid, Wookiee and Mandalorian Troopers are on small bases; Creature and Emplacement Troopers and all Vehicles on notched bases; Heavy Troopers may be notched. The slice (D10) is all small-base troopers.
- R-20.2 Creature and Heavy Troopers: no cover from barricades, may attack and Withdraw in one activation, Reverse and Pivot (also while Engaged). Droid Troopers: R-15.6. Wookiee and Mandalorian Troopers: no extra rules [CRB p39-40].
- R-20.3 Vehicles (M2b): no courage, Resilience and vehicle damage, Ground/Repulsor subtypes, LOS and cover behaviour [CRB p40]. Spec at M2b.
