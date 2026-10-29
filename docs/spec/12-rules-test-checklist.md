# 12 - Rules test checklist

Engine tests are named by these ids (`it('ATK-004 ...')`). Format: `ID | rule ref | what the test proves`. Rule refs `R-x.y` are `10-rules-core.md`. Every test pins its dice and draws with `ScriptedRng` unless it checks pure legality or geometry. Ids are stable: never renumber; retire an item by marking it `RETIRED`. Core rules only; keywords, command-card effects and battle cards get their own checklists (`KEY-`, `CC-`, `BTL-`). Golden replays are `GOLDEN-001`/`GOLDEN-002` (`13-golden-examples.md`).

## SETUP - setup and army validation

SETUP-001 | R-3.2 | A standard army over 1000 points, with 0 or 3 Commanders, or with 2 Corps is refused by `createGame` with the failing limit named.
SETUP-002 | R-3.2, R-2.3 | A Recon army needs exactly 1 Commander, 2-4 Corps, at most 1 Operative and 1 Heavy, and at most 600 points; both starter armies (D10) pass.
SETUP-003 | R-3.2 | Two copies of a one-bullet name across unit and upgrade cards are refused; the same upgrade twice on one unit is refused.
SETUP-004 | R-3.3 | A command hand without Standing Orders, with a duplicate, or with three 2-pip cards is refused; a hand naming a unit not in the army is refused.
SETUP-005 | R-3.6 | Blue roll: forced 4-black-die results where both players tie on crits and hits but differ on surges give blue to the player with more surges; a full tie rerolls.
SETUP-006 | R-3.6 | Recon blue roll: a block on the red die makes the roller blue; a blank makes the other seat blue.
SETUP-007 | R-3.7 | Mission building: blue reveals one of Objective/Secondary, the opponent the other type, each reveals an Advantage; exactly four modifications follow, alternating by seat, blue first.
SETUP-008 | R-3.7 | Taking the blue token mid-modification switches blue but not the alternation order of the remaining modifications.
SETUP-009 | R-3.7 | Revealing from an empty sub-deck reshuffles that player's discards of that type, the one just discarded among them.
SETUP-010 | R-3.8 | Standard: blue picks a long edge, red gets the opposite; Territories follow the Map card; Recon: blue may pick any of the four edges.
SETUP-011 | R-3.9 | Prepared Position: the leader must be completely inside allied Territory and the unit gains 1 Dodge; placement on impassable terrain is rejected.
SETUP-012 | R-3.10 | After setup only Prepared Position units are on the table; every other unit is `location: 'reserve'`, never a legal attack target, never within range of anything on the table, and never a source of Backup or commander courage.

## CMD - command phase

CMD-001 | R-4.2 | `command.pick` is seat `'all'`; the first seat's answer is invisible in the other seat's `view` and `redactEvents` until `CommandCardsRevealed`; a second pick from that seat is `E_ALREADY_ANSWERED`, a card not in hand `E_NOT_AN_OPTION`.
CMD-002 | R-4.2 | A player with no undefeated Commander or Operative and no Commander token gets no `command.pick` and the other player has priority.
CMD-003 | R-4.4 | Fewer pips takes priority with no roll.
CMD-004 | R-4.4 | Equal pips: one red defence die is rolled; a block gives the roller priority, a surge or blank gives it to the other seat.
CMD-005 | R-4.3 | On-reveal and untimed card effects resolve blue first; issuing-orders and Activation-phase effects resolve priority first.
CMD-006 | R-4.5 | With one Commander unit, no `command.issuer` decision is raised; with two, it is.
CMD-007 | R-4.5 | A character card forces its named unit as commander.
CMD-008 | R-4.6 | Orders are issued priority seat first; a unit far out of range and out of LOS of the commander can still receive an order.
CMD-009 | R-4.6 | `command.order` offers no "done" while an eligible unit remains; Assault with only two eligible units issues two and loses the third.
CMD-010 | R-4.6 | A unit already ordered this round is not an option, including one ordered by another effect.
CMD-011 | R-4.7 | Standing Orders returns to the hand at the end of the Command phase and is never in the discard pile.
CMD-012 | R-4.8 | The order pool holds one rank token per undefeated unit without an order (undeployed units included); `view` shows counts per rank, never the next token.
CMD-013 | R-4.9 | Units 8 vs 12 gives the 8-unit player 3 pass tokens; 5 vs 6 gives none; 5 vs 5 gives none.

