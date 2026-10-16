// Renders the map SVG for every fixture map and checks its shape.
// No dependencies:  node scripts/check-map-svg.mjs

import { readFileSync } from "node:fs";
import { parseMapString } from "../public/js/map/parse.js";
import { analyze } from "../public/js/map/analyze.js";
import { renderMapSvg } from "../public/js/map/svg.js";
import { MAPS, SYM, LOP, WORMHOLE, SUPERNOVA } from "./fixtures/maps.mjs";

const { tiles } = JSON.parse(readFileSync(new URL("../public/data/tiles.json", import.meta.url), "utf8"));

let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    failures++;
    console.log(`    FAIL ${msg}`);
  }
};

// Balanced tags: a stack over the tag names, so a missing </g> is caught.
function balanced(svg) {
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0;
}

const all = [...MAPS, ...[SYM, LOP, WORMHOLE, SUPERNOVA].filter(Boolean).map((s, i) => ({ name: `synthetic ${i}`, str: typeof s === "string" ? s : s.str ?? s }))];

for (const m of all) {
  const parsed = parseMapString(m.str, { data: tiles });
  const report = analyze(parsed, tiles);
  const svg = renderMapSvg(parsed, report, tiles, { title: "Test map" });
  const hexes = (svg.match(/<g class="hex[ "]/g) ?? []).length;
  const nums = (svg.match(/class="seat-num"/g) ?? []).length;
  console.log(`${m.name}: ${hexes} hexes, ${nums} seat numerals, ${svg.length} bytes`);
  check(balanced(svg), `${m.name}: tags balance`);
  check(hexes === parsed.tiles.length, `${m.name}: ${hexes} hexes for ${parsed.tiles.length} tiles`);
  check(nums === parsed.homes.length, `${m.name}: ${nums} seat numerals for ${parsed.homes.length} homes`);
  check(!/NaN|undefined|Infinity/.test(svg), `${m.name}: NaN/undefined in output`);
  check(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${m.name}: one svg element`);
  check(/<title id="map-svg-title">Test map<\/title>/.test(svg), `${m.name}: has a title`);
}

// Tile art view: one <image> per tile with art, hyperlanes rotated, hrefs in the manifest.
const manifest = JSON.parse(readFileSync(new URL("../public/img/tiles/manifest.json", import.meta.url), "utf8"));
const art = new Set(Object.keys(manifest.tiles));
for (const m of all) {
  const parsed = parseMapString(m.str, { data: tiles });
  const report = analyze(parsed, tiles);
  const svg = renderMapSvg(parsed, report, tiles, { title: "Test map", view: "art", art });
  const imgs = [...svg.matchAll(/<image href="([^"]+)"[^>]*?(?: transform="rotate\((-?[\d.]+)\)")?\/>/g)];
  const withArt = parsed.tiles.filter((t) => art.has(t.id));
  const hexes = (svg.match(/<g class="hex[ "]/g) ?? []).length;
  console.log(`${m.name} (art): ${imgs.length} images, ${hexes} hexes`);
  check(imgs.length === withArt.length, `${m.name} (art): ${imgs.length} images for ${withArt.length} tiles with art`);
  check(hexes === parsed.tiles.length, `${m.name} (art): hex count`);
  check(!/NaN|undefined|Infinity/.test(svg), `${m.name} (art): NaN/undefined in output`);
  check(balanced(svg), `${m.name} (art): tags balance`);
  check(/class="mapsvg art"/.test(svg), `${m.name} (art): svg has art class`);
  for (const [, href] of imgs) check(art.has(href.replace(/^\/img\/tiles\/(.+)\.webp$/, "$1")), `${m.name} (art): ${href} not in manifest`);
  const lanes = parsed.tiles.filter((t) => art.has(t.id) && (t.rotation ?? 0) > 0 && tiles[t.id]?.type === "hyperlane");
  for (const t of lanes) {
    const want = `<image href="/img/tiles/${t.id}.webp"`;
    const at = svg.indexOf(want);
    const tag = svg.slice(at, svg.indexOf("/>", at));
    check(tag.includes(`rotate(${t.rotation * 60})`), `${m.name} (art): tile ${t.id} rotation ${t.rotation} not applied`);
  }
  // Tiles without art keep the analysis look (no image).
  for (const t of parsed.tiles.filter((t) => !art.has(t.id))) check(!svg.includes(`/img/tiles/${t.id}.webp`), `${m.name} (art): ${t.id} has no art but got an image`);
}

// User text must be escaped.
const evil = renderMapSvg(parseMapString("1 2 3", { data: tiles }), analyze(parseMapString("1 2 3", { data: tiles }), tiles), tiles, { title: '<img onerror=x> "' });
check(!evil.includes("<img"), "title is escaped");

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
