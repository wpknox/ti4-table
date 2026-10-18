// Game validation shared by the server and the log form. Pure: no DOM, no database.
// The server adds the one check that needs data (do the players exist?).

import { FACTION_IDS } from "./names.js";

export const LIMITS = { minSeats: 3, maxSeats: 8, minVp: 4, maxVp: 20, maxPoints: 30,
  mapString: 2000, tiUrl: 500, notes: 4000, color: 20, name: 40 };

const FACTIONS = new Set(FACTION_IDS);
const PRECISIONS = new Set(["day", "month", "year"]);

class Invalid extends Error {}
const bad = (msg) => new Invalid(msg);
const isInt = Number.isInteger;

export function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// The link is shown as "Open in TI Assistant", so it may only go there.
// Older rows that fail it show no link.
const TI_HOSTS = new Set(["ti-assistant.com", "www.ti-assistant.com", "dev.ti-assistant.com"]);
export function isTiAssistantUrl(s) {
  if (typeof s !== "string" || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && TI_HOSTS.has(u.hostname) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

// ── The whole game ───

// Returns { game } (a clean game object) or { error } (a plain message).
// `today` is the latest date a finished game may have, as YYYY-MM-DD. The
// server passes UTC tomorrow and the form passes local tomorrow, so nobody is
// rejected for being a timezone ahead.
export function checkGameBody(body, { creating, today }) {
  try {
    return { game: validate(body, creating, today) };
  } catch (err) {
    if (err instanceof Invalid) return { error: err.message };
    throw err;
  }
}

function validate(body, creating, today) {
  const g = {};
  if (creating) {
    if (typeof body.client_id !== "string" || body.client_id.length < 8 || body.client_id.length > 64) {
      throw bad("client_id is required.");
    }
    g.client_id = body.client_id;
  }
  g.status = body.status ?? "finished";
  if (g.status !== "planned" && g.status !== "finished") throw bad("status must be planned or finished.");
  g.from_memory = body.from_memory ?? false;
  if (typeof g.from_memory !== "boolean") throw bad("from_memory must be true or false.");
  if (g.from_memory && g.status === "planned") throw bad("A game logged from memory has already been played.");
  g.date_precision = body.date_precision ?? "day";
  if (!PRECISIONS.has(g.date_precision)) throw bad("date_precision must be day, month or year.");
  if (g.date_precision !== "day" && !g.from_memory) throw bad("Only a game logged from memory can have a month or year for a date.");
  validateGameFields(body, g, today);
  validateSeats(body.seats, g);
  return g;
}

// Date, points and expansions, copied onto `g`.
function validateGameFields(body, g, today) {
  if (!validDate(body.played_on)) throw bad("Played on needs a date like 2026-10-11.");
  // A planned game is for a date that hasn't happened yet.
  if (g.status === "finished" && body.played_on > today) throw bad("That date is in the future.");
  // A month is stored as the 1st of it and a year as 1 January, so dates still sort.
  const tail = { day: "", month: "-01", year: "-01-01" }[g.date_precision];
  if (tail && !body.played_on.endsWith(tail)) throw bad(`A ${g.date_precision} date must be stored as ${g.date_precision === "month" ? "YYYY-MM-01" : "YYYY-01-01"}.`);
  g.played_on = body.played_on;

  g.points_to_win = body.points_to_win ?? 10;
  if (!isInt(g.points_to_win) || g.points_to_win < LIMITS.minVp || g.points_to_win > LIMITS.maxVp) throw bad("Points to win must be 4 to 20.");

  for (const [key, def] of [["pok", true], ["te", false]]) {
    const v = body[key] ?? def;
    if (typeof v !== "boolean") throw bad(`${key} must be true or false.`);
    g[key] = v ? 1 : 0;
  }

  validateExtras(body, g);
}

// Map string, TI Assistant link and notes.
function validateExtras(body, g) {
  g.map_string = body.map_string ?? null;
  if (g.map_string !== null && (typeof g.map_string !== "string" || g.map_string.length > LIMITS.mapString)) {
    throw bad("The map string is too long.");
  }
  g.ti_assistant_url = body.ti_assistant_url ?? null;
  if (g.ti_assistant_url !== null &&
      (typeof g.ti_assistant_url !== "string" || g.ti_assistant_url.length > LIMITS.tiUrl || !isTiAssistantUrl(g.ti_assistant_url))) {
    throw bad("The TI Assistant link must be an https://ti-assistant.com link.");
  }
  g.notes = body.notes ?? "";
  if (typeof g.notes !== "string" || g.notes.length > LIMITS.notes) throw bad("Notes can be up to 4,000 characters.");
}

// ── Seats ───

// Sets g.seats and g.playerIds (the distinct player ids, for the server's existence check).
function validateSeats(seats, g) {
  if (!Array.isArray(seats) || seats.length < LIMITS.minSeats || seats.length > LIMITS.maxSeats) throw bad("A game needs 3 to 8 seats.");
  const planned = g.status === "planned";
  const seen = { players: new Set(), factions: new Set(), indexes: new Set(), planned, memory: g.from_memory };
  let winners = 0, speakers = 0;
  g.seats = seats.map((s) => {
    const seat = validateSeat(s, seen);
    if (seat.is_winner) winners++;
    if (seat.is_speaker_start) speakers++;
    return seat;
  });
  if (!planned && winners !== 1) throw bad("Exactly one seat must be the winner.");
  if (speakers > 1) throw bad("Only one seat can be the starting speaker.");
  g.playerIds = [...seen.players];
}

function checkSeatIndex(seat_index, indexes) {
  if (!isInt(seat_index) || seat_index < 0 || seat_index > LIMITS.maxSeats - 1) throw bad("Seat position must be 0 to 7.");
  if (indexes.has(seat_index)) throw bad("Two seats can't share a position.");
  indexes.add(seat_index);
}

// A planned seat may have no faction yet, and so may one remembered later. A live finished one needs it.
function checkFaction(faction, factions, optional) {
  if (faction === null || faction === undefined) {
    if (optional) return null;
    throw bad("Every seat needs a faction before the game can be finished.");
  }
  if (typeof faction !== "string" || !FACTIONS.has(faction)) throw bad("Unknown faction.");
  if (factions.has(faction)) throw bad("A faction can only be used once.");
  factions.add(faction);
  return faction;
}

// From memory, a seat's points may be unknown (null), and a score above the winner's is allowed.
function checkPoints(s, planned, memory) {
  if (planned) return 0; // points and winner don't exist until the game is played
  if (memory && (s.points === null || s.points === undefined)) return null;
  if (!isInt(s.points) || s.points < 0 || s.points > LIMITS.maxPoints) throw bad("Points must be a whole number from 0 to 30.");
  return s.points;
}

function validateSeat(s, { players, factions, indexes, planned, memory }) {
  if (!s || typeof s !== "object") throw bad("Each seat must be an object.");
  if (!isInt(s.player_id)) throw bad("Each seat needs a player.");
  if (players.has(s.player_id)) throw bad("A player can only have one seat.");
  players.add(s.player_id);
  const faction = checkFaction(s.faction, factions, planned || memory);
  const color = s.color ?? null;
  if (color !== null && (typeof color !== "string" || color.length > LIMITS.color)) throw bad("Colour is too long.");
  const seat_index = s.seat_index ?? null;
  if (seat_index !== null) checkSeatIndex(seat_index, indexes);
  const points = checkPoints(s, planned, memory);
  const win = s.is_winner ?? false, spk = s.is_speaker_start ?? false;
  if (typeof win !== "boolean" || typeof spk !== "boolean") throw bad("is_winner and is_speaker_start must be true or false.");
  return { player_id: s.player_id, faction, color, seat_index, points,
    is_winner: win && !planned ? 1 : 0, is_speaker_start: spk ? 1 : 0 };
}
