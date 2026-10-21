# Plan: Thunder's Edge placement in the map analyzer

## Goal

Thunder's Edge (a legendary planet, 5 resources 1 influence, ability "Jupiter Brain") isn't on the board at setup. Whoever claims the sixth expedition slice places it mid-game. It goes in a system that **has no planet, no supernova and no printed wormhole, and isn't in the Fracture** (rules page `R_expedition`). That player will usually put it near themselves, so a seat with no eligible system close to home is at a disadvantage.

The Map page should:

1. per seat, say how close the nearest eligible system is, and flag a seat that is clearly further than the rest
2. for the table, mark the **fairest spots** on the map: eligible systems that are about equally far from every home

Both are quiet extras. They must **never change the verdict** (Fair / one weak / lopsided), because Thunder's Edge may never come into play.

## Files to touch

- `public/js/map/analyze.js`: eligibility, per-seat metrics, table spots, findings, wording
- `public/js/map/svg.js`: optional dashed marker on the fairest spots
- `public/js/map/view.js`: pass the option, one line under the map, two rows in Details
- `public/css/map.css`: marker style (both themes come from tokens)
- `scripts/check-analysis.mjs`: new checks
- `scripts/check-map-svg.mjs`: one new check

Don't touch `tiles.json`, `parse.js`, the games code or `sw.js` (no new files, so no precache change).

## Analysis (`analyze.js`)

### Eligibility

Add a constant near the thresholds:

```js
// Thunder's Edge spots within this many moves of a home count as "near".
export const TE_NEAR = 2;
```

A system `t` (from `graph.systems`, so hyperlanes are already excluded) is **eligible** when all hold, with `info = graph.info(t)`:

- `t.id !== "0"` (an open slot, not a system)
- `info.type` is not `"home"` and not `"mecatol"`, and `t.pos` is not in `parsed.homes`
- every entry in `info.planets` is a space station (`p.spaceStation`), or there are none. A space station isn't a planet for placement (owner, 2026-10-18)
- `!arr(info.anomaly).includes("supernova")`
- `arr(info.wormholes).length === 0`
- `!info.fracture`

Write it as a small function `teEligible(t, graph, homeSet)`.

### Per-seat metrics

In `seatMetrics` / `addDistanceMetrics`, add to `m`:

```js
thundersEdge: { nearest: 2 | null,   // fewest moves from this home to any eligible system; null if none reachable
                near: 3 }            // eligible systems within TE_NEAR moves (unweighted, whoever's slice)
```

Use the seat's existing `dist` map. Pass the set of eligible positions in (compute it once in `analyze`).

### Table spots

In `analyze`, after `dists` exist, compute for each eligible position `p` that **every** seat can reach (`dists[i].has(p)` for all i):

- `ds = dists.map(d => d.get(p))`, `spread = max(ds) - min(ds)`, `far = max(ds)`

Sort by `spread`, then `far`, then `pos` (all ascending). The **fairest spots** are those with the minimum `spread`, and of those the minimum `far`, capped at 3 (lowest `pos` first). Add to the report:

```js
report.thundersEdge = {
  eligible: [pos, ...],                       // sorted ascending
  spots: [{ pos, min, max }, ...],            // 0..3 entries, min/max = closest and farthest home in moves
}
```

`spots` is empty when no eligible system is reachable by every seat. `analyze` returns it alongside `seats`, `table` and so on.

### Findings (severity `note` only, never `warn`)

In `findSeatFindings`, with `best` = the smallest non-null `nearest` across seats:

- `te-far`: the seat's `nearest` is `null` while `best` isn't, or `nearest - best >= 2`. Data `{ value: nearest, best }`.

Don't add a finding when every seat's `nearest` is null; instead push the warning text `"No system on this map can take Thunder's Edge."` onto `warnings` in `analyze` when `eligible` is empty.

Notes are already excluded from the verdict (only `warn` counts). Keep it that way. Add a check.

### Wording (`sentence`)

```
te-far, value null:  "No system Thunder's Edge can be placed in is reachable from here."
te-far:              "The nearest system Thunder's Edge could land in is {value} moves away, against {best} for the closest seat."
```

Use `plural` for "move"/"moves". Both return `rule: "R_expedition"`. Use sentence case and plain words, matching the other lines.

## Drawing (`svg.js`)

