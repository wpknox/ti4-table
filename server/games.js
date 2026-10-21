import { HttpError, json, readJson } from "./http.js";
import { requireRole, nowIso } from "./auth.js";
import { adminJoinInfo } from "./join.js";
import { checkGameBody } from "../public/js/games/validate.js";

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
// The rules live in public/js/games/validate.js (shared with the form). This adds
// the one check that needs the database.
const bad = (msg) => new HttpError(400, msg);

// Returns a clean game object, or throws a 400 with a plain message.
async function validate(body, db, { creating }) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const { game: g, error } = checkGameBody(body, { creating, today: tomorrow });
  if (error) throw bad(error);

  // Players must exist (the foreign key would fail with a vaguer error).
  const ids = g.playerIds;
  const { results } = await db.prepare(
    "SELECT id FROM players WHERE id IN (SELECT value FROM json_each(?))"
  ).bind(JSON.stringify(ids)).all();
  if (results.length !== ids.length) throw bad("One of the players doesn't exist.");
  return g;
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
                'pok', g.pok, 'te', g.te, 'from_memory', g.from_memory, 'date_precision', g.date_precision, 'map_string', g.map_string, 'ti_assistant_url', g.ti_assistant_url,
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
    id: g.id, status: g.status, played_on: g.played_on, date_precision: g.date_precision, from_memory: !!g.from_memory, points_to_win: g.points_to_win, pok: !!g.pok, te: !!g.te,
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

// Reads need a sign-in too: the log is private to the group.
export async function listGames(ctx) {
  requireRole(ctx, "editor");
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
  requireRole(ctx, "editor");
  const db = ctx.env.DB;
  const found = await loadGame(db, id);
  // Soft-deleted games are visible to admins only (so they can find them to restore).
  if (!found || (found.game.deleted_at && ctx.player?.role !== "admin")) throw new HttpError(404, "No such game.");
  const { game, seats } = found;
  const names = await db.prepare("SELECT id, name FROM players WHERE id IN (?, ?)").bind(game.created_by, game.updated_by).all();
  // Admins also learn which seats a join link could hand out, and whether a live link exists.
  const join = ctx.player.role === "admin" && !game.deleted_at ? await adminJoinInfo(db, id) : null;
  const who = (pid) => ({ id: pid, name: names.results.find((p) => p.id === pid)?.name ?? null });
  return json({
    game: {
      id: game.id, status: game.status, played_on: game.played_on, date_precision: game.date_precision, from_memory: !!game.from_memory, points_to_win: game.points_to_win,
      pok: !!game.pok, te: !!game.te, map_string: game.map_string, ti_assistant_url: game.ti_assistant_url,
      notes: game.notes, created_by: who(game.created_by), updated_by: who(game.updated_by),
      created_at: game.created_at, updated_at: game.updated_at, deleted_at: game.deleted_at,
      seats: seats.map((s) => (ctx.player.role === "admin" ? { ...seatOut(s), claimable: !!join?.claimable.has(s.player_id) } : seatOut(s))),
      ...(ctx.player.role === "admin" ? { join_link: join?.link ?? null } : {}),
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
        `INSERT INTO games (client_id, status, played_on, date_precision, from_memory, points_to_win, pok, te, map_string, ti_assistant_url, notes, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(g.client_id, g.status, g.played_on, g.date_precision, g.from_memory ? 1 : 0, g.points_to_win, g.pok, g.te, g.map_string, g.ti_assistant_url, g.notes, me, me),
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
      `UPDATE games SET status = ?, played_on = ?, date_precision = ?, from_memory = ?, points_to_win = ?, pok = ?, te = ?, map_string = ?, ti_assistant_url = ?,
              notes = ?, updated_by = ?, updated_at = ? WHERE id = ?`
    ).bind(g.status, g.played_on, g.date_precision, g.from_memory ? 1 : 0, g.points_to_win, g.pok, g.te, g.map_string, g.ti_assistant_url, g.notes,
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
