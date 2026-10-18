// The log form: new game (/games/new) and edit (/games/12/edit).
//
// Three modes. Log: a finished game. Plan (/games/new?plan=1&m=<map>, or editing
// a planned game): a game that hasn't been played, with a player on each map
// seat and factions optional. Finish (/games/12/edit?finish=1 on a planned
// game): the log form, prefilled, saving as finished.
//
// State lives in one object (`st`) that is saved to localStorage on every
// change as a draft, so a dead battery or dropped connection loses nothing.
// `client_id` is made once when the form opens and kept in the draft, so a
// retry after a lost response can't log the game twice.

import { $, $$, store, toast } from "../lib.js";
import { navigate, back } from "../router.js";
import { hydrateSymbols } from "../factions.js";
import { get, post, put } from "./api.js";
import { factionName } from "./names.js";
import { loadMapModel, drawMapWithLabels } from "../map/load.js";
import { tabs, todayLocal, safeTiLink, mapHref, sym, errorBlock } from "./ui.js";
import { checkGameBody } from "./validate.js";
import {
  MAX_SEATS, newSeat, blank, pickWinner, modeOf, usableDraft, fitSeats, fromGame, sanitiseDraft, toBody,
} from "./form-state.js";
import { formHtml, seatHtml } from "./form-html.js";
import { bindCombo, playerOptions, factionOptions } from "./combo.js";

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

  const mode = modeOf(env, game);
  let st = fromGame(game) ?? blank();
  if (!game && mode.plan) st.map_string = (env.url.searchParams.get("m") ?? "").trim().slice(0, 2000);
  if (mode.finish && st.played_on > todayLocal()) st.played_on = todayLocal(); // a finished game can't be dated ahead
  const draft = store.get(draftKey, null);
  let restored = false;
  if (usableDraft(draft, mode, st)) {
    st = sanitiseDraft(draft, st);
    restored = true;
  }
  // Plan mode on a map: one seat per map seat, fixed.
  const model = mode.plan && st.map_string.trim() ? await loadMapModel(st.map_string).catch(() => null) : null;
  if (ctx.stale()) return;
  if (model) fitSeats(st, model.report.seats.length);
  new Form(env, editId, draftKey, st, players.filter((p) => !p.archived), game, { ...mode, model }).mount(restored);
}

// ── The form ───────────────────────────────────────────────────────────────

class Form {
  constructor(env, editId, draftKey, st, players, game, mode) {
    // fixed: plan mode on a map, so the seat count is the map's.
    Object.assign(this, { env, editId, draftKey, st, players, game, saving: false,
      plan: mode.plan, finish: mode.finish, model: mode.model, fixed: !!mode.model, mapSeq: 0 });
  }

  get title() {
    if (this.finish) return "Enter results";
    if (this.plan) return this.editId ? "Edit plan" : "Plan a game";
    return this.editId ? "Edit game" : "Log a game";
  }

  get saveLabel() {
    if (this.plan) return "Save planned game";
    return this.finish ? "Save results" : "Save game";
  }

