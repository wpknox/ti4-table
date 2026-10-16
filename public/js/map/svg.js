// Draws a parsed map as an SVG string. Pure string building, no DOM, so
// scripts/check-map-svg.mjs can render it in Node. map.css does the colour,
// and view.js toggles the `sel` class when a seat is selected, so picking a
// seat never redraws the map.
//
// Units: one hex radius is R. Flat-top hexes, as the parser uses.

import { DIRS, hexToPixel, rotateLanes } from "./parse.js";
import { factionId } from "../factions.js";

const R = 20;
const GAP = 0.95; // drawn size vs. grid size, so neighbours don't touch
const f = (n) => Math.round(n * 100) / 100;

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const GREEK = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε" };
const STRICT = ["supernova", "asteroid-field", "nebula", "gravity-rift"];

const hexPoints = (r) =>
  [0, 1, 2, 3, 4, 5].map((i) => `${f(r * Math.cos((Math.PI / 3) * i))},${f(r * Math.sin((Math.PI / 3) * i))}`).join(" ");

const anomalyList = (info) => (info?.anomaly ? [].concat(info.anomaly) : []);
const planetsOf = (info) => info?.planets ?? [];
const techOf = (p) => (p.tech ? [].concat(p.tech) : []);

// ── Line glyphs, drawn in a box of about ±6 around (0, 0) ───────────────────

function glyph(kind) {
  switch (kind) {
    case "supernova": {
      // Eight-point burst.
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const r = i % 2 ? 2.6 : 7;
        const a = (Math.PI / 8) * i - Math.PI / 2;
        pts.push(`${f(r * Math.cos(a))},${f(r * Math.sin(a))}`);
      }
      return `<polygon points="${pts.join(" ")}"/>`;
    }
    case "asteroid-field":
      return [[-4.5, -3, 1.3], [1, -4.5, 1], [4.5, -0.5, 1.5], [-1.5, 1, 1.1], [-4, 4, 0.9], [2.5, 4.5, 1.2]]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`)
        .join("");
    case "nebula":
      return [-4, 0, 4]
        .map((y) => `<path d="M-6.5 ${y} q1.6 -2.2 3.25 0 t3.25 0 t3.25 0 t3.25 0"/>`)
        .join("");
    case "gravity-rift":
      return [2, 4.4, 6.8].map((r) => `<circle cx="0" cy="0" r="${r}"/>`).join("");
    default:
      // Entropic scar and anything new: a jagged crack.
      return `<polyline points="-6,-5 -1.5,-1.5 -3.5,1 1,3 0,6.5"/>`;
  }
}

// ── Words for a tile, used for aria-labels and the caption under the map ────

// "Name, 2 resources 1 influence ..." for each planet, else Mecatol / Empty system.
function systemLabel(info) {
  const ps = planetsOf(info).map((p) => {
    const bits = [`${p.resources} resources`, `${p.influence} influence`];
    for (const t of techOf(p)) bits.push(`${t} tech skip`);
    if (p.legendary) bits.push("legendary");
    return `${p.name}, ${bits.join(" ")}`;
  });
  if (ps.length) return ps.join("; ");
  return info?.type === "mecatol" ? "Mecatol Rex" : "Empty system";
}

export function tileLabel(tile, info, seats, homeSeat) {
  const parts = [];
  if (homeSeat) {
    const faction = info?.faction ? `, ${info.faction}` : "";
    parts.push(`Seat ${homeSeat} home${faction}`);
  } else if (tile.id === "0") {
    parts.push("Open slot");
  } else if (info?.type === "hyperlane") {
    parts.push("Hyperlane");
  } else {
    parts.push(systemLabel(info));
  }
  if (!homeSeat) {
    for (const w of info?.wormholes ?? []) parts.push(`${w} wormhole`);
    for (const a of anomalyList(info)) parts.push(a.replace("-", " "));
  }
  let text = parts.join(", ");
  if (!homeSeat && seats?.length) {
    text += seats.length === 1 ? `. In seat ${seats[0]}'s slice` : `. Shared by seats ${seats.slice(0, -1).join(", ")} and ${seats.at(-1)}`;
  }
  return `Tile ${tile.id.replace(/[AB]$/, "")}: ${text}`.replace(/^Tile (\d+): (Seat \d+ home)/, "$2 (tile $1)");
}

// ── The map ────────────────────────────────────────────────────────────────

/**
 * @param {object} parsed  parseMapString() result
 * @param {object} report  analyze() result
 * @param {object} tiles   tiles.json `tiles`
 * @param {object} [opts.symbols]  faction id -> inline <svg> markup (from factions.js); absent in Node
 * @param {string} [opts.view]  "analysis" (default) or "art": tile images instead of numbers
 * @param {Set<string>} [opts.art]  tile ids that have an image (the manifest's keys); others keep the analysis look
 * @param {object} [opts.seatLabels]  seat number -> { name?, faction? }: a player name under the numeral, and that
 *   faction's symbol (a key of `symbols`) instead of the home tile's own. Without it the output is unchanged.
 * @returns {string} an <svg> element
 */
