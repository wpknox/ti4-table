# Credits

This is an unofficial fan site. It is free, non-commercial and has no ads or donations. It is not affiliated with or endorsed by Fantasy Flight Games or Asmodee.

## Faction symbols

The faction symbols in `public/img/factions/` are artwork from *Twilight Imperium: Fourth Edition*, © Fantasy Flight Games. They are used under the [Asmodee fan content policy](https://www.zmangames.com/ip-policy/), for a free, non-commercial fan site. That policy is not a licence, and the art will be removed promptly if its owner asks.

Twilight Imperium and its faction symbols are the property of Fantasy Flight Games. The files here are monochrome redraws and traces made for recolouring. `public/img/factions/manifest.json` records where each one came from:

- most are from the vector sheet in [marshallcase/ti4-svg](https://github.com/marshallcase/ti4-svg)
- six (Bastion, Deepwrought, Firmament, Obsidian, Ral Nel, Crimson Rebellion) were traced from the faction images in [AsyncTI4/TI4_map_generator_bot](https://github.com/AsyncTI4/TI4_map_generator_bot)

Those repositories carry no licence for the artwork. Our permission to use it comes only from the fan policy above.

## Space image

Hubble eXtreme Deep Field (`public/img/space/deep-field.webp`).

Credit: NASA, ESA, G. Illingworth, D. Magee, and P. Oesch (University of California, Santa Cruz), R. Bouwens (Leiden University), and the HUDF09 Team

Source: [ESA/Hubble, heic1214a](https://esahubble.org/images/heic1214a/). Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/), per the [ESA/Hubble copyright page](https://esahubble.org/copyright/). Darkened and cropped.

## Rules text

Rules text comes from [tirules-search](https://github.com/wpknox/tirules-search), a fork of [dangothemango/tirules](https://github.com/dangothemango/tirules) by dangothemango and BradleyΣ. The highlighted rulings are official rulings from Dane (the rules designer's team), not part of the Living Rules Reference. *Twilight Imperium* is © Fantasy Flight Games. This site isn't affiliated with them.

The rules content is GPL-3.0, so this repository is GPL-3.0.

## Tile images

The system tile images in `public/img/tiles/` are artwork from *Twilight Imperium: Fourth Edition*, © Fantasy Flight Games. They are used under the [Asmodee fan content policy](https://www.zmangames.com/ip-policy/), for a free, non-commercial fan site. That policy is not a licence, and the art will be removed promptly if its owner asks.

The images come from the tile set in [AsyncTI4/TI4_map_generator_bot](https://github.com/AsyncTI4/TI4_map_generator_bot) (`src/main/resources/tiles/`), resized and re-encoded as WebP. `public/img/tiles/manifest.json` records the source file for each tile. That repository carries no licence for the artwork. Our permission to use it comes only from the fan policy above.

## Map tile data

`public/data/tiles.json` (planets, resources, influence, tech skips, anomalies, wormholes, hyperlane lanes) was converted from the [TI4 Tabletop Playground mod](https://github.com/darrellanderson/TI4-TTPG-TS) and cross-checked against [AsyncTI4/TI4_map_generator_bot](https://github.com/AsyncTI4/TI4_map_generator_bot). The legendary planet ability text comes from AsyncTI4's planet files. Both projects are released under the [Unlicense](https://unlicense.org/), which covers their code and data but not their art. Sources and checks are in `docs/research/tile-data.md`.

## TI Assistant and Milty draft

Games can link to [TI Assistant](https://ti-assistant.com) and [Milty draft](https://milty.shenanigans.be). When you give the game form a TI Assistant link or data file, it reads that game's seats, factions and final scores through TI Assistant's public pages, via our own server, with a rate limit. Neither project's code is used here. Milty draft's source was read only to confirm the map string format and how its draft links work.

## Fonts

[Saira](https://fonts.google.com/specimen/Saira) by Omnibus-Type and [Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next) by the Braille Institute, both under the [SIL Open Font License 1.1](https://openfontlicense.org/). They are self-hosted in `public/fonts/` so the site works offline.
