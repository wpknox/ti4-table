// Checks public/js/map/parse.js against real map strings and tiles.json.
// No dependencies:  node scripts/check-map.mjs
//
// The map strings (scripts/fixtures/maps.mjs) come from the premade-map list
// of the TI4 Tabletop Playground mod. Sources and conventions are in
// docs/research/tile-data.md.

import { readFileSync } from "node:fs";
import { parseMapString, posToHex, hexToPos, hexDistance, ringOf, DIRS, rotateLanes } from "../public/js/map/parse.js";
import { MAPS } from "./fixtures/maps.mjs";

const { tiles: data } = JSON.parse(readFileSync(new URL("../public/data/tiles.json", import.meta.url), "utf8"));

// ── Checks ────────────────────────────────────────────────────────────────

let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    failures++;
    console.log(`    FAIL ${msg}`);
  }
};

// Geometry on its own: positions round-trip and each ring is a real ring.
for (let pos = 0; pos < 91; pos++) {
  const { q, r } = posToHex(pos);
  check(hexToPos(q, r) === pos, `position ${pos} round-trips through (${q},${r})`);
  check(hexDistance({ q, r }, { q: 0, r: 0 }) === ringOf(pos), `position ${pos} is ${ringOf(pos)} from the centre`);
  if (pos > 0 && ringOf(pos + 1) === ringOf(pos)) {
    const n = posToHex(pos + 1);
    check(hexDistance({ q, r }, n) === 1, `positions ${pos} and ${pos + 1} are neighbours`);
  }
}
check(JSON.stringify(posToHex(1)) === JSON.stringify({ q: 0, r: -1 }), "position 1 is north of the centre");
check(JSON.stringify(posToHex(2)) === JSON.stringify({ q: 1, r: -1 }), "position 2 is north-east (clockwise)");
console.log(`geometry: positions 0-90 ${failures ? "FAILED" : "ok"}`);

for (const m of MAPS) {
  const before = failures;
  const p = parseMapString(m.str, { data, playerCount: m.players });
  console.log(`\n${m.name}`);
  console.log(`  ${p.tiles.length} tiles, ${p.playerCount} players, homes at ${p.homes.join(" ")}`);
  for (const w of p.warnings) console.log(`  warning: ${w}`);

  check(p.warnings.length === 0, "no warnings");
  check(p.tiles.length === m.tiles, `tile count ${p.tiles.length} = ${m.tiles}`);
  check(p.playerCount === m.players, `player count ${p.playerCount} = ${m.players}`);
  check(JSON.stringify(p.homes) === JSON.stringify(m.homes), `homes ${p.homes} = ${m.homes}`);

  const centre = p.tiles.find((t) => t.pos === 0);
  check(centre?.q === 0 && centre?.r === 0 && data[centre.id]?.type === "mecatol", "Mecatol Rex at (0,0)");

  const coords = new Set(p.tiles.map((t) => `${t.q},${t.r}`));
  check(coords.size === p.tiles.length, "no two tiles share a hex");

  for (const t of p.tiles) {
    if (t.id === "0") continue;
    check(data[t.id], `tile ${t.id} at ${t.pos} is in tiles.json`);
    const h = posToHex(t.pos);
    check(h.q === t.q && h.r === t.r, `tile at ${t.pos} has the right coordinates`);
  }

  p.homes.forEach((pos, i) => {
    const t = p.tiles.find((x) => x.pos === pos);
    check(t.seat === i + 1, `home at ${pos} is seat ${i + 1}`);
    check(t.id === "0" || data[t.id].type === "home", `home at ${pos} is a home tile or open slot`);
    if (m.factions) check(data[t.id]?.faction === m.factions[i], `seat ${i + 1} is ${m.factions[i]}`);
  });

  // Hyperlane ends should meet: an edge pointing at another hyperlane needs
  // a matching edge back. This is what pins rotation down as clockwise.
  const at = new Map(p.tiles.map((t) => [`${t.q},${t.r}`, t]));
  const ends = (t) => new Set(rotateLanes(data[t.id].hyperlanes, t.rotation).flat());
  for (const t of p.tiles.filter((x) => data[x.id]?.type === "hyperlane")) {
    for (const e of ends(t)) {
      const n = at.get(`${t.q + DIRS[e][0]},${t.r + DIRS[e][1]}`);
      check(n, `hyperlane ${t.id}${t.rotation} at ${t.pos} leads onto the map`);
      if (n && data[n.id]?.type === "hyperlane")
        check(ends(n).has((e + 3) % 6), `hyperlane ${t.id}${t.rotation} at ${t.pos} meets ${n.id}${n.rotation} at ${n.pos}`);
    }
  }
  console.log(`  ${failures === before ? "ok" : "FAILED"}`);
}

// tiles.json shape: every planet has every field.
const TRAITS = new Set(["cultural", "hazardous", "industrial"]);
const TECHS = new Set(["red", "blue", "green", "yellow"]);
const many = (v, ok) => v === null || (Array.isArray(v) ? v.every((x) => ok.has(x)) : ok.has(v));
const before = failures;
for (const [id, t] of Object.entries(data)) {
  for (const p of t.planets) {
    check(Number.isInteger(p.resources) && Number.isInteger(p.influence), `${id} ${p.name} has numbers`);
    check(many(p.trait, TRAITS), `${id} ${p.name} trait`);
    check(many(p.tech, TECHS), `${id} ${p.name} tech`);
    check(typeof p.legendary === "boolean", `${id} ${p.name} legendary flag`);
    check(p.legendary === Boolean(p.ability?.name && p.ability?.text), `${id} ${p.name} has an ability exactly when legendary`);
  }
  check((t.type === "hyperlane") === Array.isArray(t.hyperlanes), `${id} hyperlanes field`);
}
const need = [...Array.from({ length: 82 }, (_, i) => String(i + 1)),
  ...[83, 84, 85, 86, 87, 88, 89, 90, 91].flatMap((n) => [`${n}A`, `${n}B`])];
for (const id of need) check(data[id], `tiles.json has ${id}`);
console.log(`\ntiles.json: ${Object.keys(data).length} tiles, base + PoK complete ${failures === before ? "ok" : "FAILED"}`);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
