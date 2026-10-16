// The Games section: list, one game, sign-in, account and stats. The log form
// and the admin pages live in form.js and admin.js. The URL is the state.
//
// Every string that came from the API or a user goes through esc() or
// textContent. Hiding Edit/Delete is a convenience; the server decides.

import { $, $$, esc, plural, toast } from "../lib.js";
import { navigate } from "../router.js";
import { hydrateSymbols } from "../factions.js";
import { get, post, del, currentPlayer, ApiError } from "./api.js";
import { factionName } from "./names.js";
import { loadMapModel, drawMapWithLabels } from "../map/load.js";
import * as S from "./stats.js";
import { dayShort, yearOf, dayLong, expansionsText, safeHttps, mapHref, errorBlock, tabs, shareButton, sym } from "./ui.js";
import { renderForm } from "./form.js";
import { renderAdmin, renderHistory } from "./admin.js";

// ── Dispatch ───────────────────────────────────────────────────────────────

// Routes under /games/<id>; the id is the first capture group.
const GAME_ROUTES = [
  [/^\/(\d{1,12})$/, (env, id) => renderGame(env, id)],
  [/^\/(\d{1,12})\/edit$/, (env, id) => renderForm(env, id)],
  [/^\/(\d{1,12})\/history$/, (env, id) => renderHistory(env, id)],
];

export async function renderGames(url, main, ctx) {
  document.title = "Games · TI4 Table";
  const path = url.pathname.replace(/\/+$/, "");
  const rest = path.slice("/games".length);
  let me = null;
  try {
    me = await currentPlayer();
  } catch (err) {
    if (ctx.stale()) return;
    main.replaceChildren(wrap(errorBlock(err, () => renderGames(new URL(location.href), main, ctx))));
    return;
  }
  if (ctx.stale()) return;

  const env = { url, main, ctx, me };
  if (rest === "") return renderList(env);
  if (rest === "/new") return renderForm(env, null);
  if (rest === "/join") return renderJoin(env);
  if (rest === "/stats") return renderStats(env);
  if (rest === "/me") return renderMe(env);
  if (rest === "/admin") return renderAdmin(env);
  for (const [re, render] of GAME_ROUTES) {
    const m = re.exec(rest);
    if (m) return render(env, Number(m[1]));
  }
  main.innerHTML = `<div class="notfound"><h1>No such games page</h1><p><a href="/games">Go to the games</a></p></div>`;
}

const wrap = (...nodes) => {
  const d = document.createElement("div");
  d.className = "games-page";
  d.append(...nodes);
  return d;
};

// Catches a failed load for one page and shows the offline/error block.
export function guard(env, fn) {
  return fn().catch((err) => {
    if (env.ctx.stale()) return;
    if (!(err instanceof ApiError)) console.error(err);
    env.main.replaceChildren(wrap(errorBlock(err, () => guard(env, fn))));
  });
}

// ── List ───────────────────────────────────────────────────────────────────

const scoreLine = (g) => g.seats.map((s) => s.points).sort((a, b) => b - a).join("–");

// The TI Assistant link sits beside the row link, not inside it (a link can't hold a link).
function tiLink(g) {
  if (!safeHttps(g.ti_assistant_url)) return "";
  return `<a class="ti-link" href="${esc(g.ti_assistant_url)}" target="_blank" rel="noopener noreferrer">TI Assistant</a>`;
}

function rowHtml(g) {
  const w = g.seats.find((s) => s.is_winner);
  const yr = yearOf(g.played_on) !== new Date().getFullYear() ? `<span class="yr">${yearOf(g.played_on)}</span>` : "";
  return `<li class="drow"><a class="grow" href="/games/${g.id}">
    <span class="gdate">${esc(dayShort(g.played_on))}${yr}</span>
    <span class="gmain">
      <span class="gwho">${w ? `${sym(w.faction, "win")}${esc(w.player_name)} won as ${esc(factionName(w.faction))}, ${esc(scoreLine(g))}` : "No winner recorded"}</span>
      <span class="gmeta">${esc(plural(g.seats.length, "player"))}, ${esc(g.points_to_win)} points, ${esc(expansionsText(g))}</span>
    </span></a>${tiLink(g)}</li>`;
}