## ACT - activation phase and actions

ACT-001 | R-5.1 | The priority seat takes the first turn; turns alternate.
ACT-002 | R-5.2 | `activation.choose` lists only face-up-ordered, unactivated allied units plus `drawPool` when the pool is non-empty.
ACT-003 | R-5.2 | After a pool draw, `activation.pick` lists only un-ordered, unactivated units of the drawn rank; with one candidate it is picked automatically.
ACT-004 | R-5.3 | A drawn rank with no eligible unit removes the token and offers pass or a new choice; the pass spends no token.
ACT-005 | R-5.4 | Spending a pass token passes the turn; a second pass on the next turn is not offered (`E_PASS_NOT_ALLOWED`).
ACT-006 | R-5.4 | A seat with nothing to activate passes automatically; the other seat activates its remaining units back to back.
ACT-007 | R-5.5 | Activation order of windows: start effects, rally, actions, end effects, order token face down; the unit is marked activated.
ACT-008 | R-5.6 | An unsuppressed unit gets exactly 2 actions; a Suppressed one gets 1; a Panicked one gets 0 and no free actions.
ACT-009 | R-5.6, R-15.6 | A Suppressed Droid Trooper unit still gets 2 actions.
ACT-010 | R-5.8 | Aim, Dodge, Recover, Standby and Attack are each withheld after one use in the activation; Move may be taken twice.
ACT-011 | R-5.8 | After an Attack action, Standby is withheld (`whyNot`), and after Standby, Attack is withheld.
ACT-012 | R-5.8 | A free Attack action counts as the turn's one Attack action.
ACT-013 | R-5.7 | A two-icon card action consumes both actions; two different card actions may both be taken.
ACT-014 | R-5.9 | A free card action may be taken once per activation, not while Panicked, and cannot grant a second Aim.
ACT-015 | R-5.7 | Recover removes the chosen number of suppression tokens (any number, including all) and readies exhausted upgrade cards.
ACT-016 | R-5.7 | Standby is offered to Trooper units only (and Ground Vehicles at M2b); the unit holds at most 1 token.
ACT-017 | R-5.11 | An undeployed unit's first action menu offers only Move; Aim/Dodge/Attack are withheld until it has deployed.
ACT-018 | R-5.12 | An enemy action resolved within range 2 and LOS of a Standby unit raises `activation.standby` after it resolves, outside the Standby unit's own activation; out of range 2 or out of LOS of every model of that unit, nothing triggers.
ACT-019 | R-5.12 | The Standby free attack may only declare the triggering unit as defender.
ACT-020 | R-5.12 | Standby is not offered while the attacker still has unresolved pools, and is offered before "after attack" effects.
ACT-021 | R-5.13 | The Standby token is removed when its unit moves, attacks, takes an action, or gains suppression.
ACT-022 | R-5.1 | The Activation phase ends only when every unit has activated and both pools are empty.

## MOVE - movement tool and moves

