// The log form: new game (/games/new) and edit (/games/12/edit).
//
// State lives in one object (`st`) that is saved to localStorage on every
// change as a draft, so a dead battery or dropped connection loses nothing.
// `client_id` is made once when the form opens and kept in the draft, so a
// retry after a lost response can't log the game twice.

import { $, $$, esc, store, toast } from "../lib.js";
import { navigate, back } from "../router.js";
import { hydrateSymbols } from "../factions.js";
import { get, post, put } from "./api.js";
import { FACTION_IDS, factionName, COLORS } from "./names.js";
import { tabs, todayLocal, safeHttps, mapHref, cap, sym, errorBlock } from "./ui.js";

const MIN_SEATS = 3, MAX_SEATS = 8, START_SEATS = 6;

let keySeq = 0;
const newSeat = () => ({ key: `s${++keySeq}`, player_id: null, player_name: "", faction: "", color: "", seat_index: null, points: 0 });

const blank = () => ({
  client_id: crypto.randomUUID(),
  played_on: todayLocal(),
  points_to_win: 10,
  pok: true,
  te: false,
  map_string: "",
  ti_assistant_url: "",
  notes: "",
  seats: Array.from({ length: START_SEATS }, newSeat),
  winner: null, // seat key the user picked by hand, or null for "top score"
  speaker: null, // seat key
});

// ── Winner ─────────────────────────────────────────────────────────────────

// { key } when decided, { tied: [keys], points } when the top score is shared.
function pickWinner(st) {
  if (st.winner && st.seats.some((s) => s.key === st.winner)) return { key: st.winner, manual: true };
  const top = Math.max(...st.seats.map((s) => s.points));
  const best = st.seats.filter((s) => s.points === top);
  return best.length === 1 ? { key: best[0].key } : { tied: best.map((s) => s.key), points: top };
}

// ── Entry ──────────────────────────────────────────────────────────────────

export async function renderForm(env, editId) {
  const { main, ctx, me } = env;
  const canLog = me && (me.role === "editor" || me.role === "admin");
  if (!canLog) {
    main.innerHTML = `<div class="games-page">${tabs("", me)}<h1>Sign in to log a game</h1>
      <p>Only people with an invite can add or edit games.</p>
      <p><a class="btn btn-primary" href="/games/join">Sign in</a></p></div>`;
    return;
  }

  const draftKey = editId ? `games-draft-${editId}` : "games-draft-new";
  let players, game = null;
  try {
    [{ players }, game] = await Promise.all([
      get("/api/players"),
      editId ? get(`/api/games/${editId}`).then((r) => r.game) : null,
    ]);
  } catch (err) {
    if (ctx.stale()) return;
    main.replaceChildren(errorBlock(err, () => renderForm(env, editId)));
    return;
  }
  if (ctx.stale()) return;
  if (game && !game.can_edit) {
    main.innerHTML = `<div class="games-page">${tabs("", me)}<h1>You can't edit this game</h1><p>You can only edit games you created or played in.</p><p><a href="/games/${editId}">Back to the game</a></p></div>`;
    return;
  }

  let st = fromGame(game) ?? blank();
  const draft = store.get(draftKey, null);
  let restored = false;
  if (draft && Array.isArray(draft.seats) && draft.seats.length) {
    st = sanitiseDraft(draft, st);
    restored = true;
  }
  new Form(env, editId, draftKey, st, players.filter((p) => !p.archived), game).mount(restored);
}

function fromGame(g) {
  if (!g) return null;
  const seats = g.seats.map((s) => ({
    key: `s${++keySeq}`, player_id: s.player_id, player_name: s.player_name, faction: s.faction,
    color: s.color ?? "", seat_index: s.seat_index, points: s.points,
  }));
  const w = g.seats.findIndex((s) => s.is_winner);
  const sp = g.seats.findIndex((s) => s.is_speaker_start);
  return {
    client_id: null, played_on: g.played_on, points_to_win: g.points_to_win, pok: g.pok, te: g.te,
    map_string: g.map_string ?? "", ti_assistant_url: g.ti_assistant_url ?? "", notes: g.notes ?? "",
    seats, winner: w >= 0 ? seats[w].key : null, speaker: sp >= 0 ? seats[sp].key : null,
  };
}

