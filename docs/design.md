# Design: TI4 Table

_Written 2026-10-15, after reviewing the built Rules section at 390×844 and 1280×800 in both schemes. This is the reference for M2c (map page) and M3 (games). `CLAUDE.md` has the short version; this file has the reasons and the patterns. UI agents read it after loading the frontend-design skill._

## Brief

- **Subject:** Twilight Imperium 4, a six-to-eight-hour space strategy board game.
- **Audience:** one friend group, mostly on phones at the table, sometimes on a laptop or the TV.
- **Primary jobs:**
  - settle a rules question mid-turn
  - check a map is fair before the game starts
  - log the game at the end of the night

None of this is browsing for pleasure. Each visit is a quick look-up at a table with snacks on it.

The visual vocabulary comes from the game, not from "space website":
- **Hex tiles:** the board is hexes.
- **Resource yellow and influence blue:** every planet card prints these two numbers.
- **The four tech colours:** biotic green, propulsion blue, cybernetic yellow, warfare red.
- **Numbers everywhere:** rule numbers, planet values, victory points, seat numbers.

Anyone who has played will recognise these. None of it is decoration we invented.

## Tokens

### Colour

Dark is the default because the game is played in the evening and the board is black. Light is a full theme, not an afterthought. Every token has both values.

| Token | Dark | Light | Means |
|---|---|---|---|
| `--void` | `#0a0f24` | `#eef1f8` | page background (deep navy, not black: the board's space is blue-black) |
| `--hull` / `--hull-2` | `#121a3a` / `#1b2550` | `#ffffff` / `#e2e7f5` | surfaces: inputs, popovers, the selected seat's slice |
| `--seam` | `#2a3566` | `#c5cde4` | lines |
| `--star` | `#e9edff` | `#121833` | text |
| `--dust` | `#a0a9cf` | `#505b7d` | secondary text |
| `--influence` | `#74bcff` | `#1d5fc4` | links, focus, anything you can press; influence values |
| `--resource` | `#f4c542` | `#9a6700` | numbers that are the signature (rule numbers, seat numbers, scores); resource values; rulings |
| `--tech-*` | four colours | same | tech skips on the map and in seat reports. Nowhere else. |
| `--warn` (new) | `#ff9a52` | `#b4530f` | a map finding that needs attention. The only "alarm" colour; `--danger` stays for errors. |

**Rules for colour:**
- Yellow and blue mean resource and influence wherever a planet value appears. Don't use them for anything else on map or game screens, except that blue is also the interactive colour (the game itself uses blue for "you can do this").
- No seat palette. TI4's eight plastic colours collide with resource, influence and tech colours, and eight tints on a small phone map turn into noise. **Seats are identified by number.** A big Saira numeral sits on the home hex. The selected seat's slice gets `--hull-2` fill and a `--star` outline. Shared systems get a diagonal hatch. See "Map" below.
- Player colours in the game log are stored as data (`seats.color`) and shown as a word ("green"), not as a swatch. That's the same reason, and it avoids a pink-on-navy contrast problem.

### Type

Two families, clearly different. Both are self-hosted (offline) and OFL.

- **Saira** (variable width): headings, numbers, controls. Stretch is the expressive axis: 105% for controls, 110–118% for headings, 120–125% for numbers.
- **Atkinson Hyperlegible Next**: reading text. It was chosen for legibility at a glance across a table, which is the whole use case.

**Scale (new tokens; replace the ad-hoc sizes in `rules.css` as you touch them).** It's a ratio of about 1.2 on a 17px reading size:

| Token | Size | Use |
|---|---|---|
| `--t-xs` | 0.8125rem (13px) | credits, fine print |
| `--t-s` | 0.9375rem (15px) | meta lines, table cells, snippets |
| `--t-m` | 1.0625rem (17px) | reading text (`--fs` default) |
| `--t-l` | 1.25rem (20px) | result titles, seat titles |
| `--t-xl` | 1.5rem (24px) | page titles in Map and Games |
| `--t-2xl` | 2rem (32px) | rule page title |
| `--t-num` | 4.5rem (72px) | the one huge outlined number per page |

Numbers always use `font-variant-numeric: tabular-nums` so columns of scores line up.

### Space and shape

- **Spacing steps:** 4, 8, 12, 16, 24, 32, 48. The gutter is 16px.
- **Radius says "you can press this":**
  - inputs and buttons get `--radius-m` (10px)
  - small controls and marks get `--radius-s` (4px)
  - chips are pills
  - content containers get no radius and no box. They're separated by space and `--seam` lines, not by cards.
- **Shadows** only on things that float above the page: the toast, the match bar, popovers.

## The signature: numbers

Spend boldness on numbers and keep everything else quiet. This already works in Rules. Carry it into the new sections in the same way:

| Where | The number | Treatment |
|---|---|---|
| Rule page | rule number | huge outlined Saira, `--resource` stroke (built) |
| Rule paragraphs | 58.3a | hanging gutter, expanded Saira (built) |
| Map | seat numbers | big Saira numeral on each home hex; the same numeral hangs in the gutter of that seat's report |
| Map report | the map's verdict | it's a sentence, not a number, so it's set as the page's title in Saira 118%. No score out of 10: a made-up score would pretend to be more precise than the analysis is. |
| Games list | the date | in the hanging gutter, like rule numbers ("11 Oct") |
| Game page | final scores | big Saira per seat; the winner's score is outlined in `--resource`, like the rule number |
| Stats | win counts | big numerals with the label underneath in reading type. Bars only where a comparison needs them. |

**One huge number per page at most.** The rule page has the rule number. The game page has the winner's score. The map page has none, because the map itself is the big element there.

## Layout

One column, `--measure` (42rem) wide, left-aligned, centred on wide screens. Desktop gets more width only where content benefits: the map beside its report, and stats tables. Desktop isn't a dashboard grid.

### Navigation

The masthead holds the brand and the section links ("Rules  Map  Games") as plain Saira text. The current section is `--star` with a 3px `--resource` underline, the same as the Rules tabs, rather than today's filled pill. Everything else is `--dust`. Three short words fit beside the brand at 390px.

**Why not a bottom tab bar:** the bottom of the screen is already used by the match bar (Rules), the toast, and the "Save game" button (Games). A tab bar there would fight all three. Moving between sections is rare in one visit; you came for one thing.

### Map page (M2c)

```
┌ 390 ──────────────────────────────┐
│ ⬡ TI4 Table   Rules  Map  Games   │
│ ┌───────────────────────────────┐ │
│ │ Paste a map string            │ │  textarea, 3 rows, ≥16px
│ └───────────────────────────────┘ │
│ [Analyse map]  Try an example map │  button + text link
│                                   │
│ Lopsided: seats 1 and 4           │  verdict = page title, Saira 118%
│ stand out.                        │
│                                   │
│        ⬡⬡⬡                         │
│      ⬡⬡⬡⬡⬡      the map, SVG,      │
│     ⬡⬡ 1 ⬡⬡     full width.        │
│      ⬡⬡⬡⬡⬡      Seat numerals on   │
│        ⬡⬡⬡      homes. Tap = slice │
│                                   │
│  1  Strong on resources and       │  seat number hangs in the gutter,
│     influence: 17 optimal, against│  like rule numbers
│     a table average of 9.         │
│     ▸ Details                     │  <details>, metrics table
│ ───────────────────────────────── │
│  2  Close to the table average    │
│     on everything.                │
└───────────────────────────────────┘
```
Desktop (≥ 960px): the map is sticky on the left (about 55%) and the report scrolls on the right. Tapping a seat in either place highlights it in both.

**Hex rendering:**
- Flat-top, as the parser uses.
- Tile fill is `--hull`; red-backed tiles (anomalies, empty red) get a faint warm tint so the board still reads blue/red at a glance.
- Planet values are tiny Saira numerals: resource in `--resource`, influence in `--influence`, as on the cards.
- A tech skip is a 4px dot in its tech colour.
- Wormholes are the Greek letter (α β γ δ ε) in Saira, which is how players say them.
- Anomalies are line glyphs, not colours: supernova as a burst, asteroid field as scattered dots, nebula as wavy lines, gravity rift as concentric rings. That keeps colour for meaning.
- Hyperlanes are thin `--dust` strokes edge to edge.
- Mecatol gets a plain outline. It's important, but it doesn't need decoration.

**Findings markers** use the brand's hex shape, so severity reads as part of the system, not a traffic light:
- warn: a filled hex in `--warn`
- note: an outlined hex in `--dust`
- good: an outlined hex in `--resource`

Each line is text first. The marker is supplementary, so the sentence alone must say whether it's a problem. That covers colour-blind users and readers who skim.

### Games (M3)

**List.** Rows, not cards. This reuses the rules index pattern:
```
 11 Oct   Alex won as The Arborec, 10–8–7–6–5–4
          6 players, 10 points, PoK + Thunder's Edge
```
The date sits in the hanging gutter in `--resource` Saira. The second line is `--dust` prose, separated by commas, not dots.

**Log a game (the form).** It has to work one-handed at 1 a.m.:
- One block per seat. Player and faction are typeahead selects at 48px tall.
- Points use a stepper: −  `8`  +. The numeral is big Saira and the buttons are 44px.
- The winner is set automatically from the top score. It's marked with the outlined-number treatment and can be overridden with "Make winner".
- "Save game" is a full-width sticky button at the bottom, above the safe area. Its label says what happens. While saving it reads "Saving…", and the toast afterwards says "Game saved".
- Expansions are two toggles: "Prophecy of Kings" (on by default) and "Thunder's Edge".

**Sign in.** One field: "Invite code". Set in Saira at 120% stretch with wide letter-spacing, and auto-formatted to `XXXXX-XXXXX` as you type. Don't use a monospace face: a mono label is a generated-UI tell, and Saira's tabular figures already line up. The help text says where the code comes from: "Ask [the admin] for a code. It works once."

## Faction symbols and space imagery

_Added 2026-10-15, after the owner approved the official faction symbols (`docs/research/assets.md`)._

- **Faction symbols:** one monochrome symbol per faction (`public/img/factions/<F_id>.svg`), drawn in `currentColor` so they follow the theme. They're used at text size beside faction names:
  - Rules faction index and faction pages
  - Map home hexes, when the string names the faction
  - the Games list and form

  In the Games list, the winner's symbol is tinted `--resource`. They're never decoration on their own: a symbol always sits next to the faction's name or has it as its accessible label.
- **Space backdrop:** the Hubble eXtreme Deep Field, darkened and cropped, sits behind the masthead and the top of each section's home screen only. It fades into `--void` within about 240px. It's dark theme only; the light theme stays plain. This is the one atmospheric touch. Reading surfaces (rule text, report, forms) are never over imagery.
- **Credits:** a site-wide footer line says "Unofficial fan site. Not affiliated with or endorsed by Fantasy Flight Games or Asmodee." An "About and credits" page lists the image credit (verbatim, linked, with "darkened and cropped"), the faction symbols' owner, and the rules sources.

## Motion

- Motion only responds to the user. Existing examples: the toast slides in; the current search match scrolls into view.
- The map gets one moment. When a seat is tapped, its slice fill fades in (150ms), so you see which tiles changed.
- Nothing animates on page load.
- Everything respects `prefers-reduced-motion` (`base.css` already does this globally).

## Copy

- Sentence case, plain verbs, and buttons that name the result: "Analyse map", "Save game", "Make invite code", "Sign out on this device".
- Empty states say what to do: "No games yet. Log the first one after your next game night." Never "Nothing here!".
- Errors say what happened and how to fix it: "That code has already been used. Ask for a new one."
- **No middle-dot meta strings.** Use prose with commas, or let type do the separating (a yellow Saira number next to a dust label needs no punctuation between them). The `<title>` tag is exempt; separators there are browser-tab convention.

## Fixes for the built Rules section

These came from the 2026-10-15 review. Each one is small. Do them in one pass before M2c, so the new sections copy the corrected patterns.

1. **Middle dots, in `view.js`:**
   - result meta "Rules Reference · 12 paragraphs" → "12 matching paragraphs" (Rules Reference pages) or "Faction notes, 4 matching paragraphs"
   - snippet label `78.4c · Section` → number span + section span, no separator
   - match bar "1 of 33 · “q”" → "1 of 33 for “q”"
   - note label "Section · note 3" → "Section, note 3"
   - "Card notes · …" → "Card notes for …"
   - suggestion "label · page" → "label" plus a muted "in The Ghosts of Creuss"
2. **Eyebrow:** the small "Rules Reference" kind label above the big outlined number is an eyebrow. Remove it from `.rtools`. LRR pages are identified by the number itself. Faction and card pages are identified by their titles ("The Arborec", "Action Cards"), so they need no kind label. _Done 2026-10-15._
3. **Search highlights are too loud.** Many solid yellow marks break a paragraph into fragments, and yellow is meant to signal resources. Make plain matches a 30% `--mark` tint with no padding. The current match keeps the solid fill and the `--current` ring. The tap-snippet-N-lands-on-highlight-N invariant is unaffected (this is CSS only).
4. **Nav style:** replace the filled pill on `.sections a[aria-current]` with the underline treatment above (when the second section ships).
5. **Type scale:** add the `--t-*` tokens to `base.css` and move `rules.css` onto them. The 9 distinct sizes become the 7 above. This shouldn't change anything visibly by more than 1px.

## Checked against the brief (what I changed after a first draft)

- **First draft gave each seat a colour.** That's the default for "players on a map". It was dropped: it collides with the game's own colour meanings and doesn't survive 390px. Numbered seats extend the number signature instead.
- **First draft had a 0–10 fairness score** as the map hero (the "big number, small label" default). It was dropped: the analysis can't honestly support that precision, and the brief is "plain English". The verdict sentence is the hero, with the map.
- **First draft used a bottom tab bar** because it's "an app". It was dropped for the reasons under Navigation.
- **Kept on purpose despite being common:** a dark navy background. The game board is literally that colour, the group plays at night, and the light theme is complete.
