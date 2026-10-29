# Star Wars: Legion (AMG Core Rule Book, effective 2026-06-17) rules primer

Source: AMG's free Core Rule Book, effective 17 June 2026, saved as `docs/sources/amg-legion-core-rules-2026-06-17.pdf` with its text extracted alongside (gitignored; never commit AMG text). The other current documents (Battle Forces, Errata Reference, Recon, card PDFs) and how fresh each one is are listed in `docs/spec/sources.md`. All wording below is ours. Page numbers refer to the Core Rule Book.

## What the game is
- A two-player battle on a 72"x36" table (Recon games: 600 points on 36"x36"). Each army is up to 1000 points of **units**: squads of several models, or single heroes and vehicles. Each unit has a unit leader and moves and fights together.
- Armies come from one faction: Empire, Rebels, Republic or Separatists, plus Mercenaries and Battle Forces.
- Ranks: Commander 1-2, Operative 0-2, Corps 3-6, Special Forces 0-3, Support 0-3, Heavy 0-2.
- A game lasts **5 rounds**. Players score Victory Points (VP) from cards. Anyone ending a round on 12 VP or more, and ahead, wins at once. Wiping out the enemy also wins. Otherwise the most VP after round 5 wins, and the tiebreak is fewer of your own points destroyed.

## Shape of a battle
- **Setup (p16-20):**
  - Each player brings a 7-card command hand (two each of 1, 2 and 3 pips, plus the 4-pip Standing Orders) and a 9-card Battle Deck (3 Objective, 3 Secondary, 3 Advantage) with the 3 matching Map cards.
  - Each player rolls 4 black dice. Most crits, then hits, then surges, decides the blue player.
  - Starting with blue, each player twice changes the mission (swaps the Objective, Secondary or an Advantage card, takes over as blue, or passes). Blue then picks a long edge, and the card setup instructions are resolved.
  - **Nobody deploys in a zone.** Only units with Prepared Position are placed during setup. Every other unit enters on its first activation with a Move that starts from the tool touching its own table edge in friendly Territory.
- **Command phase (p21-22):**
  - Both players pick a command card in secret, then reveal. **Fewest pips takes priority.** On a tie, one player rolls a red defence die: a block result gives that player priority, anything else gives it to the opponent.
  - Each player names a commander, who issues the orders the card allows: a faceup order token goes next to each chosen unit.
  - Every unit without an order puts its rank token into the face-down **order pool**.
  - The player with fewer units gets a **pass pool** of Advantage tokens equal to the unit-count difference minus 1.
- **Activation phase (p22-24):**
  - Players alternate turns, the priority player first. On a turn you either activate a unit with a faceup order, or draw a random pool token and activate an unordered unit of that rank. You may instead spend a pass token, but not twice in a row.
  - Each activation runs: start effects, then **rally** (roll a white defence die per suppression token and remove one token per block or surge), then up to **2 actions**, then end effects, then the order token is turned face down.
  - Actions are Move, Attack, Aim, Dodge, Recover, Standby and card actions. Each may be taken once per activation, except Move. Free card actions cost nothing. A unit gets only one Attack action per activation.
- **Movement (p24-28):**
  - The Speed-1, 2 and 3 tools have a hinge at the joint. The tool must not exceed the unit's speed, and difficult terrain cuts speed by 1 (minimum 1).
  - Small bases: start the tool touching the leader, bend it, then put the leader anywhere touching the tool. The rest of the unit is placed in cohesion.
  - Notched bases: turn up to 90° first, then move along the tool, either a full move (rear notch at the far end) or a partial move.
  - Models may move through other models but must not finish overlapping one.
  - **Climb:** a speed-1 move that may rise 1 height; notched bases cannot climb. A unit may walk over obstacles lower than its silhouette without climbing.
