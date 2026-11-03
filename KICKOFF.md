# Star Wars: Legion port: kickoff (2026-10-28)

Working title **Legion Forge** (repo `legion-forge`). The knowledge base of every prior port is in [docs/knowledge-base/README.md](docs/knowledge-base/README.md); this project's own living entry is [docs/knowledge-base/legion-forge.md](docs/knowledge-base/legion-forge.md). This file records the questions put to the owner, their answers and the reasoning. From here on, [PLAN.md](PLAN.md) is the only file that owns decisions.

## 1. What Star Wars: Legion is, in one paragraph
A squad-scale miniatures battle on a 6'x3' table between two armies of units (a commander, corps troopers, special forces, support, heavy, operatives), each unit several miniatures led by a unit leader and kept in cohesion. Each round has a Command phase (both players secretly pick a command card; fewer pips wins priority; the card says how many orders to issue to units near the commander), an Activation phase (players alternate activating one unit at a time, either one with an order or one drawn at random from their order pool; each unit gets two actions such as move, attack, aim, dodge, standby or recover) and an End phase (tokens removed, objectives scored). Moves use a hinged movement tool at speed 1-3; ranges are 6" bands from 1 to 5; attacks roll red, black or white eight-sided attack dice and red or white six-sided defence dice with surge faces, modified by cover, aim, dodge and a large set of keywords; suppression, panic and courage decide whether units keep fighting. The exact current rules (AMG Rules Reference, points, battle deck) are researched and pinned at M0; a rules primer and an edition leak list go into the KB then.

## 2. Insights from the knowledge base that shape this build
1. **Don't design a new stack; copy the newest sibling.** Every 3D port since Mallet used one Vite 8 + React 19 + three/R3F + zustand + TS 7 + Vitest + Playwright + ajv package deployed to Pages. Mancermundo `origin/main` is the newest scaffold and has the quarantine-and-port migration method. This replaces the pnpm-monorepo/PixiJS-2D plan written before the KB review.
2. **The engine contract is settled.** Pure `step`, exactly one `PendingDecision`, `legalActions` never empty, rejections never throw, `view(state, seat)`, `query.*` owns every number, seeded RNG with replay. Legion adds a simultaneous hidden pick (command cards; `seat: 'all'` as in Dead of Winner and Fell-in) and a hidden random draw (order pool); the sim's leak test covers both.
3. **Subsystem donors are known** (table in the KB entry): Murder Squad/Mancermundo for alternating activations, Mallet and Not Enough Minerals for multi-model units and coherency, Not Enough Minerals for a surge dice pipeline, Fell-in for range bands, Murder Squad for silhouette LoS and the team-extension mechanism that adds factions in parallel batches.
4. **Keywords are the fidelity risk.** Declarative JSON with `{"code"}` hooks, `{unimplemented}` refused by `validate:data` for any playable army, a firing test per hook, and new timings as engine windows rather than army branches. Mancermundo shipped 41 of 44 skills as no-ops at first; that must not happen here.
5. **The AI is the product, and it comes early.** A random bot ships with the first playable (M3); the utility AI follows right after (M4), scored against the do-nothing baseline, with a zero-action-activation counter, both seats and holdout seeds in the bench.
6. **Budget honestly.** Mancermundo was approved for about 3M tokens and used about 9-10M; a full Legion engine is in the same class. Estimate in PLAN.md; check in before passing it.
7. **This session is a cloud container.** No GPU, Gemini or local studios here, so art (M5) and audio (M6) run from a session on the owner's PC. Everything else runs here, and every stage is pushed before the container goes away.
8. **Starbound Legions is the Star Wars precedent** for the UI skin (owner: "appropriate to the Star Wars universe"): palette and colour roles in [docs/knowledge-base/starbound-legions-ip.md](docs/knowledge-base/starbound-legions-ip.md).

## 3. Owner's answers (2026-10-28, settled; do not re-ask)
| Question | Answer |
|---|---|
| Platform | **Web / TypeScript** |
| First playable mode | **Versus AI.** Hot-seat later. Online not needed yet |
| When the AI matters | **Early** |
| Distribution | **Maybe public later** |
| IP posture | **Mallet posture**: real unit, weapon, keyword and card names; all prose in our own words; no official art, icons or logos. (Starbound posture offered because Disney shut down Pixelborn in 2024; declined. Concern stated once, here.) |
| Figure look | **Painted-miniature look** (about 2.8 head-heights, head about 35% of height, very broad armoured shoulders, short thick legs, stern covered face, matte realistic paint; the earlier large-head style (about 2-2.5 heads) was replaced by the house style in tabletop-kb rule 7 and mallet-42k docs/FIGURE-STYLE.md (owner, 2026-10-31)), dynamic poses with weapons fused in |
| Figure subjects | **Recognizable Star Wars designs**, generated in our style, never copied from official art |
| Pushes | **Push to `main` after each stage; repo stays private**; Pages when the owner decides to go public |
| Knowledge base | Review it now and **keep it updated throughout development** for the next games |

## 4. Consequences of the answers, stated once
- A private repo cannot serve GitHub Pages on a free plan, so until it goes public the playable build runs with `npm run dev` (or `npm run preview`) on the owner's PC, and check-ins carry screenshots.
- Under the Mallet posture every displayed name still goes through one lookup (unit, weapon, keyword and card names come from data, never from string literals in the client), so a later rename stays one data change.
