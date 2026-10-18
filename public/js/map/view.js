// The Map section: paste a map string, see the map and a plain-English
// report on each seat. All the maths is in analyze.js; this file only shows it.
//
// URL is the state: /map?m=<string>&seat=<n>. Analysing pushes a history
// entry; selecting a seat only rewrites the URL, so Back skips taps.

import { $, $$, esc, plural, remember, store } from "../lib.js";
import { navigate, setUrl } from "../router.js";
import { parseMapString } from "./parse.js";
import { analyze, describe } from "./analyze.js";
import { renderMapSvg } from "./svg.js";
import { factionId, symbolSlot, hydrateSymbols } from "../factions.js";
import { loadTiles, loadArt, tileSymbols } from "./load.js";

// SCPT 2021 Final, a known-good 6-player map (copied from scripts/fixtures/maps.mjs).
const EXAMPLE =
  "60 65 20 78 67 46 28 40 76 79 70 25 69 39 74 64 37 26 0 73 41 0 19 72 0 47 68 0 21 77 0 29 45 0 27 80";

const TECH = { green: "biotic", blue: "propulsion", yellow: "cybernetic", red: "warfare" };

const fmt = (n) => String(Math.round(n * 10) / 10);
const mapHref = (m, seat, view) => {
  const q = new URLSearchParams({ m });
  if (seat) q.set("seat", seat);
  if (view === "art") q.set("view", "art");
  return `/map?${q}`;
};
const marker = (sev) =>
  `<svg class="mk mk-${sev}" viewBox="0 0 14 14" aria-hidden="true"><polygon points="7,0.8 12.4,3.9 12.4,10.1 7,13.2 1.6,10.1 1.6,3.9"/></svg>`;

// ── Render ─────────────────────────────────────────────────────────────────

