# Plan: Milty draft link and admin passkey, and the TI Assistant game password

## Goal

The owner makes maps on Milty draft (https://milty.shenanigans.be). A game gets two optional fields:

1. **Milty draft link**, e.g. `https://milty.shenanigans.be/d/<id>`. Anyone who can see the game sees "Open the Milty draft" next to "Open in TI Assistant".
2. **Milty admin passkey.** Milty keeps a draft's admin passkey only in the browser that made the draft (`localStorage admin_<id>`). On another machine the owner has to paste it into the "Restore session" box on the draft page. Milty has no link that does this, so we store the passkey and show it with a **Copy passkey** button. Only the game's **creator** and **admins** can see or change it.

Milty facts, from its source at github.com/shenanigans-be/miltydraft: the draft route is `/d/{id}`, and the admin secret is `bin2hex(random_bytes(8))`, i.e. 16 lowercase hex characters.

## Owner rules added during the build (2026-10-20)

- All four fields are optional, but a password or passkey needs its link. A TI Assistant password with no TI Assistant link gives 400 `PAIR_TI`, and a Milty passkey with no Milty link gives 400 `PAIR_MILTY`. Both messages come from the shared validator and also show inline in the form.
- Clearing the Milty link, whether by an edit or a revert, clears the stored passkey too, even when the editor can't see it.

## Data

`migrations/0006_milty.sql` (number it after whatever the last migration is when you start; `0005_join_links.sql` should exist):

```sql
ALTER TABLE games ADD COLUMN milty_url TEXT;
ALTER TABLE games ADD COLUMN milty_admin_pass TEXT;
ALTER TABLE games ADD COLUMN ti_assistant_password TEXT;
```

## TI Assistant game password (owner request, added late)

A TI Assistant game can have a password that players must enter before they can change it. The owner wants it on our game page so friends can join from there.
- `ti_assistant_password`: null or a trimmed string of 1–100 characters with no control characters (empty → null). It is **not** a secret here, because Games already needs a sign-in. So it behaves exactly like `ti_assistant_url`: anyone who can edit may set it, everyone who can view the game sees it, and it goes in revisions and revert (`COALESCE`/`json_extract` → null for old snapshots). It is never in the list response.
- Form: a **TI Assistant password** text input right under the TI Assistant link (`autocomplete="off"`, `spellcheck="false"`, `autocapitalize="off"`). Hint: "If the TI Assistant game asks for a password, put it here so everyone can find it."
- If the TI Assistant import (phase C, `form.js` around the `f-ti` handling) resets fields, it must leave this one alone.
- Game page: next to "Open in TI Assistant", show "Password: <code>…</code>" with a **Copy password** button (toast "Password copied."). It's shown even if there's no link.
- Checks: round-trip create/update/GET; over-long → 400; present in revisions; revert restores it; a viewer who isn't an editor or seated still sees it on GET; absent from the list.

## Validation (`public/js/games/validate.js`, shared with the server)

- `milty_url`: null or a string ≤ `LIMITS.tiUrl` characters that passes a new `isMiltyUrl(s)`. That function works like `isTiAssistantUrl`: `https:`, host `milty.shenanigans.be` or `www.milty.shenanigans.be`, no username/password/port, no whitespace. Export it, and alias it in `ui.js` like `safeTiLink` (e.g. `safeMiltyLink`). Error: "The Milty link must be an https://milty.shenanigans.be link."
- `milty_admin_pass`: null or `/^[0-9a-f]{8,64}$/i` after trimming. Error: "A Milty admin passkey is letters a–f and numbers, like 3f9a1c0b7d2e4a6f." Allow 8–64 characters in case Milty changes the length.

## Server (`server/games.js`, `server/admin.js`)

- `milty_url` behaves exactly like `ti_assistant_url` everywhere: insert, update, `GET /api/games/:id`, the list rows if TI Assistant shows there, revisions JSON (`revisionInsert`), and revert in `admin.js` (use `COALESCE`/`json_extract` the same way, so reverting to an old snapshot without the key gives null).
- `milty_admin_pass` is different:
  - **Visibility:** returned by `GET /api/games/:id` only when the viewer may delete the game. Use the existing creator-or-admin helper at `server/games.js:16`. Otherwise the key is **absent** (not null). Never return it in `GET /api/games` (the list).
  - **Create:** whoever creates the game is its creator, so they may set it.
  - **Update:** if the editor may delete the game (creator or admin), the body's value is saved (null clears it). If not, the stored value is **kept** whatever the body says. Write it with fixed SQL (two fixed statements, or `CASE WHEN ? THEN ? ELSE milty_admin_pass END`).
  - **Revisions:** leave it **out** of the revision JSON. Revert must not touch it. That way history, which admins can read, never copies it around, and a revert never brings back an old passkey.
- Note in a comment: it's stored in plain text because we have to show it back. It only unlocks undo/regenerate on one Milty draft, so that's acceptable.

## Front end

- **Form** (`form-html.js`, `form-state.js`, `form.js`): add **Milty draft link** under the TI Assistant link (same input style, `type="url"`, placeholder `https://milty.shenanigans.be/d/…`). Show **Milty admin passkey** (`type="text"`, `autocomplete="off"`, `spellcheck="false"`, `autocapitalize="off"`, inputmode text) only when the viewer is the creator or an admin. For a new game that's always. For an edit, show it when the GET response had the key present. Hint under it: "Only you and admins can see this. Paste it into Restore session on the Milty draft page." Keep it in state, drafts and `form-state.js`'s load/save the same way as the TI link. Client-side validation uses the shared validator.
- **Game page** (`view.js` `renderGame`):
  - Add `Open the Milty draft` to `links` (same `target="_blank" rel="noopener noreferrer"`).
  - When `milty_admin_pass` is present, add a small block: "Milty admin passkey" with the passkey hidden behind **Show passkey**, plus **Copy passkey** (`navigator.clipboard.writeText`, toast "Passkey copied."). Keep it quiet (muted text, no card).
- `esc()` on every interpolated value.

## Acceptance checks

`scripts/check-api.mjs` (keep everything else passing):
1. Create with a good `milty_url` + passkey → stored. A non-Milty host, `http:`, a URL with credentials, or a passkey with non-hex → 400.
2. GET as the creator → the passkey is present. GET as a seated editor who isn't the creator → the key is absent. GET as an admin → present. The list never has it.
3. A seated non-creator editor PUTs the game with `milty_admin_pass: "deadbeefdeadbeef"` or `null` → the stored value is unchanged. The creator PUTs `null` → it's cleared.
4. The revision JSON has no `milty_admin_pass`. Revert leaves the current passkey alone. Revert restores `milty_url`. Reverting to a snapshot from before 0006 gives `milty_url` null.

`scripts/check-ui.mjs`: the game page shows "Open the Milty draft" when the link is set, and the creator sees **Copy passkey**. No console or CSP errors, and no horizontal scroll at 390px.

Screenshots of the form fields and the game page (390×844, dark and light) into `.playwright-mcp/`.

## Out of scope

Fetching anything from Milty (no API call or import; just links), Milty player passkeys, other draft sites.

## Conventions

Read `CLAUDE.md` first. Don't commit; the orchestrator reviews and commits.
