# TI4 Table

A phone-friendly companion site for a group that plays *Twilight Imperium 4*.

**Live at [ti4-table.pages.dev](https://ti4-table.pages.dev).**

## What's in it

| Section | Status |
|---|---|
| **Rules** | Built |
| **Map** | Built |
| **Games** | Built |
| **Ask** | Planned |

- **Rules:** search the Living Rules Reference, with Dane's official rulings highlighted.
  - Type a rule number (`58.3`), a term (`sustain damage`), shorthand (`AFB`), or a whole question (`can I retreat into an empty system`).
  - Tap any paragraph number to copy or share a link straight to it.
  - Works offline once it's installed.
- **Map:** paste a map string and get a plain-English fairness report for each seat. It covers resources, influence, tech skips, distance to Mecatol, shared or contested systems, and where Thunder's Edge could go.
  - Each report has a hex map. Tap a seat to outline its slice.
  - Switch between **Analysis** (planet values) and **Tile art** (the real tiles).
  - Turn on **Tile numbers** in either view to see each tile's number, including the A/B face of hyperlanes. That's the view for building the map on the table.
- **Games:** the group's shared game log and stats. You need to sign in.
  - **Sign-in:** friends sign in with an invite code from an admin, or claim their seat from a game's join link. There are no public accounts.
  - **Logging:** after a game, log the seats, factions, points and winner. If the game was in TI Assistant, the form can fill itself in from it.
  - **Planned games:** set a game up ahead of time, then enter the results after it's played.
  - **Stats:** wins, factions played, head-to-head and seat effects. Planned games don't count until they're finished.
- **Ask** *(planned)*: plain-English rules questions answered with links to the exact paragraph.

## Install it on your phone

It's a web app, so you add it to your home screen instead of installing it from an app store.

- **iPhone:** open the site in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** open the site in Chrome, tap the **⋮** menu, then **Install app** (or **Add to Home screen**).

On iPhone the home-screen app keeps its own sign-in, separate from Safari. If you signed in in Safari first, open **Games → Me → Sign in on another device** there to get a code, then type the code into the home-screen app.

## Game day

### 1. Plan the game

- **From Games:** tap **Plan a game**. Add a seat per player. The map string is optional, so you can add it later with **Edit plan**.
- **From a map:** make the map in [Milty draft](https://milty.shenanigans.be) (or anywhere that gives you a map string), paste it into **Map**, check the seats, then tap **Plan a game on this map**. You get one seat per map seat.

Pick a player for each seat, and a faction if you know it. Friends without an account yet can be added by name as guests.

### 2. Link TI Assistant and Milty (all optional)

The game form has four optional fields. Fill in what you use and skip the rest.

| Field | What it's for | Who sees it |
|---|---|---|
| **TI Assistant link** | "Open in TI Assistant" on the game page. For a finished game, **Fill from TI Assistant** reads the seats, factions, speaker and final scores from it. | Everyone signed in |
| **TI Assistant password** | Only if your TI Assistant game has one. Shown on the game page with a **Copy password** button, so players can join from their phones. | Everyone signed in |
| **Milty draft link** | "Open the Milty draft" on the game page. | Everyone signed in |
| **Milty admin passkey** | Milty keeps a draft's admin passkey in the browser that made it. Save it here to manage the draft from another computer: copy it from the game page and paste it into **Restore session** on the draft page. | Only the game's creator and admins |

The links work on their own. A password or passkey needs its link, so the form won't save a TI Assistant password without a TI Assistant link, or a Milty passkey without a Milty link. If you remove a Milty link, its passkey is removed too.

TI Assistant links must be on `ti-assistant.com`, and Milty links on `milty.shenanigans.be`.

### 3. Bring friends in with a join link (admins)

1. On the game page, tap **Make join link**, then **Copy link** or **Share**, and send it to the group.
2. Each friend opens it, picks their name from the game's guest seats, and confirms. They're signed in as that player (an editor), and every game they were already in stays theirs.

Only guests who have never signed in can be claimed, and each seat only once. A link lasts 7 days, and **Stop join links** ends it early. If someone claims the wrong seat, an admin opens **Admin**, sets that player's role back to **none**, and taps **Sign out everywhere**. Then make that player an invite code instead.

### 4. Set up the table

Open the game's map, then turn on **Tile numbers** (in **Tile art** if you like) and lay out the tiles to match.

### 5. After the game

Open the planned game and tap **Enter results**. If it was in TI Assistant, **Fill from TI Assistant** gets the final scores.

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
node scripts/check-map-svg.mjs    # map drawing, including tile numbers
node scripts/check-stats.mjs      # stats against a hand count of the seed data
npm run check:api                 # the games API, including security checks
PLAYWRIGHT_CORE=<dir>/node_modules/playwright-core/index.mjs npm run check:ui   # Chrome smoke test of every section
```

`check:ui` needs `playwright-core` installed outside the repo, for example `npm i --prefix ~/.cache/ti4-table-pw playwright-core`.

## Deploying

The site runs on Cloudflare Pages, with Pages Functions and D1. The first deploy:

```bash
npx wrangler pages project create ti4-table --production-branch main
npx wrangler d1 migrations apply ti4-table --remote
npx wrangler pages deploy
node scripts/invite.mjs --remote "Your name" admin
```

After that, sign in at `/games/join` with the printed code. Invite friends from the Admin page in Games, or with a join link. Most friends should be **editors**: editors log games and edit the ones they created or played in. Give one other person **admin** as a backup.

Later deploys run `npx wrangler d1 migrations apply ti4-table --remote` (it applies only new migrations), then `npx wrangler pages deploy`.

## Updating the rules

Rules come from a local clone of [tirules-search](https://github.com/wpknox/tirules-search):

```bash
node scripts/build-rules.mjs path/to/tirules-search   # or set TIRULES_DIR
```

## Credits and license

Full credits are in [`CREDITS.md`](CREDITS.md). In short:

- **Rules text:** [tirules-search](https://github.com/wpknox/tirules-search), a fork of [dangothemango/tirules](https://github.com/dangothemango/tirules) by dangothemango and BradleyΣ, with Dane's rulings. It's GPL-3.0, so this project is GPL-3.0 too (see `LICENSE`).
- **Map tile data:** converted from the [TI4 Tabletop Playground mod](https://github.com/darrellanderson/TI4-TTPG-TS) and cross-checked against [AsyncTI4](https://github.com/AsyncTI4/TI4_map_generator_bot), which also supplied the legendary planet ability text. Both are under the Unlicense, which covers their code and data but not their art. Details are in `docs/research/tile-data.md`.
- **Faction symbols and tile images:** artwork © Fantasy Flight Games, used under the Asmodee fan content policy for a free, non-commercial fan site. The art will be removed promptly if its owner asks.
- **TI Assistant and Milty draft:** games link to [TI Assistant](https://ti-assistant.com) and [Milty draft](https://milty.shenanigans.be), and the game form reads a TI Assistant game you point it at. No code from either is used.
- **Space backdrop:** the Hubble eXtreme Deep Field (NASA, ESA, and the HUDF09 Team), CC BY 4.0.
- **Fonts:** [Saira](https://fonts.google.com/specimen/Saira) and [Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next), both under the SIL Open Font License 1.1.

*Twilight Imperium* is © Fantasy Flight Games. This is an unofficial fan site and isn't affiliated with or endorsed by Fantasy Flight Games or Asmodee.
