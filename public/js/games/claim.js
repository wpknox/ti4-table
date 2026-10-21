// The join-link page: a friend with no account opens /games/claim#CODE, picks
// which guest seat is theirs, and is signed in as that player.
//
// The code lives in the URL fragment so it never reaches server logs or the
// Referer header. It is cleared from the address bar once the claim works.

import { $, $$, esc, toast } from "../lib.js";
import { navigate } from "../router.js";
import { hydrateSymbols } from "../factions.js";
import { post, ApiError } from "./api.js";
import { factionName } from "./names.js";
import { dayLongP, errorBlock, sym } from "./ui.js";

const page = (html) => `<div class="games-page g-claim">${html}</div>`;
const signInLink = `<a href="/games/join">Sign in with a code</a>`;

function bad(main) {
  main.innerHTML = page(`<h1>This join link doesn't work</h1>
    <p>It may have expired. Ask whoever sent it for a new one.</p>
    <p>${signInLink} if you already have an invite code.</p>`);
}

export async function renderClaim(env) {
  const { main, ctx, me } = env;
  document.title = "Claim a seat · TI4 Table";
  if (me) {
    main.innerHTML = page(`<h1>You're signed in as ${esc(me.name)}</h1>
      <p>To claim a seat as someone else, sign out first (Me, then Sign out), then open the link again.</p>
      <p><a class="btn btn-primary" href="/games">Go to the games</a></p>`);
    return;
  }
  let code = "";
  try { code = decodeURIComponent(location.hash.slice(1)).trim(); } catch { /* a mangled link reads as no code */ }
  if (!code) return bad(main);

  const show = async () => {
    let data;
    try {
      data = await post("/api/join/preview", { code });
    } catch (err) {
      if (ctx.stale()) return;
      // 400 means the link itself is dead; anything else (offline, locked out) says what happened.
      if (err instanceof ApiError && err.status === 400) return bad(main);
      main.replaceChildren(Object.assign(document.createElement("div"), { className: "games-page" }, {}));
      $(".games-page", main).append(errorBlock(err, show));
      return;
    }
    if (ctx.stale()) return;
    const when = dayLongP(data.game.played_on, data.game.date_precision);
    const kind = data.game.status === "planned" ? "Game planned for" : "Game of";
    if (!data.seats.length) {
      main.innerHTML = page(`<h1>${esc(kind)} ${esc(when)}</h1>
        <p>Every guest seat in this game has been claimed.</p>
        <p>${signInLink} if you already have an invite code.</p>`);
      return;
    }
    pickSeat(data, `${kind} ${when}`);
  };

  const pickSeat = (data, title, note = "") => {
    main.innerHTML = page(`<h1>${esc(title)}</h1>
      <p>Who are you?</p>
      ${note ? `<p class="error" role="alert">${esc(note)}</p>` : ""}
      <ul class="claim-seats">${data.seats.map((s) => `<li><button type="button" class="claim-seat" data-id="${esc(s.player_id)}">
        ${sym(s.faction)}<span class="claim-name">${esc(s.name)}</span>
        <span class="claim-faction">${s.faction ? esc(factionName(s.faction)) : ""}</span></button></li>`).join("")}</ul>
      <p class="help">Using the home-screen app? After you claim a seat, open the app and sign in with a code from Me, then Sign in on another device.</p>`);
    void hydrateSymbols(main);
    $(".claim-seats", main).addEventListener("click", (e) => {
      const b = e.target.closest("button.claim-seat");
      if (!b) return;
      const seat = data.seats.find((s) => String(s.player_id) === b.dataset.id);
      if (seat) confirmSeat(data, title, seat);
    });
  };

  const confirmSeat = (data, title, seat) => {
    main.innerHTML = page(`<h1>${esc(title)}</h1>
      <div class="gconfirm claim-confirm" role="alertdialog" aria-label="Confirm who you are">
        <p>Sign in as ${esc(seat.name)}? You can't undo this yourself.</p>
        <p class="error g-err" role="alert" hidden></p>
        <div class="row"><button type="button" class="btn btn-primary" data-yes>Yes, I'm ${esc(seat.name)}</button>
        <button type="button" class="btn" data-back>Back</button></div>
      </div>`);
    const [yes, back] = $$("button", main);
    back.focus();
    back.addEventListener("click", () => pickSeat(data, title));
    yes.addEventListener("click", async () => {
      yes.disabled = true;
      try {
        const res = await post("/api/join/claim", { code, player_id: seat.player_id });
        history.replaceState(history.state, "", location.pathname + location.search);
        toast(`Signed in as ${res.player.name}`);
        navigate(`/games/${res.game_id}`, { replace: true });
      } catch (err) {
        if (ctx.stale()) return;
        if (err.status === 409) {
          // Someone else took it a moment ago: show who is left.
          try {
            const fresh = await post("/api/join/preview", { code });
            if (fresh.seats.length) return pickSeat(fresh, title, err.message);
          } catch { /* fall through to the plain error */ }
          return bad(main);
        }
        if (err.status === 400) return bad(main);
        yes.disabled = false;
        const e = $(".g-err", main);
        e.textContent = err.message;
        e.hidden = false;
      }
    });
  };

  return show();
}
