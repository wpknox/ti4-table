# M3 phase 5: Planned games, maps on game pages

_Build plan written 2026-10-16. Builds on the M3 API (`docs/plans/m3-api.md`) and UI (`docs/plans/m3-ui.md`). Read CLAUDE.md, both of those plans, and `server/router.js` (the SQL rule) before starting. Load the frontend-design skill before UI work._

## Goal

The group can set a game up before playing it: pick a map, give each map seat a player (that is the "invite": a seated editor can edit the game) and optionally a faction, and save it as a **planned** game. After the game night someone opens it, enters points and the winner, and it becomes a **finished** game that counts in stats. Any game with a map string shows the map on its game page, with each seat's player and faction on their home system. List rows show the TI Assistant link when a game has one.

## Owner decisions (2026-10-16)

- Planned games are real games in the database (not just a prefilled form).
- These are the orchestrator's defaults. Don't change them without asking:
  - **Factions are optional while planned** (factions are often drafted at the table). They're required to finish.
  - **Players are required** on every seat, planned or finished. There are no open seats.
  - **Planned → finished is one-way** through the API. Only an admin revert can take a finished game back to planned.
  - **Permissions are unchanged:** the `canEdit`/`canDelete` rules in `server/games.js` apply to planned games too.
  - **Stats ignore planned games.**
  - **Planning happens on the log form in plan mode**, opened from the Map page. It doesn't happen inside the Map page itself. The plan-mode form draws the map and labels seats live, so it feels like planning on the map, and the same form later finishes the game.

## Data: `migrations/0002_planned_games.sql`

1. `ALTER TABLE games ADD COLUMN status TEXT NOT NULL DEFAULT 'finished' CHECK (status IN ('planned','finished'));`
2. `seats.faction` becomes nullable. SQLite can't drop NOT NULL, so rebuild `seats`:
   - create `seats_new` with the same columns, constraints and checks as in `0001_init.sql`, except `faction TEXT` (nullable)
   - `INSERT INTO seats_new SELECT * FROM seats`, then `DROP TABLE seats`, then `ALTER TABLE seats_new RENAME TO seats`
   - recreate all four seat indexes: `seats_one_winner`, `seats_one_speaker`, `seats_player`, `seats_faction`
   - `UNIQUE (game_id, faction)` still works with NULLs, because SQLite treats NULLs as distinct
3. Add the index `CREATE INDEX games_status ON games(status, played_on DESC) WHERE deleted_at IS NULL;`

Check it locally: `npx wrangler d1 migrations apply ti4-table --local`, then `npm run db:seed:local` on a fresh state (`--persist-to` a temp dir). Seeded games must come out `finished`.

## API changes (`server/games.js`, `server/admin.js`)

Keep the SQL rule: fixed SQL strings and `?` binds only. Where a query's shape varies, choose between whole fixed strings in code.

**Validation**
- `body.status` is optional: `"planned"` or `"finished"`. Default `"finished"`, so existing clients keep working. Anything else gets a 400: "status must be planned or finished."
- When `status === "planned"`:
  - `faction` may be `null` or missing. If present, it must be a known faction and unique, as now.
  - `points`, `is_winner` and `is_speaker_start` are accepted but ignored: store `points = 0` and `is_winner = 0`, and keep `is_speaker_start` as sent, so a known speaker can be recorded.
  - Skip the "exactly one winner" check.
  - Seats are 3–8, players are required and unique, and `seat_index` rules are the same as now.
- When `status === "finished"`, the rules are exactly today's, and every seat needs a faction ("Every seat needs a faction before the game can be finished.").

**Writes**
- `createGame` accepts either status and inserts the `status` column.
- In `updateGame`, if the stored game is `finished` and the body asks for `planned`, return a 400: "A finished game can't go back to planned." Otherwise write the new status.
- `revisionInsert` adds `'status', g.status` to the `game` json object.
- `revertGame` (admin.js) restores status with `status = COALESCE(json_extract(r.data, '$.game.status'), 'finished')`, because revisions made before this change have no status.

**Reads**
- `attach()` and `getGame` include `status`.
- `GET /api/games` gets an optional `status` query param:
  - `status=planned`: planned games only, ordered `played_on ASC, id ASC` (soonest first). No pagination, capped at 50.
  - absent or `status=finished`: finished games only, with today's ordering and cursor. The `before` cursor query must also filter `status = 'finished'`.
  - `full=1`: finished only. Stats and the admin page use this.
  - any other value: 400.
- `seatOut` returns `faction: null` when it's null. Every front-end place that calls `factionName`/`sym` on a seat must handle null by showing "Faction not picked" and no symbol.

**Checks:** extend `scripts/check-api.mjs` with at least:
- planned create with null factions returns 201
- planned with a duplicate faction returns 400
- planned with a duplicate player returns 400
- finishing with a missing faction returns 400
- finishing correctly returns 200, and the game now appears in `full=1`
- finished → planned returns 400
- `status=planned` lists only planned games
- `full=1` excludes planned games
- `status=bogus` returns 400
- an editor who isn't seated and isn't the creator can't edit a planned game (403)
- a seated editor can
- admin revert of a pre-finish revision restores `planned`

All existing checks must still pass.

## Front end

**Map page (`public/js/map/view.js`)**
- Once a map is analyzed, add a link under the seat reports: **"Plan a game on this map"**, pointing to `/games/new?plan=1&m=<encoded map string>`.
- Show it to everyone. Signed-out users who follow it get the form's usual sign-in prompt.