  mount(restored) {
    const { main } = this.env;
    main.innerHTML = `<div class="games-page g-form">
      ${tabs("", this.env.me)}
      <h1>${this.title}</h1>
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
    this.form.innerHTML = formHtml(this);
    this.updateWinner();
    void hydrateSymbols(this.form);
    void this.updateMap();
  }

  addHidden() { return this.fixed || this.st.seats.length >= MAX_SEATS; }


  // Redraws the plan-mode map with each seat's player and faction. A later call
  // makes an earlier one that is still loading drop its result.
  async updateMap() {
    const box = $("#plan-map", this.form);
    if (!box || !this.model) return;
    const seq = ++this.mapSeq;
    const labels = {};
    this.st.seats.forEach((s, i) => {
      labels[i + 1] = { name: s.player_id == null ? "" : s.player_name, faction: s.faction || null };
    });
    const svg = await drawMapWithLabels(this.model, labels, `Map for ${this.st.seats.length} players`);
    if (seq === this.mapSeq && box.isConnected) box.innerHTML = svg;
  }



  // Marks the winning seat and shows the tie message. Cheap; no re-render.
  updateWinner() {
    if (this.plan) return; // nobody has won a game that hasn't been played
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

  get doneToast() {
    if (this.plan) return "Game planned";
    return this.finish ? "Results saved" : "Game saved";
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
    $("#seats", this.form).innerHTML = this.st.seats.map((s, i) => seatHtml(this, s, i)).join("");
    $("#add-seat", this.form).hidden = this.addHidden();
    this.bindCombos();
    this.updateWinner();
    void hydrateSymbols(this.form);
    void this.updateMap();
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
      if (box.dataset.kind === "player") {
        bindCombo(box, {
          placeholder: "Choose a player",
          current: () => seat().player_name,
          options: (c) => playerOptions({
            ...c, players: this.players, seats: this.st.seats, seat: seat(),
            onPick: (p) => this.setPlayer(seat(), p.id, p.name, input),
            onAdd: (name) => this.addGuest(seat(), name, input),
          }),
        });
      } else {
        bindCombo(box, {
          placeholder: "Choose a faction",
          current: () => (seat().faction ? factionName(seat().faction) : ""),
          options: (c) => factionOptions({
            ...c, seats: this.st.seats, seat: seat(), plan: this.plan,
            onPick: (id) => this.setFaction(seat(), id, box, input),
          }),
        });
      }
    }
  }

  setPlayer(seat, id, name, input) {
    seat.player_id = id;
    seat.player_name = name;
    input.value = name;
    void this.updateMap();
    this.persist();
  }

  setFaction(seat, id, box, input) {
    seat.faction = id;
    input.value = id ? factionName(id) : "";
    $(".combo-sym", box).innerHTML = sym(id);
    void hydrateSymbols(box);
    void this.updateMap();
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
    store.set(this.draftKey, { ...rest, plan: this.plan, winner_i: idx(winner), speaker_i: idx(speaker) });
  }

  startOver() {
    store.set(this.draftKey, null);
    const fresh = fromGame(this.game) ?? blank();
    // Keep the mode's own starting point: the plan's map, a finish date that isn't ahead, the fixed seats.
    if (this.plan && !this.game) fresh.map_string = this.st.map_string;
    if (this.finish && fresh.played_on > todayLocal()) fresh.played_on = todayLocal();
    if (this.model) fitSeats(fresh, this.model.report.seats.length);
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
      if (!s.faction && !this.plan) return `Seat ${i + 1} needs a faction.`;
    }
    if (!this.plan && pickWinner(st).tied) return "Pick the winner before saving.";
    if (st.ti_assistant_url.trim() && !safeTiLink(st.ti_assistant_url.trim())) return "The TI Assistant link must be an https://ti-assistant.com link.";
    return "";
  }

  async save() {
    if (this.saving) return;
    this.syncText();
    const bad = this.validate();
    this.showError(bad);
    if (bad) return;
    const body = toBody(this.st, { plan: this.plan, editId: this.editId });
    // The same checks the server runs, so a mistake is caught before the request.
    // The latest date allowed is tomorrow, as on the server.
    const tomorrow = new Date(Date.now() + 86400000);
    const { error } = checkGameBody(body, { creating: !this.editId, today: todayLocal(tomorrow) });
    this.showError(error ?? "");
    if (error) return;
    const btn = $("#save", this.form);
    this.saving = true;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const res = this.editId ? await put(`/api/games/${this.editId}`, body) : await post("/api/games", body);
      store.set(this.draftKey, null);
      toast(this.doneToast);
      navigate(`/games/${res.id}`, { replace: true });
    } catch (err) {
      this.saving = false;
      btn.disabled = false;
      btn.textContent = this.saveLabel;
      this.showError(this.saveErrorText(err));
    }
  }
}
