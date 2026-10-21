// The log form's HTML. Pure string builders: each takes the Form (for its mode and
// state) and returns markup, so form.js only has to wire events.

import { esc } from "../lib.js";
import { factionName, COLORS } from "./names.js";
import { mapHref, cap, sym } from "./ui.js";
import { MIN_SEATS } from "./form-state.js";

// The whole form body.
export function formHtml(f) {
  const st = f.st;
  return `
      ${memoryHtml(f)}
      ${f.canFill ? tiFillHtml(f) : ""}
      <div class="fields">
        <div class="field"><label for="f-date">${f.plan ? "Playing on" : "Date"}</label>${dateInput(f)}</div>
        <div class="field"><span class="label" id="l-ptw">Points to win</span>${stepper("ptw", st.points_to_win, "points to win")}</div>
      </div>
      <fieldset class="toggles"><legend>Expansions</legend>
        <label class="tog"><input type="checkbox" role="switch" id="f-pok"${st.pok ? " checked" : ""}><span>Prophecy of Kings</span></label>
        <label class="tog"><input type="checkbox" role="switch" id="f-te"${st.te ? " checked" : ""}><span>Thunder's Edge</span></label>
      </fieldset>

      <h2 class="seats-h">Seats</h2>
      ${f.plan ? `<div class="plan-map" id="plan-map"></div>` : ""}
      <div id="seats">${st.seats.map((s, i) => seatHtml(f, s, i)).join("")}</div>
      <p class="tie error" id="tie" role="status" hidden></p>
      <button type="button" class="btn" id="add-seat"${f.addHidden() ? " hidden" : ""}>Add a seat</button>

      <h2>More about the game</h2>
      ${mapFieldHtml(f)}
      ${f.canFill ? "" : tiLinkField(st)}
      ${miltyFields(f)}
      <div class="field"><label for="f-notes">Notes <span class="muted">(optional)</span></label>
        <textarea id="f-notes" rows="3">${esc(st.notes)}</textarea></div>

      <div class="savebar">
        <button type="submit" class="btn btn-primary save" id="save">${f.saveLabel}</button>
        ${f.editId ? `<a class="btn" href="/games/${f.editId}">Cancel</a>` : `<button type="button" class="btn" id="cancel">Cancel</button>`}
      </div>`;
}

const tiLinkField = (st) => `<div class="field"><label for="f-ti">TI Assistant link <span class="muted">(optional)</span></label>
        <input id="f-ti" type="url" inputmode="url" autocomplete="off" placeholder="https://" value="${esc(st.ti_assistant_url)}"></div>
      ${tiPasswordField(st)}`;

const tiPasswordField = (st) => `<div class="field"><label for="f-ti-pw">TI Assistant password <span class="muted">(optional)</span></label>
        <input id="f-ti-pw" type="text" autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="100" value="${esc(st.ti_assistant_password)}">
        <p class="muted hint">Optional. If the TI Assistant game asks for a password, put it here so everyone can find it. Needs the link above.</p>
        <p class="error pair-err" id="pair-ti" role="status" hidden></p></div>`;

// The Milty draft link, and its admin passkey for the game's creator and admins only (the server withholds it from everyone else).
const miltyFields = (f) => `<div class="field"><label for="f-milty">Milty draft link <span class="muted">(optional)</span></label>
        <input id="f-milty" type="url" inputmode="url" autocomplete="off" placeholder="https://milty.shenanigans.be/d/…" value="${esc(f.st.milty_url)}"></div>
      ${f.showPass ? `<div class="field"><label for="f-milty-pass">Milty admin passkey <span class="muted">(optional)</span></label>
        <input id="f-milty-pass" type="text" inputmode="text" autocomplete="off" spellcheck="false" autocapitalize="off" maxlength="64" value="${esc(f.st.milty_admin_pass)}">
        <p class="muted hint">Optional. Only you and admins can see this. Paste it into Restore session on the Milty draft page. Needs the link above.</p>
        <p class="error pair-err" id="pair-milty" role="status" hidden></p></div>` : ""}`;

// New finished games only: fill the form from a TI Assistant link or a downloaded file.
// The link field is the game's own TI Assistant link, so it is not shown twice.
function tiFillHtml(f) {
  return `<div class="ti-fill">
      <div class="field"><label for="f-ti">TI Assistant link <span class="muted">(optional)</span></label>
        <input id="f-ti" type="url" inputmode="url" autocomplete="off" placeholder="https://ti-assistant.com/en/game/…" value="${esc(f.st.ti_assistant_url)}">
        <button type="button" class="btn" id="ti-fill">Fill from TI Assistant</button></div>
      ${tiPasswordField(f.st)}
      <div class="field"><label for="f-ti-file">Or load a TI Assistant file</label>
        <input id="f-ti-file" type="file" accept="application/json,.json">
        <button type="button" class="btn" id="ti-scores" hidden>Get the final scores from TI Assistant</button></div>
    </div>`;
}

// The "from memory" switch (log mode only) and, when on, how exact the date is.
function memoryHtml(f) {
  if (f.plan || f.finish) return "";
  return `<label class="tog"><input type="checkbox" role="switch" id="f-mem"${f.memory ? " checked" : ""}><span>Logging an old game from memory</span></label>
      ${f.memory ? precisionHtml(f.st.date_precision) : ""}`;
}

function precisionHtml(prec) {
  const opt = (v, label) => `<option value="${v}"${prec === v ? " selected" : ""}>${label}</option>`;
  return `<div class="field"><label for="f-prec">How well do you know the date</label>
        <select id="f-prec">${opt("day", "Exact day")}${opt("month", "Month and year")}${opt("year", "Year only")}</select></div>`;
}

