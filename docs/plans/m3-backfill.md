# Plan: log past games (from memory, paste import, TI Assistant link)

## Goal

The group can put its history into the log, even when nobody remembers the scores, and future games can be filled in from a TI Assistant link. The work is in three phases. Build them in order, one agent per phase, and the orchestrator reviews each before the next starts.

- **Phase A:** "from memory" games, with stats that handle unknowns
- **Phase B:** paste import, for many old games at once (admin page, no new API)
- **Phase C:** fill a game from a TI Assistant link (new API endpoint)

Depends on `docs/plans/refactor-ui.md` being done. It provides `games/validate.js`, `games/form-state.js` and `games/combo.js`. Read `docs/research/ti-assistant.md` before phase C.

Ground rules for every phase:
- Follow CLAUDE.md: vanilla ES modules, the server's SQL rule (fixed strings, `?` binds), copy in plain sentence case, and the design tokens.
- Add any new `public/` file to `PRECACHE` in `sw.js` and bump `VERSION`.
- `npm run check:api`, `npm run check:ui` and `node scripts/check-stats.mjs` must pass at the end of each phase, with new checks added as listed.
- **Never put real TI Assistant game ids or real player names in the repo** (fixtures, docs, checks). Use made-up ids like `AbC123` and names like "Player 1".

---

## Phase A: games logged from memory

### Data (`migrations/0003_from_memory.sql`)

- `games.from_memory INTEGER NOT NULL DEFAULT 0 CHECK (from_memory IN (0,1))`.
- `games.date_precision TEXT NOT NULL DEFAULT 'day' CHECK (date_precision IN ('day','month','year'))`. `played_on` stays a full `YYYY-MM-DD` so sorting still works. A month-precision game is stored as `YYYY-MM-01`, and a year-precision game as `YYYY-01-01`.
- `seats.points` becomes nullable. SQLite can't drop NOT NULL, so rebuild `seats` exactly as `0002_planned_games.sql` does, including every index. Copy that file's pattern.
- Update `db/seed.sql` with two from-memory games:
  - one with month precision, no points and one unknown faction
  - one with year precision and points for some seats only

  Update its hand-count comment.

### Rules (in `games/validate.js` `checkGameBody`, so the client and server agree)

| | live game (`from_memory` false) | from memory |
|---|---|---|
| points | required, 0–30 (as now) | each seat: 0–30 or `null` |
| faction | required when finished | may be `null` (shown as "Faction not remembered") |
| winner | exactly one, derived from the top score in the form | exactly one, **picked directly** |
| date | `day` precision only | `day`, `month` or `year`; the date must match the precision (`-01` / `-01-01`) |
| status | planned or finished | finished only (`from_memory` with `planned` is a 400) |

- A from-memory seat with points greater than the winner's points is allowed, because people misremember.
- The hourly create limit in `server/games.js` (30 per player per hour) stays for live games. From-memory games get their own count of 200 per hour, using the same query plus `AND from_memory = 1`.
- The revision snapshot (`revisionInsert`) and `revertGame` must include `from_memory` and `date_precision`. Old snapshots without them restore as `0` and `'day'`. Use `COALESCE`, as `status` does.
- `GET` responses include `from_memory` (boolean) and `date_precision`.

### Form

- Add a checkbox near the date: "Logging an old game from memory". It's hidden in plan and finish modes.
- When it's checked:
  - **Date:** a precision select (Exact day / Month / Year), and the date input switches to match: `type=date`, `type=month`, or a 4-digit number input.
  - **Points:** each seat's stepper gains an "Unknown" state. Points start at Unknown, and the stepper shows "?".
  - **Winner:** chosen with a radio per seat ("Won"), not derived from points.
  - **Faction:** may be left blank.
- The draft (localStorage) keeps these fields. `sanitiseDraft` must accept them.

### Display

- **Dates:**
  - month precision shows as "July 2024"
  - year precision shows as "2024"
  - the list's day column (`dayShort`) shows the month name or "—"

  Add helpers to `games/ui.js` next to `dayShort`/`dayLong`.
- **Unknown points** show as "?" in the seat list. The score line (`scoreLine` in `view.js`) leaves unknowns out, and shows nothing when no points are known.
- **From-memory games** show a quiet "From memory" note in the game's sub-line. That means plain text in `--dust`, not a badge.