// A draft came from storage, so don't trust its shape.
function sanitiseDraft(d, fallback) {
  const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
  const str = (v, def = "") => (typeof v === "string" ? v : def);
  const seats = d.seats.slice(0, MAX_SEATS).map((s) => ({
    key: `s${++keySeq}`,
    player_id: Number.isInteger(s?.player_id) ? s.player_id : null,
    player_name: str(s?.player_name),
    faction: FACTION_IDS.includes(s?.faction) ? s.faction : "",
    color: COLORS.includes(s?.color) ? s.color : "",
    seat_index: int(s?.seat_index, 0, 7, null),
    points: int(s?.points, 0, 30, 0),
  }));
  while (seats.length < MIN_SEATS) seats.push(newSeat());
  // Keys are per session, so a draft remembers winner and speaker by position.
  const at = (i) => (Number.isInteger(i) ? seats[i]?.key ?? null : null);
  return {
    client_id: str(d.client_id).length >= 8 ? d.client_id : fallback.client_id ?? crypto.randomUUID(),
    played_on: /^\d{4}-\d{2}-\d{2}$/.test(str(d.played_on)) ? d.played_on : fallback.played_on,
    points_to_win: int(d.points_to_win, 4, 20, 10),
    pok: d.pok !== false, te: d.te === true,
    map_string: str(d.map_string).slice(0, 2000), ti_assistant_url: str(d.ti_assistant_url).slice(0, 500),
    notes: str(d.notes).slice(0, 4000),
    seats, winner: at(d.winner_i), speaker: at(d.speaker_i),
  };
}

// ── The form ───────────────────────────────────────────────────────────────

class Form {
  constructor(env, editId, draftKey, st, players, game) {
    Object.assign(this, { env, editId, draftKey, st, players, game, saving: false });
  }

  mount(restored) {
    const { main } = this.env;
    main.innerHTML = `<div class="games-page g-form">
      ${tabs("", this.env.me)}
      <h1>${this.editId ? "Edit game" : "Log a game"}</h1>
      <p class="error form-err" id="form-err" role="alert" hidden></p>
      <form id="gform" novalidate></form>
    </div>`;
    this.form = $("#gform", main);
    this.err = $("#form-err", main);
    this.draw();
    this.bind();
    if (restored) {
      toast("Restored your unsaved game", [["Start over", () => this.startOver()]]);
    }
    scrollTo(0, 0);
  }

  // ── Drawing ──
  draw() {
    const st = this.st;
    const w = pickWinner(st);
    this.form.innerHTML = `
      <div class="fields">
        <div class="field"><label for="f-date">Date</label><input id="f-date" type="date" value="${esc(st.played_on)}" required></div>
        <div class="field"><span class="label" id="l-ptw">Points to win</span>${this.stepper("ptw", st.points_to_win, "points to win")}</div>
      </div>
      <fieldset class="toggles"><legend>Expansions</legend>
        <label class="tog"><input type="checkbox" role="switch" id="f-pok"${st.pok ? " checked" : ""}><span>Prophecy of Kings</span></label>
        <label class="tog"><input type="checkbox" role="switch" id="f-te"${st.te ? " checked" : ""}><span>Thunder's Edge</span></label>
      </fieldset>

      <h2 class="seats-h">Seats</h2>
      <div id="seats">${st.seats.map((s, i) => this.seatHtml(s, i, w)).join("")}</div>
      <p class="tie error" id="tie" role="status" hidden></p>
      <button type="button" class="btn" id="add-seat"${st.seats.length >= MAX_SEATS ? " hidden" : ""}>Add a seat</button>

      <h2>More about the game</h2>
      <div class="field"><label for="f-map">Map string <span class="muted">(optional)</span></label>
        <textarea id="f-map" rows="2" spellcheck="false" autocapitalize="off" autocomplete="off">${esc(st.map_string)}</textarea>
        <a class="check-map" id="check-map" target="_blank" rel="noopener" href="${esc(mapHref(st.map_string))}"${st.map_string.trim() ? "" : " hidden"}>Check this map</a></div>
      <div class="field"><label for="f-ti">TI Assistant link <span class="muted">(optional)</span></label>
        <input id="f-ti" type="url" inputmode="url" autocomplete="off" placeholder="https://" value="${esc(st.ti_assistant_url)}"></div>
      <div class="field"><label for="f-notes">Notes <span class="muted">(optional)</span></label>
        <textarea id="f-notes" rows="3">${esc(st.notes)}</textarea></div>

      <div class="savebar">
        <button type="submit" class="btn btn-primary save" id="save">Save game</button>
        ${this.editId ? `<a class="btn" href="/games/${this.editId}">Cancel</a>` : `<button type="button" class="btn" id="cancel">Cancel</button>`}
      </div>`;
    this.updateWinner();
    void hydrateSymbols(this.form);
  }