function plannedRowHtml(g) {
  const yr = yearOf(g.played_on) !== new Date().getFullYear() ? `<span class="yr">${yearOf(g.played_on)}</span>` : "";
  const map = g.map_string ? `<span class="gmeta">Map chosen, ${esc(plural(g.seats.length, "seat"))}</span>` : "";
  return `<li class="drow"><a class="grow" href="/games/${g.id}">
    <span class="gdate">${esc(dayShort(g.played_on))}${yr}</span>
    <span class="gmain">
      <span class="gwho">${esc(plural(g.seats.length, "player"))} · planned</span>${map}
    </span></a>${tiLink(g)}</li>`;
}

function renderList(env) {
  const { main, ctx, me } = env;
  const canLog = me && (me.role === "editor" || me.role === "admin");
  main.replaceChildren(wrap());
  const page = $(".games-page", main);
  page.innerHTML = `${tabs("list", me)}
    <div class="g-head"><h1>Games</h1>
      ${canLog ? `<a class="btn btn-primary" href="/games/new">Log a game</a>` : `<a class="btn btn-primary" href="/games/join">Sign in</a>`}
    </div>
    <div id="upcoming" hidden><h2>Upcoming</h2><ul class="glist" id="uplist"></ul><h2>Played</h2></div>
    <ul class="glist" id="glist"></ul>
    <p class="g-more"></p>`;
  const list = $("#glist", page);
  const more = $(".g-more", page);

  const loadPlanned = () =>
    guard(env, async () => {
      const { games } = await get("/api/games?status=planned");
      if (ctx.stale() || !games.length) return;
      $("#uplist", page).innerHTML = games.map(plannedRowHtml).join("");
      $("#upcoming", page).hidden = false;
    });

  const load = (before) =>
    guard(env, async () => {
      const q = new URLSearchParams({ limit: "30", status: "finished" });
      if (before) q.set("before", before);
      const data = await get(`/api/games?${q}`);
      if (ctx.stale()) return;
      if (!before && !data.games.length) {
        list.insertAdjacentHTML("afterend", `<p class="g-empty">No games yet. ${canLog ? "Log the first one after your next game night." : "Sign in to log the first one after your next game night."}</p>`);
      }
      list.insertAdjacentHTML("beforeend", data.games.map(rowHtml).join(""));
      void hydrateSymbols(list);
      more.replaceChildren();
      if (data.next != null) {
        const b = Object.assign(document.createElement("button"), { type: "button", className: "btn", textContent: "Show older games" });
        b.addEventListener("click", () => { b.disabled = true; load(data.next); });
        more.append(b);
      }
      if (!before) scrollTo(0, ctx.restoring ? (ctx.scroll ?? 0) : 0);
    });
  return Promise.all([loadPlanned(), load(null)]);
}

// ── One game ───────────────────────────────────────────────────────────────

function finishedSeatHtml(s) {
  return `<li class="gseat${s.is_winner ? " is-winner" : ""}">
    <span class="gscore" aria-label="${esc(s.points)} points">${esc(s.points)}</span>
    <span class="gseat-body">
      <span class="gfaction">${sym(s.faction)}${esc(factionName(s.faction))}</span>
      <span class="gplayer">${esc(seatDetail(s))}</span>
    </span></li>`;
}

// A planned seat shows its seat number where a played one shows points.
function plannedSeatHtml(s, i) {
  const n = (s.seat_index ?? i) + 1;
  return `<li class="gseat planned">
    <span class="gscore" aria-label="Seat ${n}">${n}</span>
    <span class="gseat-body">
      <span class="gfaction${s.faction ? "" : " unpicked"}">${sym(s.faction)}${esc(factionName(s.faction))}</span>
      <span class="gplayer">${esc(seatDetail(s, false))}</span>
    </span></li>`;
}

