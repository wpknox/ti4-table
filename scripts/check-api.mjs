// Acceptance script for the games API (milestone 3, phase 3).
//   npm run check:api
// Uses a private local D1 in .wrangler/check-state, starts `wrangler pages dev`
// on port 8790, runs every check, and always stops the server. Node built-ins only.
import { createServer } from "node:http";
import { startServer, resetState, makeInvite as invite, wrangler } from "./lib/dev-server.mjs";
import {
  LIVE_ID, LIVE_GAME, ARCHIVED_ID, ARCHIVED_EXPORT, ARCHIVED_START, ARCHIVE_PAGE,
} from "./fixtures/ti-assistant.mjs";

const PORT = 8790;
const BASE = `http://localhost:${PORT}`;
const STATE = ".wrangler/check-state";
const STUB_PORT = 8792;

// ── Helpers ───
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  const why = ok || !detail ? "" : `  -> ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${why}`);
}

async function api(method, path, { cookie, body, origin = BASE, type = "application/json", raw, ip } = {}) {
  const headers = {};
  if (ip) headers["cf-connecting-ip"] = ip;
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  if (method !== "GET" && type) headers["content-type"] = type;
  const res = await fetch(BASE + path, {
    method, headers,
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, data, setCookie: res.headers.getSetCookie?.() ?? [] };
}

const cookieOf = (res) => (res.setCookie[0] || "").split(";")[0];

const makeInvite = (name, role) => invite(STATE, name, role);

async function signIn(name, role) {
  const res = await api("POST", "/api/auth/redeem", { body: { code: makeInvite(name, role) } });
  if (res.status !== 200) throw new Error(`redeem failed for ${name}: ${res.status}`);
  return { cookie: cookieOf(res), id: res.data.player.id, res };
}

const FACTION_LIST = ["F_arborec", "F_hacan", "F_sol", "F_muaat", "F_xxcha", "F_yssaril"];
const today = new Date().toISOString().slice(0, 10);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
let clientN = 0;
function gameBody(playerIds, over = {}) {
  return {
    client_id: `check-api-${Date.now()}-${++clientN}`,
    played_on: today, points_to_win: 10, pok: true, te: false, notes: "",
    seats: playerIds.map((id, i) => ({
      player_id: id, faction: FACTION_LIST[i], color: null, seat_index: i,
      points: i === 0 ? 10 : 5, is_winner: i === 0, is_speaker_start: i === 0,
    })),
    ...over,
  };
}

let server;
let stub;

// ── TI Assistant stub ───
// Stands in for ti-assistant.com (wrangler gets it as TI_ASSISTANT_BASE), serving
// made-up fixtures. `seen` records every request path so the checks can see what
// the server asked for.
const seen = [];
function startStub() {
  const sendJson = (res, body) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  stub = createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    seen.push(req.url);
    const m = url.pathname.match(/^\/api\/([A-Za-z0-9]+)\/download$/);
    if (m?.[1] === LIVE_ID) return sendJson(res, LIVE_GAME);
    if (m?.[1] === ARCHIVED_ID) return sendJson(res, ARCHIVED_EXPORT);
    if (m?.[1] === "NotJs1") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html>nope</html>"); }
    if (m?.[1] === "Redir1") { res.writeHead(302, { location: "https://example.com/" }); return res.end(); }
    if (m?.[1] === "BigBig") {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"pad":"');
      for (let i = 0; i < 40; i++) res.write("x".repeat(100000));
      return res.end('"}');
    }
    if (m?.[1] === "Hang42") return; // never answers
    if (url.pathname === "/api/archived-games") {
      return sendJson(res, url.searchParams.get("timestamp") === String(ARCHIVED_START + 1) ? ARCHIVE_PAGE : {});
    }
    res.writeHead(404); res.end("not found");
  });
  return new Promise((resolve) => stub.listen(STUB_PORT, "127.0.0.1", resolve));
}

