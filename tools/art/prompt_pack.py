"""Build art/prompt-pack.md from docs/spec/30-figures.md (sections 1, 2, 4, 5).

Run: python3 tools/art/prompt_pack.py
Each figure prompt = design sentence (weapon swapped for heavy weapons) + weapon line
+ pose line + style sentence + framing sentence, per spec 6.1.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = (ROOT / "docs/spec/30-figures.md").read_text(encoding="utf-8")
OUT = ROOT / "art/prompt-pack.md"


def quoted(label):
    m = re.search(r"\*\*" + re.escape(label) + r"[^*]*\*\*[^\"]*\"([^\"]+)\"", SPEC)
    return m.group(1)


STYLE = quoted("Style sentence")
FRAMING = quoted("Framing sentence")
HEX = re.search(r"Hex Ward.*?Prompt sentence: \"([^\"]+)\"", SPEC).group(1)
EMBER = re.search(r"Ember Wing.*?Prompt sentence: \"([^\"]+)\"", SPEC).group(1)
DESIGN = dict(re.findall(r"^- \*([^*]+):\* (.+)$", SPEC, re.M))

# design key, the clause of that sentence naming the default weapon, the weapon in words
BODY = {
    "stormtrooper": ("Stormtrooper", "short black blaster carbine with a ribbed barrel shroud and folding stock"),
    "scout": ("Scout trooper", "tiny hold-out blaster pistol"),
    "vader": ("Dark armoured commander (Vader)", None),
    "luke": ("Young hero (Luke)", None),
    "rebel": ("Rebel trooper", "long blaster rifle with a boxy receiver and a slim ring-vented barrel"),
    "commando": ("Rebel commando", "long blaster rifle with a boxy receiver and a slim ring-vented barrel"),
    "wookiee": ("Wookiee warrior", "long single-edged curved blade on a wooden haft, chunky carved-wood pistol"),
}


def body_of(slug):
    if slug == "darth-vader":
        return "vader"
    if slug == "luke-skywalker":
        return "luke"
    if "wookiee" in slug:
        return "wookiee"
    if slug.startswith("scout") or slug == "dlt19x-sniper":
        return "scout"
    if "commando" in slug or slug in ("proton-charge-saboteur", "dh447-sniper"):
        return "commando"
    if slug.startswith("rebel") or slug in ("z6-trooper", "dlt20a-trooper", "sx21-trooper", "mpl57-ion-trooper"):
        return "rebel"
    return "stormtrooper"


EMPIRE = {"stormtrooper", "scout", "vader"}
KIT = ["an extra pouch on the left hip", "a short torn cape stub on one shoulder", "a scuffed, scratched helmet",
       "a coiled cable looped on the belt", "a small field-dressing pack strapped to the thigh",
       "a rolled bedroll on the back", "a dented shoulder plate"]


def strip_weapon(design, weapon):
    """Drop the trailing default-weapon clause so a heavy weapon can replace it."""
    design = design.rstrip(".")
    if weapon is None:
        return design
    parts = [p.strip() for p in design.split(";")]
    if weapon.split(",")[0] in parts[-1] or "same long rifle" in parts[-1]:
        last = parts[-1]
        for w in (weapon, "the same long rifle"):
            last = last.replace(w, "")
        last = last.strip(" ,")
        parts = parts[:-1] + ([last] if last else [])
    return "; ".join(parts)


def colour_words(text, empire):
    hue = "signal orange" if empire else "signal orange-red"
    return re.sub(r"hue-A", hue, text)


def figure_prompt(slug, weapons_cell, pose, kit=None):
    key = body_of(slug)
    label, default_weapon = BODY[key]
    design = DESIGN[label]
    empire = key in EMPIRE
    w = re.sub(r"`[^`]+`\s*(\([^)]*\))?\s*(/\s*`[^`]+`)?", "", weapons_cell).strip(" :,")
    if ":" in weapons_cell and w:
        body = strip_weapon(design, default_weapon)
        w = re.sub(r"^(\w)", lambda m: "a " + m.group(1), w) if not w.startswith(("a ", "an ")) else w
        if "shield" in w:
            weapon = f"It carries {w.replace('blade in the right', 'its curved blade in the right hand')}."
        else:
            weapon = f"Instead of the usual weapon it carries {w}, held firmly and visibly in its hands."
    elif "slung" in weapons_cell:
        body = strip_weapon(design, default_weapon)
        weapon = f"Its {default_weapon or 'rifle'} is slung across its back on a strap; hands busy as posed."
    elif "holstered" in weapons_cell:
        body = strip_weapon(design, default_weapon)
        weapon = f"Its {default_weapon} is holstered on the hip."
    else:
        body = design.rstrip(".")
        weapon = "Each weapon is held firmly and visibly in a hand; no extra weapons."
    if key in ("vader", "luke"):
        body = re.sub(r"\s*\(runs to the base: `--nocut`\)", "", body)
    pose_txt = colour_words(re.sub(r"\s*\([^)]*\)", "", pose), empire).replace("macrobinoculars", "chunky binoculars")
    pose_txt = re.sub(r"chest bars, Hex Ward|chest tab with Ember Wing",
                      lambda m: ("two short signal orange bars on the chest plate and a small emblem decal on the pauldron"
                                 if "Hex" in m.group(0) else "a signal orange-red chest tab with a small emblem decal"),
                      pose_txt).replace("; armband,", "; signal orange-red armband on the upper left arm,")
    body = body.replace("the same long rifle", BODY["rebel"][1])
    noun = "soldier figure" if key in ("stormtrooper", "scout", "rebel", "commando") else "figure"
    kit_txt = f" Small kit difference: {kit}." if kit else ""
    framing = FRAMING
    if "captain" in slug:
        framing = framing.replace("no emblems.", f"no emblems except {HEX if empire else EMBER}.")
    return (f"A single sci-fi {noun}: {body}. {weapon} Pose: {pose_txt}.{kit_txt} "
            f"Style: {STYLE[0].upper() + STYLE[1:]} {framing}")


def rows():
    for line in SPEC.splitlines():
        m = re.match(r"^\| (\d+) \| `([^`]+)` \|", line)
        if m:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            yield cells


def variants(cell):
    for m in re.finditer(r"`(-[a-z])` ([^;]+)", cell):
        yield m.group(1), m.group(2).strip()


EDIT = ("Start from the approved {base} image. Keep exactly the same proportions (two and a half heads tall), "
        "style, finish, base and framing; change only the gear, pose and weapon as described: ")

out = ["# Legion Forge prompt pack (hand-run)",
       "",
       "Generated by `tools/art/prompt_pack.py` from `docs/spec/30-figures.md`; regenerate after spec edits. "
       "Gate every image against spec 6.3 before it goes to Hunyuan3D.",
       "",
       "## How to run",
       "1. **Gemini, one chat per faction.** First message: attach the on-style proportion reference "
       "(our own Murder Squad `aod-intercessor-sergeant.png`) and paste the faction's **base** prompt "
       "(`stormtrooper` for Empire, `rebel-trooper` for Rebels). Regenerate until it passes the gate.",
       "2. Every other figure in that chat: paste the **Edit** line plus the full prompt, so the style never drifts. "
       "If Gemini returns text only, resend once; then reword the gear.",
       "3. Save each image as `art/unit-concepts/<slug>.png` and log it in `art/unit-concepts/PROMPTS.md`.",
       "4. **Hunyuan3D** takes the approved PNG, no text prompt: cutout, shape, paint, finalize "
       "(`--nocut darth-vader`). No style reference image.",
       "5. **Flux klein** for the four table mats (prompts at the end).",
       "",
       "Order: T1, T2, T3, then terrain, tokens, mats. Empire first in each tier.",
       ""]

for tier in ("T1", "T2", "T3"):
    out += [f"## Figures {tier}", ""]
    for c in rows():
        num, slug, unit, role, weapons, pose, var, t = [x.strip("`") if i == 1 else x for i, x in enumerate(c)]
        if t != tier:
            continue
        base = "stormtrooper" if body_of(slug) in EMPIRE else "rebel-trooper"
        is_base = slug in ("stormtrooper", "rebel-trooper")
        out += [f"### `{slug}` ({role})", ""]
        if not is_base:
            out += ["Edit: " + EDIT.format(base=f"`{base}`").rstrip(": ") + ".", ""]
        out += ["```", figure_prompt(slug, weapons, pose), "```", ""]
        trooper = role.startswith("trooper")
        for i, (suffix, vpose) in enumerate(variants(var)):
            out += [f"#### `{slug}{suffix}`", "",
                    f"Edit: start from the approved `{slug}` image; same figure, new pose"
                    + (" and the small kit difference below." if trooper else "."), "",
                    "```", figure_prompt(slug, weapons, vpose, KIT[i % len(KIT)] if trooper else None), "```", ""]

TERRAIN_TAIL = ("Fully painted tabletop wargame terrain piece, weathered sci-fi frontier, a single object, "
                "studio product photo, three-quarter view, pure white background, no base, no figures, "
                "no text, no logos, no emblems.")
SIZE_HINT = {
    "tree-giant-trunk": "a giant forest tree trunk with a fat flared root base and a few thick branches, cut off above",
    "tree-conifer-cluster": "a cluster of three tall narrow conifer trees growing from one mossy mound",
    "fern-clump": "a low clump of broad alien ferns",
    "fallen-log": "a long fallen mossy log with a split end",
    "boulder-large": "a single large weathered boulder with lichen",
    "rock-cluster": "a cluster of four small angular rocks",
    "supply-crates": "a stack of three sturdy military supply crates with handles and latches",
    "fuel-barrels": "a group of three dented industrial fuel drums, one on its side",
    "cargo-container": "a ribbed sci-fi cargo container with heavy door bars",
    "power-generator": "a squat portable power generator with cooling fins, cables and a status panel",
    "comms-antenna": "a tall field comms antenna mast with a dish and guy wires on a tripod foot",
    "sandbag-line": "a short curved line of stacked sandbags",
    "armour-plate-debris": "a pile of bent, scorched armour plates and girder scraps",
    "moisture-vaporator": "a tall ringed cylindrical moisture-collecting tower with stacked collars and small vents",
    "sand-rock": "a wind-carved sandstone rock",
    "ice-boulder": "a jagged blue-white ice boulder with frost",
    "duracrete-rubble": "a heap of broken grey concrete slabs with rebar",
}
out += ["## Terrain props (Gemini concept, then Hunyuan3D)", "",
        "One separate Gemini chat. Proportions are given as height to width; the finalize step scales to inches.", ""]
for line in SPEC.splitlines():
    m = re.match(r"^\| (`[^|]+) \| ([^|]+) \| ([^|]+) \| (Recon|Standard) \|", line)
    if not m:
        continue
    slugs = re.findall(r"`([^`]+)`", m.group(1))
    sizes = [s.strip() for s in m.group(3).split("/")]
    for i, slug in enumerate(slugs):
        size = sizes[i] if i < len(sizes) else sizes[0]
        plates = [""]
        if slug == "supply-crates":
            plates = [f" One crate carries a small stencil plate showing {e}." for e in (HEX, EMBER)]
        out += [f"### `{slug}` ({m.group(4)}, {size}\")", ""]
        for plate in plates:
            tail = TERRAIN_TAIL.replace("no emblems.", "no other emblems.") if plate else TERRAIN_TAIL
            out += ["```", f"{SIZE_HINT[slug][0].upper() + SIZE_HINT[slug][1:]}, about {size} inches in real scale "
                    f"for 28mm figures.{plate} {tail}", "```", ""]

TOKENS = {
    "comms-tower": "a small sci-fi comms tower objective marker: a stubby lattice mast with a dish and blinking lights, under 3 inches",
    "bunker": "a squat domed military bunker with a narrow firing slit and a hatch, 1.5 inches tall",
    "stockpile": "a compact pile of supply crates, ammo cases and a tarp, under 2 inches",
    "scanner": "a single chunky handheld sci-fi field scanner with a small screen and antenna, lying flat",
    "ordnance": "a small bundle of three ordnance shells strapped together",
    "air-support": "a small handheld beacon for calling air support, with a folded antenna and a bright light",
    "comms-scrambler": "a small box-shaped signal scrambler device with dials and a stubby antenna",
    "lab": "a compact field laboratory module with sample racks and a glowing tank",
    "flag": "a planted battle standard on a tall pole with a plain cloth banner, no symbols",
    "listening-post": "a small listening post: a dish antenna on a tripod beside a console",
    "waypoint": "a ground waypoint beacon: a short post with a glowing ring light",
    "base": "a small prefab outpost hut with a door and roof antenna",
    "exchange": "two sealed cargo cases on a hand trolley",
    "bomb": "a heavy cylindrical demolition bomb with a timer panel and handles",
    "prisoner": ("a hooded captive in plain rough clothing, wrists bound in front, standing, " + STYLE),
    "supply-cache": "a sealed supply cache container with latches and a carry handle",
    "data-core": "a glowing crystalline data core cylinder in a protective cage",
    "comms-relay": "a portable comms relay case, open, with an extended antenna",
}
out += ["## Objective and token models (Gemini concept, then Hunyuan3D)", "",
        "Same chat as terrain. Recon first: comms-tower, bunker, stockpile, scanner, ordnance, air-support, comms-scrambler.", ""]
for slug, desc in TOKENS.items():
    out += [f"### `{slug}`", "", "```", f"{desc[0].upper() + desc[1:]}. {TERRAIN_TAIL}", "```", ""]

MATS = {
    "forest": "a forest clearing floor: short moss and grass, scattered leaf litter, patches of bare dark soil and small stones",
    "desert": "a desert floor: wind-rippled pale sand, scattered pebbles, patches of cracked hardpan",
    "snow": "a snowfield: packed snow with footprint-free drifts, patches of blue ice and dark exposed rock",
    "urban": "a sci-fi plaza floor: large grey concrete paving panels with seams, stains, cracks and small drains",
}
out += ["## Table mats (Flux klein)", "", "Square, 2048 px, then check by tiling 2x2.", ""]
for slug, desc in MATS.items():
    out += [f"### `{slug}`", "", "```",
            f"Seamless tileable top-down orthographic ground texture of {desc}, even soft daylight, no shadows "
            "from tall objects, no horizon, no perspective, wordless and untitled, full-bleed, no text, no logos.",
            "```", ""]

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("\n".join(out), encoding="utf-8")
print(OUT, sum(1 for l in out if l == "```") // 2, "prompts")
