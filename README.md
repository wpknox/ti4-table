# TI4 Table

A phone-friendly companion site for a group that plays *Twilight Imperium 4*.

## What's in it

| Section | Status |
|---|---|
| **Rules** | Built |
| **Map** | Built |
| **Games** | Built, not deployed yet |
| **Ask** | Planned |

- **Rules:** search the Living Rules Reference, with Dane's official rulings highlighted.
  - Type a rule number (`58.3`), a term (`sustain damage`), shorthand (`AFB`), or a whole question (`can I retreat into an empty system`).
  - Tap any paragraph number to copy or share a link straight to it.
  - Install it to your home screen and it works offline.
- **Map:** paste a map string and get a plain-English fairness report for each seat. It covers resources, influence, tech skips, distance to Mecatol, and shared or contested systems. Each report has a hex map with that seat's slice outlined, and you can switch to the real tile art.
- **Games:** the group's shared game log and stats.
  - **Sign-in:** friends sign in with invite codes from an admin. There are no public accounts.
  - **Logging:** after a game, log the seats, factions, points and winner, plus an optional map string and TI Assistant link. Games with a map show it on their page, labelled with each player and faction.
  - **Planned games:** set a game up ahead of time from the Map page by picking a player and, optionally, a faction for each seat. Enter the results after the game.
  - **Stats:** wins, factions played, head-to-head and seat effects. Planned games don't count until they're finished.
- **Ask** *(planned)*: plain-English rules questions answered with links to the exact paragraph.

## Running locally

Rules and Map are static, so they need no install and no build step:

```bash
node scripts/serve.mjs        # http://localhost:8787
```

Games needs the API (Cloudflare Pages Functions and a D1 database), so run it through wrangler:

```bash
npm install
npm run db:migrate:local      # create the local database
npm run db:seed:local         # optional: fake games for trying stats
node scripts/invite.mjs --local "Your name" admin   # prints a sign-in code
npm run dev                   # http://localhost:8788, then sign in at /games/join
```

## Checks

There are no unit tests yet. These scripts check the parts that are easy to get wrong:

```bash
node scripts/check-map.mjs        # map string parsing against real maps
node scripts/check-analysis.mjs   # seat analysis against hand-checked fixtures
node scripts/check-map-svg.mjs    # map drawing
node scripts/check-stats.mjs      # stats against a hand count of the seed data
npm run check:api                 # the games API, including security checks
```

## Deploying

The site is hosted on Cloudflare Pages, with Pages Functions and D1. It isn't deployed yet. The first deploy is:

```bash
npx wrangler pages project create ti4-table --production-branch main
npx wrangler d1 migrations apply ti4-table --remote
npx wrangler pages deploy
node scripts/invite.mjs --remote "Your name" admin
```

After that, sign in at `/games/join` with the printed code. Invite friends from the Admin page in Games. Most friends should be **editors**: editors log games and edit the ones they created or played in. Give one other person **admin** as a backup.

## Updating the rules

Rules come from a local clone of [tirules-search](https://github.com/wpknox/tirules-search):

```bash
node scripts/build-rules.mjs path/to/tirules-search   # or set TIRULES_DIR
```

## Credits and licence

Full credits are in [`CREDITS.md`](CREDITS.md). In short:

- **Rules text:** [tirules-search](https://github.com/wpknox/tirules-search), a fork of [dangothemango/tirules](https://github.com/dangothemango/tirules) by dangothemango and BradleyΣ, with Dane's rulings. It's GPL-3.0, so this project is GPL-3.0 too (see `LICENSE`).
- **Map tile data:** converted from the [TI4 Tabletop Playground mod](https://github.com/darrellanderson/TI4-TTPG-TS) and cross-checked against [AsyncTI4](https://github.com/AsyncTI4/TI4_map_generator_bot). Both are under the Unlicense, which covers their code and data but not their art. Details are in `docs/research/tile-data.md`.
- **Faction symbols and tile images:** artwork © Fantasy Flight Games, used under the Asmodee fan content policy for a free, non-commercial fan site. The art will be removed promptly if its owner asks.
- **Space backdrop:** the Hubble eXtreme Deep Field (NASA, ESA, and the HUDF09 Team), CC BY 4.0.
- **Fonts:** [Saira](https://fonts.google.com/specimen/Saira) and [Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next), both under the SIL Open Font License 1.1.

*Twilight Imperium* is © Fantasy Flight Games. This is an unofficial fan site and isn't affiliated with or endorsed by Fantasy Flight Games or Asmodee.
