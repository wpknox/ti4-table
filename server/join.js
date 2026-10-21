import { HttpError, json, readJson } from "./http.js";
import {
  requireRole, newCode, formatCode, normalizeCode, sha256Hex, nowIso, newSessionToken,
  sessionCookie, SESSION_DAYS, SESSION_MAX_AGE, lockoutGate, failRedeem,
} from "./auth.js";

// ── Rules ───
// A guest seat is claimable only by a player who has never signed in: role none,
// not archived, and no used invite (so a demoted admin or returning player never
// qualifies). The same fragment guards the preview, the admin flags and the claim
// UPDATE itself, so what the page offers is what the database allows.
const LINK_DAYS = 7;
const CLAIMABLE =
  `p.role = 'none' AND p.archived = 0
   AND NOT EXISTS (SELECT 1 FROM invites i WHERE i.player_id = p.id AND i.used_at IS NOT NULL)`;

const CLAIMABLE_SEATS =
  `SELECT p.id AS player_id, p.name, s.faction
     FROM seats s JOIN players p ON p.id = s.player_id
    WHERE s.game_id = ? AND ${CLAIMABLE}
    ORDER BY s.seat_index IS NULL, s.seat_index, p.name COLLATE NOCASE`;

// ── Admin: make and stop links ───
export async function makeJoinLink(ctx, id) {
  requireRole(ctx, "admin");
  const db = ctx.env.DB;
  const game = await db.prepare("SELECT id FROM games WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!game) throw new HttpError(404, "No such game.");
  const { results } = await db.prepare(CLAIMABLE_SEATS).bind(id).all();
  if (!results.length) throw new HttpError(400, "Nobody in this game is a guest.");
  const code = newCode();
  const expires = nowIso(Date.now() + LINK_DAYS * 86400000);
  await db.prepare("INSERT INTO join_links (code_hash, game_id, created_by, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(code), id, ctx.player.id, expires).run();
  return json({ code: formatCode(code), expires_at: expires }, 201);
}

export async function stopJoinLinks(ctx, id) {
  requireRole(ctx, "admin");
  await ctx.env.DB.prepare("UPDATE join_links SET revoked_at = ? WHERE game_id = ? AND revoked_at IS NULL")
    .bind(nowIso(), id).run();
  return json({ ok: true });
}

// For GET /api/games/:id (admins only): which seats are claimable, and the latest live link.
export async function adminJoinInfo(db, gameId) {
  const { results } = await db.prepare(CLAIMABLE_SEATS).bind(gameId).all();
  const link = await db.prepare(
    `SELECT expires_at FROM join_links WHERE game_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC, rowid DESC LIMIT 1`
  ).bind(gameId, nowIso()).first();
  return { claimable: new Set(results.map((r) => r.player_id)), link: link ? { expires_at: link.expires_at } : null };
}

// ── Public: preview and claim ───
// Finds the live link behind a code, or counts a failure and throws 400.
async function liveLink(ctx, body, ipHash) {
  const code = normalizeCode(body.code);
  if (!code) return failRedeem(ctx, ipHash);
  const link = await ctx.env.DB.prepare(
    `SELECT l.game_id, l.created_by, g.played_on, g.date_precision, g.status
       FROM join_links l JOIN games g ON g.id = l.game_id
      WHERE l.code_hash = ? AND l.revoked_at IS NULL AND l.expires_at > ? AND g.deleted_at IS NULL`
  ).bind(await sha256Hex(code), nowIso()).first();
  if (!link) return failRedeem(ctx, ipHash);
  return { ...link, hash: await sha256Hex(code) };
}

export async function joinPreview(ctx) {
  const body = await readJson(ctx.request);
  const ipHash = await lockoutGate(ctx);
  const link = await liveLink(ctx, body, ipHash);
  const { results } = await ctx.env.DB.prepare(CLAIMABLE_SEATS).bind(link.game_id).all();
  return json({
    game: { played_on: link.played_on, date_precision: link.date_precision, status: link.status },
    seats: results.map((r) => ({ player_id: r.player_id, name: r.name, faction: r.faction })),
  });
}

export async function joinClaim(ctx) {
  const body = await readJson(ctx.request);
  if (ctx.player) throw new HttpError(409, `You're already signed in as ${ctx.player.name}. Sign out first to claim a seat.`);
  const db = ctx.env.DB;
  const ipHash = await lockoutGate(ctx);
  const link = await liveLink(ctx, body, ipHash);
  if (!Number.isInteger(body.player_id)) throw new HttpError(400, "player_id is required.");

  const token = newSessionToken();
  const claimHash = await sha256Hex(newSessionToken()); // a random id for the invites row
  const now = nowIso();
  // One transaction. The UPDATE is the gate: it only changes a row that is still
  // claimable, so of two people racing for one seat only one gets a row back. The
  // next two statements run only if it changed something (changes() > 0).
  const [upd] = await db.batch([
    db.prepare(
      `UPDATE players AS p SET role = 'editor'
        WHERE p.id = ? AND ${CLAIMABLE}
          AND EXISTS (SELECT 1 FROM seats s JOIN games g ON g.id = s.game_id
                       WHERE s.game_id = ? AND s.player_id = p.id AND g.deleted_at IS NULL)
          AND EXISTS (SELECT 1 FROM join_links l WHERE l.code_hash = ? AND l.revoked_at IS NULL AND l.expires_at > ?)
        RETURNING id`
    ).bind(body.player_id, link.game_id, link.hash, now),
    db.prepare(
      `INSERT INTO invites (code_hash, player_id, role, created_by, expires_at, used_at)
       SELECT ?, ?, 'editor', ?, ?, ? WHERE changes() > 0`
    ).bind(claimHash, body.player_id, link.created_by, now, now),
    db.prepare(
      `INSERT INTO sessions (token_hash, player_id, expires_at, user_agent)
       SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM invites WHERE code_hash = ?)`
    ).bind(await sha256Hex(token), body.player_id, nowIso(Date.now() + SESSION_DAYS * 86400000),
      (ctx.request.headers.get("user-agent") || "").slice(0, 200), claimHash),
  ]);
  if (!upd.results?.length) throw new HttpError(409, "That seat was just claimed, or isn't a guest. Pick again.");
  const player = await db.prepare("SELECT id, name, role FROM players WHERE id = ?").bind(body.player_id).first();
  return json({ player, game_id: link.game_id }, 200, { "set-cookie": sessionCookie(ctx.url, token, SESSION_MAX_AGE) });
}
