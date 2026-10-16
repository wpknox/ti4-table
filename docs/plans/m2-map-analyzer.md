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

_Tightened 2026-10-15 into a build spec. Every number in the fixtures below was hand-checked by the orchestrator._

**Files to create or touch**
- `public/js/map/analyze.js` (new): `analyze()`, `describe()`, the thresholds, and the movement graph. No DOM and no `fetch`, so Node can import it. Import geometry from `./parse.js` (`DIRS`, `hexDistance`, `rotateLanes`). Don't duplicate it.
- `scripts/fixtures/maps.mjs` (new): export the `MAPS` array and `fillZeros()` currently inside `scripts/check-map.mjs`, plus the synthetic fixtures below. Change `check-map.mjs` to import them. Its output and pass/fail must not change.
- `scripts/check-analysis.mjs` (new): the acceptance script. Run it with `node scripts/check-analysis.mjs`. Exit 1 on any failure. Use the same `check(ok, msg)` style as `check-map.mjs`.
- Don't touch `parse.js`, `tiles.json`, the UI, `sw.js` or the rules code. If `parse.js` looks wrong, stop and report it instead of changing it.

**Input.** `analyze(parsed, tiles)`, where `parsed` is the return value of `parseMapString(str, { data: tiles })` and `tiles` is the `tiles` object from `tiles.json`. Seats are `parsed.homes` (positions, in seat order, so seat N is `parsed.homes[N-1]`).

#### Movement graph

Nodes are the board's **systems**: every entry in `parsed.tiles` except hyperlane tiles (`tiles[id].type === "hyperlane"`). Open slots (`id === "0"`) are systems with no planets. Two systems are adjacent if:
1. **Neighbouring hexes:** their hexes are neighbours (one `DIRS` step apart) and both exist.
2. **Wormholes:** they share a wormhole type (any string in `wormholes`: alpha, beta, gamma, delta, epsilon). Only on-map tiles count. Mallice and off-map homes aren't in the string, so ignore them.
3. **Hyperlanes:** a hyperlane tile at hex H, placed at `rotation`, has edge pairs `rotateLanes(tiles[id].hyperlanes, rotation)`. For each pair `[a, b]`, the system one step from H in direction `a` is adjacent to the system one step from H in direction `b`. If an end leads off the map or onto another hyperlane, follow the lane through that hyperlane: enter it from edge `(e + 3) % 6`, take its pair that contains that edge, and continue. Stop after 6 hops to avoid loops. Being adjacent through a hyperlane costs 1 move, like any adjacency. The hyperlane hex itself is never a node.

**Distance** from a seat is the number of moves, found by breadth-first search from the home system (distance 0) over that graph, with these anomaly rules:
- `supernova` and `asteroid-field`: can't be entered or passed through. They still get a distance, for slicing only: 1 + the smallest distance among their reachable neighbours. They never expand the search.
- `nebula`: can be entered but not passed through. It gets a distance and doesn't expand the search.
- `gravity-rift`: passable at normal cost (keep it simple; the real rule gives +1 move on exit).
- If `anomaly` is an array, apply the strictest rule (supernova/asteroid > nebula > rift).
- Other seats' home systems and Mecatol Rex are passable.
- Unreachable systems are left out of the seat's `distance` map.

#### Slices

Slice-able systems are every system except Mecatol (`type === "mecatol"`), seat homes (positions in `parsed.homes`), any other `type === "home"` tile, open slots (`id === "0"`), and hyperlanes. Each one goes to the seat(s) at the smallest distance. With k tied seats, each gets it at weight 1/k ("shared"). If no seat can reach it, it goes in `table.unassigned`.

**Conservation (checked):** the sum over seats of `own.length + Σ shared[].weight`, plus `table.unassigned.length`, equals the number of slice-able systems.

#### Metrics per seat (weighted: own at 1, shared at 1/k)

- `optimal.resources`, `optimal.influence`, `optimal.total`: Milty's formula per planet. The higher of R/I counts fully and the other counts 0. If they're equal, each counts half (a 2/2 gives 1 R and 1 I).
- `raw.resources`, `raw.influence`.
- `planets`: a weighted planet count. Space stations (`spaceStation: true`) count toward R/I but not here.
- `skips`: `{red, blue, green, yellow}`, weighted. A planet whose `tech` is an array counts each entry (Tiamat is 2 yellow).
- `skipsNear`: an unweighted count of tech-skip planets in **any** system at distance ≤ 2 from this seat's home, whoever's slice it is.
- `legendary`: names of legendary planets in own/shared systems.
- `wormholes`: wormhole types in own/shared systems (deduplicated).
- `anomalies`: weighted count of anomaly systems in own/shared, as `{ "supernova": 1, … }` (array anomalies count once per type).
- `mecatol`: distance to Mecatol Rex, or `null` if unreachable.
- `adjacentPlanets`: an unweighted count of planets in systems at distance exactly 1.
- `contested`: `{ [otherSeat]: weighted count of systems shared with that seat }`.