export async function renderMap(url, main, ctx) {
  document.title = "Map · TI4 Table";
  const m = (url.searchParams.get("m") ?? "").trim();
  const seatParam = parseInt(url.searchParams.get("seat") ?? "", 10);
  // The URL alone decides (absent = analysis), so Back/Forward and shared links are exact.
  // The remembered choice only goes into links for *new* maps (form, example).
  const view = url.searchParams.get("view") === "art" ? "art" : "analysis";
  const dflt = store.get("mapView", "analysis");

  main.innerHTML = `<div class="map-page">
    <form class="map-form" novalidate>
      <label for="map-input">Paste a map string</label>
      <textarea id="map-input" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="18 60 65 20 78 …"></textarea>
      <p class="map-hint" id="map-hint" role="status"></p>
      <div class="map-actions">
        <button class="btn btn-primary" type="submit">Analyse map</button>
        <a class="map-example" href="${esc(mapHref(EXAMPLE, 0, dflt))}">Try an example map</a>
      </div>
    </form>
    <div class="map-out"></div>
  </div>`;
  const ta = $("#map-input", main);
  ta.value = m;
  const hint = $("#map-hint", main);

  $(".map-form", main).addEventListener("submit", (e) => {
    e.preventDefault();
    const v = ta.value.trim().replace(/\s+/g, " ");
    if (!v) {
      hint.textContent = "Paste a map string first. Copy it from Milty draft, TI Assistant or Tabletop Simulator.";
      ta.focus();
      return;
    }
    hint.textContent = "";
    navigate(mapHref(v, 0, dflt));
  });

  const out = $(".map-out", main);
  if (!m) {
    showRecent(out);
    scrollTo(0, 0);
    return;
  }

  let tiles;
  try {
    tiles = await loadTiles();
  } catch (err) {
    if (ctx.stale()) return;
    out.innerHTML = `<p class="error">${esc(err.message)}. Check your connection and reload.</p>`;
    return;
  }
  if (ctx.stale()) return;

  const parsed = parseMapString(m, { data: tiles });
  const known = parsed.tiles.filter((t) => tiles[t.id]).length;
  if (known < 3) {
    out.innerHTML = `<p class="error map-error">That doesn't look like a map string. It should be tile numbers separated by spaces, like “18 60 65 20 …”.</p>`;
    return;
  }
  const report = analyze(parsed, tiles);
  // Preload the symbols this map needs, so renderMapSvg stays synchronous and pure.
  const symbols = await tileSymbols(parsed, tiles);
  if (ctx.stale()) return;
  const art = view === "art" ? await loadArt() : new Set();
  if (ctx.stale()) return;
  const said = describe(report);
  const seat = seatParam >= 1 && seatParam <= report.seats.length ? seatParam : 0;

  remember("maps", { m, label: `${plural(report.seats.length, "player")}, ${said.verdict.replace(/\.$/, "")}` }, 5, (a, b) => a.m === b.m);

  const notes = report.warnings;
  const abilities = abilitiesOf(tiles);
  out.innerHTML = `<div class="map-result">
    <div class="map-left">
      <h1 class="verdict">${esc(said.verdict)}</h1>
      <p class="map-sub">${esc(plural(report.seats.length, "seat"))}, ${esc(plural(parsed.tiles.length, "tile"))}.</p>
      <div class="view-toggle" role="group" aria-label="Map view">
        <button type="button" data-view="analysis" aria-pressed="${view !== "art"}">Analysis</button>
        <button type="button" data-view="art" aria-pressed="${view === "art"}">Tile art</button>
      </div>
      <div class="map-fig">${renderMapSvg(parsed, report, tiles, { view, art, symbols, title: `Map for ${plural(report.seats.length, "player")}. ${said.verdict}` })}</div>
      <p class="tile-note" id="tile-note" aria-live="polite"></p>
    </div>
    <div class="map-right">
      ${notesHtml(notes)}
      <div class="seats">${said.seats.map((s) => seatBlock(s, report.seats[s.seat - 1], report, abilities)).join("")}</div>
      <p class="plan-link"><a href="${esc(`/games/new?${new URLSearchParams({ plan: "1", m })}`)}">Plan a game on this map</a></p>
    </div>
  </div>`;

  void hydrateSymbols(out);
  const svg = $("svg.mapsvg", out);
  const note = $("#tile-note", out);
  const hintText = "Tap a seat to see its slice.";
  note.textContent = hintText;
  let selected = 0;

  function select(n, { url: touchUrl = true } = {}) {
    selected = n;
    for (const g of $$("g.hex", svg)) {
      const on = n && (g.dataset.seats ?? "").split(" ").includes(String(n));
      g.classList.toggle("sel", !!on);
      if (g.classList.contains("home")) g.setAttribute("aria-pressed", String(g.dataset.seats === String(n)));
    }
    for (const b of $$(".seat", out)) {
      const on = b.dataset.seat === String(n);
      b.classList.toggle("sel", on);
      $(".seat-pick", b).setAttribute("aria-pressed", String(on));
    }
    svg.classList.toggle("has-sel", !!n);
    if (touchUrl) setUrl(mapHref(m, n, view));
  }
  select(seat, { url: false });

  for (const b of $$(".view-toggle button", out)) {
    b.addEventListener("click", () => {
      if (b.dataset.view === view) return;
      store.set("mapView", b.dataset.view);
      navigate(mapHref(m, selected, b.dataset.view)); // a real history entry, so Back undoes it
    });
  }

  const toggle = (n) => select(selected === n ? 0 : n);

  // One ability tip open at a time; any other tap closes it.
  const openTip = (btn) => {
    for (const b of $$('.tip-btn[aria-expanded="true"]', out)) if (b !== btn) b.setAttribute("aria-expanded", "false");
    btn?.setAttribute("aria-expanded", "true");
  };

  out.addEventListener("click", (e) => {
    const tip = e.target.closest(".tip-btn");
    openTip(tip?.getAttribute("aria-expanded") === "false" ? tip : null);
    if (e.target.closest(".tip")) return; // not a seat pick
    const g = e.target.closest("g.hex");
    if (g && svg.contains(g)) {
      note.textContent = g.dataset.label;
      const first = parseInt((g.dataset.seats ?? "").split(" ")[0], 10);
      if (first) {
        // Tapping a shared tile keeps the current seat if it's one of them.
        const mine = (g.dataset.seats ?? "").split(" ").includes(String(selected));
        if (!(mine && !g.classList.contains("home"))) toggle(first);
      } else if (selected) select(0);
      return;
    }
    if (e.target.closest("a, summary")) return;
    const pick = e.target.closest(".seat");
    if (pick) toggle(parseInt(pick.dataset.seat, 10));
  });
  out.addEventListener("keydown", (e) => {
    if (e.key === "Escape") openTip(null);
  });
  // Taps outside the report close a tip too. Drops itself once this page is replaced.
  const closeOutside = (e) => {
    if (!out.isConnected) document.removeEventListener("click", closeOutside);
    else if (!out.contains(e.target)) openTip(null);
  };
  document.addEventListener("click", closeOutside);
  svg.addEventListener("keydown", (e) => {
    const g = e.target.closest?.("g.hex.home");
    if (g && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      note.textContent = g.dataset.label;
      toggle(parseInt(g.dataset.seats, 10));
    }
  });

  scrollTo(0, ctx.restoring ? (ctx.scroll ?? 0) : 0);
}

function showRecent(out) {
  const recent = store.get("maps", []);
  out.innerHTML = recent.length
    ? `<section class="recent"><h2>Recent maps</h2><ul>${recent
        .map((r) => `<li><a href="${esc(mapHref(r.m))}">${esc(r.label)}</a><span class="muted">${esc(r.m.slice(0, 40))}${r.m.length > 40 ? "…" : ""}</span></li>`)
        .join("")}</ul></section>`
    : `<p class="map-empty">Paste a map string to see how fair each seat is. A string looks like “18 60 65 20 …”: tile numbers in order from the centre outwards.</p>`;
}

