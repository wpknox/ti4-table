# Plan: split the two big UI files and share game validation

## Goal

Behavior stays exactly the same. The code gets easier for people and smaller models to change, before the backfill work (`docs/plans/m3-backfill.md`) adds to the games form.

1. `public/js/games/form.js` (668 lines) becomes three modules.
2. `public/js/rules/view.js` (686 lines) becomes four modules.
3. Game validation rules (limits, formats, messages) live in **one** pure module, used by both the server and the form.

## Ground rules

- **No behavior or markup changes.** Same HTML, the same class names and ids, the same messages word for word, the same URLs. If you find a bug, write it down and leave it alone.
- Move code, don't rewrite it. Keep the existing comments with the code they describe. New files open with a one- or two-line comment saying what they hold, and use section banners (`// ── Name ───`), as the existing files do.
- Imports are relative ES modules with `.js` extensions. There is no bundler for the browser. `functions/` is bundled by wrangler (esbuild), so `server/*.js` **can** import from `../public/js/...`.
- When you add a file under `public/js/`, add it to `PRECACHE` in `public/sw.js` and bump `VERSION`.
- CLAUDE.md's rules-section invariants must keep holding: one `textOf()`, `normChars` one-for-one, and so on. `textOf` stays in `rules/data.js`.

## 1. `public/js/games/validate.js` (new, shared, pure)

No DOM and no DB access. Exports:

```js
export const LIMITS = { minSeats: 3, maxSeats: 8, minVp: 4, maxVp: 20, maxPoints: 30,
  mapString: 2000, tiUrl: 500, notes: 4000, color: 20, name: 40 };
export function validDate(s)                 // moved from server/games.js
export function isTiAssistantUrl(s)          // the one copy; remove the duplicates in server/games.js and games/ui.js
export function checkGameBody(body, { creating, today }) // -> { game } or { error: "plain message" }
```

`checkGameBody` is today's `validate()` minus the player-exists query. It covers `validateGameFields`, `validateExtras`, `validateSeats`, `validateSeat`, `checkSeatIndex`, `checkFaction` and `checkPoints`, moved from `server/games.js`, with the **same messages**.

It needs the faction set, so move `FACTIONS` out of `server/factions.js`. Either `validate.js` builds it from `FACTION_IDS` in `games/names.js`, or `server/factions.js` re-exports it from there. Use one list, and confirm the two lists are identical before deleting either. `today` is passed in, because the server and the browser compute it differently: the server uses UTC tomorrow, as `validateGameFields` does now.

- **`server/games.js` `validate()`:**
  1. Call `checkGameBody`.
  2. On `{ error }`, `throw bad(error)`.
  3. Then run the existing player-exists query.

  The SQL rule banner in `server/router.js` still applies.
- **`games/ui.js`:** `safeTiLink` becomes a re-export of `isTiAssistantUrl`. Keep the name `safeTiLink` so `view.js` and `form.js` keep working.
- **`games/form.js` `save()`:** after building `body`, run `checkGameBody(body, { creating: !this.editId, today: <tomorrow as YYYY-MM-DD, local> })`. On error, show that message and don't send the request. Keep the form's own `validate()` for the checks that depend on UI state, such as "Seat 2 needs a player", which come first and are friendlier.

## 2. Split `games/form.js`

- **`games/form-state.js`:** the pure state helpers.
  - Move `MIN_SEATS`/`MAX_SEATS`/`START_SEATS` (built from `LIMITS`), `newSeat`, `blank`, `pickWinner`, `modeOf`, `usableDraft`, `fitSeats`, `fromGame` and `sanitizeDraft`.
  - Add `toBody(st, { plan, editId })`: the body-building code from `save()`, moved as-is.
  - No DOM.
- **`games/combo.js`:** the typeahead from `bindCombos()`, `setPlayer`, `setFaction` and `addGuest`, as a small reusable piece.
  - Design the interface so that `Form` calls something like `bindCombo(input, { options, onPick, onAdd })`. Read the existing code before choosing a shape.
  - Keep the blur-timer behavior exactly as it is, even though it's a known rough edge.
- **`games/form.js`:** the `Form` class (drawing, events, draft, save) and `renderForm`. Target under 400 lines.

## 3. Split `rules/view.js`

- **`rules/view.js`:** URLs, shell, the render entry point, events (`wire`, `runSearch`) and font size.
- **`rules/results.js`:** the Results section (`snippetHtml` … `kindLabel`).
- **`rules/page.js`:** the Page section (`rewriteLinks`, `renderPage`, `highlight`, `setActiveMatch`, `clearHighlights`, `targetParagraph`, `paragraphLabel`, `shareParagraph`).
- **`rules/suggest.js`:** the Suggestions section.

Some functions share module-level variables (the active match index, the suggestion state, and so on). Gather them into one exported `state` object in the module that owns them, rather than threading parameters everywhere. Before moving anything, list every module-level `let` in `rules/view.js` and say where each one went in your summary.

## Acceptance

All of these must pass, and their output goes in your summary:

1. `npm run check:api`: all pass. It proves the server still validates identically, including every message.
2. `npm run check:ui` (see `docs/plans/check-ui.md`; needs `PLAYWRIGHT_CORE`): all pass.
3. `node scripts/check-stats.mjs`, `node scripts/check-analysis.mjs`, `node scripts/check-map.mjs`, `node scripts/check-map-svg.mjs`: all pass.
4. `wc -l public/js/games/*.js public/js/rules/*.js`: no file over 450 lines.
5. A Sonar pass over the changed files, as CLAUDE.md describes: scratchpad-installed `eslint` with `eslint-plugin-sonarjs` recommended. It shows no new findings compared with the same pass on `HEAD`. Report both counts.
6. `grep -rn "safeHttps\|start with https" public server` finds nothing, and `isTiAssistantUrl` is defined exactly once.

## Out of scope

- New features
- Changes to look or copy
- The backfill work
- Fixing the known rough edges (typeahead blur timer, speaker radio)
- `games/view.js`: it's large too, but the backfill will change it, so leave it
