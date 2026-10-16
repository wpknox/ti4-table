// Map strings: turns a TTS / TTPG / TI Assistant / Milty draft map string
// into tile positions. Pure functions, no DOM, so Node can import it too
// (scripts/check-map.mjs).
//
// Format (checked against the code of TTPG, Milty draft and TI Assistant;
// see docs/research/tile-data.md):
//
// - Tokens are separated by spaces or commas. Token N sits at map position N.
//   Position 0 is the centre. After it the string walks ring 1, then ring 2,
//   and so on. Each ring starts at the tile directly above the centre (north)
//   and goes clockwise. Ring k has 6k tiles and starts at position 3k(k-1)+1:
//   ring 1 is 1-6, ring 2 is 7-18, ring 3 is 19-36, ring 4 is 37-60.
// - Mecatol Rex is implied: a plain string starts at position 1 and the
//   centre is tile 18. Two ways to override that:
//     `{42} 1 2 3 …`  braces around the first token put that tile in the
//                     centre (TTPG and TTS). `{-1}` leaves the centre empty.
//     `18 1 2 3 …`    a first token of 18 (or 112, Thunder's Edge's Mecatol)
//                     is taken as the centre. TI Assistant writes its strings
//                     this way. TTPG would put that 18 north of the centre,
//                     but no real map does that.
// - Token shape: `<number><side><rotation>`, e.g. `19`, `83A`, `83A2`, `88B5`.
//   Side is A or B (which face is up). Rotation 0-5 counts 60° steps
//   clockwise and needs a side letter: in `15` the 5 is part of the number.
//   Only hyperlanes normally carry these.
// - `-1` means no tile at that position (a hole in the map).
// - `0` means an open slot. TTPG reads it as a home-system placeholder; Milty
//   writes it for a seat whose faction isn't picked yet; TI Assistant uses it
//   for "anything". Here a 0 counts as a home only when the string has no
//   other home markers, or exactly enough 0s to fill the missing seats.
// - `P1`…`P8` are TI Assistant's explicit seat markers.
//
// Coordinates: axial (q, r) for FLAT-TOP hexes, as on redblobgames.com
// (Milty draft uses the same system). Screen y points down.
//   x = 1.5 * q,   y = √3 * (r + q / 2)        (in units of hex radius)
//   Neighbour directions, which are also hyperlane edge numbers:
//   0 N (0,-1)  1 NE (+1,-1)  2 SE (+1,0)  3 S (0,+1)  4 SW (-1,+1)  5 NW (-1,0)
//   A hyperlane edge e at rotation 0 faces direction (e + rotation) % 6.
//
// Homes and seats: the string decides. Home tiles (faction home systems, the
// Creuss and Crimson Rebellion gates) and P1…P8 markers are seats. Seats are
// numbered clockwise from north by angle around the centre, unless P-markers
// number them. Tools disagree on where homes go for a given player count (see
// HOME_POSITIONS), so the table is a last resort for strings that mark no
// homes at all.

// ── Geometry ──────────────────────────────────────────────────────────────

export const DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
export const DIR_NAMES = ["N", "NE", "SE", "S", "SW", "NW"];

export const ringStart = (k) => (k === 0 ? 0 : 3 * k * (k - 1) + 1);
export const ringOf = (pos) => {
  let k = 0;
  while (ringStart(k + 1) <= pos) k++;
  return k;
};

// Position -> axial. Walk ring k from its north corner, k steps per side.
export function posToHex(pos) {
  const k = ringOf(pos);
  if (k === 0) return { q: 0, r: 0 };
  const i = pos - ringStart(k);
  const side = Math.floor(i / k);
  const step = i % k;
  // Side s runs in direction s+2: SE from the north corner to the NE
  // corner, then S, SW, NW, N, NE. Jump corner to corner, then step along.
  let q = 0,
    r = -k;
  for (let s = 0; s < side; s++) {
    q += DIRS[(s + 2) % 6][0] * k;
    r += DIRS[(s + 2) % 6][1] * k;
  }
  return { q: q + DIRS[(side + 2) % 6][0] * step, r: r + DIRS[(side + 2) % 6][1] * step };
}

