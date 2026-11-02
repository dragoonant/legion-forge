# Legion Forge — agent orientation

Fan-made 3D browser game of Star Wars: Legion (current Atomic Mass Games rules, mechanics 1:1), MGSD figures, player vs AI first, hot-seat later. Read in this order, nothing else up front: `HANDOFF.md` (current state, next steps; from M0) → `STATUS.md` (what exists; from M0) → `PLAN.md` (decisions, milestones) → `KICKOFF.md` (owner's answers and reasoning) → the `docs/spec/` sections a task names. Cross-project lessons are in `docs/knowledge-base/README.md`; read only the section a task needs.

## Owner priorities
- **Playable first.** Every stage ends in something the owner can run and see (screenshot in the check-in).
- **Fidelity is the product.** Mechanics 1:1 from the current edition (sources in gitignored `docs/sources/`). Never tune printed numbers. Ambiguities never block: append `RULING: <rule> | <what we did> | <why> | <status>` to `docs/needs-rules-check.md` (status: Confirmed, Corrected, Unsourced, Fan-source, Port choice) and keep going.
- **Answer before building.** When the owner asks questions, answer and propose, then wait. Explicit instructions mean act. Questions go through the multiple-choice tool, at most two batches of four, recommended option first, everything else stated as a default.
- **Questions never block development** (owner, 2026-10-28). Record the recommended option as the default in `PLAN.md` (`by: default, asked <date>`), keep building on it, and ask while background agents run; when the answer arrives, update the row and adjust. Ask whenever a wrong guess would cost rework; the owner answers quickly.
- **Keep the knowledge base current.** `docs/knowledge-base/` is a git submodule of the shared private repo `dragoonant/tabletop-kb` (D16; run `git submodule update --init` after cloning). At the end of every milestone: in the submodule, update `legion-forge.md` (what landed, real token spend, what worked, what bit) and add any lesson that applies to other games to its `README.md` (owner rules, gotchas) marked `(added <date>, Legion Forge)`; commit there as `KB: <what>` and push; then commit the bumped submodule pointer here together with `STATUS.md`.

## Token rules (metered plan; not optional)
- The main loop never reads whole source files or hand-writes bulk code. It writes agent briefs with exact file lists, reads structured results and diffs, and runs the gates.
- Implementation and data entry run on Sonnet agents; specs and verification of rules-dense code (attack pipeline, suppression/panic, keywords, command cards) run on the session model. Agents return summaries of 300 tokens or fewer.
- One or two agents per milestone, one stage at a time, commit and push after each stage. Agents never run `npm install`, `git commit` or `git push` unless told; never edit `STATUS.md`, `package.json` or files outside their list; run long commands in the foreground with a time cap.

## Conventions
- 1 world unit = 1 inch, y up, 72"x36" table centred at the origin, `+Z` is the figure's front; range band = 6".
- Engine contracts follow `docs/spec/00-architecture.md`; changes are additive and get a row in its change log. Exactly one `PendingDecision`; `legalActions` never empty for an open decision; illegal input returns a `Rejection`, never throws; deciders see only `view(state, seat)`; the engine owns every number the UI shows (`query.*`).
- Engine tests are named by checklist ID from `docs/spec/12-rules-test-checklist.md` (e.g. `it('ATK-004 ...')`).
- Data is declarative JSON validated by ajv, with a `source` per record. `{"code": "<hook>"}` escape hatches are registered in code, and every hook has a test proving it fires in a real game. A keyword the engine cannot express is `{"unimplemented": "<why>"}`, and `validate:data` refuses it in any army marked playable.
- Every displayed unit, weapon, keyword and card name comes from data, never a string literal in the client.
- Client: the game store is the only caller of `step`; presentation runs through the director and presented-state cursor; the bot waits for presentation idle; no native `title=` tooltips; prompts name what they decide and show engine odds.
- Commit messages: `M<n>: <what>`, then a blank line, then the attribution lines the session provides. Pushing to `main` after each stage is pre-approved; every push to `main` deploys to GitHub Pages (public repo, D21), so a red build never reaches `main`. A deployment change updates `NOTICE.md` and `docs/takedown.md` in the same commit.

## Where work runs
Cloud sessions (Linux container) do engine, data, AI, client and docs. Art (Gemini concepts through Claude in Chrome, Hunyuan3D) and audio (local Audio Studio) run only from a session on the owner's Windows PC; see `docs/knowledge-base/local-ai-studios.md`.

## IP and privacy
Mechanics are ported 1:1. Unit, weapon, keyword and card names may match; all prose (rules text, lore, UI copy) is our own wording, never Atomic Mass Games, FFG or Lucasfilm text. No official art, icons or logos. Figures are original MGSD renderings of recognizable Star Wars designs, never copied from official images. `docs/sources/` is gitignored and never published. Credit the owner as **evilgouki**; never write the owner's real name, email or home path into any file, and grep the staged diff before every commit.

## Edition leak list
Written at M0 after source research, into `docs/knowledge-base/star-wars-legion-rules-primer.md`, and pasted into every rules prompt.
