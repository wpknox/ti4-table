// Loading the data a map drawing needs, shared by the Map page, the game page and
// the plan form. Each loader caches its promise and forgets a failure so a later visit retries.

import { factionId, loadSymbol, symbolSync } from "../factions.js";
import { parseMapString } from "./parse.js";
import { analyze } from "./analyze.js";
import { renderMapSvg } from "./svg.js";

let tilesPromise;
export const loadTiles = () =>
  (tilesPromise ??= fetch("/data/tiles.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Tile data didn't load (${r.status})`);
      return r.json();
    })
    .then((d) => d.tiles)
    .catch((e) => {
      tilesPromise = undefined; // let a later visit retry
      throw e;
    }));

let artPromise;
export const loadArt = () =>
  (artPromise ??= fetch("/img/tiles/manifest.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no manifest"))))
    .then((d) => new Set(Object.keys(d.tiles)))
    .catch(() => {
      artPromise = undefined;
      return new Set(); // no manifest: every hex keeps its analysis look
    }));

// Loads the symbols for these faction ids (and returns them all, keyed by id), so
// renderMapSvg stays synchronous and pure. Ids that fail to load are left out.
export async function loadSymbols(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  await Promise.all(unique.map(loadSymbol));
  return Object.fromEntries(unique.map((id) => [id, symbolSync(id)]));
}

// The symbols for the factions printed on a parsed map's home tiles.
export const tileSymbols = (parsed, tiles) =>
  loadSymbols(parsed.tiles.map((t) => factionId(tiles[t.id]?.faction)));

// Parses and analyses a map string for drawing. Resolves null when the string
// isn't a map (the same "fewer than 3 known tiles" test as the Map page);
// rejects only if the tile data can't be fetched.
export async function loadMapModel(m) {
  const tiles = await loadTiles();
  const parsed = parseMapString(String(m ?? "").trim(), { data: tiles });
  if (parsed.tiles.filter((t) => tiles[t.id]).length < 3) return null;
  const report = analyze(parsed, tiles);
  return { tiles, parsed, report, symbols: await tileSymbols(parsed, tiles) };
}

// Draws the model with a player name and faction on each labelled seat.
// `labels` is { [seatNumber]: { name?, faction? } }. Any faction symbol the
// labels need is loaded first, so the drawing itself stays synchronous.
export async function drawMapWithLabels(model, labels, title) {
  const picked = Object.values(labels).map((l) => l.faction);
  const symbols = { ...model.symbols, ...(await loadSymbols(picked)) };
  return renderMapSvg(model.parsed, model.report, model.tiles, { title, symbols, seatLabels: labels });
}