  stepper(id, value, what) {
    return `<div class="stepper" data-step="${id}">
      <button type="button" class="step" data-d="-1" aria-label="Fewer ${esc(what)}">−</button>
      <output class="stepnum" aria-live="polite">${esc(value)}</output>
      <button type="button" class="step" data-d="1" aria-label="More ${esc(what)}">+</button></div>`;
  }

  seatHtml(s, i) {
    const n = i + 1;
    const taken = new Set(this.st.seats.filter((x) => x !== s && x.seat_index != null).map((x) => x.seat_index));
    return `<fieldset class="seat-card" data-key="${s.key}">
      <legend>Seat ${n}</legend>
      <div class="seat-top">
        <span class="seatpts">${this.stepper(`pts:${s.key}`, s.points, `points for seat ${n}`)}</span>
        <span class="winmark"></span>
      </div>
      <div class="field"><label for="p-${s.key}">Player</label>
        <div class="combo" data-kind="player"><input id="p-${s.key}" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Choose a player" value="${esc(s.player_name)}"><ul class="combo-list" role="listbox" hidden></ul></div></div>
      <div class="field"><label for="fa-${s.key}">Faction</label>
        <div class="combo" data-kind="faction"><span class="combo-sym">${s.faction ? sym(s.faction) : ""}</span><input id="fa-${s.key}" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Choose a faction" value="${esc(s.faction ? factionName(s.faction) : "")}"><ul class="combo-list" role="listbox" hidden></ul></div></div>
      <div class="field two">
        <div><label for="c-${s.key}">Colour <span class="muted">(optional)</span></label>
          <select id="c-${s.key}" data-f="color"><option value="">Not set</option>${COLORS.map((c) => `<option value="${c}"${s.color === c ? " selected" : ""}>${cap(c)}</option>`).join("")}</select></div>
        <div><label for="i-${s.key}">Seat position <span class="muted">(optional)</span></label>
          <select id="i-${s.key}" data-f="seat_index"><option value="">Not set</option>${Array.from({ length: 8 }, (_, k) => `<option value="${k}"${s.seat_index === k ? " selected" : ""}${taken.has(k) ? " disabled" : ""}>${k + 1}</option>`).join("")}</select></div>
      </div>
      <div class="seat-foot">
        <label class="radio"><input type="radio" name="speaker" value="${s.key}" data-f="speaker"${this.st.speaker === s.key ? " checked" : ""}><span>Started as speaker</span></label>
        <button type="button" class="btn rm-seat" data-rm="${s.key}"${this.st.seats.length <= MIN_SEATS ? " hidden" : ""}>Remove seat</button>
      </div>
    </fieldset>`;
  }

  // Marks the winning seat and shows the tie message. Cheap; no re-render.
  updateWinner() {
    const w = pickWinner(this.st);
    $$(".seat-card", this.form).forEach((card) => {
      const key = card.dataset.key;
      const isW = w.key === key;
      const tied = w.tied?.includes(key);
      card.classList.toggle("is-winner", isW);
      const mark = $(".winmark", card);
      if (isW) mark.innerHTML = `<span class="winner-tag">Winner</span>`;
      else mark.innerHTML = `<button type="button" class="btn make-win" data-win="${key}"${tied ? ' data-tied="1"' : ""}>Make winner</button>`;
    });
    const tie = $("#tie", this.form);
    if (w.tied) {
      const who = w.tied.length === 2 ? "Two seats are" : `${w.tied.length} seats are`;
      tie.textContent = `${who} tied on ${w.points}. Pick the winner.`;
      tie.hidden = false;
    } else tie.hidden = true;
  }

