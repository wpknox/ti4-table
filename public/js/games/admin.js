// Admin pages: friends and invite codes, deleted games, and game history.
// The server checks the role on every call; this only decides what to show.

import { $, esc, plural, toast } from "../lib.js";
import { navigate } from "../router.js";
import { hydrateSymbols } from "../factions.js";
import { get, post, patch, del } from "./api.js";
import { factionName } from "./names.js";
import { tabs, dayShort, dayLong, errorBlock, sym } from "./ui.js";
import { guard, codeBlock } from "./view.js";

const notAdmin = (main, me) => {
  const why = me ? "This page is for the admin." : `<a href="/games/join">Sign in</a> as the admin to see it.`;
  main.innerHTML = `<div class="games-page">${tabs("", me)}<h1>Admins only</h1><p>${why}</p></div>`;
};

const ROLE_LABEL = { none: "Can't sign in", editor: "Editor", admin: "Admin" };

const ago = (iso) => {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days <= 0) return "today";
  return days === 1 ? "yesterday" : `${days} days ago`;
};

// ── Friends ────────────────────────────────────────────────────────────────

export function renderAdmin(env) {
  const { main, ctx, me } = env;
  if (me?.role !== "admin") return notAdmin(main, me);
  return guard(env, async () => {
    const { players } = await get("/api/admin/players");
    if (ctx.stale()) return;
    document.title = "Admin · TI4 Table";
    main.innerHTML = `<div class="games-page g-admin">
      ${tabs("admin", me)}
      <h1>Friends</h1>
      <p class="error" id="adm-err" role="alert" hidden></p>
      <form class="addfriend" novalidate>
        <label for="newname">Add a friend</label>
        <div class="row"><input id="newname" autocomplete="off" maxlength="40" placeholder="Name"><button class="btn btn-primary" type="submit">Add friend</button></div>
      </form>
      <ul class="friends">${players.map((p) => friendHtml(p, me)).join("")}</ul>
      <h2>Deleted games</h2>
      <div id="deleted"><p class="muted">Looking for deleted games…</p></div>
    </div>`;
    const err = $("#adm-err", main);
    const fail = (e) => { err.textContent = e.message; err.hidden = false; err.scrollIntoView({ block: "nearest" }); };
    const refresh = () => navigate(location.pathname, { replace: true });

    $(".addfriend", main).addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#newname", main).value.trim();
      if (!name) return fail(new Error("Type the friend's name first."));
      try {
        await post("/api/players", { name });
        toast(`Added ${name}`);
        refresh();
      } catch (ex) { fail(ex); }
    });

    $(".games-page", main).addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const li = b.closest("li[data-id]");
      const id = Number(li.dataset.id);
      err.hidden = true;
      try {
        if (b.dataset.act === "invite") {
          const role = $("select.inv-role", li).value;
          const { code } = await post("/api/admin/invites", { player_id: id, role });
          const out = $(".inv-out", li);
          out.replaceChildren(codeBlock(code, `Sign in to TI4 Table with this code (works once, 7 days)`));
          out.insertAdjacentHTML("beforeend", `<p class="muted">Works once and lasts 7 days.</p>`);
        } else if (b.dataset.act === "archive") {
          await patch(`/api/admin/players/${id}`, { archived: b.dataset.to === "1" });
          toast(b.dataset.to === "1" ? "Friend archived" : "Friend restored");
          refresh();
        } else if (b.dataset.act === "signout") {
          await del(`/api/admin/players/${id}/sessions`);
          toast("Signed out everywhere");
          refresh();
        }
      } catch (ex) { fail(ex); }
    });
    $(".games-page", main).addEventListener("change", async (e) => {
      const sel = e.target.closest("select.role");
      if (!sel) return;
      try {
        await patch(`/api/admin/players/${sel.closest("li").dataset.id}`, { role: sel.value });
        toast("Role changed");
        refresh();
      } catch (ex) { fail(ex); refresh(); }
    });

    void loadDeleted(env, $("#deleted", main));
  });
}

const archiveButton = (p) =>
  `<button type="button" class="btn" data-act="archive" data-to="${p.archived ? 0 : 1}">${p.archived ? "Restore friend" : "Archive friend"}</button>`;