MOVE-001 | R-6.2 | `core/movementTool.json` gives Speed-1/2/3 lengths 4.5/7.0/9.5", width 1.0", hinge at the midpoint, hinge limit ±135°.
MOVE-002 | R-6.1 | A speed-2 unit may use Speed-1 or Speed-2 tools, never Speed-3 (`E_ACTION_RESTRICTED`).
MOVE-003 | R-6.3 | Segment 1 starts on the leader's base circle and leaves it radially; a pose whose start is off the base is rejected.
MOVE-004 | R-6.3, R-6.4 | A leader base touching the tool at its far tip is legal; one 0.01" away from the footprint is `E_OFF_TOOL`.
MOVE-005 | R-6.4 | A tool crossing impassable terrain is `E_TERRAIN`; a tool crossing friendly and enemy models is legal.
MOVE-006 | R-6.4, R-6.11, R-9.2 | A leader ending overlapping any miniature or a barricade is `E_OVERLAP`; models placed through other models' positions mid-move are fine.
MOVE-007 | R-6.4 | A leader ending in base contact with an enemy model is rejected when its leader has no melee weapon.
MOVE-008 | R-6.5 | Clicking a reachable open-ground point yields a straight tool (φ = 0) of the shortest sufficient speed.
MOVE-009 | R-6.5 | Clicking a point behind a wall yields a bent legal tool; `query.toolPreview` and `validate` agree on it.
MOVE-010 | R-6.5 | Dragging the hinge keeps it on the circle of radius (base radius + segment 1); φ re-solves toward the target.
MOVE-011 | R-6.5 | An unreachable click returns the nearest legal leader spot and the failing check from `suggest`.
MOVE-012 | R-6.6 | A deploying unit's tool must start flush on the allied-Territory edge span; a start outside the span is rejected.
MOVE-013 | R-6.7 | Starting with one trooper in difficult terrain caps a speed-2 unit at Speed-1.
MOVE-014 | R-6.7 | A tool merely crossing difficult terrain reduces speed by 1; speed 1 stays 1.
MOVE-015 | R-6.4, R-6.7 | Troopers placed into difficult terrain after a Speed-2 move are rejected (`E_TERRAIN`); placed outside it, legal.
MOVE-016 | R-6.8 | A Standard Move over a 1" barricade (below the 1.69" small silhouette) is legal; over a 2" wall it is `E_TERRAIN`.
MOVE-017 | R-6.8 | A trooper ending half on a rooftop is rejected; fully on it is legal.
MOVE-018 | R-6.9 | A Climb onto a 4" roof uses only Speed-1 and succeeds; a Climb to 7" (above height 1) fails.
MOVE-019 | R-6.12 | A leader placement with any part of the base off the table is rejected.
MOVE-020 | R-18.2, R-6.11 | Moving across an objective token is legal; ending overlapping a POI is rejected.

## COH - cohesion

COH-001 | R-7.1 | A trooper 2.9" from the leader is in cohesion; 3.1" is `E_COHESION`.
COH-002 | R-7.1 | A trooper within 3" whose straight measurement crosses impassable terrain is out of cohesion.
COH-003 | R-7.1 | A trooper without LOS to the leader is out of cohesion.
COH-004 | R-7.1 | A trooper 1.6" above the leader (small silhouette 1.69") is in cohesion; 1.8" above is not.
COH-005 | R-7.2 | When no legal spot within 3" exists, the engine places the trooper at the closest legal spot and the move is accepted with `outOfCohesion`.
COH-006 | R-7.3 | A unit left out of cohesion by casualties is not forced to move and is not an invariant failure in the sim.
COH-007 | R-7.1 | Cohesion distance is horizontal: a trooper 2" away horizontally on a 1" step (within silhouette height) is in cohesion.

## RNG - range and measuring

RNG-001 | R-8.1 | Range is base edge to base edge: two 27 mm bases with centres 7.063" apart are 6.000" apart.
RNG-002 | R-8.2 | 6.000" is range 1; 6.001" is range 2; 30.000" is range 5; 30.001" is beyond range 5.
RNG-003 | R-8.1 | Height difference does not change range: a model on a 5" roof at 4" horizontal is range 1.
RNG-004 | R-8.3 | A unit with one model inside range 1 is "within 1"; "completely within 1" needs every model wholly inside.
RNG-005 | R-8.4 | A weapon 1-3 cannot be used against a defender whose closest model is at range 4 from the attacking leader.
RNG-006 | R-8.4 | A weapon with minimum range 2 cannot be used against a defender at range 1.
RNG-007 | R-8.5 | A 5.9" roof is height 1 and a 6.1" roof is height 2.

