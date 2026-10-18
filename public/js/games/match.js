// Matching TI Assistant names to ours. Pure: no DOM, no network.

import { factionId } from "../factions.js";

export { factionId };

// Lower case, no accents, single spaces. Only an exact match on this counts.
export const normName = (s) =>
  String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

// The roster player whose name equals `name` once normalised, or null. No fuzzy
// matching: a wrong match would credit a win to the wrong friend. If two roster
// players normalise the same, nobody is picked.
export function matchPlayer(name, roster) {
  const want = normName(name);
  if (!want) return null;
  const hits = roster.filter((p) => normName(p.name) === want);
  return hits.length === 1 ? hits[0].id : null;
}
