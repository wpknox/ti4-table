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

// Thunder's Edge outline: one marker on the chosen cell, and no change without the option.
for (const view of ["analysis", "art"]) {
  const parsed = parseMapString(SYM, { data: tiles });
  const report = analyze(parsed, tiles);
  const opts = { title: "Test map", view, art };
  const plain = renderMapSvg(parsed, report, tiles, opts);
  check(plain === renderMapSvg(parsed, report, tiles, { ...opts, teSpots: [] }), `${view}: teSpots [] changes nothing`);
  check(!plain.includes("te-spot"), `${view}: no marker without teSpots`);
  const svg = renderMapSvg(parsed, report, tiles, { ...opts, teSpots: [7] });
  check((svg.match(/class="te-spot"/g) ?? []).length === 1, `${view}: exactly one te-spot`);
  check(balanced(svg), `${view}: te-spot tags balance`);
  const cell = svg.match(/<g [^>]*data-pos="7"[^>]*>/)?.[0] ?? "";
  check(/data-label="[^"]*, fair spot for Thunder's Edge"/.test(cell.replace("&#39;", "'")) || cell.includes(`, fair spot for Thunder's Edge"`), `${view}: label says fair spot`);
  check(cell.includes(`aria-label="`) && /fair spot for Thunder's Edge" transform/.test(cell), `${view}: aria-label ends with the phrase`);
}

// Tile numbers: off changes nothing; on labels every non-home, non-open tile.
{
  const parsed = parseMapString("60 65 20 78 67 46 28 40 76 79 70 25 69 39 74 64 37 26 0 73 41 0 19 72 0 47 68 0 21 77 0 29 45 0 27 80", { data: tiles });
  const report = analyze(parsed, tiles);
  const homes = new Set(parsed.homes);
  const want = parsed.tiles.filter((t) => t.id !== "0" && !homes.has(t.pos));
  for (const view of ["analysis", "art"]) {
    const opts = { title: "Test map", view, art };
    const plain = renderMapSvg(parsed, report, tiles, opts);
    check(plain === renderMapSvg(parsed, report, tiles, { ...opts, tileIds: false }), `${view}: tileIds false changes nothing`);
    check(!plain.includes("tile-id"), `${view}: no labels without tileIds`);
    const svg = renderMapSvg(parsed, report, tiles, { ...opts, tileIds: true });
    check((svg.match(/<text class="tile-id"/g) ?? []).length === want.length, `${view}: ${want.length} tile numbers`);
    check(balanced(svg), `${view}: tile number tags balance`);
    check(/<text class="tile-id"[^>]*>18<\/text>/.test(svg), `${view}: Mecatol labelled`);
    const homeGroups = svg.split('<g class="hex').filter((g) => g.startsWith(" home"));
    check(homeGroups.length === parsed.homes.length && homeGroups.every((g) => !g.includes("tile-id")), `${view}: no number in a home`);
    check(!/<text class="tile-id"[^>]*>0<\/text>/.test(svg), `${view}: no 0 label`);
  }
  // Hyperlanes keep their A/B face.
  const lane = MAPS.find((m) => /\d+[AB]\d?(\s|$)/.test(m.str));
  if (lane) {
    const p2 = parseMapString(lane.str, { data: tiles });
    const svg = renderMapSvg(p2, analyze(p2, tiles), tiles, { tileIds: true });
    check(/<text class="tile-id"[^>]*>\d+[AB]<\/text>/.test(svg), `${lane.name}: hyperlane shows A/B`);
  } else console.log("    (no fixture with A/B hyperlane ids)");
}

// User text must be escaped.
const evil = renderMapSvg(parseMapString("1 2 3", { data: tiles }), analyze(parseMapString("1 2 3", { data: tiles }), tiles), tiles, { title: '<img onerror=x> "' });
check(!evil.includes("<img"), "title is escaped");

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
