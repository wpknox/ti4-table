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
      <div class="fields">
        <div class="field"><label for="f-date">${f.plan ? "Playing on" : "Date"}</label><input id="f-date" type="date" value="${esc(st.played_on)}" required></div>
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
      <div class="field"><label for="f-ti">TI Assistant link <span class="muted">(optional)</span></label>
        <input id="f-ti" type="url" inputmode="url" autocomplete="off" placeholder="https://" value="${esc(st.ti_assistant_url)}"></div>
      <div class="field"><label for="f-notes">Notes <span class="muted">(optional)</span></label>
        <textarea id="f-notes" rows="3">${esc(st.notes)}</textarea></div>

      <div class="savebar">
        <button type="submit" class="btn btn-primary save" id="save">${f.saveLabel}</button>
        ${f.editId ? `<a class="btn" href="/games/${f.editId}">Cancel</a>` : `<button type="button" class="btn" id="cancel">Cancel</button>`}
      </div>`;
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

function stepper(id, value, what) {
  return `<div class="stepper" data-step="${id}">
    <button type="button" class="step" data-d="-1" aria-label="Fewer ${esc(what)}">−</button>
    <output class="stepnum" aria-live="polite">${esc(value)}</output>
    <button type="button" class="step" data-d="1" aria-label="More ${esc(what)}">+</button></div>`;
}

export function seatHtml(f, s, i) {
  const n = i + 1;
  const plan = f.plan;
  const taken = new Set(f.st.seats.filter((x) => x !== s && x.seat_index != null).map((x) => x.seat_index));
  const top = plan ? "" : `<div class="seat-top">
      <span class="seatpts">${stepper(`pts:${s.key}`, s.points, `points for seat ${n}`)}</span>
      <span class="winmark"></span>
    </div>`;
  const position = plan ? "" : `<div><label for="i-${s.key}">Seat position <span class="muted">(optional)</span></label>
        <select id="i-${s.key}" data-f="seat_index"><option value="">Not set</option>${Array.from({ length: 8 }, (_, k) => `<option value="${k}"${s.seat_index === k ? " selected" : ""}${taken.has(k) ? " disabled" : ""}>${k + 1}</option>`).join("")}</select></div>`;
  return `<fieldset class="seat-card" data-key="${s.key}">
    <legend>Seat ${n}</legend>
    ${top}
    <div class="field"><label for="p-${s.key}">Player</label>
      <div class="combo" data-kind="player"><input id="p-${s.key}" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Choose a player" value="${esc(s.player_name)}"><ul class="combo-list" role="listbox" hidden></ul></div></div>
    <div class="field"><label for="fa-${s.key}">Faction${plan ? ' <span class="muted">(optional)</span>' : ""}</label>
      <div class="combo" data-kind="faction"><span class="combo-sym">${s.faction ? sym(s.faction) : ""}</span><input id="fa-${s.key}" role="combobox" aria-expanded="false" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="${plan ? "Not picked yet" : "Choose a faction"}" value="${esc(s.faction ? factionName(s.faction) : "")}"><ul class="combo-list" role="listbox" hidden></ul></div></div>
    <div class="field two">
      <div><label for="c-${s.key}">Colour <span class="muted">(optional)</span></label>
        <select id="c-${s.key}" data-f="color"><option value="">Not set</option>${COLORS.map((c) => `<option value="${c}"${s.color === c ? " selected" : ""}>${cap(c)}</option>`).join("")}</select></div>
      ${position}
    </div>
    <div class="seat-foot">
      <label class="radio"><input type="radio" name="speaker" value="${s.key}" data-f="speaker"${f.st.speaker === s.key ? " checked" : ""}><span>Started as speaker</span></label>
      <button type="button" class="btn rm-seat" data-rm="${s.key}"${f.fixed || f.st.seats.length <= MIN_SEATS ? " hidden" : ""}>Remove seat</button>
    </div>
  </fieldset>`;
}
