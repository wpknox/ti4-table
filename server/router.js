import { HttpError, error, checkMutation } from "./http.js";
import { loadPlayer, me, redeem, logout, deviceCode } from "./auth.js";
import { listPlayers, createPlayer, renamePlayer } from "./players.js";
import { listGames, getGame, createGame, updateGame, deleteGame } from "./games.js";
import { makeJoinLink, stopJoinLinks, joinPreview, joinClaim } from "./join.js";
import { tiAssistantGame } from "./ti-assistant.js";
import { makeInvite, listAdminPlayers, patchPlayer, revokeSessions, restoreGame, listRevisions, revertGame } from "./admin.js";

// ── SQL rule ───
// Every query is a fixed string run with env.DB.prepare(sql).bind(...) and ? placeholders.
// Never build SQL from request data (values, ORDER BY, LIMIT, column names) by template
// strings or concatenation. If a request must change the SQL shape, pick between fixed
// strings in code. Lists of ids go in as one JSON value read with json_each(?).

// ── Route table ───
// :id is passed as a number; :gid (a TI Assistant game id) as a raw string that its
// handler validates, so a bad one gets a 400 rather than a 404. Role checks live in the handlers.
const ROUTES = [
  ["GET", "/api/me", me],
  ["GET", "/api/players", listPlayers],
  ["GET", "/api/games", listGames],
  ["GET", "/api/games/:id", getGame],
  ["GET", "/api/ti-assistant/:gid", tiAssistantGame],
  ["POST", "/api/auth/redeem", redeem],
  ["POST", "/api/auth/logout", logout],
  ["POST", "/api/auth/device-code", deviceCode],
  ["POST", "/api/games", createGame],
  ["PUT", "/api/games/:id", updateGame],
  ["DELETE", "/api/games/:id", deleteGame],
  ["POST", "/api/players", createPlayer],
  ["PATCH", "/api/players/:id", renamePlayer],
  ["POST", "/api/games/:id/join-links", makeJoinLink],
  ["DELETE", "/api/games/:id/join-links", stopJoinLinks],
  ["POST", "/api/join/preview", joinPreview],
  ["POST", "/api/join/claim", joinClaim],
  ["POST", "/api/admin/invites", makeInvite],
  ["GET", "/api/admin/players", listAdminPlayers],
  ["PATCH", "/api/admin/players/:id", patchPlayer],
  ["DELETE", "/api/admin/players/:id/sessions", revokeSessions],
  ["POST", "/api/admin/games/:id/restore", restoreGame],
  ["GET", "/api/admin/games/:id/revisions", listRevisions],
  ["POST", "/api/admin/games/:id/revert", revertGame],
].map(([method, path, fn]) => ({
  method, fn,
  re: new RegExp("^" + path.replace(":id", "(\\d{1,12})").replace(":gid", "([^/]{1,100})") + "/?$"),
  hasId: path.includes(":id"),
  hasGid: path.includes(":gid"),
}));

// ── Entry ───
export async function handle(request, env) {
  try {
    const url = new URL(request.url);
    const matches = ROUTES.filter((r) => r.re.test(url.pathname));
    if (!matches.length) return error(404, "Not found.");
    const route = matches.find((r) => r.method === request.method);
    if (!route) return error(405, "Method not allowed.");

    const ctx = { request, env, url, player: null, setCookie: null };
    if (request.method !== "GET") checkMutation(request, url);
    await loadPlayer(ctx);
    const param = url.pathname.match(route.re)[1];
    let id;
    if (route.hasId) id = Number(param);
    else if (route.hasGid) {
      try { id = decodeURIComponent(param); } catch { id = ""; } // "" fails the handler's check
    }
    const res = await route.fn(ctx, id);
    if (ctx.setCookie) res.headers.append("set-cookie", ctx.setCookie);
    return res;
  } catch (err) {
    if (err instanceof HttpError) return error(err.status, err.message);
    console.error(err);
    return error(500, "Server error");
  }
}