### Stats (`games/stats.js`, keep it pure)

| Stat | From-memory handling |
|---|---|
| `winsByPlayer` | Unchanged. Wins and games count. |
| `byFaction` | Skip seats with a null faction. |
| `averagePoints` | Skip null points. Return `{ avg, n }`, and update the caller. |
| `headToHead` | Compare points only when both are known. Add `unknown`: games together where either is unknown. |
| `seatEffects` | Skip null points in the average, and count wins as before. |

- The stats page adds one line under the game count: "N of these were logged from memory, so some scores and factions are missing." Show it only when N > 0.
- Extend `scripts/check-stats.mjs` with the two new seed games, and update the hand counts.

### Checks to add to `check-api.mjs`

- from-memory game with null points → 201
- live game with null points → 400
- from memory + planned → 400
- month precision with `played_on` 2024-07-15 → 400
- year precision 2024-01-01 → 201
- the from-memory limit doesn't consume the live limit
- a revert restores `from_memory`

---

## Phase B: paste import (admin only)

### Approach

A new page at `/games/import`, linked from the Admin page only.

1. The page parses pasted text **in the browser**.
2. It shows a preview.
3. It then creates games one at a time through the existing `POST /api/games`, with `from_memory: true`.

There's **no new endpoint**. `client_id` is `import-` plus a hash of the normalised line (SHA-256 via `crypto.subtle`, first 24 hex characters), so pasting the same text twice creates nothing new. That works because the API already returns the existing id for a known `client_id`.

### Format (show it on the page with an example)

One game per line. Fields are separated by `|`. Blank lines and lines starting with `#` are ignored.

```
date | seats | options | notes
2024-07 | Player 1: Sol 10*, Player 2: Hacan 7, Player 3: ? | vp=10 pok | Long one
2023 | Player 1: Jol-Nar*, Player 2: Xxcha, Player 4: Naalu
```

- **date:** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. This sets the date precision.
- **seats:** comma-separated `name: faction [points] [*]`.
  - `*` marks the winner. Exactly one is required.
  - `?` or an empty value means the faction isn't known.
  - Points are optional.
  - Seat order is the order written, but `seat_index` stays null because positions aren't known.
- **options** (optional): space-separated `vp=N` (default 10), `pok` / `nopok` (default PoK on), `te`.
- **notes** (optional): the rest of the line.

### Matching

- **Factions:** use `factionId()` from `public/js/factions.js`, which already normalises "The", hyphens and apostrophes. Also accept short names: the last word, or the name without its prefix, such as "Sol", "Hacan", "Jol-Nar", "Naaz-Rokha", "L1Z1X", "Keleres". Do this through a small alias map in a new pure module `games/match.js`. Phase C reuses it.
- **Players:** match names to the roster from `GET /api/players`, ignoring case and extra spaces.
  - The preview lists each unknown name once, with a choice: "Add as a guest" (`POST /api/players`) or "Same as …" (a select of existing players).
  - Nothing is created until the admin presses the import button.

### Preview and import

- **Table:** one row per line, showing the date, the seats (winner marked), and either "Ready" or a plain error such as "Line 4: no winner marked (put * after the winner)". Lines with errors are skipped, never guessed.
- **Button:** "Import N games". It creates the guests first, then the games, sequentially, with progress shown ("12 of 40"). The result lists links to the new games and any failures with the server's message.
- **Parser:** pure, in `games/import-parse.js`. Add `scripts/check-import.mjs` with at least 15 cases: each error, each date form, `?` factions, aliases, a duplicate player in one line, two winners, and a CRLF paste.

### Security

- The page is admin-only in the UI. The API rules already apply to every write, so an editor who finds the page can do no more than the normal form allows.
- Players are created through the existing endpoint, which has the 40-character limit and the uniqueness check.

---

## Phase C: fill from a TI Assistant link

### Endpoint: `GET /api/ti-assistant/:gameId`

Signed-in editors only. Add it to `server/router.js`, and put the handler in a new `server/ti-assistant.js`.

