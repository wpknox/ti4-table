// Faction symbols. The SVGs use fill="currentColor" so they follow the theme,
// which an <img> can't do; so they're fetched once as text and inlined.
// The files are sanitised by scripts/clean-svg.mjs and served from our own
// origin. Callers put an empty <span class="fsym" data-faction="F_x"></span>
// in their markup (no text, so nothing for the rules index to see) and call
// hydrateSymbols() afterwards.

// Faction name (as in tiles.json) -> symbol id. Keys are normalised by `key()`,
// so "Sardakk N’orr" and "Sardakk Norr", or "Gene–Sorcerers" and "Gene-Sorcerers", match.
// Built from the F_* page titles in rules.json. The Firmament and the Obsidian
// share one rules page (F_firmament) but have a symbol each.
const IDS = {
  "federation of sol": "F_sol", "mentak coalition": "F_mentak", "yin brotherhood": "F_yin",
  "embers of muaat": "F_muaat", arborec: "F_arborec", "l1z1x mindnet": "F_lizix", winnu: "F_winnu",
  "nekro virus": "F_nekro", "naalu collective": "F_naalu", "barony of letnev": "F_letnev",
  "clan of saar": "F_saar", "universities of jolnar": "F_jol_nar", "sardakk norr": "F_norr",
  "xxcha kingdom": "F_xxcha", "yssaril tribes": "F_yssaril", "emirates of hacan": "F_hacan",
  "ghosts of creuss": "F_creuss", "mahact genesorcerers": "F_mahact", nomad: "F_nomad",
  "vuilraith cabal": "F_vuilraith", "titans of ul": "F_ul", empyrean: "F_empyrean",
  "naazrokha alliance": "F_naaz_rokha", "argent flight": "F_argent", "last bastion": "F_bastion",
  "ral nel consortium": "F_ral_nel", "crimson rebellion": "F_rebellion",
  "deepwrought scholarate": "F_deepwrought", firmament: "F_firmament", obsidian: "F_obsidian",
  "council keleres": "F_keleres", keleres: "F_keleres",
};

const key = (name) =>
  String(name).toLowerCase().replace(/^the\s+/, "").replace(/[’'‘\-–—.]/g, "").replace(/\s+/g, " ").trim();

export const factionId = (name) => (name ? IDS[key(name)] ?? null : null);

const cache = new Map(); // id -> svg markup ("" if it couldn't load)
const pending = new Map();

// aria-hidden because the faction's name is always next to the symbol.
// Clip-path ids like "k0" repeat across files, and inlined they'd collide
// (url(#k0) resolves to the first in the document), so prefix them per faction.
const prepare = (text, id) =>
  text
    .replace(/\bid="([^"]+)"/g, `id="${id}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`)
    .replace(/<svg\s/, '<svg aria-hidden="true" focusable="false" ');

export function loadSymbol(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (!pending.has(id))
    pending.set(
      id,
      fetch(`/img/factions/${id}.svg`)
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => "")
        .then((t) => {
          const svg = /^\s*<svg[\s>]/.test(t) ? prepare(t.trim(), id) : "";
          cache.set(id, svg);
          pending.delete(id);
          return svg;
        }),
    );
  return pending.get(id);
}

export const symbolSync = (id) => cache.get(id) ?? "";

// Placeholder markup for a faction id (or null).
export const symbolSlot = (id, cls = "") =>
  id ? `<span class="fsym${cls ? " " + cls : ""}" data-faction="${id}"></span>` : "";

// Fills every empty placeholder under `root`.
export async function hydrateSymbols(root) {
  const slots = [...root.querySelectorAll(".fsym[data-faction]:empty")];
  await Promise.all(
    slots.map(async (el) => {
      const svg = await loadSymbol(el.dataset.faction);
      if (svg && el.isConnected && !el.firstChild) el.innerHTML = svg;
    }),
  );
}
