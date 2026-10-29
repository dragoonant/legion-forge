# 11 - Battle: formats, battle cards, objectives

Status: M0 spec. Recon first (D11), then Standard on the same engine. Every card below is described in **our own words**; card names match the game. IDs `B-x.y` are referenced by `12-rules-test-checklist.md`; core rules are `R-x.y` in `10-rules-core.md` (R-3 setup, R-17 End phase, R-18 objectives). Data shapes are in `20-data-schema.md` section 9. Rulings go to `docs/needs-rules-check.md` (proposed lines in section 7).

Note on the file name: `00-architecture.md` and `10-rules-core.md` link to `11-battles.md`; this file is `11-battle.md` as briefed. The coordinator should align one or the other.

## 0. Sources and how the card text was read

| Key | Document (gitignored `docs/sources/`) | What it gave |
|---|---|---|
| CRB | `amg-legion-core-rules-2026-06-17` (Core Rule Book, effective 2026-06-17) | Battle card anatomy p7, setup p16-20, objectives p20, winning p20, End phase p38 |
| RECON | `amg-legion-recon-rules-2025-04-30` (Recon Rule Book, effective 2025-04-30, cards v2.1) | Recon format p2-3; the 9 Recon cards and 3 square maps on PDF pages 5-6 |
| BC | `amg-legion-battle-cards-2026-07` (print-and-play Battle Cards, cards v1.3 and v1.0) | All Standard Objective, Secondary, Advantage and Map cards, the Recon map variants, and the four generic command cards (page 4) |
| LHQ | `legionhq2-cards-extracted-2026-10-29.json` (Fan) | Card names, types and faction locks only; it has no card text |

**Finding: no battle card has a text layer.** The `.txt` extractions of RECON pages 5-6 and of the whole BC file contain only copyright lines. All card text in this file was **read by eye from the PDF pages rendered to images** (2026-10-29, 150-300 dpi). Nothing is missing, but every card record is `source.kind: primary` with `checked: "by-eye 2026-10-29"`, and the owner should spot-check icon readings (rank icons, range icons, crit versus hit icons) against a physical or printed card. Uncertain icon readings are marked **(icon)** below.

Icon key used when reading: rank icons follow RECON p2 (Commander winged chevron, Operative outlined chevron, Corps triangle, Special Forces winged triangle, Support hexagon, Heavy winged hexagon). A map-card grid square is range 1 (6") per side [CRB p7]. Black number badges are range bands; the "1/2" badge is half range (3").

## 1. Recon format (first playable)

Source: RECON p2-3; everything not listed follows the standard game [RECON p2: "all the rules of a standard game except ..."].

