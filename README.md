# TI4 Table

A phone-friendly companion site for a group that plays *Twilight Imperium 4*.

- **Rules:** search the Living Rules Reference, with Dane's official rulings highlighted. Type a rule number (`58.3`), a term (`sustain damage`), shorthand (`AFB`), or a whole question (`can I retreat into an empty system`). Tap any paragraph number to copy or share a link straight to it. Install it to your home screen and it works offline.
- **Map** *(coming)*: paste a map string and get a plain-English fairness report for each seat.
- **Games** *(coming)*: your group's game log and stats.

## Running locally

```bash
node scripts/serve.mjs        # http://localhost:8787
```

No install, no build. The site is plain HTML, CSS and JavaScript modules in `public/`.

## Updating the rules

Rules come from a local clone of [tirules-search](https://github.com/wpknox/tirules-search):

```bash
node scripts/build-rules.mjs path/to/tirules-search   # or set TIRULES_DIR
```

## Credits and licence

Rules text: [tirules-search](https://github.com/wpknox/tirules-search), a fork of [dangothemango/tirules](https://github.com/dangothemango/tirules) by dangothemango and BradleyΣ, with Dane's rulings. GPL-3.0, so this project is GPL-3.0 too (see `LICENSE`).

Fonts: [Saira](https://fonts.google.com/specimen/Saira) and [Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next), both under the SIL Open Font License 1.1.

*Twilight Imperium* is © Fantasy Flight Games. This project isn't affiliated with them.
