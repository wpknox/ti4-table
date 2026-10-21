// About and credits. Mirrors CREDITS.md at the repo root; keep the two in step.

export function renderAbout(url, main) {
  document.title = "About and credits · TI4 Table";
  const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  main.innerHTML = `<div class="about">
    <h1>About and credits</h1>
    <p>This is an unofficial fan site. It is free, non-commercial and has no ads or donations. It is not affiliated with or endorsed by Fantasy Flight Games or Asmodee.</p>
    <p>The code is open source on ${ext("https://github.com/wpknox/ti4-table", "GitHub")}, under GPL-3.0.</p>

    <h2>Faction symbols</h2>
    <p>The faction symbols are artwork from <i>Twilight Imperium: Fourth Edition</i>, © Fantasy Flight Games. They are used under the ${ext("https://www.zmangames.com/ip-policy/", "Asmodee fan content policy")}, for a free, non-commercial fan site. That policy is not a license, and the art will be removed promptly if its owner asks.</p>
    <p>Twilight Imperium and its faction symbols are the property of Fantasy Flight Games. The files here are monochrome redraws and traces made for recoloring. Their sources:</p>
    <ul>
      <li>Most are from the vector sheet in ${ext("https://github.com/marshallcase/ti4-svg", "marshallcase/ti4-svg")}.</li>
      <li>Six (Bastion, Deepwrought, Firmament, Obsidian, Ral Nel, Crimson Rebellion) were traced from the faction images in ${ext("https://github.com/AsyncTI4/TI4_map_generator_bot", "AsyncTI4/TI4_map_generator_bot")}.</li>
    </ul>
    <p>Those repositories carry no license for the artwork. Our permission to use it comes only from the fan policy above.</p>

    <h2>Tile images</h2>
    <p>The map's “Tile art” view shows tile images from ${ext("https://github.com/AsyncTI4/TI4_map_generator_bot", "AsyncTI4/TI4_map_generator_bot")}. They are artwork from <i>Twilight Imperium: Fourth Edition</i>, © Fantasy Flight Games, used under the same fan content policy and resized for the web.</p>

    <h2>Space image</h2>
    <p>Hubble eXtreme Deep Field.</p>
    <p>Credit: NASA, ESA, G. Illingworth, D. Magee, and P. Oesch (University of California, Santa Cruz), R. Bouwens (Leiden University), and the HUDF09 Team</p>
    <p>Source: ${ext("https://esahubble.org/images/heic1214a/", "ESA/Hubble, heic1214a")}. License: ${ext("https://creativecommons.org/licenses/by/4.0/", "Creative Commons Attribution 4.0 International")}, per the ${ext("https://esahubble.org/copyright/", "ESA/Hubble copyright page")}. Darkened and cropped.</p>

    <h2>Rules text</h2>
    <p>Rules text comes from ${ext("https://github.com/wpknox/tirules-search", "tirules-search")}, a fork of ${ext("https://github.com/dangothemango/tirules", "dangothemango/tirules")} by dangothemango and BradleyΣ. The highlighted rulings are official rulings from Dane (the rules designer’s team), not part of the Living Rules Reference. <i>Twilight Imperium</i> is © Fantasy Flight Games. This site isn’t affiliated with them.</p>
    <p>The rules content is GPL-3.0, so this site’s code is GPL-3.0.</p>

    <h2>Map tile data</h2>
    <p>Planet values, tech skips, anomalies, wormholes and hyperlane lanes were converted from the ${ext("https://github.com/darrellanderson/TI4-TTPG-TS", "TI4 Tabletop Playground mod")} and cross-checked against ${ext("https://github.com/AsyncTI4/TI4_map_generator_bot", "AsyncTI4")}, which also supplied the legendary planet ability text. Both are released under the Unlicense, which covers their code and data but not their art.</p>

    <h2>TI Assistant and Milty draft</h2>
    <p>Games can link to ${ext("https://ti-assistant.com", "TI Assistant")} and ${ext("https://milty.shenanigans.be", "Milty draft")}. Given a TI Assistant link or data file, the game form reads that game’s seats, factions and final scores from TI Assistant’s public pages. Neither project’s code is used here.</p>

    <h2>Fonts</h2>
    <p>${ext("https://fonts.google.com/specimen/Saira", "Saira")} by Omnibus-Type and ${ext("https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next", "Atkinson Hyperlegible Next")} by the Braille Institute, both under the SIL Open Font License 1.1.</p>
  </div>`;
  scrollTo(0, 0);
}