## LOS - line of sight and silhouettes

LOS-001 | R-10.1 | Small-base troopers get a 1.69"-tall cylinder of base radius; Creature/Heavy troopers 2.70".
LOS-002 | R-10.2 | A target whose silhouette top rim alone is visible over a wall is in LOS.
LOS-003 | R-10.3 | Trooper models of another unit between two models never block LOS.
LOS-004 | R-10.3 | A blocking terrain prism between two models with every ray intersected gives no LOS.
LOS-005 | R-9.3 | Area terrain blocks LOS across its whole footprint up to its top, even through gaps in its props.
LOS-006 | R-9.3, R-11.2 | A model overlapping area terrain ignores that piece for its own LOS rays, both seeing and being seen, and is obscured by it even when the rays are clear.
LOS-007 | R-10.4 | Defender declaration uses only the attacking leader's LOS; pool eligibility uses each model's LOS.
LOS-008 | R-10.2 | `query.losCover` returns the same verdict and rays as the attack step uses (one function).

## COVER - obscuring and cover

COVER-001 | R-11.2 | A defender with one blocked ray from the attacking leader by terrain within 3" of it is obscured.
COVER-002 | R-11.2 | The same blocking terrain 3.5" from the defending model does not obscure it.
COVER-003 | R-11.2 | Terrain the attacking leader is in base contact with does not obscure.
COVER-004 | R-11.2 | A model with LOS completely blocked counts as obscured.
COVER-005 | R-11.3 | 2 of 4 obscured gives cover; 1 of 4 does not; 3 of 5 does.
COVER-006 | R-11.3 | Cover is heavy when any obscured model is obscured by heavy terrain, light otherwise.
COVER-007 | R-11.3, R-11.1 | A Suppressed defender with no cover gets light; with light gets heavy; with heavy stays heavy (cap 2).
COVER-008 | R-11.4 | Light cover rolls one white die per hit (crits never) and cancels one hit per block; surges cancel nothing.
COVER-009 | R-11.4 | Heavy cover cancels one hit per block and per surge.
COVER-010 | R-9.2 | A barricade gives heavy cover to Rebel Troopers and none to a Creature Trooper unit.
COVER-011 | R-18.2 | A POI obscures as 3"-tall heavy area terrain but does not block LOS for declaring defenders.
COVER-012 | R-11.5 | A melee attack rolls no cover pool even with heavy terrain between the units.

## ATK - attack sequence

ATK-001 | R-12.2 | An enemy outside every weapon's range or with no model in the leader's LOS is not offered as defender (`E_INVALID_TARGET` / `E_NOT_VISIBLE`).
ATK-002 | R-12.3 | Only models with LOS to some defending model may add a weapon; each adds at most one.
ATK-003 | R-12.3 | Melee and ranged weapons cannot share a pool; a dual-icon weapon is fixed as one type when added.
ATK-004 | R-12.3 | Same-named weapons must all go in the same pool.
ATK-005 | R-12.3 | A ranged weapon cannot be added against a unit in melee with the attacker.
ATK-006 | R-12.3 | A miniature-upgrade weapon is usable only by the model that upgrade added; an exhaust weapon exhausts its card when added.
ATK-007 | R-12.4 | A second pool may target only a different enemy unit and only with weapons and models not yet used.
ATK-008 | R-12.5 | Up/downgrades apply attacker downgrades, defender downgrades, attacker upgrades, defender upgrades, in that order.
ATK-009 | R-12.5 | One Aim token rerolls at most 2 dice (3 with Precise 1); a second Aim may reroll an already rerolled die.
ATK-010 | R-12.5 | Aim tokens are spent one at a time, each after the previous reroll's results are known.
ATK-011 | R-12.5 | A surge-to-hit chart turns every surge into a hit; with no chart surges become blanks.
ATK-012 | R-12.5 | With no chart, each spent Surge token turns one surge into a hit; unspent surges become blanks.
ATK-013 | R-12.6 | Each Dodge token cancels one hit and never a crit; Dodge may be spent with no hits left.
ATK-014 | R-12.6 | Order: cover pool and cancellation happen before Dodge.
ATK-015 | R-12.8 | Defence dice equal remaining hits plus crits, in the defender's colour.
ATK-016 | R-12.8 | A defence surge chart turns surges into blocks; otherwise they are blanks unless Surge tokens are spent.
ATK-017 | R-12.10 | Wounds = hits + crits - blocks, never below 0.
ATK-018 | R-12.11 | A ranged attack with any hit or crit after surge conversion gives a surviving defender exactly 1 suppression, even when every hit is later cancelled.
ATK-019 | R-12.11 | A ranged attack whose roll had only blanks and surges converted to blanks gives no suppression.
ATK-020 | R-12.11 | A melee attack gives no suppression; a defender wiped out gains none.
ATK-021 | R-12.13 | Every optional spend raises `attack.spend` with options; none is applied without an answer.