// ── Run ───
async function run() {
  resetState(STATE);
  await startStub();
  server = await startServer({ port: PORT, state: STATE, args: ["--binding", `TI_ASSISTANT_BASE=http://127.0.0.1:${STUB_PORT}`] });

  const admin = await signIn("Admin A", "admin");
  const e1 = await signIn("Ed One", "editor");
  const e2 = await signIn("Ed Two", "editor");
  const e3 = await signIn("Ed Three", "editor");
  const reader = await signIn("Reader", "editor"); // never edits; reads need a session

  // Auth
  let r = await api("GET", "/api/me");
  check("GET /api/me with no cookie returns {player:null}", r.status === 200 && r.data.player === null);
  r = await api("GET", "/api/me", { cookie: e1.cookie });
  check("GET /api/me for Ed One returns name and role editor", r.data?.player?.name === "Ed One" && r.data.player.role === "editor");

  const code = makeInvite("Ed Four", "editor");
  r = await api("POST", "/api/auth/redeem", { body: { code } });
  check("A fresh code redeems", r.status === 200);
  const reused = await api("POST", "/api/auth/redeem", { body: { code } });
  const fake = await api("POST", "/api/auth/redeem", { body: { code: "ABCDE-FGHJK" } });
  check("A used code gives 400 with the same message as a made-up code",
    reused.status === 400 && fake.status === 400 && reused.data.error === fake.data.error, `${reused.status} ${fake.status}`);

  const loose = makeInvite("Ed Five", "editor").toLowerCase().replace("-", "").replace(/0/g, "o");
  r = await api("POST", "/api/auth/redeem", { body: { code: loose } });
  check("A lowercase code with no dash and O for 0 redeems", r.status === 200, `${loose} -> ${r.status}`);

  const sc = e1.res.setCookie[0] || "";
  check("On http the cookie is named sid with HttpOnly and SameSite=Lax",
    sc.startsWith("sid=") && /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc), sc);

  const temp = await signIn("Temp Session", "editor");
  r = await api("POST", "/api/auth/logout", { cookie: temp.cookie, body: {} });
  const afterLogout = await api("GET", "/api/me", { cookie: temp.cookie });
  check("Logout ends the session", r.status === 200 && afterLogout.data.player === null);

  r = await api("POST", "/api/auth/device-code", { cookie: e2.cookie, body: {} });
  const second = await api("POST", "/api/auth/redeem", { body: { code: r.data?.code } });
  const secondCookie = cookieOf(second);
  const [m1, m2] = await Promise.all([
    api("GET", "/api/me", { cookie: e2.cookie }), api("GET", "/api/me", { cookie: secondCookie }),
  ]);
  check("Device code gives Ed Two a second working session",
    r.status === 200 && second.status === 200 && m1.data.player?.name === "Ed Two" && m2.data.player?.name === "Ed Two");

  // Write gates
  const probe = gameBody([e1.id, e2.id, 1]);
  r = await api("POST", "/api/games", { body: probe });
  check("POST /api/games with no cookie -> 401", r.status === 401, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: probe, origin: "https://evil.example" });
  check("POST /api/games with a foreign Origin -> 403", r.status === 403, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, raw: JSON.stringify(probe), type: "text/plain" });
  check("POST /api/games as text/plain is refused (415)", r.status === 415, r.status);
  r = await api("POST", "/api/admin/invites", { cookie: e1.cookie, body: { player_id: e1.id, role: "editor" } });
  check("Admin route with an editor cookie -> 403", r.status === 403, r.status);

  // Create
  const g1p3 = await api("POST", "/api/players", { cookie: e1.cookie, body: { name: "Guest One" } });
  const g1p4 = await api("POST", "/api/players", { cookie: e1.cookie, body: { name: "Guest Two" } });
  check("POST /api/players -> 201", g1p3.status === 201 && g1p4.status === 201);
  const ids = [e1.id, e2.id, g1p3.data.id, g1p4.data.id];
  const g1body = gameBody(ids, { pok: true, te: true });
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: g1body });
  const G1 = r.data?.id;
  check("Ed One creates G1 with 4 seats -> 201", r.status === 201 && Number.isInteger(G1), JSON.stringify(r.data));
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: g1body });
  check("Re-posting the same client_id -> 200 with the same id", r.status === 200 && r.data.id === G1);

  const invalid = async (name, mutate) => {
    const b = gameBody(ids);
    mutate(b);
    const res = await api("POST", "/api/games", { cookie: e1.cookie, body: b });
    check(`Validation: ${name} -> 400`, res.status === 400, `${res.status} ${JSON.stringify(res.data)}`);
  };
  await invalid("two winners", (b) => { b.seats[1].is_winner = true; });
  await invalid("repeated faction", (b) => { b.seats[1].faction = b.seats[0].faction; });
  await invalid("unknown faction F_nope", (b) => { b.seats[1].faction = "F_nope"; });
  await invalid("2 seats", (b) => { b.seats = b.seats.slice(0, 2); });
  await invalid("date two days in the future", (b) => { b.played_on = daysFromNow(2); });
  await invalid("http:// TI Assistant link", (b) => { b.ti_assistant_url = "http://example.com/game"; });
  await invalid("4,001 characters of notes", (b) => { b.notes = "x".repeat(4001); });

  // Edit rights
  const edit = (who, id, notes, mutate) => {
    const b = gameBody(ids, { notes });
    mutate?.(b);
    return api("PUT", `/api/games/${id}`, { cookie: who.cookie, body: b });
  };
  r = await edit(e2, G1, "edited by Ed Two");
  check("Seated Ed Two edits G1 -> 200", r.status === 200, r.status);
  r = await edit(e3, G1, "nope");
  check("Unseated Ed Three edits G1 -> 403", r.status === 403, r.status);
  r = await edit(e3, G1, "nope", (b) => { b.seats[3].player_id = e3.id; });
  check("Ed Three adding himself to the seats is still 403", r.status === 403, r.status);
  const afterBlocked = await api("GET", `/api/games/${G1}`, { cookie: reader.cookie });
  check("The blocked edits changed nothing", afterBlocked.data.game.notes === "edited by Ed Two" &&
    !afterBlocked.data.game.seats.some((s) => s.player_id === e3.id));
  r = await edit(admin, G1, "edited by admin");
  check("Admin A edits G1 -> 200", r.status === 200, r.status);
  r = await edit(e1, G1, "edited by Ed One");
  check("Creator Ed One edits G1 -> 200", r.status === 200, r.status);

  const flags = async (who) => {
    const g = (await api("GET", `/api/games/${G1}`, { cookie: who?.cookie })).data?.game;
    return `${g?.can_edit}/${g?.can_delete}`;
  };
  check("can_edit/can_delete for Ed One is true/true", (await flags(e1)) === "true/true");
  check("can_edit/can_delete for Ed Two is true/false", (await flags(e2)) === "true/false");
  check("can_edit/can_delete for Ed Three is false/false", (await flags(e3)) === "false/false");
  r = await api("GET", `/api/games/${G1}`);
  check("GET /api/games/:id signed out -> 401", r.status === 401, r.status);
  r = await api("GET", "/api/games?full=1");
  check("GET /api/games signed out -> 401", r.status === 401, r.status);
  r = await api("GET", "/api/players");
  check("GET /api/players signed out -> 401", r.status === 401, r.status);

  const revs = wrangler("d1", "execute", "ti4-table", "--local", "--persist-to", STATE, "--json",
    "--command", `SELECT COUNT(*) AS n FROM game_revisions WHERE game_id = ${G1}`);
  let n = null;
  try { n = JSON.parse(revs.stdout)[0].results[0].n; } catch { /* reported below */ }
  check("game_revisions has 3 rows for G1 after three edits", n === 3, `got ${n}`);

  // Extra games so pagination has something to walk (two share a date).
  for (const [i, date] of [daysFromNow(-3), daysFromNow(-3), daysFromNow(-10)].entries()) {
    await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody([e1.id, e2.id, g1p3.data.id], { played_on: date, notes: `extra ${i}` }) });
  }

  // Delete
  r = await api("DELETE", `/api/games/${G1}`, { cookie: e2.cookie, body: {} });
  check("Seated Ed Two deleting G1 -> 403", r.status === 403, r.status);
  r = await api("DELETE", `/api/games/${G1}`, { cookie: e1.cookie, body: {} });
  const listed = await api("GET", "/api/games?full=1", { cookie: reader.cookie });
  check("Creator Ed One deletes G1 -> 200 and it leaves the list",
    r.status === 200 && !listed.data.games.some((g) => g.id === G1));
  r = await api("POST", `/api/admin/games/${G1}/restore`, { cookie: admin.cookie, body: {} });
  const listed2 = await api("GET", "/api/games?full=1", { cookie: reader.cookie });
  check("Admin restores G1 and it is back", r.status === 200 && listed2.data.games.some((g) => g.id === G1));

  // Reads (before the role change, which doesn't affect them)
  r = await api("GET", "/api/players", { cookie: reader.cookie });
  check("GET /api/players never includes role or email",
    r.status === 200 && r.data.players.length > 0 && r.data.players.every((p) => !("role" in p) && !("email" in p)));
  const all = listed2.data.games;
  check("GET /api/games?full=1 returns every live game with seats",
    all.length === 4 && all.every((g) => g.seats.length >= 3 && g.seats[0].player_name), `${all.length} games`);
  const seen = [];
  let before = "";
  for (let guard = 0; guard < 20; guard++) {
    const page = await api("GET", `/api/games?limit=2${before}`, { cookie: reader.cookie });
    seen.push(...page.data.games.map((g) => g.id));
    if (page.data.next === null) break;
    before = `&before=${page.data.next}`;
  }
  check("Pagination with limit=2 walks every game exactly once",
    seen.length === all.length && new Set(seen).size === seen.length && all.every((g) => seen.includes(g.id)),
    JSON.stringify(seen));

  // Security
  for (const link of ["https://evil.example/game/abc", "http://ti-assistant.com/en/game/abc",
    "https://ti-assistant.com.evil.example/x", "https://user@ti-assistant.com/x", "javascript:alert(1)"]) {
    r = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody([e1.id, e2.id, g1p3.data.id], { ti_assistant_url: link }) });
    check(`TI Assistant link ${link} -> 400`, r.status === 400, r.status);
  }
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody([e1.id, e2.id, g1p3.data.id], { ti_assistant_url: "https://ti-assistant.com/en/game/AbC123" }) });
  check("A real ti-assistant.com link is accepted (201)", r.status === 201, r.status);
  const evilName = "Robert'); DROP TABLE games;--";
  const evilNotes = "' OR 1=1 --";
  r = await api("POST", "/api/players", { cookie: e1.cookie, body: { name: evilName } });
  const evilId = r.data?.id;
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody([e1.id, e2.id, evilId], { notes: evilNotes }) });
  const evilGame = await api("GET", `/api/games/${r.data?.id}`, { cookie: reader.cookie });
  const plist = await api("GET", "/api/players", { cookie: reader.cookie });
  const glist = await api("GET", "/api/games", { cookie: reader.cookie });
  check("SQL-looking name and notes come back byte for byte, and GET /api/games still works",
    plist.data.players.some((p) => p.name === evilName) && evilGame.data?.game?.notes === evilNotes &&
    evilGame.data.game.seats.some((s) => s.player_name === evilName) && glist.status === 200 && glist.data.games.length > 0);

  r = await api("POST", "/api/games", { cookie: e3.cookie, body: { ...gameBody([e3.id, e2.id, g1p3.data.id]), created_by: e1.id, updated_by: e1.id } });
  const spoof = await api("GET", `/api/games/${r.data?.id}`, { cookie: reader.cookie });
  check("A created_by in the body is ignored (stored as Ed Three)",
    r.status === 201 && spoof.data.game.created_by.id === e3.id && spoof.data.game.updated_by.id === e3.id);

  r = await api("PATCH", `/api/players/${e1.id}`, { cookie: e1.cookie, body: { role: "admin" } });
  const roleNow = await api("GET", "/api/me", { cookie: e1.cookie });
  check("Ed One PATCHing his own role to admin changes nothing",
    roleNow.data.player.role === "editor", `${r.status} role=${roleNow.data.player.role}`);

  r = await api("PATCH", `/api/admin/players/${admin.id}`, { cookie: admin.cookie, body: { role: "none" } });
  check("Admin setting their own role to none -> 400", r.status === 400, r.status);
  r = await api("PATCH", `/api/admin/players/${admin.id}`, { cookie: admin.cookie, body: { archived: true } });
  check("Admin archiving themselves -> 400", r.status === 400, r.status);

  const flip = e1.cookie.slice(0, -1) + (e1.cookie.endsWith("A") ? "B" : "A");
  r = await api("GET", "/api/me", { cookie: flip });
  check("A tampered cookie is treated as signed out", r.data.player === null);

  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await api("POST", "/api/auth/redeem", { body: { code: "ZZZZZ-ZZZZ" + i }, ip: "203.0.113.7" })).status);
  }
  check("11 bad redeems from one client: the first 10 are 400 and the 11th is 429",
    statuses.slice(0, 10).every((s) => s === 400) && statuses[10] === 429, statuses.join(","));
  r = await api("POST", "/api/auth/redeem", { body: { code: "ZZZZZ-ZZZZZ" }, ip: "203.0.113.8" });
  check("A different client is not limited", r.status === 400, r.status);
  const stored = wrangler("d1", "execute", "ti4-table", "--local", "--persist-to", STATE, "--json",
    "--command", "SELECT ip_hash FROM redeem_attempts");
  check("Attempts are stored as hashes, not raw IPs", !stored.stdout.includes("203.0.113"));

  const del = await api("DELETE", `/api/games/${G1}`, { cookie: e1.cookie, body: {} });
  const row2 = wrangler("d1", "execute", "ti4-table", "--local", "--persist-to", STATE, "--json",
    "--command", `SELECT deleted_at, (SELECT COUNT(*) FROM seats WHERE game_id = ${G1}) AS seats FROM games WHERE id = ${G1}`);
  let after = null;
  try { after = JSON.parse(row2.stdout)[0].results[0]; } catch { /* reported below */ }
  check("After DELETE the game row and its seats still exist, with deleted_at set",
    del.status === 200 && !!after?.deleted_at && after.seats === 4, JSON.stringify(after));
  await api("POST", `/api/admin/games/${G1}/restore`, { cookie: admin.cookie, body: {} });

  // Review fixes
  r = await api("PATCH", `/api/players/${e2.id}`, { cookie: e1.cookie, body: { name: "Ed Two Renamed" } });
  check("Ed One renaming Ed Two (an editor) -> 403", r.status === 403, r.status);
  r = await api("PATCH", `/api/players/${g1p3.data.id}`, { cookie: e1.cookie, body: { name: "Guest Renamed" } });
  check("Ed One renaming a guest he created -> 200", r.status === 200, r.status);
  r = await api("PATCH", `/api/players/${e1.id}`, { cookie: e1.cookie, body: { name: "Ed One" } });
  check("Ed One renaming himself -> 200", r.status === 200, r.status);
  r = await api("PATCH", `/api/players/${e2.id}`, { cookie: admin.cookie, body: { name: "Ed Two" } });
  check("Admin renaming Ed Two -> 200", r.status === 200, r.status);

  const adminB = await signIn("Admin B", "admin");
  r = await api("POST", "/api/admin/invites", { cookie: admin.cookie, body: { player_id: adminB.id, role: "editor" } });
  const lower = await api("POST", "/api/auth/redeem", { body: { code: r.data?.code } });
  const bNow = await api("GET", "/api/me", { cookie: adminB.cookie });
  check("Redeeming an editor invite does not lower an admin", lower.status === 200 && bNow.data.player?.role === "admin", bNow.data.player?.role);
  const arch = await api("POST", "/api/players", { cookie: e1.cookie, body: { name: "Archived Guest" } });
  await api("PATCH", `/api/admin/players/${arch.data.id}`, { cookie: admin.cookie, body: { archived: true } });
  r = await api("POST", "/api/admin/invites", { cookie: admin.cookie, body: { player_id: arch.data.id, role: "editor" } });
  check("An invite for an archived player -> 400", r.status === 400, r.status);

  // Undo
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody([e1.id, e2.id, g1p3.data.id], { notes: "pristine", points_to_win: 10 }) });
  const G9 = r.data.id;
  const pristine = (await api("GET", `/api/games/${G9}`, { cookie: reader.cookie })).data.game;
  const vandal = gameBody([e1.id, e2.id, g1p3.data.id], { notes: "vandalized", points_to_win: 20, pok: false, te: true });
  vandal.seats.forEach((s, i) => { s.points = 30 - i; s.faction = FACTION_LIST[5 - i]; });
  r = await api("PUT", `/api/games/${G9}`, { cookie: e2.cookie, body: vandal });
  check("Ed Two overwrites G9", r.status === 200, r.status);
  const revList = await api("GET", `/api/admin/games/${G9}/revisions`, { cookie: admin.cookie });
  const target = revList.data?.revisions?.[0];
  check("Admin lists revisions, newest first, with parsed data",
    revList.status === 200 && target?.data?.game?.notes === "pristine" && target.edited_by.name === "Ed Two", JSON.stringify(revList.data).slice(0, 200));
  r = await api("GET", `/api/admin/games/${G9}/revisions`, { cookie: e1.cookie });
  const r2 = await api("POST", `/api/admin/games/${G9}/revert`, { cookie: e1.cookie, body: { revision_id: target?.id } });
  check("An editor calling revisions or revert -> 403", r.status === 403 && r2.status === 403, `${r.status} ${r2.status}`);
  r = await api("POST", `/api/admin/games/${G1}/revert`, { cookie: admin.cookie, body: { revision_id: target?.id } });
  check("Reverting to a revision of another game -> 404", r.status === 404, r.status);
  r = await api("POST", `/api/admin/games/${G9}/revert`, { cookie: admin.cookie, body: { revision_id: target?.id } });
  const restored = (await api("GET", `/api/games/${G9}`, { cookie: reader.cookie })).data.game;
  const same = (g) => JSON.stringify({ ...g, updated_by: 0, updated_at: 0, can_edit: 0, can_delete: 0 });
  check("Admin reverts G9 and it matches the pre-vandalism game exactly", r.status === 200 && same(restored) === same(pristine));
  const afterRev = await api("GET", `/api/admin/games/${G9}/revisions`, { cookie: admin.cookie });
  check("The revert saved the vandalized state as a new revision", afterRev.data.revisions[0]?.data?.game?.notes === "vandalized");

  // Create limit: 30 per player per hour
  const spam = await signIn("Spammer", "editor");
  const rows = Array.from({ length: 30 }, (_, i) => `('spam-${i}-${Date.now()}', '${today}', ${spam.id}, ${spam.id})`).join(",");
  const ins = wrangler("d1", "execute", "ti4-table", "--local", "--persist-to", STATE, "--command",
    `INSERT INTO games (client_id, played_on, created_by, updated_by) VALUES ${rows}`);
  r = await api("POST", "/api/games", { cookie: spam.cookie, body: gameBody([spam.id, e2.id, e1.id]) });
  check("A player with 30 games in the last hour gets 429 on the next create", ins.status === 0 && r.status === 429, `${ins.status} ${r.status}`);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody([e1.id, e2.id, adminB.id]) });
  check("Another player is unaffected by that limit", r.status === 201, r.status);

  // Planned games
  const pIds = [e1.id, e2.id, g1p3.data.id];
  const planBody = (over = {}) => {
    const b = gameBody(pIds, { status: "planned", played_on: daysFromNow(14), ...over });
    b.seats.forEach((st) => { st.faction = null; st.points = 0; st.is_winner = false; st.is_speaker_start = false; });
    return b;
  };
  const planned = planBody();
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: planned });
  const P1 = r.data?.id;
  check("Planned create with null factions and a future date -> 201", r.status === 201 && Number.isInteger(P1), `${r.status} ${JSON.stringify(r.data)}`);
  const pg = (await api("GET", `/api/games/${P1}`, { cookie: e1.cookie })).data?.game;
  check("The planned game reads back as planned with null factions",
    pg?.status === "planned" && pg.seats.every((st) => st.faction === null && st.points === 0 && !st.is_winner));
  const dupF = planBody();
  dupF.seats[0].faction = dupF.seats[1].faction = "F_sol";
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: dupF });
  check("Planned with a duplicate faction -> 400", r.status === 400, r.status);
  const dupP = planBody();
  dupP.seats[1].player_id = dupP.seats[0].player_id;
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: dupP });
  check("Planned with a duplicate player -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: planBody({ status: "bogus" }) });
  check("status in the body that is neither planned nor finished -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody(pIds, { played_on: daysFromNow(14) }) });
  check("A finished game dated in the future is still refused", r.status === 400, r.status);

  const fin = (over, mutate) => {
    const b = gameBody(pIds, { played_on: today, ...over });
    mutate?.(b);
    return b;
  };
  r = await api("PUT", `/api/games/${P1}`, { cookie: e1.cookie, body: fin({}, (b) => { b.seats[1].faction = null; }) });
  check("Finishing with a missing faction -> 400", r.status === 400, r.status);
  r = await api("PUT", `/api/games/${P1}`, { cookie: e3.cookie, body: planBody() });
  check("An unseated editor who didn't create the planned game can't edit it (403)", r.status === 403, r.status);
  const planFull = await api("GET", "/api/games?full=1", { cookie: reader.cookie });
  check("full=1 excludes planned games", !planFull.data.games.some((g) => g.id === P1));
  const planList = await api("GET", "/api/games?status=planned", { cookie: reader.cookie });
  check("status=planned lists only planned games, with map and link fields",
    planList.status === 200 && planList.data.games.length > 0 &&
    planList.data.games.every((g) => g.status === "planned" && "map_string" in g && "ti_assistant_url" in g) &&
    planList.data.games.some((g) => g.id === P1));
  const finList = await api("GET", "/api/games?status=finished&limit=100", { cookie: reader.cookie });
  const defList = await api("GET", "/api/games?limit=100", { cookie: reader.cookie });
  check("status=finished and the default list hold no planned games",
    [finList, defList].every((l) => l.status === 200 && !l.data.games.some((g) => g.status === "planned")));
  r = await api("GET", "/api/games?status=bogus", { cookie: reader.cookie });
  check("status=bogus -> 400", r.status === 400, r.status);
  r = await api("PUT", `/api/games/${P1}`, { cookie: e2.cookie, body: fin({ notes: "results in" }) });
  check("A seated editor finishes the planned game -> 200", r.status === 200, r.status);
  const finFull = await api("GET", "/api/games?full=1", { cookie: reader.cookie });
  check("The finished game now appears in full=1 and not in status=planned",
    finFull.data.games.some((g) => g.id === P1 && g.status === "finished") &&
    !(await api("GET", "/api/games?status=planned", { cookie: reader.cookie })).data.games.some((g) => g.id === P1));
  r = await api("PUT", `/api/games/${P1}`, { cookie: e1.cookie, body: planBody() });
  check("Finished -> planned -> 400", r.status === 400, r.status);
  const prevs = await api("GET", `/api/admin/games/${P1}/revisions`, { cookie: admin.cookie });
  const planRev = prevs.data?.revisions?.[0];
  check("The revision taken at finishing records status planned", planRev?.data?.game?.status === "planned");
  r = await api("POST", `/api/admin/games/${P1}/revert`, { cookie: admin.cookie, body: { revision_id: planRev?.id } });
  const back = (await api("GET", `/api/games/${P1}`, { cookie: reader.cookie })).data?.game;
  check("Admin revert of the pre-finish revision restores planned",
    r.status === 200 && back?.status === "planned" && back.seats.every((st) => st.faction === null));

  // Games logged from memory
  const mem = (over, mutate) => {
    const b = gameBody(pIds, { from_memory: true, played_on: "2024-07-01", date_precision: "month", ...over });
    mutate?.(b);
    return b;
  };
  const noPoints = (b) => b.seats.forEach((st) => { st.points = null; });
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({}, (b) => { noPoints(b); b.seats[1].faction = null; }) });
  const M1 = r.data?.id;
  check("From memory with null points and a null faction -> 201", r.status === 201 && Number.isInteger(M1), `${r.status} ${JSON.stringify(r.data)}`);
  const mg = (await api("GET", `/api/games/${M1}`, { cookie: e1.cookie })).data?.game;
  check("The from-memory game reads back with from_memory, month precision and null points",
    mg?.from_memory === true && mg.date_precision === "month" && mg.played_on === "2024-07-01" &&
    mg.seats.every((st) => st.points === null) && mg.seats.filter((st) => st.is_winner).length === 1 && mg.seats.some((st) => st.faction === null));
  const live = gameBody(pIds);
  noPoints(live);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: live });
  check("A live game with null points -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({ status: "planned", played_on: daysFromNow(14), date_precision: "day" }) });
  check("From memory + planned -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({ played_on: "2024-07-15" }) });
  check("Month precision with played_on 2024-07-15 -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({ played_on: "2024-01-01", date_precision: "year" }) });
  check("Year precision with 2024-01-01 -> 201", r.status === 201, `${r.status} ${JSON.stringify(r.data)}`);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({ played_on: "2024-07-01", date_precision: "year" }) });
  check("Year precision with 2024-07-01 -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody(pIds, { date_precision: "month", played_on: "2024-07-01" }) });
  check("Month precision without from_memory -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({}, (b) => { b.seats.forEach((st) => { st.is_winner = false; }); }) });
  check("From memory with no winner -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({}, (b) => { b.seats[1].is_winner = true; }) });
  check("From memory with two winners -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({ date_precision: "decade" }) });
  check("An unknown date_precision -> 400", r.status === 400, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({}, (b) => { b.seats[1].points = 12; b.seats[0].points = 3; }) });
  check("From memory: a seat above the winner's points is allowed -> 201", r.status === 201, r.status);
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: mem({}, (b) => { b.seats[1].points = 31; }) });
  check("From memory: points above 30 -> 400", r.status === 400, r.status);
  const memFull = await api("GET", "/api/games?full=1", { cookie: reader.cookie });
  check("full=1 includes the from-memory game with its fields", memFull.data.games.some((g) => g.id === M1 && g.from_memory === true && g.date_precision === "month"));
  // Edit it to day precision with scores, then revert to the from-memory snapshot.
  r = await api("PUT", `/api/games/${M1}`, { cookie: e1.cookie, body: gameBody(pIds, { played_on: today }) });
  const edited = (await api("GET", `/api/games/${M1}`, { cookie: e1.cookie })).data?.game;
  check("Editing the game to a live one clears from_memory", r.status === 200 && edited.from_memory === false && edited.date_precision === "day" && edited.seats[0].points === 10);
  const mrevs = await api("GET", `/api/admin/games/${M1}/revisions`, { cookie: admin.cookie });
  const memRev = mrevs.data?.revisions?.[0];
  check("The revision snapshot records from_memory and date_precision", memRev?.data?.game?.from_memory === 1 && memRev.data.game.date_precision === "month");
  r = await api("POST", `/api/admin/games/${M1}/revert`, { cookie: admin.cookie, body: { revision_id: memRev?.id } });
  const reverted = (await api("GET", `/api/games/${M1}`, { cookie: e1.cookie })).data?.game;
  check("A revert restores from_memory, month precision and null points",
    r.status === 200 && reverted.from_memory === true && reverted.date_precision === "month" && reverted.played_on === "2024-07-01" && reverted.seats.every((st) => st.points === null));
  // A snapshot taken before 0003 has neither key; reverting to it must give a live, day-precision game.
  const strip = wrangler("d1", "execute", "ti4-table", "--local", "--persist-to", STATE, "--command",
    `UPDATE game_revisions SET data = json_remove(data, '$.game.from_memory', '$.game.date_precision') WHERE id = ${Number(memRev?.id)}`);
  r = await api("POST", `/api/admin/games/${M1}/revert`, { cookie: admin.cookie, body: { revision_id: memRev?.id } });
  const fromOld = (await api("GET", `/api/games/${M1}`, { cookie: e1.cookie })).data?.game;
  check("A revert to a pre-0003 snapshot restores from_memory false and day precision",
    strip.status === 0 && r.status === 200 && fromOld.from_memory === false && fromOld.date_precision === "day", `${strip.status} ${r.status} ${fromOld?.from_memory} ${fromOld?.date_precision}`);

  await joinChecks({ admin, e1, e2, reader });
  await tiAssistantChecks({ e1, e2, e3, reader });

  // Roles
  r = await api("PATCH", `/api/admin/players/${e3.id}`, { cookie: admin.cookie, body: { role: "none" } });
  check("Admin sets Ed Three's role to none", r.status === 200, r.status);
  r = await api("POST", "/api/games", { cookie: e3.cookie, body: gameBody([e3.id, e2.id, 1]) });
  check("Ed Three's old cookie can no longer create games", r.status === 401 || r.status === 403, r.status);
  r = await api("GET", "/api/me", { cookie: e3.cookie });
  check("Ed Three's old cookie gives /api/me {player:null}", r.data.player === null);
  r = await api("GET", `/api/ti-assistant/${LIVE_ID}`, { cookie: e3.cookie });
  check("TI Assistant lookup with a role-none cookie -> 401", r.status === 401, r.status);
}

// ── TI Assistant endpoint ───
async function tiAssistantChecks({ e1, reader }) {
  const ti = (id, who = e1) => api("GET", `/api/ti-assistant/${id}`, { cookie: who?.cookie });
  const downloads = (id) => seen.filter((p) => p === `/api/${id}/download`).length;

  let r = await ti(LIVE_ID, null);
  check("TI Assistant lookup signed out -> 401", r.status === 401, r.status);
  check("A signed-out lookup never reached the stub", seen.length === 0, seen.join(" "));
  for (const bad of ["..%2Fx", "abcdefghijklm", "ab_cd", "abc", "%E0%A4%A"]) {
    r = await ti(bad);
    check(`TI Assistant lookup with bad id ${bad} -> 400`, r.status === 400, r.status);
  }
  check("Bad ids never reached the stub", seen.length === 0, seen.join(" "));

  r = await ti(LIVE_ID);
  check("A live game returns its setup without scores",
    r.status === 200 && r.data.played_on === "2026-04-11" && r.data.points_to_win === 12 && r.data.seats.length === 4 &&
    r.data.scores_from_archive === false && r.data.seats.every((s) => s.points === null && !s.is_winner), JSON.stringify(r.data));
  check("The response holds only the trimmed fields",
    r.data && !("actionLog" in r.data) && !JSON.stringify(r.data).includes("Make Up Objective") &&
    Object.keys(r.data).sort().join() === "played_on,points_to_win,pok,te,map_string,speaker_index,scores_from_archive,seats".split(",").sort().join());
  check("The stub saw only the fixed download and archive paths",
    seen.every((p) => p === `/api/${LIVE_ID}/download` || p.startsWith("/api/archived-games?timestamp=")), seen.join(" "));

  r = await ti(ARCHIVED_ID);
  const winners = r.data?.seats?.filter((s) => s.is_winner) ?? [];
  check("An archived game returns the official points and one winner",
    r.status === 200 && r.data.scores_from_archive === true && winners.length === 1 && winners[0].faction === "F_jol_nar" &&
    r.data.seats.slice(0, 5).map((s) => s.points).join() === "10,8,8,7,7", JSON.stringify(r.data));
  check("The other games on the archive page are not returned", !JSON.stringify(r.data).includes("OtHer") && !JSON.stringify(r.data).includes("Winnu"));

  const before = downloads(LIVE_ID);
  r = await ti(LIVE_ID, reader);
  check("A repeat lookup is served from the cache (5 minutes)", r.status === 200 && downloads(LIVE_ID) === before, `${before} -> ${downloads(LIVE_ID)}`);

  r = await ti("Gone01");
  check("An unknown game -> 502 with a plain message", r.status === 502 && /fill the form in by hand/.test(r.data?.error), `${r.status} ${r.data?.error}`);
  r = await ti("NotJs1");
  check("A reply that isn't JSON -> 502", r.status === 502, r.status);
  r = await ti("Redir1");
  check("A redirect is not followed -> 502", r.status === 502 && !seen.some((p) => p.includes("example")), r.status);
  r = await ti("BigBig");
  check("A body over 2 MB -> 502", r.status === 502, r.status);
  const t0 = Date.now();
  r = await ti("Hang42");
  check("A host that never answers -> 502 after about 8 seconds", r.status === 502 && Date.now() - t0 < 15000 && Date.now() - t0 >= 7000, `${r.status} ${Date.now() - t0} ms`);

  // The limit is 20 an hour per player. Use a fresh editor so earlier calls don't count.
  const lim = await signIn("Rate Tester", "editor");
  let last = null, ok = 0;
  for (let i = 0; i < 20; i++) {
    last = await ti(LIVE_ID, lim);
    if (last.status === 200) ok++;
  }
  check("20 lookups in an hour succeed", ok === 20, `${ok} ok`);
  r = await ti(LIVE_ID, lim);
  check("The 21st lookup -> 429", r.status === 429, r.status);
  r = await ti(LIVE_ID, reader);
  check("The limit is per player: another editor is not blocked", r.status === 200, r.status);
}

// ── Join links ───
async function joinChecks({ admin, e1, e2, reader }) {
  const sql = (cmd) => wrangler("d1", "execute", "ti4-table", "--local", "--persist-to", STATE, "--json", "--command", cmd);
  const rows = (cmd) => { try { return JSON.parse(sql(cmd).stdout)[0].results; } catch { return []; } };
  // Each failing call uses its own fake client address so the lockout never hits the others.
  let ipN = 0;
  const anon = (method, path, body) => api(method, path, { body, ip: `198.51.100.${++ipN}` });
  const mkGuest = async (name) => (await api("POST", "/api/players", { cookie: e1.cookie, body: { name } })).data.id;

  const gA = await mkGuest("Join Guest A");
  const gB = await mkGuest("Join Guest B");
  const gOnce = await mkGuest("Join Once Redeemed"); // redeemed an invite, then set back to none
  const gGone = await mkGuest("Join Archived");
  const gOther = await mkGuest("Join Elsewhere"); // not in the game
  const gHouse = await signIn("Join Houseguest", "editor"); // already an editor, seated
  const mk = await api("POST", "/api/games", {
    cookie: e1.cookie,
    body: gameBody([gA, gB, gOnce, gGone, e2.id, gHouse.id], { status: "planned" }),
  });
  const GJ = mk.data?.id;
  check("Join: a planned game with guests is created", mk.status === 201 && Number.isInteger(GJ), JSON.stringify(mk.data));
  // Give gOnce a used invite, as if they had signed in before.
  sql(`INSERT INTO invites (code_hash, player_id, role, created_by, expires_at, used_at)
       VALUES ('check-used-${GJ}', ${gOnce}, 'editor', ${admin.id}, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z')`);
  await api("PATCH", `/api/admin/players/${gGone}`, { cookie: admin.cookie, body: { archived: true } });

  // 1. Who may make and stop links
  let r = await api("POST", `/api/games/${GJ}/join-links`, { cookie: e1.cookie, body: {} });
  check("Join: an editor making a link -> 403", r.status === 403, r.status);
  r = await api("DELETE", `/api/games/${GJ}/join-links`, { cookie: e1.cookie, body: {} });
  check("Join: an editor stopping links -> 403", r.status === 403, r.status);
  r = await api("POST", `/api/games/${GJ}/join-links`, { body: {} });
  check("Join: signed out making a link -> 401", r.status === 401, r.status);
  r = await api("DELETE", `/api/games/${GJ}/join-links`, { body: {} });
  check("Join: signed out stopping links -> 401", r.status === 401, r.status);
  r = await api("POST", "/api/games/999999/join-links", { cookie: admin.cookie, body: {} });
  check("Join: a missing game -> 404", r.status === 404, r.status);

  // 2. Make a link and preview it
  r = await api("POST", `/api/games/${GJ}/join-links`, { cookie: admin.cookie, body: {} });
  const code = r.data?.code;
  check("Join: admin makes a link -> 201 with a formatted code",
    r.status === 201 && /^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(code ?? "") && !!r.data.expires_at, JSON.stringify(r.data));
  const stored = rows("SELECT code_hash FROM join_links").map((x) => x.code_hash).join();
  check("Join: only a hash of the code is stored", !!code && !stored.includes(code.replace("-", "")) && /^[0-9a-f]{64}$/.test(stored.split(",")[0]));
  r = await anon("POST", "/api/join/preview", { code });
  const names = (r.data?.seats ?? []).map((s) => s.name).sort().join();
  check("Join: preview lists only the claimable guests",
    r.status === 200 && names === "Join Guest A,Join Guest B", names);
  check("Join: preview returns only date, status and seat name, faction and id",
    Object.keys(r.data).sort().join() === "game,seats" && Object.keys(r.data.game).sort().join() === "date_precision,played_on,status" &&
    r.data.seats.every((s) => Object.keys(s).sort().join() === "faction,name,player_id"), JSON.stringify(r.data));

  // 10. Game page flags
  const asAdmin = (await api("GET", `/api/games/${GJ}`, { cookie: admin.cookie })).data?.game;
  const asEditor = (await api("GET", `/api/games/${GJ}`, { cookie: e1.cookie })).data?.game;
  check("Join: admin sees claimable per seat and join_link",
    asAdmin.seats.filter((s) => s.claimable).length === 2 && !!asAdmin.join_link?.expires_at && !JSON.stringify(asAdmin).includes(code));
  check("Join: an editor sees neither claimable nor join_link", !("join_link" in asEditor) && asEditor.seats.every((s) => !("claimable" in s)));

  // 3. Claim
  r = await anon("POST", "/api/join/claim", { code, player_id: gA });
  const cookie = cookieOf(r);
  check("Join: claim -> 200 with a cookie and game_id", r.status === 200 && !!cookie && r.data.game_id === GJ && r.data.player.role === "editor", JSON.stringify(r.data));
  const who = await api("GET", "/api/me", { cookie });
  check("Join: /api/me with that cookie is the claimed player", who.data?.player?.id === gA && who.data.player.role === "editor");
  const inv = rows(`SELECT used_at FROM invites WHERE player_id = ${gA}`);
  check("Join: the claim leaves a used invites row", inv.length === 1 && !!inv[0].used_at, JSON.stringify(inv));

  // 4. Taken seats
  r = await anon("POST", "/api/join/claim", { code, player_id: gA });
  check("Join: claiming the same player again -> 409", r.status === 409, `${r.status} ${r.data?.error}`);
  r = await anon("POST", "/api/join/preview", { code });
  check("Join: preview no longer lists the claimed player", r.data?.seats?.map((s) => s.name).join() === "Join Guest B", JSON.stringify(r.data));

  // 5/6. Not claimable
  const notOk = [["a returning player set back to none", gOnce], ["an archived player", gGone], ["a player not in the game", gOther],
    ["an editor", e2.id], ["an admin", admin.id], ["a seated editor who signed in", gHouse.id]];
  for (const [label, pid] of notOk) {
    r = await anon("POST", "/api/join/claim", { code, player_id: pid });
    check(`Join: claiming ${label} -> 409`, r.status === 409, `${r.status} ${r.data?.error}`);
  }
  check("Join: none of those were changed",
    rows(`SELECT COUNT(*) AS n FROM players WHERE id IN (${gOnce}, ${gGone}, ${gOther}) AND role = 'none'`)[0]?.n === 3);

  // 8. Already signed in
  r = await api("POST", "/api/join/claim", { cookie: reader.cookie, body: { code, player_id: gB }, ip: "198.51.100.200" });
  check("Join: claiming while signed in -> 409 and nothing changes",
    r.status === 409 && /already signed in/.test(r.data?.error) && rows(`SELECT role FROM players WHERE id = ${gB}`)[0]?.role === "none", `${r.status} ${r.data?.error}`);

  // 7. Expired and stopped links
  r = await api("POST", `/api/games/${GJ}/join-links`, { cookie: admin.cookie, body: {} });
  const old = r.data.code;
  sql(`UPDATE join_links SET expires_at = '2000-01-01T00:00:00Z' WHERE rowid = (SELECT MAX(rowid) FROM join_links)`);
  const badIp = "198.51.100.201";
  r = await api("POST", "/api/join/preview", { body: { code: old }, ip: badIp });
  const generic = (await api("POST", "/api/auth/redeem", { body: { code: "ABCDE-FGHJK" }, ip: "198.51.100.202" })).data?.error;
  check("Join: an expired link -> 400 with the generic message", r.status === 400 && r.data.error === generic, `${r.status} ${r.data?.error}`);
  r = await api("POST", "/api/join/claim", { body: { code: old, player_id: gB }, ip: badIp });
  check("Join: claiming with an expired link -> 400", r.status === 400, r.status);
  r = await api("POST", `/api/games/${GJ}/join-links`, { cookie: admin.cookie, body: {} });
  const live = r.data.code;
  r = await api("DELETE", `/api/games/${GJ}/join-links`, { cookie: admin.cookie, body: {} });
  check("Join: admin stops the links -> 200", r.status === 200 && r.data.ok === true, r.status);
  r = await api("POST", "/api/join/claim", { body: { code: live, player_id: gB }, ip: badIp });
  check("Join: claiming with a stopped link -> 400", r.status === 400, r.status);
  check("Join: stopping removes join_link from the game page",
    (await api("GET", `/api/games/${GJ}`, { cookie: admin.cookie })).data.game.join_link === null);
  const codes = [];
  const lockIp = "198.51.100.203";
  for (let i = 0; i < 10; i++) codes.push((await api("POST", "/api/join/preview", { body: { code: "ZZZZZ-ZZZZ" + i }, ip: lockIp })).status);
  r = await api("POST", "/api/join/preview", { body: { code: "ZZZZZ-ZZZZZ" }, ip: lockIp });
  check("Join: bad codes count toward the lockout (429 after 10)", codes.every((s) => s === 400) && r.status === 429, `${codes} ${r.status}`);

  // 9. Deleted game
  const mk2 = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody([e1.id, await mkGuest("Join Guest C")], { status: "planned" }) });
  r = await api("POST", `/api/games/${mk2.data.id}/join-links`, { cookie: admin.cookie, body: {} });
  const delCode = r.data.code;
  await api("DELETE", `/api/games/${mk2.data.id}`, { cookie: e1.cookie, body: {} });
  r = await anon("POST", "/api/join/preview", { code: delCode });
  const r2 = await anon("POST", "/api/join/claim", { code: delCode, player_id: mk2.data.id });
  check("Join: a deleted game's link -> 400 on preview and claim", r.status === 400 && r2.status === 400, `${r.status} ${r2.status}`);

  // No guests at all
  r = await api("POST", `/api/games/${mk2.data.id}/join-links`, { cookie: admin.cookie, body: {} });
  check("Join: a deleted game can't get a link -> 404", r.status === 404, r.status);
  const noGuest = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody([e1.id, e2.id, reader.id], { status: "planned" }) });
  r = await api("POST", `/api/games/${noGuest.data.id}/join-links`, { cookie: admin.cookie, body: {} });
  check("Join: a game with no guest -> 400 'Nobody in this game is a guest.'", r.status === 400 && r.data.error === "Nobody in this game is a guest.", `${r.status} ${r.data?.error}`);

  // 11. Odd input
  r = await api("POST", `/api/games/${GJ}/join-links`, { cookie: admin.cookie, body: {} });
  const fresh = r.data.code;
  const odd = ["' OR 1=1 --", { a: 1 }, ["x"], 5, null, "A".repeat(5000)];
  const statuses = [];
  for (const c of odd) statuses.push((await anon("POST", "/api/join/preview", { code: c })).status);
  for (const c of odd) statuses.push((await anon("POST", "/api/join/claim", { code: c, player_id: gB })).status);
  const oddIds = ["1 OR 1=1", "1; DROP TABLE players", { id: 1 }, [gB], 1.5, null, true, "5"];
  for (const pid of oddIds) statuses.push((await anon("POST", "/api/join/claim", { code: fresh, player_id: pid })).status);
  check("Join: odd code and player_id values -> 400, never a server error", statuses.every((s) => s === 400), statuses.join());
  check("Join: those left the guest unclaimed and the table intact",
    rows(`SELECT role FROM players WHERE id = ${gB}`)[0]?.role === "none" && rows("SELECT COUNT(*) AS n FROM players")[0]?.n > 5);
  r = await anon("POST", "/api/join/preview", {});
  check("Join: preview with no body -> 400", r.status === 400, r.status);

  // ── Milty link, admin passkey and TI Assistant password ───
  const mids = [e1.id, e2.id, reader.id];
  const MURL = "https://milty.shenanigans.be/d/abc123";
  const TURL = "https://ti-assistant.com/en/game/AbC123";
  const mbad = async (name, over) => {
    const res = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody(mids, over) });
    check(`Milty: ${name} -> 400`, res.status === 400, `${res.status} ${JSON.stringify(res.data)}`);
  };
  await mbad("a non-Milty host", { milty_url: "https://example.com/d/abc" });
  await mbad("an http: link", { milty_url: "http://milty.shenanigans.be/d/abc" });
  await mbad("a link with credentials", { milty_url: "https://u:p@milty.shenanigans.be/d/abc" });
  await mbad("a passkey with non-hex characters", { milty_admin_pass: "zzzzzzzzzzzzzzzz" });
  await mbad("a passkey that is too short", { milty_admin_pass: "abc" });
  await mbad("a 101-character TI Assistant password", { ti_assistant_password: "x".repeat(101) });
  await mbad("a TI Assistant password with a control character", { ti_assistant_password: "ab\ncd" });
  r = await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody(mids, { ti_assistant_url: TURL, milty_url: MURL, milty_admin_pass: "3f9a1c0b7d2e4a6f", ti_assistant_password: "  open sesame  " }) });
  const GM = r.data?.id;
  check("Milty: create with link, passkey and password -> 201", r.status === 201 && Number.isInteger(GM), JSON.stringify(r.data));
  let gm = (await api("GET", `/api/games/${GM}`, { cookie: e1.cookie })).data.game;
  check("Milty: creator sees link, passkey and (trimmed) password", gm.milty_url === MURL && gm.milty_admin_pass === "3f9a1c0b7d2e4a6f" && gm.ti_assistant_password === "open sesame", JSON.stringify(gm));
  gm = (await api("GET", `/api/games/${GM}`, { cookie: e2.cookie })).data.game;
  check("Milty: a seated editor who isn't the creator gets no passkey key, but sees link and password",
    !("milty_admin_pass" in gm) && gm.milty_url === MURL && gm.ti_assistant_password === "open sesame", JSON.stringify(gm));
  gm = (await api("GET", `/api/games/${GM}`, { cookie: admin.cookie })).data.game;
  check("Milty: an admin sees the passkey", gm.milty_admin_pass === "3f9a1c0b7d2e4a6f");
  const mlist = await api("GET", "/api/games?full=1", { cookie: admin.cookie });
  const mrow = mlist.data.games.find((g) => g.id === GM);
  check("Milty: the list has the link but never the passkey or password", mrow?.milty_url === MURL && !("milty_admin_pass" in mrow) && !("ti_assistant_password" in mrow), JSON.stringify(mrow));
  const mput = (who, over) => api("PUT", `/api/games/${GM}`, { cookie: who.cookie, body: gameBody(mids, { ti_assistant_url: TURL, milty_url: MURL, ti_assistant_password: "open sesame", ...over }) });
  r = await mput(e2, { milty_admin_pass: "deadbeefdeadbeef" });
  gm = (await api("GET", `/api/games/${GM}`, { cookie: e1.cookie })).data.game;
  check("Milty: a seated non-creator PUT with a passkey leaves the stored one unchanged", r.status === 200 && gm.milty_admin_pass === "3f9a1c0b7d2e4a6f", `${r.status} ${gm.milty_admin_pass}`);
  r = await mput(e2, { milty_admin_pass: null });
  gm = (await api("GET", `/api/games/${GM}`, { cookie: e1.cookie })).data.game;
  check("Milty: a seated non-creator PUT with null leaves the stored one unchanged", r.status === 200 && gm.milty_admin_pass === "3f9a1c0b7d2e4a6f", `${r.status} ${gm.milty_admin_pass}`);
  const mrevs = (await api("GET", `/api/admin/games/${GM}/revisions`, { cookie: admin.cookie })).data.revisions;
  check("Milty: revision JSON has the link and password but no passkey",
    mrevs.length >= 2 && mrevs.every((v) => !("milty_admin_pass" in v.data.game) && v.data.game.milty_url === MURL && v.data.game.ti_assistant_password === "open sesame"), JSON.stringify(mrevs[0]?.data?.game));
  r = await mput(e1, { milty_admin_pass: "aaaaaaaaaaaaaaaa", ti_assistant_password: null });
  gm = (await api("GET", `/api/games/${GM}`, { cookie: e1.cookie })).data.game;
  check("Milty: the creator can change the passkey and clear the password", r.status === 200 && gm.milty_admin_pass === "aaaaaaaaaaaaaaaa" && gm.milty_url === MURL && gm.ti_assistant_password === null, JSON.stringify(gm));
  const oldest = mrevs[mrevs.length - 1];
  r = await api("POST", `/api/admin/games/${GM}/revert`, { cookie: admin.cookie, body: { revision_id: oldest.id } });
  gm = (await api("GET", `/api/games/${GM}`, { cookie: e1.cookie })).data.game;
  check("Milty: revert restores link and password but leaves the current passkey alone",
    r.status === 200 && gm.milty_url === MURL && gm.ti_assistant_password === "open sesame" && gm.milty_admin_pass === "aaaaaaaaaaaaaaaa", JSON.stringify(gm));
  r = await mput(e1, { milty_admin_pass: null });
  gm = (await api("GET", `/api/games/${GM}`, { cookie: e1.cookie })).data.game;
  check("Milty: the creator PUTs null and the passkey is cleared", r.status === 200 && gm.milty_admin_pass === null, JSON.stringify(gm));
  // Every field is optional; a password or passkey needs its link.
  const solo = [{ ti_assistant_url: TURL }, { milty_url: MURL }];
  const soloRes = [];
  for (const over of solo) soloRes.push((await api("POST", "/api/games", { cookie: e1.cookie, body: gameBody(mids, over) })).status);
  check("Milty: a TI Assistant link with no password and a Milty link with no passkey both save", soloRes.every((x) => x === 201), soloRes.join());
  await mbad("a TI Assistant password with no link", { ti_assistant_password: "pw only" });
  await mbad("a Milty passkey with no link", { milty_admin_pass: "0123456789abcdef" });
  r = await mput(e1, { milty_admin_pass: "bbbbbbbbbbbbbbbb" });
  check("Milty: the creator sets a passkey again", r.status === 200, String(r.status));
  r = await mput(e2, { milty_url: null });
  gm = (await api("GET", `/api/games/${GM}`, { cookie: e1.cookie })).data.game;
  check("Milty: a non-creator clearing the Milty link also clears the stored passkey", r.status === 200 && gm.milty_url === null && gm.milty_admin_pass === null, `${r.status} ${JSON.stringify(gm)}`);
  // A snapshot from before migration 0006 has no milty keys at all.
  sql(`UPDATE game_revisions SET data = json_remove(json_remove(data, '$.game.milty_url'), '$.game.ti_assistant_password') WHERE id = ${oldest.id}`);
  r = await api("POST", `/api/admin/games/${GM}/revert`, { cookie: admin.cookie, body: { revision_id: oldest.id } });
  gm = (await api("GET", `/api/games/${GM}`, { cookie: e1.cookie })).data.game;
  check("Milty: reverting to a snapshot from before 0006 gives null link and password", r.status === 200 && gm.milty_url === null && gm.ti_assistant_password === null, JSON.stringify(gm));

}

try {
  await run();
} catch (err) {
  failures++;
  console.log(`FAIL  ${err.message}`);
} finally {
  server?.stop();
  stub?.closeAllConnections?.();
  stub?.close();
}
console.log(failures ? `${failures} check(s) failed` : "All checks passed");
process.exit(failures ? 1 : 0);
