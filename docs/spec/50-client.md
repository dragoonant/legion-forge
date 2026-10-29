# 50 - Client

React 19 + R3F 9 + drei 10 + zustand 5, `frameloop="demand"` (every async change calls `invalidate()`). The client never mutates `GameState` and never computes a rules number: odds, distances, range bands, LoS and cover, tool placements and every "can this be done" answer come from `query.*`, `validate`, `suggest`, `pending.options[].data` or `pending.context`. Every displayed unit, weapon, keyword, card, battle-card and token name comes from data through one lookup (`labels.ts`), never a string literal. Ported from Mancermundo's client (`legacy/src/client/`) and re-skinned.

## 1. Modules

```
src/main.tsx                     routes: ?gallery / ?lab -> viewers, otherwise client/App
src/client/
  App.tsx, params.ts             shell (start -> army pick -> briefing -> battle -> end), URL params
  store/game.ts                  the ONLY caller of engine.step; state, pending, legal, events; seat loop + watchdog; autosave (M7)
  store/session.ts               menu flow (seats, armies, battle cards, seed, tier, watch mode)
  game/adapter.ts, labels.ts     data -> GameSetup; names, option labels, event lines, rejection text from data
  bot/                           random bot (M3), AiWorkerClient tiers (M4)
  presentation/                  director, presentedStore (cursor + snapshots), idleStore, feed, fx, anim (tool-path tween), cameras
  dice/                          DiceTray + tray events (Legion dice)
  board/                         Table (72"x36"), terrain, deployment zones, objectives, CameraRig
  figures/                       Unit (leader + troopers, procedural stand-ins until M5), status rings, order tokens
  interaction/                   controller (pointer -> answers), Overlays (tool, ruler, LoS/cover, targets)
  ui/                            StartScreen, ArmyPicker, Briefing, BattleHud, DecisionPrompt, CommandHand, UnitCard,
                                 ObjectiveTracker, EventFeed, Tooltip, Keyword, WatchControls, EndScreen, theme
```

## 2. Skin

Starbound Legions palette (`docs/knowledge-base/starbound-legions-ip.md` section 3) on the Mallet/Mancermundo HUD layout: background `#10141c`, panel `#1a2030`, lines `#2a3446`, text `#dfe6f0`, muted `#93a3bd`, accent `#ffd166`, danger `#e5484d`, buttons `#223049` / `#3a4a68` with 6 px radius. **Colour roles come from `legalActions` only:** actable `#f5c34d` (pulse), selected `#5b9dff`, target `#ff6bcb`, picked `#45c98b`. Seat colours: mine `#58b8ff`, theirs `#ff5a5a`. Faction identity goes in pips and words, never borders. No scrollbars, no top bar (round, phase and priority in a banner). "Unofficial, non-commercial fan project" on the start screen. No official icons: rank, token and dice symbols are our own drawings.

## 3. Battle UI rules

- The store is the only caller of `step`. A human answer goes `dispatch -> step -> apply`; a rejection changes nothing and shows one error toast; a bot rejection is only logged (and fails the sim/bench).
- **Presented-state cursor:** the engine resolves instantly; the director plays events as timed beats and advances `presentedSeq`. Board, HUD, cards and feed read the display state; the prompt appears only when the cursor has caught up. A 6 s stall catch-up keeps a stuck director from freezing the UI.
- **Bots wait for presentation idle**, then a short pause (scaled by speed), then answer. A **watchdog** answers with `suggest` (then pass, then resign) if a bot decision sits unanswered for 5 s. `speed=instant` skips pauses, banners and camera flights.
- **Prompts name what they decide** (`decisionTitle`), say in one line how to answer, and show the engine's numbers beside each option (`optionFacts`: range band, cover, expected wounds, defeat chance, suppression added, rally/panic odds, pips). Disabled actions are listed with the engine's `whyNot` (`context.withheld`) in the shared `Tooltip`. **No native `title=`** anywhere (a client test greps for it).
- **Clickable meshes gate their handlers by `pending.kind`** (KB gotcha): a unit, terrain piece or objective only takes a click when the open decision can use it, and never calls `stopPropagation` otherwise, so clicks reach the table behind it.
- Hidden information: the client renders only `view(state, humanSeat)` and `redactEvents` for the feed and tray. In watch mode it renders seat A's view unless "reveal all" is on (both bots).

