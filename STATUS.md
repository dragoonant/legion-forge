# STATUS (rewritten each milestone; last: M7, 2026-10-29)

## Playable
Recon (600 pts, 36"x36") Galactic Empire vs Rebel Alliance starter armies, human vs the utility AI (Normal default, Easy, Random) or AI vs AI watch mode (`?seats=bot,bot`). Play at https://dragoonant.github.io/legion-forge/ (deployed from `main`, D21), or locally with `npm install`, `npm run dev`. Figures are procedural stand-ins until the PC art session (M5) pushes models.

## What exists
- **Data (M1):** 196 records — 9 units, 26 weapons, 31 upgrades, 20 command cards, 4 Recon lists, 41 keywords, Recon battle deck, maps, one layout; schema frozen; `validate:data` requires every code hook to be registered.
- **Engine (M2a-M2c):** pure reducer with one pending decision, hidden simultaneous command picks, hidden order-pool draws, `view` redaction, replay/save/load/undo. Recon setup with barricades, Infiltrate and Divulge; command phase; activations with rally, two actions, free and card actions, standby; movement tool (click + hinge), cohesion, climb, withdraw; melee charges and engagement; the full attack pipeline with rolled cover, aim, dodge, Backup, wound order and leader replacement; suppression/panic/courage; all slice keywords and command cards; Recon scoring and victory. An independent rules review found 29 errors; all fixed with tests that fail on the old code.
- **Client (M3):** board from rules geometry, stand-ins on data base sizes, start/briefing/end screens (Starbound skin), prompts for every decision kind with engine odds and whyNot, movement tool with hinge drag and cohesion preview, barricade placement, dice tray, log, keyword help, VP tracker, ruler/LOS tool, speed settings, watch mode.
- **Polish (M7):** phone/touch layer (`?ff=`), bottom-sheet prompts, pick-then-confirm and finger drags with an offset, Home Screen manifest and icons; autosave with Continue (stale saves discarded by replay hash); help on every keyword, token, rank, status and card name; settings; end recap revealing every hidden AI pick and pool draw; how-to-play guide and first-turn hints; placement ghosts on real bases.
- **AI (M4):** utility decider in a Web Worker with an exhaustive policy table (21+ decision kinds), reads only `view`; charges, withdraw, card actions, objective play.

## Gates (last run 2026-10-29 on `main`)
typecheck clean; 524 tests; `validate:data` ok (196 records); build ok; sim 8 games 0 violations, 0 rejections, melee present (~1.2 games/s with 4 workers; budget 5); bench normal vs random 40-0 (and 279-1 over 280 earlier), normal vs easy 33-7, 0 fallbacks, 0 rejections, 0% zero-action activations, mean decision 6.5 ms; e2e chromium 10/10, phone profiles 10 passed (iPhone profiles run on Chromium; WebKit is not installed in the cloud sandbox).

## Not yet
Art (M5: the PC session pushed a hand-run prompt pack, no figures yet), audio (M6, PC), hot-seat (M8); landscape phones leave a short board band under the prompt sheet; `load` returns no earlier events, so a continued game starts with an empty log, Standard format, vehicles (M2b-vehicles), Observation tokens. Sim below its speed budget.
