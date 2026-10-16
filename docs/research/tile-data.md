# Tile data and map strings

Research for M2 phase 2a (`docs/plans/m2-map-analyzer.md`). It covers where `public/data/tiles.json` came from, what each source's licence allows, and the map-string conventions `public/js/map/parse.js` implements.

## Summary

- **Tile facts** were converted from the TI4 Tabletop Playground mod's system data (Unlicense). Faction names came from AsyncTI4 (Unlicense). Every planet was then checked against AsyncTI4's separate planet files, and the TI4 wiki settled any disagreement. Sources without a licence (Milty draft, KeeganW, TI Assistant) were only read for comparison. Nothing was copied from them.
- **Coverage:** base game 1-51, Prophecy of Kings 52-91 (hyperlanes as `83A`…`91B`), and Thunder's Edge 92-118 plus the Fracture tiles 900-906. That is 135 entries. The Thunder's Edge hyperlanes 119-124 are left out (see Gaps).
- **Map strings:** ring order, the Mecatol rules, 0/-1, side letters and rotation were checked against the code of TTPG, Milty draft and TI Assistant. Rotation direction was then confirmed on 57 real hyperlane maps.

## Sources checked

| Source | What it has | Licence (checked in the repo) | Used for |
|---|---|---|---|
| [TI4-TTPG-TS](https://github.com/darrellanderson/TI4-TTPG-TS) (TI4 mod for Tabletop Playground, current) | `src/lib/system-lib/data/system.data.ts`: every system with planets, traits, tech skips, legendary flags, wormholes, anomalies and hyperlane edges per face. `src/lib/map-string-lib/`: the map-string parser, index-to-hex maths, home positions and about 200 premade maps. | `LICENSE`: The Unlicense, with a first line saying it "applies ONLY to the software and tooling, NOT art assets". The GitHub API reports "Other" because of that extra line. | **Copied (converted):** all tile facts. **Fixtures:** map strings in `scripts/check-map.mjs`. **Conventions:** parser and hex code. |
| [TI4-Online/TI4-TTPG](https://github.com/TI4-Online/TI4-TTPG) (the older JavaScript version of the same mod) | Same kinds of data | Same Unlicense text | Licence check only. The TS version is newer and includes Thunder's Edge. |
| [AsyncTI4](https://github.com/AsyncTI4/TI4_map_generator_bot) (Discord bot) | `src/main/resources/systems/*.json`, `planets/*.json`, `data/factions/*.json`, `data/hyperlanes.properties` | `LICENSE`: the same Unlicense text, also excluding art. GitHub API: "NOASSERTION". | **Copied:** faction names for home systems. **Cross-check:** every planet's resources, influence, traits, tech skips and legendary flag; every tile's wormholes, anomalies and blue/red back; hyperlane edges and the rotation direction. The planet files also hold card flavour text, which is FFG's work and was not used. |
| [Milty draft](https://github.com/shenanigans-be/miltydraft) (milty.shenanigans.be) | `data/tiles.json`; `js/generate-map.js` (map templates, the TTS string builder, hex maths) | **No licence:** no `LICENSE` file, and no licence field in `composer.json` or the README. All rights reserved. | Comparison only. Read `generate-map.js` to confirm ring order, coordinates and home slots. Diffed its `tiles.json` against ours. Nothing copied. |
| [KeeganW/ti4](https://github.com/KeeganW/ti4) (map generator) | `src/data/tileData.js` | **No licence:** no `LICENSE` file, and `package.json` has no licence field | Comparison only: a third opinion on hyperlane edges. Nothing copied. |
| [TI Assistant](https://github.com/ti-assistant/ti-assistant) | `src/util/map.ts` (default map strings, Mecatol and home handling) | **No licence** | Read only, to learn how the app the group uses reads map strings. No code or data copied. |
| [TI4 wiki](https://twilight-imperium.fandom.com) (Fandom: "Tiles List", "Planets", faction pages) | Human-curated tile and planet tables | CC BY-SA (Fandom's standard licence) | Tie-breaker for single facts only. Nothing copied. |
| tidraft.com / TI4 Lab | Map tool | No public source found | Not used |

### Licence decision

This repo is GPL-3.0. The Unlicense is a public-domain dedication, and the FSF lists it as GPL-compatible, so converting TTPG's system data and AsyncTI4's faction names is allowed. Neither requires attribution, but `tiles.json`'s `source` field and this document credit both. Their "not art assets" carve-out doesn't matter here because no images were taken. The numbers printed on tiles are game facts (the game itself is Fantasy Flight Games'). Sources with no licence were used only to check facts, which needs no permission. Their files were not copied.

### How tiles.json was made

1. TTPG's `system.data.ts` was read as **data, not executed**: a small literal parser turned its object literal into JSON. The one-off converter maps it to the plan's shape:
   - planets `{name, resources, influence, trait, tech, legendary}`
   - `anomaly` as null, a string, or an array when there are two
   - hyperlane edges become pairs, with 0 N, 1 NE, 2 SE, 3 S, 4 SW, 5 NW
   - home factions come from AsyncTI4
   - `type` is red when the tile has an anomaly or no planets (this matched AsyncTI4's tile backs on every tile)

   The converter isn't checked in. The file is small, rarely changes, and should be edited by hand from now on.
2. Automated diff against AsyncTI4 (all tiles and planets) and Milty (all tiles). After fixes, the only differences left are listed below, each with how it was settled.
3. Automated diff against the wiki's Tiles List, plus a manual read of its Planets and faction pages where the two disagreed.

| Disagreement | Settled as | Why |
|---|---|---|
| 92 (Last Bastion home): TTPG has no anomaly; AsyncTI4 has a nebula | **nebula** | The wiki faction page lists "Ordinian 0/0, Revelation 1/2 (space station), Nebula". |
| 106 Lazul Rex, 109 Bellatrix, 116 Lemox traits: Milty differs | TTPG and AsyncTI4 values (cultural + industrial; cultural; industrial) | Two sources plus the wiki Planets page agree |
| 15 Shalloq, 36 Arnor/Lor, 107 Tiamat: the wiki Tiles List swaps resources and influence | 1/2; 2/1 and 1/2; 1/2 | The wiki's own Planets and Yssaril pages, TTPG, AsyncTI4 and Milty all agree. The Tiles List has typos. |
| 93 planet names: the wiki has "Pei"/"Oet" | "Mez Lo Orz Fei Zsha", "Rep Lo Orz Qet" (TTPG and AsyncTI4) | Two independent code sources agree |
| Name punctuation (TTPG drops it) | `[0.0.0]`, `Tren'Lak`, `Tar'Mann`, `Tequ'ran`, `Qucen'n`, `Sem-Lore`, `El'Nath`, `Hope's End` | Spelled as in AsyncTI4 and the wiki |
| 97 Faunus/Paunus, 108 Kostboth/Kosboth, 33 Resculon/Resulon | TTPG spelling | Milty is the odd one out. The wiki agrees with TTPG. |
| Hyperlanes 83A-91B | All 18 faces match in TTPG, AsyncTI4 and KeeganW | n/a |

## tiles.json fields beyond the plan's shape

The plan's fields are all present for every tile. These extras exist so 2b doesn't have to guess:

- `set`: `"base" | "pok" | "te"`.
- `trait` and `tech` are a string or null, as planned. **A few Thunder's Edge planets have two**, so those are arrays, the same convention the plan uses for anomalies. Examples: 101 Olergodt `["cultural","hazardous"]` with `["red","yellow"]`, and 107 Tiamat with tech `["yellow","yellow"]`.
- `spaceStation: true` on Thunder's Edge space stations (92 Revelation, 109 Tsion Station, 111 Oluz Station, 117 The Watchtower). They have resources and influence, but they aren't planets for planet counts.
- `offMap: true` on 51 (Creuss home), 118 (Crimson Rebellion home) and 82 (Mallice).
- `offMapHome` on the gate tiles that sit in the home slot on the board: 17 → 51 (Creuss, delta wormhole) and 94 → 118 (Crimson Rebellion, epsilon wormhole). Both the gate and the real home have the faction and the wormhole. The parser treats the gate as the seat.
- 82 Mallice: TTPG and AsyncTI4 label its faces A/B in **opposite** ways, so there's one entry for the side it starts on (inactive: gamma wormhole only), with `active: {wormholes: ["alpha","beta","gamma"]}` for the other face. The planet is 0/3 cultural and legendary on both.
- 96 / 96B: The Firmament (Cronos 2/1, Tallin 1/2) and its flipped side, The Obsidian (Cronos Hollow 3/0, Tallin Hollow 3/0).
- 81 (Muaat hero supernova) and 82 are `type: "other"`, because they only reach the board through game effects. The wiki calls 81's back red.
- 900-906 are the Fracture tiles (`type: "other"`, `fracture: true`): 901 Styx (4/0, legendary), 904 Lethe 0/2 and Phlegethon 1/2, 905 Cocytus 3/0, 903 and 906 egress, and 900 and 902 void.
- 112 is Thunder's Edge's Mecatol Rex, with `legendary: true`. 18 is the original, which is not legendary.

## Map-string conventions

These are implemented and documented in the header of `public/js/map/parse.js`.

**Ring order.** Token N goes at position N. Position 0 is the centre. Ring k holds positions 3k(k-1)+1 … 3k(k+1): ring 1 is 1-6, ring 2 is 7-18, ring 3 is 19-36, and ring 4 is 37-60. Each ring starts at the tile **directly north** of the centre and runs **clockwise**.
- TTPG `map-string-parser.ts`: "the first map string entry is above it and winding clockwise. Once back to the 'north' line bump out to the next ring". Its `map-string-hex.ts` has `_firstIndexInRing` = 1 + 3k(k-1).
- Milty `generate-map.js`: `axial_ring` starts at `direction(4) * radius` = (0, -radius) and steps through directions `[1,0], [0,1], [-1,1], [-1,0], [0,-1], [1,-1]`. That is the same walk with the same coordinates.

**Coordinates.** Axial (q, r), **flat-top**, as on redblobgames.com. Milty's code says "Axial Coordinates and flat-topped hexes", and its `hex_to_pixel` is x = 1.5q, y = √3(r + q/2) with y pointing down. Neighbour directions are N (0,-1), NE (+1,-1), SE (+1,0), S (0,+1), SW (-1,+1) and NW (-1,0). Their indices are also the hyperlane edge numbers. Position 19 is (0,-3), 22 is (3,-3), and 25 is (3,0). That matches Milty's 6-player home coordinates.

**Mecatol.**
- A plain string starts at position 1, and the centre is assumed to be 18 (TTPG's parser and Milty's TTS string).
- `{X}` braces around the first token put X in the centre (TTPG). Real maps use `{42}`, `{87A4}`, `{-1}` and `{0}` for odd centres.
- TI Assistant writes the centre as a leading `18 ` or `112 ` with no braces (`getDefaultMapString`, `maybeAddMecatol`). The parser follows it: a first token of 18 or 112 is the centre. TTPG would put that tile north of the centre instead, but none of its ~200 premade maps does.
- TTPG-TS now defaults the centre to 112 (Thunder's Edge Mecatol). The parser defaults to 18. The two differ only in the legendary ability, so 2b can treat them the same.

**Tokens.**
- `<number><side><rotation>`, regex `^(-?\d+)([AB]?)([0-5]?)$`, the same as TTPG's `_entryRegExp`.
- A rotation needs a side letter (TTPG's parser test: `1A5` is tile 1, side a, rotation 5).
- TI Assistant also writes `85A` with the rotation left out, meaning 0.
- Side B means the tile is flipped (TTPG rolls it 180°).
- Spaces and commas both separate tokens. One TTPG premade map is comma-separated.

**Rotation.** Rotation counts 60° steps **clockwise**, so edge e at rotation 0 faces (e + rotation) % 6.
- TTPG sets yaw = rot × 60.
- AsyncTI4's `hyperlanes.properties` lists `85a60` as `85a` with every edge +1 (all 18 faces agree).
- Empirically: the test used 56 TTPG premade maps with hyperlanes, plus TI Assistant's 4-player "warp" layout. With clockwise rotation, 1075 of 1094 lane ends meet a matching lane or a tile. Counter-clockwise gives only 959. The 19 misses are all in five custom maps, mostly lanes that run off the board edge on purpose. The official Learn to Play layouts meet perfectly.

**`0` and `-1`.**
- `-1` is no tile: a hole, or a position outside the map. TTPG skips tiles ≤ 0, and TI Assistant rejects values below -1.
- `0` is an open slot, but it means different things in different tools:
  - TTPG: tile 0 is the "home system placeholder" in `system.data.ts`.
  - Milty: `0` is written for a home whose faction isn't picked yet (`EMPTY` becomes 0).
  - TI Assistant: `0` is a generic empty slot. All the 0s count as homes when their number equals the player count (`makeHomeSystemsExplicit`).
- The parser counts 0s as homes when nothing else marks homes, or when they fill exactly the missing seats.

**Seat markers.** TI Assistant writes `P1`…`P8` for explicit seats (`isHomeSystem`). The parser numbers seats by these when they're present. Otherwise it numbers them clockwise from north, by angle around the centre. For every layout below, that gives the same order as Milty's player numbering and TI Assistant's P numbering.

**Home positions per player count.** These are map positions, in each tool's seat order. They differ between tools, so the parser trusts the string, and the table is only a fallback.

| Players | TI Assistant default ("standard") | Milty draft templates | TTPG empty-table placeholders |
|---|---|---|---|
| 3 | 22 28 34 | 19 25 31 | 28 34 22 |
| 4 | 23 27 32 36 | 19 22 28 31 | 25 31 34 22 |
| 5 | 21 25 28 31 35 | 19 22 25 31 34 | 25 28 31 34 22 |
| 6 | 19 22 25 28 31 34 | 19 22 25 28 31 34 | 25 28 31 34 19 22 |
| 7 | 37 40 43 46 52 55 58 | 37 22 25 49 52 55 58 | 25 49 52 55 58 37 22 |
| 8 | 37 40 43 46 49 52 55 58 | 37 40 43 46 49 52 55 58 | 46 49 52 55 58 37 40 43 |

How each column was found:
- **TI Assistant:** read from `getDefaultMapString`. It also has "skinny", "warp" and "large" styles, with hyperlanes or a ring 4.
- **Milty:** converted from the axial coordinates of the `n-H` entries in `MAP_3`…`MAP_8`.
- **TTPG:** converted from the cube hexes in `map-home-system-locations.ts`. TTPG's own premade maps put their 0s elsewhere. For example, its 5-player Learn to Play map uses 19 22 25 31 34, the same as Milty.

6 and 8 players agree everywhere. For other counts, the 0s and home tiles in the string decide.

## Example maps used by `scripts/check-map.mjs`

All come from TTPG-TS `src/lib/map-string-lib/data/premade-maps-*.data.ts` (Unlicense):

- "Learn to Play [6p Base]": the base-game 6-player layout
- "SCPT 2021 Final [6p PoK]": a tournament map, as a Milty-style string with 0 homes
- "Learn to Play [5p PoK]": A-side hyperlanes with rotations
- "Learn to Play [8p PoK]": ring 4, B-side hyperlanes and `-1` holes
- "SCPT KC Intergalactical 1/3 (TE)": a Thunder's Edge tournament map

Two variants are derived from the SCPT 2021 Final map:
- TI Assistant form: a leading `18`, with the 0s replaced by home tiles, including the Creuss gate 17 and the Crimson Rebellion gate 94
- `{18}` with `P6`…`P1` markers, to check that seat numbering follows the markers

## Gaps

- **Thunder's Edge hyperlanes 119-124.** The wiki lists them as hyperlane tiles but gives no lanes. Only TTPG has lane data, and AsyncTI4 and Milty don't have the tiles at all. They are left out until a second source confirms them. The parser warns "isn't in the tile list" for any map that uses them.
- **Fracture tile numbers.** 900-906 is TTPG's numbering (AsyncTI4 calls them `fracture1`-`7`). The planet values agree between the two. AsyncTI4 gives the Fracture planets a non-standard planet type ("LIGHTNING"), which is stored as `trait: null` here. The rules for the Fracture (how it connects to the map) are 2b's problem.
- **96B (The Obsidian).** It's unconfirmed whether map strings actually write `96B` for the flipped side. AsyncTI4 uses its own ids, 96a and 96b.
- **Not included:** Council Keleres home tiles (no shared numbering), Codex tile 1800 (Ordinian scenario), Discordant Stars (4200+) and homebrew ids (e.g. 1011). The parser keeps their positions and warns.
- **Printed-tile check.** No physical tiles or official tile PDF were checked. Agreement between TTPG and AsyncTI4, with the wiki as tie-breaker, is the evidence. The plan's acceptance step (spot-check 5 tiles against a public reference) still applies in 2c.