function seatsHtml(g) {
  if (g.status === "planned") return g.seats.map(plannedSeatHtml).join("");
  // Finishing order: winner first, then by points (the API returns seat order).
  return [...g.seats].sort((a, b) => b.is_winner - a.is_winner || b.points - a.points).map(finishedSeatHtml).join("");
}

function gameHeadHtml(g) {
  const count = esc(plural(g.seats.length, "player"));
  if (g.status === "planned") {
    return `<h1 class="gtitle">Planned for ${esc(dayLong(g.played_on))}</h1>
      <p class="gsub">${count}, played to ${esc(g.points_to_win)} points, ${esc(expansionsText(g))}. This game hasn't been played yet. Stats will count it once results are in.</p>`;
  }
  const winner = g.seats.find((s) => s.is_winner);
  return `<h1 class="gtitle">${esc(dayLong(g.played_on))}</h1>
    <p class="gsub">${winner ? `${esc(winner.player_name)} won as ${esc(factionName(winner.faction))}. ` : ""}${count}, played to ${esc(g.points_to_win)} points, ${esc(expansionsText(g))}.</p>`;
}

// Draws the game's map under the seats, once the page is up. If the map string
// doesn't parse, or the tile data won't load, the page just goes without it.
async function drawGameMap(g, box, ctx) {
  try {
    const model = await loadMapModel(g.map_string);
    if (!model || ctx.stale()) return;
    const labels = {};
    for (const s of g.seats) if (s.seat_index != null) labels[s.seat_index + 1] = { name: s.player_name, faction: s.faction };
    const svg = await drawMapWithLabels(model, labels, `Map for ${plural(model.report.seats.length, "player")}`);
    if (ctx.stale()) return;
    box.innerHTML = svg;
    box.hidden = false;
  } catch {
    // No map is better than a broken page.
  }
}

function renderGame(env, id) {
  const { main, ctx, me } = env;
  return guard(env, async () => {
    const { game: g } = await get(`/api/games/${id}`);
    if (ctx.stale()) return;
    document.title = `${g.status === "planned" ? "Planned game" : "Game"} of ${dayLong(g.played_on)} · TI4 Table`;
    const edited = g.updated_by?.id !== g.created_by?.id || g.updated_at !== g.created_at;
    const links = [];
    if (safeHttps(g.ti_assistant_url))
      links.push(`<a href="${esc(g.ti_assistant_url)}" target="_blank" rel="noopener noreferrer">Open in TI Assistant</a>`);
    if (g.map_string) links.push(`<a href="${esc(mapHref(g.map_string))}">See the map</a>`);

    main.innerHTML = `<div class="games-page g-game">
      ${tabs("", me)}
      ${g.deleted_at ? `<p class="g-deleted" role="status">This game is deleted. Only admins can see it.</p>` : ""}
      ${gameHeadHtml(g)}
      <ol class="gseats">${seatsHtml(g)}</ol>
      ${g.map_string ? `<div class="game-map" hidden></div>` : ""}
      ${g.notes ? `<h2>Notes</h2><p class="gnotes">${esc(g.notes)}</p>` : ""}
      ${links.length ? `<p class="glinks">${links.join(" ")}</p>` : ""}
      <p class="gfoot muted">${g.status === "planned" ? "Planned" : "Logged"} by ${esc(g.created_by?.name ?? "someone")}${edited && g.updated_by?.name ? `, last edited by ${esc(g.updated_by.name)}` : ""}.</p>
      <div class="gactions"></div>
    </div>`;
    addGameActions($(".gactions", main), g, me);
    void hydrateSymbols(main);
    scrollTo(0, ctx.restoring ? (ctx.scroll ?? 0) : 0);
    if (g.map_string) void drawGameMap(g, $(".game-map", main), ctx);
  });
}

