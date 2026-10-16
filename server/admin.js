import { HttpError, json, readJson } from "./http.js";
import { revisionInsert } from "./games.js";
import { requireRole, newCode, formatCode, sha256Hex, nowIso } from "./auth.js";

// ── Invites ───
export async function makeInvite(ctx) {
  requireRole(ctx, "admin");
  const body = await readJson(ctx.request);
  if (!Number.isInteger(body.player_id)) throw new HttpError(400, "player_id is required.");
  if (body.role !== "editor" && body.role !== "admin") throw new HttpError(400, "role must be editor or admin.");
  const player = await ctx.env.DB.prepare("SELECT id, archived FROM players WHERE id = ?").bind(body.player_id).first();
  if (!player) throw new HttpError(404, "No such player.");
  if (player.archived) throw new HttpError(400, "That player is archived.");
  const code = newCode();
  const expires = nowIso(Date.now() + 7 * 86400000);
  await ctx.env.DB.prepare(
    "INSERT INTO invites (code_hash, player_id, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(await sha256Hex(code), body.player_id, body.role, ctx.player.id, expires).run();
  return json({ code: formatCode(code), expires_at: expires });
}

// ── Players ───
export async function listAdminPlayers(ctx) {
  requireRole(ctx, "admin");
  const { results } = await ctx.env.DB.prepare(
    `SELECT p.id, p.name, p.role, p.email, p.archived,
            (SELECT COUNT(*) FROM sessions s WHERE s.player_id = p.id AND s.expires_at > ?) AS sessions,
            (SELECT MAX(last_seen_at) FROM sessions s WHERE s.player_id = p.id) AS last_seen
       FROM players p ORDER BY p.name COLLATE NOCASE`
  ).bind(nowIso()).all();
  return json({
    players: results.map((p) => ({
      id: p.id, name: p.name, role: p.role, email: p.email, archived: !!p.archived,
      sessions: p.sessions, last_seen: p.last_seen,
    })),
  });
}

function checkPatchBody(body) {
  if (body.role !== undefined && !["none", "editor", "admin"].includes(body.role)) {
    throw new HttpError(400, "role must be none, editor or admin.");
  }
  if (body.archived !== undefined && typeof body.archived !== "boolean") {
    throw new HttpError(400, "archived must be true or false.");
  }
  if (body.role === undefined && body.archived === undefined) throw new HttpError(400, "Nothing to change.");
}

export async function patchPlayer(ctx, id) {
  requireRole(ctx, "admin");
  const body = await readJson(ctx.request);
  const db = ctx.env.DB;
  const target = await db.prepare("SELECT id, role, archived FROM players WHERE id = ?").bind(id).first();
  if (!target) throw new HttpError(404, "No such player.");
  checkPatchBody(body);
  // An admin can't lock themselves out.
  if (id === ctx.player.id && ((body.role !== undefined && body.role !== "admin") || body.archived === true)) {
    throw new HttpError(400, "You can't remove your own admin access.");
  }

  const demoting = target.role === "admin" && ((body.role && body.role !== "admin") || body.archived === true);
  if (demoting) {
    const other = await db.prepare(
      "SELECT COUNT(*) AS n FROM players WHERE role = 'admin' AND archived = 0 AND id <> ?"
    ).bind(id).first();
    if (!other.n) throw new HttpError(409, "There has to be at least one admin.");
  }

  let archived = null;
  if (body.archived !== undefined) archived = body.archived ? 1 : 0;
  const stmts = [db.prepare("UPDATE players SET role = COALESCE(?, role), archived = COALESCE(?, archived) WHERE id = ?")
      .bind(body.role ?? null, archived, id)];
  // Cutting access also ends existing sessions (they'd be refused anyway).
  if (body.role === "none" || body.archived === true) {
    stmts.push(db.prepare("DELETE FROM sessions WHERE player_id = ?").bind(id));
  }
  await db.batch(stmts);
  return json({ ok: true });
}

export async function revokeSessions(ctx, id) {
  requireRole(ctx, "admin");
  await ctx.env.DB.prepare("DELETE FROM sessions WHERE player_id = ?").bind(id).run();
  return json({ ok: true });
}

// ── Games ───
export async function restoreGame(ctx, id) {
  requireRole(ctx, "admin");
  const res = await ctx.env.DB.prepare("UPDATE games SET deleted_at = NULL WHERE id = ?").bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, "No such game.");
  return json({ ok: true });
}

// ── Undo ───
export async function listRevisions(ctx, id) {
  requireRole(ctx, "admin");
  const { results } = await ctx.env.DB.prepare(
    `SELECT r.id, r.edited_by, p.name AS editor_name, r.edited_at, r.data
       FROM game_revisions r JOIN players p ON p.id = r.edited_by
      WHERE r.game_id = ? ORDER BY r.id DESC`
  ).bind(id).all();
  return json({
    revisions: results.map((r) => ({
      id: r.id, edited_by: { id: r.edited_by, name: r.editor_name }, edited_at: r.edited_at, data: JSON.parse(r.data),
    })),
  });
}

// Restores a game and its seats from a snapshot. The current state is saved as a
// new revision first, so a revert can itself be reverted.
export async function revertGame(ctx, id) {
  requireRole(ctx, "admin");
  const body = await readJson(ctx.request);
  if (!Number.isInteger(body.revision_id)) throw new HttpError(400, "revision_id is required.");
  const db = ctx.env.DB;
  const rev = await db.prepare("SELECT id FROM game_revisions WHERE id = ? AND game_id = ?").bind(body.revision_id, id).first();
  if (!rev) throw new HttpError(404, "No such revision for that game.");
  await db.batch([
    revisionInsert(db, id, ctx.player.id),
    db.prepare(
      `UPDATE games SET
         played_on = json_extract(r.data, '$.game.played_on'),
         points_to_win = json_extract(r.data, '$.game.points_to_win'),
         pok = json_extract(r.data, '$.game.pok'),
         te = json_extract(r.data, '$.game.te'),
         map_string = json_extract(r.data, '$.game.map_string'),
         ti_assistant_url = json_extract(r.data, '$.game.ti_assistant_url'),
         notes = json_extract(r.data, '$.game.notes'),
         deleted_at = json_extract(r.data, '$.game.deleted_at'),
         updated_by = ?, updated_at = ?
       FROM (SELECT data FROM game_revisions WHERE id = ? AND game_id = ?) AS r WHERE games.id = ?`
    ).bind(ctx.player.id, nowIso(), body.revision_id, id, id),
    db.prepare("DELETE FROM seats WHERE game_id = ?").bind(id),
    db.prepare(
      `INSERT INTO seats (game_id, player_id, faction, color, seat_index, points, is_winner, is_speaker_start)
       SELECT ?, json_extract(value, '$.player_id'), json_extract(value, '$.faction'), json_extract(value, '$.color'),
              json_extract(value, '$.seat_index'), json_extract(value, '$.points'),
              json_extract(value, '$.is_winner'), json_extract(value, '$.is_speaker_start')
         FROM json_each((SELECT json_extract(data, '$.seats') FROM game_revisions WHERE id = ? AND game_id = ?))`
    ).bind(id, body.revision_id, id),
  ]);
  return json({ ok: true });
}
