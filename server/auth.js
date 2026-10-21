import { HttpError, json, readJson } from "./http.js";

// ── Tokens ───
// Crockford base32: no I, L, O or U.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DAY = 86400000;
export const SESSION_DAYS = 180;

export const nowIso = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 19) + "Z";

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 10 chars = 50 bits. 256 is a multiple of 32, so masking is unbiased.
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => ALPHABET[b & 31]).join("");
}

export const formatCode = (code) => `${code.slice(0, 5)}-${code.slice(5)}`;

// Returns the canonical 10-char code, or null if the input can't be one.
export function normalizeCode(input) {
  const s = String(input ?? "").toUpperCase().replace(/[\s-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(s) ? s : null;
}

// ── Cookie ───
// Safari won't store Secure cookies over http, so localhost uses a plain name.
const cookieName = (url) => (url.protocol === "https:" ? "__Host-sid" : "sid");

function readCookie(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(url, token, maxAge) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export const SESSION_MAX_AGE = SESSION_DAYS * DAY / 1000;

// ── Current player ───
// One indexed read. Sets ctx.player (null if signed out, or role none/archived)
// and ctx.setCookie when the sliding expiry was extended.
export async function loadPlayer(ctx) {
  ctx.player = null;
  ctx.tokenHash = null;
  const token = readCookie(ctx.request, cookieName(ctx.url));
  if (!token) return;
  const hash = await sha256Hex(token);
  const row = await ctx.env.DB.prepare(
    `SELECT p.id, p.name, p.role, p.archived, s.last_seen_at
       FROM sessions s JOIN players p ON p.id = s.player_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(hash, nowIso()).first();
  if (!row || row.archived || row.role === "none") return;
  ctx.player = { id: row.id, name: row.name, role: row.role };
  ctx.tokenHash = hash;
  if (Date.parse(row.last_seen_at) < Date.now() - DAY) {
    await ctx.env.DB.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?")
      .bind(nowIso(), nowIso(Date.now() + SESSION_DAYS * DAY), hash).run();
    ctx.setCookie = sessionCookie(ctx.url, token, SESSION_MAX_AGE);
  }
}

const RANK = { none: 0, editor: 1, admin: 2 };

export function requireRole(ctx, role) {
  if (!ctx.player) throw new HttpError(401, "Sign in first.");
  if (RANK[ctx.player.role] < RANK[role]) throw new HttpError(403, "You don't have permission to do that.");
}

// ── Routes ───
export async function me(ctx) {
  return json({ player: ctx.player });
}

export const BAD_CODE = "That code didn't work. Ask for a new one.";

// Failed redeems per client: 10 in 15 minutes, then 429. Keyed by a hash of the
// IP (CF-Connecting-IP; absent on localhost, so "local"). Raw IPs are never stored.
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60000;

export async function failRedeem(ctx, ipHash) {
  const db = ctx.env.DB;
  await db.batch([
    db.prepare("DELETE FROM redeem_attempts WHERE attempted_at < ?").bind(nowIso(Date.now() - FAIL_WINDOW_MS)),
    db.prepare("INSERT INTO redeem_attempts (ip_hash, attempted_at) VALUES (?, ?)").bind(ipHash, nowIso()),
  ]);
  throw new HttpError(400, BAD_CODE);
}

// Hashes the client's IP and throws 429 if it has failed too often. Shared with join links.
export async function lockoutGate(ctx) {
  const ipHash = await sha256Hex(ctx.request.headers.get("cf-connecting-ip") || "local");
  const fails = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM redeem_attempts WHERE ip_hash = ? AND attempted_at > ?")
    .bind(ipHash, nowIso(Date.now() - FAIL_WINDOW_MS)).first();
  if (fails.n >= MAX_FAILS) throw new HttpError(429, "Too many wrong codes. Try again in a few minutes.");
  return ipHash;
}

export async function redeem(ctx) {
  const body = await readJson(ctx.request);
  const db = ctx.env.DB;
  const ipHash = await lockoutGate(ctx);
  const code = normalizeCode(body.code);
  if (!code) return failRedeem(ctx, ipHash);
  const now = nowIso();
  // Claim atomically so two requests can't both use one code.
  const claimed = await db.prepare(
    `UPDATE invites SET used_at = ?
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
      RETURNING player_id, role`
  ).bind(now, await sha256Hex(code), now).first();
  if (!claimed) return failRedeem(ctx, ipHash);

  const token = newSessionToken();
  const stmts = [];
  if (claimed.role) {
    stmts.push(db.prepare("UPDATE players SET role = CASE WHEN role = 'admin' THEN 'admin' ELSE ? END WHERE id = ?").bind(claimed.role, claimed.player_id));
  }
  stmts.push(db.prepare(
    "INSERT INTO sessions (token_hash, player_id, expires_at, user_agent) VALUES (?, ?, ?, ?)"
  ).bind(await sha256Hex(token), claimed.player_id, nowIso(Date.now() + SESSION_DAYS * DAY),
    (ctx.request.headers.get("user-agent") || "").slice(0, 200)));
  await db.batch(stmts);

  const player = await db.prepare("SELECT id, name, role FROM players WHERE id = ?").bind(claimed.player_id).first();
  return json({ player }, 200, { "set-cookie": sessionCookie(ctx.url, token, SESSION_MAX_AGE) });
}

export async function logout(ctx) {
  if (ctx.tokenHash) {
    await ctx.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(ctx.tokenHash).run();
  }
  ctx.setCookie = null;
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(ctx.url, "", 0) });
}

// A code for the signed-in player to type into another device.
export async function deviceCode(ctx) {
  requireRole(ctx, "editor");
  const code = newCode();
  const expires = nowIso(Date.now() + 15 * 60000);
  await ctx.env.DB.prepare(
    "INSERT INTO invites (code_hash, player_id, role, created_by, expires_at) VALUES (?, ?, NULL, ?, ?)"
  ).bind(await sha256Hex(code), ctx.player.id, ctx.player.id, expires).run();
  return json({ code: formatCode(code), expires_at: expires });
}
