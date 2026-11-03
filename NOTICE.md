# NOTICE

Legion Forge is an unofficial, non-commercial fan project by **evilgouki** that implements the *game mechanics* of the Star Wars: Legion miniatures game so it can be played against an AI in a web browser. Game mechanics and rules are functional systems; this project re-implements them in its own code.

What the project contains, and where:

- **Names.** Unit, weapon, keyword, command-card and battle-card names of the published game appear in the data files under `src/data/`, to identify the units and cards whose mechanics are implemented, the way a list builder or a rules reference names them.
- **Rules text.** None of the publisher's text is stored or shown. Every description, help entry, prompt and guide in the game is written in our own words from the mechanics. The official rules documents used for research are never committed (`docs/sources/` is excluded from the repository).
- **Art.** All artwork is original: 3D figures and terrain generated for this project from descriptions written for it, in an original serious painted-miniature style, with original faction insignia. No official artwork, photography, logo, icon or emblem of the published game or the Star Wars franchise is included or traced.
- **Audio.** All audio is original, generated for this project; no film, game or franchise sound or music is used or imitated.
- **Points and statistics** come from the publisher's freely downloadable documents and a public community list builder, cross-checked by hand; they are facts about the game, not creative expression.

Star Wars and Star Wars: Legion are trademarks of Lucasfilm Ltd. and are used here only to identify the game whose rules are implemented. This project is not affiliated with, endorsed by, or connected to Atomic Mass Games, Asmodee, Fantasy Flight Games, Lucasfilm Ltd. or The Walt Disney Company. It is free, carries no advertising and sells nothing.

If you hold rights in material used here and want it changed or removed, open an issue on the repository or contact the repository owner through GitHub. The site can be taken down within minutes (`docs/takedown.md`).

Maintenance rule: any change that affects a claim above, or how the game is deployed, updates this file and `docs/takedown.md` in the same commit.
