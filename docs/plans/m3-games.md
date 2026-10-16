# M3: Game log and stats (first server-backed milestone)

## Goal

A shared record of the group's games. Anyone with the link can browse it. Friends **sign in individually** (owner's decision) to add or edit games. Stats come from the log.

## Decisions already made

- **Hosting:** Cloudflare Pages for `public/`, Pages Functions in `functions/` for `/api/*`, D1 (SQLite) for data. Free tier.
- **Editing:** individual sign-ins, not a shared passcode. Viewing is public.
- **Sign-in:** owner-issued invite codes that become a session cookie (`docs/research/auth-and-backend.md`, option E).
- **Who can edit a game:** its creator and any editor seated in it; admins can edit or delete any game. Only the creator or an admin can delete.
- **Expansions:** base, Prophecy of Kings, Thunder's Edge (`pok`, `te` flags on a game). Official factions only: no homebrew, no Discordant Stars.
- **Front end:** vanilla JS, same design system.
- **Custom domain:** not now. A later stretch goal, possibly with SSO.

## Open questions (resolved 2026-10-15; the research doc is the build spec and wins where this draft differs)

1. **Sign-in mechanism.** Options to compare:
   - Cloudflare Access in front of `/api/write/*` (or the whole edit UI) with one-time PIN to email, or Google as the identity provider. Pages Functions read the verified identity from `Cf-Access-Jwt-Assertion`. Questions: does Access work on a `*.pages.dev` production hostname, or does it need a custom domain? Can one path be gated while the rest stays public? Free seat limit? How does it behave in a home-screen web app on iOS?
   - "Sign in with Google" implemented in Functions (OAuth code flow, session cookie in D1).
   - Email magic links via Cloudflare Email Service.
   Pick the least code and least friction for about 6–10 friends, then record why.
2. **Allowed users:** an allowlist of emails in D1 or an env var. The owner adds friends.

## Data model (draft, refine in the research doc)

```sql
players(id, name, email NULL, created_at)          -- people, whether or not they sign in
games(id, played_on, player_count, points_to_win, map_string NULL, ti_assistant_url NULL,
      notes, created_by, created_at, updated_at)
seats(game_id, player_id, faction, color, seat_index NULL, points, is_winner, speaker_start BOOLEAN)
```
Factions are stored as strings. Their names come from `rules.json` (the `F_*` pages) so they stay consistent.

## Features

- **Log a game:** a fast form on a phone at the end of the night. Pick players from the roster; pick each faction from a list, typing to filter; enter points; the winner is chosen automatically from the top score and can be overridden. Optional map string, linked to the M2 analyzer, plus notes.
- **Game list and detail pages.**
- **Stats:**
  - wins and games by player
  - win rate by faction
  - factions each player has never played, which helps pick next game's faction
  - seat/speaker effects once there's enough data
  - head-to-head records
  - average points
- **Import:** a CSV import, for if the group starts a Google Sheet before this ships.
- **Stretch:** read the end-of-game summary from TI Assistant. Investigate whether it exposes one before promising this.

## Phases

1. Research doc (auth + schema + local dev story: `wrangler pages dev` with a local D1).
2. ~~Owner creates a Cloudflare account and runs `wrangler login`.~~ Done: wrangler is logged in on the owner's machine (Pages and D1 write scopes). Still to do: `wrangler d1 create ti4-table` and create the Pages project.
3. API + schema migrations + seed data.
4. UI: log form, list, detail, stats.
5. Deploy, then add friends to the allowlist.

## Acceptance

Defined per phase in the research doc. Minimum:
- Unsigned visitors can read but not write. The write endpoints reject them server-side, not just in the UI.
- The form is usable one-handed at 390px.
- Stats match a hand count on seed data.
