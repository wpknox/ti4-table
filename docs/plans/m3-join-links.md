# Plan: join a game from a link and claim a guest seat

## Goal

An admin logs a game (or plans one) with seats for friends who have no account yet. Those friends are "guests": `players.role = 'none'`. Today the admin has to make one invite code per guest on the Admin page. Instead, the admin taps **Make join link** on the game page and sends one link to the group chat. A friend opens it, picks who they are from that game's guest seats, and is signed in as that player, now an editor. Their past games stay theirs because it's the same `players` row.

Owner's choice: a join link per game, usable right away (no approval step). Only guests who have never signed in can be claimed. The link expires after 7 days. The admin can stop a link early and undo a wrong claim.

## Security rules (non-negotiable; the orchestrator will security-review)

- Follow the SQL rule at the top of `server/router.js`: fixed SQL strings with `?` binds only.
- **Only admins** make or stop join links (`requireRole(ctx, "admin")`). Editors can't, because a link creates editors, the same power as invite codes, which are admin-only.
- **A seat is claimable** only if all of these hold at claim time, checked **in the same SQL statement that changes the role** (atomic, so two people can't both claim one guest):
  - the player has a seat in the link's game
  - `players.role = 'none'` and `players.archived = 0`
  - `NOT EXISTS (SELECT 1 FROM invites WHERE player_id = players.id AND used_at IS NOT NULL)`, i.e. never signed in by any code. This stops anyone claiming an admin someone demoted, or a returning player.
  - the game isn't deleted
- The link code is stored only as a SHA-256 hash (`sha256Hex`), like invites. Make it with `newCode()` and show it with `formatCode()` from `server/auth.js`.
- Bad or expired codes count toward the same per-IP lockout as `redeem` (`redeem_attempts`, `MAX_FAILS`, `FAIL_WINDOW_MS`, `failRedeem`). Export what you need from `auth.js` rather than copying it.
- The preview endpoint is public (signed-out), so it returns **only**: the game's date and date precision, its status, and the claimable seats as `{player_id, name, faction}`. No notes, no map, no other players, no ids beyond those `player_id`s.
- If the requester already has a session, the claim endpoint refuses with 409, "You're already signed in as <name>. Sign out first to claim a seat." Don't merge accounts.
- Every mutation goes through `checkMutation` (the router already does this for non-GET requests).
- The code goes in the URL **fragment**, `/games/claim#ABCDE-FGHJK`, so it never reaches server logs or `Referer`. The page reads `location.hash` and sends it in a POST body.

## Data

`migrations/0005_join_links.sql`:

```sql
CREATE TABLE join_links (
  code_hash   TEXT PRIMARY KEY,
  game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_by  INTEGER NOT NULL REFERENCES players(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX join_links_game ON join_links(game_id);
```

A link is reusable until it expires or is stopped, so one link serves the whole table. Each successful claim also inserts an `invites` row: a random hash, `player_id`, `role 'editor'`, `created_by` = the link's creator, `used_at` = now, `expires_at` = now. That records the claim, makes the player non-claimable from then on, and shows on the Admin page the same way an invite does. Do this in one `db.batch` with the session insert.

## API (add to `server/router.js`; put handlers in a new `server/join.js`)

| Method, path | Who | Body | Response |
|---|---|---|---|
| `POST /api/games/:id/join-links` | admin | `{}` | `201 {code: "ABCDE-FGHJK", expires_at}`. 404 if the game is missing or deleted. 400 "Nobody in this game is a guest." if no seat is claimable. |
| `DELETE /api/games/:id/join-links` | admin | none | `{ok: true}`. Sets `revoked_at` on all of that game's live links. |
| `POST /api/join/preview` | anyone | `{code}` | `{game: {played_on, date_precision, status}, seats: [{player_id, name, faction}]}`. Seats can be empty (all claimed). A bad, expired or stopped code → 400 with the same wording as `BAD_CODE`, counted as a failure. |
| `POST /api/join/claim` | signed-out | `{code, player_id}` | `200 {player}` + session cookie (same cookie and session as `redeem`; reuse its helpers). Bad code → 400 counted. Not claimable (taken a moment ago, not in game) → 409 "That seat was just claimed, or isn't a guest. Pick again." (not counted). |

- Also add `join_link: {expires_at} | null` (the latest live link) to `GET /api/games/:id`, **for admins only**. The code isn't stored in plain text, so the page can't show the old link again. Making a new one is fine, and old ones keep working until they expire.
- Also add `claimable: true/false` per seat in `GET /api/games/:id` for admins only, so the page knows whether to offer the button. Use the same claimable conditions.

## Front end

- **Game page** (`public/js/games/view.js`, `renderGame`/`addGameActions`): for admins, when some seat is claimable, show a **Make join link** button.
  - On success, show the URL `${location.origin}/games/claim#<code>` in a read-only input, with **Copy link** and **Share** buttons (use `navigator.share({url})` where available, as `shareButton` in `ui.js` does; reuse it if it fits).
  - Below, a plain line: "Anyone with this link can claim a guest seat in this game until <date>." Add a **Stop join links** button (it calls DELETE and confirms with a toast).
  - Mark claimable seats in the seat list with a quiet "guest" note (seen by admins only).
- **Claim page:** a new route `/games/claim` in the games section's route table, reachable **while signed out**. Look at how `/games/join` is handled and make the sign-in guard skip this route too.
  - Flow: read the code from `location.hash`, POST preview, then show "Game of <date>. Who are you?" with one large button per claimable seat (name + faction symbol via the existing `sym`/`hydrateSymbols`). Each button is ≥44px.
  - Tapping a seat asks to confirm: "Sign in as <name>? You can't undo this yourself." with **Yes, I'm <name>** and **Back**. Then it POSTs the claim. On success, `navigate('/games/<id>')`. The preview doesn't return the id, so have claim return `game_id` as well.
  - No code, or a bad code: "This join link doesn't work. It may have expired. Ask whoever sent it for a new one." with a link to `/games/join` (sign in with a code).
  - No seats left: "Every guest seat in this game has been claimed." with the same sign-in link.
  - Already signed in (`me` is set): "You're signed in as <name>." with a link to the game page if possible, otherwise to `/games`.
  - After the claim, the hash must be cleared: `setUrl` / `history.replaceState`, so the code doesn't linger in history.
- **iOS home-screen app:** the join link opens in Safari, so the friend gets a Safari session. That's fine: the existing "sign in another device" code covers the home-screen app. On the claim success page, show one line: "Using the home-screen app? Open it and sign in with a code from Me → Sign in another device." Check the real wording of that control in `view.js` and use it.
- **Admin page** (`public/js/games/admin.js`): nothing new is required. To undo a wrong claim, the admin uses the existing controls to set the role back to none and sign the player out. Check those exist, and say so in your report. If they don't, report it and don't build them.
- Add any new static files to `PRECACHE` in `public/sw.js` and bump `VERSION`.

## Acceptance checks

Add these to `scripts/check-api.mjs` (keep all existing checks passing):
1. A non-admin editor → 403 on making and on stopping links. Signed out → 401/403.
2. Admin makes a link → 201, the code is formatted, and preview lists only the claimable guests of that game, with only the fields above.
3. Claim → 200, a cookie is set, the player is now role `editor`, `/api/me` with that cookie returns them, and an `invites` row with `used_at` exists.
4. Claiming the same player again with another signed-out client → 409. Preview no longer lists them.
5. A player who once redeemed an invite but was set back to `role none` isn't claimable (preview omits them, claim → 409).
6. An archived player, a player not in that game, an admin, or an editor → not claimable (409).
7. An expired link (set `expires_at` in the past with a direct local D1 update, as other checks do) and a stopped link → 400, which counts toward the lockout. The 400 wording matches `BAD_CODE`.
8. Claim while already signed in → 409.
9. A deleted game's link → 400 on preview and claim.
10. The game-page `claimable`/`join_link` fields are present for an admin and absent for an editor.
11. SQL injection attempts in `code` and `player_id` (strings, objects, arrays) → 400, with no server error.

Add to `scripts/check-ui.mjs`:
- An admin sees **Make join link** on a game with a guest.
- A signed-out browser context opening `/games/claim#<code>` sees the guest buttons, claims one, and lands on the game page signed in.
- A bad code shows the "doesn't work" message.
- No console errors, CSP violations or horizontal scroll at 390px.

Run `npm run check:api` and `npm run check:ui` and report the pass counts. Take screenshots of the claim page and the game page with a link (390×844 and 1280×800, dark and light) into `.playwright-mcp/`.

## Out of scope

- Editors making links, an approval queue, merging duplicate accounts, emailing.
- Claiming a seat for a player who already has an account (they just sign in as usual).
- The Milty link (separate plan, `m3-milty-link.md`), which runs after this one.

## Conventions

Read `CLAUDE.md` first. Match the existing server style (`HttpError`, `json`, `readJson`, `requireRole`) and front-end style (`esc()` on every interpolated value, short "why" comments, section banners). Copy is plain, in sentence case, and buttons say what happens. Don't commit; the orchestrator reviews and commits.