  saveErrorText(err) {
    if (err.offline) return "You're offline, so the game isn't saved yet. Everything you entered is kept. Save again when you're back online.";
    if (err.status === 401) return "Your sign-in has expired. Sign in again, then come back. What you entered is kept on this phone.";
    if (err.status === 403 && this.editId) return "You can only edit games you created or played in.";
    return err.message;
  }

  // ── Events ──
  bind() {
    const f = this.form;
    f.addEventListener("submit", (e) => { e.preventDefault(); void this.save(); });
    f.addEventListener("click", (e) => this.onClick(e));
    f.addEventListener("input", (e) => this.onInput(e));
    f.addEventListener("change", (e) => this.onChange(e));
    this.bindCombos();
  }

  // The +/- buttons for points to win and for each seat's points.
  onStep(t) {
    const key = t.closest(".stepper").dataset.step;
    const d = Number(t.dataset.d);
    if (key === "ptw") {
      this.st.points_to_win = Math.min(20, Math.max(4, this.st.points_to_win + d));
      $(".stepnum", t.closest(".stepper")).textContent = this.st.points_to_win;
    } else {
      const seat = this.seat(key.slice(4));
      seat.points = Math.min(30, Math.max(0, seat.points + d));
      $(".stepnum", t.closest(".stepper")).textContent = seat.points;
      this.updateWinner();
    }
    this.persist();
  }

  onClick(e) {
    const t = e.target.closest("button, input[type=radio]");
    if (!t) return;
    if (t.matches(".step")) {
      this.onStep(t);
    } else if (t.matches("[data-win]")) {
      this.st.winner = t.dataset.win;
      this.updateWinner();
      this.persist();
    } else if (t.matches("[data-rm]")) {
      this.syncText();
      this.st.seats = this.st.seats.filter((s) => s.key !== t.dataset.rm);
      if (this.st.winner === t.dataset.rm) this.st.winner = null;
      if (this.st.speaker === t.dataset.rm) this.st.speaker = null;
      this.redrawSeats();
    } else if (t.id === "add-seat") {
      this.syncText();
      this.st.seats.push(newSeat());
      this.redrawSeats();
      const last = $$(".seat-card", this.form).at(-1);
      $("input", last)?.focus();
    } else if (t.id === "cancel") {
      back("/games");
    } else if (t.matches("input[type=radio][data-f=speaker]")) {
      // Clicking the chosen speaker again clears it.
      if (this.st.speaker === t.value) { this.st.speaker = null; t.checked = false; }
      else this.st.speaker = t.value;
      this.persist();
    }
  }

  onInput(e) {
    const t = e.target;
    const st = this.st;
    if (t.id === "f-map") {
      st.map_string = t.value;
      const a = $("#check-map", this.form);
      a.hidden = !t.value.trim();
      a.href = mapHref(t.value.trim());
    } else if (t.id === "f-ti") st.ti_assistant_url = t.value;
    else if (t.id === "f-notes") st.notes = t.value;
    else return;
    this.persist();
  }

  onChange(e) {
    const t = e.target;
    const st = this.st;
    if (t.id === "f-date") st.played_on = t.value;
    else if (t.id === "f-pok") st.pok = t.checked;
    else if (t.id === "f-te") st.te = t.checked;
    else if (t.dataset.f === "color") this.seat(t.closest(".seat-card").dataset.key).color = t.value;
    else if (t.dataset.f === "seat_index") {
      this.seat(t.closest(".seat-card").dataset.key).seat_index = t.value === "" ? null : Number(t.value);
      this.syncText();
      this.refreshPositions();
    } else return;
    this.persist();
  }

  seat(key) { return this.st.seats.find((s) => s.key === key); }

  // Disable positions another seat already uses, without a full redraw.
  refreshPositions() {
    for (const card of $$(".seat-card", this.form)) {
      const mine = this.seat(card.dataset.key);
      const taken = new Set(this.st.seats.filter((x) => x !== mine && x.seat_index != null).map((x) => x.seat_index));
      for (const o of $$("select[data-f=seat_index] option", card)) if (o.value !== "") o.disabled = taken.has(Number(o.value));
    }
  }

