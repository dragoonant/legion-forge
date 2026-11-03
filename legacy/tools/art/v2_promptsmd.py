#!/usr/bin/env python3
"""Writes art/concepts/v2/PROMPTS.md from prompts-gemini.json plus the per-figure notes below."""
import json, os

V = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "art", "concepts", "v2")
d = json.load(open(os.path.join(V, "prompts-gemini.json"), encoding="utf-8"))
notes = {
    "goliath-forge-tyrant-chainaxe": "Picked after 3 rejects (see below). Mirrored horizontally in post so the chainaxe is in the right hand and the pistol in the left, as prompted.",
    "goliath-stimmer-pulveriser-paired": "Leaping pose, one boot barely touches the base; accepted.",
    "goliath-bruiser-specialist-grenade-launcher": "Came out standing, not kneeling; accepted (weapon and hands correct).",
    "goliath-bully-brute-cleaver-b": "Debris flecks near the foot on the base; accepted.",
    "goliath-bully-axe": "Debris flecks near the foot on the base; accepted.",
    "goliath-forge-born-knife-b": "Mid-leap, knife raised rather than stabbing; accepted.",
    "escher-death-maiden-needle-pistol": "Mirrored horizontally in post (Gemini put the sword in the right hand).",
    "escher-wyld-runner-wyld-bow": "Mirrored horizontally in post (Gemini put the bow in the right hand).",
    "escher-wyld-runner-wyld-bow-b": "Debris flecks near the foot; accepted.",
}
L = []
L.append("# v2 figure concepts (role pose, default weapons fused into the figure)\n")
L.append("Made in Google Gemini (Flash, image generation) through Claude in Chrome, one chat per house (a new tab each, closed afterwards), one standalone prompt per figure, 1024x572 PNGs exported from the page (canvas to data-URL bundle, decoded with `tools/art/decode_bundle.py`; a few images arrive as cross-origin lh3 URLs and were exported from their own fresh tab). Prompts are built by `tools/art/v2_prompts.py` (subject and gear, which hand holds what, pose line, proportion sentence, framing), which also writes `prompts-gemini.json` and `figures.json`. Contact sheets: `contact-goliath.png`, `contact-escher.png` (`tools/art/contact_sheet.py`).\n")
L.append("On-style reference (Murder Squad approved v2 concept): `art/unit-concepts/v2/ks-sergeant-bolt-pistol.png` inside the `next-kill-teams-9efd74` worktree of the `wh40k-murder-squad` project (head about 40% of the figure height including base, as wide as the shoulders).\n")
L.append("## Generation budget\n30 of 34 generations used: 27 picks plus 3 rejects (all three on the first Goliath figure). Gemini never refused or hit a quota; no Flux/SDXL substitutes were used.\n")
L.append("## Style sentence notes\nThe earlier Murder Squad sentence (large head, about one third of the height) produced Goliath heads at about 26-31% of the height (brutes with shoulder plates read too small-headed). That wording and the exaggerated-head variants tried after it have since been replaced by the house figure style (tabletop-kb rule 7, mallet-42k docs/FIGURE-STYLE.md, owner 2026-10-31: about 2.8 head-heights, head about 35% of height, very broad armoured shoulders, stern covered face, matte realistic paint). The same sentence went into all 27 figure prompts. No model-kit brand words or \"mecha\" are used (checked by script). Gemini sometimes swaps left and right: those images were mirrored in post (noted per figure). Sidearms are shown holstered where both hands are full. 13-gangs.md gives no larger base for Goliath leaders or champions, so every base is 25 mm in `figures.json`.\n")
L.append("## Rejects (first Goliath figure, `goliath-forge-tyrant-chainaxe`, saved in `rejects/`)\n")
L.append("1. reject1: first prompt, head about 26% of height, about 3.8 heads tall, huge pauldrons.\n2. reject2: shoulder plates toned down, \"giant oversized head about 40%\": head about 24-28%, still too small.\n3. reject3: \"gigantic round head almost half of the total height (about 45%)\": head about 31%, closer but short of 35-40%.\n4. Pick: \"bobblehead proportions ... about 50%\": head about 34% with base, as wide as the shoulders. All later figures used this wording and passed first time.\n")
L.append("Attempts 1-3 used the same subject, gear and pose text as `goliath-forge-tyrant-chainaxe` below (attempt 1 had \"enormous bolted dark-bronze iron pauldrons\" and \"hulking\" in the subject) with earlier large-head proportion sentences (head 40%, then 45-50% of the total height); those sentences are retired.\n")
L.append("## Prompts (exact text sent for the picked images)\n")
for p in d:
    L.append("### " + p["slug"] + "\n")
    if p["slug"] in notes:
        L.append("Note: " + notes[p["slug"]] + "\n")
    L.append(p["prompt"] + "\n")
open(os.path.join(V, "PROMPTS.md"), "w", encoding="utf-8", newline="\n").write("\n".join(L))
print("ok")
