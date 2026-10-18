// The Suggestions section: the dropdown under the search box.

import { $, esc } from "../lib.js";
import { pageUrl } from "./urls.js";
import { kindLabel } from "./results.js";

// The current suggestions and which one is highlighted (-1 for none).
export const sg = { items: [], index: -1 };

export function hideSuggest(shell = document) {
  const box = $(".suggest", shell);
  if (box) box.hidden = true;
  $("#rq", shell)?.setAttribute("aria-expanded", "false");
  sg.items = [];
  sg.index = -1;
}

export function suggestionUrl(s) {
  return pageUrl(s.page.id, { anchor: s.id });
}

export function renderSuggest() {
  const box = $(".suggest");
  if (!sg.items.length) return hideSuggest();
  box.hidden = false;
  $("#rq").setAttribute("aria-expanded", "true");
  box.innerHTML =
    sg.items
      .map(
        (s, i) => `<a class="suggestion${i === sg.index ? " active" : ""}" role="option" id="sg${i}"
          aria-selected="${i === sg.index}" href="${esc(suggestionUrl(s))}">
          <span class="t">${s.label ? `${esc(s.label)} <span class="muted">in ${esc(s.page.title)}</span>` : esc(s.page.title)}</span>
          <span class="muted k">${esc(kindLabel(s.page))}</span></a>`,
      )
      .join("") + `<p class="suggest-hint">Enter searches the full text</p>`;
}
