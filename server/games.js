import { HttpError, json, readJson } from "./http.js";
import { requireRole, nowIso } from "./auth.js";
import { FACTIONS } from "./factions.js";

// ── Rights ───
// Judged on the seats stored *before* an edit, so nobody can seat themselves
// into someone else's game to gain access.
export function canEdit(player, game, storedSeats) {
  if (!player) return false;
  return player.role === "admin" ||
    (player.role === "editor" &&
      (game.created_by === player.id || storedSeats.some((s) => s.player_id === player.id)));
}

export const canDelete = (player, game) =>
  !!player && (player.role === "admin" || (player.role === "editor" && game.created_by === player.id));

// ── Validation ───
const bad = (msg) => new HttpError(400, msg);
const isInt = Number.isInteger;

function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Returns a clean game object, or throws a 400 with a plain message.
async function validate(body, db, { creating }) {
  const g = {};
  if (creating) {
    if (typeof body.client_id !== "string" || body.client_id.length < 8 || body.client_id.length > 64) {
      throw bad("client_id is required.");
    }
    g.client_id = body.client_id;
  }
  g.status = body.status ?? "finished";
  if (g.status !== "planned" && g.status !== "finished") throw bad("status must be planned or finished.");
  validateGameFields(body, g);
  const players = validateSeats(body.seats, g);

  // Players must exist (the foreign key would fail with a vaguer error).
  const ids = [...players];
  const { results } = await db.prepare(
    "SELECT id FROM players WHERE id IN (SELECT value FROM json_each(?))"
  ).bind(JSON.stringify(ids)).all();
  if (results.length !== ids.length) throw bad("One of the players doesn't exist.");
  return g;
}

// Date, points and expansions, copied onto `g`.
function validateGameFields(body, g) {
  if (!validDate(body.played_on)) throw bad("Played on needs a date like 2026-10-11.");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  // A planned game is for a date that hasn't happened yet.
  if (g.status === "finished" && body.played_on > tomorrow) throw bad("That date is in the future.");
  g.played_on = body.played_on;

  g.points_to_win = body.points_to_win ?? 10;
  if (!isInt(g.points_to_win) || g.points_to_win < 4 || g.points_to_win > 20) throw bad("Points to win must be 4 to 20.");

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
  if (g.map_string !== null && (typeof g.map_string !== "string" || g.map_string.length > 2000)) {
    throw bad("The map string is too long.");
  }
  g.ti_assistant_url = body.ti_assistant_url ?? null;
  if (g.ti_assistant_url !== null &&
      (typeof g.ti_assistant_url !== "string" || g.ti_assistant_url.length > 500 || !g.ti_assistant_url.startsWith("https://"))) {
    throw bad("The TI Assistant link must start with https://.");
  }
  g.notes = body.notes ?? "";
  if (typeof g.notes !== "string" || g.notes.length > 4000) throw bad("Notes can be up to 4,000 characters.");
}

// Sets g.seats and returns the set of player ids.
function validateSeats(seats, g) {
  if (!Array.isArray(seats) || seats.length < 3 || seats.length > 8) throw bad("A game needs 3 to 8 seats.");
  const planned = g.status === "planned";
  const seen = { players: new Set(), factions: new Set(), indexes: new Set(), planned };
  let winners = 0, speakers = 0;
  g.seats = seats.map((s) => {
    const seat = validateSeat(s, seen);
    if (seat.is_winner) winners++;
    if (seat.is_speaker_start) speakers++;
    return seat;
  });
  if (!planned && winners !== 1) throw bad("Exactly one seat must be the winner.");
  if (speakers > 1) throw bad("Only one seat can be the starting speaker.");
  return seen.players;
}

function checkSeatIndex(seat_index, indexes) {
  if (!isInt(seat_index) || seat_index < 0 || seat_index > 7) throw bad("Seat position must be 0 to 7.");
  if (indexes.has(seat_index)) throw bad("Two seats can't share a position.");
  indexes.add(seat_index);
}