export function hexToPos(q, r) {
  const k = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  if (k === 0) return 0;
  for (let pos = ringStart(k); pos < ringStart(k + 1); pos++) {
    const h = posToHex(pos);
    if (h.q === q && h.r === r) return pos;
  }
  return -1;
}

export const hexToPixel = (q, r) => ({ x: 1.5 * q, y: Math.sqrt(3) * (r + q / 2) });
export const hexDistance = (a, b) =>
  Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));

// Clockwise angle from north, 0 ≤ a < 2π. Used to number seats.
function bearing(q, r) {
  const { x, y } = hexToPixel(q, r);
  const a = Math.atan2(x, -y);
  return a < 0 ? a + 2 * Math.PI : a;
}

// Edge pairs of a hyperlane tile (tiles.json, rotation 0) turned to the
// rotation it was placed at.
export const rotateLanes = (lanes, rotation) =>
  lanes.map(([a, b]) => [(a + rotation) % 6, (b + rotation) % 6]);

// ── Home conventions ──────────────────────────────────────────────────────

// Where TI Assistant's default ("standard") layouts put P1…Pn, as map
// positions. Only used when a string marks no homes. Milty draft and TTPG use
// different spots for 3, 4, 5, 7 and 8 players; see the research doc.
export const HOME_POSITIONS = {
  3: [22, 28, 34],
  4: [23, 27, 32, 36],
  5: [21, 25, 28, 31, 35],
  6: [19, 22, 25, 28, 31, 34],
  7: [37, 40, 43, 46, 52, 55, 58],
  8: [37, 40, 43, 46, 49, 52, 55, 58],
};

