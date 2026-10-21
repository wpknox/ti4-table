# Visual assets: what we may use, and from where

Research for the "more space-themed, show off" pass: faction icons, space imagery and game-style icons. Checked 2026-10-15. No asset files were added to the repo. Samples used for size tests were kept outside it.

This is a license reading, not legal advice. "Confirmed" means I read the primary page or license file. "Not confirmed" is called out.

## Owner decision (2026-10-15)

**Use the official faction symbols** (option a). The site is free, has no ads or donations, and is a website at heart. The owner accepts the small, known risk of a takedown request.

Conditions we keep, from the fan policy:
- credit Twilight Imperium and Fantasy Flight Games next to the artwork, or in a credits block on the same screen
- a visible "unofficial fan site, not affiliated with or endorsed by Fantasy Flight Games or Asmodee" line site-wide
- never charge, take donations or run ads
- remove the art promptly if asked

The space imagery follows the CC BY plan below. Our own glyphs are still used for traits, tech skips, wormholes and anomalies, which keeps the map's color language ours.

## TL;DR

1. **Faction icons: draw our own (option c).** Asmodee's fan policy lets a *fan-dedicated website* use game art if it is non-commercial, credited and labeled unofficial, but it says in plain words that it "is not a license", that they can make you stop "for any reason", and "Do NOT make Apps". Our site is installable and offline, which sits near that line. I found **no community faction-icon set with an explicit license**. Every public set (TI Assistant's, AsyncTI4's, TTPG's, a 700 KB "TI4 Icons" SVG on GitHub) is either unlicensed or carves out art. So: simple original glyphs per faction (monogram or abstract mark in the faction's own accent), designed so official symbols could be dropped in later. Option (a) is the fallback if the owner accepts a small, known risk; exact attribution text is in the details.
2. **Space imagery: ESA/Hubble, ESA/Webb and ESO (all CC BY 4.0) plus NASA public domain.** Best fit for the `--void` navy: the Hubble eXtreme Deep Field (nearly black, galaxy specks). A 1000 px AVIF of it is about **36 KB**, so a budget of **one background per theme at 150 KB or less** is easy. Credit must be visible and unaltered.
3. **Game icons (traits, tech skips, wormholes, resource/influence): same ownership problem as faction icons** (FFG's art). For planet traits, tech colors and wormholes, draw our own (colored dots, hexes and rings already match the design doc's `--tech-*` tokens). Where an illustrative icon is wanted, **game-icons.net (CC BY 3.0, some CC0)** is the usable generic source, with per-icon author credit. It has no hexagon, wormhole or nebula icon; closest are Vortex and Galaxy.
4. **License fit:** CC BY 4.0 and CC0 media can sit in a GPL-3.0 repo as separate works with their own license and a CREDITS file. CC BY-SA 4.0 is one-way compatible into GPLv3 but adds copyleft headaches for no benefit. **Avoid anything NC, ND, "personal use only", or "free for personal and commercial use" packs without a license file.** Put credits in a `CREDITS.md` and on a short credits/about screen in the app (CC BY needs credit that is visible to users, not just in the repo).

## Sources checked

| Source | What | License / terms as checked | Usable? |
|---|---|---|---|
| [Asmodee North America IP policy](https://www.zmangames.com/ip-policy/) (covers Fantasy Flight Games) | Fan content rules | "not a license"; fan-dedicated websites allowed if free, credited, labeled unofficial; "Do NOT make Apps"; revocable at will | Conditional (risk) |
| [FFG Terms of Use](https://www.fantasyflightgames.com/en/more/terms-of-use/) | Site terms | FFG trademarks not usable "without the express written consent of FFG"; site graphics not to be copied. Page says last revised 2020. No fan-content grant | No (no permission given) |
| [TI Assistant](https://github.com/ti-assistant/ti-assistant) / [ti-assistant.com](https://ti-assistant.com) | Ships faction art in `public/images/factions/*.webp` | **No LICENSE file** (GitHub license API returns 404). Footer: "not affiliated with Fantasy Flight Games" and "Twilight Imperium and all associated images are the property of Fantasy Flight Games" | No (no license; art is FFG's) |
| [AsyncTI4 bot](https://github.com/AsyncTI4/TI4_map_generator_bot) | Map images, emoji, faction data | LICENSE: Unlicense, first line "applies ONLY to the software and tooling, NOT art assets" | Data yes; art no |
| [TI4-TTPG-TS](https://github.com/darrellanderson/TI4-TTPG-TS) | Tabletop Playground mod | Same Unlicense text with the same art carve-out | Data yes; art no |
| [marshallcase/ti4-svg](https://github.com/marshallcase/ti4-svg) | One 700 KB SVG of TI4 logos (`TI4 Icons-4.svg.txt`) | **No license**; it is a trace of FFG art | No |
| [acodcha/ti4-adjutant](https://github.com/acodcha/ti4-adjutant) | Rules summaries plus `icons/planet_*.png`, `technology_*.png` | Repo is CC BY 4.0, but its README says "copyrights and trademarks of everything involving Twilight Imperium 4th Edition are exclusively held by Fantasy Flight Games". The CC BY covers the author's own work only, not FFG's art | No (can't pass on FFG's rights) |
| [TI4 wiki (Fandom)](https://twilight-imperium.fandom.com) | Wiki text and images | Text is CC BY-SA per Fandom's standard terms (not re-fetched: the Fandom page returned HTTP 402 to me). Images are uploaded fan copies of FFG art, so the wiki's license doesn't cover them | No for images |
| tidraft.com / TI4 Lab / Milty draft | Draft and map tools | Milty: no license (see `tile-data.md`). tidraft / TI4 Lab: no public source found | No |
| [game-icons.net](https://game-icons.net/about.html) and [repo license](https://raw.githubusercontent.com/game-icons/icons/master/license.txt) | ~4,000 generic SVG icons | "Creative Commons 3.0 BY or CC0 if mentioned"; credit "Icons made by {author}. Available on https://game-icons.net". CC0 authors named in the file: Viscious Speed, Zeromancer | Yes, with credit |
| [NASA media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) | NASA images | Generally not copyrighted in the US; "NASA should be acknowledged as the source"; insignia/logo not public domain; no implied endorsement; third-party-marked images need the owner's permission | Yes, with care |
| [ESA/Hubble copyright](https://esahubble.org/copyright/) | Hubble images | CC BY 4.0; credit "clear and readable", wording unaltered, not separated from the image; active link online; note any alterations; logo excluded | Yes, with credit |
| [ESA/Webb copyright](https://esawebb.org/copyright/) | Webb images | CC BY 4.0; credit shown under each image, unaltered; logo excluded; note significant changes | Yes, with credit |
| [ESO copyright](https://www.eso.org/public/outreach/copyright/) | ESO images | CC BY 4.0; credit unaltered, active link; changes must be indicated (and any AI use); logo excluded | Yes, with credit |
| [CC compatible licenses](https://creativecommons.org/share-your-work/licensing-considerations/compatible-licenses/), [FSF license list](https://www.gnu.org/licenses/license-list.html) | Compatibility | BY-SA 4.0 is one-way compatible with GPLv3; CC BY 4.0 is a free, non-copyleft license for non-software works; CC0 recommended and GPL-compatible | Reference |

## 1. Faction icons

**Who owns them.** Fantasy Flight Games (Asmodee). The symbols are part of FFG's game art and trademarks. Nobody else has a license to give.

**Is there a fan policy?** Yes, one shared policy for Asmodee North America's studios (FFG included), hosted at [zmangames.com/ip-policy](https://www.zmangames.com/ip-policy/). It shows no revision date, only "© 2026 Z-MAN Games". Relevant terms, quoted:

- Scope: "Fan-dedicates [sic] websites" are listed as an example of a Fan Creation; so are "Artwork using characters or locations" and "Special accessories ... that include our brand logos or game art".
- Non-commercial: "Your Fan Creation must be for your own personal use or freely shared with the community." Selling includes "any type of money exchanging hands ... crowdsourced fundraising ... actively or passively suggesting/requesting donations (like having a Patreon account), or other types of direct or indirect monetary sponsorship". So no donation button, no ads.
- Attribution: "somewhere on or in your Fan Creation you state what game you based the Fan Creation on and include the proper copyright notice on or next to any artwork/images ... Don't forget to credit yourself as well."
- Names: "Only use our brand names and titles as reference to what your Fan Creation is about." (Our site name should lead; the game name only as reference.)
- Not affiliated: "Your Fan Creation must not look affiliated or sponsored by us." Suggested fix: label it "unofficial" or "fan-made", "or in the case of a website, a statement that the site is not affiliated or sponsored by us."
- Substantial copying: "Do NOT include substantial amounts of copied game materials". Examples given: online versions of games (TTS, Vassal), downloadable card files, 3D print files. Twelve-ish faction symbols are not "substantial", but the rules section already shows lots of FFG rules text; that is a separate question the owner has presumably weighed.
- **Apps: "Do NOT make Apps. For licensing and other business reasons, we simply cannot allow our intellectual property in software applications of any kind."** A website is allowed; a home-screen PWA is still a website, but this clause is the main reason I would not lean on the official art.
- Revocable: "this policy is not a license and we reserve our right to require that you stop using our intellectual property for any reason"; "Use of our intellectual property is at your own risk"; "we do not answer specific questions or requests for permission".

**What existing tools do.** TI Assistant ships faction art (about 12 KB WebP each, including Council Keleres and Last Bastion) with no license file, relying on a footer: not affiliated, and "Twilight Imperium™ and all associated images are the property of Fantasy Flight Games®". AsyncTI4 and TTPG ship official art in their mods but say their Unlicense does not cover it. I found no stated permission from FFG to any of them. Not confirmed: whether any of them has written permission; none says so. tidraft.com / TI4 Lab: couldn't find source or stated terms.

**Community or redrawn sets.** Searched GitHub (repo search for "twilight imperium", "ti4 faction", "ti4 svg", "ti4 icons", "ti4 assets") and the web. Found nothing with an explicit open license that is a redraw of faction symbols. The only hit, `marshallcase/ti4-svg`, is a single unlicensed file. Not confirmed: Figma Community, Printables, Thingiverse, BoardGameGeek and Discord files; the search tool could not reach them. If someone finds a set there, check that it is a genuine redraw (not a trace of FFG art) and has a license file.

**Recommendation: (c) draw our own.**
- Make one small SVG per faction (about 30 files, a few hundred bytes each), in the site's own style: a hex-framed monogram or abstract mark, drawn from the faction's name and theme rather than copied or traced from the official symbol. Faction names are not protected as images; the `F_*` page ids give the 30 factions (listed below).
- The Rules section already looks up factions by page id, so name files by that id (`arborec.svg`, `keleres.svg`) so a swap to official art, if ever wanted, changes only the files.
- Don't trace, auto-vectorize or "redraw closely" the official symbols. That would be a derivative of FFG art with none of the policy's cover.

**Option (a), if the owner chooses it anyway.** Exposure: low for a free, private-group site, but revocable and unanswerable. It would need all of: no donations or ads ever; an "unofficial fan-made, not affiliated with or sponsored by Fantasy Flight Games or Asmodee" line on every screen that shows a symbol, or in the footer; the exact copyright notice copied from the rulebook credits page (I did not verify its wording, so copy it from the physical rulebook rather than from me); our name first and "Twilight Imperium" only as reference. Suggested wording, with the bracket filled from the rulebook:

> [Site name] is an unofficial, fan-made companion for Twilight Imperium Fourth Edition. It is free, non-commercial, and not affiliated with or sponsored by Fantasy Flight Games or Asmodee. Faction symbols and game artwork: [copyright notice from the rulebook credits page].

The symbols themselves would have to come from the owner's own copies of the game (photographed or scanned) since no licensed download exists. Risk: takedown at any time, and the "no Apps" clause.

**Option (b) (a licensed community set): not available** as far as I could find.

Factions covered (from `F_*` ids in `public/data/rules.json`): arborec, argent, bastion, creuss, deepwrought, empyrean, firmament, hacan, jol_nar, keleres, letnev, lizix, mahact, mentak, muaat, naalu, naaz_rokha, nekro, nomad, norr, ral_nel, rebellion, saar, sol, ul, vuilraith, winnu, xxcha, yin, yssaril. That is 30 ids. Council Keleres is `F_keleres`.

## 2. Space imagery

**Rules in short**

- **NASA:** generally public domain in the US; credit NASA as source; the NASA insignia and logotype are not public domain; don't imply endorsement. Images NASA marks as third-party copyrighted need the owner's permission. Co-credit lines on Webb and Hubble images (NASA, ESA, CSA, STScI) should be reproduced as given.
- **ESA/Hubble, ESA/Webb, ESO:** CC BY 4.0. Credit must be in full, wording unaltered, kept with the image, active link online. If the image is altered beyond crop and resize (for example darkened or recolored), add a note after the credit, as ESA's own example does: "Original image by ESA/Hubble (M. Kornmesser), warping and recoloring by NN". ESO also wants AI use disclosed. Agency logos are excluded.
- Webb and Hubble images are credited jointly to NASA and ESA; both sets of terms allow this use. Using the ESA CC BY credit line satisfies NASA's "acknowledge the source" as well.

**Candidates** (resolutions and credits as listed on the source pages; license as stated on each agency's copyright page, because the image pages themselves only link to it)

| # | Image | Page | Credit line | Original | Fit for `--void #0a0f24` |
|---|---|---|---|---|---|
| 1 | Hubble eXtreme Deep Field | [heic1214a](https://esahubble.org/images/heic1214a/) | NASA, ESA, G. Illingworth, D. Magee, and P. Oesch (University of California, Santa Cruz), R. Bouwens (Leiden University), and the HUDF09 Team | 2382 x 2078 | Best. Near-black with sparse galaxies. I viewed it |
| 2 | Hubble Ultra Deep Field | [heic0611b](https://esahubble.org/images/heic0611b/) | NASA, ESA, and S. Beckwith (STScI) and the HUDF Team | 6200 x 6200 | Same character, higher resolution for crops |
| 3 | The Milky Way panorama | [eso0932a](https://www.eso.org/public/images/eso0932a/) | ESO/S. Brunier | 6000 x 3000 (public file) | Wide band across the middle, dark top and bottom; good as a header strip with a dark overlay |
| 4 | Webb's First Deep Field (SMACS 0723) | [webb-first-deep-field](https://esawebb.org/images/webb-first-deep-field/) | NASA, ESA, CSA, and STScI | 4537 x 4630 | Dark with bright lensing arcs; needs a veil. Not viewed |
| 5 | (spare) Cosmic Cliffs, combined NIRCam and MIRI | [weic2205b](https://esawebb.org/images/weic2205b/) | NASA, ESA, CSA, and STScI | 11264 x 3904 | Mostly bright gas; only for a cropped dark edge. Probably skip |

I did not vet a specific NASA-only image. Hubble and Webb pages above are the NASA public-domain work as well, so a NASA-library pick would add nothing.

**Size budget.** The site precaches everything and runs from a phone. Tested on candidates 1 and 3 with `avifenc` and `cwebp` (quality settings are my guesses, not tuned):

| Sample | Size |
|---|---|
| HXDF 1000 px wide, AVIF q35 | 35.7 KB (WebP q55: 50.1 KB; JPEG: 267 KB) |
| HXDF 800 px wide, AVIF q35 | 26.8 KB |
| ESO panorama 1280 x 640, AVIF q30 | 18.5 KB (WebP q50: 32.5 KB) |

Recommendation: **at most one background image per theme, each 150 KB or less, plus a combined cap of about 300 KB for all decorative images.** That fits the HXDF as AVIF at up to 1600 px. Keep a WebP twin only if older iOS must be supported (AVIF needs iOS 16+; check before relying on it). Light theme: use a separate pale treatment (a CSS-only gradient or a light star-speck SVG pattern) rather than a light-tinted photo, or keep the starfield only in a dark header band. Serve with a dark overlay so text contrast holds; overlaying and darkening counts as an alteration, so add "darkened" after the credit.

**Credit format** (one line each; put on the credits screen and in `CREDITS.md`):
> Hubble eXtreme Deep Field: NASA, ESA, G. Illingworth, D. Magee, and P. Oesch (University of California, Santa Cruz), R. Bouwens (Leiden University), and the HUDF09 Team. ESA/Hubble, CC BY 4.0. Cropped and darkened.

## 3. Other game-style icons

| Icon | Owner | What I found | Recommendation |
|---|---|---|---|
| Planet traits (cultural, hazardous, industrial) | FFG art | Official versions only in FFG art and in repos that say the art is FFG's (ti4-adjutant PNGs, AsyncTI4 emoji). No licensed redraw found | Draw our own: three simple glyphs (for example a mask or bust, a hazard triangle, a cog) in the `--tech-*`-style palette, or just colored shapes with text labels |
| Tech skips (biotic, propulsion, cybernetic, warfare) | FFG art, but the *colors* (green, blue, yellow, red) are plain game facts | Same as above | Plain color discs or rings using `--tech-*`; the color carries the meaning. Add a letter for color-blind readers |
| Wormholes (alpha, beta, gamma, delta, epsilon) and anomalies (nebula, gravity rift, supernova, asteroid field) | FFG art; Greek letters and the words are not protectable | Nothing licensed | Greek letter in a ring (alpha, beta, gamma), and simple shapes for anomalies. Own work, cheap |
| Resource / influence | FFG art | The design doc's yellow and blue numbers already do this | Keep the colored numerals; no icon needed |
| Decorative, generic (planet, galaxy, ship, star, vortex) | Third-party artists | game-icons.net: Ringed planet (lorc), Jupiter, Planet core, Planet conquest, Solar system, Galaxy, Spaceship, Interceptor ship, Scout ship (delapouite), Rainbow star, Star cycle, Eclipse (lorc), Vortex (lorc). CC BY 3.0 | Usable for empty states or section headers. No hexagon, wormhole or nebula icon exists |

**game-icons.net terms (confirmed).** The [about page](https://game-icons.net/about.html) says the icons are under the Creative Commons 3.0 BY license and gives the credit format "Icons made by {author;}. Available on https://game-icons.net". The [repo license file](https://raw.githubusercontent.com/game-icons/icons/master/license.txt) says "CC 3.0 BY or CC0 if mentioned below" and lists the contributors, naming Viscious Speed and Zeromancer as CC0. GitHub shows the license as "NOASSERTION" because it is a custom file. Each icon needs its own author credited, so list authors per icon used (for example "Lorc, Delapouite"). SVGs are white-on-black by default; the repo's `colorize-svgs.sh` recolors them. The files are 1.5 to 3 KB each. Not confirmed: whether the FSF counts CC BY 3.0 as GPL-compatible (the page I read covers 4.0 only); as separate media files with their own credit this does not arise.

Generic UI icon sets such as Lucide, Tabler or Phosphor (MIT-style) exist but I did not re-check them here; they are not game-themed anyway.

## 4. License compatibility and credits

- **Public domain / CC0:** no conditions; the FSF recommends CC0 for non-software works. Safe.
- **CC BY 4.0 (ESA, ESO):** a free, non-copyleft license per the FSF. It does not clash with GPL-3.0 as long as the images stay separate files with their own license stated (the repo's GPL covers our code and text, not the media). Credit is the only duty.
- **CC BY 3.0 (game-icons.net):** same approach, credit each author.
- **CC BY-SA 4.0:** one-way compatible into GPLv3 per [CC](https://creativecommons.org/share-your-work/licensing-considerations/compatible-licenses/) and FSF, so allowed, but nothing we need uses it and it would pull share-alike terms into whatever we derive from it. Avoid unless there is a strong reason. (This also applies to Fandom wiki text, which we only used as a fact tie-breaker.)
- **Avoid:** anything NC (non-commercial) or ND (no derivatives; we resize and recolor), "personal use only" packs, Gumroad or marketplace packs without a license file, and anything whose license says only "free to use". The site is non-commercial, but NC licenses are not free licenses and a public GPL repo invites reuse that NC would block.
- **Where credits go.** Two places:
  1. `CREDITS.md` at the repo root (or `docs/`), one line per asset: what, author, license with URL, changes.
  2. A short credits block inside the app (the existing credits surface for the rules authors is the natural home; CLAUDE.md already requires crediting dangothemango and BradleyΣ where rules content is shown). ESA, ESO and game-icons require the credit to be visible to users, and ESA wants it "clear and readable" and not separated from the image. A tap-through "Credits" link in the footer plus the credit line near the image on that screen meets this. Repo-only credits would not.
- **Fan-policy notices** (if any FFG material is shown): see the wording under option (a), placed in the same credits block and the footer.
- **Service worker:** add any new image to `PRECACHE` in `sw.js` and bump `VERSION`, per CLAUDE.md.

## Not confirmed

- Whether FFG or Asmodee have ever given written permission to TI Assistant, AsyncTI4, TTPG, TI4 Lab or tidraft. None of them states any.
- The exact copyright notice wording in the TI4 rulebook credits page (not fetched; it is a physical-book fact).
- Whether the Asmodee policy treats a home-screen PWA as an "App". Its text says "software applications of any kind"; I read a website as outside that, but the policy does not define the term. The policy says they won't answer questions.
- Community icon sets on Figma, Printables, Thingiverse, BGG and Discord (unreachable).
- Fandom licensing page (HTTP 402) and per-image licenses on the Fandom wiki.
- AsyncTI4 and TTPG READMEs: no copyright or art statements found by grep, so only their LICENSE text counts.
- Image darkness for candidates 4 and 5 (not viewed); only the HXDF was viewed.
- Whether AVIF is safe for the oldest iOS the group uses.