// Edit / History / Restore / Delete, depending on the viewer and the game.
function addGameActions(acts, g, me) {
  const planned = g.status === "planned";
  if (g.can_edit && planned) acts.insertAdjacentHTML("beforeend", `<a class="btn btn-primary" href="/games/${g.id}/edit?finish=1">Enter results</a>`);
  if (g.can_edit) acts.insertAdjacentHTML("beforeend", `<a class="btn${planned ? "" : " btn-primary"}" href="/games/${g.id}/edit">${planned ? "Edit plan" : "Edit game"}</a>`);
  const admin = me?.role === "admin";
  if (admin) acts.insertAdjacentHTML("beforeend", `<a class="btn" href="/games/${g.id}/history">History</a>`);
  if (admin && g.deleted_at) {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "btn", textContent: "Restore game" });
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await post(`/api/admin/games/${g.id}/restore`, {});
        toast("Game restored");
        navigate(`/games/${g.id}`, { replace: true });
      } catch (err) { b.disabled = false; toast(err.message); }
    });
    acts.append(b);
  }
  if (g.can_delete && !g.deleted_at) {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "btn btn-quiet", textContent: "Delete game" });
    b.addEventListener("click", () => confirmDelete(acts, b, g));
    acts.append(b);
  }
}

// "Name, colour, winner, started as speaker, seat 3": whichever parts apply.
function seatDetail(s, withSeat = true) {
  const parts = [s.player_name];
  if (s.color) parts.push(s.color);
  if (s.is_winner) parts.push("winner");
  if (s.is_speaker_start) parts.push("started as speaker");
  if (withSeat && s.seat_index != null) parts.push(`seat ${s.seat_index + 1}`);
  return parts.join(", ");
}

function headToHeadHtml(p, other, h) {
  if (!h.together) return `<p class="muted">${esc(p.name)} and ${esc(other.name)} haven't played together yet.</p>`;
  let level = "";
  if (h.tied) level = `, and ${h.tied} ${h.tied === 1 ? "was" : "were"} level`;
  return `<p>${esc(p.name)} and ${esc(other.name)} sat down together in ${esc(plural(h.together, "game"))}. ${esc(p.name)} finished higher in ${h.aAhead}, ${esc(other.name)} in ${h.bAhead}${level}.</p>`;
}

function unplayedHtml(p, unplayed) {
  if (!unplayed.length) return `<p class="muted">${esc(p.name)} has played every faction.</p>`;
  const items = unplayed.map((f) => `<li>${sym(f)}${esc(factionName(f))}</li>`).join("");
  return `<ul class="unplayed">${items}</ul>`;
}

function confirmDelete(acts, trigger, g) {
  trigger.hidden = true;
  const box = document.createElement("div");
  box.className = "gconfirm";
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-label", "Confirm delete");
  box.innerHTML = `<p>Delete this game? It disappears from the list and the stats. An admin can restore it.</p>
    <p class="error g-err" role="alert" hidden></p>
    <div class="row"><button type="button" class="btn btn-danger">Delete game</button><button type="button" class="btn keep">Keep game</button></div>`;
  acts.append(box);
  const [yes, keep] = $$("button", box);
  keep.focus();
  keep.addEventListener("click", () => { box.remove(); trigger.hidden = false; trigger.focus(); });
  yes.addEventListener("click", async () => {
    yes.disabled = true;
    try {
      await del(`/api/games/${g.id}`);
      toast("Game deleted");
      navigate("/games", { replace: true });
    } catch (err) {
      yes.disabled = false;
      const e = $(".g-err", box);
      e.textContent = err.status === 403 ? "Only the person who logged a game, or an admin, can delete it." : err.message;
      e.hidden = false;
    }
  });
}

// ── Sign in ────────────────────────────────────────────────────────────────

// Crockford-style codes: letters and digits, shown as XXXXX-XXXXX.
const formatCodeInput = (v) => {
  const s = v.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 10);
  return s.length > 5 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
};

