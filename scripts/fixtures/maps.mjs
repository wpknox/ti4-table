// Map fixtures shared by scripts/check-map.mjs and scripts/check-analysis.mjs.
// The real map strings come from the premade-map list of the TI4 Tabletop
// Playground mod (TI4-TTPG-TS, src/lib/map-string-lib/data/, Unlicense).

export const RING3_CORNERS = [19, 22, 25, 28, 31, 34];
export const SCPT_2021_FINAL =
  "60 65 20 78 67 46 28 40 76 79 70 25 69 39 74 64 37 26 0 73 41 0 19 72 0 47 68 0 21 77 0 29 45 0 27 80";

export const MAPS = [
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

export function fillZeros(str, ids) {
  let i = 0;
  return str.split(" ").map((t) => (t === "0" ? ids[i++] : t)).join(" ");
}


// ── Synthetic maps for the analysis engine ────────────────────────────────

// Swap tiles by position in a string that has Mecatol implied (token N is at
// position N, so token index is pos - 1).
export function swap(str, changes) {
  const t = str.split(" ");
  for (const [pos, id] of Object.entries(changes)) t[Number(pos) - 1] = String(id);
  return t.join(" ");
}

// Identical under 60° rotation, so every seat must get the same numbers.
export const SYM =
  "20 20 20 20 20 20 23 22 23 22 23 22 23 22 23 22 23 22 0 19 21 0 19 21 0 19 21 0 19 21 0 19 21 0 19 21";
// Seat 1 gets two rich systems; seat 4 loses both of its own.
export const LOP = swap(SYM, { 20: 35, 36: 69, 27: 46, 29: 47 });
export const SUPERNOVA = swap(SYM, { 7: 43 });
export const NEBULA = swap(SYM, { 7: 42 });
export const ASTEROID = swap(SYM, { 7: 44 });
export const RIFT = swap(SYM, { 7: 41 });
export const WORMHOLE = swap(SYM, { 20: 26, 29: 39 });
