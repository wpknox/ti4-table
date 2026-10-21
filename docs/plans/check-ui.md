# Plan: UI smoke checks (`npm run check:ui`)

## Goal

A single script that drives a real browser through every section and fails loudly when a page breaks. Agents and the owner run it before committing UI work, alongside `npm run check:api`. It does not judge looks. It catches crashes, console errors, CSP violations, horizontal scroll, and broken core flows.

## Constraints

- **No new repo dependencies.** `playwright-core` must not go in `package.json`. The script loads it dynamically from the path in `PLAYWRIGHT_CORE`, falling back to a bare `import("playwright-core")`. If both fail, it prints the following and exits 2:
  ```
  playwright-core isn't installed. Install it outside the repo, e.g.
    npm i --prefix ~/.cache/ti4-table-pw playwright-core
    PLAYWRIGHT_CORE=~/.cache/ti4-table-pw/node_modules/playwright-core/index.mjs npm run check:ui
  ```
- Launch with `chromium.launch({ channel: "chrome" })`. Google Chrome is installed, so no browser download is needed. Support `HEADED=1` for watching.
- Node built-ins only otherwise. ES module, same style as `scripts/check-api.mjs`: section banners (`// ── Name ───`), `PASS`/`FAIL` lines, exit 1 on any failure, and always stop the server.

## Files

1. **New `scripts/lib/dev-server.mjs`.** Move these out of `scripts/check-api.mjs` and export them:
   - `startServer({ port, state })`: runs `wrangler pages dev --port <port> --persist-to <state>`, detached, waits for `GET /api/me`, timeout 60 s, and returns `{ base, stop }`.
   - `resetState(state)`: `rmSync`, then `wrangler d1 migrations apply ti4-table --local --persist-to <state>`.
   - `makeInvite(state, name, role)`: runs `scripts/invite.mjs --local --persist-to <state>` and returns the code.
   - `wrangler(...args)`: the existing `spawnSync` helper.
   - Signal handlers that stop the server on exit, SIGINT and SIGTERM.

   Then make `check-api.mjs` use the module. `npm run check:api` must still print "All checks passed" with 91 PASS lines. Run it to prove that.
2. **New `scripts/check-ui.mjs`.** Use port 8791 and state `.wrangler/ui-state`. It must not touch the default local DB.
3. **`package.json`:** add `"check:ui": "node scripts/check-ui.mjs"`.
4. **`CLAUDE.md` "Commands" and the "no automated tests yet" sentence:** document `check:ui` and the `PLAYWRIGHT_CORE` setup in two or three lines.

## What it checks

**Console watcher.** One per page. Record every `console` message of type `error`, and every `pageerror`. Any message containing "Content Security Policy" is a failure on its own line. At the end of each step, assert that no errors were recorded during the step. Ignore exactly one known-benign warning, Chrome's "preloaded using link preload but not used", and only because it is a warning. Errors are never ignored.

**Layout pass.** Run this for each of the four combinations of viewport (390×844, 1280×800) and color scheme (dark, light; `page.emulateMedia({ colorScheme })`), for every URL in the route list below:
- No horizontal scroll: `document.documentElement.scrollWidth <= window.innerWidth`.
- `main` has non-empty text.
- No console errors.

**Route list:** `/rules`, `/rules?q=retreat`, `/rules/R_movement`, `/map?m=<the first 6p map string in scripts/fixtures/maps.mjs>`, the same map with `&view=art`, `/about`, and (signed in) `/games`, `/games/stats`, `/games/new`, `/games/me`, `/games/admin`, `/games/<id of the game created below>`.

**Flows.** Run these once each, at 390×844 dark:
1. **Rules search.**
   - On `/rules`, type `retreat` into the search box and submit.
   - At least one result appears.
   - Click the first result's snippet. The URL path starts with `/rules/R_`, and the page has at least one highlight element. Read `public/js/rules/view.js` `highlight()` for the class name.
2. **Rules paragraph link.** Load `/rules/R_movement#58.3`. An element with id `58.3` exists, and the page heading is "Movement".
3. **Map.**
   - The page has an `svg.mapsvg`.
   - The seat count shown matches the map's player count.
   - The `&view=art` URL renders `svg.mapsvg.art`.
4. **Signed out.**
   - `/games` shows the sign-in form (`#code`) and no game list.
   - `GET /api/games` from the page context (`page.evaluate(() => fetch('/api/games').then(r => r.status))`) is 401.
5. **Sign in returns.**
   - Make an admin invite for "UI Admin".
   - Go to `/games/stats`, type the code into `#code` and press Enter.
   - The URL becomes `/games/stats`.
   - `/api/me` reports "UI Admin".
6. **Log a game.**
   - Through the API with the page's cookie, so the steps don't depend on form internals, create two guest players: "Guest One", and `<img src=x onerror="window.__xss=1">`.
   - Then use the **real form** at `/games/new` to log a 3-player game: today's date, any three distinct factions, the UI Admin with the top points.
   - Read `public/js/games/form.js` to find the field ids and the typeahead's behavior. Don't guess them.
   - Save. The URL becomes `/games/<id>`, and the page shows all three player names, with the XSS name as literal text.
   - `window.__xss` is undefined.
7. **Stats.** On `/games/stats`, every `.bar-fill` has a non-empty `style.width`, which proves the CSP-safe width code ran.
8. **Hostile link.**
   - On the edit page of that game, set the TI Assistant link to `https://evil.example/x` and save.
   - The form shows an error, and the game is not changed.

## Acceptance

- `npm run check:ui` passes on a clean checkout, given only `PLAYWRIGHT_CORE`. It finishes in under 2 minutes.
- Break something on purpose to prove the script catches it, then revert:
  - add `style="color:red"` to a template in `view.js`: a CSP failure appears
  - add `width: 2000px` to `.games-page`: a horizontal-scroll failure appears
  - throw in `renderStats`: a page error appears

  Report all three in your summary.
- `npm run check:api` still passes, using the shared module.
- No files outside `scripts/`, `package.json` and `CLAUDE.md` change.

## Out of scope

- Visual diffs or screenshots
- Testing the service worker or offline mode
- Testing the iOS standalone mode
- CI setup
- Fixing UI bugs the script finds. List them in your summary; don't fix them.