function renderJoin(env) {
  const { main, me } = env;
  // Read a pre-filled code from the fragment, then remove it from the URL.
  let pre = "";
  const hm = location.hash.match(/^#code=([0-9A-Za-z-]{1,20})$/);
  if (hm) {
    pre = formatCodeInput(hm[1]);
    history.replaceState(history.state, "", location.pathname + location.search);
  }
  main.innerHTML = `<div class="games-page g-join">
    ${tabs("join", me)}
    <h1>Sign in</h1>
    ${me ? `<p>You're signed in as ${esc(me.name)}. Entering a code signs this device in as whoever the code is for.</p>` : ""}
    <form class="join-form" novalidate>
      <label for="code">Invite code</label>
      <input id="code" class="code-input" inputmode="text" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="11" placeholder="XXXXX-XXXXX" value="${esc(pre)}">
      <p class="help">Ask the admin for a code. It works once.</p>
      <p class="error" id="join-err" role="alert" hidden></p>
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>
  </div>`;
  const input = $("#code", main);
  const err = $("#join-err", main);
  input.addEventListener("input", () => { input.value = formatCodeInput(input.value); });
  $(".join-form", main).addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", main);
    err.hidden = true;
    if (input.value.replace("-", "").length < 10) {
      err.textContent = "A code is 10 letters and numbers, like K3M9X-4TQ7B.";
      err.hidden = false;
      input.focus();
      return;
    }
    btn.disabled = true;
    try {
      const { player } = await post("/api/auth/redeem", { code: input.value });
      toast(`Signed in as ${player.name}`);
      navigate("/games", { replace: true });
    } catch (ex) {
      err.textContent = ex.message; // the server's own plain message, including the 429 one
      err.hidden = false;
      btn.disabled = false;
    }
  });
  if (!pre) input.focus();
}

// ── Account ────────────────────────────────────────────────────────────────

function renderMe(env) {
  const { main, me } = env;
  if (!me) {
    main.innerHTML = `<div class="games-page">${tabs("me", me)}<h1>You're not signed in</h1><p><a href="/games/join">Sign in with an invite code</a></p></div>`;
    return;
  }
  main.innerHTML = `<div class="games-page g-me">
    ${tabs("me", me)}
    <h1>Signed in as ${esc(me.name)}</h1>
    <p class="muted">${me.role === "admin" ? "You're an admin." : "You can log games."}</p>
    <section><h2>Sign in on another device</h2>
      <p>Make a code, then type it in on the other device. It works once and lasts 15 minutes.</p>
      <button class="btn btn-primary" id="dev-code" type="button">Make a device code</button>
      <div id="dev-out" aria-live="polite"></div>
      <p class="error" id="dev-err" role="alert" hidden></p>
    </section>
    <section><h2>Sign out</h2>
      <button class="btn" id="out" type="button">Sign out on this device</button>
    </section>
  </div>`;
  const out = $("#dev-out", main);
  $("#dev-code", main).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    $("#dev-err", main).hidden = true;
    try {
      const { code } = await post("/api/auth/device-code", {});
      out.replaceChildren(codeBlock(code, "Sign in to TI4 Table with this code (works once, 15 minutes)"));
    } catch (ex) {
      const er = $("#dev-err", main);
      er.textContent = ex.message;
      er.hidden = false;
    }
    btn.disabled = false;
  });
  $("#out", main).addEventListener("click", async () => {
    try {
      await post("/api/auth/logout", {});
      toast("Signed out");
      navigate("/games", { replace: true });
    } catch (ex) { toast(ex.message); }
  });
}

// A code shown big, with a Share button. Built with textContent.
export function codeBlock(code, shareText) {
  const box = document.createElement("div");
  box.className = "codeblock";
  const big = document.createElement("p");
  big.className = "bigcode";
  big.textContent = code;
  box.append(big, shareButton(`${shareText}: ${code}`));
  return box;
}

// ── Stats ──────────────────────────────────────────────────────────────────