- `:gameId` must match `^[A-Za-z0-9]{4,12}$`. The route regex enforces it, so there's no `:id` reuse: add a separate route pattern. Anything else → 400. The client extracts the id from a pasted URL (`/game/{id}` or `/archive/{id}`, with any locale prefix).
- **Fetch:**
  - Fetch only `https://ti-assistant.com/api/${gameId}/download`. The host and path are fixed, so this can't be an open proxy.
  - Use `redirect: "error"` and a timeout of 8 s (`AbortSignal.timeout`).
  - Send `User-Agent: ti4-table (+https://github.com/wpknox/ti4-table)`.
  - Read the body as a stream and abort past **2 MB**.
  - Non-200, non-JSON or too large → 502, "TI Assistant didn't return that game. Check the link, or fill the form in by hand."
- **Rate limit:** 20 fetches per player per hour. Use a new table `ti_fetches (player_id INTEGER NOT NULL, at TEXT NOT NULL)`, indexed, and prune rows older than an hour on each call, as `redeem_attempts` does. Over the limit → 429.
- **Cache:** use `caches.default`, keyed by the TI Assistant URL, for 5 minutes. Store the **trimmed** result only.
- **Returns** only the trimmed fields below. Never return or store the action log.

```js
{ played_on: "YYYY-MM-DD",          // date of the earliest actionLog timestampMillis (UTC)
  points_to_win: 10,                 // options["victory-points"], clamped to 4..20, else 10
  pok: true, te: false,              // options.expansions includes "POK" / "THUNDERS EDGE"
  map_string: "…" | null,            // options["map-string"], trimmed, null if empty; ≤ 2000 chars
  speaker_index: 0 | null,           // data.speaker, null if the log has no ASSIGN_STRATEGY_CARD
  seats: [{ seat_index, name, faction_name, faction, color }] }
  // seat_index = array index; name = playerName (≤ 40 chars, trimmed);
  // faction = our F_ id via games/match.js, or null; color = mapped to games/names.js COLORS
  //   (Magenta -> pink; unknown -> null)
```

Use `server/ti-assistant.js` for the parsing, as a pure function `trimTiGame(json)`. Treat every field as untrusted: check types, cap string lengths, and cap seats at 8. Test it with `scripts/check-ti-assistant.mjs` against a **made-up** fixture in `scripts/fixtures/ti-assistant.mjs`. Build the fixture from the shape in the research doc, with fake names and a fake id.

Points and winner are **not** provided. The research doc explains why: they aren't stored in the download, and recomputing them means re-implementing TI Assistant's scoring. The person fills them in.

### Form

- On `/games/new` only: above the date, add a field "TI Assistant link" with the button "Fill from TI Assistant".
- On success, the form fills in:
  - date, points to win, expansions, map string, seat count and positions, factions, colours and speaker
  - the TI Assistant link field
  - players, by matching names against the roster with the phase B matcher. An unmatched name leaves the player empty, with a hint under the seat: "TI Assistant calls this player 'X'". Use `esc()`.
- A toast says "Filled from TI Assistant. Add the final points and winner." Nothing is saved until the person presses save.
- On failure, show the server's message. The form stays usable.

### Security review (owner rule: before this deploys)

The orchestrator does this review. The agent lists the checks it believes it covered in its summary. Cover:
- SSRF: the host and path are fixed and the id is validated
- response size and time limits
- the per-player rate limit
- no reflection of TI Assistant text without `esc()`
- signed-out → 401
- a role-`none` cookie → 401

Add `check-api` cases for:
- signed out → 401
- a bad id (`../x`, 13 characters, `ab_cd`) → 400
- the rate limit → 429

`check-api` must not call the real TI Assistant. When `env.TI_ASSISTANT_BASE` is set, fetch from that base instead; the check script points it at a local stub it serves itself. Rules for the override:
- Set it only with `wrangler pages dev --binding TI_ASSISTANT_BASE=…` inside the check script. Never set it in `wrangler.jsonc`, and never from anything in a request.
- With it unset (production), the base is the fixed `https://ti-assistant.com`.

### Courtesy

When phase C is ready, the owner will open an issue at https://github.com/ti-assistant/issues/issues to tell the author. Don't copy any TI Assistant source code; it has no licence.

---

## Out of scope

- Computing points or winner from TI Assistant logs
- Crawling or bulk-importing the TI Assistant archive
- Spreadsheet (CSV/XLSX) upload
- Editing several games at once
- Showing unknown dates on a calendar
