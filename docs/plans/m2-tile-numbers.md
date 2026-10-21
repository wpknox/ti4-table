# Plan: tile numbers on the map

## Goal

On game day the group builds the physical map from the Map page. Add a **Tile numbers** switch that writes each tile's number on its hex. It works in both views (Analysis and Tile art), and the URL keeps it, so a shared link opens with numbers showing.

## Files to touch

- `public/js/map/svg.js`: new option `tileIds` (boolean, default `false`) for `renderMapSvg`. If it's `false`, the output must be byte-for-byte unchanged (`scripts/check-map-svg.mjs` depends on this).
- `public/js/map/view.js`: the switch, the URL parameter and the remembered default.
- `public/css/map.css`: label styles, plus light-theme values if new colours are needed (use the existing tokens; don't add new ones unless you have to).
- `scripts/check-map-svg.mjs`: add checks (below).
- `scripts/check-ui.mjs`: add checks (below).
- `public/sw.js`: bump `VERSION` (cached JS/CSS changed).

## Behaviour

- **URL:** `&ids=1` turns numbers on. If it's absent, they're off. As with `view`, the URL alone decides what's shown. `store` key `mapIds` (`"1"`/`"0"`) only sets the default for links to *new* maps (the form submit and the example link), the same way `mapView` works today. Extend the local `mapHref(m, seat, view)` in `view.js` to `mapHref(m, seat, view, ids)` and pass `ids` through **every** call (`select()`'s `setUrl`, the view toggle, the form submit, the example link, and anything else that builds a map URL). The view toggle keeps the current `ids`, and the ids switch keeps the current `view` and `seat`.
- **Control:** one `<button type="button" class="ids-toggle" aria-pressed="true|false">Tile numbers</button>`, next to the existing `.view-toggle` group (same row on desktop; it can wrap on a phone). Clicking it calls `navigate(...)` (a real history entry, like the view toggle) and saves `mapIds`. Style it like the toggle buttons (Saira, quiet). Pressed state uses `--influence`. Touch target ≥44px tall. Sentence case, no all-caps.
- **What's labelled:** every tile in `parsed.tiles` except:
  - id `"0"` (open slots and home placeholders)
  - home positions (`seatAt.has(t.pos)`), because the seat numeral is already there
  - Show the id as `parse.js` gives it, including the `A`/`B` face on hyperlanes (e.g. `83A`), because the face matters when you place the physical tile. Mecatol (18) gets labelled too.
- **Analysis view:** a small label at the **top** of the hex, inside the edge: `<text class="tile-id" x="0" y="-12.6">83A</text>`, about 5.5–6px Saira at `font-stretch: 110%`, `fill: var(--dust)` or `var(--star)` at reduced opacity. Put a small rounded `rect class="id-scrim"` behind it if contrast needs it.
  - Check by screenshot that it doesn't collide with the top planet of a 3-planet system (e.g. tile 69 or 70) or with the wormhole/anomaly marks. If it does, it may move to the bottom (`y≈13`), or the planets may shift down a bit, but **only when `tileIds` is on**.
- **Tile art view:** the art has no other text, so the number can be bigger and easier to read across a table: about 9px, centred (`y=0`), on a dark pill scrim (`rect class="id-scrim"`, `fill: rgb(0 0 0 / .65)`, rx 2). The text is `#fff` or `var(--star)`. It must stay readable in the light colour scheme (the art is the same in both themes, so a dark scrim with light text in both is fine).
- **Slices still work:** the labels are `pointer-events: none`, and tapping a hex still selects the seat. With a seat selected, the labels outside the slice dim along with their hexes (follow the existing `.has-sel` / `.sel` dimming; check it).
- **Accessibility:** the hex `aria-label` already starts "Tile N: …", so the labels get `aria-hidden="true"`. The button's `aria-pressed` reflects the state.
- **Order of markup:** the label goes just before the `edge` polygon of its hex group, so it draws over the planets/art but under the edge. In art view, `artWithMark` splices the TE mark in before the edge; insert the label the same way.

## Acceptance checks

1. `node scripts/check-map-svg.mjs` passes, plus new checks:
   - With `tileIds` absent or false, the output is identical to before (compare against a render with the option omitted).
   - With `tileIds: true` on the SCPT example (`EXAMPLE` in `view.js`): the number of `text.tile-id` elements equals the non-`0`, non-home tiles. It includes Mecatol `18`, and there's no `tile-id` inside any `g.home`.
   - It renders in both `view: "analysis"` and `view: "art"`.
   - A hyperlane map (any fixture in `scripts/fixtures/maps.mjs` with hyperlanes) shows the `A`/`B` suffix.
2. `npm run check:ui` passes, plus new checks:
   - `&ids=1` renders `text.tile-id`, and without it there are none.
   - Clicking "Tile numbers" adds `ids=1` to the URL and labels appear; switching to Tile art keeps `ids=1`; Back removes it again.
   - No horizontal scroll at 390px with the button showing.
3. `node scripts/check-map.mjs` and `node scripts/check-analysis.mjs` still pass.
4. Screenshots (Playwright against `node scripts/serve.mjs`, saved under `.playwright-mcp/`) at 390×844 and 1280×800, dark and light, Analysis and Tile art, with numbers on. Use the SCPT example and one 8-player or hyperlane fixture. List the file names in your report.

## Out of scope

- The small map on the game page (`games/view.js` `drawGameMap`). It links to the Map page.
- Changing the default view, the analysis text or the caption.
- Printing.

## Conventions

Read `CLAUDE.md` first (design system, invariants, conventions). Vanilla ES modules, section banners, short "why" comments, match the surrounding style. Don't commit; the orchestrator reviews and commits.
