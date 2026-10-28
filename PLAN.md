# Legion Forge: plan

This file owns every decision (with date and who made it). The owner's answers and the reasoning are in [KICKOFF.md](KICKOFF.md). Status per milestone goes into `STATUS.md` (created at M0) and the KB entry [docs/knowledge-base/legion-forge.md](docs/knowledge-base/legion-forge.md).

## Decisions
| # | Date | By | Topic | Decision | Why |
|---|---|---|---|---|---|
| D1 | 2026-10-28 | owner | Platform | Web / TypeScript | |
| D2 | 2026-10-28 | owner | Modes | Versus AI first; hot-seat later; no online yet | |
| D3 | 2026-10-28 | owner | AI timing | Random bot in the first playable (M3), utility AI right after (M4) | "Early" |
| D4 | 2026-10-28 | owner | IP | Mallet posture: real names, own-words prose, no official art/icons/logos; "unofficial, non-commercial fan project" in README and UI; sources in gitignored `docs/sources/` | |
| D5 | 2026-10-28 | owner | Figures | MGSD, recognizable Star Wars designs, dynamic poses with weapons fused in; locked now, not re-litigated | |
| D6 | 2026-10-28 | owner | Repo | Push to `main` after each stage; private; Pages when going public | |
| D7 | 2026-10-28 | owner | KB | `docs/knowledge-base/` updated at the end of every milestone | |
| D8 | 2026-10-28 | default | Stack | Copy Mancermundo `origin/main` (Vite 8, React 19, three 0.186, R3F 9, drei 10, zustand 5, TS 7 strict, Vitest 5, Playwright, ajv, tsx); its code goes into `legacy/` and is ported by a KEEP/ADAPT/DELETE table | Newest proven scaffold; KB section "proven build recipe" |
| D9 | 2026-10-28 | default | Rules source | Current AMG Rules Reference, points document and battle deck, researched at M0 into gitignored `docs/sources/`; ambiguities logged as `RULING:` lines, never blocking | Fidelity rule; "research before assuming" |
| D10 | 2026-10-28 | default | First slice | Galactic Empire vs Rebel Alliance from the current core/starter set: commanders and corps units first; the set's vehicles land in M2b | Smallest roster that exercises the core loop; vehicles add notched bases and damage rules |
| D11 | 2026-10-28 | default | Table | 6'x3' (72"x36"), 1 world unit = 1 inch, y up, centred at the origin; range band = 6" | Legion standard; series conventions |
| D12 | 2026-10-28 | default | UI skin | Starbound Legions palette and colour roles on the Mallet/Mancermundo HUD layout | Owner liked it for Star Wars (KB rule 16) |
| D13 | 2026-10-28 | default | Where stages run | M0-M4, M7, M8 in a cloud session; M5 art and M6 audio from a session on the owner's Windows PC | No GPU, Gemini or studios in the cloud container |

## Milestones
| # | Milestone | Done when | Est. tokens |
|---|---|---|---|
| M0 | Scaffold + sources + specs | Mancermundo copied and quarantined; migration table; privacy pre-commit hook; rules sources researched; rules primer and edition leak list in the KB; lean specs `00, 05, 10, 11, 12, 13-golden, 20, 40, 50, 60`; `CLAUDE.md`, `STATUS.md`, `HANDOFF.md`; CI green | 0.6M |
| M1 | Data | Slice units, weapons, keywords, upgrades, command cards, dice faces, base sizes and silhouettes, battle deck subset; every record has a `source`; `validate:data` clean | 0.6M |
| M2 | Engine | Command / Activation / End phases; order pool; movement tool; cohesion; LoS and cover; attack pipeline; suppression, panic, courage; melee; slice keywords; objectives and scoring; sim 100 games 0 violations, replay and leak test pass | 1.5M |
| M3 | Playable vs random bot | Board, procedural stand-in figures, start screen, briefing, dice tray, prompts with engine odds, presentation director; one full game in Playwright; screenshot | 0.9M |
| M4 | Utility AI | Bench normal beats random in >= 95%, zero-action activations < 2%, both seats, holdout seeds, no fallbacks | 0.6M |
| M2b | Vehicles | The slice's vehicles: notched bases, repulsor/ground rules, damage, turret yaw | 0.5M |
| M5 | Art (on the PC) | MGSD concepts with per-item reference gate, Hunyuan GLBs, `?gallery` check, terrain | GPU |
| M6 | Audio (on the PC) | Weapon-flavour map, Audio Studio SFX and music, measured trims, `sounds.html` | GPU |
| M7 | Polish | Keyword hover help, settings, end screen, phone layout, save/continue | 0.5M |
| M8 | Hot-seat | Two humans on one screen with hidden command-card picks handled | 0.2M |
| M9+ | More armies | Team-extension batches (engine prep, parallel implementers behind `playable: false`, verification) | per batch |

About 5M tokens to a playable game against the utility AI (M0-M4), about 6.5M through M8 without art and audio. The per-push ceiling stays about 2.5M; the coordinator checks in before passing an estimate by more than half.

## Cut order (if a run runs short)
Cut first: condition cards, the slice's vehicles (M2b), phone layout, cinematic camera, save/continue.
Never cut: `legalActions` never empty, a firing test per code hook, `{unimplemented}` refused for playable armies, the RULING log, engine-owned numbers, prompts that name what they decide, the KB update at the end of each milestone.
