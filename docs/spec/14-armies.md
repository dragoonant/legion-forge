# 14 - Armies: the first slice (Empire and Rebel starter sets)

Status: M0 spec for D10. **Values are Fan-source (Legion HQ 2 bundle, 2026-06-19) until checked against the AMG card PDFs by eye.** This agent did a first eye check on 2026-10-29 against the April 2026 AMG unit, upgrade and command card PDFs and the Errata Reference points table; each value carries a mark:

| Mark | Meaning |
|---|---|
| **C** | Confirmed by eye on the AMG card PDF (page given in section 0) |
| **E** | Points from the Errata Reference points table (effective 2026-06-17), which overrides the printed card |
| **F** | Fan-source only (LHQ), not yet checked |
| **X** | LHQ disagrees with the AMG card; the AMG value is used (gotchas list the difference) |

All rule text below is our own wording; unit, weapon, keyword and card names match the game. Core rules are `R-x.y` (`10-rules-core.md`); battle cards are in `11-battle.md`; data shapes in `20-data-schema.md`.

## 0. Sources

| Key | Source | Use |
|---|---|---|
| EU, RU | `amg-legion-{empire,rebel}-unit-cards-2026-04.pdf` (image only; EU p1 Stormtroopers, p5 Scout Troopers and Strike Team, p9-10 Darth Vader; RU p1 Rebel Troopers, p4 Rebel Commandos Strike Team and Wookiee Warriors, p9 Luke Skywalker) | stats, weapons, keywords, upgrade icons |
| EUP, RUP, GUP | `amg-legion-{empire,rebel}-upgrade-cards-2026-04.pdf`, `amg-legion-generic-upgrade-cards-2026-04.pdf` (EUP p1-2, p4, p7; RUP p1-5; GUP p19, p21) | upgrade text, weapon bars, costs |
| EC, RC | `amg-legion-{empire,rebel}-command-cards-2025-04.pdf` (EC p1-3, RC p1, p4) | command card text |
| BC | `amg-legion-battle-cards-2026-07.pdf` p4 | generic command cards Ambush, Push, Assault, Standing Orders |
| ERR | `amg-legion-errata-reference-2026-06.txt` pp2-3 | tournament points (used everywhere, ruling A1) |
| TR | `amg-transmission-legion-april-2026-rules-points-developer-update.txt` | Strike Team rework, Assault X / Overwhelm / Sniper Team |
| CRB | Core Rule Book 2026-06-17, keyword glossary pp46-62 (page numbers +-1: two-column text extraction) | keyword meaning |
| SET | AMG product pages SWQ01 / SWQ02, ICv2 2025-03-31 | box contents |
| LHQ | `legionhq2-cards-extracted-2026-10-29.json` | everything not marked C or E |

## 1. Shared

### 1.1 Box contents and what is assumed

- Empire starter (SWQ02): Darth Vader; 2 Stormtrooper units (11 figures each); 2 Scout Trooper units (7 each); 7 unit cards, 15 upgrade cards, 10 command cards, 24 battle cards; all on 27 mm (small) bases [SET].
- Rebel starter (SWQ01): Luke Skywalker; 2 Rebel Trooper units (11 each); 1 Rebel Commandos unit (7); 1 Wookiee Warriors unit (6); 7 unit cards, 15 (AMG) or 16 (ICv2) upgrade cards, 10 command cards, 24 battle cards; 27 mm bases [SET].
- **The exact upgrade and command cards in each box are unpublished.** What follows assumes:
  - Figure counts fit: Stormtroopers 11 = 4 + Stormtrooper Squad (5) + 1 heavy weapon + 1 spare option; Scout Troopers 7 = 4 + Sonic Charge Saboteur + Scout Strike Team (1) with its DLT-19x Sniper; Rebel Troopers 11 = 4 + Rebel Trooper Squad (5) + 1 heavy weapon + 1 spare; Rebel Commandos 7 = 4 + Proton Charge Saboteur + Commando Strike Team (1) with DH-447 Sniper; Wookiee Warriors 6 = 3 + their heavy weapon options.
  - The 7 unit cards are the 5 units plus the 2 Strike Teams per side (Empire: 2 Scout Strike Teams; Rebels: Commando Strike Team and, unknown, one more). **Assumed set: "starter-v1".**
  - Unit versions: Darth Vader, Dark Lord of the Sith (Commander, 170); Luke Skywalker, Hero of the Rebellion (Commander, 120; the box has no tauntaun base, which rules out Commander Skywalker); Wookiee Warriors, Freedom Fighters (the box art shows Ryyk blades). Owner check requested (question Q2).
- Command hands: Empire 10 = Vader's 6 named cards + 3 Empire faction cards + Standing Orders (fits exactly). Rebels 10 = Luke's 4 named cards usable by Hero of the Rebellion + 3 Rebel faction cards + Standing Orders + 2 of Ambush/Push/Assault (unknown which).

### 1.2 Common facts for every slice unit