- B-1.1 Army: at most **600 points**; ranks Commander exactly 1, Operative 0-1, Corps 2-4, Special Forces 0-2, Support 0-2, Heavy 0-1 (R-3.2). Command hand as standard: seven cards, two each of 1, 2 and 3 pips plus Standing Orders (R-3.3).
- B-1.2 Battlefield: **36" x 36"**, centred at the origin (x and z in [-18, 18]). Terrain comes from a layout record (`20-data-schema.md` section 10); nothing is negotiated in game (R-3.5).
- B-1.3 Battle deck: **one fixed shared Recon deck**, never a player's own deck, and Recon cards are never used in Standard games. Contents: 3 Objective cards (each with its square Map card), 3 Secondary cards and 3 Advantage cards (section 3). Fan data agrees: LHQ tags exactly these 9 with `Recon`.
- B-1.4 Setup order [RECON p2]: (1) armies and hands; (2) battlefield; (3) declare terrain; (4) place terrain; (5) blue player; (6) build the mission; (7) resolve setup effects, blue first; (8) deploy units with Prepared Position, alternating, blue first.
- B-1.5 Blue player: **one player rolls one red defence die**. A block makes the roller blue; any other face makes the roller red. Automatic, no decision; the engine picks the rolling seat as seat A (`DiceRolled { purpose: 'bluePlayer', die: 'def:red' }`). Then blue chooses **any one of the four table edges** (decision `setup.battle` with four options); red takes the opposite edge.
- B-1.6 Build the mission: shuffle the three Recon sub-decks separately. Blue draws **1 random Objective and 1 random Secondary**. Each player then draws **1 random Advantage** from the shared 3-card Advantage deck (drawn without replacement, so the two players never share an Advantage; port choice, ruling R1). Draws use `ctx.draw` and emit `BattleCardChosen`. There is no mission modification step in Recon.
- B-1.7 Resolve card setup: Objective setup, then Secondary setup, then the Advantage cards, blue's first.
- B-1.8 Territories and orientation: the Objective's Map card fixes both Territories and the POI positions. Map data is stored in a canonical frame (section 5) with red's Territory along z = -18 and blue's along z = +18; the edge blue chose rotates the map against the already placed terrain (rotation 0, 90, 180 or 270 degrees).
- B-1.9 Deployment and entry (R-3.9, R-3.10, CRB p24): no deployment zones. Only units with Prepared Position (or Infiltrate, or Detachment inheriting either) are placed before round 1, inside allied Territory. Every other unit enters on its first activation: its first action must be a Move whose tool starts with both prongs of one end touching **the part of its own table edge inside allied Territory**. Scout X units may instead deploy with a free Speed-X move at the start of their Make Actions step (`14-armies.md` keyword survey).
- B-1.10 Game length and victory unchanged: 5 rounds; at the end of any End phase a player on 12 VP or more and ahead of the opponent wins; a player with the only undefeated units wins at once; after round 5 most VP wins, ties broken by fewer points of own units defeated, then a draw [CRB p20]. Recon does not alter these (ruling R2: Port choice, the Recon book is silent).
- B-1.11 Event timing (90-minute rounds, 5 red dice) is organised-play guidance and is not ported.

## 2. Standard format (second)

Source: CRB p16-20, p38; BC.

- B-2.1 Army at most **1000 points**; ranks Commander 1-2, Operative 0-2, Corps 3-6, Special Forces 0-3, Support 0-3, Heavy 0-2. Table **72" x 36"**, x in [-36, 36], z in [-18, 18].
- B-2.2 Battle deck: each player brings their own 9 cards (3 Objective, 3 Secondary, 3 Advantage, no duplicates) and the 3 Map cards paired with their Objectives (R-3.4). Advantage cards marked with a faction icon may only be in that faction's deck (LHQ `faction`; the card prints "<faction> Only").
- B-2.3 Blue player: each player rolls 4 black attack dice; most crits, then most hits, then most surges; full tie rerolls (R-3.6). Automatic.
- B-2.4 Build and modify the mission (R-3.7): each player shuffles their own three sub-decks. Blue reveals the top Objective **or** Secondary of their own deck onto the dashboard; the opponent reveals the other type from their deck; each reveals their own top Advantage. Then, blue first, players alternate until each has made **two** modifications. A modification is one of: replace the Objective with the top card of your Objective deck; replace the Secondary with the top of your Secondary deck; replace your own Advantage with your next one; make the opponent replace their Advantage with their next one; take the blue token (you become blue); pass. An emptied sub-deck is rebuilt from that player's discards of that type (the card just discarded included) and shuffled. Decision `setup.battle`, options are the six modifications with the revealed card shown after the fact.
- B-2.5 Mission setup (R-3.8): blue picks a **long** edge (red the opposite; rotation 0 or 180); the Territory touching your edge is your allied Territory, the other player's is enemy Territory, everything else is Contested Territory [CRB p7]. Resolve Objective setup, Secondary setup, then each Advantage, blue first; then Prepared Position deployment.
- B-2.6 Deployment, round count and victory as B-1.9 and B-1.10.

## 3. Recon battle deck (fixed, 9 cards + 3 maps)

