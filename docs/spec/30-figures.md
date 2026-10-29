# 30 - Figures, insignia, terrain and tokens (art brief for the PC session)

Status: M5 spec, 2026-10-29. Owner decisions: D5 (MGSD, recognizable Star Wars designs, dynamic poses with weapons fused in; locked, not re-litigated), D18 (art starts now in parallel from the Windows PC, streaming from the M1 figure list; procedural stand-ins until GLBs land), D19 (original insignia in the spirit of the Imperial crest, Rebel starbird and rank markings; no Lucasfilm emblem reproduced). Templates: Murder Squad `docs/spec/30-figures.md` v2 (current contract), Mallet-42k `30-figures.md`, KB README rules 7, 13, 15, `murder-squad.md` section 7, `local-ai-studios.md`, `lessons-since-2026-10-17.md` sections 5, 7, 8, `not-enough-minerals.md` sections 4, 8.

Rendering only. The engine never reads a mesh: LoS uses the silhouette record (`core.silhouette.small`, 1.69" tall, base plus the space above it, RULING R-10.1), contact and cohesion use the base record (`core.base.small`, 27 mm, R-20.1). Who runs it: a Claude session on the owner's Windows PC (Gemini through Claude in Chrome, Hunyuan3D 2.0/2.1, Flux Studio); the cloud session cannot.

## 1. Art direction (locked)
- **Proportions in numbers:** about 2.5 heads tall; the head (or helmet) is one third of the total figure height (gate: 35-40%) and as wide as the shoulders; short compact chest; very short thick legs with big feet; short arms with oversized hands and weapons. Wookiees and Vader keep the same ratios (they are bigger figures, not taller-proportioned ones).
- **Style sentence, verbatim in every figure prompt** (Murder Squad, derived from the owner's reference pictures): "a super-deformed heroic figure, exactly two and a half heads tall, the enormous head one third of the total height and as wide as the shoulders, a short compact chest, very short thick legs with big feet, short arms with oversized hands; dense layered hard-surface detail with fine panel lines, rivets and small accents; glossy painted model-kit finish, crisp edges, saturated colours."
- **Banned words** in prompts, PROMPTS.md and docs: any model-kit brand or product line, "mecha", "robot kit", "robot". Also no franchise, film or character names in a prompt (they invite lettering and refusals): every design is described in words.
- **Framing sentence, verbatim:** "Exactly one figure, the whole figure standing on a plain round black base about as wide as its shoulders, studio product photo, three-quarter view from slightly below, pure white background, no text, no logos, no emblems." (Where section 2 places an original insignia, the last clause becomes "no emblems except <insignia sentence>".)
- **Recognizable designs in our words:** armour shapes, helmet shapes, cloth, fur and weapon silhouettes are described in section 4. Never generate from an official image and never img2img official art. Product photos may sit in gitignored `refs-local/` only when a design does not read from words; they inform the wording and are never uploaded to Gemini, Flux or Hunyuan. The only image ever attached to Gemini is our own on-style reference (section 6.2).
- **Pose per role (no A-poses):** leader pointing or waving the squad on; trooper aiming, advancing hip-fire or kneeling; heavy gunner braced; sniper kneeling with the scope at the eye; saboteur crouched placing a charge; spotter kneeling with macrobinoculars; Force user mid-swing; Wookiee roaring mid-charge. Default weapons are part of the figure (Hunyuan fuses them); a hand holds each one visibly.

## 2. Insignia and markings (D19, original designs)
The insignia are drawn for this project. They evoke the setting through shape language only; they also become the UI faction pips (`faction.json` icons `faction-empire`, `faction-rebels`; original SVGs drawn later, same shapes), and rank pips for the HUD use the same languages instead of AMG's rank icons. Faction identity goes in pips and words, never in borders (Starbound rule, KB `starbound-legions-ip.md`).
- **Empire, "Hex Ward":** angular, mechanical, monochrome. Prompt sentence: "a small flat hexagon standing on one point, with an inner hexagon cut by three short horizontal bars stepping downward, white on black". No circle, no spokes.
- **Rebels, "Ember Wing":** organic, avian and flame, warm. Prompt sentence: "a small open emblem of a single swept-up flame shaped like one rising wing, with a tiny four-pointed star above its tip, warm orange". One wing only, no enclosing circle, no three-pronged shape.
- **Where they appear on figures:** only on leaders, captains and terrain dressing (crates, bunker plates, containers), as a small shoulder or chest decal; troopers stay plain. At 1" scale Hunyuan paint blurs decals, so the insignia matter most on UI pips and terrain.
- **Rank and squad markings (carry the painter hue A, section 3):** Empire: unit leader = one hue-A shoulder pauldron; captain = hue-A pauldron plus two short hue-A bars on the chest plate and a Hex Ward decal on the pauldron; specialist = a hue-A band around the backpack; scout leader = a small hue-A pauldron. Rebels: unit leader = a hue-A armband on the upper left arm; captain = armband plus a hue-A chest tab with an Ember Wing; specialist = a hue-A patch on the backpack; commando leader = a hue-A scarf; Wookiee leader = a hue-A sash across the bandolier. No numerals or lettering anywhere (two units of the same type are told apart by the client's base ring and chips).
- **Banned elements (gate rejects the image):** a ring or wheel with radiating spokes around a central disc (Imperial crest, Galactic Republic cog); a hexagon containing a circle with spokes (Separatist emblem); a three-pronged bird or phoenix shape, a central spike flanked by two upswept wings, or any bird in a circle (Rebel starbird); the First Order, New Republic, Jedi Order and Mandalorian skull emblems; rows of small coloured squares on a chest plaque (Imperial rank plaque); Aurebesh or any lettering; any logo.

## 3. Palettes and the hue-band army painter
The painter (Murder Squad pattern: remap two source hue bands per faction to the player's chosen colours) leaves low-saturation texels untouched. **Stormtrooper problem:** white armour and black bodyglove are neutral, so the bulk of an Imperial figure cannot be repainted. **Answer:** saturated hue-A markings (pauldrons, armbands, sashes, captain bars, saboteur charges) carry the painter colour; hue B covers secondary kit; seat identity also comes from the client's base rim. Every leader and captain must show a hue-A area of at least about 8% of its visible surface; unique commanders (Vader, Luke) are exempt and rely on the base rim.

| Faction | Hue A (markings) | Hue B (kit) | Neutral, never painted | Keep out of the bands |
|---|---|---|---|---|
| Empire | signal orange, H 20-40, S >= 0.5 | steel blue, H 200-225, S >= 0.3 (helmet tube stripes, ear discs, weapon power cells) | white armour, black bodyglove, gunmetal weapons | Vader's red blade (H ~0) |
| Rebels | signal orange-red, H 12-28, S >= 0.55 | olive drab, H 70-110, S >= 0.25 (helmets, vests, commando camouflage) | khaki fatigues (H ~40, S < 0.3), cream tunic, leather | Luke's blue blade (H ~210); Wookiee fur is dark chocolate brown, S < 0.4 |

Check: Hunyuan paint drifts toward pale tan; the re-grade must bring Imperial whites back to neutral (mean armour S < 0.08) and the gallery shows each figure with two test schemes.

## 4. Figure list (from the data ids)
Source: `src/data/armies/{empire,rebels}/units.json` (`figure.archetype`), `upgrades.json` (`addsMinis`), default lists in `lists.json`. All slice units use `core.base.small` (27 mm, 1.06") and `core.silhouette.small` (1.69"). **Height targets (table to top of head, base included):** humans 1.55", Vader 1.62", Wookiees 1.69"; nothing exceeds the silhouette, so a figure never looks taller than the LoS volume. Write `height` in `units.json` as the figure height above the base top (target minus `baseTopIn`). **Tiers:** T1 = commanders, corps and the first default list (`*.list.recon-a`); T2 = special forces and strike teams of recon-a; T3 = recon-b options and the remaining upgrades.

**Slug rules for the client:** unit body slug = `figure.archetype`; the unit leader mini uses `<archetype>-leader`; other minis use `<archetype>` or one of its `variants` by a hash of the mini id; an upgrade mini uses the upgrade id without `<prefix>.up.`; a Leader upgrade (`addsMinis.leader`) makes its mini the leader and the old leader mini renders as a trooper; in a Strike Team the heavy-weapon mini is the leader (K-10) and the unit's own mini uses `<archetype>-spotter`. Personnel minis without a look of their own are `aliases` in the manifest: `stormtrooper`, `stormtrooper-squad` -> `stormtrooper`; `rebel-trooper`, `rebel-trooper-squad` -> `rebel-trooper`.

**Design sentences (our words; paste into the prompt with the pose line):**
- *Stormtrooper:* full-face white helmet with two large dark teardrop eye lenses, a downturned grille mouth with small vertical vent ridges, a brow ridge and round ear discs; white segmented chest plate, belly bands, thigh and shin plates over a black bodyglove; white belt with a row of small boxes; short black blaster carbine with a ribbed barrel shroud and folding stock.
- *Scout trooper:* white helmet with a long tapering visor snout and a dark horizontal eye slit; black padded bodysuit, small white chest plate and shin guards, black boots with a holster; tiny hold-out blaster pistol.
- *Dark armoured commander (Vader):* tall figure in glossy black, flared dome helmet, angular triangular mouth grille, dark lens eyes, chest box with small coloured lights, shoulder armour, belt with two rectangular control boxes, long black cape (runs to the base: `--nocut`), red glowing energy blade held two-handed.
- *Young hero (Luke):* sandy-blond hair, cream wrap-over tunic, dark belt with a holster, light trousers, tall boots; blue glowing energy blade raised in the right hand, small blaster pistol in the left.
- *Rebel trooper:* rounded olive helmet with a short brim and goggles pushed up, khaki field jacket, olive padded vest with pouches, long blaster rifle with a boxy receiver and a slim ring-vented barrel.
- *Rebel commando:* mottled green-brown camouflage poncho, soft camouflage cap or helmet with netting, olive gear straps, the same long rifle.
- *Wookiee warrior:* towering shaggy creature with dark chocolate-brown fur, blue eyes under a heavy brow, leather shoulder guard and a bandolier of small boxes across the chest; long single-edged curved blade on a wooden haft, chunky carved-wood pistol.

| # | Slug | Unit / upgrade id | Role | Weapons fused (data ids) | Pose line | Variants (`-b`, `-c`) | Tier |
|---|---|---|---|---|---|---|---|
| 1 | `darth-vader` | `emp.u.darth-vader-dlots` | commander | `emp.w.vaders-lightsaber-dlots` | striding forward, blade raised two-handed over the right shoulder, cape swinging | - | T1 |
| 2 | `stormtrooper-leader` | `emp.u.stormtroopers` | leader | `emp.w.e11` (`emp.w.bludgeon` = rifle butt) | carbine in the right hand, left arm pointing forward, hue-A pauldron | - | T1 |
| 3 | `stormtrooper` | `emp.u.stormtroopers`, aliases | trooper | `emp.w.e11` | standing, carbine shouldered and aiming | `-b` advancing, hip-fire; `-c` kneeling aim | T1 |
| 4 | `dlt19-stormtrooper` | `emp.up.dlt19-stormtrooper` | heavy weapon | `emp.w.dlt19`: long heavy rifle, perforated barrel shroud, bipod folded | braced, firing from the hip with both hands | - | T1 |
| 5 | `luke-skywalker` | `reb.u.luke-hotr` | commander | `reb.w.anakins-lightsaber`, `reb.w.lukes-blaster` | lunging, blade swept up in the right hand, pistol aimed in the left | - | T1 |
| 6 | `rebel-trooper-leader` | `reb.u.rebel-troopers` | leader | `reb.w.a280` | rifle in the left hand, right arm waving the squad on, hue-A armband | - | T1 |
| 7 | `rebel-trooper` | `reb.u.rebel-troopers`, aliases | trooper | `reb.w.a280` | standing, rifle shouldered and aiming | `-b` running forward; `-c` kneeling aim | T1 |
| 8 | `z6-trooper` | `reb.up.z6-trooper` | heavy weapon | `reb.w.z6`: rotary cluster of six barrels, hose to a back power pack | braced wide, barrels spinning | - | T1 |
| 9 | `scout-trooper-leader` | `emp.u.scout-troopers` | leader | `emp.w.ec17` | crouched, pistol up, left hand signalling, small hue-A pauldron | - | T2 |
| 10 | `scout-trooper` | `emp.u.scout-troopers` | trooper | `emp.w.ec17` | half-crouched, pistol aimed two-handed | `-b` creeping forward | T2 |
| 11 | `sonic-charge-saboteur` | `emp.up.sonic-charge-saboteur` | heavy weapon | `emp.w.sonic-charge`: flat disc mine with a ring of hue-A lights | kneeling, setting the disc on the ground | - | T2 |
| 12 | `scout-trooper-spotter` | `emp.u.scout-strike-team` | trooper (strike team) | `emp.w.ec17` holstered | kneeling, macrobinoculars at the visor | - | T2 |
| 13 | `dlt19x-sniper` | `emp.up.dlt19x-sniper` | heavy weapon (leader) | `emp.w.dlt19x`: long rifle, long scope, extended barrel | kneeling, eye to the scope | - | T2 |
| 14 | `rebel-commando-leader` | `reb.u.rebel-commandos` | leader | `reb.w.a280` | crouched, rifle low, left hand signalling, hue-A scarf | - | T2 |
| 15 | `rebel-commando` | `reb.u.rebel-commandos` | trooper | `reb.w.a280` | crouched, rifle aimed | `-b` moving low through cover | T2 |
| 16 | `proton-charge-saboteur` | `reb.up.proton-charge-saboteur` | heavy weapon | `reb.w.proton-charge`: boxy charge with a blinking hue-A light | kneeling, arming the charge | - | T2 |
| 17 | `rebel-commando-spotter` | `reb.u.commando-strike-team` | trooper (strike team) | `reb.w.a280` slung | kneeling, macrobinoculars at the eyes | - | T2 |
| 18 | `dh447-sniper` | `reb.up.dh447-sniper` | heavy weapon (leader) | `reb.w.dh447`: long rifle, long scope, wooden stock | kneeling, eye to the scope | - | T2 |
| 19 | `wookiee-warrior-leader` | `reb.u.wookiee-warriors-ff` | leader | `reb.w.ryyk-blade`, `reb.w.kashyyyk-pistol` | roaring, blade raised high, pistol forward, hue-A sash | - | T2 |
| 20 | `wookiee-warrior` | `reb.u.wookiee-warriors-ff` | trooper | `reb.w.ryyk-blade`, `reb.w.kashyyyk-pistol` | charging, blade swung low, pistol firing | `-b` mid-slash | T2 |
| 21 | `bowcaster-wookiee` | `reb.up.bowcaster-wookiee` | heavy weapon | `reb.w.bowcaster`: crossbow-like energy rifle with bow arms and a scope | standing, aiming two-handed | - | T2 |
| 22 | `t21-stormtrooper` | `emp.up.t21-stormtrooper` | heavy weapon | `emp.w.t21`: long slim repeating blaster, tall box sight | firing from the hip, braced | - | T3 |
| 23 | `hh12-stormtrooper` | `emp.up.hh12-stormtrooper` | heavy weapon | `emp.w.hh12`: shoulder rocket tube with a front grip | kneeling, tube on the right shoulder | - | T3 |
| 24 | `dlt20a-trooper` | `reb.up.dlt20a-trooper` | heavy weapon | `reb.w.dlt20a`: long rifle, perforated shroud, scope | standing, aiming | - | T3 |
| 25 | `sx21-trooper` | `reb.up.sx21-trooper` | heavy weapon | `reb.w.sx21`: short pump scatter blaster, wide muzzle | charging, gun at the hip | - | T3 |
| 26 | `battle-shield-wookiee` | `reb.up.battle-shield-wookiee` | heavy weapon | `reb.w.battle-shield-defensive` / `-offensive`: big curved wood-and-metal shield on the left arm, blade in the right | shield raised, blade cocked back (one body for both card sides) | - | T3 |
| 27 | `stormtrooper-captain` | `emp.up.stormtrooper-captain` | upgrade (leader) | `emp.w.e11` | commanding, carbine in one hand, other arm sweeping forward; hue-A pauldron, chest bars, Hex Ward | - | T3 |
| 28 | `stormtrooper-specialist` | `emp.up.stormtrooper-specialist` | upgrade | `emp.w.e11` slung | kneeling with a handheld field scanner, bulky tech backpack with hue-A band | - | T3 |
| 29 | `rt97c-stormtrooper` | `emp.up.rt97c-stormtrooper` | heavy weapon | `emp.w.rt97c`: heavy rifle with a drum power cell and scope, carry strap | advancing, firing from the waist | - | T3 |
| 30 | `rebel-trooper-captain` | `reb.up.rebel-trooper-captain` | upgrade (leader) | `reb.w.a280` | pointing ahead, rifle braced on the hip; armband, chest tab with Ember Wing | - | T3 |
| 31 | `rebel-trooper-specialist` | `reb.up.rebel-trooper-specialist` | upgrade | `reb.w.a280` slung | kneeling at a comms backpack with an antenna, hue-A patch | - | T3 |
| 32 | `mpl57-ion-trooper` | `reb.up.mpl57-ion-trooper` | heavy weapon | `reb.w.mpl57`: rifle with a glowing coil barrel | standing, aiming from the shoulder | - | T3 |
| 33 | `long-gun-wookiee` | `reb.up.long-gun-wookiee` | heavy weapon | `reb.w.long-gun`: long carved-wood rifle | standing, aiming down the barrel | - | T3 |

**Count: 33 miniature types plus 7 pose variants = 40 bodies** (Empire 17, Rebels 23); T1 12 bodies, T2 16, T3 12 (nothing in T3 has variants). Force upgrades, command cards and keywords add no minis. Whoever adds a unit later appends rows here from its data ids at M1 (NEM lesson: 11 of 31 ids stayed procedural when the list came from the box contents).

## 5. Terrain, tokens and table mats
**Procedural from rules geometry** (client code, sized from `src/data/layouts/*.json` and the barricade record; never a GLB with its own walls, KB rule 14):
- `kind: building` (recon-forest-1 `t5`, `t6`: 4"x4", 7" tall, impassable, blocks LoS): extruded shell from footprint and `heightIn`, duracrete panel texture, roof slab; Hunyuan dressing props may stand against the outside, never changing the footprint.
- `kind: obstacle` (`t3`, `t4` barricade lines 8"x0.5"x1.5", and `core.terrain.barricade` placed by Fortified Position, size Unsourced R5): segmented angled armour plates along the footprint.
- `kind: area` (`t1`, `t2` forest copses 3.5"x6", 4" tall, light cover, difficult): ground decal from the footprint plus seeded Hunyuan props fully inside it, tops at or below `heightIn`.
- POI discs (2") and Asset/card-token discs (1"): procedural neutral discs with a rim; a small Hunyuan prop sits on top. Unit tokens (Intel, Observation, Marked Target, Vanguard) are HUD chips, not models.

**Hunyuan props** (Gemini painted concepts, "fully painted tabletop wargame terrain piece, weathered sci-fi frontier, white background", height ratio stated; then `terrain_post.py --faces 9000`, decimated to about 6k triangles; flats stay procedural). Target size in inches; `public/assets/models/terrain/<slug>.glb`:

| Slug | Use | Size | Set |
|---|---|---|---|
| `tree-giant-trunk` | forest area fill, fat root-flared trunk | 4.0 tall, 1.5 wide | Recon |
| `tree-conifer-cluster` | forest area fill | 3.5 tall | Recon |
| `fern-clump` | area undergrowth | 0.8 | Recon |
| `fallen-log` | area dressing | 3.0 long, 0.7 tall | Recon |
| `boulder-large`, `rock-cluster` | area and building dressing | 1.5 / 1.0 | Recon |
| `supply-crates` | crate stack with a Hex Ward or Ember Wing plate | 1.2 | Recon |
| `fuel-barrels` | dressing | 1.0 | Recon |
| `cargo-container` | building dressing, later scatter | 3.0 x 1.5 x 1.5 | Recon |
| `power-generator`, `comms-antenna` | bunker dressing | 1.5 / 3.0 | Recon |
| `sandbag-line`, `armour-plate-debris` | dressing | 2.0 / 1.0 | Standard |
| `moisture-vaporator` (tall ringed column), `sand-rock` | desert | 3.0 / 2.0 | Standard |
| `ice-boulder` | snow | 1.5 | Standard |
| `duracrete-rubble` | urban | 1.5 | Standard |

**Objective and token models** (`public/assets/models/tokens/<slug>.glb`, a prop on its procedural disc, POI props at most 3" tall): Recon first: `comms-tower` (POI), `bunker` (POI, squat domed bunker 1.5" tall), `stockpile` (POI, crate pile), `scanner` (Asset, handheld scanner), `ordnance`, `air-support`, `comms-scrambler` (card tokens, 1"). Standard later: POIs `lab`, `flag`, `listening-post`, `waypoint`, `base`, `exchange` and any other POI a Standard card in `11-battle.md` section 4 names (generic POI fallback); Assets `bomb`, `prisoner` (a hooded captive, MGSD), `supply-cache`, `data-core`, `comms-relay`.

**Table mats** (Flux klein through `tools/textures/gen-mats.mjs`, legacy ADAPT; tileable, checked by 2x2 tiling, "wordless and untitled, full-bleed"): `forest` (Recon default: recon-forest-1 is "Forest Clearing"), `desert`, `snow`, `urban` (duracrete plaza). Written where gen-mats.mjs writes them, WebP, at most 2048 px.

**Count: 3 procedural piece kinds plus discs; 17 Hunyuan props (11 Recon, 6 Standard); 7 Recon token models, 11 or more Standard; 4 mats.**

## 6. Pipeline with gates
### 6.1 Setup (once)
Port per `docs/spec/05-migration.md` M5 rows: `tools/art/{contact_sheet,decode_bundle,hf-concepts}.py` (KEEP), `tools/art/{v2_prompts,v2_promptsmd}.py` (ADAPT: prompt = design sentence + weapons and hands + pose line + style sentence + framing), `tools/models/{measure-sockets,finalize-attachments}.py` (KEEP), `finalize-terrain.py`, `shoot-figures.mjs`, `tools/textures/gen-mats.mjs` (ADAPT). Add `tools/models/optimize.mjs` (dedup, prune, weld, WebP <= 1024, meshopt via gltf-transform; none of the local checkouts has it, so write or copy it from the PC's Murder Squad checkout) and `npm run models:optimize`. Units and picks: `tools/local-gen/lf_units.json` (`{slug: {prompt, height, base: 27}}`, committed) and `lf_picks*.json` (machine paths, gitignored, never committed); bat files adapted from Murder Squad `run_v2_local.bat` / `run_v2_alteisen.bat`. Write JSON without a BOM (PowerShell 5.1 adds one).

### 6.2 Concepts (Gemini, one chat per faction, plus one for terrain and tokens)
1. Claude in Chrome on the Windows PC (`list_connected_browsers`, then `select_browser` the Windows one; never the Mac, never the built-in pane).
2. First message of each faction chat attaches **one on-style reference** through the hidden file input (never the clipboard): Murder Squad `art/unit-concepts/v2/aod-intercessor-sergeant.png` (our own generated art) for proportions only. Prompt the base image: `stormtrooper` for the Empire chat, `rebel-trooper` for the Rebel chat. Once it passes 6.3 it becomes that faction's reference.
3. Every other body is an edit of an approved image ("start from image N, keep the proportions, style, base and framing; change only <gear / pose / weapon>"), one standalone prompt per body with the full style and framing sentences. Free-text follow-ups drift to 6-7 heads.
4. Log every prompt in `art/unit-concepts/PROMPTS.md` (slug, prompt, edit-of, attempt, verdict); save `art/unit-concepts/<slug>.png`. Export each chat as one in-page JSON bundle (canvas to data URL; `?alr=yes` fetch for `lh3.googleusercontent.com` images or save them from their own tab) decoded by `tools/art/decode_bundle.py`.
5. Refusals and text-only replies (about 1 in 17): resend with reworded gear and no proper nouns.

### 6.3 Per-item gate (in the stream, before a PNG enters the GLB queue)
Each concept is shown side by side with the faction reference (or, for each faction's base image, the Murder Squad reference) and measured: head 35-40% of figure height, 2-2.5 heads overall, exactly one figure, whole base visible, the listed weapons in the stated hands and no extra weapons or limbs, nothing fused into the base, no text, no logo, no banned insignia element (section 2), hue-A marking present where section 2 puts one, white background. Record the numbers in a gate table at the end of PROMPTS.md. The coordinator reviews the first image and the **contact sheet** (`tools/art/contact_sheet.py` -> `art/unit-concepts/contact-<faction>-t<tier>.png`) of each faction tier before that tier's GLBs start; send contact sheets to the owner as FYI (approval is delegated to Claude, KB rule 7).

### 6.4 GLBs (Hunyuan3D, streamed)
- Pipeline everything (KB rule 13): each gated PNG goes straight into the queue of whichever PC is free (this PC, RTX 5080: about 90 s shape + 20 s paint; Alteisen, RTX 3080 via `ssh alteisen` and `E:\AI\py2.bat` / `py21.bat`: about 2 min + 4.5 min); while one tier renders, prompt the next. Batches of at most 9 per machine; Alteisen jobs launched detached with `schtasks`.
- Stages: `stage_cutout.py` -> `stage_shape.py --only <slugs>` (`--nocut darth-vader` if the cape reaches the base) -> `stage_paint.py --only <slugs>` -> `stage_finalize.py <repo>\public\assets\models\bodies <slugs>` (black 27 mm base, scaled to `height`). No Hunyuan style reference (it turns everything blue).
- Before every batch delete stale `outputs/<slug>/shape.glb` for the batch's slugs; trust a batch only when the shape log shows `shape done` for every slug (a failed shape is otherwise masked by re-painting the old mesh). Free about 40 GB of Windows commit charge before 2.1 shape on this PC; check free space on both Alteisen drives.
- Re-grade paint (Hunyuan flattens to pale tan; Imperial whites back to neutral).

### 6.5 Post, check, wire
`npm run models:optimize` (meshopt; the client's `GLTFLoader` must call `setMeshoptDecoder`, as legacy `glbLoader.ts` does, or every GLB silently falls back to the stand-in) -> `measure-sockets.py` (manifest, `weaponsBaked`) -> **`?gallery` front and side close-ups** of every slug (facing +Z, base centred at the origin, nothing cropped, weapons in hand, top of head at or under the 1.69" silhouette wireframe, two painter schemes); fix wrong facing with a per-slug `yaw`. Until the M3 client has the `?gallery` route, use the finalize preview PNGs plus `shoot-figures.mjs` and run the gallery pass when it lands. Then commit the faction tier.

### 6.6 GLB contract and manifest
- **GLB:** origin at the base centre, y up, 1 unit = 1 inch, front +Z, pre-scaled upstream (table-to-top targets in section 4), black base disc of 27 mm included, at most about 8k triangles per body after optimize, terrain props about 6k.
- **Manifest** `public/assets/models/manifest.json` (legacy `bodyManifest.ts` reads `bodies` leniently and resolves a bare `file` under `bodies/`):
`{ bodies: { <slug>: { file, archetype, faction, role: leader|trooper|heavy|upgrade, units: [unitId], upgrade?: upgradeId, weapons: [weaponId], weaponsBaked: true, figureHeightIn, baseTopIn, baseMm: 27, variants?: [slug], yaw?, facing? } }, aliases: { <slug>: <slug> }, terrain: { <slug>: { file: "terrain/<slug>", sizeIn: {x, y, z}, tris } }, tokens: { <slug>: { file: "tokens/<slug>", kind: poi|asset|card, diameterIn } } }`.

### 6.7 File locations
`art/unit-concepts/<slug>.png`, `art/unit-concepts/PROMPTS.md` (with the gate table), `art/unit-concepts/contact-*.png`; `art/terrain/concepts/<slug>.png` + `PROMPTS.md`; `public/assets/models/bodies/<slug>.glb`, `public/assets/models/terrain/`, `public/assets/models/tokens/`, `public/assets/models/manifest.json`; `tools/local-gen/lf_units.json`; raw meshes in gitignored `tools/models/raw/`.

### 6.8 GPU and Gemini etiquette
- Announce GPU work at session start; one GPU job per machine; never `taskkill /F /IM node.exe`. Shared reservation file `C:\Claude Code Projects\.gpu-lock`: reserve while another run is busy, start after 2 minutes of real idle, render in chunks of at most 10 minutes, free VRAM and RAM, delete the lock, give up a reservation that cannot start within 25 minutes.
- Stop the local studio services when the session is done with them (owner rule 17).
- Gemini: about 30 images per evening, so plan T1 (12) plus T2 (16) as evening one with retries spilling over, T3 (12) plus terrain and tokens as evening two. Overnight runs stall after about an hour behind the Windows screen lock (keep-awake does not help): run while the owner is at the PC or with the screen lock off; otherwise fall back to Flux klein image edit from an approved concept.

### 6.9 Privacy and IP
Credit **evilgouki** only; never the owner's real name, email or home path in any committed file (write `%USERPROFILE%`, never an expanded user folder); grep the staged diff before each commit. No official images, art, icons or logos in the repo or in any model input; `refs-local/` stays gitignored.

## 7. Open questions (building on the recommended default)
1. Luke's look: **default** cream tunic with the blue blade (the data weapon is Anakin's Lightsaber); alternative: black tunic.
2. Figure heights: **default** humans 1.55", Vader 1.62", Wookiees 1.69" table to top, never above the silhouette; alternative: everyone at 1.69".
3. GLB folder: **default** `public/assets/models/bodies/<slug>.glb`, because the kept legacy loader resolves bare names there; alternative: models root with a one-line loader change.
4. Upgrade-mini lookup: **default** slug from the upgrade id plus manifest `aliases` (no schema change); alternative: add a `figure` field to upgrade records in a later data pass.

## 8. Kickoff prompt for the PC session (paste as is)
```
You are the Legion Forge M5 art session on the owner's Windows PC (GPU, Gemini through Claude in Chrome, local Hunyuan3D, Flux Studio).
1. In C:\Claude Code Projects: git clone --recurse-submodules https://github.com/dragoonant/legion-forge (or git pull && git submodule update --init in the existing checkout).
2. Read CLAUDE.md, then docs/spec/30-figures.md in full; it is the contract. Also docs/knowledge-base/local-ai-studios.md.
3. Standing approvals (owner, 2026-10-28/29, D5, D18, D19): MGSD figures of recognizable Star Wars designs described in words, original insignia, GPU use for this project, delegated concept approval with contact sheets as FYI. You may add tools/art, tools/models, tools/local-gen, tools/textures files, the models:optimize script in package.json and its gltf-transform dev dependency (npm install allowed for that only).
4. Announce GPU work, check C:\Claude Code Projects\.gpu-lock, check the studios with curl before use.
5. Work in tier order from section 4: T1, T2, T3, then terrain, tokens and mats. One Gemini chat per faction; Empire first within each tier.
6. Every concept passes the section 6.3 gate before it enters the Hunyuan queue; stream each gated PNG to whichever PC is free; clear stale shape.glb, require "shape done" per slug.
7. After each faction tier: models:optimize, manifest, ?gallery (or preview PNGs until the route exists), contact sheet to the owner as FYI.
8. Commit per faction tier: "M5: <faction> figures T<n> (<count> GLBs)" plus the session's attribution lines; grep the staged diff for the owner's name and home path; push to main.
9. Never edit engine, data or STATUS.md; log anything the spec did not foresee in HANDOFF.md under "Art notes".
10. Stop the studio services when done and report counts, failures and the contact-sheet paths in 10 lines or fewer.
```