- Base: small 27 mm round; silhouette: small trooper cylinder (R-10, `core/bases.json`). Unit types: `trooper`, Wookiee Warriors `wookiee trooper` (no extra rules, R-20.2).
- Upgrade icons: `force`, `command`, `training`, `gear`, `grenades`, `comms`, `heavy weapon`, `personnel`. A unit takes each upgrade card at most once; unique (bullet) names cap across card types (R-3.2).
- Points: ERR values are used for both tournament and casual play (ruling A1).

## 2. Galactic Empire

### 2.1 Units

| Unit | Rank | Pts | Minis | W | Def | Cou | Spd | Surge atk / def | Keywords | Upgrade bar |
|---|---|---|---|---|---|---|---|---|---|---|
| **Darth Vader**, Dark Lord of the Sith `emp.u.darth-vader-dlots` (unique) | Commander | 170 C | 1 C | 8 C | red C | - (none) C | 1 C | none / none C | Compel: Corps Trooper C, Deflect C, Immune: Pierce C, Master of the Force 1 C, Relentless C | command, force x3 C |
| **Stormtroopers** `emp.u.stormtroopers` | Corps | 42 C | 4 C | 1 C | red C | 1 C | 2 C | hit / none C | Precise 1 C | heavy weapon, personnel, gear, grenades F |
| **Scout Troopers** `emp.u.scout-troopers` | Special Forces | 48 C | 4 C | 1 C | white C | 2 C | 2 C | none / block C | Low Profile C, Scout 3 C, Sharpshooter 1 C | heavy weapon, training, comms, gear, grenades (5 icons C) |
| **Scout Troopers**, Strike Team `emp.u.scout-strike-team` | Support | 22 C | 1 X | 1 C | white C | 2 C | 2 C | crit / block C | Detachment: Scout Troopers C, Heavy Weapon Team C, Incognito C, Low Profile C, Prepared Position C | heavy weapon, training, comms, gear, grenades F |

### 2.2 Weapons

| Weapon | On | Range | Dice | Keywords | Mark |
|---|---|---|---|---|---|
| Vader's Lightsaber `emp.w.vaders-lightsaber-dlots` | Darth Vader | melee | 6 red | Impact 3, Pierce 3 | C |
| Bludgeon `emp.w.bludgeon` | Stormtroopers | melee | 1 white | - | C |
| E-11 Blaster Rifle `emp.w.e11` | Stormtroopers | 1-3 | 1 white | - | C |
| Unarmed `core.w.unarmed-black` | Scout Troopers, Strike Team | melee | 1 black | - | C |
| EC-17 Hold-Out Blaster `emp.w.ec17` | Scout Troopers, Strike Team | 1-2 | 2 black | - | C |

### 2.3 Upgrade options (current, for these units)

Unit-specific (all read on EUP):

| Upgrade | Slot | Pts | Effect (own words) | Mark |
|---|---|---|---|---|
| DLT-19 Stormtrooper | heavy weapon (Stormtroopers) | 20 | adds a figure with DLT-19 Blaster Rifle: 1-4, 2 red, Impact 1 | C |
| HH-12 Stormtrooper | heavy weapon (Stormtroopers) | 22 | HH-12 Rocket Launcher: 2-4, 3 black, Cumbersome, Impact 3 | C |
| T-21 Stormtrooper | heavy weapon (Stormtroopers) | 20 | T-21 Repeating Blaster: 1-3, 4 white, Critical 2 | C |
| RT-97C Stormtrooper | heavy weapon (Stormtroopers) | 22 | RT-97C Blaster Rifle: 1-4, 1 red + 3 white | C |
| Stormtrooper | personnel | 8 | adds 1 Stormtrooper figure | F |
| Stormtrooper Captain | personnel | 10 | adds a Captain figure with Leader; unit gains a training icon; may exhaust at the start of the unit's activation: this activation the unit cannot remove suppression and cannot become Suppressed | C |
| Stormtrooper Specialist | personnel | 9 | adds a Specialist; unit gains a gear icon; exhaust, free card action: gain 1 Aim or 1 Surge token | C |
| Stormtrooper Squad | personnel | 40 E (46 printed) | adds 5 Stormtroopers; the unit has Indomitable and is in cohesion within range 1 (not half range) of its leader, both even after those figures die; the unit cannot deploy or take orders through Transport | C |
| Sonic Charge Saboteur | heavy weapon (Scout Troopers) | 17 | Sonic Charge: melee-1, 1 red + 2 black + 1 white, Blast, Impact 4, Suppressive; when added to a pool, the pool's other ranged weapons gain Assault 1 | C |
| DLT-19x Sniper | heavy weapon (Scout Strike Team only) | 20 | DLT-19x Sniper Rifle: 2-5, **2 black + 1 white**, High Velocity, Overwhelm, Sniper Team | X (LHQ: 1 black + 2 white) |

Generic options Vader may take (GUP; only the four marked C were read; the rest are LHQ names and costs, text to read when enabled):

