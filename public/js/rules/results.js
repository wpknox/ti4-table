// The Results section: search result list, snippets and the labels around them.

import { esc, plural } from "../lib.js";
import { search, compileQuery, placeAt } from "./data.js";
import { pageUrl, searchUrl } from "./urls.js";

const SNIPPETS_SHOWN = 3;

// ── Results ───────────────────────────────────────────────────────────────

function snippetHtml(text, match, cq) {
  const RADIUS = 90,
    MAX = 300;
  const first = match.ranges[0][0],
    last = match.ranges.at(-1)[1];
  let a, b;
  if (cq.mode === "phrase") {
    a = Math.max(0, first - RADIUS);
    b = Math.min(text.length, last + RADIUS);
  } else {
    a = Math.max(match.s, first - RADIUS);
    b = Math.min(match.e, Math.max(last + 40, first + 120), a + MAX);
  }
  while (a > 0 && /\S/.test(text[a - 1]) && first - a < RADIUS + 20) a--;
  while (b < text.length && /\S/.test(text[b]) && b - last < RADIUS + 20) b++;
  const clean = (t) => esc(t.replace(/\s+/g, " "));
  const startOfMatch = cq.mode === "phrase" ? 0 : match.s;
  const endOfMatch = cq.mode === "phrase" ? text.length : match.e;
  let out = a > startOfMatch ? "…" : "";
  let pos = a;
  for (const [s, e] of match.ranges) {
    if (e <= a || s >= b) continue;
    out += clean(text.slice(pos, Math.max(s, a))) + "<mark>" + clean(text.slice(Math.max(s, a), Math.min(e, b))) + "</mark>";
    pos = Math.min(e, b);
  }
  out += clean(text.slice(pos, b));
  if (b < endOfMatch) out += "…";
  return out.trim();
}

function placeLabel(page, pos) {
  const { section, anchor } = placeAt(page, pos);
  const num = anchor && /^\d/.test(anchor.id) ? anchor.id : "";
  const sec = section && !/^Rules Reference$/i.test(section) ? section : "";
  return { num, sec };
}

// A link to switch between exact-phrase and separate-words search, when that makes sense.
function otherModeLink(q, cq, mode) {
  if (cq.mode === "phrase") {
    if (compileQuery(q, "words")?.terms.length > 1)
      return `<a class="link" href="${esc(searchUrl(q, "words"))}">Search for the words separately instead</a>`;
    return "";
  }
  // Only offer the way back when the person chose the mode; automatic fallbacks stay quiet.
  return mode ? `<a class="link" href="${esc(searchUrl(q))}">Back to exact phrase</a>` : "";
}

function whereHtml({ num, sec }) {
  if (!num && !sec) return "";
  const n = num ? `<span class="wn">${esc(num)}</span>` : "";
  const c = sec ? `<span class="ws">${esc(sec)}</span>` : "";
  return `<span class="where">${n}${c}</span>`;
}

export function renderResults(view, rules, q, mode) {
  const { cq, results } = search(rules, q, mode);
  if (!cq || !results.length) {
    view.innerHTML = `<div class="empty"><h1>Nothing found for “${esc(q)}”</h1>
      <p>Try fewer or different words, a rule number like 58, or a card name. Short forms like AFB, PDS and TG work too.</p></div>`;
    return;
  }

  const total = results.reduce((n, r) => n + r.matches.length, 0);
  const unit = cq.mode === "phrase" ? "match" : "paragraph";
  const units = cq.mode === "phrase" ? "matches" : "paragraphs";
  let note = "";
  if (cq.mode === "words")
    note = `No exact match for the whole phrase, so these are paragraphs that mention ${termList(cq.terms, "and")}.`;
  else if (cq.mode === "some")
    note = `No paragraph mentions all of ${termList(cq.terms, "and")}, so these mention most of them.`;
  const otherMode = otherModeLink(q, cq, mode);

  const snippet = (r, i) => {
    const m = r.matches[i];
    const label = placeLabel(r.page, m.ranges[0][0]);
    const where = whereHtml(label);
    return `<a class="snippet" href="${esc(pageUrl(r.page.id, { q, mode: cq.mode, m: i }))}">
        ${where}
        <span class="snip">${snippetHtml(r.page.text, m, cq)}</span>
      </a>`;
  };

  view.innerHTML = `
    <div class="results">
      <header class="results-head">
        <h1>${plural(total, unit, units)} on ${plural(results.length, "page")}</h1>
        ${note ? `<p class="muted">${note}</p>` : ""}
        ${otherMode ? `<p>${otherMode}</p>` : ""}
      </header>
      <ol class="result-list">
        ${results
          .map(
            (r) => `<li class="result">
              <a class="result-title" href="${esc(pageUrl(r.page.id, { q, mode: cq.mode, m: 0 }))}">
                ${r.page.number ? `<span class="n">${r.page.number}</span>` : ""}
                <span class="t">${esc(r.page.title)}</span>
              </a>
              <p class="meta">${resultMeta(r.page, r.matches.length, unit, units)}</p>
              ${r.matches.slice(0, SNIPPETS_SHOWN).map((_, i) => snippet(r, i)).join("")}
              ${
                r.matches.length > SNIPPETS_SHOWN
                  ? `<div class="more-snippets" hidden>${r.matches
                      .slice(SNIPPETS_SHOWN)
                      .map((_, i) => snippet(r, i + SNIPPETS_SHOWN))
                      .join("")}</div>
                    <button class="link more" data-act="more">Show ${r.matches.length - SNIPPETS_SHOWN} more on this page</button>`
                  : ""
              }
            </li>`,
          )
          .join("")}
      </ol>
    </div>`;
}

const termList = (terms, joiner) =>
  terms.length < 2
    ? `“${esc(terms[0] ?? "")}”`
    : terms.slice(0, -1).map((t) => `“${esc(t)}”`).join(", ") + ` ${joiner} “${esc(terms.at(-1))}”`;

// Prose, not "kind · count": Rules pages are identified by their number, so they get just the count.
const resultMeta = (page, n, unit, units) => {
  const isPara = unit === "paragraph";
  const count = plural(n, isPara ? "matching paragraph" : unit, isPara ? "matching paragraphs" : units);
  if (page.kind === "Rules") return count;
  return `${esc(kindLabel(page))}, ${count}`;
};

export function kindLabel(page) {
  if (page.kind === "Rules") return "Rules Reference";
  if (page.kind === "Factions") return "Faction notes";
  return page.subtitle ? `Card notes for ${page.subtitle}` : "Card notes";
}