  // Text inputs that are drawn from state are re-created on redraw, so the
  // free-text fields are read into state first.
  syncText() {
    const st = this.st;
    st.played_on = $("#f-date", this.form)?.value ?? st.played_on;
    st.map_string = $("#f-map", this.form)?.value ?? st.map_string;
    st.ti_assistant_url = $("#f-ti", this.form)?.value ?? st.ti_assistant_url;
    st.notes = $("#f-notes", this.form)?.value ?? st.notes;
  }

  redrawSeats() {
    const w = pickWinner(this.st);
    $("#seats", this.form).innerHTML = this.st.seats.map((s, i) => this.seatHtml(s, i, w)).join("");
    $("#add-seat", this.form).hidden = this.st.seats.length >= MAX_SEATS;
    this.bindCombos();
    this.updateWinner();
    void hydrateSymbols(this.form);
    this.persist();
  }

  // ── Typeaheads ──
  bindCombos() {
    for (const box of $$(".combo", this.form)) {
      if (box.dataset.bound) continue;
      box.dataset.bound = "1";
      const card = box.closest(".seat-card");
      const seat = () => this.seat(card.dataset.key);
      const input = $("input", box);
      const list = $(".combo-list", box);
      const kind = box.dataset.kind;
      let dirty = false; // has the person typed since opening?
      let active = -1;
      let items = [];

      const current = () => {
        if (kind === "player") return seat().player_name;
        return seat().faction ? factionName(seat().faction) : "";
      };
      const options = () => {
        const q = dirty ? input.value.trim().toLowerCase() : "";
        if (kind === "player") {
          const used = new Set(this.st.seats.filter((x) => x !== seat()).map((x) => x.player_id));
          const hits = this.players.filter((p) => !used.has(p.id) && p.name.toLowerCase().includes(q));
          const typed = input.value.trim();
          const exact = this.players.some((p) => p.name.toLowerCase() === typed.toLowerCase());
          const out = hits.map((p) => ({ label: p.name, pick: () => this.setPlayer(seat(), p.id, p.name, input) }));
          out.push(
            dirty && typed && !exact
              ? { label: `Add “${typed}” as a guest`, add: true, pick: () => this.addGuest(seat(), typed, input) }
              : { label: "Add a guest…", hint: true, pick: () => { input.value = ""; dirty = true; input.placeholder = "Type the guest's name"; input.focus(); show(); } },
          );
          return out;
        }
        const used = new Set(this.st.seats.filter((x) => x !== seat()).map((x) => x.faction));
        return FACTION_IDS.filter((id) => !used.has(id) && factionName(id).toLowerCase().includes(q))
          .sort((a, b) => factionName(a).replace(/^The /, "").localeCompare(factionName(b).replace(/^The /, "")))
          .map((id) => ({ label: factionName(id), faction: id, pick: () => this.setFaction(seat(), id, box, input) }));
      };
      const show = () => {
        items = options();
        active = -1;
        list.innerHTML = items.length
          ? items.map((o, i) => `<li role="option" id="${input.id}-o${i}" data-i="${i}"${o.add ? ' class="add"' : ""}>${o.faction ? sym(o.faction) : ""}${esc(o.label)}</li>`).join("")
          : `<li class="none" role="option" aria-disabled="true">No match</li>`;
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
        void hydrateSymbols(list);
      };
      const hide = () => {
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        if (dirty) { input.value = current(); dirty = false; }
        input.placeholder = kind === "player" ? "Choose a player" : "Choose a faction";
      };
      const mark = (i) => {
        active = i;
        $$("li", list).forEach((li, k) => li.classList.toggle("active", k === i));
        if (i >= 0) {
          input.setAttribute("aria-activedescendant", `${input.id}-o${i}`);
          $$("li", list)[i]?.scrollIntoView({ block: "nearest" });
        }
      };

      input.addEventListener("focus", () => { input.select(); show(); });
      input.addEventListener("input", () => { dirty = true; show(); });
      input.addEventListener("blur", () => setTimeout(hide, 120));
      // Enter picks the highlighted row, or the only/first real match if the person has typed.
      const enterIndex = () => {
        if (active >= 0) return active;
        const firstIsReal = dirty && items[0] && !items[0].hint && !items[0].add;
        return items.length === 1 || firstIsReal ? 0 : -1;
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (list.hidden) show();
          mark(Math.min(items.length - 1, active + 1));
        }
        else if (e.key === "ArrowUp") { e.preventDefault(); mark(Math.max(0, active - 1)); }
        else if (e.key === "Enter" && !list.hidden) {
          e.preventDefault();
          const o = items[enterIndex()];
          if (o) { o.pick(); dirty = false; list.hidden = true; }
        } else if (e.key === "Escape") { hide(); }
      });
      // pointerdown + preventDefault keeps focus in the input so blur doesn't
      // close the list before the tap lands.
      list.addEventListener("pointerdown", (e) => {
        const li = e.target.closest("li[data-i]");
        if (!li) return;
        e.preventDefault();
        const o = items[Number(li.dataset.i)];
        if (o.hint) { o.pick(); return; }
        o.pick();
        dirty = false;
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.blur();
      });
    }
  }

  setPlayer(seat, id, name, input) {
    seat.player_id = id;
    seat.player_name = name;
    input.value = name;
    this.persist();
  }

  setFaction(seat, id, box, input) {
    seat.faction = id;
    input.value = factionName(id);
    $(".combo-sym", box).innerHTML = sym(id);
    void hydrateSymbols(box);
    this.persist();
  }

  async addGuest(seat, name, input) {
    this.showError("");
    try {
      const { id } = await post("/api/players", { name });
      this.players.push({ id, name, archived: false });
      this.players.sort((a, b) => a.name.localeCompare(b.name));
      this.setPlayer(seat, id, name.replace(/\s+/g, " ").trim(), input);
    } catch (err) {
      input.value = seat.player_name;
      this.showError(err.message);
    }
  }

  // ── Draft ──
  persist() {
    this.syncText();
    const { winner, speaker, ...rest } = this.st;
    const idx = (k) => this.st.seats.findIndex((s) => s.key === k);
    store.set(this.draftKey, { ...rest, winner_i: idx(winner), speaker_i: idx(speaker) });
  }

  startOver() {
    store.set(this.draftKey, null);
    const fresh = fromGame(this.game) ?? blank();
    this.st = fresh;
    this.draw();
    toast("Started over");
  }

  showError(msg) {
    this.err.textContent = msg;
    this.err.hidden = !msg;
    if (msg) { this.err.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }

  // ── Save ──
  validate() {
    const st = this.st;
    if (!st.played_on) return "Pick the date the game was played.";
    for (const [i, s] of st.seats.entries()) {
      if (s.player_id == null) return `Seat ${i + 1} needs a player. Pick one from the list or add a guest.`;
      if (!s.faction) return `Seat ${i + 1} needs a faction.`;
    }
    const w = pickWinner(st);
    if (w.tied) return "Pick the winner before saving.";
    if (st.ti_assistant_url.trim() && !safeHttps(st.ti_assistant_url.trim())) return "The TI Assistant link must start with https://.";
    return "";
  }

  async save() {
    if (this.saving) return;
    this.syncText();
    const bad = this.validate();
    this.showError(bad);
    if (bad) return;
    const st = this.st;
    const w = pickWinner(st);
    const body = {
      played_on: st.played_on,
      points_to_win: st.points_to_win,
      pok: st.pok,
      te: st.te,
      map_string: st.map_string.trim() || null,
      ti_assistant_url: st.ti_assistant_url.trim() || null,
      notes: st.notes,
      seats: st.seats.map((s) => ({
        player_id: s.player_id, faction: s.faction, color: s.color || null,
        seat_index: s.seat_index, points: s.points,
        is_winner: s.key === w.key, is_speaker_start: s.key === st.speaker,
      })),
    };
    if (!this.editId) body.client_id = st.client_id;
    const btn = $("#save", this.form);
    this.saving = true;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const res = this.editId ? await put(`/api/games/${this.editId}`, body) : await post("/api/games", body);
      store.set(this.draftKey, null);
      toast("Game saved");
      navigate(`/games/${res.id}`, { replace: true });
    } catch (err) {
      this.saving = false;
      btn.disabled = false;
      btn.textContent = "Save game";
      this.showError(this.saveErrorText(err));
    }
  }
}
