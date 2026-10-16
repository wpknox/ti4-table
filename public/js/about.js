// About and credits. Mirrors CREDITS.md at the repo root; keep the two in step.

export function renderAbout(url, main) {
  document.title = "About and credits · TI4 Table";
  const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  main.innerHTML = `<div class="about">
    <h1>About and credits</h1>
    <p>This is an unofficial fan site. It is free, non-commercial and has no ads or donations. It is not affiliated with or endorsed by Fantasy Flight Games or Asmodee.</p>

    <h2>Faction symbols</h2>
    <p>The faction symbols are artwork from <i>Twilight Imperium: Fourth Edition</i>, © Fantasy Flight Games. They are used under the ${ext("https://www.zmangames.com/ip-policy/", "Asmodee fan content policy")}, for a free, non-commercial fan site. That policy is not a licence, and the art will be removed promptly if its owner asks.</p>
    <p>Twilight Imperium and its faction symbols are the property of Fantasy Flight Games. The files here are monochrome redraws and traces made for recolouring. Their sources:</p>
    <ul>
      <li>Most are from the vector sheet in ${ext("https://github.com/marshallcase/ti4-svg", "marshallcase/ti4-svg")}.</li>
      <li>Six (Bastion, Deepwrought, Firmament, Obsidian, Ral Nel, Crimson Rebellion) were traced from the faction images in ${ext("https://github.com/AsyncTI4/TI4_map_generator_bot", "AsyncTI4/TI4_map_generator_bot")}.</li>
    </ul>
    <p>Those repositories carry no licence for the artwork. Our permission to use it comes only from the fan policy above.</p>

    <h2>Space image</h2>
    <p>Hubble eXtreme Deep Field.</p>
    <p>Credit: NASA, ESA, G. Illingworth, D. Magee, and P. Oesch (University of California, Santa Cruz), R. Bouwens (Leiden University), and the HUDF09 Team</p>
    <p>Source: ${ext("https://esahubble.org/images/heic1214a/", "ESA/Hubble, heic1214a")}. Licence: ${ext("https://creativecommons.org/licenses/by/4.0/", "Creative Commons Attribution 4.0 International")}, per the ${ext("https://esahubble.org/copyright/", "ESA/Hubble copyright page")}. Darkened and cropped.</p>

    <h2>Rules text</h2>
    <p>Rules text comes from ${ext("https://github.com/wpknox/tirules-search", "tirules-search")}, a fork of ${ext("https://github.com/dangothemango/tirules", "dangothemango/tirules")} by dangothemango and BradleyΣ. The highlighted rulings are official rulings from Dane (the rules designer’s team), not part of the Living Rules Reference. <i>Twilight Imperium</i> is © Fantasy Flight Games. This site isn’t affiliated with them.</p>
    <p>The rules content is GPL-3.0, so this site’s code is GPL-3.0.</p>
  </div>`;
  scrollTo(0, 0);
}