#### Report shape

```js
analyze(parsed, tiles) → {
  seats: [{
    seat: 1, pos: 19, homeId: "0", faction: null,   // faction from tiles[homeId].faction when it's a home tile
    distance: { "0": 3, "1": 2, … },                // pos → moves, reachable systems only
    own: [1, 7, 20, 36],                            // positions, ascending
    shared: [{ pos: 8, weight: 0.5, with: [2] }],   // with = the other seats in the tie
    metrics: { optimal: {resources, influence, total}, raw: {resources, influence}, planets,
               skips: {red, blue, green, yellow}, skipsNear, legendary: [], wormholes: [],
               anomalies: {}, mecatol, adjacentPlanets, contested: {} },
  }],
  table: { mean: { optimalTotal, optimalResources, optimalInfluence, planets }, bestMecatol, unassigned: [] },
  findings: [{ seat: 4, severity: "warn", code: "optimal-low", data: { value: 5, mean: 9 } }],
  verdict: { code: "lopsided", seats: [1, 4] },     // seats = the seats that have a warn
  warnings: [],                                     // parsed.warnings plus analysis caveats
}
```

#### Findings

Thresholds are named constants at the top of `analyze.js`, each with a one-line "why". Codes and severities are fixed because the check script tests them:

| Code | Severity | Fires when |
|---|---|---|
| `optimal-low` / `optimal-high` | warn | `optimal.total` is more than `OPTIMAL_BAND = 0.2` (20%) below or above the table mean |
| `resources-low` / `influence-low` | note | that optimal stat is under `SPLIT_LOW = 0.7` × its table mean, and the seat has no `optimal-*` warn |
| `no-skips-near` | warn | `skipsNear === 0` |
| `mecatol-far` | note at 1 move more than `bestMecatol`; warn at ≥ `MECATOL_WARN = 2` more | also a warn when `mecatol` is `null` |
| `many-anomalies` | note | weighted anomaly count > `MAX_ANOMALIES = 2` |
| `wormhole` | note | the seat has a wormhole in own/shared, and at least half the other seats have none |
| `legendary` | good | the seat has a legendary planet in own/shared |
| `few-adjacent` | warn | `adjacentPlanets < MIN_ADJACENT = 2` |

**Verdict:**
- `fair`: no seat has a warn.
- `one-weak`: exactly one seat has warns, and none of them is `optimal-high`.
- `one-strong`: exactly one seat has warns, and they include `optimal-high`.
- `lopsided`: two or more seats have warns.

#### Wording

`describe(report) → { verdict: string, seats: [{ seat, title, lines: [{ text, severity, rule? }] }] }`.
- `title` is "Seat 1" or "Seat 1: The Federation of Sol".
- Each finding becomes one plain-English sentence with real numbers, rounded to at most one decimal and with no trailing ".0". Example: "Strong on resources and influence: 17 optimal, against a table average of 9."
- `rule` is a rules page id to link to when the finding is about an anomaly or wormhole (`R_supernova`, `R_asteroid_field`, `R_nebula`, `R_gravity_rift`, `R_wormholes`, `R_hyperlanes`). Check that each id exists in `public/data/rules.json` before using it.
- Lines are ordered warn, note, good. Every seat gets at least one line; with no findings, say what's solid, e.g. "Close to the table average on everything."
- The verdict text, for example: "Fair." / "Fair, with one weak seat (seat 4)." / "Fair, with one strong seat (seat 1)." / "Lopsided: seats 1 and 4 stand out."
- Sentence case, no all-caps, no jargon beyond what TI4 players use (R/I, tech skip, slice, Mecatol).

#### Fixtures and expected results (put these in `scripts/fixtures/maps.mjs`)

**SYM**, a 6-player map that's identical under 60° rotation (36 tokens, Mecatol implied). Ring 1 is all tile 20. Ring 2 corners (odd positions 7–17) are 23, and ring 2 edges (even 8–18) are 22. In ring 3, corners (19, 22, …, 34) are `0` homes, the tile after each corner (20, 23, …, 35) is 19, and the tile before the next corner (21, 24, …, 36) is 21:
```
20 20 20 20 20 20 23 22 23 22 23 22 23 22 23 22 23 22 0 19 21 0 19 21 0 19 21 0 19 21 0 19 21 0 19 21
```
The parser warns about duplicate tiles. That's expected for every synthetic fixture.

Expected for SYM:
- homes `[19, 22, 25, 28, 31, 34]`
- seat 1: own `[1, 7, 20, 36]`; shared 8 (with 2) and 18 (with 6), at 0.5 each
- seat 1: optimal R 3, I 5, total 8; raw R 7, I 8; planets 5; skips yellow 1, blue 1, green 1, red 0; mecatol 3; adjacentPlanets 3
- every seat has the same metrics as seat 1 (compare every number)
- no `warn` findings, verdict `fair`

