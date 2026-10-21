# TI Assistant: can we import a game from a link?

Researched 2026-10-18. "Verified" means I observed it with curl or by reading the source. "Guess" means inference.

## Verdict

Feasible. A public, unauthenticated JSON endpoint returns a game's setup and full action log. It sends no CORS headers, so the fetch must go through our own Pages Function. Final points are not in the download; for archived games one extra request to the archive list returns the official winner and points (section 4c). Don't derive them from the log. Ask the author before shipping, mainly as a courtesy (see 6).

## 1. Open source (verified)

- Repo: https://github.com/ti-assistant/ti-assistant (public, pushed 2026-09-26, Next.js + Firebase/Firestore, Google App Engine).
- No LICENSE file and GitHub reports `license: null`, so by default all rights are reserved. We can read it to learn the API shape but must not copy its code. Nothing in the repo grants reuse.
- Issues live at https://github.com/ti-assistant/issues/issues. Support links: patreon.com/TIAssistant, buymeacoffee.com/tiassistant.

## 2. URL shapes (verified)

- Live or finished game: `https://ti-assistant.com/en/game/{gameId}` (also `/game/{id}` redirects 307 to `/en/game/{id}`; locale prefix may be en, de, fr, pl, pt-BR, ru).
- Read-only archive view of a finished game: `https://ti-assistant.com/en/archive/{gameId}`.
- Public games list page: `https://ti-assistant.com/en/archive`. Stats: `/en/stats`.
- Game ids are 6 chars, mixed case alphanumeric. Real ids are not recorded here (they are the group's own games, and an id is enough to read a game). Ask the owner for one when testing.
- Parsing rule for our app: take the first path segment after `game/` or `archive/`, match `^[A-Za-z0-9]{4,12}$`, ignore the locale.

## 3. JSON endpoints (verified live, source read at `app/api/...`)

Neither needs auth. No `__NEXT_DATA__` scraping is needed.

### a) One game: `GET https://ti-assistant.com/api/{gameId}/download`
Source: `app/api/[gameId]/download/route.ts`. Returns `Content-Type: application/json`, about 14 to 300 KB.
```
{ "data":   { "factions": [ {color,id,playerName}, ... ],   // array index = map position (seat)
              "speaker": <int>,                              // index into factions = starting speaker
              "options": { expansions[], events[], "game-variant", "map-style",
                           "map-string", "victory-points", "secondary-victory-points", hide... } },
  "timers": {...},
  "actionLog": [ { timestampMillis, gameSeconds, schema:"2.0.0",
                   data:{ action, event:{...}, gameTime, timestamp } }, ... ] }   // newest first
```
Works for any game id, finished or not (I only fetched finished ones). Unknown ids: not tested, so handle non-200 and bad JSON.

### b) Public list: `GET https://ti-assistant.com/api/archived-games[?timestamp={ms}]`
Source: `app/api/archived-games/route.ts`. Returns an object keyed by gameId, 50 games per page, newest first (`orderBy timestampMillis desc`), paged with `startAfter(timestamp)`. Each value (type `ProcessedGame`):
`victoryPoints, playerCount, expansions[], winner (faction name), factions{ "<faction name>": {points, startingTechs, endingTechs} }, gameTime (seconds, 0 if untimed), objectives, rounds, timestampMillis, isMapGame/isObjectiveGame/isPlanetGame/isTechGame/isTimedGame, events`.
It has no player names, colors, seats, map string or speaker. It only lists games that were processed into the archive; the `/download` endpoint is the full source.

Gotcha (verified): for one real game the archive says `victoryPoints: 14` while `/download` options say `victory-points: 10`. Treat the VP target as unreliable when the winner's points exceed it, and let the user edit it.

## 4. Field mapping

| Our field | Where | Notes |
|---|---|---|
| Date | `actionLog` timestamps: min `timestampMillis` = start, `END_GAME` entry (or max) = end. Archive: `timestampMillis`. | Verified. Archive value equalled the earliest log entry for the one game I compared. Date only is enough. Some games have no `END_GAME` (partial log). |
| Points to win | `data.options["victory-points"]` | See the 14 vs 10 mismatch above. |
| PoK flag | `options.expansions` contains `"POK"` | Verified. |
| Thunder's Edge flag | `options.expansions` contains `"THUNDERS EDGE"` | Verified. Others seen: `CODEX ONE`..`CODEX FOUR`, `DISCORDANT STARS`. |
| Map string | `options["map-string"]` | Verified. Space-separated tile numbers, Mecatol omitted (18 numbers for ring 1 and 2, up to 36 for ring 3), plus `-1`, `0` and `85A3` style entries for hyperlanes. Can be `""` (map not entered). `options["map-style"]` was `standard` in every sample. Likely compatible with the planned map analyzer (guess; check against its parser). |
| Player name | `data.factions[i].playerName` | Free text typed by the group; may be a nickname. |
| Faction | `data.factions[i].id` | See id spelling below. |
| Color | `data.factions[i].color` | Capitalized English: Red, Orange, Blue, Green, Yellow, Purple, Black, Magenta seen. |
| Seat | index `i` in `data.factions` (code: `factions[faction.mapPosition]`) | Verified in source. Assume the app's seat 1 is index 0. |
| Starting speaker | `data.speaker` (index into `factions`) | Derived by the server from the earliest `ASSIGN_STRATEGY_CARD` `pickedBy`. It is `0` when the log has no card picks (e.g. objective-only games), so it may be wrong; let the user confirm. |
| Final points | Archive: `factions[name].points`. Otherwise computed from the log. | Not in `/download`. The site computes it client-side (`computeVPs`): `SCORE_OBJECTIVE` (+ `UNSCORE_OBJECTIVE`), `MANUAL_VP_UPDATE`, Custodians/Imperial, relics, etc. A faithful recomputation means re-implementing their rules, which is risky. |
| Winner | Archive: `winner`. Otherwise highest computed points. | Not in `/download`. |

### Faction id spelling
TI Assistant ids are the English display names, not slugs: `Emirates of Hacan`, `Universities of Jol-Nar`, `Naaz-Rokha Alliance`, `Council Keleres` (the image list confirms the name; Keleres sub-faction choice is a separate `CHOOSE_SUB_FACTION` action, not checked), `Xxcha Kingdom`, `Sardakk N'orr`, `Embers of Muaat`, `Federation of Sol`, `Naalu Collective`, `Nekro Virus`, `Mahact Gene-Sorcerers`, etc. Homebrew and Discordant Stars show up as names too (`Savages of Cymiae`, `El Nen Janovet`). Prototype a lookup table from TI Assistant name to our `F_hacan`, `F_jol_nar`, `F_naaz_rokha`, `F_keleres` ids: lowercase, strip non-letters, then an explicit alias map for `Universities of Jol-Nar` -> `F_jol_nar`, `Emirates of Hacan` -> `F_hacan`, `Naaz-Rokha Alliance` -> `F_naaz_rokha`, `Council Keleres` -> `F_keleres`. Unknown names should fall back to a blank faction the user picks.

### Missing or unreliable
Final points and winner (derive or use archive), exact VP target, speaker in sparse logs, game end in partial logs, a planned game's date, and anything about player identity (names are not tied to our users).

## 4b. A real archived-game export (owner's file, 2026-10-17)

The owner downloaded the data file of one of the group's own archived games: 6 players, April 2026, about 320 KB, 942 log entries. The id and names are deliberately not recorded here. It has the same top-level shape (`data`, `timers`, `actionLog`), but it differs from what section 4 assumes:

- **`data.factions` is an empty list, and `data.speaker` is 0.** Faction, color, seat and player name are only available from the `ADVANCE_PHASE` log entries. Each one carries `event.factions`, an object keyed by faction name: `{ id, color, mapPosition, playerName, order, techs, ... }`. It also carries `event.state`: `{ round, phase, speaker, ... }`. All 18 snapshots agreed on `mapPosition`, `color` and `playerName`. The earliest snapshot (the log is newest first, so it's the last entry) is round 1 `SETUP`. Its `state.speaker` is the starting speaker, as a faction name. Round 1's first `ASSIGN_STRATEGY_CARD` `pickedBy` agreed with it.
- **`options["map-string"]` is `""`.** No map was entered. There is one `SWAP_MAP_TILES` entry, which we ignore.
- **`options.expansions`** is `POK, CODEX ONE…FOUR, THUNDERS EDGE`. `victory-points` is 10.
- **The date** comes from the earliest `timestampMillis`, which is the game's start day. The game ran past midnight, so `END_GAME` is the next calendar day. Use the start.
- **Faction names** are those of `F_deepwrought`, `F_rebellion`, `F_jol_nar`, `F_naaz_rokha`, `F_creuss` and `F_ral_nel`, all without "The". `factionId()` in `public/js/factions.js` matches all six.
- **No points or winner fields, again.** There are 47 `SCORE_OBJECTIVE` events, `{faction, objective}` with no VP value. There are no `MANUAL_VP_UPDATE` entries, and Imperial points and Custodians aren't separate events. Points can't be derived without an objective VP table. The last `SCORE_OBJECTIVE` before `END_GAME` names a faction that is *probably* the winner, but that is a guess, not data.

So a parser must read `data.factions` when it's non-empty, otherwise the `ADVANCE_PHASE` snapshots. The speaker comes from the earliest snapshot's `state.speaker`, otherwise `data.speaker`.

## 4c. Final scores for one game (verified 2026-10-17 against the owner's game)

- **The archive page** (`/en/archive/{id}`) server-renders a `gameData` object into its Next.js payload. Its `objectives[name].scorers` lists factions, with repeats for Imperial Point and Support for the Throne. The page adds up the VP values from its own objective definitions. That needs their scoring tables, so we don't replicate it.
- **The log disagrees with that state.** The page counts Imperial Point twice and the Custodians Token once, and none of those appears as a `SCORE_OBJECTIVE` entry. The log also has three `SCORE_OBJECTIVE` entries that the page doesn't count. Don't derive scores from the log.
- **One request gets the official result.** `GET /api/archived-games?timestamp={start + 1}`, where `start` is the earliest `timestampMillis` in the log, returned that game as the **first** of 50 entries. Its `winner` and `factions[name].points` exactly matched the totals the page shows: winner on 10, the rest on 8, 8, 7, 7, 7. The archive entry's `timestampMillis` equals `start`. It covers archived games only. Keep only the matching key, and discard the other entries, which are other groups' games.

## 5. CORS, auth, rate limits (verified)

- `GET /api/{id}/download` and `/api/archived-games` with `Origin: https://example.com` return 200 with no `Access-Control-Allow-Origin`. `OPTIONS` returns 204 with `allow: GET, HEAD, OPTIONS` and no CORS headers. A browser `fetch` from our origin would be blocked. Use a Pages Function (`functions/api/...`) that fetches server-side and returns the trimmed result.
- No auth, cookies or tokens needed for either endpoint. Anyone with the game id can read the game (the id is effectively the secret; `enterPassword` exists for editing, not reading).
- No rate-limit headers observed (I made about 10 requests). Unknown whether the host throttles. Nothing is documented.
- `robots.txt` on ti-assistant.com returns the Next.js app's HTML shell, not a robots file, so there are no crawl rules.

## 6. ToS and etiquette

- I found no ToS, API documentation, privacy page or license on the site or in the repo. The README only covers running locally. The FAQ and supporters pages mention nothing about data use.
- The endpoints are the site's own internal API (used by its archive and stats pages). It is undocumented and could change without notice. The author offers no API guarantee. Maintainer handle visible in CODEOWNERS: @SephHawkins (public).
- Recommendations:
  - Fetch only on explicit user paste of one link, once, server-side, with a descriptive User-Agent (e.g. `ti4-table/1.0 (+repo URL)`), cache for a few minutes, and cap response size (logs reach hundreds of KB).
  - Do not bulk-crawl `archived-games`.
  - Return only the fields we need, and never store the action log. Player names come from the log, so they should be a prefill the user can edit.
  - Validate the id format strictly so the Function cannot be used as an open proxy (fixed host `ti-assistant.com`, fixed path).
  - Fail soft: if the fetch or parse fails, keep manual entry and show the link.
  - Opening an issue at https://github.com/ti-assistant/issues/issues to tell the author and ask whether a stable endpoint is acceptable is cheap and polite. Do not block the feature on it, but do not copy their source.