- force (dark side or neutral): Force Choke 10 C (exhaust, free card action: a non-Commander, non-Operative enemy Trooper unit within range 1 suffers 1 wound), Force Reflexes 5 C (exhaust, free card action: gain 1 Dodge), Fear 3 C (gains Demoralize 1), Anger 3 C (after suffering wounds, gain 1 Aim), Force Push 40 C (exhaust, free card action: an enemy Trooper unit within range 1 makes a Speed-1 move you control, even while engaged), Force Barrier 10 C (exhaust when another allied Trooper unit within 1 defends against a ranged attack: cancel 1 crit or up to 2 hits **(icon)**), Force Guidance 5 C (exhaust, free card action: up to 2 allied units within 2 gain 1 Surge token), Saber Throw 10 E, Burst of Speed 10, Terror 6, Force Enhanced Defense 5, Force Agility 8, Battlemind 8, Annul 12, Despair 5, Hatred 8, Force Drain 14, Clairvoyance 10 (all F).
- command: Strict Orders 5, Inspiring Presence 5, Vigilance 9 E, Lead By Example 8, Improvised Orders 5, Trusted Agent 5, Fire Control 5, Underworld Connections 5 (F).
- Stormtroopers / Scouts generic slots (F): gear (Targeting Scopes 4, Environmental Gear 2, Grappling Hooks 2, Recon Intel 8, Emergency Stims 8, Electrobinoculars 8, Portable Scanner 6, Prepared Supplies 5, Extra Supplies 5, Ascension Cables 4, Superior Equipment 15, High Speed Tracking 3, Tank Hunting Munitions 3, Overcharged Blaster Packs 3); grenades (Fragmentation 5, Impact 3, Concussion 3, Smoke 3, EMP "Droid Poppers" 3, Sonic Imploders 3); training for Scouts (Tenacity, On The Hunt, Endurance 6; Duck and Cover 2; Overwatch, Situational Awareness, Into the Fray 4; Offensive Push 6; Protector 5; Up Close and Personal 8; Mission Objective 6; Hit the Dirt 3; Lying In Wait 5; Stuck In 8; Go For Broke 5; Agile Climber 3; Dug In 6; Imperial March 6 is Corps-only, so a Stormtrooper Captain's training icon can take it); comms for Scouts (HQ Uplink 10, Comms Jammer 5, Hacked Comms Unit 5, Emergency Transponder 4, Spotter Uplink 3).

### 2.4 Command cards (EC, all read C)

| Card | Pips | Orders | Effect (own words) | Hook |
|---|---|---|---|---|
| Implacable `emp.cc.implacable` | 1 | Darth Vader | This round Vader gains 1 Dodge at the start of each of his activations. After his first activation he may suffer 1 wound to shuffle his order token back into the order pool; in his second activation he has one fewer action. | code `implacable` (second activation in a round) |
| Vader's Might `emp.cc.vaders-might` | 1 | Darth Vader | This round Vader has a free card action: pick another non-Heavy unit within range 1, put its leader anywhere within half range and height 1 of where it was, the rest in cohesion; if it is an enemy, roll 1 white defence die per figure, 1 wound per block and per surge. | code `vadersMight` (placement + roll) |
| New Ways to Motivate Them `emp.cc.new-ways` | 2 | 2 Trooper units | This round, when an allied Trooper unit other than Vader with a face-up order starts its activation, it may suffer 1 wound for 1 extra action that activation. | declarative optional trigger |
| Fear and Dead Men `emp.cc.fear-and-dead-men` | 2 | Darth Vader | This round, after an enemy attack wounds Vader, the attacking unit suffers the same number of wounds. | declarative `dealWounds` at `attack.resolved` |
| Master of Evil `emp.cc.master-of-evil` | 3 | Darth Vader + 2 units | Vader gains 1 Dodge; at the start of his next activation every enemy Trooper unit within range 2 gains 3 suppression. | declarative |
| Darkness Descends `emp.cc.darkness-descends` | 3 | Darth Vader | Permanent: if it was not Divulged, Vader has Reliable 2. Divulge (Resolve Setup Effects step): Vader gains Infiltrate for the game, and this card must be the one played in round 1. | code `darknessDescends` (Divulge, forced pick) |
| Covert Observation `emp.cc.covert-observation` | 1 | 1 Operative or Special Forces unit | This round, each enemy unit issued an order through a command card gains 1 suppression. | declarative on `OrderIssued` |
| Pinned Down `emp.cc.pinned-down` | 2 | 2 Support or Heavy units | This round, after an allied Support or Heavy unit attacks a unit with a face-up order, that order token goes back into its owner's order pool. | code `orderTokenToPool` |
| Coordinated Fire `emp.cc.coordinated-fire` | 3 | 3 Corps units | This round, after an allied Corps unit spends Aim on a ranged attack, another allied unit within 2 may gain 1 Aim. | declarative |
| Ambush / Push / Assault | 1 / 2 / 3 | 1 / 2 / 3 units | no effect (orders only) | none |
| Standing Orders | 4 | 1 unit | returns to the hand at the end of the Command phase | engine rule (R-4.7) |

### 2.5 Two Recon lists (600 points, starter contents)

| List | Units | Points |
|---|---|---|
| **EMP-A "Full box"** `emp.list.recon-a` | Darth Vader 170; Stormtroopers + Stormtrooper Squad + DLT-19 Stormtrooper (102) x2; Scout Troopers + Sonic Charge Saboteur (65) x2; Scout Strike Team + DLT-19x Sniper (42) x2 | **588** |
| **EMP-B "Vader's Fist"** `emp.list.recon-b` | Darth Vader + Force Choke + Force Reflexes + Fear (188); Stormtroopers + Squad + T-21 (102); Stormtroopers + Squad + HH-12 (104); Scout Troopers + Sonic Charge Saboteur (65) x2; Scout Strike Team + DLT-19x Sniper (42) | **566** |

Ranks: Commander 1, Corps 2, Special Forces 2, Support 2 (A) / 1 (B); Strike Teams are Detachments and need their own Scout Troopers unit each. Hand for both: Implacable, Vader's Might, New Ways to Motivate Them, Fear and Dead Men, Master of Evil, Darkness Descends, Standing Orders.

### 2.6 Gotchas (Empire)

1. Vader's courage is "-": he never takes suppression, and allied units within range 3 of a Commander with "-" courage use it and **never panic** [CRB p24]. Easy to miss; `query.panicOdds` must show 0.
2. Compel is "Corps Trooper" on the card (LHQ just says Corps): only allied non-Droid Corps Trooper units within range 2 that rallied and are Suppressed but not Panicked may take 1 more suppression for a free Move at the start of their Make Actions step.
3. Deflect works only against ranged attacks (and Guardian, not in the slice): the defence chart gains surge to block, and the attacker suffers 1 wound before defence surges are converted if any surge was rolled. Lightsaber melee is unaffected.
4. Vader is Speed 1 with Relentless: Move then a free Attack; still only one Attack action per activation otherwise (R-5).
5. Strike Team: Heavy Weapon Team forces a heavy weapon and makes that figure the unit leader; the unit is 2 figures. Sniper Team only works if the pool holds nothing but Sniper Team weapons, the unit has not moved, and **every** figure sees the target; the spotter's EC-17 therefore cannot join that pool (it may attack another defender as a second pool).
6. The Saboteur grants Assault 1 to the **other** ranged weapons in its pool, not to the Sonic Charge itself.
7. Stormtrooper Squad keeps Indomitable and the range-1 cohesion after its five figures die.
8. Printed points differ from ERR for Stormtrooper Squad (46 printed, 40 used).
9. LHQ data errors found: Scout Strike Team minicount 4 (card: 1); DLT-19x dice 1 black + 2 white (card: 2 black + 1 white).

### 2.7 Implementer brief (Empire)

- Files: `src/data/armies/empire/{units,weapons,upgrades,command-cards,lists}.json`, faction code hooks in `src/engine/armies/empire.ts` (`implacable`, `vadersMight`, `darknessDescends`, `orderTokenToPool`).
- Mark the faction `playable: true` only when every keyword and card used by `emp.list.recon-a` and `-b` is implemented (V-05); the remaining options stay in data and may be `{"unimplemented": ...}` but are then refused in any list.
- Fixture tests: Vader panic aura, Compel free move, Deflect wound timing, Sniper Team cancel-for-wound, Squad cohesion after losses, Sonic Charge Assault grant.

## 3. Rebel Alliance

### 3.1 Units

| Unit | Rank | Pts | Minis | W | Def | Cou | Spd | Surge atk / def | Keywords | Upgrade bar |
|---|---|---|---|---|---|---|---|---|---|---|
| **Luke Skywalker**, Hero of the Rebellion `reb.u.luke-hotr` (unique) | Commander | 120 C | 1 C | 6 C | red C | 3 C | 2 C | crit / none C | Jump 1 (card action) C, Block C, Charge C, Immune: Pierce C, Inspire 2 C, Sharpshooter 1 C | force, command, training, gear C |
| **Rebel Troopers** `reb.u.rebel-troopers` | Corps | 40 C | 4 C | 1 C | white C | 1 C | 2 C | none / block C | Agile 1 C, Nimble C | heavy weapon, personnel, gear, grenades (4 icons C) |
| **Rebel Commandos** `reb.u.rebel-commandos` | Special Forces | 42 E (48 printed) | 4 F | 1 F | white F | 2 F | 2 F | hit / block F | Low Profile F, Scout 2 F, Sharpshooter 1 F | heavy weapon, training, comms, gear, grenades (5 icons C) |
| **Rebel Commandos**, Strike Team `reb.u.commando-strike-team` | Support | 20 C | 1 C | 1 C | white C | 2 C | 2 C | crit / block C | Detachment: Rebel Commandos C, Heavy Weapon Team C, Incognito C, Low Profile C, Prepared Position C | heavy weapon, training, comms, gear, grenades F |
| **Wookiee Warriors**, Freedom Fighters `reb.u.wookiee-warriors-ff` | Special Forces | 62 E (69 printed) | 3 C | 3 C | white C | 2 C | 2 C | hit / none C | Charge C, Duelist C, Indomitable C, Scale C | heavy weapon, training, training, gear, grenades (5 icons C) |

### 3.2 Weapons

| Weapon | On | Range | Dice | Keywords | Mark |
|---|---|---|---|---|---|
| Anakin's Lightsaber `reb.w.anakins-lightsaber` | Luke | melee | 2 red + 3 black | Impact 2, Pierce 1 | C |
| Luke's Blaster `reb.w.lukes-blaster` | Luke | 1-2 | 1 red + 3 black | Long Shot, Pierce 1 | C |
| Unarmed `core.w.unarmed-black` | Rebel Troopers, Commandos, Strike Team | melee | 1 black | - | C |
| **A280 Blaster Rifle** `reb.w.a280` | Rebel Troopers, Commandos, Strike Team | 1-3 | 1 black | - | X (LHQ name "A-200") |
| Ryyk Blade `reb.w.ryyk-blade` | Wookiee Warriors | melee | 2 black | - | C |
| Kashyyyk Pistol `reb.w.kashyyyk-pistol` | Wookiee Warriors | 1-2 | 1 black + 1 white | - | C |

### 3.3 Upgrade options (current, for these units)

| Upgrade | Slot | Pts | Effect (own words) | Mark |
|---|---|---|---|---|
| Z-6 Trooper | heavy weapon (Rebel Troopers) | 20 | Z-6 Rotary Blaster: 1-3, 6 white | C |
| DLT-20A Trooper | heavy weapon (Rebel Troopers) | 26 | DLT-20A Blaster Rifle: 1-4, 2 black + 1 white, Critical 1 | C |
| SX-21 Trooper | heavy weapon (Rebel Troopers) | 13 | SX-21 Scatter Blaster: 1-2, **2 red + 2 black**, Impact 1 | X (LHQ: 2 red + 2 white) |
| MPL-57 Ion Trooper | heavy weapon (Rebel Troopers) | 27 | MPL-57 Ion Blaster: **1-3**, 2 black + 1 white, Critical 1, Impact 1, Ion 1 | X (LHQ range 0-3); out of the playable slice (Ion has no target, K-43) |
| Rebel Trooper | personnel | 7 | adds 1 figure | F |
| Rebel Trooper Captain | personnel | 9 | assumed same text as Stormtrooper Captain | F |
| Rebel Trooper Specialist | personnel | 8 | assumed same text as Stormtrooper Specialist | F |
| Rebel Trooper Squad | personnel | 40 E (45 printed) | adds 5 Rebel Troopers; Indomitable and range-1 cohesion that persist; no Transport | C |
| Proton Charge Saboteur | heavy weapon (Rebel Commandos) | 14 | Proton Charge: melee-1, 1 red + 1 white + 1 black, Blast, Impact 6; the pool's other ranged weapons gain Assault 1 | C |
| DH-447 Sniper | heavy weapon (Commando Strike Team only) | 20 | DH-447 Sniper Rifle: 2-5, **2 black + 1 white**, High Velocity, Overwhelm, Sniper Team | X (LHQ: 1 black + 2 white) |
| Bowcaster Wookiee | heavy weapon (Wookiee Warriors) | 31 | Bowcaster: **1-3**, 1 red + 1 white, Impact 1, Pierce 1 | X (LHQ range 0-3) |
| Long Gun Wookiee | heavy weapon (Wookiee Warriors) | 26 | Long Gun: 1-4, 2 black, Suppressive | C |
| Battle Shield Wookiee | heavy weapon (Wookiee Warriors) | 26 | two-sided card, side picked at deployment; at the start of the unit's activation it may flip. Defensive side: unit's maximum Speed -1 and Armor 1; Battle Shield melee 2 black. Offensive side: Battle Shield melee 2 red (F, not seen) | C (defensive side) |
| Jyn Erso, Luke Skywalker (character heavy-weapon upgrades) | heavy weapon | 22 / 25 | not in the starter; Luke's is illegal beside Luke the Commander (same unique name) | F, out of slice |

Generic options for Luke (light side or neutral force: Force Push 40 C, Force Reflexes 5 C, Force Barrier 10 C, Force Guidance 5 C, Hope 3 C (gains Inspire 1), Jedi Mind Trick 5, Saber Throw 10 E, Burst of Speed 10, Tranquility 10, Helping Hand 5, Force Absorb 5, Force Enhanced Defense 5, Force Agility 8, Battlemind 8, Annul 12, Clairvoyance 10), command, training, gear, grenades and comms as listed in 2.3 (F unless marked).

### 3.4 Command cards (RC, BC; all read C)

| Card | Pips | Orders | Effect (own words) | Hook |
|---|---|---|---|---|
| Son of Skywalker `reb.cc.son-of-skywalker` | 1 | Luke Skywalker | After Luke's first attack this round resolves, he may make a free Attack action even if he already attacked this turn. | declarative `grantFreeAction{attack, ignoreAttackLimit}` |
| My Ally Is the Force `reb.cc.my-ally-is-the-force` | 2 | 2 Trooper units | Each unit ordered with this card gains 1 Dodge. | declarative on `OrderIssued` |
| Full of Surprises `reb.cc.full-of-surprises` | 2 | Luke Skywalker | Luke gains 1 Dodge; this round, when he defends, he rolls extra white defence dice equal to his courage minus his suppression tokens (minimum 0). | declarative modifier |
| Return of the Jedi `reb.cc.return-of-the-jedi` | 3 | Luke + 2 units | When ordered, Luke gains 1 Dodge; at the start of his next activation each allied Trooper unit within range 3 of him may remove 1 suppression. | declarative |
| Sabotaged Communications `reb.cc.sabotaged-communications` | 1 | 1 Operative or Special Forces unit | This round, an opponent issuing orders through a command card may issue only 1 order with it. | declarative modifier on order count |
| Turning the Tide `reb.cc.turning-the-tide` | 2 | 2 Support or Heavy units | Allied Support and Heavy units gain Inspire 2 this round. | declarative |
| Covering Fire `reb.cc.covering-fire` | 3 | 3 Corps units | This round, after an allied Corps unit's ranged attack resolves, another allied unit within range 2 may gain 1 Dodge. | declarative |
| I Am a Jedi, You Serve Your Master Well | 3 / 1 | Luke | restricted to Luke Skywalker, Jedi Knight (ERR errata): **not legal** with Hero of the Rebellion | - |
| Ambush / Push / Assault / Standing Orders | 1 / 2 / 3 / 4 | 1 / 2 / 3 / 1 | as 2.4 | - |

### 3.5 Two Recon lists (600 points, starter contents)

| List | Units | Points |
|---|---|---|
| **REB-A "Full box"** `reb.list.recon-a` | Luke + Force Push (160); Rebel Troopers + Rebel Trooper Squad + Z-6 Trooper (100) x2; Rebel Commandos + Proton Charge Saboteur (56); Commando Strike Team + DH-447 Sniper (40); Wookiee Warriors + Bowcaster Wookiee (93) | **549** |
| **REB-B "Shield wall"** `reb.list.recon-b` | Luke + Force Reflexes (125); Rebel Troopers + Squad + DLT-20A Trooper (106); Rebel Troopers + Squad + SX-21 Trooper (93); Rebel Commandos + Proton Charge Saboteur (56); Commando Strike Team + DH-447 Sniper (40); Wookiee Warriors + Battle Shield Wookiee (88) | **508** |

Ranks: Commander 1, Corps 2, Special Forces 2, Support 1. The Rebel box is cheaper than the Empire box; the 50-90 spare points wait for Luke's command/training/gear and the Wookiees' training upgrades once their text is entered. Hand: Son of Skywalker, Sabotaged Communications, My Ally Is the Force, Full of Surprises, Return of the Jedi, Covering Fire, Standing Orders.

### 3.6 Gotchas (Rebels)

1. Block needs at least one Dodge spent in Apply Dodge and Cover; then the defence chart gains surge to block for that attack.
2. Jump 1 is a card action taken instead of a Move (it is a Move): ignore terrain and figures of height 1 or less and difficult terrain; the tool may cross impassable terrain but not end on it; heights measured from the start.
3. Long Shot: spend 1 Aim **before** choosing the defender for +1 maximum range on Long Shot weapons; that Aim cannot reroll; once per attack.
4. Agile 1 triggers after a Standard Move from an action or free action (not after Climb or a Jump); Nimble regains a Dodge after defending if one was spent.
5. Duelist: Pierce 1 on melee attacks when an Aim is spent rerolling; Immune: Pierce when defending in melee and a Dodge is spent. Both on top of the normal token effect.
6. Battle Shield flips at activation start (Speed 2 -> 1 and Armor 1 on the defensive side): enemy Impact X now converts hits to crits against the Wookiees (Vader's Impact 3, HH-12 Impact 3). Armor cancels hits in Modify Attack Dice.
7. Full of Surprises counts courage minus current suppression at the Roll Defense Dice step.
8. LHQ data errors found: weapon name "A-200" (card: A280); SX-21 dice; MPL-57 and Bowcaster range 0-3 (card: 1-3); DH-447 dice. Printed points on the Rebel unit and upgrade PDFs are older than ERR (Commandos 48, Wookiees 69, Squad 45).
9. Rebel Commandos (Special Forces) front card not yet seen: its stats are F.

### 3.7 Implementer brief (Rebels)

- Files: `src/data/armies/rebels/{units,weapons,upgrades,command-cards,lists}.json`; faction hooks in `src/engine/armies/rebels.ts` (none needed for the default lists; Battle Shield flip uses the core `flipCard` hook).
- Generic command cards and generic upgrades live once in `src/data/armies/neutral/`.
- Fixture tests: Block with and without a Dodge spent, Jump over a height-1 wall, Long Shot range 3 with the Aim not rerolling, Agile after Move vs after Jump, Duelist both halves, Battle Shield flip and Armor vs Impact, Full of Surprises dice count.

## 4. Keywords survey (every unit, weapon and card keyword the slice uses)

Columns: page in CRB (+-1), meaning (own words), timing window (`00-architecture.md` 4; `mod:<step>` means a passive modifier the owning step reads, not a trigger), kind (**D** declarative, **N** engine-native rule switched on by a declarative flag, **H** `{"code"}` hook), difficulty (1 easy - 3 hard). K-ids are referenced by `12-rules-test-checklist.md`.

### 4.1 Unit keywords

| K | Keyword | p | Meaning | Window | Kind | Diff |
|---|---|---|---|---|---|---|
| K-01 | Agile X | 46 | After a Standard Move (action or free action), gain X Dodge | `move.ended` | D | 1 |
| K-02 | Armor X | 46 | Defender may cancel up to X hit results (not crits) in Modify Attack Dice | `attack.modified` | D | 1 |
| K-03 | Block | 47 | If it spent a Dodge while defending, its defence chart gains surge to block for that attack | `attack.coverApplied` -> `mod:defenceSurge` | D | 1 |
| K-04 | Charge | 47 | After a Move action that starts a melee, may make a free melee-only Attack against that unit | `melee.charged` | D | 2 |
| K-05 | Compel: Corps Trooper | 47 | Another allied non-Droid Corps Trooper unit within 2 that rallied and is Suppressed, not Panicked, may take 1 suppression for a free Move at the start of its Make Actions | `activation.rallied` (aura from another unit) | H `compel` | 2 |
| K-06 | Deflect | 49 | Defending vs ranged: chart gains surge to block, and before surges convert the attacker suffers 1 wound if any surge was rolled | `defence.rolled` | H `deflect` | 2 |
| K-07 | Demoralize X | 49 | After it rallies, add up to X suppression spread over enemy units within 2 | `activation.rallied` | D (distribute, `keyword.choice`) | 2 |
| K-08 | Detachment: name | 49 | Not counted against its rank maximum; needs its own matching non-Detachment unit; inherits Infiltrate or Prepared Position from it | army validation + `setup.*` | N | 1 |
| K-09 | Duelist | 49 | Melee attack with an Aim spent rerolling gains Pierce 1; defending in melee with a Dodge spent gains Immune: Pierce | `attack.rerolled`, `attack.coverApplied` | D | 1 |
| K-10 | Heavy Weapon Team | 51 | Must equip a heavy weapon upgrade; that figure is the unit leader | army validation + unit build | N | 1 |
| K-11 | Immune: Pierce | 51 | Attackers cannot use Pierce against it | `mod:pierce` | D | 1 |
| K-12 | Incognito | 51 | Cannot be attacked by enemies beyond range 1, cannot contest objectives or give Backup; lost for good when it attacks or defends, or by choice at activation start | `mod:targeting`, `attack.resolved`, `activation.start` (`keyword.choice`) | D | 2 |
| K-13 | Indomitable | 51 | Rallies with red defence dice instead of white | `mod:rally` | D | 1 |
| K-14 | Infiltrate | 51 | Undeployed at activation start: may deploy anywhere completely inside allied Territory, rest in cohesion inside it | `activation.start` | N | 2 |
| K-15 | Inspire X | 51 | At the end of its activation remove up to X suppression in total from other allied units within 2 | `activation.end` | D (distribute, `keyword.choice`) | 2 |
| K-16 | Jump X | 52 | Card action usable whenever it could Move: a Move ignoring terrain and figures of height X or less and difficult terrain; tool may cross impassable terrain | action `kw:jump` -> `move.*` | N (`moveMode{ignoreHeight: X}`) | 3 |
| K-17 | Leader | 61 | That figure is the unit leader; one Leader upgrade per unit; special wound rule for multi-wound leaders | unit build | N | 1 |
| K-18 | Low Profile | 53 | Rolls 1 fewer cover die and adds 1 automatic block to the cover pool | `mod:coverPool` | D | 1 |
| K-19 | Master of the Force X | 53 | At the end of its activation ready up to X exhausted Force upgrades | `activation.end` | D | 1 |
| K-20 | Nimble | 53 | After defending, if it spent a Dodge in that attack, gain 1 Dodge | `attack.resolved` | D | 1 |
| K-21 | Precise X | 53 | Each Aim spent rerolls X more dice | `mod:aimReroll` | D | 1 |
| K-22 | Prepared Position | 53 | Deploys in the setup step completely inside allied Territory (leader), rest in cohesion; gains 1 Dodge | `setup.deploy` | N | 2 |
| K-23 | Relentless | 54 | After a Move action in its activation, may make a free Attack action | `action.resolved` | D (optional grant) | 1 |
| K-24 | Reliable X | 54 | Gains X Surge tokens at the start of each Activation phase (from Darkness Descends) | `activation.phaseStart` | D | 1 |
| K-25 | Scale | 55 | Climbs up to height 2; difficult terrain never reduces its Speed | `mod:move` | D | 2 |
| K-26 | Scout X | 54 | Undeployed at activation: at the start of Make Actions may deploy with a free Speed-X Move ignoring difficult terrain, regardless of Speed; values add, max 3 | `activation.rallied` | N | 2 |
| K-27 | Sharpshooter X | 55 | Subtract X from the defender's cover value | `mod:cover` | D | 1 |

### 4.2 Weapon keywords

| K | Keyword | p | Meaning | Window | Kind | Diff |
|---|---|---|---|---|---|---|
| K-31 | Assault X | 58 | Defender within range 1 of the attacking leader: may upgrade X of that weapon's dice (granted by Saboteurs to other ranged weapons) | `attack.poolFormed` | D | 1 |
| K-32 | Blast | 58 | Cover cannot cancel hits from this pool | `mod:cover` | D | 1 |
| K-33 | Critical X | 59 | Convert up to X surges to crits | `attack.surgesConverted` | D | 1 |
| K-34 | Cumbersome | 59 | Downgrade each of its dice if the unit has moved this activation | `attack.poolFormed` | D | 1 |
| K-35 | High Velocity | 59 | If every weapon in the pool has it, the defender cannot spend Dodge | `mod:dodge` | D | 1 |
| K-36 | Impact X | 59 | Against Armor only: change up to X hits to crits in Modify Attack Dice | `attack.modified` | D | 1 |
| K-37 | Long Shot | 59 | Before choosing the defender, may spend 1 Aim for +1 maximum range on Long Shot weapons; that Aim cannot reroll; once per attack | `attack.declaring` (new, additive) | D (optional spend) | 2 |
| K-38 | Overwhelm | 59 | If at least 1 Aim was spent rerolling, the defender gains 1 extra suppression | `attack.suppression` | D | 1 |
| K-39 | Pierce X | 59 | Cancel up to X blocks in Modify Defence Dice | `defence.modified` | D | 1 |
| K-40 | Sniper Team | 60 | Pool of only Sniper Team weapons, unit has not moved, every figure has LOS: upgrade those dice; if so, after converting surges may cancel the whole pool and skip to suppression, dealing 1 wound if a crit was cancelled | `attack.poolFormed`, `attack.surgesConverted` | H `sniperTeam` | 3 |
| K-41 | Suppressive | 60 | Defender gains 1 extra suppression | `attack.suppression` | D | 1 |
| K-43 | Ion X | 59 | Vehicles and Droid Troopers wounded gain Ion tokens (fewer actions); shields flip | - | `{"unimplemented": "no vehicle or droid in v1"}`; MPL-57 kept out of playable lists | - |

### 4.3 Card keywords

| K | Keyword | p | Meaning | Window | Kind | Diff |
|---|---|---|---|---|---|---|
| K-51 | Permanent | 62 | Command card stays in play (not discarded in the End phase); its effect lasts while in play | `end.start` | N | 1 |
| K-52 | Divulge | 61 | Card may be revealed at the named step for the text below its line; it is not played and returns to the hand | `setup.*` (Resolve Setup Effects) | N | 2 |

**Count: 40 keywords used by the slice units, the four default lists and their hands (27 unit, 11 weapon, 2 card; Leader appears only through the Captain options), plus Ion X marked unimplemented.** Of the 40: **3 need `{"code"}` hooks** (Compel, Deflect, Sniper Team); 9 are engine-native rules switched on by data (Detachment, Heavy Weapon Team, Infiltrate, Jump X, Leader, Prepared Position, Scout X, Permanent, Divulge); 28 are pure declarative. Card effects add hooks of their own: `implacable`, `vadersMight`, `darknessDescends`, `orderTokenToPool`, `flipCard` (Battle Shield), plus the battle-card hooks of `11-battle.md`.

Transport appears only as a restriction on the Squad cards ("cannot use Transport"); no slice unit has it, so it is a tag, not a keyword record.

### 4.4 Windows to add (additive change-log rows for `00-architecture.md` 11)

- `attack.declaring`: before the defender is chosen (Long Shot spend).
- Passive modifiers (`mod:*`) are read by the owning step (cover pool, cover value, rally dice, aim rerolls, pierce, dodge legality, targeting, movement); they need no window but must be listed in `query.*` explanations so the UI can show why a number changed.

## 5. Proposed RULING lines

- `RULING: Points source | Errata Reference adjusted points (e.g. Stormtrooper Squad 40, Rebel Commandos 42, Wookiee Warriors 62) used for all play | ERR says printed values may be used casually; one number set keeps AI and lists consistent | Port choice`
- `RULING: Sniper rifle dice | DLT-19x and DH-447 roll 2 black + 1 white | AMG upgrade PDF 2026-04 by eye; Legion HQ 2 says 1 black + 2 white | Unsourced (owner check)`
- `RULING: SX-21 dice | 2 red + 2 black | AMG card by eye; Legion HQ 2 says 2 red + 2 white | Unsourced (owner check)`
- `RULING: Starter contents | lists use the assumed "starter-v1" set (Vader DLotS, Luke HotR, Wookiee Freedom Fighters, squads, saboteurs, strike teams) | AMG does not publish card contents | Unsourced`
- `RULING: Rebel Trooper Captain and Specialist text | assumed identical to the Stormtrooper versions | cards not yet read | Unsourced`
