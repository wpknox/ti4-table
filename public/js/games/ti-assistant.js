// Turns a TI Assistant game export into the few fields we use. Pure (no DOM, no
// network), shared by the server endpoint and the form's file upload. Every
// field is untrusted: types are checked, strings are capped, the log is read
// but never kept. Shapes are described in docs/research/ti-assistant.md.

import { factionId } from "./match.js";
import { COLORS } from "./names.js";
import { LIMITS } from "./validate.js";

const MAX_SEATS = LIMITS.maxSeats;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// A game id from a pasted link (/game/<id> or /archive/<id>, any locale prefix),
// or a bare id. Null when there isn't one.
export const GAME_ID = /^[A-Za-z0-9]{4,12}$/;
export function tiGameId(input) {
  const text = String(input ?? "").trim();
  if (GAME_ID.test(text)) return text;
  let url;
  try { url = new URL(text); } catch { return null; }
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.findIndex((p) => p === "game" || p === "archive");
  const id = i >= 0 ? parts[i + 1] : null;
  return id && GAME_ID.test(id) ? id : null;
}

const COLOR_ALIAS = { magenta: "pink" };
const mapColor = (c) => {
  const k = typeof c === "string" ? c.trim().toLowerCase() : "";
  const v = COLOR_ALIAS[k] ?? k;
  return COLORS.includes(v) ? v : null;
};

const log = (json) => (Array.isArray(json?.actionLog) ? json.actionLog.filter(isObj) : []);
const millis = (e) => (Number.isFinite(e.timestampMillis) ? e.timestampMillis : null);

// The earliest log timestamp (ms): when the game started. Null if there is none.
export function logStart(json) {
  let start = null;
  for (const e of log(json)) {
    const t = millis(e);
    if (t != null && (start == null || t < start)) start = t;
  }
  return start;
}

// The earliest ADVANCE_PHASE entry's data (its event holds the seat snapshot).
// The log is newest first, so on equal times the later array element wins.
function firstPhase(entries) {
  let best = null;
  for (const e of entries) {
    if (e.data?.action !== "ADVANCE_PHASE" || !isObj(e.data.event)) continue;
    const t = millis(e) ?? Infinity;
    if (!best || t <= best.t) best = { t, event: e.data.event };
  }
  return best?.event ?? null;
}

// Raw seats: [{ faction_name, name, color, position }]
function rawSeats(data, phase) {
  if (Array.isArray(data.factions) && data.factions.length) {
    return data.factions.filter(isObj).map((f, i) => ({ faction_name: str(f.id, 60), name: f.playerName, color: f.color, position: i }));
  }
  if (isObj(phase?.factions)) {
    return Object.entries(phase.factions).filter(([, f]) => isObj(f)).map(([key, f], i) => ({
      faction_name: str(typeof f.id === "string" ? f.id : key, 60), name: f.playerName, color: f.color,
      position: Number.isInteger(f.mapPosition) ? f.mapPosition : i,
    }));
  }
  return [];
}

// Returns the trimmed game, or null when this isn't a usable TI Assistant game.
export function trimTiGame(json) {
  if (!isObj(json) || !isObj(json.data)) return null;
  const data = json.data;
  const entries = log(json);
  const start = logStart(json);
  if (start == null) return null;
  const when = new Date(start);
  if (Number.isNaN(when.getTime())) return null;

  const phase = firstPhase(entries);
  const raw = rawSeats(data, phase).filter((s) => s.faction_name).slice(0, MAX_SEATS);
  if (!raw.length) return null;

  const used = new Set();
  const seats = raw.map((s) => {
    const ok = Number.isInteger(s.position) && s.position >= 0 && s.position < MAX_SEATS && !used.has(s.position);
    if (ok) used.add(s.position);
    return {
      seat_index: ok ? s.position : null, name: str(s.name, LIMITS.name), faction_name: s.faction_name,
      faction: factionId(s.faction_name), color: mapColor(s.color), points: null, is_winner: false,
    };
  });

  // Starting speaker: the earliest snapshot names a faction. Otherwise data.speaker
  // (an index) counts only if the log has strategy card picks, since it is 0 by default.
  let speaker = null;
  const named = phase?.state?.speaker;
  if (typeof named === "string") {
    const i = seats.findIndex((s) => s.faction_name === named);
    if (i >= 0) speaker = i;
  } else if (Number.isInteger(data.speaker) && data.speaker >= 0 && data.speaker < seats.length &&
    entries.some((e) => e.data?.action === "ASSIGN_STRATEGY_CARD")) {
    speaker = data.speaker;
  }

  const opt = isObj(data.options) ? data.options : {};
  const exp = Array.isArray(opt.expansions) ? opt.expansions : [];
  const vp = opt["victory-points"];
  const map = typeof opt["map-string"] === "string" ? opt["map-string"].trim() : "";
  return {
    played_on: when.toISOString().slice(0, 10),
    points_to_win: Number.isInteger(vp) ? Math.min(LIMITS.maxVp, Math.max(LIMITS.minVp, vp)) : 10,
    pok: exp.includes("POK"),
    te: exp.includes("THUNDERS EDGE"),
    map_string: map && map.length <= LIMITS.mapString ? map : null,
    speaker_index: speaker,
    scores_from_archive: false,
    seats,
  };
}

// Adds the official points and winner from one archive-list entry. Points count
// only when they are integers 0..30; a winner only when it names exactly one seat.
export function applyArchiveScores(trimmed, entry) {
  if (!trimmed || !isObj(entry) || !isObj(entry.factions)) return trimmed;
  const winners = typeof entry.winner === "string" ? trimmed.seats.filter((s) => s.faction_name === entry.winner) : [];
  const seats = trimmed.seats.map((s) => {
    const f = Object.hasOwn(entry.factions, s.faction_name) ? entry.factions[s.faction_name] : null;
    const p = isObj(f) ? f.points : null;
    return {
      ...s,
      points: Number.isInteger(p) && p >= 0 && p <= LIMITS.maxPoints ? p : null,
      is_winner: winners.length === 1 && winners[0] === s,
    };
  });
  return { ...trimmed, scores_from_archive: true, seats };
}
