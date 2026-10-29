# STATUS (rewritten each milestone; last: M0, 2026-10-29)

## What exists
- **Scaffold:** Mancermundo (`origin/main` `ff3e3ea`) copied; its code is quarantined in `legacy/` (outside tsconfig and vitest; `tests/boundaries.test.ts` forbids imports). Root config renamed for `/legion-forge/`. `src/main.tsx` is an M0 placeholder page.
- **Gates:** `npm run typecheck`, `npm test` (1 test: boundaries), `npm run validate:data` (stub until M1), `npm run build` — all green. CI (`.github/workflows/ci.yml`) runs them on push; no Pages deploy while the repo is private.
- **Privacy:** `tools/hooks/pre-commit` (install with `sh tools/hooks/install.sh`, then write the untracked `.git/privacy-patterns.txt`); reads patterns through `git rev-parse --git-common-dir`, so it also guards worktrees. Verified to block.
- **Sources:** official AMG documents and the Legion HQ 2 card bundle in gitignored `docs/sources/` (lost with the container; re-fetch from the URLs in `docs/spec/sources.md`).
- **Specs:** `docs/spec/` 00 architecture, 05 migration (KEEP/ADAPT/DELETE per legacy file, by stage), 10 rules core (R-1..R-20), 11 battle (Recon deck + Standard cards), 12 checklist, 13 golden examples, 14 armies (starter armies + keyword survey), 20 data schema, 40 AI, 50 client, 60 testing; `sources.md`.
- **Rulings:** `docs/needs-rules-check.md`, 56 RULING lines (plus a few inside 11 and 14).
- **Knowledge base:** `docs/knowledge-base/` is the shared `dragoonant/tabletop-kb` submodule; Legion primer and edition leak list in `star-wars-legion-rules-primer.md`.

## Not yet
No data, engine, client or AI code in `src/` (M1-M4). No figures or audio (M5/M6, owner's PC).
