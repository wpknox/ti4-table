// Acceptance script for the games API (milestone 3, phase 3).
//   npm run check:api
// Uses a private local D1 in .wrangler/check-state, starts `wrangler pages dev`
// on port 8790, runs every check, and always stops the server. Node built-ins only.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const PORT = 8790;
const BASE = `http://localhost:${PORT}`;
const STATE = ".wrangler/check-state";

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

const wrangler = (...args) => spawnSync("npx", ["wrangler", ...args], { encoding: "utf8" });
const cookieOf = (res) => (res.setCookie[0] || "").split(";")[0];

function makeInvite(name, role) {
  const res = spawnSync("node", ["scripts/invite.mjs", "--local", "--persist-to", STATE, name, role], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`invite.mjs failed for ${name}: ${res.stderr}`);
  return res.stdout.trim();
}

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

// ── Server ───
let server;
function stopServer() {
  if (!server || server.killed) return;
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* already gone */ }
}
process.on("exit", stopServer);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopServer(); process.exit(130); });

async function startServer() {
  server = spawn("npx", ["wrangler", "pages", "dev", "--port", String(PORT), "--persist-to", STATE],
    { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/me`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler pages dev did not answer GET /api/me within 60 s.\n${log.slice(-1500)}`);
}

// ── Run ───
async function run() {
  rmSync(STATE, { recursive: true, force: true });
  const mig = wrangler("d1", "migrations", "apply", "ti4-table", "--local", "--persist-to", STATE);
  if (mig.status !== 0) throw new Error(`migrations failed:\n${mig.stdout}${mig.stderr}`);
  await startServer();

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
  const vandal = gameBody([e1.id, e2.id, g1p3.data.id], { notes: "vandalised", points_to_win: 20, pok: false, te: true });
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
  check("The revert saved the vandalised state as a new revision", afterRev.data.revisions[0]?.data?.game?.notes === "vandalised");

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

  // Roles
  r = await api("PATCH", `/api/admin/players/${e3.id}`, { cookie: admin.cookie, body: { role: "none" } });
  check("Admin sets Ed Three's role to none", r.status === 200, r.status);
  r = await api("POST", "/api/games", { cookie: e3.cookie, body: gameBody([e3.id, e2.id, 1]) });
  check("Ed Three's old cookie can no longer create games", r.status === 401 || r.status === 403, r.status);
  r = await api("GET", "/api/me", { cookie: e3.cookie });
  check("Ed Three's old cookie gives /api/me {player:null}", r.data.player === null);
}

try {
  await run();
} catch (err) {
  failures++;
  console.log(`FAIL  ${err.message}`);
} finally {
  stopServer();
}
console.log(failures ? `${failures} check(s) failed` : "All checks passed");
process.exit(failures ? 1 : 0);
