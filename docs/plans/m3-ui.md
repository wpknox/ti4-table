# M3 phase 4: Games UI

_Build plan written 2026-10-15. The API is built and committed (`docs/plans/m3-api.md`, `server/`, `npm run check:api`). This phase is front end only. The visual spec is `docs/design.md`, sections "Games (M3)", "The signature: numbers", "Faction symbols and space imagery", "Copy" and "Motion". Load the frontend-design skill before starting._

## Goal

The group can sign in with an invite code, log a game on a phone at the end of the night, browse past games, fix one they played in, and see stats. The admin can add friends, make invite codes, change roles, and undo vandalism.

## Routes (one section, `addSection({ prefix: "/games", label: "Games", render })`)

| URL | Who | What |
|---|---|---|
| `/games` | everyone | Game list (newest first, `GET /api/games?limit=30`, "Show older games" uses `next`), plus a "Log a game" button for editors and a "Sign in" link for everyone else |
| `/games/12` | everyone | One game: big final scores (winner's score outlined in `--resource`), seats in seat order with faction symbol, player, color word, points; date, expansions, notes, TI Assistant link, map link (`/map?m=…` when `map_string` is set), "Logged by X". "Edit" if `can_edit`; "Delete game" if `can_delete` (confirm first, then toast "Game deleted" with no undo; admins restore from the admin page) |
| `/games/new`, `/games/12/edit` | editor | The log form (below) |
| `/games/join` | everyone | Invite-code sign-in. Pre-fills from `#code=…`. After success: toast "Signed in as Name", go to `/games` |
| `/games/stats` | everyone | Stats (below) |
| `/games/me` | signed in | "Signed in as Name", "Sign in on another device" (device code, shown big with a Share button), "Sign out on this device" |
| `/games/admin` | admin | Friends: list (role, sessions, last seen), "Add friend" (name), per-friend "Make invite code" (editor/admin), change role, archive, "Sign out everywhere". Deleted games: list with "Restore". Per game: "History" → revisions list → "Revert to this version" |

The admin page needs `GET /api/admin/players`. For deleted games, an admin can see a soft-deleted game via `GET /api/games/:id`. If listing deleted games needs a new endpoint, **stop and report** rather than adding server code. The orchestrator adds server routes and security-reviews them.

## Files

```
public/js/games/api.js       fetch wrapper: JSON in/out, credentials same-origin, maps 401/403/409/415/429 to plain messages
public/js/games/view.js      section render + routing within /games
public/js/games/form.js      the log form
public/js/games/admin.js     admin page
public/js/games/stats.js     PURE stats functions (no DOM), importable by Node
public/css/games.css
scripts/check-stats.mjs      runs stats.js over db/seed.sql's data and compares with the hand count in its header
```

Also: link `games.css` in `index.html`, register the section in `app.js`, add files to `PRECACHE`, and bump `VERSION` in `sw.js`.

## The log form

- **Seats:** start with 6. Add or remove seats down to 3 and up to 8.
- **Each seat:**
  - **player:** a typeahead over `GET /api/players` (not archived), plus an "Add a guest…" option that `POST /api/players` creates
  - **faction:** a typeahead over the 31 faction ids, with symbol and name; names come from `rules.json` page titles, split "The Firmament / The Obsidian"
  - **color:** optional select of the 8 TI4 colors as words
  - **points:** a stepper (−, big numeral, +, 44px buttons)
  - **seat position:** optional
- **Winner:** automatic from the top score, and re-picked when points change, unless the user overrode it with "Make winner". On a tie with no override, show "Two seats are tied on 10. Pick the winner." and block saving until they pick.
- **Starting speaker:** optional radio.
- **Game fields:**
  - date, defaulting to today in local time
  - points to win (10, stepper)
  - expansions: two toggles, "Prophecy of Kings" (on) and "Thunder's Edge" (off)
  - map string (optional, with a "Check this map" link that opens `/map?m=…`)
  - TI Assistant link (optional)
  - notes
- **`client_id`:** made with `crypto.randomUUID()` when the form opens. Keep it in the draft, so a retry after a dropped connection can't log the game twice.
- **Draft:** save the form state to `store` (localStorage, guarded) on every change, under `games-draft-new` or `games-draft-<id>`. Restore it on open with a quiet "Restored your unsaved game" toast and a "Start over" button. Clear it on save.
- **Save:**
  - a sticky full-width "Save game" button that reads "Saving…" while it works
  - on 201/200: toast "Game saved", then go to the game page
  - on error: show the server's message inline at the top of the form, and keep everything filled in
- **Edit:** loads the game into the same form. Save does a `PUT`. A 403 says "You can only edit games you created or played in."

## Stats (`/games/stats`, from `GET /api/games?full=1`)

`stats.js` exports pure functions over the `games` array:
- `winsByPlayer` (games, wins, win rate)
- `byFaction` (games, wins)
- `unplayedFactions(playerId)`
- `headToHead(a, b)`: games together, who finished higher
- `averagePoints(playerId)`
- `seatEffects`: only show this when there are 20 or more games. Otherwise say "Seat effects show up after 20 games."

**Display:** big Saira numerals for counts, with labels in reading type. Use simple bars only for win rate by faction. Load the dataviz skill before drawing them. Show a faction symbol beside each faction. On the player view, list "Factions you haven't played" as symbols with their names.

## Security (the owner cares; this gets reviewed)

- **Escape user text.** Every user string (names, notes, colors, URLs, map strings) goes through `esc()` or `textContent`. Never interpolate API data into HTML unescaped.
- **External links:**
  - A TI Assistant link renders only if it starts with `https://`, with `rel="noopener noreferrer"` and `target="_blank"`.
  - Map links go through `encodeURIComponent`.
- **Fetch defaults.** `fetch` always sends `Content-Type: application/json` on writes and uses `credentials: "same-origin"`. The browser adds `Origin` itself. Never send `created_by`, `updated_by` or `role` in a game body.
- **No client-side trust.** Hiding Edit or Delete is a convenience only; the server decides. Handle a 403 gracefully even when the button was shown.
- **Invite codes.** Don't store the session token anywhere; it's an HttpOnly cookie, and JS can't see it. Don't log invite codes to the console. Clear the code from the URL fragment after reading it (`history.replaceState`).

## Offline

- `/api/` is never cached by the service worker. When a fetch fails offline, show "You're offline. Games need a connection." with a "Try again" button. Rules and Map keep working.
- **The draft makes logging safe:** if the connection drops at the moment of saving, the form stays filled. Retrying uses the same `client_id`.

## Dev and checks

```bash
npm run db:migrate:local && npm run db:seed:local
node scripts/invite.mjs --local "Owner" admin    # code for the admin
node scripts/invite.mjs --local "Ed" editor      # code for an editor
npm run dev                                       # http://localhost:8788 (API + static)
```

**Acceptance:**
- `node scripts/check-stats.mjs` matches the seed's hand count exactly.
- `npm run check:api` and the three map checks still pass. **Don't change server code.**
- Playwright, at 390×844 and 1280×800, in dark and light:
  - Sign in as the editor, log a 6-seat game one-handed: tap targets ≥44px, no horizontal scroll, the sticky Save button never covers the last field. The game page then shows it.
  - Edit it: the change persists.
  - Sign in as the admin in a second context: revert the edit from History, and the game page shows the original.
  - Signed out: `/games` and `/games/12` show no Edit or Delete, and `/games/new` shows "Sign in to log a game" with a link to `/games/join`.
  - Bad code: shows the server's generic message. 11 bad codes: the 429 message is shown plainly.
  - Turn the network off in Playwright while saving: the form stays filled. Saving after reconnecting creates exactly one game.
- No console errors.

## Out of scope

- CSV import.
- Server changes (report any need; don't make them).
- Deploying.
- Tile-art map view.
- Faction pick suggestions.