// A planned seat may have no faction yet. A finished one needs it.
function checkFaction(faction, factions, planned) {
  if (faction === null || faction === undefined) {
    if (planned) return null;
    throw bad("Every seat needs a faction before the game can be finished.");
  }
  if (typeof faction !== "string" || !FACTIONS.has(faction)) throw bad("Unknown faction.");
  if (factions.has(faction)) throw bad("A faction can only be used once.");
  factions.add(faction);
  return faction;
}

function checkPoints(s, planned) {
  if (planned) return 0; // points and winner don't exist until the game is played
  if (!isInt(s.points) || s.points < 0 || s.points > 30) throw bad("Points must be a whole number from 0 to 30.");
  return s.points;
}

function validateSeat(s, { players, factions, indexes, planned }) {
  if (!s || typeof s !== "object") throw bad("Each seat must be an object.");
  if (!isInt(s.player_id)) throw bad("Each seat needs a player.");
  if (players.has(s.player_id)) throw bad("A player can only have one seat.");
  players.add(s.player_id);
  const faction = checkFaction(s.faction, factions, planned);
  const color = s.color ?? null;
  if (color !== null && (typeof color !== "string" || color.length > 20)) throw bad("Colour is too long.");
  const seat_index = s.seat_index ?? null;
  if (seat_index !== null) checkSeatIndex(seat_index, indexes);
  const points = checkPoints(s, planned);
  const win = s.is_winner ?? false, spk = s.is_speaker_start ?? false;
  if (typeof win !== "boolean" || typeof spk !== "boolean") throw bad("is_winner and is_speaker_start must be true or false.");
  return { player_id: s.player_id, faction, color, seat_index, points,
    is_winner: win && !planned ? 1 : 0, is_speaker_start: spk ? 1 : 0 };
}

