// Checks public/js/map/parse.js against real map strings and tiles.json.
// No dependencies:  node scripts/check-map.mjs
//
// The map strings come from the premade-map list of the TI4 Tabletop
// Playground mod (TI4-TTPG-TS, src/lib/map-string-lib/data/, Unlicense).
// Sources and conventions are in docs/research/tile-data.md.

import { readFileSync } from "node:fs";
import { parseMapString, posToHex, hexToPos, hexDistance, ringOf, DIRS, rotateLanes } from "../public/js/map/parse.js";

const { tiles: data } = JSON.parse(readFileSync(new URL("../public/data/tiles.json", import.meta.url), "utf8"));

// ── Fixtures ──────────────────────────────────────────────────────────────

const RING3_CORNERS = [19, 22, 25, 28, 31, 34];
const SCPT_2021_FINAL =
  "60 65 20 78 67 46 28 40 76 79 70 25 69 39 74 64 37 26 0 73 41 0 19 72 0 47 68 0 21 77 0 29 45 0 27 80";

const MAPS = [
  {
    name: "Learn to Play, 6p base game (TTPG premade)",
    str: "22 44 19 42 24 45 35 23 36 39 38 25 33 46 27 26 30 40 0 32 50 0 31 47 0 37 29 0 34 20 0 49 28 0 21 43",
    players: 6, tiles: 37, homes: RING3_CORNERS,
  },
  {
    name: "SCPT 2021 Final, 6p PoK tournament map (TTPG premade)",
    str: SCPT_2021_FINAL,
    players: 6, tiles: 37, homes: RING3_CORNERS,
  },
  {
    name: "Learn to Play, 5p PoK with hyperlanes (TTPG premade)",
    str: "77 40 41 85A0 39 65 67 60 70 66 74 88A0 75 87A0 68 72 73 69 0 62 76 0 79 71 0 80 83A0 86A0 84A0 63 0 64 78 0 61 59",
    players: 5, tiles: 37, homes: [19, 22, 25, 31, 34],
  },
  {
    name: "Learn to Play, 8p PoK with B-side hyperlanes and holes (TTPG premade)",
    str: "87A1 90B3 65 88A2 89B0 66 19 21 45 31 46 64 22 73 44 34 49 24 27 50 72 40 59 85B2 62 76 41 37 43 35 48 63 83B2 74 36 79 0 42 30 0 -1 -1 0 68 -1 0 47 71 0 39 61 0 -1 -1 0 67 -1 0 78 28",
    players: 8, tiles: 55, homes: [37, 40, 43, 46, 49, 52, 55, 58],
  },
  {
    name: "SCPT KC Intergalactical 1/3, 6p Thunder's Edge (TTPG premade)",
    str: "25 66 115 102 99 116 114 50 34 19 40 20 37 77 27 78 26 101 0 29 79 0 68 62 0 69 65 0 49 113 0 76 97 0 43 100",
    players: 6, tiles: 37, homes: RING3_CORNERS,
  },
  {
    // Derived: TI Assistant form (leading 18) with real home tiles in place
    // of the 0s, including the Creuss gate (17) and a Thunder's Edge home.
    name: "SCPT 2021 Final as TI Assistant would write it, with faction homes",
    str: "18 " + fillZeros(SCPT_2021_FINAL, ["1", "17", "52", "58", "94", "12"]),
    players: 6, tiles: 37, homes: RING3_CORNERS,
    factions: ["The Federation of Sol", "The Ghosts of Creuss", "The Mahact Gene-Sorcerers",
      "The Argent Flight", "The Crimson Rebellion", "The Universities of Jol-Nar"],
  },
  {
    // Derived: braced centre plus TI Assistant P markers in reverse order, so
    // seat numbers must come from the markers, not from position.
    name: "SCPT 2021 Final with {18} and P6…P1 markers",
    str: "{18} " + fillZeros(SCPT_2021_FINAL, ["P6", "P5", "P4", "P3", "P2", "P1"]),
    players: 6, tiles: 37, homes: RING3_CORNERS.slice().reverse(),
  },
];

function fillZeros(str, ids) {
  let i = 0;
  return str.split(" ").map((t) => (t === "0" ? ids[i++] : t)).join(" ");
}

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
  }
  check((t.type === "hyperlane") === Array.isArray(t.hyperlanes), `${id} hyperlanes field`);
}
const need = [...Array.from({ length: 82 }, (_, i) => String(i + 1)),
  ...[83, 84, 85, 86, 87, 88, 89, 90, 91].flatMap((n) => [`${n}A`, `${n}B`])];
for (const id of need) check(data[id], `tiles.json has ${id}`);
console.log(`\ntiles.json: ${Object.keys(data).length} tiles, base + PoK complete ${failures === before ? "ok" : "FAILED"}`);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
