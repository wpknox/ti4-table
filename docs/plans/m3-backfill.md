# Plan: log past games (from memory, TI Assistant link)

## Goal

The group can put its history into the log, even when nobody remembers the scores, and future games can be filled in from a TI Assistant link. The work is in two phases (a paste import was planned as phase B and dropped by the owner on 2026-10-18: the old games are few and remembered, so the form is enough). Build them in order, one agent per phase, and the orchestrator reviews each before the next starts.

- **Phase A:** "from memory" games, with stats that handle unknowns
- **Phase C:** fill a game from a TI Assistant link or file, scores included for archived games (new API endpoint)

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
- The hourly create limit in `server/games.js` (30 per player per hour) applies to from-memory games too, unchanged.
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
- a revert restores `from_memory`

---

## Phase C: fill from a TI Assistant link or file

### Endpoint: `GET /api/ti-assistant/:gameId`

Signed-in editors only. Add it to `server/router.js`, and put the handler in a new `server/ti-assistant.js`.

- `:gameId` must match `^[A-Za-z0-9]{4,12}$`. The route regex enforces it, so there's no `:id` reuse: add a separate route pattern. Anything else → 400. The client extracts the id from a pasted URL (`/game/{id}` or `/archive/{id}`, with any locale prefix).
- **Fetch:**
  - Fetch only `https://ti-assistant.com/api/${gameId}/download`. The host and path are fixed, so this can't be an open proxy.
  - Use `redirect: "error"` and a timeout of 8 s (`AbortSignal.timeout`).
  - Send `User-Agent: ti4-table (+https://github.com/wpknox/ti4-table)`.
  - Read the body as a stream and abort past **2 MB**.
  - Non-200, non-JSON or too large → 502, "TI Assistant didn't return that game. Check the link, or fill the form in by hand."
- **Final scores (second fetch, archived games only).**
  1. After a successful download, take `start`, the earliest `timestampMillis` in the log.
  2. Fetch `https://ti-assistant.com/api/archived-games?timestamp=${start + 1}`, with the same fixed host, limits and User-Agent. The archive list is newest first and pages with `startAfter`, so the game starts the page.
  3. Use the entry **whose key equals `gameId`** and nothing else, and drop the other 49 entries straight away. Verified against the owner's real game: the entry is there, with `winner` and `factions{name:{points}}` matching the archive page (research doc section 4c).
  4. If this fetch fails, or the id isn't in the page (a live or unarchived game), return the setup without scores. That isn't an error. It counts as the same rate-limit unit as the download.
- **Rate limit:** 20 fetches per player per hour. Use a new table `ti_fetches (player_id INTEGER NOT NULL, at TEXT NOT NULL)`, indexed, and prune rows older than an hour on each call, as `redeem_attempts` does. Over the limit → 429.
- **Cache:** use `caches.default`, keyed by the TI Assistant URL, for 5 minutes. Store the **trimmed** result only.
- **Returns** only the trimmed fields below. Never return or store the action log.

```js
{ played_on: "YYYY-MM-DD",          // date of the earliest actionLog timestampMillis (UTC)
  points_to_win: 10,                 // options["victory-points"], clamped to 4..20, else 10
  pok: true, te: false,              // options.expansions includes "POK" / "THUNDERS EDGE"
  map_string: "…" | null,            // options["map-string"], trimmed, null if empty; ≤ 2000 chars
  speaker_index: 0 | null,           // see "Sources" below
  scores_from_archive: true | false, // true when the archive entry was found
  seats: [{ seat_index, name, faction_name, faction, color,
            points: 7 | null,        // archive factions[faction_name].points, integer 0..30, else null
            is_winner: true|false }] } // archive winner === faction_name; false when no archive entry
  // seat_index = array index; name = playerName (≤ 40 chars, trimmed);
  // faction = our F_ id via games/match.js, or null; color = mapped to games/names.js COLORS
  //   (Magenta -> pink; unknown -> null)
```

Put the parsing in a pure, shared module `public/js/games/ti-assistant.js`. It exports `trimTiGame(json)` for the download, and `applyArchiveScores(trimmed, archiveEntry)` for the scores. `server/ti-assistant.js` imports both, and the form's file upload uses `trimTiGame`. `applyArchiveScores` keeps points only when they're integers 0–30. It sets one winner only when `winner` names exactly one seated faction, otherwise none.

- **Treat every field as untrusted.** Check types, cap string lengths, and cap seats at 8.
- **Sources, in order** (see research doc section 4b):
  1. Seats: `data.factions` if it's a non-empty array. Otherwise the `event.factions` of the earliest `ADVANCE_PHASE` entry, which is the last array element because the log is newest first. Use `mapPosition` as `seat_index`.
  2. Speaker: the earliest `ADVANCE_PHASE`'s `state.speaker` (a faction name). Otherwise `data.speaker` (an index), but only if the log has `ASSIGN_STRATEGY_CARD` entries.
- **Tests:** `scripts/check-ti-assistant.mjs`, against **made-up** fixtures in `scripts/fixtures/ti-assistant.mjs`. Build them from the shapes in the research doc, with fake names and fake ids. Write one fixture per shape: live-game `data.factions`, the archived export with empty `data.factions` and `ADVANCE_PHASE` snapshots, and an archive page holding the game plus two other games.
- **Live check:** the owner has a real archived export, outside the repo. Ask the orchestrator to run the parser on it. Never copy it into the repo.

Never compute points from the action log. It disagrees with the archive: Imperial and Custodians points are missing, and some objectives scored after the game ended are present (research doc section 4c). Use the archive entry or nothing.

### Matching (`public/js/games/match.js`, new, pure)

- **Factions:** use `factionId()` from `public/js/factions.js`, which already normalises "The", hyphens and apostrophes. All six faction names in the owner's real export matched it.
- **Players:** `matchPlayer(name, roster)` compares a TI Assistant `playerName` with the roster from `GET /api/players`, ignoring case, accents and extra spaces. It returns the player id or null. Only an exact normalised match counts: no fuzzy matching, because a wrong match credits a win to the wrong friend.
- Test both in `scripts/check-ti-assistant.mjs`.

### Form

- On `/games/new` only: above the date, add a field "TI Assistant link" with the button "Fill from TI Assistant".
- On success, the form fills in:
  - date, points to win, expansions, map string, seat count and positions, factions, colours and speaker
  - the TI Assistant link field
  - players, by matching names against the roster with `matchPlayer`. An unmatched name leaves the player empty, with a hint under the seat: "TI Assistant calls this player 'X'". Use `esc()`.
- Fill points and the winner too, when `scores_from_archive` is true. The toast then says "Filled from TI Assistant. Check it, then save." Otherwise it says "Filled from TI Assistant. Add the final points and winner." Nothing is saved until the person presses save.
- On failure, show the server's message. The form stays usable.
- **Next to the link field, offer "Or load a TI Assistant file"** (`<input type="file" accept="application/json,.json">`). It reads the file in the browser (max 5 MB, `JSON.parse` in a try) and runs the same `trimTiGame`. The file never leaves the phone, so no server call is needed. This covers archived games and the data file TI Assistant offers for download. It fills the same fields, except the link and scores. If the file name looks like TI Assistant's download, `<id>_data.json` with an id matching the regex, also offer "Get the final scores from TI Assistant". That calls the endpoint with the id. Without that id, the person adds the scores by hand.

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