const pct = (r) => `${Math.round(r * 100)}%`;
const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`;

function renderStats(env) {
  const { main, ctx, me, url } = env;
  return guard(env, async () => {
    const { games } = await get("/api/games?full=1");
    if (ctx.stale()) return;
    document.title = "Game stats · TI4 Table";
    const players = S.winsByPlayer(games);
    const pid = Number(url.searchParams.get("p")) || null;
    const vs = Number(url.searchParams.get("vs")) || null;
    const person = players.find((p) => p.id === pid) ?? null;

    if (!games.length) {
      main.innerHTML = `<div class="games-page">${tabs("stats", me)}<h1>Stats</h1><p class="g-empty">No games yet. Stats appear after the first game is logged.</p></div>`;
      return;
    }

    const facts = S.byFaction(games);
    const seat = S.seatEffects(games);
    main.innerHTML = `<div class="games-page g-stats">
      ${tabs("stats", me)}
      <h1>Stats</h1>
      <p class="gsub">${esc(plural(games.length, "game"))} logged.</p>

      <section><h2>Wins</h2>
        <ol class="wins">${players
          .map(
            (p) => `<li><span class="bignum">${p.wins}</span>
              <span class="winlabel"><a href="/games/stats?p=${p.id}">${esc(p.name)}</a>
              <span class="muted">${p.wins === 1 ? "win" : "wins"} in ${esc(plural(p.games, "game"))}, ${pct(p.rate)}</span></span></li>`,
          )
          .join("")}</ol>
      </section>

      <section><h2>Win rate by faction</h2>
        <ul class="bars">${facts
          .map(
            (f) => `<li>
              <span class="bar-label">${sym(f.faction)}${esc(factionName(f.faction))}</span>
              <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${Math.round(f.rate * 100)}%"></span></span>
              <span class="bar-val">${pct(f.rate)} <span class="muted">${f.wins} of ${esc(plural(f.games, "game"))}</span></span></li>`,
          )
          .join("")}</ul>
      </section>

      <section><h2>One player</h2>
        <label for="who">Player</label>
        <select id="who"><option value="">Choose a player</option>${players.map((p) => opt(p.id, p.name, p.id === pid)).join("")}</select>
        <div id="who-out"></div>
      </section>

      <section><h2>Seat effects</h2>
        ${seat.enough ? seatTable(seat) : `<p class="muted">Seat effects show up after ${S.SEAT_EFFECTS_MIN} games.</p>`}
      </section>
    </div>`;
    void hydrateSymbols(main);

    const who = $("#who", main);
    const out = $("#who-out", main);
    const draw = (p, vsId) => {
      if (!p) { out.replaceChildren(); return; }
      const avg = S.averagePoints(games, p.id);
      const unplayed = S.unplayedFactions(games, p.id);
      const others = players.filter((o) => o.id !== p.id);
      const h = vsId ? S.headToHead(games, p.id, vsId) : null;
      const other = others.find((o) => o.id === vsId);
      out.innerHTML = `<div class="pstats">
          <div><span class="bignum">${p.wins}</span><span class="muted"> ${p.wins === 1 ? "win" : "wins"} from ${esc(plural(p.games, "game"))}</span></div>
          <div><span class="bignum">${avg == null ? "–" : (Math.round(avg * 10) / 10)}</span><span class="muted"> points on average</span></div>
        </div>
        <h3>Against another player</h3>
        <label for="vs" class="visually-hidden">Compare with</label>
        <select id="vs"><option value="">Choose a player</option>${others.map((o) => opt(o.id, o.name, o.id === vsId)).join("")}</select>
        ${h ? headToHeadHtml(p, other, h) : ""}
        <h3>Factions ${esc(p.name)} hasn't played</h3>
        ${unplayedHtml(p, unplayed)}`;
      void hydrateSymbols(out);
      $("#vs", out).addEventListener("change", (e) => {
        const v = e.target.value;
        const vsPart = v ? `&vs=${v}` : "";
        navigate(`/games/stats?p=${p.id}${vsPart}`, { replace: true });
      });
    };
    draw(person, vs);
    who.addEventListener("change", () => navigate(who.value ? `/games/stats?p=${who.value}` : "/games/stats", { replace: true }));
    if (!ctx.restoring) scrollTo(0, 0);
  });
}

function seatTable(seat) {
  return `<table class="metrics"><thead><tr><th scope="col">Seat</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Average points</th></tr></thead><tbody>${seat.rows
    .map((r) => `<tr><th scope="row">${r.seat}</th><td>${r.games}</td><td>${r.wins} (${pct(r.rate)})</td><td>${Math.round(r.avgPoints * 10) / 10}</td></tr>`)
    .join("")}</tbody></table>`;
}