function friendHtml(p, me) {
  const mine = p.id === me.id;
  return `<li data-id="${p.id}"${p.archived ? ' class="archived"' : ""}>
    <div class="fhead"><strong>${esc(p.name)}</strong>${mine ? ' <span class="muted">(you)</span>' : ""}${p.archived ? ' <span class="muted">archived</span>' : ""}</div>
    <p class="muted fmeta">${esc(plural(p.sessions, "signed-in device"))}, last seen ${esc(ago(p.last_seen))}</p>
    <div class="frow">
      <label>Role <select class="role"${mine ? " disabled" : ""}>${["none", "editor", "admin"].map((r) => `<option value="${r}"${p.role === r ? " selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select></label>
    </div>
    ${p.archived ? "" : `<div class="frow">
      <label class="visually-hidden" for="inv-${p.id}">Role for the invite code</label>
      <select class="inv-role" id="inv-${p.id}"><option value="editor">Editor</option><option value="admin">Admin</option></select>
      <button type="button" class="btn" data-act="invite">Make invite code</button>
    </div><div class="inv-out" aria-live="polite"></div>`}
    <div class="frow">
      ${mine ? "" : archiveButton(p)}
      <button type="button" class="btn" data-act="signout"${p.sessions ? "" : " disabled"}>Sign out everywhere</button>
    </div>
  </li>`;
}

// There's no "list deleted games" endpoint. Deleted games keep their id, so any
// gap in the live ids is a deleted game (or one that never existed); an admin
// can read each with GET /api/games/:id. Capped, to keep this cheap.
async function loadDeleted(env, box) {
  try {
    const { games } = await get("/api/games?full=1");
    const live = new Set(games.map((g) => g.id));
    const max = Math.max(0, ...live);
    const gaps = [];
    for (let i = 1; i <= max && gaps.length < 60; i++) if (!live.has(i)) gaps.push(i);
    const found = (await Promise.all(gaps.map((id) => get(`/api/games/${id}`).then((r) => r.game).catch(() => null))))
      .filter((g) => g?.deleted_at);
    if (env.ctx.stale()) return;
    box.innerHTML = found.length
      ? `<ul class="glist">${found
          .map((g) => `<li class="drow"><a class="grow" href="/games/${g.id}"><span class="gdate">${esc(dayShort(g.played_on))}</span><span class="gmain"><span class="gwho">${esc(g.seats.find((s) => s.is_winner)?.player_name ?? "No winner")} won as ${esc(factionName(g.seats.find((s) => s.is_winner)?.faction ?? ""))}</span><span class="gmeta">Logged by ${esc(g.created_by?.name ?? "someone")}</span></span></a>
            <button type="button" class="btn" data-restore="${g.id}">Restore</button></li>`)
          .join("")}</ul>`
      : `<p class="muted">No deleted games.</p>`;
    box.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-restore]");
      if (!b) return;
      b.disabled = true;
      try {
        await post(`/api/admin/games/${b.dataset.restore}/restore`, {});
        toast("Game restored");
        b.closest("li").remove();
      } catch (ex) { b.disabled = false; toast(ex.message); }
    });
  } catch (ex) {
    box.replaceChildren(errorBlock(ex));
  }
}

// ── History ────────────────────────────────────────────────────────────────

export function renderHistory(env, id) {
  const { main, ctx, me } = env;
  if (me?.role !== "admin") return notAdmin(main, me);
  return guard(env, async () => {
    const [{ revisions }, { players }, { game }] = await Promise.all([
      get(`/api/admin/games/${id}/revisions`),
      get("/api/players"),
      get(`/api/games/${id}`),
    ]);
    if (ctx.stale()) return;
    document.title = `History of game ${id} · TI4 Table`;
    const name = (pid) => players.find((p) => p.id === pid)?.name ?? `Player ${pid}`;
    const card = (r) => {
      const d = r.data.game;
      const seats = [...r.data.seats].sort((a, b) => b.points - a.points);
      return `<li data-rev="${r.id}">
        <h2>The version before ${esc(r.edited_by.name)}'s change</h2>
        <p class="muted">Changed on ${esc(dayLong(r.edited_at))}${d.deleted_at ? ", when the game was deleted" : ""}.</p>
        <p>${esc(dayLong(d.played_on))}, played to ${esc(d.points_to_win)} points.</p>
        <ul class="revseats">${seats.map((s) => `<li>${sym(s.faction)}${esc(factionName(s.faction))}, ${esc(name(s.player_id))}, <strong>${esc(s.points)}</strong>${s.is_winner ? ", winner" : ""}</li>`).join("")}</ul>
        ${d.notes ? `<p class="gnotes">${esc(d.notes)}</p>` : ""}
        <button type="button" class="btn" data-revert="${r.id}">Revert to this version</button>
      </li>`;
    };
    main.innerHTML = `<div class="games-page g-admin g-history">
      ${tabs("admin", me)}
      <h1>History</h1>
      <p class="muted">Game of ${esc(dayLong(game.played_on))}. <a href="/games/${id}">Back to the game</a></p>
      <p class="error" id="hist-err" role="alert" hidden></p>
      ${revisions.length ? `<ol class="revs">${revisions.map(card).join("")}</ol>` : `<p class="g-empty">This game hasn't been edited.</p>`}
    </div>`;
    void hydrateSymbols(main);
    $(".games-page", main).addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-revert]");
      if (!b) return;
      b.disabled = true;
      try {
        await post(`/api/admin/games/${id}/revert`, { revision_id: Number(b.dataset.revert) });
        toast("Game reverted");
        navigate(`/games/${id}`);
      } catch (ex) {
        b.disabled = false;
        const er = $("#hist-err", main);
        er.textContent = ex.message;
        er.hidden = false;
      }
    });
  });
}
