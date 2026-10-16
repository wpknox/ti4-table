# M2: Map analyzer

## Goal

The owner doesn't yet have enough games played to know what makes a TI4 map fair. Other tools (TI4 Lab/tidraft.com, Milty Draft) show numbers. This page explains a map **in plain English**, seat by seat, so the group can fix a map before playing on it, and learn what "good" looks like over time.

Paste a map string. The page shows:
1. The map, drawn as hexes, with each seat's area tinted.
2. A short report per seat, for example: *"Seat 3 is strong on resources (11 optimal vs. a table average of 8) but short on influence. No tech skips within two moves. A supernova sits between it and Mecatol Rex, so it's 3 moves out instead of 2."*
3. A one-line verdict for the whole map ("Fair, with one weak seat" / "Lopsided").

## Phases

### 2a: Tile data and map-string parsing (research + data; no UI): DONE

This was built and reviewed on 2026-10-15. Read `docs/research/tile-data.md` before 2b. Two things differ from the shape below:
- A planet's `trait` and `tech` can be **arrays** for some Thunder's Edge planets.
- Tiles have extra fields: `set`, `offMap`, `offMapHome`, `spaceStation`, `fracture`, `active`.

Seats come from the string itself, in this order: P1–P8 markers, then home tiles (Creuss and Crimson gates stand in for off-map homes), then 0s, then TI Assistant's defaults with a warning. `parse.js` exports `parseMapString`, `posToHex`, `hexToPos`, `hexToPixel`, `hexDistance`, `ringOf`, `DIRS`, `rotateLanes` and `HOME_POSITIONS`. Thunder's Edge hyperlanes 119–124 are not in the data, and the parser warns when a map uses them.

Deliverables:
- `docs/research/tile-data.md` covers which sources were checked, each one's **licence**, and what was used. This repo is public and GPL-3.0, so data may only be copied from a source whose licence allows it. If none does, transcribe the facts by hand: the numbers printed on tiles are game facts, but someone's JSON file is their work. Write down the reasoning.
- `public/data/tiles.json` holds every system tile the analyzer needs: base game, Prophecy of Kings, and Thunder's Edge if the data can be confirmed. Shape:

```jsonc
{
  "source": "…where the data came from…",
  "tiles": {
    "19": {
      "type": "blue",            // "home" | "blue" | "red" | "mecatol" | "hyperlane" | "other"
      "faction": null,           // home systems: faction name
      "wormholes": [],           // "alpha" | "beta" | "gamma" | "delta" …
      "anomaly": null,           // "asteroid-field" | "gravity-rift" | "nebula" | "supernova" | combos as array if a tile has two
      "planets": [
        { "name": "Wellon", "resources": 1, "influence": 2, "trait": "industrial", "tech": "yellow", "legendary": false }
      ],
      "hyperlanes": null         // hyperlane tiles: list of connected edge pairs at rotation 0
    }
  }
}
```
  `trait` is `"cultural" | "hazardous" | "industrial" | null`. `tech` is `"red" | "blue" | "green" | "yellow" | null`, using the tech-specialty colours: warfare red, propulsion blue, biotic green, cybernetic yellow.
- `public/js/map/parse.js` turns a map string into `{ tiles: [{ pos, q, r, id, rotation }] }`. It must document the formats it accepts:
  - **TTS / TI Assistant / tidraft strings**: space-separated tile numbers in ring order, starting at the top of ring 1 and going clockwise. Mecatol Rex (18) is implied in the centre unless the string starts with `{18}` or a similar braced override. Find out and record the exact rules, including:
    - where home systems sit for 3, 4, 5, 6, 7 and 8 players
    - what `0` and `-1` mean (empty or placeholder home)
    - hyperlane tile ids with a rotation suffix (`83A2`)
    - whether the string can start with Mecatol's own number
  - Hex coordinates: axial `(q, r)` with pointy-top or flat-top tiles. TI4 tiles are **flat-top**. Pick one and document it.