// The date input matches the precision. st.played_on is always a full YYYY-MM-DD
// (the 1st for a month, 1 January for a year); the input shows only what's known.
function dateInput(f) {
  const { played_on, date_precision } = f.st;
  if (f.memory && date_precision === "month") return `<input id="f-date" type="month" value="${esc(played_on.slice(0, 7))}" required>`;
  if (f.memory && date_precision === "year") return `<input id="f-date" type="number" inputmode="numeric" min="1990" max="2100" step="1" placeholder="2024" value="${esc(played_on.slice(0, 4))}" required>`;
  return `<input id="f-date" type="date" value="${esc(played_on)}" required>`;
}

// Plan mode with a map shows it read-only; changing it happens on the Map page.
function mapFieldHtml(f) {
  const st = f.st;
  if (f.plan && st.map_string.trim()) {
    return `<div class="field"><span class="label">Map</span>
      <p class="plan-mapstring">${esc(st.map_string)}</p>
      <a class="check-map" href="${esc(mapHref(st.map_string.trim()))}">Change map</a></div>`;
  }
  return `<div class="field"><label for="f-map">Map string <span class="muted">(optional)</span></label>
      <textarea id="f-map" rows="2" spellcheck="false" autocapitalize="off" autocomplete="off">${esc(st.map_string)}</textarea>
      <a class="check-map" id="check-map" target="_blank" rel="noopener" href="${esc(mapHref(st.map_string))}"${st.map_string.trim() ? "" : " hidden"}>Check this map</a></div>`;
}

// A null value (points not remembered) shows as "?".
function stepper(id, value, what) {
  return `<div class="stepper" data-step="${id}">
    <button type="button" class="step" data-d="-1" aria-label="Fewer ${esc(what)}">−</button>
    <output class="stepnum" aria-live="polite">${value == null ? "?" : esc(value)}</output>
    <button type="button" class="step" data-d="1" aria-label="More ${esc(what)}">+</button></div>`;
}

// Points stepper and the winner control. From memory the winner is a radio, and
// points can be set back to unknown.
function seatTopHtml(f, s, n) {
  const stepperHtml = stepper(`pts:${s.key}`, s.points, `points for seat ${n}`);
  let unknown = "", winner = `<span class="winmark"></span>`;
  if (f.memory) {
    unknown = `<button type="button" class="btn btn-quiet unknown-pts" data-unknown="${s.key}"${s.points == null ? " hidden" : ""}>Unknown</button>`;
    winner = `<label class="radio"><input type="radio" name="winner" value="${s.key}" data-f="winner"${f.st.winner === s.key ? " checked" : ""}><span>Won</span></label>`;
  }
  return `<div class="seat-top">
      <span class="seatpts">${stepperHtml}
        ${unknown}</span>
      ${winner}
    </div>`;
}

// A position another seat holds stays pickable: picking it swaps the two seats.
export const positionLabel = (k, taken) => (taken ? `${k + 1} (swap)` : String(k + 1));

function positionHtml(f, s) {
  const taken = new Set(f.st.seats.filter((x) => x !== s && x.seat_index != null).map((x) => x.seat_index));
  const opts = Array.from({ length: 8 }, (_, k) => `<option value="${k}"${s.seat_index === k ? " selected" : ""}>${positionLabel(k, taken.has(k))}</option>`).join("");
  return `<div><label for="i-${s.key}">Seat position <span class="muted">(optional)</span></label>
        <select id="i-${s.key}" data-f="seat_index"><option value="">Not set</option>${opts}</select></div>`;
}

function factionHtml(f, s) {
  let placeholder = "Choose a faction";
  if (f.plan) placeholder = "Not picked yet";
  else if (f.memory) placeholder = "Not remembered";
  const optional = f.plan || f.memory ? ' <span class="muted">(optional)</span>' : "";
  const name = s.faction ? factionName(s.faction) : "";
  return `<div class="field"><label for="fa-${s.key}">Faction${optional}</label>
      <div class="combo" data-kind="faction"><span class="combo-sym">${s.faction ? sym(s.faction) : ""}</span><input id="fa-${s.key}" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${placeholder}" value="${esc(name)}"><ul class="combo-list" role="listbox" hidden></ul></div></div>`;
}

export function seatHtml(f, s, i) {
  const top = f.plan ? "" : seatTopHtml(f, s, i + 1);
  const position = f.plan ? "" : positionHtml(f, s);
  const removeHidden = f.fixed || f.st.seats.length <= MIN_SEATS ? " hidden" : "";
  return `<fieldset class="seat-card" data-key="${s.key}">
    <legend>Seat ${i + 1}</legend>
    ${top}
    <div class="field"><label for="p-${s.key}">Player</label>
      <div class="combo" data-kind="player"><input id="p-${s.key}" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Choose a player" value="${esc(s.player_name)}"><ul class="combo-list" role="listbox" hidden></ul></div></div>
    ${s.ti_hint && s.player_id == null ? `<p class="ti-hint muted">TI Assistant calls this player “${esc(s.ti_hint)}”</p>` : ""}
    ${factionHtml(f, s)}
    <div class="field two">
      <div><label for="c-${s.key}">Colour <span class="muted">(optional)</span></label>
        <select id="c-${s.key}" data-f="color"><option value="">Not set</option>${COLORS.map((c) => `<option value="${c}"${s.color === c ? " selected" : ""}>${cap(c)}</option>`).join("")}</select></div>
      ${position}
    </div>
    <div class="seat-foot">
      <label class="radio"><input type="radio" name="speaker" value="${s.key}" data-f="speaker"${f.st.speaker === s.key ? " checked" : ""}><span>Started as speaker</span></label>
      <button type="button" class="btn rm-seat" data-rm="${s.key}"${removeHidden}>Remove seat</button>
    </div>
  </fieldset>`;
}
