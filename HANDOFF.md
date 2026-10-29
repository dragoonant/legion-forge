# HANDOFF (2026-10-29, end of M4)

## Play it
On the PC: `git pull`, `npm install`, `npm run dev`, open the printed URL. Pick a side and a Recon list, Normal AI is the default. `?seats=bot,bot` watches two AIs; `&speed=instant|fast`, `&seed=<any>`.

## What to look at while playtesting
1. **Rules feel:** command-card priority, orders and the pool draw, movement tool (click a spot, drag the hinge), rolled cover, suppression and panic, melee charges.
2. **The AI:** it charges with Vader and the Wookiees, withdraws when outmatched, contests objectives. Known: no lookahead past the current activation.
3. **Rulings:** `docs/needs-rules-check.md` (Unsourced lines are readings we chose; Vader's Might and Implacable are Port-choice readings of the card).

## Next
- **M5 art** on the Windows PC: paste the kickoff prompt from `docs/spec/30-figures.md` section 8 into a Claude session there (not started yet).
- **Cloud side, recommended next:** sim speed (structural: skip replay on most sim games, cache attack odds), then M7 polish (phone layout, save/continue, keyword hover everywhere), M8 hot-seat, then the Standard format.

## Owner checks (not blocking; defaults in use)
1. Weapon dice where AMG's card and Legion HQ disagree (DLT-19x / DH-447, SX-21): AMG card used.
2. Battle-card icons read by eye from image-only PDFs.

## Where things are
`STATUS.md`, `PLAN.md` (D1-D19), `KICKOFF.md`, `docs/spec/`, `docs/needs-rules-check.md`, `docs/knowledge-base/` (shared `tabletop-kb` submodule). Agent hand-backs (gitignored) in `tools/out/`.