// ── Seat report ────────────────────────────────────────────────────────────

function notesHtml(notes) {
  if (!notes.length) return "";
  const items = notes.map((n) => `<li>${esc(n)}</li>`).join("");
  return `<details class="map-notes"><summary>${esc(plural(notes.length, "note"))} about this map string</summary><ul>${items}</ul></details>`;
}

const ruleLink = (rule) => (rule ? ` <a href="/rules/${esc(rule)}">See the rule</a>` : "");

// ── Legendary abilities ────────────────────────────────────────────────────

// Planet name -> { name, text } of its legendary ability card.
const abilitiesOf = (tiles) =>
  new Map(Object.values(tiles).flatMap((t) => t.planets.filter((p) => p.ability).map((p) => [p.name, p.ability])));

let tipCount = 0;

// A planet name that shows its ability on hover or focus, or on tap (phones have no hover).
function tipHtml(name, ability) {
  if (!ability) return esc(name);
  const id = `tip-${++tipCount}`;
  return `<span class="tip"><button class="tip-btn" type="button" aria-expanded="false" aria-describedby="${id}">${esc(name)}</button><span class="tip-body" id="${id}" role="tooltip"><b>${esc(ability.name)}.</b> ${esc(ability.text)}</span></span>`;
}

// The line's text with each term made a tip. Terms are in sentence order, so
// work back from the end and never match inside a tip already inserted.
function withTips(text, terms = [], abilities) {
  let html = esc(text);
  let end = html.length;
  for (const t of [...terms].reverse()) {
    const e = esc(t);
    const at = html.lastIndexOf(e, end - e.length);
    if (at < 0) continue;
    html = html.slice(0, at) + tipHtml(t, abilities.get(t)) + html.slice(at + e.length);
    end = at;
  }
  return html;
}

function seatBlock(s, data, report, abilities) {
  const faction = data.faction;
  const lines = s.lines
    .map(
      (l) =>
        `<li>${marker(l.severity)}<span>${withTips(l.text, l.terms, abilities)}${ruleLink(l.rule)}</span></li>`,
    )
    .join("");
  return `<article class="seat" data-seat="${s.seat}">
    <span class="seat-n" aria-hidden="true">${s.seat}</span>
    <div class="seat-body">
      <h2><button class="seat-pick" type="button" aria-pressed="false">${faction ? `<span class="visually-hidden">Seat ${s.seat}. </span>${symbolSlot(factionId(faction))}${esc(faction)}` : `Seat ${s.seat}`}</button></h2>
      <ul class="lines">${lines}</ul>
      <details><summary>Details</summary>${metricsTable(data, report, abilities)}</details>
    </div>
  </article>`;
}

function metricsTable(d, report, abilities) {
  const m = d.metrics;
  const skips = Object.entries(m.skips).filter(([, v]) => v > 0);
  const row = (k, v) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`;
  const r = (v) => `<span class="n-res">${fmt(v)}</span>`;
  const i = (v) => `<span class="n-inf">${fmt(v)}</span>`;
  const mean = report.table.mean;
  const anoms = Object.entries(m.anomalies);
  const contested = Object.entries(m.contested);
  return `<table class="metrics"><tbody>
    ${row("Optimal total", `${fmt(m.optimal.total)} <span class="muted">(table average ${fmt(mean.optimalTotal)})</span>`)}
    ${row("Optimal resources and influence", `${r(m.optimal.resources)} and ${i(m.optimal.influence)}`)}
    ${row("Raw resources and influence", `${r(m.raw.resources)} and ${i(m.raw.influence)}`)}
    ${row("Planets", fmt(m.planets))}
    ${row(
      "Tech skips in this slice",
      skips.length
        ? skips.map(([c, v]) => `<span class="skip-tag"><i class="dot skip-${c}"></i>${esc(TECH[c])} ${fmt(v)}</span>`).join(" ")
        : "None",
    )}
    ${row("Tech skips within 2 moves", String(m.skipsNear))}
    ${row("Moves to Mecatol Rex", m.mecatol === null ? "Can't reach" : String(m.mecatol))}
    ${row("Planets one move away", String(m.adjacentPlanets))}
    ${row("Wormholes", m.wormholes.length ? esc(m.wormholes.join(", ")) : "None")}
    ${row("Legendary planets", m.legendary.length ? m.legendary.map((n) => tipHtml(n, abilities.get(n))).join(", ") : "None")}
    ${row("Anomalies", anoms.length ? esc(anoms.map(([k, v]) => `${k.replace("-", " ")} ${fmt(v)}`).join(", ")) : "None")}
    ${contested.length ? row("Systems shared with", esc(contested.map(([k, v]) => `seat ${k} (${fmt(v)})`).join(", "))) : ""}
  </tbody></table>`;
}