// Home tile ids, for when no tiles.json is passed in. Matches tiles.json:
// base 1-17 (17 is the Creuss gate), PoK 51-58 (51 is Creuss's off-map home),
// Thunder's Edge 92-96 and 118 (94 is the Crimson Rebellion's gate).
const HOME_IDS = new Set([...range(1, 17), ...range(51, 58), ...range(92, 96), 118].map(String));
function range(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

// ── Parsing ───────────────────────────────────────────────────────────────

const TOKEN = /^(-?\d+)([AB]?)([0-5]?)$/;
const SEAT = /^P([1-8])$/;
const MECATOL = new Set(["18", "112"]);

// Picks the tiles.json key for a token: "83A" for a hyperlane face, "96B"
// for a flipped tile that has its own entry, otherwise the bare number.
function resolveId(num, side, data) {
  if (!data) return num + side;
  if (side && data[num + side]) return num + side;
  if (data[num]) return num;
  if (!side && data[num + "A"]) return num + "A";
  return null;
}

/**
 * Parse a map string.
 * @param {string} input
 * @param {{ data?: object, playerCount?: number }} [opts]
 *   data: the `tiles` object from tiles.json (optional, improves id and home
 *   detection); playerCount: expected seats (optional).
 * @returns {{ tiles: {pos:number,q:number,r:number,id:string,rotation:number,seat?:number}[],
 *             playerCount: number, homes: number[], warnings: string[] }}
 *   tiles lists every position that isn't -1, centre included. Open slots
 *   have id "0". homes lists seat positions in seat order.
 */
export function parseMapString(input, { data, playerCount } = {}) {
  const warnings = [];
  const raw = String(input ?? "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => t.toUpperCase());

  // Centre handling, see the header.
  let tokens;
  const brace = /^\{(.*)\}$/.exec(raw[0] ?? "");
  if (brace) tokens = [brace[1], ...raw.slice(1)];
  else if (MECATOL.has(raw[0])) tokens = raw;
  else tokens = ["18", ...raw];

  const tiles = [];
  const seatMarks = []; // [seatNumber, pos]
  const seen = new Map();
  tokens.forEach((tok, pos) => {
    const { q, r } = posToHex(pos);
    const seat = SEAT.exec(tok);
    if (seat) {
      tiles.push({ pos, q, r, id: "0", rotation: 0 });
      seatMarks.push([Number(seat[1]), pos]);
      return;
    }
    const m = TOKEN.exec(tok);
    if (!m) {
      warnings.push(`Position ${pos}: "${tok}" isn't a tile number; left empty.`);
      return;
    }
    const [, num, side, rot] = m;
    if (num === "-1") return;
    if (num === "0") {
      tiles.push({ pos, q, r, id: "0", rotation: 0 });
      return;
    }
    const id = resolveId(String(Number(num)), side, data);
    if (id === null) {
      warnings.push(`Position ${pos}: tile ${tok} isn't in the tile list.`);
      return;
    }
    if (seen.has(id) && data?.[id]?.type !== "hyperlane")
      warnings.push(`Tile ${id} appears twice (positions ${seen.get(id)} and ${pos}).`);
    seen.set(id, pos);
    tiles.push({ pos, q, r, id, rotation: rot ? Number(rot) : 0 });
  });

  const homes = findHomes(tiles, seatMarks, data, playerCount, warnings);
  homes.forEach((pos, i) => {
    tiles.find((t) => t.pos === pos).seat = i + 1;
  });
  if (playerCount && homes.length !== playerCount)
    warnings.push(`Expected ${playerCount} home systems but found ${homes.length}.`);
  return { tiles, playerCount: playerCount ?? homes.length, homes, warnings };
}

// ── Homes ─────────────────────────────────────────────────────────────────

function findHomes(tiles, seatMarks, data, playerCount, warnings) {
  // 1. TI Assistant's P1…P8 give seat numbers directly.
  if (seatMarks.length) return seatMarks.sort((a, b) => a[0] - b[0]).map(([, pos]) => pos);

  const isHome = (id) => (data ? data[id]?.type === "home" && !data[id].offMap : HOME_IDS.has(id) && id !== "51" && id !== "118");
  const homes = tiles.filter((t) => t.pos > 0 && isHome(t.id));
  const open = tiles.filter((t) => t.pos > 0 && t.id === "0");

  // 2. Home tiles, plus 0s when they make up the rest of the table: no other
  //    homes are marked, or there are exactly enough 0s for the missing seats.
  //    With no player count, a half-drafted Milty map (some homes, some 0s)
  //    still counts its 0s, as long as the total is a real table size.
  let picked = homes;
  const fill = playerCount ? homes.length + open.length === playerCount : homes.length + open.length <= 8;
  if (open.length && (!homes.length || fill)) {
    picked = [...homes, ...open];
    if (homes.length) warnings.push(`Counted ${open.length} open slot(s) (0) as home systems.`);
  }

  // 3. Nothing marked: fall back to TI Assistant's default layout.
  if (!picked.length) return defaultHomes(tiles, playerCount, warnings);
  return picked
    .sort((a, b) => bearing(a.q, a.r) - bearing(b.q, b.r) || a.pos - b.pos)
    .map((t) => t.pos);
}

// TI Assistant's default home positions, if the map leaves them free.
function defaultHomes(tiles, playerCount, warnings) {
  const n = playerCount ?? (tiles.some((t) => ringOf(t.pos) === 4) ? 8 : 6);
  const spots = HOME_POSITIONS[n] ?? [];
  const taken = new Set(tiles.filter((t) => t.id !== "0").map((t) => t.pos));
  if (spots.length && spots.every((p) => !taken.has(p))) {
    warnings.push(`No home systems marked; assumed TI Assistant's ${n}-player home positions.`);
    for (const pos of spots) {
      const { q, r } = posToHex(pos);
      if (!tiles.some((t) => t.pos === pos)) tiles.push({ pos, q, r, id: "0", rotation: 0 });
    }
    return spots.slice().sort((a, b) => bearing(...qr(a)) - bearing(...qr(b)));
  }
  warnings.push("No home systems found.");
  return [];
}

const qr = (pos) => {
  const { q, r } = posToHex(pos);
  return [q, r];
};