Each row: id, what it does (own words), the engine hooks it needs. "VP from round 2" means scoring begins in the End phase of round 2 and repeats each End phase after that, in the Score VPs step (R-17.1), Objective before Secondary.

### 3.1 Objective cards (each paired with a square Recon Map card)

| Card | Setup | Scoring | Special | Hooks |
|---|---|---|---|---|
| **Intercept Signals** `rec.obj.intercept-signals` | Place 4 Comms Tower POIs from the map. Starting with blue, each player picks 3 of their own units; then each player picks 2 of the 3 units their opponent picked (blue first); each unit picked this way gets an Intel token. | VP from round 2: 1 VP per Comms Tower **outside your own Territory** that is either contested by one of your units carrying Intel, or secured by you. | At the end of every End phase, a player securing a Comms Tower may give Intel to up to 2 of their units contesting it. A player may never have more than 2 units carrying Intel. | declarative: `placeTokens(map)`, `chooseUnits` x2 (second pick from the opponent's pick), unit token `intel` with a per-seat cap of 2; scoring `perToken{secured OR contestedBy(tokenHolder:intel)} where notIn(alliedTerritory)`; end-of-End-phase grant with choice -> `battle.choice`. No code hook. |
| **Bunker Assault** `rec.obj.bunker-assault` | Place 4 Bunker POIs from the map. For each player, the 2 Bunkers farthest from their own Territory are that player's **enemy** Bunkers. | VP from round 2: 1 VP per Bunker you secure, plus 3 VP per enemy Bunker destroyed in this End phase. | From round 2, at the **start** of the End phase (before scoring), blue first, each player puts 1 Wound token on each enemy Bunker they secure, and 1 more if at least one of their contesting units is a Commander, Operative or Special Forces unit **(icon)**. A Bunker with 3 or more Wound tokens is destroyed and removed. | code hook `bunkerAssault` (token wounds, rank check, destruction feeding the same End phase's scoring); window `end.start`. |
| **Close the Pocket** `rec.obj.close-the-pocket` | Place 3 Stockpile POIs from the map (one in the centre). | VP from round 2: 2 VP for securing the centre Stockpile, 1 VP for each other Stockpile you secure. | none | declarative: `perToken{secured}` with a per-token VP value (`centre: 2`, others 1). |

### 3.2 Secondary cards

| Card | Setup | Scoring | Special | Hooks |
|---|---|---|---|---|
| **Surface Scan** `rec.sec.surface-scan` | Starting with blue, each player picks 2 of their own units; each starts holding one of that player's Scanner Assets. | VP from round 2, each End phase: 1 VP if you control 2 units that each hold a Scanner, are not in your own Territory and are not contesting a POI that lies in your own Territory. Also in the End phase: a unit of yours holding a Scanner that contests an unclaimed **enemy** Scanner scores 2 VP, at most 2 VP this way per player per game. | Every unit gains the free action Claim (Scanner); nobody may claim an enemy Scanner; a unit holds at most 1 Scanner. | declarative: `chooseUnits(grantAsset)`, `claim{asset: scanner, ownerOnly: true, maxHeld: 1}`, two scoring rules, the second with `capPerGame: 2`. |
| **Bring Them to Heel** `rec.sec.bring-them-to-heel` | none | VP from round 2, each End phase: 1 VP if more enemy units than own units have suppression at least equal to their courage (i.e. are Suppressed). Scoring table, one column per colour (blue, red): once per round per player, when any unit gains 1 or more suppression, the player opposing that unit's controller may mark one unmarked space of their own column whose condition holds now: "an enemy unit is Panicked" (2 VP), "every enemy unit that can gain suppression has at least 1" (2 VP). | Each space can be marked once per game. | declarative count-compare scoring; code hook `scoringTable` (shared with Sweep and Clear) on event `SuppressionChanged`, raising `battle.choice` (rows that qualify + pass) because marking is optional. |
| **Recon Mission** `rec.sec.recon-mission` | Starting with blue, each player picks 1 own unit; it starts holding a Scanner Asset. | From round 2, at the **end of each of your units' activations**: if that unit holds a Scanner and its leader is within range 2 of, and has LOS to, 2 or more enemy units, you score 1 VP; at most 1 VP this way per player per round. | Claim (Scanner) for every unit, never an enemy Scanner. From round 1, at the end of the activation of a unit holding a Scanner, each enemy unit within range 2 and in LOS of its leader gains 1 Observation token. | declarative: scoring on window `activation.end` with `capPerRound: 1`; effect `grantToken{observation}` to enemies `within 2 + LOS(leader)`. Observation tokens need the core Observation rule (spent by allies for rerolls, CRB p53). |