## DICE - dice

DICE-001 | R-13.1 | Red attack face table: 5 hit, 1 crit, 1 surge, 1 blank, tested face by face via `ScriptedRng`.
DICE-002 | R-13.1 | Black attack: 3 hit, 1 crit, 1 surge, 3 blank.
DICE-003 | R-13.1 | White attack: 1 hit, 1 crit, 1 surge, 5 blank.
DICE-004 | R-13.1 | Red defence: 3 block, 1 surge, 2 blank; white defence: 1 block, 1 surge, 4 blank.
DICE-005 | R-13.2 | Upgrade white->black->red attack and white->red defence; red cannot be upgraded, white cannot be downgraded (no-op, no error).
DICE-006 | R-13.2 | One effect cannot upgrade the same die twice.
DICE-007 | R-13.1 | `query.attackOdds` for 4 white dice with surge-to-hit equals the exact distribution from the face table (P(0 hits) = (5/8)^4).

## WND - wounds and defeat

WND-001 | R-14.1 | 3 wounds on a unit of 1-wound troopers defeat 3 models.
WND-002 | R-14.2 | 4 wounds on 3 unwounded 3-wound models: one model takes 3 and dies, the 4th wound goes to a non-leader.
WND-003 | R-14.2 | A model already carrying wounds must take the next wounds before any other.
WND-004 | R-14.2 | The leader takes no wounds while any other model lives.
WND-005 | R-14.2 | Allocation is automatic among identical models and raises `attack.allocate` when remaining models differ.
WND-006 | R-14.3 | Attacker sees 2 of 4 one-wound defenders: 4 net wounds defeat only 2 models.
WND-007 | R-14.4 | A leader defeated by an effect while others remain is replaced by a model the owner picks; the unit keeps acting.
WND-008 | R-14.4 | Defeating the last model defeats the unit and removes its order token from pool and table.
WND-009 | R-14.6 | Luke shot from range 3 with a non-Suppressed allied Corps trooper leader within 3" and in LOS may cancel up to 2 hits.
WND-010 | R-14.6 | No Backup when the attacking leader is within range 2, the Corps unit is Suppressed, or the defender is a Corps unit.

## SUP - suppression, panic, courage

SUP-001 | R-15.2 | Courage 1 with 1 token is Suppressed; with 2 tokens is Panicked.
SUP-002 | R-15.3 | Rally rolls one white die per token and removes one per block or surge.
SUP-003 | R-15.5 | A Panicked unit takes no actions or free actions and then removes tokens equal to its courage at end of activation.
SUP-004 | R-15.2 | A courage-1 unit with 2 tokens within range 3 of an allied courage-2 Commander is not Panicked (still Suppressed).
SUP-005 | R-15.2 | A null-courage Commander within range 3 stops allied units panicking at any token count.
SUP-006 | R-15.1 | A null-courage unit (Darth Vader) never gains suppression from a ranged attack.
SUP-007 | R-15.5, R-18.3 | A unit that becomes Panicked drops its Asset; a Panicked unit does not contest.
SUP-008 | R-15.2 | Suppressed uses the unit's own courage even with a higher-courage Commander nearby.
SUP-009 | R-15.6 | A Suppressed Droid Trooper unit loses no action.

