// Pure state helpers for the log form: blank/loaded/draft state, the winner rule
// and the request body. No DOM, so none of it needs a browser.

import { FACTION_IDS, COLORS } from "./names.js";
import { todayLocal } from "./ui.js";
import { LIMITS } from "./validate.js";

export const MIN_SEATS = LIMITS.minSeats, MAX_SEATS = LIMITS.maxSeats, START_SEATS = 6;

let keySeq = 0;
export const newSeat = () => ({ key: `s${++keySeq}`, player_id: null, player_name: "", faction: "", color: "", seat_index: null, points: 0 });

export const blank = () => ({
  client_id: crypto.randomUUID(),
  played_on: todayLocal(),
  points_to_win: 10,
  pok: true,
  te: false,
  map_string: "",
  ti_assistant_url: "",
  notes: "",
  seats: Array.from({ length: START_SEATS }, newSeat),
  winner: null, // seat key the user picked by hand, or null for "top score"
  speaker: null, // seat key
});

// ── Winner ─────────────────────────────────────────────────────────────────

// { key } when decided, { tied: [keys], points } when the top score is shared.
export function pickWinner(st) {
  if (st.winner && st.seats.some((s) => s.key === st.winner)) return { key: st.winner, manual: true };
  const top = Math.max(...st.seats.map((s) => s.points));
  const best = st.seats.filter((s) => s.points === top);
  return best.length === 1 ? { key: best[0].key } : { tied: best.map((s) => s.key), points: top };
}

// ── Starting points ────────────────────────────────────────────────────────

// plan: saves as planned. finish: a planned game being turned into a finished one.
export function modeOf(env, game) {
  const q = env.url.searchParams;
  if (!game) return { plan: q.get("plan") === "1", finish: false };
  const planned = game.status === "planned";
  const finish = planned && q.get("finish") === "1";
  return { plan: planned && !finish, finish };
}

// A saved draft only comes back in the mode it was made in, and a plan link with a
// map only restores a draft for that same map (otherwise the new map would be lost).
export function usableDraft(draft, mode, st) {
  if (!draft || !Array.isArray(draft.seats) || !draft.seats.length) return false;
  if ((draft.plan === true) !== mode.plan) return false;
  return !(mode.plan && st.map_string && draft.map_string !== st.map_string);
}

// Plan seat N is map seat N: pad or trim to the map's seat count and number them.
export function fitSeats(st, n) {
  while (st.seats.length < n) st.seats.push(newSeat());
  st.seats.length = n;
  st.seats.forEach((s, i) => { s.seat_index = i; });
}

export function fromGame(g) {
  if (!g) return null;
  const seats = g.seats.map((s) => ({
    key: `s${++keySeq}`, player_id: s.player_id, player_name: s.player_name, faction: s.faction ?? "",
    color: s.color ?? "", seat_index: s.seat_index, points: s.points,
  }));
  const w = g.seats.findIndex((s) => s.is_winner);
  const sp = g.seats.findIndex((s) => s.is_speaker_start);
  return {
    client_id: null, played_on: g.played_on, points_to_win: g.points_to_win, pok: g.pok, te: g.te,
    map_string: g.map_string ?? "", ti_assistant_url: g.ti_assistant_url ?? "", notes: g.notes ?? "",
    seats, winner: w >= 0 ? seats[w].key : null, speaker: sp >= 0 ? seats[sp].key : null,
  };
}

// A draft came from storage, so don't trust its shape.
export function sanitiseDraft(d, fallback) {
  const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
  const str = (v, def = "") => (typeof v === "string" ? v : def);
  const seats = d.seats.slice(0, MAX_SEATS).map((s) => ({
    key: `s${++keySeq}`,
    player_id: Number.isInteger(s?.player_id) ? s.player_id : null,
    player_name: str(s?.player_name),
    faction: FACTION_IDS.includes(s?.faction) ? s.faction : "",
    color: COLORS.includes(s?.color) ? s.color : "",
    seat_index: int(s?.seat_index, 0, MAX_SEATS - 1, null),
    points: int(s?.points, 0, LIMITS.maxPoints, 0),
  }));
  while (seats.length < MIN_SEATS) seats.push(newSeat());
  // Keys are per session, so a draft remembers winner and speaker by position.
  const at = (i) => (Number.isInteger(i) ? seats[i]?.key ?? null : null);
  return {
    client_id: str(d.client_id).length >= 8 ? d.client_id : fallback.client_id ?? crypto.randomUUID(),
    played_on: /^\d{4}-\d{2}-\d{2}$/.test(str(d.played_on)) ? d.played_on : fallback.played_on,
    points_to_win: int(d.points_to_win, LIMITS.minVp, LIMITS.maxVp, 10),
    pok: d.pok !== false, te: d.te === true,
    map_string: str(d.map_string).slice(0, LIMITS.mapString), ti_assistant_url: str(d.ti_assistant_url).slice(0, LIMITS.tiUrl),
    notes: str(d.notes).slice(0, LIMITS.notes),
    seats, winner: at(d.winner_i), speaker: at(d.speaker_i),
  };
}

// ── The request ────────────────────────────────────────────────────────────

// The body for POST /api/games (or PUT when editing). `plan` saves as planned.
export function toBody(st, { plan, editId }) {
  const w = plan ? { key: null } : pickWinner(st);
  const body = {
    status: plan ? "planned" : "finished",
    played_on: st.played_on,
    points_to_win: st.points_to_win,
    pok: st.pok,
    te: st.te,
    map_string: st.map_string.trim() || null,
    ti_assistant_url: st.ti_assistant_url.trim() || null,
    notes: st.notes,
    seats: st.seats.map((s) => ({
      player_id: s.player_id, faction: s.faction || null, color: s.color || null,
      seat_index: s.seat_index, points: plan ? 0 : s.points,
      is_winner: s.key === w.key, is_speaker_start: s.key === st.speaker,
    })),
  };
  if (!editId) body.client_id = st.client_id;
  return body;
}