### 3.3 Advantage cards

| Card | Effect | Hooks |
|---|---|---|
| **Advanced Intel** `rec.adv.advanced-intel` | At the start of the first Activation phase, add 1 Advantage token to your pass pool. | declarative `addPassToken{1}` at `activation.phaseStart`, round 1. |
| **Cunning Deployment** `rec.adv.cunning-deployment` | At the start of the first Activation phase, pick 3 of your units; each gains 1 Dodge token. | declarative `chooseUnits{3} grantToken{dodge}` at `activation.phaseStart`, round 1; decision `battle.choice` (multi-pick, AI default `suggest`). |
| **Fortified Position** `rec.adv.fortified-position` | During setup you may place up to 3 barricades in your own or Contested Territory, none within range 1 of another. | declarative `placeTerrain{piece: core.terrain.barricade, max: 3, region: [allied, contested], minApart: 6}` via `battle.place` (continuous). Needs a barricade terrain record (size Unsourced, ruling R5). |

### 3.4 Recon Map cards (canonical frame: red edge z = -18, blue edge z = +18)

Read off the 6 x 6 grid (each square 6") on RECON PDF page 5; the "1" and "1/2" badges on each map show the Territory depth is range 1 plus half range = 9". Coordinates in inches, world frame of section 5 before rotation. Accuracy about 0.5"; check at M1 against a 300-dpi render.

| Map | Red Territory | Blue Territory | Objective tokens |
|---|---|---|---|
| `rec.map.intercept-signals` | rectangle z in [-18, -9], x in [-12, 12] | z in [9, 18], x in [-12, 12] | 4 Comms Towers at (x 12, z 0), (0, -12), (0, 12), (-12, 0) |
| `rec.map.bunker-assault` | z in [-18, -9], x in [-12, 12] | z in [9, 18], x in [-12, 12] | 4 Bunkers at (12, -6), (12, 6), (-12, -6), (-12, 6); red's enemy Bunkers are the two at z = +6, blue's the two at z = -6 |
| `rec.map.close-the-pocket` | two 9" squares at red's corners: z in [-18, -9] with x in [9, 18] and x in [-18, -9] | two 9" squares at blue's corners: z in [9, 18] with x in [9, 18] and x in [-18, -9] | 3 Stockpiles at (12, 0), (0, 0) centre, (-12, 0) |

## 4. Standard battle cards (BC, current print-and-play file)

The BC file holds every Standard card: 10 Objective cards with 10 Map cards, 10 Secondary cards, 6 neutral and 8 faction-locked Advantage cards, plus the Recon map variants and the generic command cards. LHQ lists the same 43 names (13 primary includes the 3 Recon variants). All text read by eye; nothing missing.

### 4.1 Objective cards (all score from round 2 in the End phase; Map card required)

| Card | Tokens and setup | Scoring and special rules | Hooks |
|---|---|---|---|
| Intercept Signals | as Recon (4 Comms Towers) | as Recon | as 3.1 |
| Bunker Assault | as Recon (4 Bunkers) | as Recon | `bunkerAssault` |
| Close the Pocket | as Recon (3 Stockpiles) | as Recon | declarative |
| **Shifting Priorities** | 5 Priority Target POIs | 1 VP per target secured. From round 2, at the end of each End phase, blue first, players take turns relocating each target **their opponent** secures to a spot within half range of where it is; each target moves at most once per round. | declarative scoring; code hook `relocateSecured` (also used by Payload) with `battle.place`. |
| **Recover the Research** | 6 Lab POIs | 1 VP if your units contest 2 Labs, 2 VP for 3, 3 VP for 4 or more (contest, not secure). | declarative `countTokens{contestedBy: self}` with a step table. |
| **Breakthrough** | 4 Checkpoint POIs | 1 VP per Checkpoint in your Territory that no enemy unit contests; 2 VP per Checkpoint in enemy Territory that you secure. | declarative (territory filters). |
| **Outflank** | 4 Flag POIs; blue first, each player gives a Vanguard token to up to 3 of their non-Commander units **(icon)** that are not being transported | 1 VP per Flag secured; +1 VP if you control 2 or more Vanguard units contesting Flags you secure. Vanguard units must enter through the part of their Territory touching the **short** edges, and only Vanguard units (or units deployed by Transport) may enter there. | declarative scoring; code hook `entryEdgeRestriction` (movement/deploy validation by unit token). |
| **Contact, Contact!** | 5 Listening Post POIs | Units contesting a Listening Post have Precise 1. 1 VP per post secured in your or Contested Territory, 2 VP per post secured in enemy Territory. | declarative `grantKeyword{precise:1} while contesting(token)`; declarative scoring. |
| **Payload** | 3 Bomb Cart POIs | 1 VP per cart secured; then, blue first, players take turns moving each cart they secure that is not in enemy Territory to within half range of its position (once per round each); then 2 VP per cart inside enemy Territory. | `relocateSecured` (own carts, territory filter) + declarative. |
| **Cauldron** | 6 Waypoint POIs | 1 VP per Waypoint secured in your Territory; 1 VP per Waypoint secured that lies completely in Contested Territory and within range 2 of another Waypoint you secure; +1 VP for securing both Waypoints completely in Contested Territory. Special: in the End phase, units contesting a Waypoint remove 1 fewer suppression in the Remove Tokens step. | declarative scoring; modifier `endPhaseSuppressionRemoval{-1} while contesting`. |

Standard Map cards (12 x 6 grid, 72" x 36"; read by eye, **exact polygons to be measured at M1** from a 300-dpi render, snapped to 3"):

| Map | Territories (qualitative) | POIs |
|---|---|---|
| Intercept Signals | 9"-deep strips along each long edge, centred, about 48" long | 4, diamond pattern |
| Bunker Assault | 9"-deep centred strips, about 48" long | 4, two pairs straddling the centre line |
| Close the Pocket | each player has two corner regions 9" deep and 18" long (the "3" badge) at opposite short edges | 3 on the centre line |
| Shifting Priorities | 9" strips, each running from the middle to one short edge, point-symmetric | 5 on a diagonal |
| Recover the Research | stepped 9" strips, point-symmetric | 6 |
| Breakthrough | 9" strips with a notch at one short-edge corner each | 4, two inside the notches |
| Outflank | an L: a strip along part of the long edge plus a band along one short edge | 4 |
| Contact, Contact! | large stepped L regions in opposite corners | 5 |
| Payload | full-length 9" strips | 3 |
| Cauldron | full-length 9" strips | 6 in two columns |

### 4.2 Secondary cards

| Card | Summary (own words) | Hooks |
|---|---|---|
| Surface Scan, Bring Them to Heel, Recon Mission | as Recon (3.2) | as 3.2 |
| **Marked Targets** | Setup: blue first, each player marks 2 of their own units and 2 enemy units, never a unit already marked. Scoring: when a marked unit is defeated, its controller's opponent scores 1 VP once the effect resolves. | declarative `onEvent UnitDefeated where token(marked)`. |
| **Sweep and Clear** | Once per round per player, when one of your attacks defeats an enemy unit, you may mark one space in your column matching a Territory your attacking leader stands in: Any Territory 1 VP, Allied 1, Contested 1, Enemy 2. | code hook `scoringTable` + `battle.choice`. |
| **Destroy Enemy Base** | Setup: blue first, each player places one own Base POI not within range 1 of any table edge; then blue first each player gives 1 own unit a Bomb Asset. Every unit gains Claim (Bomb), one Bomb per unit. At the start of the End phase, if any of your units holding a Bomb contest an enemy Base you are securing, those Bombs leave the game and that Base is destroyed. Score 4 VP in the End phase in which the enemy Base was destroyed. | code hook `destroyBase`; `battle.place` for the Base. Ruling R6 (enemy Bombs are claimable as printed). |
| **Failed Negotiations** | Setup: an Exchange POI in the table centre (even on top of another objective token); blue first, each player gives a Prisoner Asset to one of their Corps or Special Forces Trooper units. Corps and Special Forces Trooper units gain Claim (Prisoner). A unit holding a Prisoner has +1 courage; at the start of the first Activation phase such units gain Incognito until the end of the round. VP from round 2: 1 VP per unit you control holding a Prisoner within range 1 of the Exchange. | declarative (`modifyStat courage +1 while holding`, timed keyword grant). |
| **Supply Run** | Setup: blue first, each player places 2 Supply Cache Assets in Contested Territory, not within range 2 of any edge nor range 1 of another cache. Trooper units gain Claim (Supply Cache), one per unit. From round 2, at the start of each of your activations, a unit holding a cache while contesting a POI may discard the cache for 1 VP (2 VP in rounds 4 and 5). | declarative with `battle.choice` (optional discard). |
| **Retrieve the Data** | Setup: a Data Core Asset in the centre; blue first, each player places 2 more in Contested Territory (not within range 2 of an edge nor range 1 of another core). Every unit gains the card action Data Recovery: put 1 suppression token on a Data Core it contests. VP from round 2: 1 VP per Data Core you secure that carries 2 or more suppression tokens; those cores are then removed. | declarative card action `tokenOnObjective{suppression}`; declarative scoring then `removeToken`. |
| **Align the Relay** | Setup: a Comms Relay Asset in the centre; blue first each player places 2 more within range 3 of both long edges, not within range 1 of a short edge or of another relay. Every unit gains the card action Align Relay: take control of a relay it contests; control lasts until the other player takes it. VP from round 2: 1 VP for controlling 2 or more relays, +1 for 4 or more. | declarative `controlToken` state + scoring. |

### 4.3 Advantage cards

| Card | Lock | Summary (own words) | Hooks |
|---|---|---|---|
| Advanced Intel, Cunning Deployment, Fortified Position | none | as Recon (3.3) | as 3.3 |
| **Garrison** | none | Setup: pick up to 1 of your Corps **(icon)** units without Prepared Position; it gains Prepared Position for the game. | declarative `grantKeyword` at `setup.resolve`. |
| **Ordnance** | none | Once per game, at the end of a Command phase, you may place your Ordnance token. At the beginning of the next End phase roll 3 black attack dice: every unit within range 1 of the token with Armor (any value) or of a Vehicle type suffers 2 wounds per crit and 1 per hit **(icon)**; every other unit within range 1 gains 1 suppression per hit and per crit. Then the token leaves the game. | code hook `ordnanceStrike` (area roll, per-unit effect); `battle.place`. |
| **Strafing Run** | none | Once per game, at the end of a Command phase, you may place your Air Support token. At the beginning of the next End phase, lay the range tool from the token to any point within range 2 of it; roll 4 black attack dice; each unit with a model under the tool or on the token gains 1 suppression per hit and per crit. Token leaves the game. | code hook `strafingRun` (tool sweep geometry, `battle.place` for the end point). |
| **Extreme Discipline** | Empire | Setup: put 2 Advantage tokens on this card. When one of your units gains suppression, you may spend a token from the card: the unit removes all its suppression, then suffers 1 wound. | declarative `cardTokens{2}` + optional trigger on `SuppressionChanged` -> `battle.choice`. |
| **Black Ops** | Empire | At the start of the first Activation phase pick one of your Corps or Special Forces Trooper units with 6 or fewer models: with Infiltrate it gains 1 Aim and 1 Dodge, without it gains Infiltrate. | declarative branch. |
| **No Time to Lose** | Rebel | At the start of one of your units' activations, if your pass pool has an Advantage token you may spend it: the unit gains 1 Aim and 1 Dodge, or makes a free Recover. | declarative optional trigger `activation.start`. |
| **Scrambled Orders** | Rebel | Setup: place your Comms Scrambler token. Enemy units within range 1 of a Comms Scrambler cannot be issued orders. Enemy units gain a card action to remove an enemy Comms Scrambler within half range. | declarative order restriction + granted card action; `battle.place`. |
| **Command Override** | Separatist | Setup: 2 tokens on the card; in Issue Orders spend one to let a unit with the AI keyword order itself. | out of slice (`unimplemented` until a Separatist army). |
| **Armored Assault** | Separatist | First Activation phase: up to 3 of your Vehicle units gain 1 Aim. | out of slice. |
| **Rapid Deployment** | Republic | First Activation phase: up to 2 Corps Clone Trooper units gain Reinforcements. | out of slice. |
| **Coordinated Strike** | Republic | Setup: 1 token on the card; in Issue Orders spend it so up to 2 units gain Coordinate (clone or vehicle) this round. Errata Reference rewords the last sentence; already reflected. | out of slice. |

Faction-locked cards outside the slice factions are data records with `{"unimplemented": "faction not in v1"}`; `validate:data` refuses them only in a deck marked playable.

## 5. Coordinates, territories and map rotation

- B-5.1 Canonical map frame: looking at the printed Map card with the red Territory on the left, card-right is +z (towards blue) and card-up is +x. Recon: `z = u - 18`, `x = 18 - v` with u, v in inches from the card's left and top edge; Standard: `z = u - 18`, `x = 36 - v`. This keeps the right-handed y-up frame of `00-architecture.md` 7.1 (a plain mirror would flip the handedness).
- B-5.2 Rotation: the battle stores `mapRotation` (0/180 Standard, 0/90/180/270 Recon) chosen from blue's edge so that blue's Territory touches blue's edge. Terrain does not rotate.
- B-5.3 "Within Territory" uses the region polygons; "completely within" means the whole base footprint; "within" means the leader base overlaps the region per the core measuring rule (R-8). Contested Territory = table minus both Territories.
- B-5.4 Map POIs sit on grid intersections or square centres; positions are data, not computed.

## 6. Objective tokens, contesting, scoring timing

- B-6.1 Token kinds [CRB p20]: **POI** (2" token, fixed position, secured) and **Asset** (1" token, carried after Claim). Advantage-card tokens (Ordnance, Air Support, Comms Scrambler) are their own kind, 1" (size Unsourced, ruling R5). POIs are heavy-cover area terrain 3" tall for obscuring and cover only and never block LOS otherwise; nothing may overlap a POI (R-18.2).
- B-6.2 Contesting (R-18.3): a unit contests a token when its **leader is within half range (3")** of it and the unit is not Panicked. Incognito units cannot contest. Undeployed units never contest.
- B-6.3 Securing (R-18.4): only tokens the card calls securable; the player with more contesting units secures it; equal numbers means nobody does.
- B-6.4 Claim (R-18.3): a card grants the free action Claim (Asset type) to eligible units; it takes an unclaimed Asset the unit is contesting onto the unit. Panicking or being defeated drops every held Asset; the **opponent** places it within half range of that unit's leader (`battle.place`), defeated units drop before the leader is removed.
- B-6.5 Placement limits (R-18.5): never on impassable terrain, never partly over non-area terrain, never on obstacles of height 2 or more; during setup an illegal map spot is fixed by the layout (layouts are validated so every map spot is legal, V-22); after setup, the closest legal spot.
- B-6.6 Scoring timing: End phase step 2 scores the Objective card, then the Secondary card (R-17.2); cards saying "at the start of the End phase" run in step 1, "at the end of each End phase" in step 6. Effects on events (unit defeated, suppression gained, activation end) score when they happen. Simultaneous effects resolve priority player first, blue if nobody has priority, each player ordering their own [CRB p6].
- B-6.7 Victory check: after End phase step 7 (12 VP and ahead), and after every step for "only one player has undefeated units" (R-2).
- B-6.8 `query.battleView` exposes per token: kind, holder, contesting units per seat, securing seat, and per card the VP each seat would score now; the client never derives these.

## 7. Proposed RULING lines (coordinator appends to `docs/needs-rules-check.md`)

- `RULING: Recon Advantage draw | each player draws one card from the single shared 3-card Recon Advantage deck without replacement | RECON p2 says each player randomly draws their Advantage from the deck; one physical deck means no duplicates | Port choice`
- `RULING: Recon game length and victory | 5 rounds, 12 VP instant win, standard tiebreak | RECON p2 keeps every standard rule it does not replace | Port choice`
- `RULING: Recon edge choice | blue chooses any of the four edges, the Recon Map rotates accordingly | RECON p2 says "one of the table edges" on a square table | Confirmed`
- `RULING: Battle card text | all Recon and Standard battle card text read by eye from rendered PDF pages, no text layer exists | needs an owner spot-check of icons (rank, range, hit/crit) | Unsourced`
- `RULING: Barricade and Advantage token sizes | barricade footprint and 1" Advantage tokens taken from the starter components by measurement | no AMG dimension published | Unsourced`
- `RULING: Destroy Enemy Base bombs | any unit may claim any Bomb, enemy Bombs included | card grants Claim (Bomb) with no ownership limit, unlike Scanner cards | Port choice`
- `RULING: Bring Them to Heel and Sweep and Clear marks | marking is optional and raises a battle.choice only when a space qualifies | the card says "may mark" | Confirmed`

## 8. Engine map (who implements what)

| Concern | Module | Notes |
|---|---|---|
| Blue roll, mission build, modifications, edge choice | `setup.ts` (`setup.battle`) | Recon: draws only; Standard: the six-option modification loop |
| Token placement from map, player placement, relocations | `battle.ts` (`battle.place`) | geometry checks via `table.ts` |
| Contest/secure/claim/drop, carried Assets | `battle.ts` + `activation.ts` (Claim free action from `core/actions.json`) | `apply.afterAction` recomputes contesting after every step |
| Scoring rules, tables, caps | `battle.ts` at `end.start` / `end.scoring` / event windows | declarative grammar of `20-data-schema.md` 9.3; code hooks listed above |
| Victory | `battle.ts` + `endphase.ts` | emits `PointsScored`, `GameEnded` |

Code hooks this file needs (each gets a firing test in a real game): `bunkerAssault`, `scoringTable`, `relocateSecured`, `entryEdgeRestriction`, `destroyBase`, `ordnanceStrike`, `strafingRun`. Recon alone needs only `bunkerAssault` and `scoringTable`.

## 9. Implementer brief (M1 data, M2 engine)

1. M1 encodes the 9 Recon cards and 3 Recon maps first (section 3) as `src/data/battle/recon/*.json`; Standard cards follow as records with the same shapes, Map polygons measured from a 300-dpi render.
2. Every card record carries `source { doc: "RECON" | "BC", page, kind: "primary", checked: "by-eye 2026-10-29" }` and an own-words `text`.
3. M2 implements contest/secure/claim and the declarative scoring grammar, then the two Recon code hooks; Standard hooks only when Standard starts (cut order: Standard first).
4. Tests: `BTL-xxx` IDs in `12-rules-test-checklist.md` for each card (one scoring case and one non-scoring edge case each), the Recon setup sequence, map rotation for each of the four edges, and a dropped-Asset placement by the opponent.
