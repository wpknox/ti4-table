import { HttpError, json } from "./http.js";
import { requireRole, nowIso } from "./auth.js";
import { trimTiGame, applyArchiveScores, logStart, GAME_ID } from "../public/js/games/ti-assistant.js";

// ── Limits ───
const PROD_BASE = "https://ti-assistant.com";
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const PER_HOUR = 20;
const HOUR_MS = 3600000;
const CACHE_SECONDS = 300;
const USER_AGENT = "ti4-table (+https://github.com/wpknox/ti4-table)";
const FAILED = "TI Assistant didn't return that game. Check the link, or fill the form in by hand.";

// The host is fixed. env.TI_ASSISTANT_BASE exists only so the checks can point at
// a local stub (set with `wrangler pages dev --binding`, never in wrangler.jsonc
// and never from a request).
const baseOf = (env) =>
  typeof env.TI_ASSISTANT_BASE === "string" && env.TI_ASSISTANT_BASE ? env.TI_ASSISTANT_BASE.replace(/\/+$/, "") : PROD_BASE;

// GET one fixed URL as JSON. Redirects are not followed, a time limit, and the body is read as
// a stream and dropped past MAX_BYTES. Throws on anything else.
async function fetchJson(url) {
  const res = await fetch(url, {
    redirect: "manual", // the Workers runtime has no "error"; a 3xx fails the status check below
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  if (res.status !== 200 || !res.body) throw new Error("status");
  if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("too large");
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return JSON.parse(new TextDecoder().decode(all));
}

// 20 lookups per player per hour, counting repeats that the cache answers.
// Record first, then count, in one batch (a transaction), so parallel requests
// can't all see 19 and slip past. Refused attempts count too; they age out in an hour.
async function countFetch(ctx) {
  const db = ctx.env.DB;
  const [, , counted] = await db.batch([
    db.prepare("DELETE FROM ti_fetches WHERE at < ?").bind(nowIso(Date.now() - HOUR_MS)),
    db.prepare("INSERT INTO ti_fetches (player_id, at) VALUES (?, ?)").bind(ctx.player.id, nowIso()),
    db.prepare("SELECT COUNT(*) AS n FROM ti_fetches WHERE player_id = ?").bind(ctx.player.id),
  ]);
  if (counted.results[0].n > PER_HOUR) throw new HttpError(429, "That's a lot of TI Assistant lookups. Try again in an hour, or fill the form in by hand.");
}

// Official points for an archived game, or null. Any failure just means no scores.
async function archiveEntry(base, gameId, start) {
  try {
    const page = await fetchJson(`${base}/api/archived-games?timestamp=${start + 1}`);
    return page && typeof page === "object" && Object.hasOwn(page, gameId) ? page[gameId] : null;
  } catch {
    return null;
  }
}

export async function tiAssistantGame(ctx, gameId) {
  requireRole(ctx, "editor");
  if (!GAME_ID.test(gameId)) throw new HttpError(400, "That isn't a TI Assistant game id.");
  await countFetch(ctx);

  const base = baseOf(ctx.env);
  const downloadUrl = `${base}/api/${gameId}/download`;
  const cacheKey = new Request(downloadUrl);
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(cacheKey).catch(() => null);
  if (hit) return json(await hit.json());

  let raw, trimmed;
  try {
    raw = await fetchJson(downloadUrl);
    trimmed = trimTiGame(raw);
  } catch {
    throw new HttpError(502, FAILED);
  }
  if (!trimmed) throw new HttpError(502, FAILED);
  trimmed = applyArchiveScores(trimmed, await archiveEntry(base, gameId, logStart(raw)));
  raw = null; // the action log is never kept or returned

  if (cache) {
    const stored = new Response(JSON.stringify(trimmed), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${CACHE_SECONDS}` },
    });
    await cache.put(cacheKey, stored).catch(() => {});
  }
  return json(trimmed);
}
