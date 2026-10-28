# Legion Forge (Star Wars: Legion) — living entry

Repo `dragoonant/legion-forge` (private), started 2026-10-28 from a **claude.ai cloud session** (Linux container), not the Windows PC. Decision record: `KICKOFF.md`; decisions and milestones: `PLAN.md`. **This entry is updated at the end of every milestone** (what landed, real token spend, what worked, what bit). Cross-project lessons also go into [README.md](README.md) in the same commit.

## 1. Overview
- Star Wars: Legion (Atomic Mass Games; originally FFG 2018) as a 3D browser game, player vs AI first, hot-seat later, online not planned. Mechanics 1:1 with the current AMG Rules Reference and points; edition pinned and leak list written at M0 after source research.
- Owner decisions 2026-10-28 (do not re-ask): web/TypeScript; **vs AI first, AI early**, hot-seat later; "maybe public later" but **Mallet posture** (real names; prose ours; no official art) chosen over the Starbound posture; **MGSD figures of recognizable Star Wars designs**; push to `main` after each stage pre-approved, **repo private**, Pages when the owner goes public.

## 2. Where each subsystem comes from (donor map)
| Legion subsystem | Closest sibling | What to take |
|---|---|---|
| Engine contract (pure `step`, one `PendingDecision`, `view`, `query.*`, seeded RNG, replay, save) | Mancermundo `origin/main` | Copy wholesale with the quarantine-and-port table (`docs/spec/05-migration.md` shape) |
| Command phase: hidden simultaneous command-card pick, priority by pips, orders issued | Dead of Winner / Fell-in (`seat: 'all'` decisions), Mallet stratagems | Simultaneous decision answered by both seats; `view` hides the pick until the reveal; leak test in the sim |
| Order pool: random face-down draw by rank | Dead of Winner hidden information | Draw is engine RNG; the token is hidden until revealed; leak test covers it |
| Alternating unit activations, 2 actions + free actions | Murder Squad `firefight.ts`, Mancermundo action phase | Activation loop and action ledger; units, not single models |
| Multi-mini units, unit leader, cohesion, wound allocation, leader replacement | Mallet (40k units, coherency), Not Enough Minerals `squads.ts` | Unit container and coherency checks; Legion measures from the unit leader |
| Custom attack dice (red/black/white d8) and defence dice (red/white d6) with surges | Not Enough Minerals (D6 pipeline with Surge), Mallet fast-rolled batches | Face tables in data; one attack pipeline with named steps; test the face mapping (Mancermundo's ammo symbol sat on the wrong face) |
| Range bands 1-5 (and beyond) | Fell-in colour rulers | Engine stores inches and owns the band table |
| Movement tool (speed 1-3 template with hinges), notched bases | Murder Squad `move.path`, movement range overlay | Continuous decision constrained to the tool's geometry; new code |
| Line of sight with silhouettes, light/heavy cover | Murder Squad head point to silhouette samples, Mallet per-piece cover attribution | Sampling model; silhouettes per base size from data |
| Suppression, panic, courage | none | New module, one generic mechanism |
| Keywords (a very large set) | Murder Squad team-extension mechanism, card-series validation | Declarative JSON + `{"code"}` hooks; `{unimplemented}` refused from any playable army; firing test per hook; new timings as windows, never army branches |
| Command cards | Mallet stratagems, Murder Squad ploy windows | Windows open only when a seat can use something |
| Battle deck (objectives, deployments, conditions) | Mallet missions, Mancermundo scenarios | Data plus code hooks; layouts from a source file with a reachability test |
| Vehicles (repulsor, ground), turrets | Not Enough Minerals / WarMechForge split nodes | `split.mjs` for turret yaw; vehicles land after the infantry slice |
| AI | Murder Squad / Mancermundo utility decider in a worker | Score against do-nothing; count zero-action activations; bench both seats with holdout seeds |
| Client, presentation, dice tray, phone layer | Mancermundo client (from Murder Squad and Mallet) | Re-skin with the Starbound palette ([starbound-legions-ip.md](starbound-legions-ip.md)) |

## 3. What is new for the series
- First Disney property; owner kept the Mallet posture anyway (README rule 18).
- First project started from a cloud session: the engine, AI and client stages run there, but art (Gemini + Hunyuan) and audio (Audio Studio) need a session on the Windows PC.
- Units of several minis that activate together, measured from a unit leader. The 40k port had units, but its activation went by phase, not alternating with order tokens.
- A hidden simultaneous pick (command cards) inside an otherwise open-information skirmish.
- A physical movement tool instead of free inches.

## 4. Milestone log
| Milestone | Date | Tokens (actual) | Notes |
|---|---|---|---|
| Kickoff + KB review | 2026-10-28 | not measured | Two question batches answered; KB copied from mancermundo and extended |

## 5. Lessons so far
- **Read the KB before proposing a stack.** The first strategy written for this project, before the KB review, proposed a pnpm monorepo and a 2D PixiJS client. The KB's proven recipe (one Vite + R3F package copied from the newest sibling, 3D from M3, Pages from `main`) replaced it. Ten ports' worth of tested decisions outweigh a fresh design.
- **The KB lives in sibling repos, not one place**, and the copies drift (README gotcha, 2026-10-28).
