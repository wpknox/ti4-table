// The typeahead used for the player and faction pickers on the log form.
// bindCombo() owns the list, keyboard and tap handling; the option builders
// below say what each picker offers.

import { $, $$, esc } from "../lib.js";
import { hydrateSymbols } from "../factions.js";
import { FACTION_IDS, factionName } from "./names.js";
import { sym } from "./ui.js";

// Wires one `.combo` box (an input plus a `.combo-list`).
//   current()     the text the input shows when nothing is being typed
//   options(c)    the rows to offer. c = { q, typed, dirty, typeNew(placeholder) }:
//                 q is the lower-cased search ("" until the person types), typed is the
//                 raw trimmed text, and typeNew() clears the input for a new name.
//                 A row is { label, pick, faction?, add?, hint? }.
//   placeholder   what the input says when it is closed
export function bindCombo(box, { current, options, placeholder }) {
  const input = $("input", box);
  const list = $(".combo-list", box);
  let dirty = false; // has the person typed since opening?
  let active = -1;
  let items = [];

  const typeNew = (text) => {
    input.value = "";
    dirty = true;
    input.placeholder = text;
    input.focus();
    show();
  };
  const show = () => {
    items = options({ q: dirty ? input.value.trim().toLowerCase() : "", typed: input.value.trim(), dirty, typeNew });
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
    input.placeholder = placeholder;
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

// ── What each picker offers ──

// Players not already seated, then "Add a guest" (typing a new name turns it into
// "Add “name” as a guest"). onPick(player), onAdd(name).
export function playerOptions({ players, seats, seat, q, typed, dirty, typeNew, onPick, onAdd }) {
  const used = new Set(seats.filter((x) => x !== seat).map((x) => x.player_id));
  const hits = players.filter((p) => !used.has(p.id) && p.name.toLowerCase().includes(q));
  const exact = players.some((p) => p.name.toLowerCase() === typed.toLowerCase());
  const out = hits.map((p) => ({ label: p.name, pick: () => onPick(p) }));
  out.push(
    dirty && typed && !exact
      ? { label: `Add “${typed}” as a guest`, add: true, pick: () => onAdd(typed) }
      : { label: "Add a guest…", hint: true, pick: () => typeNew("Type the guest's name") },
  );
  return out;
}

// Factions not already seated, A to Z ignoring "The". A planned seat can go back to none.
// onPick(id), where id "" means none.
export function factionOptions({ seats, seat, q, plan, onPick }) {
  const used = new Set(seats.filter((x) => x !== seat).map((x) => x.faction));
  const out = FACTION_IDS.filter((id) => !used.has(id) && factionName(id).toLowerCase().includes(q))
    .sort((a, b) => factionName(a).replace(/^The /, "").localeCompare(factionName(b).replace(/^The /, "")))
    .map((id) => ({ label: factionName(id), faction: id, pick: () => onPick(id) }));
  // Factions are often drafted at the table, so a planned seat can go back to none.
  if (plan && !q && seat.faction) out.unshift({ label: "No faction yet", pick: () => onPick("") });
  return out;
}