**Log form (`public/js/games/form.js`)**
- **Plan mode:** `/games/new?plan=1&m=…`, or editing a game whose `status === "planned"`.
  - Seat count is fixed to the map's seat count (`analyze(parse(m)).seats.length`), so no add or remove buttons.
  - Each card is headed "Seat N" with `seat_index = N-1` fixed, and the seat-position select is hidden.
  - Hide points, the winner and "Make winner". Keep the starting speaker.
  - The faction is optional; label it "Faction (optional)".
  - Above the seats, draw the map with `renderMapSvg`, using the same loading steps as `map/view.js` (tiles, parse, analyze, symbols). Each home system shows the player's name under the seat numeral and the faction symbol once one is picked, and updates as the user types or picks.
  - The date label reads "Playing on". The map string field shows the map read-only, with a "Change map" link back to `/map?m=…`.
  - The save button reads "Save planned game". On success: toast "Game planned", then go to the game page.
  - Without `m`, plan mode still works: seats can be added and removed as normal, and no map is drawn.
- **Finishing:** on a planned game, the game page shows a primary button **"Enter results"** to anyone with `can_edit`. It opens `/games/<id>/edit?finish=1`: the normal finished-mode form, prefilled, with seat positions kept and status `finished` on save. Save says "Save results". On success: toast "Results saved".
- An edit of a planned game without `finish=1` stays in plan mode and saves as planned.
- Drafts keep working. Key them as now, and add `plan` to the stored state so a restored draft reopens in the right mode.

**Map labels (`public/js/map/svg.js`)**
- Add the option `seatLabels`: `{ [seatNumber]: { name?: string, faction?: string|null } }`. In `homeMarks`, when a label exists for the seat:
  - draw a short `<text class="seat-name">` under the numeral: `esc(name)`, cut to 12 characters with "…"
  - prefer `symbols[label.faction]` over the home tile's own faction symbol
- Without the option, output must be byte-identical to today's. `node scripts/check-map-svg.mjs` must still pass unchanged.
- Add `.seat-name` styling in `css/map.css`: small Saira, `--star`, with a `paint-order: stroke` halo in `--void` so it reads over tiles. It needs to work in light and dark.

**Game page (`renderGame` in `public/js/games/view.js`)**
- When `map_string` is set, draw the map inline below the scores, with `seatLabels` built from seats that have a `seat_index` (seat number = `seat_index + 1`). On a phone, render it full width at about 340px tall. Keep the "See the map" link (it goes to the full analysis).
- Load tiles, symbols and art the same way `map/view.js` does. Extract a shared helper into `public/js/map/load.js` rather than copying it, and make `map/view.js` use it. If the map string doesn't parse, skip the map silently and keep the link.
- **Planned games:**
  - heading "Planned for <dayLong>"
  - no scores block
  - seats in seat order, showing player, faction (or "Faction not picked") and color
  - the "Enter results" button
  - copy: "This game hasn't been played yet. Stats will count it once results are in."

**List (`renderList`)**
- At the top, an **"Upcoming"** group from `GET /api/games?status=planned`, shown only when there are any. Each row reads "<day> · N players · planned", links to the game, and shows the map seat count when there's a map. Then the existing finished list from `?status=finished` (pagination unchanged).
- **TI Assistant link on rows:** when `safeHttps(g.ti_assistant_url)`, add a small separate link after the row link (not nested in it, since nested `<a>` is invalid): "TI Assistant", `target="_blank" rel="noopener noreferrer"`. It needs a ≥44px touch target, `--influence` color and a visible focus style. For this, `attach()` must return `ti_assistant_url` and `map_string`.

**Stats:** no code change, because `full=1` excludes planned. Add a planned game to `db/seed.sql` and confirm `node scripts/check-stats.mjs` still matches the hand count. Update the header comment to say planned games don't count.

**Service worker:** add `public/js/map/load.js` to `PRECACHE` and bump `VERSION`.

## Out of scope

- Notifications to invited players. Seating someone is the invite, and they see the game when they open the site.
- Planning inside the Map page itself, and any new Map page form controls.
- Open seats or "anyone can join" games.
- Changing who can edit or delete.
- Calendar or time-of-day fields.

## Acceptance (check in Chrome or Playwright at 390×844 and 1280×800, dark and light)

1. Map page → "Plan a game on this map" → the form shows the map with N seat cards. Picking players and some factions updates the names and symbols on the map. Save → the game page shows "Planned for …", the labeled map, and "Enter results".
2. The list shows the planned game under "Upcoming". It isn't in the finished list and doesn't count in stats.
3. "Enter results" → points and winner → save → it appears in the finished list and stats, with the labeled map on its page.
4. A finished game with a TI Assistant link shows the link on its list row. Tapping it opens TI Assistant, and tapping the row still opens the game.
5. An XSS check: a player named `<img src=x onerror=alert(1)>` renders as text on the form map, the game-page map and the list.
6. `npm run check:api`, `node scripts/check-stats.mjs`, `node scripts/check-map-svg.mjs`, `node scripts/check-map.mjs` and `node scripts/check-analysis.mjs` all pass.
7. No horizontal scroll at 390px. Touch targets are ≥44px.

## Report back

Files changed, check outputs, screenshots paths under `.playwright-mcp/`, and anything you decided that this plan didn't cover. Do not commit. The orchestrator reviews the result and security-reviews the server changes first.