- Add an option `teSpots` (array of positions, default `[]`) to `renderMapSvg`. Document it in the JSDoc like the others. Pass it through `ctx` to `cellMarkup`.
- For a cell whose `t.pos` is in `teSpots`, push `<polygon class="te-spot" points="${hexPoints(R * GAP * 0.72)}"/>` **just before** the `.edge` polygon, in the analysis branch. Do the same in the art branch: put it before the closing `</g>` that `artTile` returns, so insert it at the right index.
- Append `", fair spot for Thunder's Edge"` to that cell's label (`data-label` and `aria-label`). Do it in `cellMarkup`, after `tileLabel`.
- Without the option the output must be byte-identical to today (the game page and plan form don't pass it).

## Page (`view.js`)

- In `renderMap`, pass `teSpots: report.thundersEdge.spots.map((s) => s.pos)` to `renderMapSvg`. Only this call; leave `load.js` alone.
- Under the map, after `#tile-note`, add one paragraph `<p class="te-note">…</p>`:
  - spots found: `Thunder's Edge: the fairest places for it are outlined on the map, {min} to {max} moves from every home.` Use the smallest `min` and largest `max` over the spots. If they're equal, say `{n} moves from every home.`
  - no spots: `Thunder's Edge: no empty system is the same distance from every home.` (and say nothing more)
  - Escape every interpolated value with `esc`.
- In `metricsTable` add two rows after "Legendary planets":
  - `Nearest Thunder's Edge spot`: `N moves`, or `None reachable`
  - `Thunder's Edge spots within 2 moves`: the count (use `TE_NEAR` imported from analyze.js in the label, not a literal 2)

## Style (`map.css`)

```css
.mapsvg .te-spot { fill: none; stroke: var(--resource); stroke-width: 0.9; stroke-dasharray: 2.2 2; pointer-events: none; }
.mapsvg.art .te-spot { stroke: #f4c542; stroke-width: 1.4; } /* art is dark in both themes */
.te-note { margin: 4px 0 0; color: var(--dust); font-size: var(--t-s); }
```

`--resource` already has a light-theme value. Follow the CLAUDE.md design floor: no new colors, sentence case, no all-caps.

## Acceptance checks

`scripts/check-analysis.mjs` (use the existing `run`, `eq`, `check` helpers and the fixtures in `scripts/fixtures/maps.mjs`):

1. On every map in `MAPS` and on `SYM`, every position in `report.thundersEdge.eligible` passes the eligibility rules (re-check them in the test against `tiles`), and no eligible position is a home, Mecatol or `"0"`.
2. `SUPERNOVA` (`SYM` with tile 43 at position 7): position 7 is not eligible. `WORMHOLE` (`SYM` with 26 at 20 and 39 at 29): 20 and 29 are not eligible.
3. On `SYM`, every spot has `max - min` equal to the minimum spread over all eligible positions reachable by every seat. Compute that minimum independently in the test from `report.seats[i].distance`.
4. On `SYM`, all seats get the same `thundersEdge.nearest` (it's symmetric), so there are no `te-far` findings.
5. Build a fixture where one seat has no eligible system within 3 moves and the others have one at 1. Use `swap` on `SYM` to fill that seat's empty systems with planet tiles. Write a hand-checked comment explaining the layout. That seat gets `te-far` as a `note`, and `report.verdict` is the same as without the `te-far` finding (i.e. it never adds a `warn`).
6. `describe()` text for `te-far` reads as specified, and its `rule` is in `RULE_IDS`.

`scripts/check-map-svg.mjs`:

7. With `teSpots: [p]`, the output contains exactly one `class="te-spot"` and that cell's `data-label` ends with ", fair spot for Thunder's Edge". Without the option the output is identical to a render with `teSpots: []`.

Then all of these must pass: `node scripts/check-analysis.mjs`, `node scripts/check-map-svg.mjs`, `node scripts/check-map.mjs`, and `npm run check:ui` (with `PLAYWRIGHT_CORE` set as CLAUDE.md says).

## Out of scope

- Thunder's Edge's own planet values or ability tip (it isn't a tile in `tiles.json`).
- Detecting whether Thunder's Edge is in play. The analysis always shows; the wording "could land" covers it.
- Fracture ingress points.
- Any change to the verdict, thresholds or other findings.