export function renderMapSvg(parsed, report, tiles, { title = "Map", symbols = {}, view = "analysis", art = new Set(), seatLabels = null } = {}) {
  const isArt = view === "art";
  const seatAt = new Map(parsed.homes.map((pos, i) => [pos, i + 1]));
  const { slice, sharedPos } = sliceMaps(report);

  const cells = parsed.tiles.map((t) => ({ t, ...hexToPixel(t.q, t.r) }));
  const xs = cells.map((c) => c.x * R);
  const ys = cells.map((c) => c.y * R);
  const pad = 3;
  const x0 = Math.min(...xs) - R - pad, x1 = Math.max(...xs) + R + pad;
  const y0 = Math.min(...ys) - R * 0.87 - pad, y1 = Math.max(...ys) + R * 0.87 + pad;

  const defs = isArt ? `<clipPath id="hexclip"><polygon points="${hexPoints(R * GAP)}"/></clipPath>` : "";
  const out = [
    `<svg class="mapsvg${isArt ? " art" : ""}" viewBox="${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)}" role="group" aria-labelledby="map-svg-title" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="map-svg-title">${esc(title)}</title>`,
    `<defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hatch-line" x1="0" y1="0" x2="0" y2="4"/></pattern>${defs}</defs>`,
  ];

  const ctx = { tiles, seatAt, slice, sharedPos, isArt, art, symbols, seatLabels };
  for (const c of cells) out.push(...cellMarkup(c, ctx));
  out.push(`</svg>`);
  return out.join("");
}

// ── Pieces of a tile ───────────────────────────────────────────────────────

// Everything for one hex: the group, its face, its marks and its edge.
function cellMarkup(c, { tiles, seatAt, slice, sharedPos, isArt, art, symbols, seatLabels }) {
  const { t } = c;
  const info = tiles[t.id];
  const homeSeat = seatAt.get(t.pos);
  const seats = homeSeat ? [homeSeat] : slice.get(t.pos) ?? [];
  const label = tileLabel(t, info, seats, homeSeat);
  const cls = tileClasses(t, info, homeSeat);
  const hasArt = isArt && art.has(t.id);
  if (hasArt) cls.push("pic");
  const attrs = [
    `class="${cls.join(" ")}"`,
    `data-pos="${t.pos}"`,
    seats.length ? `data-seats="${seats.join(" ")}"` : "",
    `data-label="${esc(label)}"`,
    homeSeat ? `role="button" tabindex="0" aria-pressed="false"` : `role="img"`,
    `aria-label="${esc(label)}"`,
    `transform="translate(${f(c.x * R)} ${f(c.y * R)})"`,
  ].filter(Boolean);
  const out = [`<g ${attrs.join(" ")}>`, `<polygon class="face" points="${hexPoints(R * GAP)}"/>`];
  const shared = !homeSeat && sharedPos.has(t.pos);
  if (hasArt) return [...out, ...artTile(t, homeSeat, shared)];
  if (cls.includes("red")) out.push(`<polygon class="tint" points="${hexPoints(R * GAP)}"/>`);
  if (shared) out.push(`<polygon class="shared" points="${hexPoints(R * GAP)}"/>`);

  if (info?.type === "hyperlane" && info.hyperlanes) out.push(...laneLines(info, t));
  else if (homeSeat) out.push(...homeMarks(info, homeSeat, symbols, seatLabels?.[homeSeat]));
  else if (t.id !== "0") out.push(...systemMarks(info));
  out.push(`<polygon class="edge" points="${hexPoints(R * GAP)}"/>`, `</g>`);
  return out;
}

// pos -> seat numbers whose slice it is in, and the set of shared positions.
function sliceMaps(report) {
  const slice = new Map();
  const sharedPos = new Set();
  for (const s of report.seats) {
    for (const pos of s.own) slice.set(pos, [s.seat]);
  }
  for (const s of report.seats) {
    for (const sh of s.shared) {
      sharedPos.add(sh.pos);
      slice.set(sh.pos, [...new Set([...(slice.get(sh.pos) ?? []), s.seat, ...sh.with])].sort((a, b) => a - b));
    }
  }
  return { slice, sharedPos };
}

function tileClasses(t, info, homeSeat) {
  const type = info?.type;
  const cls = ["hex"];
  if (homeSeat) cls.push("home");
  else if (t.id === "0") cls.push("open");
  else if (type === "hyperlane") cls.push("lane");
  else if (type === "mecatol") cls.push("mecatol");
  if (type === "red" || anomalyList(info).length) cls.push("red");
  return cls;
}

