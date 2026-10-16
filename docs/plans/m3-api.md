# M3 phase 3: Games API, schema and sign-in (no UI)

_Build plan written 2026-10-15. The spec is `docs/research/auth-and-backend.md`; read it in full first. This file says what to build now, in what order, and how it's checked. Where the two differ, this file wins._

## Goal

A working `/api/*` backend on Cloudflare Pages Functions + D1:
- invite-code sign-in with a session cookie
- players
- games with seats, revisions and soft delete
- per-game edit rights
- admin routes

It's all testable locally by one script, with no UI and no deploy. The UI is phase 4, a separate plan.

## Decisions (owner, 2026-10-15)

- Invite codes → session cookie (research option E). Hosted on Pages.
- **Who can edit a game:** an `editor` who created it **or** has a seat in it, judged by the seats stored *before* the edit. An `admin` can edit any game.
- **Delete:** the creator or an admin only.
- **Expansions:** two flags per game, `pok` (default 1) and `te` (default 0).
- **Factions:** official only (base, PoK, Thunder's Edge, Keleres). No homebrew and no "other".
- The production D1 database exists: name `ti4-table`, id `1bfe12d4-66d8-43a0-bf88-fa4ea482e943`. Commit it in `wrangler.jsonc`, but **do not** put `account_id` in any file.

## Files

```
package.json                   { "private": true, "type": "module", "devDependencies": { "wrangler": "4.151.0" } } plus scripts below
package-lock.json              committed
wrangler.jsonc                 as in the research doc, with the real database_id; compatibility_date "2026-10-01"
migrations/0001_init.sql       the research doc's schema, with `variant` replaced by pok/te (already edited in the doc)
db/seed.sql                    local-only fake data (see Seed)
functions/api/[[path]].js      export const onRequest = (ctx) => handle(ctx.request, ctx.env);
server/router.js               handle(request, env): method + path match → handler; JSON errors; catches and logs exceptions as 500 {error:"Server error"}
server/http.js                 json(), error(), readJson() with size limit (64 KB), origin check
server/auth.js                 tokens, hashing, cookie read/write, currentPlayer(), requireRole(), redeem, device-code, logout
server/players.js              GET/POST/PATCH players
server/games.js                list, get, create, update, delete, validation, canEdit()
server/admin.js                invites, roles, sessions, restore
server/factions.js             export const FACTIONS = new Set([...]); the 30 F_* ids in public/data/rules.json plus "F_obsidian"
scripts/invite.mjs             bootstrap/recovery invite (research doc "Flows: Bootstrap"), --local | --remote, optional --persist-to <dir>
scripts/check-api.mjs          the acceptance script (below)
```

`package.json` scripts:
- `"dev": "wrangler pages dev"`
- `"db:migrate:local": "wrangler d1 migrations apply ti4-table --local"`
- `"db:seed:local": "wrangler d1 execute ti4-table --local --file db/seed.sql"`
- `"check:api": "node scripts/check-api.mjs"`

**Don't touch:** anything in `public/` (no UI in this phase), `sw.js`, or the rules and map code. **Don't add `functions/_middleware.js`.** **Don't deploy, run anything with `--remote`, or create Cloudflare resources.** The orchestrator does that with the owner.

## API

Exactly the table in the research doc's "API sketch", with these changes:
- `PUT /api/games/:id`: allowed if `canEdit(player, game)`, otherwise 403 `{error: "You can only edit games you created or played in."}`.
- `DELETE /api/games/:id`: allowed if the player is the creator or an admin, otherwise 403.
- `GET /api/games/:id` adds `"can_edit"` and `"can_delete"` booleans for the current session (both false when signed out).
- The game body has `"pok": true|false` and `"te": true|false` instead of `variant`. Both are optional on create (defaults true/false) and returned as booleans.
- **Skip `POST /api/import`** (CSV import) in this phase.
- `GET /api/games` (list) seats include `player_name` so the list needs no second request.

```js
// server/games.js
canEdit(player, game, storedSeats) =
  player.role === "admin" ||
  (player.role === "editor" && (game.created_by === player.id || storedSeats.some(s => s.player_id === player.id)))
```

Everything else is as written in the research doc:
- the auth check per request
- the cookie attributes and the `sid` name on http
- the sliding expiry
- the Origin + JSON content-type check on every mutating route
- the generic redeem error
- the two-step atomic redeem
- one `db.batch()` per write
- `client_id` idempotency
- revisions before update and delete
- the validation rules
- tokens stored only as SHA-256 hex
- Crockford base32 codes with normalisation

## Seed (`db/seed.sql`, local only)

- **Players:** 6, all role `none`. Check-api creates its own signed-in players.
- **Games:** 5, spread over three dates, with 4–6 seats each. Use real `F_*` ids, a mix of `pok`/`te`, and one game soft-deleted.
- **Header comment:** a hand count, i.e. wins per player and games per faction over live games only. Phase 4's `stats.js` will be checked against it.

## Acceptance script: `scripts/check-api.mjs`

Self-contained and repeatable, with no manual steps. Use only Node built-ins.

1. **Fresh state.** Use a private state dir, `.wrangler/check-state` (delete it first), so the developer's local data is never touched. Run migrations with `--local --persist-to .wrangler/check-state`.
2. **Server.** Spawn `npx wrangler pages dev --port 8790 --persist-to .wrangler/check-state`. Wait until `GET /api/me` answers (time out after 60 s with a clear message). Kill the server at the end, including on failure.
3. **Users.** Make invites with `scripts/invite.mjs --local --persist-to .wrangler/check-state` for:
   - "Admin A" (admin)
   - "Ed One" (editor)
   - "Ed Two" (editor)
   - "Ed Three" (editor)

   Redeem each with `POST /api/auth/redeem`, and keep each `Set-Cookie` value as that user's cookie.
4. **Checks.** Print one line per check, then "All checks passed" or the failure count; exit 1 on failure. Every write sends `Origin: http://localhost:8790` and `Content-Type: application/json` unless the check is about those headers.

   *Auth:*
   - `GET /api/me` with no cookie returns `{player:null}`.
   - With Ed One's cookie it returns his name and role `editor`.
   - Redeeming the same code again → 400 with the same generic message as a made-up code.
   - Redeeming a code in a different format (lowercase, without the dash, with `O` for `0`) works. Make an extra invite for this.
   - On http the cookie name is `sid` and it has `HttpOnly` and `SameSite=Lax`.
   - `POST /api/auth/logout` → the next `/api/me` with that cookie returns `{player:null}`. Make a throwaway session for this.
   - Device code: Ed Two makes one and redeems it. Now there are two sessions, and both work.

   *Write gates:*
   - `POST /api/games` with no cookie → 401.
   - With Ed One's cookie but `Origin: https://evil.example` → 403.
   - With `Content-Type: text/plain` → 403 or 415 (either; document which).
   - An admin route with Ed One's cookie → 403.

   *Create:*
   - Ed One creates game G1: 4 seats (Ed One, Ed Two, and two new `none` players he adds via `POST /api/players`), `pok:true, te:true` → 201.
   - Re-posting the same `client_id` → 200 with the same id.
   - Validation → 400 each:
     - two winners
     - a repeated faction
     - an unknown faction `F_nope`
     - 2 seats
     - a date two days in the future
     - a `ti_assistant_url` starting with `http://`
     - notes of 4,001 characters

   *Edit rights:*
   - Ed Two (seated in G1) edits G1 notes → 200.
   - Ed Three (not seated, not the creator) edits G1 → 403.
   - Ed Three tries to edit G1 with a body that adds himself to the seats → still 403, because the seats stored *before* the edit decide.
   - Admin A edits G1 → 200.
   - `GET /api/games/:id` returns:
     - `can_edit:true, can_delete:true` for Ed One
     - `can_edit:true, can_delete:false` for Ed Two
     - `false/false` for Ed Three
     - `false/false` signed out
   - After the three successful edits, `game_revisions` has 3 rows for G1 (query D1 with `wrangler d1 execute --local --persist-to … --json`).

   *Delete:*
   - Ed Two deletes G1 → 403.
   - Ed One deletes G1 → 200, and G1 disappears from `GET /api/games`.
   - Admin restores it → it's back.

   *Roles:*
   - Admin sets Ed Three's role to `none`. Ed Three's existing cookie now gets 401 or 403 on `POST /api/games`, and `/api/me` returns `{player:null}`.

   *Reads:*
   - `GET /api/players` never includes `role` or `email`.
   - `GET /api/games?full=1` returns every live game with seats.
   - Pagination with `limit=2` and `before` walks every game exactly once.

## How to verify

- `npm install`, then `npm run check:api` passes.
- `node scripts/check-map.mjs` and `node scripts/check-analysis.mjs` still pass (untouched).
- `npm run db:migrate:local && npm run db:seed:local && npm run dev` works, and `curl http://localhost:8788/api/games` returns the 4 live seed games.
- Report:
  - the full check-api output
  - any place the research doc was ambiguous, and what you chose
  - anything you couldn't make work

## Out of scope

- UI and service-worker changes (phase 4).
- CSV import.
- Deploying, remote migrations, creating the Pages project (orchestrator and owner).
- Google sign-in, passkeys, email.