## 4. Interactions by decision kind

| Kind | How the human answers |
|---|---|
| `setup.battle` | card buttons with our own-words summary from data |
| `setup.deploy` | pick a unit, hover the zone: leader ghost with trooper placement (`suggest`), green when `validate` accepts, red with the reason; click to place; Q/E turn; "Deploy the rest for me" |
| `command.pick` | **CommandHand**: the seat's remaining cards (name, pips, orders, effect text from data); pick one, it goes face down beside the opponent's face-down card (shown once the bot has picked, without its identity); both flip on `CommandCardsRevealed`; priority banner with pips and any roll-off |
| `command.issuer`, `command.order` | click a highlighted unit (eligibility from options) or a list row; an order token lands face up beside it |
| `activation.choose`, `activation.pick` | click a unit with a face-up order, or the pool stack ("Draw from pool", counts by rank shown per the rules); the drawn token flips for its owner, and for the opponent when the unit is picked |
| `action.choose` | grouped buttons (move speeds, attack, aim, dodge, standby, recover, card and keyword actions) with engine facts; withheld actions with `whyNot`; End activation |
| `move.tool` | **movement tool drag**: choose a speed, the tool appears at the leader's base front; drag the end (and each hinge) on the table; a live ghost of the unit leader follows `query.toolPreview`, with the troopers' cohesion preview, the swept path, "speed x, y of z inches" and the verdict (red with reason when `validate` would reject); release or click commits; Escape cancels before anything resolved |
| `move.troopers` | engine placement shown; drag a trooper ghost to adjust (cohesion ring shown); Confirm |
| `attack.*` | option list with facts; defenders get a target ring and a band/cover badge; clicking the named unit answers; the pool step shows weapons per mini with dice counts |
| `activation.standby`, `keyword.choice`, `card.choice`, `end.choice`, `confirm` | generic option list with engine labels and facts |

## 5. Tools always available

- **Range ruler:** from a selected unit leader, rings at each 6" band (colours per band, Fell-in style) with the band numbers from `query.rangeBand`; click any point or unit for the exact distance and band.
- **LoS/cover tool:** pick an attacker and a defender: `query.losCover` rays drawn clear or blocked, each blocked ray tinted by the terrain piece it is attributed to, and the cover verdict as text.
- **Unit card:** stats, weapons with dice icons by colour, keywords with hover help (shared `Tooltip`, own-words text from data via `Keyword`), tokens, suppression vs courage, wounds; upgrades.

## 6. Dice tray and presentation

Dice tray renders `DiceRolled` with the Legion dice colours: attack d8 red, black, white; defence d6 red, white; faces from the data face table (crit, hit, surge, blank; block, surge, blank) drawn with our own symbols; rerolls and surge conversions animate in place; the result row matches `Compared`. Director beats: round/phase/priority banners, order-token flips, tool-path tweens of the leader then troopers, attack beats (declare -> dice -> cover/dodge -> defence -> wounds -> suppression), defeated minis removed after their beat, objective and score updates. Nothing shows a result before its beat.

## 7. First playable (M3) and later

M3: start screen, army pick, **briefing** (battle cards, deployment, objectives in our words), **objective tracker** (points, round, objective state from `battleView`), dice tray, event feed, prompts with engine odds, random bot, end screen, **watch mode** (AI vs AI with pause/step/speed, `WatchControls`). M4: AI tiers in the bot loop. M7: keyword hover polish, settings, save/continue, **phone layer** (Mallet's form-factor layer: bottom sheet, touch camera, rotate prompt). M8: hot-seat with a pass-the-device curtain around `command.pick`.

## 8. Test hooks and parameters

`?test=1&seats=human,bot&seed=<s>&armies=<a>,<b>&battle=<ids>&speed=instant&tier=<t>` skips to the battle; `?watch=1` starts AI vs AI; `?ff=compact` forces the phone layout; `?debug` installs hooks only. `window.__lf`: `getState`, `getPending`, `display`, `legal`, `dispatch`, `choose`, `settled`, `toolOk(...)`, `deployOk(...)`, `project`, `events`. E2E selects `data-testid`s (`prompt` with `data-kind`, `opt-<id>`, `cmd-card-<id>`, `pool-draw`, `move-cancel`, `hud-round`, `objective-tracker`, `result`).