- **Cohesion (p23):** every model must be within **half range (3")** of its leader, no higher or lower than the leader's silhouette height, and in line of sight (LOS) of the leader. The cohesion measurement may not cross impassable terrain.
- **Range (p11):** range is measured horizontally between bases with a ruler of 6" segments, so range 1 is 0-6", range 2 is 6-12" and so on up to range 5, and anything farther is "beyond 5". A 3" half-range segment also exists. Melee means base contact.
- **Line of sight (p30-31):**
  - Each model is a **silhouette cylinder**: troopers on small bases use the small template; creature, emplacement and heavy troopers use the large one. A vehicle's cylinder runs from its base to the top of its hull, ignoring guns, antennas and crew.
  - LOS exists if any point of one silhouette sees any point of the other.
  - Trooper silhouettes never block LOS. Vehicle silhouettes do, except repulsor vehicles.
  - Area terrain blocks LOS through its whole footprint volume. A model standing inside the area ignores that piece but always counts as obscured.
- **Cover (p14, p34):**
  - A model is obscured if LOS from the attacking leader to it is blocked by terrain within 3" of the model, as long as the attacking leader is not touching that terrain.
  - If at least half the defending models are obscured, the unit has cover. It is heavy cover if any obscuring terrain is heavy, otherwise light.
  - A **Suppressed** unit improves its cover by one step, and cover can never exceed heavy (value 2).
  - **Cover is rolled:** the defender rolls one white defence die per hit. Light cover cancels a hit for each block rolled. Heavy cover cancels a hit for each block or surge rolled.
  - Barricades give heavy cover to ordinary troopers but none to creature or heavy troopers.
- **Attack sequence (p30):**
  1. Declare the defender: it must be in range and in LOS of the attacking leader.
  2. Form attack pools: each model that can see the target adds one weapon. Weapons with the same name must go in the same pool, and melee and ranged weapons never mix in one pool.
  3. Optionally split the remaining weapons into a further pool against a different defender.
  4. Roll attack dice: upgrade and downgrade dice first, then roll, then reroll with Aim (up to 2 dice per token), then convert surges using the unit's surge chart or Surge tokens.
  5. Dodge and cover: count obscured models, decide the cover type, roll cover dice and cancel hits, then spend Dodge tokens.
  6. Modify attack dice.
  7. Roll defence dice: one per remaining hit or crit, upgraded or downgraded first, then roll, reroll, and convert surges.
  8. Modify defence dice.
  9. Compare results: each hit or crit not matched by a block is one wound.
  10. Suppression: if the attack was ranged, rolled at least one hit or crit, and the defender survived, the defender gains 1 suppression.
  11. Resolve the next pool.
- **Dice:**
  - Attack dice are d8s in red, black and white. Faces are hit, crit, surge and blank.
  - Defence dice are d6s in red and white. Faces are block, surge and blank.
  - Upgrading moves a die one step stronger: white to black to red for attack, white to red for defence. Downgrading moves it one step weaker.
  - The rulebook gives no face counts. The community-standard counts below are **Unsourced; check them against physical dice**:

    | Die | Faces |
    |---|---|
    | Red attack | 5 hit, 1 crit, 1 surge, 1 blank |
    | Black attack | 3 hit, 1 crit, 1 surge, 3 blank |
    | White attack | 1 hit, 1 crit, 1 surge, 5 blank |
    | Red defence | 3 block, 1 surge, 2 blank |
    | White defence | 1 block, 1 surge, 4 blank |
- **Tokens:**
  - Aim: reroll up to 2 attack dice.
  - Dodge: cancels one hit, never a crit.
  - Surge: turns a surge into a hit when attacking, or into a block when defending.
  - Standby: (troopers and ground vehicles only; not in the same activation as an Attack) after an enemy within range 2 and in LOS makes an action, move or attack, the unit may take a free Move or Attack. The free attack must target that enemy. The token is lost if the unit moves, attacks, acts or gains suppression.
  - All of these tokens are cleared in the End phase.
- **Backup (p31):** if the attacker is beyond range 2, a Commander or Operative being shot may cancel 2 hits. It needs a Corps trooper unit that is not Suppressed, whose leader is within 3" and in LOS.
- **Suppression, panic and courage (p15, p23-24):**
  - **Suppressed** means suppression tokens at least equal to courage: one fewer action, and cover improves by one step.
  - **Panicked** means tokens at least double courage. A panicked unit takes no actions, drops any Asset it carries, cannot contest objectives, and at the end of its activation sheds tokens equal to its courage.
  - A Commander within range 3 may lend its higher courage for the panic check.
  - Units with "-" courage never take suppression. Vehicles never take suppression.
  - Droid Troopers do become Suppressed but lose no action for it; units with the AI keyword are forced into their AI action instead.
  - Recover removes any number of suppression tokens and readies exhausted cards. The End phase removes 1 token from every unit.
- **Melee (p28-29):**
  - Only a unit with a melee weapon may move into base contact. Its leader goes in first, then its other models, and then the defender fills in its own models. A model may never touch two enemy units.
  - Engaged trooper units cannot move, cannot shoot, and cannot be shot.
  - **Withdraw:** a speed-1 Move action. The unit may not attack or Standby in the same activation; creature and heavy troopers are exempt from the attack restriction.
  - Vehicles can be in melee but are never engaged.
- **Wounds and the leader (p35):**
  - The defender assigns wounds. The model with the most wounds must keep taking them until it dies. **The leader takes wounds only when it is the last model.**
  - Against a ranged attack, the unit cannot lose more wounds than the total wound value of the models the attacker can see.
  - If the leader dies, another model takes over: swap the leader model in its place.
  - A vehicle that reaches its Resilience gains a damage token (once per game). If it does not have the AI keyword, it then rolls a white defence die at the start of each activation, and a blank means one fewer action.
- **End phase (p38):**
  1. Score the Objective card, then the Secondary card.
  2. Discard the command cards played this round; they are gone for the game.
  3. Clear Aim, Dodge, Observation, Surge and Standby tokens, remove 1 suppression from each unit, and empty the pass pools.
  4. Promote a trooper to Commander if all Commanders are dead.
  5. Advance the round counter.
- **Objectives (p20):**
  - Objective tokens are either point-of-interest (POI) markers or Assets that units carry.
  - A unit contests a token if its leader is within 3" and the unit is not Panicked. The side with more contesting units secures it.
  - A dropped Asset is placed by the opponent within 3" of the leader.
  - For cover, a POI counts as heavy-cover area terrain 3" tall.

## Differences from Kill Team and 40k (brief)
- **Units of many models, one leader.** Range, LOS for declaring targets, and cohesion are all measured from the leader. Kill Team activates single operatives, and 40k activates whole armies phase by phase.
- **Activation:** players alternate one unit at a time, and the hidden command card (fewest pips wins) sets priority. The unit is chosen either by order token or by a random draw from the order pool. There are no AP costs: each unit gets 2 actions plus free actions.
- **No hit, wound or save sequence:** custom dice show hits directly, and each hit or crit gets one defence die. There is no armour save modifier or AP, and crits are simply hits that cover and Dodge cannot cancel.
- **Movement uses a physical bendable tool, not free inches,** and range bands are 6" steps.
- **Morale is suppression tokens measured against courage.** There is no battle-shock test or Leadership roll.
- **Cover is a die roll.** Kill Team uses a retained save, and 40k adds +1 to the save.

## Where the full rules live
- **Core Rule Book** (AMG, free): https://www.atomicmassgames.com/swlegiondocs/ (the "Download the Rules" button). The current file is `DOC56_SWQ_Rulebook-2.pdf`, effective 2026-06-17. The keyword glossary is on pp. 46-61 and the timing appendix on pp. 44-45.
- Same page: Battle Forces, Errata Reference, Recon rules, Galactic Conquest Event, updated Battle Cards, and per-faction Unit, Upgrade and Command card PDFs. **Points are printed on those card PDFs**; there is no separate points list.
- Changes are announced in AMG Transmissions about every six months (Nov 2025, Apr 2026; the next is expected around Nov 2026).
- Machine-readable stats: the Legion HQ 2 bundle, extracted to `docs/sources/legionhq2-cards-extracted-2026-10-29.json` (Fan-source, current to 2026-06-19). See `docs/spec/sources.md`.

## Edition leak list (paste into every rules prompt)
Implement only the AMG Core Rule Book effective 2026-06-17. Each item below is an **old rule; do not implement it**, followed by the source that shows the change.

**FFG era (2018-2022) and the first AMG Core Rulebook (2023), replaced by the 2024-26 rules**
- 800-point armies and 6 rounds. Now 1000 points and 5 rounds, with VP scored each round from round 2 and an instant win at 12 VP. [Brückenkopf 2024-07-20; Core p16, p20-21]
- Deployment zones and placing units before round 1. Now units enter from their own edge with their first Move, and only Prepared Position units are placed in setup. [Brückenkopf 2024; Core p24-25]
- Flat cover: light cover cancelling 1 hit and heavy cover cancelling 2. Now cover is rolled with white dice (light cancels on block; heavy cancels on block or surge), and Suppressed units improve cover by one step. [Brückenkopf 2024; Core p34]
- The FFG battle deck (4 Objective, 4 Deployment and 4 Condition cards), the bid for blue player by activation count, and only one player's deck being used. Now there are 3 Objective, 3 Secondary and 3 Advantage cards plus Map cards, blue is decided by 4 black dice, and both players modify the mission. **Condition cards such as "Clear Conditions" and "Hostile Environment" are FFG-era.** They still appear in the archived Legion HQ `cards.json`. [Brückenkopf 2024; Core p18-19]
- Panicked units fleeing toward the table edge. Now a panicked unit takes no actions, drops Assets, cannot score, and sheds tokens equal to its courage. [AMG preview: Suppression, 2023-01-04; Core p23]
- No passing (FFG), then the 2023 rule allowing one pass per round if the opponent had more orders left. Now there is a pass pool of Advantage tokens equal to the unit-count difference minus 1. [AMG preview: Passing, 2023; Core p22]
- LOS drawn from a model's head, and judging cover by whether 50% of a model is hidden. Now LOS uses silhouette cylinders from any point to any point, and a unit has cover when half or more of its models are obscured. [AMG preview: Line of Sight, 2022-12-13; Core p30, p34]
- Moving a small base down the centre of the tool, and "clambering". Now the leader is placed touching any part of the tool, a Climb is a speed-1 move rising up to height 1, and units walk over obstacles lower than their silhouette. [AMG preview: Movement, 2023; Brückenkopf 2024; Core p25-28]
- Displacement. It is removed: models may move through any models. Notched bases now get a free turn of up to 90° before moving. [Brückenkopf 2024; Core p26]
- Wounds limited to models in LOS (FFG), then any model at all (2023). Now wounds go to the most-wounded model first and the leader last, and a ranged attack can do no more damage than the total wounds of the models the attacker can see. [AMG preview: LOS, 2022; Core p35]
- Old Withdraw. Now it is a speed-1 Move action, with no attack or Standby in the same activation. [Brückenkopf 2024; Core p29]
- Cohesion measured with a movement tool (old value from memory, not verified). Now it is 3", vertical within the leader's silhouette height, and LOS to the leader. [Core p23]
- Deflect needing a Dodge token. It no longer does. Infiltrate and Transport also work differently now: Infiltrate places the unit in its own Territory, and Transport is an alternative way to deploy. [Brückenkopf 2024]
- Clone Phase I and Phase II profiles, built-in Fire Support on clone corps units, and "leader" personnel upgrades. These became one Clone Trooper Infantry profile and "Squad Leader" upgrades, and squad upgrades were added. Backup is new. [Brückenkopf 2024; Core p31]
- Removed in April 2025:
  - Keywords: Contingencies, Flawed, Loadout.
  - Units: Emperor Palpatine and the Royal Guard.
  - Upgrades: Aggressive Tactics, Battle Meditation, Comms Relay, Esteemed Leader, Gonk droid.
  - Changed in the same update: Strafe, Self Destruct, Tow Cable, Small and Cache.
  - Character command cards can now be locked to one version of the character.

  [AMG Transmission 2025-04-16; Wargamer 2025-04-16]
- Old Cumbersome (no attack after moving). Now the weapon's dice are downgraded if the unit has moved. Dice upgrade and downgrade, Anti-Materiel X and Anti-Personnel X arrived Nov 2025, and the DF-90 mortar now rolls 2 black dice. [AMG Transmission 2025-11-15]
- Droid Troopers immune to suppression, the old AI keyword, Pierce-1 sniper rifles, and Strike Teams as Special Forces. Since April 2026:
  - Droids can be Suppressed but lose no action, and AI forces an action.
  - Heavy Trooper and Heavy Droid Trooper are new unit types (Aqua Droids and Droidekas are Heavy Droid Troopers).
  - Strike Teams are Support rank with Incognito and Prepared Position.
  - Snipers use Sniper Team and Overwhelm.

  [AMG Transmission 2026-04-21; Core p39]
- Points from any FFG "Points Update" PDF or the archived Legion HQ repo. Use only the 2026 AMG card PDFs, cross-checked against the Legion HQ 2 bundle (for example Vader is 170, not 190). [sources.md rows 9-12, 25-26]

**Keep these out (sibling games and side formats)**
- **X-Wing:** maneuver dials, range 0-3, initiative order, firing arcs on every model, Focus, Evade, Lock and Stress tokens, green defence dice, separate shields and hull.
- **Shatterpoint:** struggle tracks, stance cards and combat trees, Force and Duty pools, character expertise charts, shove and dash, injured/wounded card flips, and units of two characters.
- **Armada:** command dials, ships with shield zones.
- **Legion side modes:** Recon (600 points, 3'x3', fixed Recon battle deck, red die for blue player), Special Operations, Tours of Duty and Dangerous Environments are separate formats. None of their rules apply to a standard game.
- **40k / Kill Team:** wound rolls, armour saves modified by AP, CP stratagems, Overwatch, battle-shock, AP costs per action.
