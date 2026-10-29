# HANDOFF (2026-10-29, end of M0)

## State
M0 is done: scaffold, sources, rules primer and leak list, all specs, RULING log, shared KB repo. Nothing playable yet; the page shows a placeholder.

## Next
**M1 data:** encode the Empire and Rebel starter armies (`docs/spec/14-armies.md`), keywords, dice faces, ranks, tokens, bases and silhouettes, movement tool, the Recon battle deck (`11-battle.md`) as JSON per `20-data-schema.md`; port the validator (`05-migration.md` M1 rows); dry-run the schema over every slice record, then freeze it. Then M2 engine.

## Owner checks (not blocking; defaults in use)
1. Two weapon dice disagree between the AMG card PDFs and Legion HQ 2 (DLT-19x / DH-447 sniper, SX-21): the AMG card reading is used (`14-armies.md` end).
2. Battle card icons were read by eye from image-only PDFs; a spot-check against physical cards would settle `11-battle.md`.
3. Settled 2026-10-29: Recon first (D11); community values for dice, tools and silhouettes (D17).

## Where things are
`STATUS.md` (what exists), `PLAN.md` (decisions D1-D16, milestones), `KICKOFF.md`, `docs/spec/`, `docs/needs-rules-check.md`, `docs/knowledge-base/` (submodule: `git submodule update --init`).