## MEL - melee and engagement

MEL-001 | R-16.1 | A unit whose leader has a melee weapon may end its leader in base contact with an enemy model.
MEL-002 | R-16.1 | After the charge, the mover places models into contact, then the defender's leader and remaining models are placed into contact by their owner.
MEL-003 | R-16.1 | No placement may touch models of two different enemy units.
MEL-004 | R-16.3 | Two Trooper units in contact are Engaged: neither may make ranged attacks and neither may be targeted by ranged attacks.
MEL-005 | R-16.4 | Every model of an Engaged unit with LOS may add its melee weapon, even without its own base contact.
MEL-006 | R-16.4 | A melee pool may only target a unit the attacker is in Melee with.
MEL-007 | R-16.5 | Withdraw is a speed-1 Move; afterwards Attack and Standby are withheld for that activation.
MEL-008 | R-16.5, R-20.2 | A Creature or Heavy Trooper unit may attack after Withdrawing.
MEL-009 | R-16.5 | A Withdraw cannot end in base contact with an enemy (no move into melee that activation).
MEL-010 | R-16.6 | After a melee attack kills the models in contact, the attacker re-places into contact, then the defender; if impossible the units leave Melee.
MEL-011 | R-16.2 | Engagement is recomputed from geometry after every step and cached in `unit.engagedWith`.

## END - end phase and victory

END-001 | R-17.1 | End-phase steps emit in order: start effects, Objective score, Secondary score, discard, token removal, promote, end effects, round advance.
END-002 | R-17.3 | Revealed command cards go to the discard pile and are never offered again; Standing Orders stays in hand.
END-003 | R-17.3, R-15.7 | Aim, Dodge, Observation, Surge and Standby tokens are cleared, exactly 1 suppression is removed from each unit that has any, and pass pools are emptied.
END-004 | R-17.4 | With the last Commander dead, a Trooper unit is promoted (priority player first) and gets a Commander order token next round.
END-005 | R-17.4 | With no Commander and no Trooper unit to promote, that player has no `command.pick` next round.
END-006 | R-2.2 | 12 VP vs 11 VP at the end of an End phase ends the game; 12 vs 12 does not.
END-007 | R-2.2 | A player left with no undefeated units loses immediately mid-activation (`GameEnded`).
END-008 | R-2.2 | After round 5, equal VP is broken by fewer points of own defeated units; equal again is a draw.
END-009 | R-2.2 | Undeployed units count as undefeated for the wipe-out check.

## OBJ - objectives

OBJ-001 | R-18.3 | A unit contests a token when its leader is within 3"; at 3.1" it does not.
OBJ-002 | R-18.4 | 2 contesting units vs 1 secures the token; 1 vs 1 secures nothing.
OBJ-003 | R-18.3 | A Claim free action moves an unclaimed Asset onto the claiming unit; only contesting, eligible units are offered it.
OBJ-004 | R-18.3 | A defeated holder drops its Asset before its leader is removed; the opponent places it within 3" of that leader (`battle.place`).
OBJ-005 | R-18.5 | Objective placement on impassable terrain, partly over non-area terrain, or on height-2 obstacles is rejected; after setup the closest legal spot is used.
OBJ-006 | R-18.2 | No model or token may end overlapping a POI.

## TOK - tokens

TOK-001 | R-5.13 | A unit with a Standby token that is attacked and gains suppression loses the token before any Standby window opens.
TOK-002 | R-19.2 | An exhausted upgrade cannot pay an exhaust cost until a Recover readies it; an expended card never returns.
TOK-003 | R-19.1 | Token kinds are an open union: an unknown keyword token survives save/load and the End phase unless listed for removal.