// ── Statements ───
const SEAT_BY_ID =
  `INSERT INTO seats (game_id, player_id, faction, color, seat_index, points, is_winner, is_speaker_start)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
const SEAT_BY_CLIENT =
  `INSERT INTO seats (game_id, player_id, faction, color, seat_index, points, is_winner, is_speaker_start)
   VALUES ((SELECT id FROM games WHERE client_id = ?), ?, ?, ?, ?, ?, ?, ?)`;
const seatInsert = (db, byClient, key, s) =>
  db.prepare(byClient ? SEAT_BY_CLIENT : SEAT_BY_ID).bind(key, s.player_id, s.faction, s.color, s.seat_index, s.points, s.is_winner, s.is_speaker_start);

// Snapshot of game + seats as they are right now, taken inside the batch so
// concurrent edits can't record a stale copy.
export const revisionInsert = (db, gameId, editorId) =>
  db.prepare(
    `INSERT INTO game_revisions (game_id, data, edited_by)
     SELECT g.id,
            json_object(
              'game', json_object('status', g.status, 'played_on', g.played_on, 'points_to_win', g.points_to_win,
                'pok', g.pok, 'te', g.te, 'map_string', g.map_string, 'ti_assistant_url', g.ti_assistant_url,
                'notes', g.notes, 'created_by', g.created_by, 'updated_by', g.updated_by,
                'updated_at', g.updated_at, 'deleted_at', g.deleted_at),
              'seats', json((SELECT json_group_array(json_object('player_id', s.player_id, 'faction', s.faction,
                'color', s.color, 'seat_index', s.seat_index, 'points', s.points,
                'is_winner', s.is_winner, 'is_speaker_start', s.is_speaker_start))
                FROM seats s WHERE s.game_id = g.id))),
            ?
       FROM games g WHERE g.id = ?`
  ).bind(editorId, gameId);

// ── Reads ───
const seatOut = (s) => ({
  player_id: s.player_id, player_name: s.player_name, faction: s.faction, color: s.color,
  seat_index: s.seat_index, points: s.points, is_winner: !!s.is_winner, is_speaker_start: !!s.is_speaker_start,
});

const SEAT_SELECT =
  `SELECT s.*, p.name AS player_name FROM seats s JOIN players p ON p.id = s.player_id`;
const SEAT_ORDER = `ORDER BY s.game_id, s.seat_index IS NULL, s.seat_index, s.faction`;

function attach(games, seatRows) {
  const by = new Map(games.map((g) => [g.id, []]));
  for (const s of seatRows) by.get(s.game_id)?.push(seatOut(s));
  return games.map((g) => ({
    id: g.id, status: g.status, played_on: g.played_on, points_to_win: g.points_to_win, pok: !!g.pok, te: !!g.te,
    map_string: g.map_string, ti_assistant_url: g.ti_assistant_url,
    seats: by.get(g.id),
  }));
}

async function seatsFor(db, games) {
  if (!games.length) return [];
  const { results } = await db.prepare(
    `${SEAT_SELECT} WHERE s.game_id IN (SELECT value FROM json_each(?)) ${SEAT_ORDER}`
  ).bind(JSON.stringify(games.map((g) => g.id))).all();
  return results;
}

// Soonest first, no paging: there are only ever a handful.
async function listPlanned(db) {
  const { results } = await db.prepare(
    "SELECT * FROM games WHERE deleted_at IS NULL AND status = 'planned' ORDER BY played_on ASC, id ASC LIMIT 50"
  ).all();
  return json({ games: attach(results, await seatsFor(db, results)), next: null });
}

// Stats and the admin page read this; planned games don't count.
async function listAllFinished(db) {
  const { results: games } = await db.prepare(
    "SELECT * FROM games WHERE deleted_at IS NULL AND status = 'finished' ORDER BY played_on DESC, id DESC"
  ).all();
  const { results: seats } = await db.prepare(
    `${SEAT_SELECT} JOIN games g ON g.id = s.game_id WHERE g.deleted_at IS NULL AND g.status = 'finished' ${SEAT_ORDER}`
  ).all();
  return json({ games: attach(games, seats), next: null });
}

async function finishedPage(db, before, limit) {
  if (before === null) {
    const { results } = await db.prepare(
      "SELECT * FROM games WHERE deleted_at IS NULL AND status = 'finished' ORDER BY played_on DESC, id DESC LIMIT ?"
    ).bind(limit + 1).all();
    return results;
  }
  const cursor = Number(before);
  const ref = Number.isInteger(cursor)
    ? await db.prepare("SELECT played_on, id FROM games WHERE id = ?").bind(cursor).first() : null;
  if (!ref) throw bad("Unknown before cursor.");
  const { results } = await db.prepare(
    `SELECT * FROM games WHERE deleted_at IS NULL AND status = 'finished'
       AND (played_on < ? OR (played_on = ? AND id < ?))
     ORDER BY played_on DESC, id DESC LIMIT ?`
  ).bind(ref.played_on, ref.played_on, ref.id, limit + 1).all();
  return results;
}

export async function listGames(ctx) {
  const db = ctx.env.DB;
  const q = ctx.url.searchParams;
  const status = q.get("status");
  if (status !== null && status !== "planned" && status !== "finished") throw bad("status must be planned or finished.");
  if (status === "planned") return listPlanned(db);
  if (q.get("full") === "1") return listAllFinished(db);

  const limit = Math.min(Math.max(parseInt(q.get("limit") ?? "50", 10) || 50, 1), 100);
  const results = await finishedPage(db, q.get("before"), limit);
  const more = results.length > limit;
  const page = results.slice(0, limit);
  return json({ games: attach(page, await seatsFor(db, page)), next: more ? page[page.length - 1].id : null });
}

async function loadGame(db, id) {
  const game = await db.prepare("SELECT * FROM games WHERE id = ?").bind(id).first();
  if (!game) return null;
  const { results } = await db.prepare(`${SEAT_SELECT} WHERE s.game_id = ? ${SEAT_ORDER}`).bind(id).all();
  return { game, seats: results };
}

export async function getGame(ctx, id) {
  const db = ctx.env.DB;
  const found = await loadGame(db, id);
  // Soft-deleted games are visible to admins only (so they can find them to restore).
  if (!found || (found.game.deleted_at && ctx.player?.role !== "admin")) throw new HttpError(404, "No such game.");
  const { game, seats } = found;
  const names = await db.prepare("SELECT id, name FROM players WHERE id IN (?, ?)").bind(game.created_by, game.updated_by).all();
  const who = (pid) => ({ id: pid, name: names.results.find((p) => p.id === pid)?.name ?? null });
  return json({
    game: {
      id: game.id, status: game.status, played_on: game.played_on, points_to_win: game.points_to_win,
      pok: !!game.pok, te: !!game.te, map_string: game.map_string, ti_assistant_url: game.ti_assistant_url,
      notes: game.notes, created_by: who(game.created_by), updated_by: who(game.updated_by),
      created_at: game.created_at, updated_at: game.updated_at, deleted_at: game.deleted_at,
      seats: seats.map(seatOut),
      can_edit: canEdit(ctx.player, game, seats),
      can_delete: canDelete(ctx.player, game),
    },
  });
}

// ── Writes ───
export async function createGame(ctx) {
  requireRole(ctx, "editor");
  const db = ctx.env.DB;
  const g = await validate(await readJson(ctx.request), db, { creating: true });

  const existing = () => db.prepare("SELECT id FROM games WHERE client_id = ?").bind(g.client_id).first();
  const dup = await existing();
  if (dup) return json({ id: dup.id }, 200);

  const me = ctx.player.id;
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM games WHERE created_by = ? AND created_at > ?")
    .bind(me, nowIso(Date.now() - 3600000)).first();
  if (recent.n >= 30) throw new HttpError(429, "That's a lot of games for one hour. Try again later.");
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO games (client_id, status, played_on, points_to_win, pok, te, map_string, ti_assistant_url, notes, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(g.client_id, g.status, g.played_on, g.points_to_win, g.pok, g.te, g.map_string, g.ti_assistant_url, g.notes, me, me),
      ...g.seats.map((s) => seatInsert(db, true, g.client_id, s)),
    ]);
  } catch (err) {
    // A double-tap can race past the check above; the batch rolled back.
    const again = await existing();
    if (again) return json({ id: again.id }, 200);
    throw err;
  }
  const created = await existing();
  return json({ id: created.id }, 201);
}

export async function updateGame(ctx, id) {
  requireRole(ctx, "editor");
  const db = ctx.env.DB;
  const found = await loadGame(db, id);
  if (!found || found.game.deleted_at) throw new HttpError(404, "No such game.");
  if (!canEdit(ctx.player, found.game, found.seats)) {
    throw new HttpError(403, "You can only edit games you created or played in.");
  }
  const g = await validate(await readJson(ctx.request), db, { creating: false });
  if (found.game.status === "finished" && g.status === "planned") throw bad("A finished game can't go back to planned.");
  await db.batch([
    revisionInsert(db, id, ctx.player.id),
    db.prepare(
      `UPDATE games SET status = ?, played_on = ?, points_to_win = ?, pok = ?, te = ?, map_string = ?, ti_assistant_url = ?,
              notes = ?, updated_by = ?, updated_at = ? WHERE id = ?`
    ).bind(g.status, g.played_on, g.points_to_win, g.pok, g.te, g.map_string, g.ti_assistant_url, g.notes,
      ctx.player.id, nowIso(), id),
    db.prepare("DELETE FROM seats WHERE game_id = ?").bind(id),
    ...g.seats.map((s) => seatInsert(db, false, id, s)),
  ]);
  return json({ id });
}

export async function deleteGame(ctx, id) {
  requireRole(ctx, "editor");
  const db = ctx.env.DB;
  const found = await loadGame(db, id);
  if (!found || found.game.deleted_at) throw new HttpError(404, "No such game.");
  if (!canDelete(ctx.player, found.game)) throw new HttpError(403, "Only the person who logged a game, or an admin, can delete it.");
  const now = nowIso();
  await db.batch([
    revisionInsert(db, id, ctx.player.id),
    db.prepare("UPDATE games SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?").bind(now, ctx.player.id, now, id),
  ]);
  return json({ ok: true });
}