- A small Node or Playwright check that parses a few known maps, for example a standard 6-player Milty map from tidraft or the TI Assistant docs. It should confirm the tile count, that ring positions are right, and that every id resolves in `tiles.json`.

### 2b: Analysis engine (pure functions, no DOM)

`public/js/map/analyze.js` exports `analyze(parsedMap, tiles) -> report`.

1. **Seats** are the home-system positions. Find them from the string (home tile ids or placeholders) and the player count.
2. **Distance** is the number of moves from a home system, honouring:
   - adjacency and wormholes (alpha↔alpha, beta↔beta)
   - hyperlanes
   - supernovas: impassable
   - asteroid fields: impassable without Antimass Deflectors, so analyse as impassable and mention it
   - nebulas: movement ends there, so count it as reachable but a dead end
   - gravity rifts: +1 move when exiting. Treat as passable at normal cost, note "a gravity rift on this path", and keep it simple.
   Rules text for each anomaly is in `public/data/rules.json` (R_supernova, R_asteroid_field, R_nebula, R_gravity_rift, R_wormholes, R_hyperlanes). Link to those pages from the report.
3. **Slices**: each non-home, non-Mecatol system belongs to the seat it's closest to. Ties are "shared" between those seats, which are contested systems.
4. **Metrics per seat** (slice plus shared systems at half weight):
   - optimal resources and influence, Milty formula: the higher stat counts fully and the other counts as zero; if equal, half to each
   - raw totals
   - planet count
   - tech skips by colour
   - legendary planets
   - wormholes
   - anomalies in the slice
   - moves to Mecatol Rex
   - planets adjacent to home ("turn-one expansion")
   - contested systems with each neighbour
5. **Findings**: compare each seat with the table average. Emit structured findings (`{seat, severity: "good"|"note"|"warn", code, data}`), then turn them into sentences in a separate `describe()` so the wording can be tuned without touching the maths. Thresholds go at the top of the file as named constants, with a comment on why each value was chosen. Start with these (tune after a few real maps):
   - optimal total more than 20% below or above the table mean
   - zero tech skips within 2 moves
   - Mecatol more than 1 move further than the best seat
   - more than 2 anomalies in a slice
   - a wormhole in the slice when other seats have none (note, not warning)
   - legendary planet access
   - fewer than 2 planets adjacent to home

### 2c: The page

Section `/map`: `addSection({ prefix: "/map", label: "Map", render })`. Once a second section exists, the router's nav shows automatically.

- **Input:** a paste box for the map string, plus an "Example map" button that loads a known-good 6-player map. The map lives in the URL (`/map?m=<string>`) so a link shares it. Save the last 5 analysed maps in `store` (localStorage) as a convenience.
- **Map:** inline SVG hexes. Planet resource/influence shown small (yellow number / blue number). Wormhole and anomaly glyphs. Seats tinted. Tap a tile for a popover with its planets, and tap a seat to highlight its slice. It must fit 390px wide. Pinch-zoom isn't needed; the SVG scales.
- **Report:** one block per seat, ordered by seat, each with the 2–4 most important sentences and a "Details" disclosure holding the full metrics table. Use `--resource`/`--influence` for those numbers and `--tech-*` for tech skips.
- **Verdict line** at the top.
- Follow the design system in `CLAUDE.md`. The map is this page's bold element; everything else stays quiet.
- Add new files to `PRECACHE` in `sw.js` and bump `VERSION`.

### Out of scope (later)

- Faction-to-seat suggestions
- Generating maps
- Saving maps to the server (comes with M3)
- Discordant Stars / homebrew tiles, unless the data is trivially available

## Acceptance

- The example map parses, renders at 390px and 1280px in both colour schemes, and gives a sensible report for each seat.
- A deliberately lopsided map (swap two rich systems into one slice) produces a clear warning naming that seat.
- Every planet/tile number on screen matches `tiles.json`. Spot-check 5 tiles against a public tile reference.
- No console errors. Offline works after first load (check in a non-localhost context, or reason about the precache list).
