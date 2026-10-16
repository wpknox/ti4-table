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

export function tileLabel(tile, info, seats, homeSeat) {
  const parts = [];
  if (homeSeat) {
    parts.push(`Seat ${homeSeat} home${info?.faction ? `, ${info.faction}` : ""}`);
  } else if (tile.id === "0") {
    parts.push("Open slot");
  } else if (info?.type === "hyperlane") {
    parts.push("Hyperlane");
  } else {
    const ps = planetsOf(info).map((p) => {
      const bits = [`${p.resources} resources`, `${p.influence} influence`];
      for (const t of techOf(p)) bits.push(`${t} tech skip`);
      if (p.legendary) bits.push("legendary");
      return `${p.name}, ${bits.join(" ")}`;
    });
    parts.push(ps.length ? ps.join("; ") : info?.type === "mecatol" ? "Mecatol Rex" : "Empty system");
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
 * @returns {string} an <svg> element
 */
export function renderMapSvg(parsed, report, tiles, { title = "Map", symbols = {}, view = "analysis", art = new Set() } = {}) {
  const isArt = view === "art";
  const seatAt = new Map(parsed.homes.map((pos, i) => [pos, i + 1]));
  const slice = new Map(); // pos -> seat numbers
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

  const cells = parsed.tiles.map((t) => ({ t, ...hexToPixel(t.q, t.r) }));
  const xs = cells.map((c) => c.x * R);
  const ys = cells.map((c) => c.y * R);
  const pad = 3;
  const x0 = Math.min(...xs) - R - pad, x1 = Math.max(...xs) + R + pad;
  const y0 = Math.min(...ys) - R * 0.87 - pad, y1 = Math.max(...ys) + R * 0.87 + pad;

  const out = [];
  out.push(
    `<svg class="mapsvg${isArt ? " art" : ""}" viewBox="${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)}" role="group" aria-labelledby="map-svg-title" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="map-svg-title">${esc(title)}</title>`,
    `<defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hatch-line" x1="0" y1="0" x2="0" y2="4"/></pattern>${isArt ? `<clipPath id="hexclip"><polygon points="${hexPoints(R * GAP)}"/></clipPath>` : ""}</defs>`,
  );

  for (const c of cells) {
    const { t } = c;
    const info = tiles[t.id];
    const type = info?.type;
    const homeSeat = seatAt.get(t.pos);
    const seats = homeSeat ? [homeSeat] : slice.get(t.pos) ?? [];
    const label = tileLabel(t, info, seats, homeSeat);
    const cls = ["hex"];
    if (homeSeat) cls.push("home");
    else if (t.id === "0") cls.push("open");
    else if (type === "hyperlane") cls.push("lane");
    else if (type === "mecatol") cls.push("mecatol");
    if (type === "red" || anomalyList(info).length) cls.push("red");
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
    out.push(`<g ${attrs.join(" ")}>`);
    out.push(`<polygon class="face" points="${hexPoints(R * GAP)}"/>`);
    if (hasArt) {
      // Rotation is clockwise in 60-degree steps about the hex centre, which is the group's origin.
      const rot = t.rotation ?? 0;
      const w = 2 * R * GAP, h = f((w * 222) / 256);
      out.push(
        `<g clip-path="url(#hexclip)" pointer-events="none"><image href="/img/tiles/${esc(t.id)}.webp" x="${-w / 2}" y="${f(-h / 2)}" width="${w}" height="${h}" loading="lazy" decoding="async"${rot ? ` transform="rotate(${rot * 60})"` : ""}/></g>`,
      );
      out.push(`<polygon class="dim" points="${hexPoints(R * GAP)}"/>`);
      if (!homeSeat && sharedPos.has(t.pos)) out.push(`<polygon class="shared-edge" points="${hexPoints(R * GAP * 0.88)}"/>`);
      if (homeSeat) {
        out.push(`<circle class="num-scrim" r="9.5"/>`, `<text class="seat-num" x="0" y="0">${homeSeat}</text>`);
      }
      out.push(`<polygon class="edge" points="${hexPoints(R * GAP)}"/>`, `</g>`);
      continue;
    }
    if (cls.includes("red")) out.push(`<polygon class="tint" points="${hexPoints(R * GAP)}"/>`);
    if (!homeSeat && sharedPos.has(t.pos)) out.push(`<polygon class="shared" points="${hexPoints(R * GAP)}"/>`);

    if (type === "hyperlane" && info.hyperlanes) {
      for (const [a, b] of rotateLanes(info.hyperlanes, t.rotation ?? 0)) {
        const m = (e) => {
          const p = hexToPixel(DIRS[e][0], DIRS[e][1]);
          return `${f((p.x * R) / 2)} ${f((p.y * R) / 2)}`;
        };
        out.push(`<path class="lane-line" d="M${m(a)} Q0 0 ${m(b)}"/>`);
      }
    } else if (homeSeat) {
      // A small faction symbol above the numeral when we have one; the numeral stays the main thing.
      const sym = symbols[factionId(info?.faction)];
      if (sym) {
        const S = 9;
        out.push(sym.replace(/<svg\s/, `<svg class="fsym-map" x="${-S / 2}" y="-15" width="${S}" height="${S}" `));
      }
      out.push(`<text class="seat-num" x="0" y="${sym ? 4 : 0}">${homeSeat}</text>`);
    } else if (t.id !== "0") {
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
        const scale = n ? 0.6 : anoms.length > 1 ? 0.75 : 1.15;
        const dy = n ? (planets.length > 1 ? -12 : -10) : worms.length ? -3 : 0;
        sorted.forEach((a, i) => {
          const dx = (i - (sorted.length - 1) / 2) * 12 * scale * 1.2;
          out.push(`<g class="glyph" transform="translate(${f(dx)} ${dy}) scale(${scale})">${glyph(a)}</g>`);
        });
      }
      if (worms.length) {
        const txt = worms.map((w) => GREEK[w] ?? w).join(" ");
        out.push(`<text class="worm" x="0" y="${n || anoms.length ? 13.5 : 3}">${esc(txt)}</text>`);
      }
    }
    out.push(`<polygon class="edge" points="${hexPoints(R * GAP)}"/>`);
    out.push(`</g>`);
  }
  out.push(`</svg>`);
  return out.join("");
}
