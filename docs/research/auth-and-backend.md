# Research: sign-in and backend for M3 (game log)

_Researched 2026-10-15 against current Cloudflare docs. Answers the open questions in `docs/plans/m3-games.md`._

## TL;DR

- **Sign-in: owner-issued invite codes that become a long-lived session cookie.** The owner (admin) makes a one-time code for each friend. The friend types it into the Games page once and stays signed in for 180 days, renewed each time they use the site. A signed-in friend can make a short-lived code to sign in on another device, or in the home-screen app as well as Safari. No identity provider, no email, no secrets, no custom domain, and about 150 lines of server code. Every step happens with `fetch` on our own origin, so it works in an installed iOS home-screen app. That's where the redirect-based options break.
- **Allowlist (open question 2): in D1, not an env var.** A player row with `role = 'editor' | 'admin'` is the allowlist. The owner changes it from an admin screen without redeploying.
- **Backend:** Pages Functions behind one catch-all `functions/api/[[path]].js`, with logic in `server/`, and D1 bound as `DB`. Migrations go in `migrations/`. Local development uses `wrangler pages dev` with a local D1 and needs no Cloudflare login (checked with wrangler 4.151).
- **Cloudflare Access** was the "no auth code" candidate. It works on `*.pages.dev`, but it's a poor fit here. Its login runs on another origin, so it hits the iOS standalone cookie-jar problem. `fetch` calls fail when the Access session lapses. Gating a single path on a `pages.dev` host isn't documented. It also requires a payment card at Zero Trust signup, and the JWT still has to be validated in code. Details are below.

## What decides it

