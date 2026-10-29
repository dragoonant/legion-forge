# Rules needing a check (RULING log)

Every place where the engine had to interpret, fill a gap in, or choose between readings of the rules gets one line here, and development continues on the stated choice (CLAUDE.md: ambiguities never block). Rule ids are `docs/spec/10-rules-core.md`; page numbers are the AMG Core Rule Book effective 2026-06-17 ("CRB").

Format, one line each:

`RULING: <rule id + short name> | <what we do> | <why> | <status>`

Status values:
- **Confirmed**: the rulebook text supports the reading directly (page cited).
- **Corrected**: an earlier ruling was wrong and has been changed (say from what).
- **Unsourced**: no primary source states it; we chose a value or reading that needs checking (by the owner, a physical component, or a future AMG document).
- **Fan-source**: the value comes only from a fan tool (Legion HQ 2) or the press, not yet checked by eye against AMG cards.
- **Port choice**: a deliberate digital decision where the tabletop relies on judgment, agreement or physical handling.

When a ruling changes, edit its status and append the reason; never delete a line.

## Components and constants

RULING: R-13.1 Dice face counts | Red attack 5 hit/1 crit/1 surge/1 blank; black 3/1/1/3; white 1/1/1/5; red defence 3 block/1 surge/2 blank; white defence 1/1/4 | CRB p5 pictures the dice but lists no counts; these are the community-standard tables and drive every odds number | Unsourced (community standard; owner to check against starter-set dice)
RULING: R-6.2 Movement tool lengths | Speed-1 4.5", Speed-2 7.0", Speed-3 9.5" overall centreline, hinge at the midpoint | The rulebook gives no tool dimensions (sources.md "Not found"); values are community measurements from memory | Unsourced (owner to measure the starter-set tools; data-only change)
RULING: R-6.2 Movement tool width and prongs | Width 1.0", each end forked into two prongs | Needed for footprint overlap and the edge-deployment "both prongs" rule; not stated in the rulebook | Unsourced (measure physical tool)
RULING: R-6.2 Hinge limit | Hinge may bend up to ±135° from straight | CRB p25 lets the player adjust the joint freely; the physical tool folds until its arms collide; ±135° approximates that | Unsourced / Port choice
RULING: R-10.1 Silhouette heights | Small 1.69", large 2.70"; cylinder radius = base radius | CRB p65 prints both templates; measured at 1:1 the small template is 1.06" wide (exactly a 27 mm base), so the page is taken as true scale; p30 says the silhouette is the base plus the space above it | Unsourced (measured from the PDF; owner to confirm with the physical templates)
RULING: R-20.1 Small base size | 27 mm (1.063") round for all slice units | Starter set pages and the rulebook's small-base rule (CRB p5); exact mm is from the product listing | Fan-source
RULING: GOLDEN fixtures Starter unit stats | Stats in 13-golden-examples.md come from the Legion HQ 2 bundle | AMG card PDFs are image-only; LHQ2 is the only machine-readable current source | Fan-source
RULING: R-4.7 Push orders | Push = 2 pips, orders 2 units | CRB p22 pictures Ambush (1 unit), Assault (3 units) and Standing Orders (1 unit) but not Push; LHQ2 has pips only | Fan-source (check the command-card PDF by eye)
RULING: R-4.7 Standing Orders returns to hand | At the end of the Command phase Standing Orders goes back to the hand and is never discarded | Card text pictured on CRB p22 | Confirmed (CRB p22)

## General, measuring, LOS

RULING: R-1.4 Pre-measuring | Every distance, band and LOS verdict is available to human and AI before committing | CRB p11 allows measuring any distance at any time | Confirmed (CRB p11)
RULING: R-3.5 Terrain agreement | Terrain type, cover, height, LOS behaviour and movement class are fixed per battlefield in data; no in-game negotiation | CRB p12-14 leaves these to player agreement ("golden rule of terrain") | Port choice
RULING: R-8.2 Band boundary | A distance of exactly 6n" is range n (bands are (6(n-1), 6n], range 1 includes 0) | CRB p11 adds segments "until longer than the distance", which leaves an exact boundary ambiguous; matches 00-architecture 7.1 | Port choice
RULING: R-1.6 Elevated base contact | Contact if the horizontal gap is <= 0.002" and the vertical gap is <= the taller silhouette height | CRB p5 defines it with these two conditions | Confirmed (CRB p5)
RULING: R-10.2 LOS sampling | LOS = any clear ray between data-defined sample points (top and bottom rims plus axis points) of the two cylinders | CRB p30 is any point to any point; finite sampling approximates it; counts are data so they can be raised if a test finds a miss | Port choice
RULING: R-12.2 Undeployed units | Undeployed units are never targets, never in range of table units, and count only allied undeployed units as in range and LOS | CRB p12 | Confirmed (CRB p12)

## Setup and command

RULING: R-3.6 Recon blue roll | Seat A rolls the red defence die; block = A is blue | Recon p2 says "one player rolls" without saying who; both seats have the same odds either way | Port choice
RULING: R-3.7 Modification order after a blue switch | The four modifications alternate by seat starting with the original blue player, even if blue changes hands mid-way | CRB p19 says "starting with the blue player, players alternate" and lets a modification take the blue token; alternation by seat keeps each player at exactly two | Port choice
RULING: R-4.4 Who rolls the priority tie | The blue player rolls the red defence die | CRB p21 says "one player rolls"; the odds are 1/2 for either seat (3 block faces of 6, Unsourced face table) | Port choice
RULING: R-4.6 No early stop when issuing orders | `command.order` has no "done" option while any eligible unit remains | CRB p22: the commander must issue all orders it can | Confirmed (CRB p22)
RULING: R-4.6 No order range | Orders need no range or LOS from the commander | CRB p22 lists only "not already ordered" and "matches the card's type"; the old range requirement is absent from this edition | Confirmed (CRB p22)

## Activation

RULING: R-5.2 Single-candidate pool pick | When exactly one unit matches the drawn rank it is activated without an `activation.pick` decision | No choice exists; saves a click and an AI call | Port choice
RULING: R-5.3 Pass after a dead draw | The optional pass after removing an unusable drawn token spends no pass-pool token and counts as a pass for the "not twice in a row" rule | CRB p23 says the player "may Pass" without mentioning the pass pool; treating it as a pass is the conservative reading | Unsourced
RULING: R-5.12 Standby range and LOS | Trigger if any model of the enemy unit is within range 2 of any model of the Standby unit and any model of the Standby unit has LOS to any model of the enemy unit | CRB p37 range and LOS wording read with the unit "within" rule of CRB p12 | Unsourced
RULING: R-5.12 Standby on any action | Every completed enemy action (including Aim, Dodge, Recover, card actions), Move or attack opens the Standby window | CRB p37 lists "an attack, Move, or action" | Confirmed (CRB p37)
RULING: R-5.1 Legacy "order tokens on Command Cards" | The Activation phase ends when every unit has activated and both pools are empty; the clause about order tokens on Command Cards is ignored for the core game | CRB p38 mentions it but no core rule puts order tokens on cards | Port choice

## Movement and cohesion

RULING: R-6.3 Tool start on a round base | Segment 1 starts at a point on the leader's base circle and leaves radially | CRB p25 wants one tool end flush against the base: a flat end can only sit flush against a circle at a tangent point, i.e. radially | Port choice
RULING: R-6.3 Leader placement on the tool | The leader's new base disc must touch or overlap the tool footprint; overlapping is allowed | CRB p25 only requires the base to touch the tool somewhere; the 2023 movement preview describes placing the model over the tool | Unsourced
RULING: R-6.4 No swept path for small bases | Only the tool footprint and the final placements are checked; the base is not swept along the tool | CRB p25 picks the model up and places it; CRB p26 lets models pass through models | Confirmed (CRB p25-26)
RULING: R-6.4 Tool overhanging the edge | The tool may overhang the table edge; only final bases must be fully on the table | No rule forbids the tool overhanging; CRB p25 restricts where bases end | Port choice
RULING: R-6.4 Tool through miniatures and tokens | The tool may overlap any miniatures and objective tokens | CRB p26 (models pass through models) and p20 (models may move through objective tokens) | Confirmed (CRB p20, p26)
RULING: R-6.5 Path fitting | Click a destination; engine tries tools shortest first, straight first, then searches start angle (72 steps) and hinge (5° steps), smallest bend wins; hinge drag constrained to the reachable circle | D15; tabletop players place the tool by hand | Port choice
RULING: R-6.6 Deployment tool pose | Segment 1 starts perpendicular to the table edge with both prongs inside the allied-Territory edge span | CRB p24: both prongs of one end touch the edge within allied Territory | Port choice
RULING: R-6.4 / R-6.7 Difficult terrain from trooper placement | Difficult terrain is evaluated after `move.troopers`: if any model ends in difficult terrain the tool used must fit speed -1, else the placement is rejected; `suggest` avoids it | CRB p27 counts any model starting or ending in difficult terrain, which the tabletop judges in one motion | Port choice
RULING: R-6.8 Obstacle height vs silhouette | Obstacle height is compared in inches (top minus the mover's current surface) with the silhouette height (1.69" small) | CRB p27 compares obstacle height with silhouette height without units | Port choice
RULING: R-6.9 Climb vertical limit | A Climb may change height by up to 6" (one height band) | CRB p14 defines height 1 as the first range segment; CRB p28 allows "up to height 1" | Confirmed (CRB p14, p28)
RULING: R-7.1 Cohesion measurement | 3" is horizontal edge-to-edge distance; the straight segment between the closest base points must not cross impassable terrain; LOS by R-10.2; vertical limit = leader's silhouette height | CRB p23; the range tool's exact path is judged by hand on the tabletop | Port choice
RULING: R-7.2 "As close as possible" | When cohesion cannot be met, the engine computes the closest legal spot to the leader and flags the model `outOfCohesion`; the placement is legal | CRB p23, p25 | Port choice
RULING: R-7.3 Cohesion only at placement | Cohesion is enforced only when the leader moves or models are placed; casualties never force a fix | CRB p23 ties cohesion to the leader changing position | Confirmed (CRB p23)
RULING: R-16.1 Who may move into melee | The unit leader must have a melee weapon | CRB p5 says the leader must; CRB p28 says the unit must have one; we use the narrower p5 reading (all slice leaders have a melee weapon, so no slice difference) | Unsourced

## Cover and attacks

RULING: R-11.2 Partial blocking obscures | A model is obscured if any single sampled ray from the attacking leader to it is blocked by qualifying terrain | CRB p34 counts a blocked line between any two points of the silhouettes, and the p37 worked example applies it to partly hidden models | Confirmed (CRB p34, p37)
RULING: R-11.2 Terrain with no cover | Terrain declared as providing no cover never obscures | CRB p34 makes any obscuring give at least light cover, which would turn "no cover" terrain into light cover; the players' declaration is read as overriding that | Port choice
RULING: R-11.2 Fully blocked models | A model with LOS completely blocked is obscured; its cover type is the heaviest cover among the terrain blocking its rays (light if none qualifies) | CRB p34 counts it as obscured but does not say by what | Unsourced
RULING: R-11.2 Leader touching terrain | The attacking leader standing on or in base contact (R-1.6) with a terrain piece means that piece cannot obscure | CRB p34 excludes terrain the attacking leader touches | Port choice
RULING: R-11.2 Within half range of terrain | Horizontal distance from the defending model's base edge to the terrain footprint <= 3" | CRB p34 "within half range" with CRB p12 "within" | Confirmed (CRB p12, p34)
RULING: R-12.5 Surge tokens with a chart | Surge-token spends are offered only when the unit has no surge conversion of that kind (a chart already converts every surge) | CRB p33-34: the chart converts all surges, so a token would do nothing | Port choice
RULING: R-12.11 When the suppression check counts | "Hit or crit in the pool during Roll Attack Dice" = after step 4d (surge conversion), before cover and Dodge | CRB p36 names the step but not the sub-step; after conversion is the end state of that step | Unsourced
RULING: R-14.2 Automatic wound allocation | Allocation is automatic (first non-leader in roster order) when all eligible models are identical; `attack.allocate` is raised only when they differ in weapon, upgrade or threshold | No real choice exists among identical models | Port choice
RULING: R-14.3 Ranged wound cap | Models "in LOS" = defending models visible to at least one model of the attacking unit; the cap sums their full wound thresholds (not remaining wounds) | CRB p35 says "the attacker has LOS" and "total Wound threshold" | Unsourced
RULING: R-14.4 Leader replacement | The model the owner picks becomes the leader at its own position, keeping its own weapons | CRB p35 swaps the leader miniature into that model's place; for figures the swap is cosmetic | Unsourced
RULING: R-14.6 Backup measurement | Backup applies if any defending model is within 3" of, and has LOS to, the providing unit's leader; "attacking leader not within 2" is leader to closest defending model | CRB p31 | Unsourced
RULING: R-16.4 Melee target | A melee pool may only target a unit the attacker is in Melee with | CRB p11 makes melee range base contact and p32 lets non-contact models join because their unit is in Melee | Unsourced

## Suppression, panic, end phase, victory

RULING: R-15.2 Panicked as a state | Panicked is recomputed whenever suppression, courage sources or positions change; the false-to-true change is "the unit panics" and drops its Assets | CRB p15 defines Panicked by token count; CRB p20 refers to "when a unit Panics" without a timing | Port choice
RULING: R-15.2 Commander courage range | An allied Commander counts when any of its models is within range 3 of any model of the checking unit | CRB p24 "within 3" with CRB p12 unit "within" | Confirmed (CRB p12, p24)
RULING: R-15.5 Panic token loss | A unit that made no actions because of panic removes suppression equal to its own printed courage, not a borrowed Commander value | CRB p23 says "its" courage | Unsourced
RULING: R-2.2 Tiebreak points | "Point value of defeated units" includes the upgrades equipped on those units | CRB p20 does not say; units are bought with their upgrades | Unsourced
RULING: R-2.2 Wipe-out check | Checked after every step; undeployed units count as undefeated | CRB p20 "at any time" | Confirmed (CRB p20)

## Data entry (M1)

RULING: R-6.2 Movement tool prong width | Prong width 0.2" (placeholder next to the 1.0" tool width) in `core/movement-tool.json` | No source gives it; the engine needs a number for the two-prong edge-deployment check | Unsourced (measure the physical tool)
RULING: R-3.3 Squad cohesion value | The persistent Squad cohesion rule ("within range 1, not half range") is stored as a `cohesionRange` modifier of 6" | Range 1 is 6" (R-8.2); the spec text says range 1 of the leader | Port choice
RULING: R-3.2 Force alignment of generic Force upgrades | Force Choke, Fear and Anger are dark side, Hope is light side, Force Push, Force Reflexes, Force Barrier and Force Guidance are neutral | `14-armies.md` names the cards and costs but not their alignment; taken from the card icons as played, not re-read from the PDF | Unsourced (spot-check GUP pp19-21)
RULING: R-3.3 Luke Jedi Knight in card restrictions | The Luke command cards restrict to Luke Skywalker, Hero of the Rebellion only (the Jedi Knight version is not in v1 data, and I Am a Jedi is not encoded) | `20-data-schema.md` section 9 lists both Lukes for My Ally Is the Force; a reference to a missing unit would fail V-04 | Port choice
RULING: R-3.2 Generic upgrades not encoded | Only Force upgrades whose text is recorded in `14-armies.md` (Force Choke, Force Reflexes, Fear, Anger, Force Push, Force Barrier, Force Guidance, Hope) are in `armies/neutral/upgrades.json`; the other generic upgrades, command, gear, grenades, training and comms cards wait for their text to be read | Entering a card without its text would invent rules | Unsourced
RULING: R-16 Battle Shield offensive side | Offensive side melee is 2 red dice (`reb.w.battle-shield-offensive`) | Card side not seen; Legion HQ 2 is the only source | Fan-source (V-21 warning lists it)
RULING: R-3.3 Compel parameter | Compel stores "Corps" as its rank parameter and the Trooper type and range 2 in the `compel` hook params | The card says "Corps Trooper"; one keyword parameter cannot hold a rank and a type | Port choice

## Engine foundations (M2a)

RULING: R-6.3 Tool pose payload | `move.tool` carries `{ speed, start, heading, hinges, leader, climb? }`: the start point of segment 1 (checked flush on the leader's base within 0.02" and radial within 2 degrees, or on the allied edge span when deploying), the heading, the one hinge angle, and the leader's new `{x,z,yaw}`; helpers `poseAt` / `deployPoseAt` build exact poses | 00 section 3.1 names "tool start, hinge angles, distance along the tool, final leader yaw"; a start point makes the flush and radial rules checkable (MOVE-003) and the leader is placed freely on the tool per R-6.3 so no "distance along" is needed | Port choice
RULING: R-6.12 Leader off the table | A leader base partly off the table is rejected with `E_OUT_OF_RANGE` | The code list in 00 section 8 has no off-table code; this is the closest | Port choice
RULING: R-8.1 Rounding of distances | Base radii are exact (mm / 25.4 / 2); every measured gap is rounded to 1/1000" before banding; overlap and contact use a 0.002" tolerance (`contactEpsilon`) so placements rounded to 1/1000" never read as overlap | RNG-001: two 27 mm bases at 7.063" read 6.000"; 00 section 7.1 makes 1/1000" canonical | Port choice
RULING: R-6.8 Terrain height checks on the tool | A tool crossing a piece of kind obstacle, building or barricade needs (top - current surface) <= the silhouette height (a Climb: one height band); area terrain has no height limit; a base may stand on an obstacle or building only if `climbable` and wholly inside it | CRB p13 and p27 compare obstacle height with silhouette height; "area" is walkable volume | Port choice
RULING: R-1.3 Hands in `view` | `view` hides the other seat's unrevealed pick, the order of every order pool and a drawn token's rank, and also removes `seed` and `hash` (each determines hidden data); hands stay visible because the remaining cards are derivable from the open played-cards ledger | 10-rules-core R-1.3 says the hand is secret, 00 section 3.2 says remaining command cards are open; 00 is the contract and the brief | Port choice
RULING: R-7.2 Closest legal spot search | The engine looks for a spot on rings 0.25" apart around the leader (0.35" along the ring), preferring one in cohesion closest to the wanted position, else the closest legal spot to the leader within 12", flagged out of cohesion | CRB p23/p25 say "as close as possible" without a method | Port choice
RULING: R-11.2 Terrain touched by the attacking leader | A piece the attacking leader touches (gap <= 0.002") or overlaps never obscures, also in the fully-blocked case | R-11.2 excludes it; the fully-blocked ruling above would otherwise let it back in | Port choice

## Flow modules (M2b-flow)

RULING: R-4.6 Order range | Orders have no range or LoS limit: any undefeated unit (also one in reserve) without an order can receive one from the card's commander; the engine issues every order the eligible units allow without a decision when no choice is left | The spec R-4.6 follows CRB p22; the stage brief's "in range of commander" is the old rule | Confirmed (CRB p22)
RULING: R-4.5 Commander when no Commander unit is left | A card that names no unit is issued by a Commander-rank unit; with none, by an Operative | R-4.2 lets an Operative play a card, but R-4.5 names only Commanders | Unsourced
RULING: R-4.4 Priority tie roller | Seat A rolls the red defence die for a tie or when neither seat played a card; `options.firstPriority` settles ties without a roll (tests and the sim) | The rules say "one player rolls"; the die is symmetric so the roller does not matter | Port choice
RULING: R-5.3 Free pass after a dead draw | A pass offered after a dead draw spends no token and counts as the seat's pass for R-5.4 | CRB p23 lets the player pass; it does not say whether the not-twice rule then applies | Port choice
RULING: R-5.11 Undeployed unit with no legal entry | An undeployed unit must Move; if the engine finds no legal tool placement from the allied edge it may end its activation | Avoids a deadlock the rules cannot produce on a normal table | Port choice
RULING: R-5.7 Recover amount | Recover is offered as one option per number of suppression tokens removed (1 up to all) | The action removes "any number"; options keep the decision finite | Port choice
RULING: R-5.12 Standby timing | The Standby window opens after the enemy action has fully resolved (after all attack pools), for each allied Trooper unit holding a token within range 2 and LoS of the triggering unit; each may answer in turn with a free Move or a free Attack against the trigger only; the token is spent when it answers | CRB p37 | Port choice
RULING: R-18.3 Dropped Assets | A dropped Asset is put on the closest legal spot within half range of the holder's leader by the engine; the opponent makes no placement decision until the placement UI exists (`battle.place` validates the same rule) | The rule gives the opponent the placement; a UI-less engine needs a default | Port choice
RULING: B-6.2 Contest distance | A unit contests a token when the base edge of its leader is within 3" of the token's edge (token radius 1" POI, 0.5" Asset) | CRB p20 says "within half range of" the token; range is measured edge to edge (R-8.1) | Port choice
RULING: B-3 Card setup picks | Unit picks that cards give to players (Intel, Scanners, Cunning Deployment targets) are random engine draws without replacement until a picker UI exists | The cards say each player picks; the choice has no engine consequence | Port choice
RULING: B-3.2 Optional marks and Intel grants | Bring Them to Heel marks a qualifying table row at once (once per round per player) and Intercept Signals gives Intel to units contesting a secured tower automatically | Both are "may" effects that can only help the player | Port choice
RULING: B-3.3 Fortified Position | Places no barricades: there is no barricade terrain record in v1 data | 11-battle 3.3 and ruling R5 (size Unsourced) | Unsourced
RULING: R-3.9 Prepared Position Dodge | setup.ts gives the Dodge token of Prepared Position when it places the unit; the keyword record's own trigger must not grant it again | The keyword has no engine window at setup yet | Port choice
RULING: B-1.9 Scout and Infiltrate | Scout X free deployment moves and Infiltrate placement are not implemented (no unit of the four Recon lists has them except Vader after Darkness Descends); such units enter with their first Move like the rest | Out of the slice | Unsourced
RULING: R-1.3 Pool draws are not events | The order-pool draw consumes one RNG value but emits no `Drawn` event: its index would name the token to a player who knows the pool's counts | 00 section 3.2 hides which token comes next | Port choice