// A tile drawn as its picture. Returns the markup pieces, including the closing </g>.
function artTile(t, homeSeat, shared) {
  const out = [];
  // Rotation is clockwise in 60-degree steps about the hex centre, which is the group's origin.
  const rot = t.rotation ?? 0;
  const w = 2 * R * GAP, h = f((w * 222) / 256);
  const rotate = rot ? ` transform="rotate(${rot * 60})"` : "";
  out.push(
    `<g clip-path="url(#hexclip)" pointer-events="none"><image href="/img/tiles/${esc(t.id)}.webp" x="${-w / 2}" y="${f(-h / 2)}" width="${w}" height="${h}" loading="lazy" decoding="async"${rotate}/></g>`,
  );
  out.push(`<polygon class="dim" points="${hexPoints(R * GAP)}"/>`);
  if (shared) out.push(`<polygon class="shared-edge" points="${hexPoints(R * GAP * 0.88)}"/>`);
  if (homeSeat) {
    out.push(`<circle class="num-scrim" r="9.5"/>`, `<text class="seat-num" x="0" y="0">${homeSeat}</text>`);
  }
  out.push(`<polygon class="edge" points="${hexPoints(R * GAP)}"/>`, `</g>`);
  return out;
}

function laneLines(info, t) {
  return rotateLanes(info.hyperlanes, t.rotation ?? 0).map(([a, b]) => {
    const m = (e) => {
      const p = hexToPixel(DIRS[e][0], DIRS[e][1]);
      return `${f((p.x * R) / 2)} ${f((p.y * R) / 2)}`;
    };
    return `<path class="lane-line" d="M${m(a)} Q0 0 ${m(b)}"/>`;
  });
}

const NAME_MAX = 12;
const shortName = (name) => {
  const chars = [...String(name)];
  return chars.length > NAME_MAX ? chars.slice(0, NAME_MAX - 1).join("") + "…" : chars.join("");
};

function homeMarks(info, homeSeat, symbols, label) {
  const out = [];
  // A small faction symbol above the numeral when we have one; the numeral stays the main thing.
  // A planned seat's own faction wins over the one printed on the home tile.
  const sym = label?.faction ? symbols[label.faction] : symbols[factionId(info?.faction)];
  if (sym) {
    const S = 9;
    out.push(sym.replace(/<svg\s/, `<svg class="fsym-map" x="${-S / 2}" y="-15" width="${S}" height="${S}" `));
  }
  out.push(`<text class="seat-num" x="0" y="${sym ? 4 : 0}">${homeSeat}</text>`);
  if (label?.name) out.push(`<text class="seat-name" x="0" y="${sym ? 11.5 : 9}">${esc(shortName(label.name))}</text>`);
  return out;
}

// Planets (resources / influence, skips, legendary), anomaly glyphs and wormholes.
function systemMarks(info) {
  const out = [];
  const planets = planetsOf(info);
  const anoms = anomalyList(info);
  const worms = info?.wormholes ?? [];
  const n = planets.length;
  const top = worms.length ? -((n - 1) * 3.6) - 2.5 : -((n - 1) * 3.75);
  planets.forEach((p, i) => {
    const y = f(top + i * 7.5);
    const techs = techOf(p);
    out.push(
      `<g class="planet" transform="translate(0 ${y})">`,
      `<text class="pr" x="-2" y="0" text-anchor="end">${p.resources}</text>`,
      `<text class="pi" x="2" y="0" text-anchor="start">${p.influence}</text>`,
    );
    techs.forEach((tc, k) => out.push(`<circle class="skip skip-${esc(tc)}" cx="${f(-9 - k * 4)}" cy="-1.9" r="1.7"/>`));
    if (p.legendary) out.push(`<polygon class="legend" points="10,-4.4 12.2,-1.9 10,0.6 7.8,-1.9"/>`);
    out.push(`</g>`);
  });
  if (anoms.length) {
    const sorted = [...anoms].sort((a, b) => (STRICT.indexOf(a) + 9) % 9 - (STRICT.indexOf(b) + 9) % 9);
    const scale = anomalyScale(n, anoms.length);
    const dy = anomalyShift(n, worms.length);
    sorted.forEach((a, i) => {
      const dx = (i - (sorted.length - 1) / 2) * 12 * scale * 1.2;
      out.push(`<g class="glyph" transform="translate(${f(dx)} ${dy}) scale(${scale})">${glyph(a)}</g>`);
    });
  }
  if (worms.length) {
    const txt = worms.map((w) => GREEK[w] ?? w).join(" ");
    out.push(`<text class="worm" x="0" y="${n || anoms.length ? 13.5 : 3}">${esc(txt)}</text>`);
  }
  return out;
}

function anomalyScale(planetCount, anomalyCount) {
  if (planetCount) return 0.6;
  return anomalyCount > 1 ? 0.75 : 1.15;
}

function anomalyShift(planetCount, wormCount) {
  if (planetCount) return planetCount > 1 ? -12 : -10;
  return wormCount ? -3 : 0;
}