1. **iOS home-screen apps have their own storage.** WebKit says "the website data of home screen web applications is kept isolated from Safari" ([WebKit tracking prevention](https://webkit.org/tracking-prevention/)). A session made in Safari doesn't exist in the installed app, and the reverse is also true.
2. **Leaving our origin in standalone mode is unreliable.** Out-of-scope navigation, such as `accounts.google.com` or `<team>.cloudflareaccess.com`, opens an in-app Safari view. A Sept 2026 report on an installed iPhone PWA found that Google OAuth finished in that view and "the installed PWA's cookie/PKCE storage never receives the session" ([example PR](https://github.com/warren-wyn-dev/wynteam/pull/663)). Older reports describe Google's `403 disallowed_useragent` block in home-screen apps ([Auth0 community](https://community.auth0.com/t/getting-google-disallowed-useragent-with-web-app-added-to-ios-homescreen/6705); [firt.dev on iOS 12.2](https://firt.dev/ios-12.2/)). Tapping an emailed or texted link also opens Safari, not the installed app. So magic *links* land the session in the wrong jar.
3. **No custom domain.** That rules out anything that needs a Cloudflare zone, such as Email Service sending or self-hosted Access apps on your own hostname.
4. **Free tier.** Workers Free gives 100,000 requests/day and 10 ms CPU per request ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). That rules out slow password hashing, but SHA-256 of high-entropy tokens is cheap. D1 Free gives 5M rows read and 100k rows written per day, with 500 MB per database ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). Both are far above what this site will use.

The design rule that follows: **the credential must be typed or presented inside the page, and the session cookie must be set by a `fetch` response from our own origin.**

## Options compared

| | A. Cloudflare Access (OTP or Google) | B. Sign in with Google (our code) | C. Email magic link/code (CF Email Service) | D. Passkeys | **E. Invite codes → session (recommended)** |
|---|---|---|---|---|---|
| Works on `*.pages.dev` | Yes, whole host. Path-only gating is undocumented. | Yes (`pages.dev` is on the Public Suffix List, so Google accepts the redirect URI) | **No.** Needs a sending domain (custom domain) **and** Workers Paid | Yes (RP ID = full hostname) | Yes |
| Public reads, gated writes | Only if a path-scoped Access app works on `pages.dev` (unverified) | Yes (checked in code) | Yes | Yes | Yes |
| iOS standalone app | **Risky.** Login is on the team domain, off-origin. | **Risky.** Off-origin, see above. | Links open Safari, so it has to be a typed code | Likely fine (credential is in iCloud Keychain, not the cookie jar). Not confirmed by primary docs. | **Works.** Everything is same-origin `fetch`. |
| Owner setup | Zero Trust org (card required on Free plan), IdP, Access app, policy emails | Google Cloud project, consent screen, OAuth client, 2 secrets | Buy a domain, onboard to Cloudflare, Workers Paid, DNS records | None | None (run one script to make the first admin invite) |
| Code we write | JWT validation (RS256/JWKS) + email→player map + login-redirect handling (~80 lines, or the `jose` package) | OAuth code flow + state/PKCE + sessions (~200 lines) | Send + verify code + sessions (~180 lines) + email template | WebAuthn register/verify, no library (~250 lines). Still needs a bootstrap such as E. | Codes + sessions (~150 lines) |
| Cost | Free up to 50 users | Free | ~$5/mo + domain (~$10–15/yr) | Free | Free |
| Friend's experience | Email PIN each session (24h default) | Tap Google, consent | Type 6-digit code from email | Face ID | Paste a code once, then signed in for 180 days |

### A. Cloudflare Access in front of the write paths

- **On `*.pages.dev`:** yes. Pages has a project toggle (**Settings → Enable access policy**). By default it protects only preview deployments. To cover the production `<project>.pages.dev`, follow the Pages known-issue steps: edit the generated Access app, remove the wildcard from its hostname, then re-enable the preview policy ([Pages known issues](https://developers.cloudflare.com/pages/platform/known-issues/), [preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)). A self-hosted Access app for *your own* hostname needs "an active domain on Cloudflare" ([self-hosted public app](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)).
- **Path-level gating:** Access apps support paths, and "the more specific rule takes precedence". A wildcard path "does not cover the parent path" ([application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)). The docs don't say whether the Pages-generated `pages.dev` app can be narrowed to `/api/write/*`. **Unverified.** Workers document path-scoped Access on `workers.dev` hostnames ([Workers Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)), but Pages doesn't.
- **Seats and cost:** the Zero Trust Free plan covers up to 50 users ([Access product page](https://www.cloudflare.com/sase/products/access/)). A user takes a seat on first login and keeps it until removed ([seat management](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/)). Onboarding requires choosing a plan and "entering your payment details", even for Free ([Zero Trust setup](https://developers.cloudflare.com/cloudflare-one/setup/)).
- **One-time PIN:** must be added as an identity provider, since it's no longer on by default. PINs expire after 10 minutes, are single-use, and are sent from `noreply@notify.cloudflare.com` ([OTP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)). Cloudflare sends the email, so no domain is needed. That's the main attraction.
- **Code:** Cloudflare says to validate `Cf-Access-Jwt-Assertion` against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` and the app's AUD tag ([validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)). The Pages plugin `@cloudflare/pages-plugin-cloudflare-access` does this ([plugin](https://developers.cloudflare.com/pages/functions/plugins/cloudflare-access/)), but it's an npm dependency. Without it, use WebCrypto RS256 with a JWKS fetch, about 60 lines. `ctx.access` is Workers-only and isn't passed through when static assets are present ([Worker script](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)).
- **Pitfalls:**
  - Preview URLs (`<hash>.<project>.pages.dev`) share the production D1 binding unless overridden, and they aren't covered by the production Access app. Skipping JWT validation therefore leaves writes open.
  - When the session lapses, a `fetch` to a gated path is redirected cross-origin to the login page and fails as a CORS error. The client has to detect this and do a full-page navigation to log in.
  - The default session is 24h ([authorization cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)), so friends would re-PIN often unless it's lengthened.
- **iOS standalone:** the login page is on `<team>.cloudflareaccess.com`, which is out of scope. That's the same failure mode as B. Expect friends to end up signed in to the in-app Safari view rather than the app.

### B. "Sign in with Google" implemented in Functions

- **Setup:** Google Cloud project → OAuth consent screen (External) → Web client with redirect URIs `https://<project>.pages.dev/api/auth/google/callback` and `http://localhost:8788/api/auth/google/callback`. Redirect URIs must be HTTPS (localhost exempt), and their TLD must be on the public suffix list ([Google web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)). Apps requesting only `openid email profile` are exempt from test-user limits and the 7-day expiry, even while in Testing ([Google publishing status](https://support.google.com/cloud/answer/15549945)).
- **Code:** `/start` sets `state` and a PKCE verifier in a short `SameSite=Lax` cookie and redirects. `/callback` checks `state`, exchanges the code with the client secret, reads `email` and `email_verified` from the ID token (taken straight from Google's token endpoint over TLS), finds `players.email`, and issues our own session (same as E). Secrets are `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- **iOS standalone:** the main risk (see "What decides it", point 2). The workaround is to sign in with Google in Safari, then hand the session to the app with a typed device code. That needs all of E anyway.

### C. Email magic links or codes via Cloudflare Email Service

- Email Sending "requires Workers Paid" for arbitrary recipients. That's 3,000/month included, then $0.35 per 1,000 ([Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)). "Before you onboard a sending domain, you can send emails only to verified destination addresses," and "You can only send from your routing domains" ([limits](https://developers.cloudflare.com/email-service/platform/limits/)). **It needs a custom domain and the $5/month plan.** A domain via Cloudflare Registrar is sold at cost, roughly $10–15/year for common TLDs ([Registrar](https://www.cloudflare.com/products/registrar/)).
- On iOS it would have to be a typed code, not a link (links open Safari).
- **Not viable without a domain.** Revisit if a domain is bought and the owner wants self-service recovery.

### D. Passkeys (WebAuthn)

- Works on `pages.dev`, with the RP ID set to the full hostname. Needs no third party.
- **Code:** server-side verification with no library. Use `response.getPublicKey()` (SPKI, importable with `crypto.subtle.importKey("spki", …)`) at registration so we don't need a CBOR parser ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AuthenticatorAttestationResponse/getPublicKey)). At login, convert the DER ECDSA signature to raw r‖s and verify over `authenticatorData ‖ SHA-256(clientDataJSON)`. Also check challenge, origin, rpIdHash and flags.
- It still needs a way to enrol the first passkey (an invite code), so it's E plus more.
- Passkeys sync through iCloud Keychain, so they should work in both Safari and the installed app. No primary source confirms WebAuthn inside iOS standalone mode, so **test on a phone before relying on it.**
- **A good later upgrade for self-service recovery, not needed for M3.**

### E. Owner-issued invite codes → session cookie (recommended)

- **Owner setup:** none beyond the Cloudflare account. The first admin code comes from a script run once.
- **Code:** random tokens, SHA-256 hashes in D1, one cookie, and one check per write route. No secrets.
- **Public reads, gated writes:** all `GET` routes are public. Every mutating route calls `requireRole()` on the server.
- **iOS standalone:** codes are typed into our own page and the cookie comes back on a same-origin `fetch`. It lands in whichever jar the friend is using. Home-screen apps are exempt from ITP's 7-day storage cap ([WebKit](https://webkit.org/tracking-prevention/)).
- **Weaknesses:**
  - A code shared in a group chat could be used by someone else. Codes are single-use, bound to one player, and expire in 7 days, and the owner can revoke sessions.
  - Recovery depends on the owner or on another signed-in device. That's acceptable for 6–10 friends.

## Recommendation

Build **E**, and keep **B** or **D** as optional later add-ons that reuse E's `sessions` table.

1. **Least friction:** one paste per device, then 180 days with no prompt. Nobody installs anything, consents to Google, or waits for email.
2. **It works in the home-screen app,** which is how the group actually uses the site. A, B and C all leave the origin or rely on a tapped link.
3. **Least code and setup:** no IdP console, no Zero Trust payment card, no secrets to rotate, no domain. The owner's only Cloudflare work is the account, D1 and deploy.
4. **Good enough security for the stakes,** a hobby game log. Tokens have 256 bits of entropy and are stored hashed. Codes have 50 bits, are single-use and expire. Cookies are HttpOnly and SameSite. Every edit is attributed, edits keep revisions, and deletes are soft.

## Platform note: Pages vs Workers

The Pages docs now open with "Start new projects with Workers" ([Pages](https://developers.cloudflare.com/pages/)), and there's an official migration guide ([migrate from Pages](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)). Pages Functions are still supported and billed like Workers.

**Recommendation: stay on Pages for M3,** as already decided:
- `<project>.pages.dev` is shorter than `<worker>.<account-subdomain>.workers.dev`.
- File-based `functions/` needs no build step.
- `wrangler pages dev public` matches the plan.

Keep all logic in `server/` (plain ES modules) and make `functions/api/[[path]].js` a three-line adapter. A later move to Workers then only means:
- a new `src/worker.js` entry
- `assets.directory = "public"`, `not_found_handling = "single-page-application"` and `run_worker_first = ["/api/*"]` ([worker script routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/))

This is an owner decision (see the end of this doc).

## Auth design (option E)

**Tokens.**
- Session token: 32 bytes from `crypto.getRandomValues`, base64url.
- Invite/device code: 10 characters of Crockford base32 (no I, L, O, U), shown as `XXXXX-XXXXX`. That's 50 bits. Input is normalised: uppercase, strip spaces and dashes, map `O→0` and `I/L→1`.
- D1 stores only `SHA-256(token)` as hex, looked up by equality, so a DB leak doesn't leak live sessions. There's no pepper and no secret to manage.

**Cookie.** `__Host-sid=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=15552000` (180 days). On `http://localhost`, use name `sid` without `Secure` (choose by `url.protocol`), because Safari won't store `Secure` cookies over http. It's sliding: when `last_seen_at` is more than 24h old, extend `expires_at` and re-send the cookie. `pages.dev` is a public suffix, so other `*.pages.dev` sites are cross-site. They can't set or read our cookies, and `SameSite=Lax` keeps the cookie off their cross-site POSTs.

**CSRF.** Writes are `POST`/`PUT`/`PATCH`/`DELETE` with `Content-Type: application/json`, and the server rejects them unless the `Origin` header matches the request's own origin. Together with `SameSite=Lax`, that's sufficient.

**XSS.** Names and notes are user text. Always render them through `esc()`/`textContent`. HttpOnly keeps the token away from scripts.

**Flows.**
- *Invite:* the admin opens Games → Friends, picks or creates a player, and taps "Make invite code". `POST /api/admin/invites` returns `{code, expires_at}` once. The UI shows the code with a Share button (`navigator.share`) and the link `https://<project>.pages.dev/games/join#code=XXXXX-XXXXX`. The code goes in the fragment so it never reaches server logs.
- *Join:* `/games/join` pre-fills from `#code` if present, otherwise the friend pastes it. `POST /api/auth/redeem` sets the cookie. The page says: "Using the home-screen app? Open it and paste the code there."
- *Another device or the app:* a signed-in friend taps "Sign in on another device". `POST /api/auth/device-code` returns a code valid for 15 minutes for *themselves*, to type into the other context.
- *Sign out:* `POST /api/auth/logout` deletes that session row. The admin can revoke all of a player's sessions.
- *Bootstrap:* `node scripts/invite.mjs --remote "Name" admin` (or `--local`) generates a code and prints it. It inserts the player if missing, plus an invite row holding the code's hash, via `npx wrangler d1 execute ti4-table --remote --command "…"`, escaping `'` in names.

**Roles.**
- `none`: on the roster only, can't sign in.
- `editor`: can add and edit any game, and add players.
- `admin`: editor rights, plus invites, roles and revoking sessions.

Any editor can edit any game, because the group is small and trusted. Mistakes are recoverable from `game_revisions`.

## D1 schema (refined)

Changes from the draft:
- `player_count` is derived from seats.
- The players table *is* the allowlist (`role`).
- Added `sessions`, `invites`, `game_revisions`, soft delete, and an idempotency key (`client_id`) so a double-tap on a flaky connection can't log the same game twice.
- Partial unique indexes enforce one winner and one starting speaker per game.
- Foreign keys are enforced by default in D1 ([foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)).

```sql
-- migrations/0001_init.sql
CREATE TABLE players (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role        TEXT NOT NULL DEFAULT 'none' CHECK (role IN ('none','editor','admin')),
  email       TEXT UNIQUE COLLATE NOCASE,           -- unused by E; kept for a later Google/passkey add-on
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE games (
  id               INTEGER PRIMARY KEY,
  client_id        TEXT NOT NULL UNIQUE,            -- crypto.randomUUID() made when the form opens
  played_on        TEXT NOT NULL CHECK (played_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  points_to_win    INTEGER NOT NULL DEFAULT 10 CHECK (points_to_win BETWEEN 4 AND 20),
  variant          TEXT,                            -- e.g. 'pok', 'pok+te'; owner to confirm values
  map_string       TEXT,
  ti_assistant_url TEXT,
  notes            TEXT NOT NULL DEFAULT '',
  created_by       INTEGER NOT NULL REFERENCES players(id),
  updated_by       INTEGER NOT NULL REFERENCES players(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deleted_at       TEXT                              -- soft delete; NULL = live
);
CREATE INDEX games_played_on ON games(played_on DESC) WHERE deleted_at IS NULL;

CREATE TABLE seats (
  game_id          INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id        INTEGER NOT NULL REFERENCES players(id),
  faction          TEXT NOT NULL,                   -- rules.json page id, e.g. 'F_arborec' (see note)
  color            TEXT,
  seat_index       INTEGER CHECK (seat_index BETWEEN 0 AND 7),   -- clockwise from seat 0; NULL = unknown
  points           INTEGER NOT NULL CHECK (points BETWEEN 0 AND 30),
  is_winner        INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0,1)),
  is_speaker_start INTEGER NOT NULL DEFAULT 0 CHECK (is_speaker_start IN (0,1)),
  PRIMARY KEY (game_id, player_id),
  UNIQUE (game_id, faction),
  UNIQUE (game_id, seat_index)
);
CREATE UNIQUE INDEX seats_one_winner  ON seats(game_id) WHERE is_winner = 1;
CREATE UNIQUE INDEX seats_one_speaker ON seats(game_id) WHERE is_speaker_start = 1;
CREATE INDEX seats_player  ON seats(player_id);
CREATE INDEX seats_faction ON seats(faction);

CREATE TABLE game_revisions (                       -- snapshot before each update/delete
  id         INTEGER PRIMARY KEY,
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,                         -- JSON of game + seats as they were
  edited_by  INTEGER NOT NULL REFERENCES players(id),
  edited_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,                    -- hex SHA-256 of the cookie value
  player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at   TEXT NOT NULL,
  user_agent   TEXT                                 -- shown in the admin list ("iPhone app", "Mac Safari")
);
CREATE INDEX sessions_player ON sessions(player_id);

CREATE TABLE invites (                              -- admin invites and self-serve device codes
  code_hash   TEXT PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  role        TEXT CHECK (role IN ('editor','admin')),   -- NULL for device codes (keep current role)
  created_by  INTEGER REFERENCES players(id),        -- NULL when made by scripts/invite.mjs
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
```

**Writes are one `db.batch()`, which runs as one transaction** ([D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)). To create a game, insert the game, then insert each seat with `game_id = (SELECT id FROM games WHERE client_id = ?)`, so no second round trip is needed. If the `client_id` insert hits a UNIQUE conflict, look up that game and return it (idempotent retry). To update, insert a revision snapshot, update the game, delete its seats and re-insert them, all in one batch.

**Redeem is two steps.** First, claim the invite atomically with `UPDATE invites SET used_at = now WHERE code_hash = ? AND used_at IS NULL AND expires_at > now RETURNING player_id, role`, and proceed only if a row came back. Then run one batch that sets `players.role` (if the invite carries one) and inserts the session.

**Factions.** Store the rules page id (`F_arborec`, `F_keleres`…), the 30 `F_*` pages in `rules.json`, so names stay consistent and can link to the faction page. One page covers two factions (`F_firmament` is "The Firmament / The Obsidian"). The client faction list needs a small override that adds `F_obsidian` pointing at the same page. The API validates factions against a list kept in `server/factions.js`, generated by `build-rules.mjs` or kept by hand. Homebrew factions are an owner decision (see the end of this doc).

**Stats** are computed on the client from one `GET /api/games?full=1`. That's a few hundred games × ≤8 seats, about a few thousand rows read per load, well within the free limit. They live in a pure module `public/js/games/stats.js` that can be run under Node against `db/seed.sql` data for the "matches a hand count" check.

## Migrations layout and config

```
wrangler.jsonc                 Pages config: source of truth once present
migrations/0001_init.sql       schema above (wrangler d1 migrations create ti4-table init)
db/seed.sql                    local-only fake players/games for development and stats checks
functions/api/[[path]].js      adapter: export const onRequest = (ctx) => handle(ctx.request, ctx.env)
server/router.js               method + path → handler; JSON errors
server/auth.js                 tokens, cookie, requireRole(), redeem/device-code/logout
server/games.js  server/players.js  server/admin.js  server/factions.js
scripts/invite.mjs             bootstrap or recovery invite via wrangler d1 execute
```

Pages only treats files in `functions/` as routes, and imports from `../../server/` are bundled by wrangler (checked locally). With only `functions/api/…`, the auto-generated `_routes.json` invokes Functions only for `/api/*`, so static requests stay free and unlimited ([invocation routes](https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes)). **Don't add `functions/_middleware.js`**, since that would run on every request.

```jsonc
// wrangler.jsonc
{
  "name": "ti4-table",
  "pages_build_output_dir": "./public",
  "compatibility_date": "2026-10-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ti4-table",
      "database_id": "<printed by: wrangler d1 create ti4-table>",
      "migrations_dir": "migrations"
    }
  ]
}
```

Once `pages_build_output_dir` is set, this file is the project's config, and dashboard edits to the same fields are locked ([Pages wrangler config](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)). The `database_id` is a resource UUID, not an account ID or a secret, so Cloudflare's own examples commit it. Committing it is fine, but flag it if the repo rule should cover it.

Commands:
```bash
npx wrangler d1 migrations create ti4-table <name>          # new numbered .sql file
npx wrangler d1 migrations apply ti4-table --local          # local
npx wrangler d1 migrations apply ti4-table --remote         # production (needs login)
npx wrangler d1 execute ti4-table --local --file db/seed.sql
```
Applied migrations are recorded in the `d1_migrations` table ([D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)). Never edit an applied migration. Add a new one instead.

**Tooling:** wrangler isn't installed globally. Add a `package.json` with **only** `wrangler` as a devDependency so the version is pinned (this doesn't break the no-runtime-dependencies rule). Or use `npx wrangler@4`.

## API sketch

All responses are JSON. Errors are `{ "error": "message" }` with 400 (validation), 401 (not signed in), 403 (wrong role or bad Origin), 404 or 409. Times are ISO UTC strings.

| Method and path | Auth | Request → response |
|---|---|---|
| `GET /api/me` | public | → `{ "player": null }` or `{ "player": { "id": 3, "name": "Player A", "role": "editor" } }` |
| `GET /api/players` | public | → `{ "players": [{ "id", "name", "archived" }] }` (no roles or emails) |
| `GET /api/games?limit=50&before=<id>` | public | → `{ "games": [{ "id", "played_on", "points_to_win", "variant", "seats": [...] }], "next": <id>\|null }` |
| `GET /api/games?full=1` | public | → every live game with seats (for stats) |
| `GET /api/games/:id` | public | → `{ "game": { …all fields…, "created_by": {id,name}, "updated_by": {id,name}, "seats": [...] } }` |
| `POST /api/auth/redeem` | public | `{ "code": "ABCDE-12345" }` → sets cookie, `{ "player": {...} }`. A bad, used or expired code gets 400 with one generic message. |
| `POST /api/auth/logout` | session | → clears cookie and deletes the session row, `{ "ok": true }` |
| `POST /api/auth/device-code` | editor | → `{ "code": "…", "expires_at": "…" }` (15 min, for self) |
| `POST /api/games` | editor | game body (below) → 201 `{ "id": 12 }`. Same `client_id` again → 200 with the existing id. |
| `PUT /api/games/:id` | editor | game body → `{ "id": 12 }` (writes a revision first) |
| `DELETE /api/games/:id` | editor | → soft delete, `{ "ok": true }` |
| `POST /api/players` | editor | `{ "name": "Guest 1" }` → 201 `{ "id": 9 }` (role `none`) |
| `PATCH /api/players/:id` | editor | `{ "name": "…" }` → `{ "ok": true }` |
| `POST /api/admin/invites` | admin | `{ "player_id": 9, "role": "editor" }` → `{ "code", "expires_at" }` (7 days) |
| `PATCH /api/admin/players/:id` | admin | `{ "role"?: "none"\|"editor"\|"admin", "archived"?: bool }` → `{ "ok": true }`. Setting role `none` also deletes sessions. |
| `GET /api/admin/players` | admin | → players with role, session count, last_seen |
| `DELETE /api/admin/players/:id/sessions` | admin | → revoke all of that player's sessions |
| `POST /api/admin/games/:id/restore` | admin | → undo a soft delete |
| `POST /api/import` | admin | `text/csv` body → `{ "created": n, "errors": [{ "line", "error" }] }` (columns defined in the build plan) |

Game body:
```json
{
  "client_id": "7f0c…",
  "played_on": "2026-10-11",
  "points_to_win": 10,
  "variant": "pok",
  "map_string": null,
  "ti_assistant_url": null,
  "notes": "",
  "seats": [
    { "player_id": 3, "faction": "F_arborec", "color": "green", "seat_index": 0, "points": 10, "is_winner": true,  "is_speaker_start": true },
    { "player_id": 5, "faction": "F_hacan",   "color": "yellow", "seat_index": 1, "points": 8,  "is_winner": false, "is_speaker_start": false }
  ]
}
```

Server validation:
- 3–8 seats, with distinct players and distinct factions
- exactly one winner and at most one starting speaker
- known faction ids
- integer points
- a valid date no later than tomorrow
- `ti_assistant_url` must start with `https://`
- notes ≤ 4,000 characters

**Auth check per request.** Read the cookie, hash it, then `SELECT … FROM sessions JOIN players … WHERE token_hash = ? AND expires_at > now`. That's one indexed read. Mutating routes also check `Origin` and the JSON content type. Role `none` or `archived` means 403 even with a session.

**Service worker.** `sw.js` already skips `/api/`, so API responses are never cached. Add the new `js/games/*` and `css/games.css` files to `PRECACHE` and bump `VERSION`.

## Local development

```bash
npx wrangler d1 migrations apply ti4-table --local
npx wrangler d1 execute ti4-table --local --file db/seed.sql
node scripts/invite.mjs --local "Owner" admin       # prints a code; paste it at /games/join
npx wrangler pages dev                               # http://localhost:8788 (reads wrangler.jsonc)
```

- Checked in a scratch project with wrangler 4.151:
  - local migrations and `pages dev` both run **without `wrangler login`** and with a placeholder `database_id`
  - SPA fallback works (`/games/12` serves `index.html`)
  - `.dev.vars` values appear in `env`
  - partial unique indexes apply
- Local D1 state lives in `.wrangler/state` (gitignored) and persists between runs. Delete that folder to reset.
- **Auth locally is the real thing.** No simulation layer is needed: the bootstrap script with `--local` gives a working code, and the cookie drops `Secure`/`__Host-` on http. To test as another role, make another invite.
- E needs no secrets. `.dev.vars` (already gitignored) is only needed if B is added later (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), with the same names set in production by `npx wrangler pages secret put`.
- `node scripts/serve.mjs` (port 8787) still works for the static-only sections. Games needs `wrangler pages dev` (port 8788).
- To test on a phone, run `npx wrangler pages dev --ip 0.0.0.0` and open the LAN address. The cookie is non-`Secure` on http, so it works. The service worker is off on non-localhost http.

## What the owner does by hand

1. Create a Cloudflare account at dash.cloudflare.com/sign-up and turn on two-factor authentication. Use the Free plan. No Zero Trust or payment card is needed for option E.
2. On the laptop, in the repo: `npx wrangler login` (opens a browser and asks you to approve).
3. Create the database: `npx wrangler d1 create ti4-table`. Paste the printed `database_id` into `wrangler.jsonc`, or hand it to the agent.
4. Create the site: `npx wrangler pages project create ti4-table --production-branch main`. If the name is taken, pick another. It becomes `<name>.pages.dev`.
5. Apply the schema: `npx wrangler d1 migrations apply ti4-table --remote`.
6. Deploy: `npx wrangler pages deploy`. Open `https://<name>.pages.dev` to check.
7. Make your admin login: `node scripts/invite.mjs --remote "<your name>" admin`, then open `https://<name>.pages.dev/games/join` (in the home-screen app too) and paste the code.
8. Add friends: in Games → Friends, add each person and tap "Make invite code", then text them the code.

There are no secrets to set and no identity provider to configure. If B is added later, the extra steps are: Google Cloud console → new project → OAuth consent screen (External, scopes `openid email profile`) → Credentials → OAuth client (Web) with the two redirect URIs above → `npx wrangler pages secret put GOOGLE_CLIENT_ID` and `… GOOGLE_CLIENT_SECRET`.

## Acceptance checks per phase

- **API and schema:**
  - `curl -X POST /api/games` with no cookie returns 401.
  - With an editor cookie but `Origin: https://evil.example` it returns 403.
  - With a valid cookie and body it returns 201.
  - Re-posting the same `client_id` returns the same id.
  - Two winners returns 400.
  - A used or expired code returns 400.
  - An admin route with an editor cookie returns 403.
- **Sessions:**
  - The cookie has `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/` in production.
  - Logout deletes the row.
  - Setting a role to `none` cuts off existing sessions on their next request.
- **UI:** the log form works one-handed at 390 px. Sign-in works inside an **installed iOS home-screen app** on a real phone, which is the case this design exists for.
- **Stats:** the `stats.js` output on `db/seed.sql` matches a hand count written into the seed file's header comment.

## Risks and unknowns

- **Shared codes.** Anyone holding an unused code can claim that player's seat. Mitigations: single use, a 7-day expiry, sending codes 1:1 rather than in a group chat, and the admin's session list and revoke.
- **Lost access.** Deleting the home-screen app or clearing Safari data wipes the session. Recovery needs another signed-in device or the owner. Passkeys (D) are the self-service fix if this becomes annoying.
- **iOS behaviour isn't from a primary source.** Apple doesn't document how standalone mode handles out-of-scope navigation. The evidence above is WebKit's storage-isolation statement plus community reports. E doesn't depend on it, but if B or D is added later, test on a real phone first.
- **Pages' future.** Cloudflare steers new projects to Workers. Pages isn't deprecated, but new features land on Workers. Keeping logic in `server/` keeps a move cheap.
- **Preview deployments.** Top-level D1 bindings in `wrangler.jsonc` also apply to preview deployments, so a branch deploy would write to the production DB. Deploy only `main`, or add an `env.preview` block with a separate database before using previews.
- **Free-tier ceilings.**
  - D1 Free allows 50 queries per Functions invocation ([limits](https://developers.cloudflare.com/d1/platform/limits/)). CSV import must batch rows into few statements, or chunk across requests.
  - The 10 ms CPU limit rules out heavy server-side stats. That's why stats run on the client.
- **Session theft with device access.** A stolen phone with the app open can edit games until the session is revoked. Acceptable for this data.
- **Open questions on Access** (only relevant if the owner prefers A): can the `pages.dev` Access app be narrowed to `/api/write/*`, and does the standalone app receive the cookie? Both are untested.

## Owner decisions needed

1. **Option E (invite codes) vs a recognisable login** such as Google (B) or Access PIN (A). E is recommended. B and A are riskier inside the installed iPhone app.
2. **Stay on Pages** (recommended, `<name>.pages.dev`) or start on Workers (`<name>.<account-subdomain>.workers.dev`, Cloudflare's current default for new projects).
3. **Who can edit what:** any editor can edit or delete any game (recommended, with revisions), or only its creator and admins.
4. **`variant` values:** which expansions or variants the group plays, such as base, PoK and Thunder's Edge. Also whether homebrew factions (Discordant Stars etc.) need a free-text "other" faction.
5. **A custom domain later?** It isn't needed now. It's only needed for email (C) or a nicer URL.
6. **Committing `database_id`** in `wrangler.jsonc` is normal practice and isn't an account ID. Confirm that it's OK under the repo's privacy rule.