**LOP**, which is SYM with position 20 → 35, 36 → 69, 27 → 46, 29 → 47. Seat 1 gets two rich systems and seat 4 (home 28) loses both of its own.
- optimal totals: seat 1 17, seat 4 5, seats 2/3/5/6 8; table mean 9
- seat 1: `optimal-high` warn
- seat 4: `optimal-low` warn and `few-adjacent` warn (adjacentPlanets 1)
- seats 2, 3, 5, 6: no warn
- verdict `lopsided` with seats `[1, 4]`
- `describe()`: a line containing "17" and "9" for seat 1, and the verdict text mentions seats 1 and 4

**SUPERNOVA**: SYM with position 7 → 43 (supernova north of seat 1).
- seat 1 mecatol 4; every other seat 3
- seat 1 distance to position 7 is 1 (slicing distance), and position 7 doesn't expand
- position 1 is shared three ways between seats 1, 2 and 6, at weight 1/3 each (all three are 3 moves away)
- seat 1 has `mecatol-far` as a note, not a warn

**NEBULA**: SYM with position 7 → 42. Seat 1 distance to position 7 is 1, and mecatol is 4.

**ASTEROID**: SYM with position 7 → 44. Seat 1 mecatol is 4.

**RIFT**: SYM with position 7 → 41. Seat 1 mecatol is 3 (passable).

**WORMHOLE**: SYM with position 20 → 26 (Lodor, alpha) and position 29 → 39 (empty alpha).
- seat 1 distance to position 29 is 2; seat 4 distance to position 20 is 2
- position 20 stays seat 1's own, and position 29 stays seat 4's own

**Real maps:** every map in the existing `MAPS` list. For each one, check:
- `analyze()` doesn't throw, and there's one entry per home
- conservation holds
- no hyperlane position appears in any seat's `distance`, `own` or `shared`
- every seat's `mecatol` is a number
- `describe()` gives every seat at least one line
- print each map's verdict and each seat's optimal total and lines, so the orchestrator can read them for sense

#### Acceptance

- `node scripts/check-analysis.mjs` passes every check above and prints "All checks passed".
- `node scripts/check-map.mjs` still passes, with the same output as before.
- No new dependencies, and nothing outside the files listed above changes.
- Report back with: the output of both scripts, the thresholds you chose if any differ from the above (they shouldn't), and anything in the real-map reports that looks wrong to you.

**Out of scope for 2b:** UI, rendering, URL state, faction-specific logic (Creuss/Crimson off-map homes beyond what the parser gives), Antimass Deflectors/Gravity Drive variants, Thunder's Edge hyperlanes 119–124.

### 2c: The page

_2026-10-15: `docs/design.md` ("Map page (M2c)" and "Tokens") is the visual spec. It overrides this section where they differ. In particular:_
- _Seats are **numbered, not coloured**._
- _The selected seat's slice gets `--hull-2` fill and a `--star` outline. Shared systems are hatched._
- _Findings use hex markers: warn is filled `--warn`, note is outlined `--dust`, good is outlined `--resource`._
- _The verdict sentence is the page title._
- _Anomaly glyphs are drawn line icons. Wormholes are Greek letters._
- _A home hex shows the seat number, and the faction name goes in text. Official faction symbols were approved later (see `docs/design.md`, "Faction symbols and space imagery") and are added in a follow-up pass._

**Build notes (added 2026-10-15):**
- **Files:**
  - `public/js/map/view.js`: render and events
  - `public/js/map/svg.js`: map drawing, as a pure string builder so a check script can render it in Node
  - `public/css/map.css`, linked in `index.html`
  - register the section in `app.js`
  - add every new file to `PRECACHE` and bump `VERSION` in `sw.js`

  Load `tiles.json` with `fetch` once and cache it in the module.
- **Data flow:** `parseMapString(str, { data: tiles })` → `analyze(parsed, tiles)` → `describe(report)`. Don't re-implement any maths in the view. Show parser `warnings` as a quiet, collapsed list under the input ("3 notes about this map string").
- **URL state:** `/map?m=<string>&seat=<n>`, with `seat` optional. Back/forward restores both. Use the router's `setUrl` for seat changes, so every tap doesn't add a history entry.
- **Example map:** `SCPT_2021_FINAL` from `scripts/fixtures/maps.mjs`. Copy the string; the site can't import from `scripts/`.
- **Rule links:** report lines with `line.rule` link to `/rules/<id>`.
- **Accessibility:**
  - Each hex is a `<g>` with an `aria-label`, e.g. "Seat 3 home" or "Lodor, 3 resources 1 influence, alpha wormhole".
  - Seats can also be selected by tapping a seat block in the report, and with the keyboard.
  - The SVG has a `<title>`.
- **Check:** a new `node scripts/check-map-svg.mjs` renders the SVG for every map in `MAPS` and checks that:
  - it's well-formed (balanced tags)
  - there's one hex per tile
  - there's one seat numeral per home
  - no attribute contains `NaN`

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
