// The Rules section: home (recent + browse), search results, and rule pages.
//
// URLs:
//   /rules                               home
//   /rules/search?q=…[&mode=…]           results
//   /rules/R_movement[?q=…&mode=…&m=2][#58.3]
//                                        a page, optionally with match 2 of
//                                        the query highlighted, or scrolled
//                                        to paragraph 58.3

import { $, $$, esc, plural, store, remember, toast } from "../lib.js";
import { navigate, setUrl, back } from "../router.js";
import { symbolSlot, hydrateSymbols } from "../factions.js";
import {
  loadRules, search, compileQuery, pageMatches, placeAt, suggest, isRuleNumber, textOf,
} from "./data.js";

const MAX_RECENT_SEARCHES = 12;
const MAX_RECENT_PAGES = 8;
const SNIPPETS_SHOWN = 3;
const FONT_STEPS = [0.9375, 1, 1.0625, 1.1875, 1.3125, 1.5, 1.75];

const KIND_TABS = [
  { kind: "Rules", label: "Rules" },
  { kind: "Factions", label: "Factions" },
  { kind: "Components", label: "Cards" },
];

// ── URLs ──────────────────────────────────────────────────────────────────

function pageUrl(id, { q, mode, m, anchor } = {}) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (q && mode && mode !== "phrase") p.set("mode", mode);
  if (q && m) p.set("m", String(m));
  return `/rules/${id}${p.size ? "?" + p : ""}${anchor ? "#" + encodeURIComponent(anchor) : ""}`;
}

function searchUrl(q, mode) {
  const p = new URLSearchParams({ q });
  if (mode) p.set("mode", mode);
  return `/rules/search?${p}`;
}

// ── Shell ─────────────────────────────────────────────────────────────────

// The search bar persists across rules views so focus and typing survive
// navigation; only .rview is replaced.
function ensureShell(main) {
  let shell = $(".rules", main);
  if (shell) return shell;
  main.innerHTML = `
    <div class="rules">
      <div class="rbar">
        <form class="rsearch" role="search" autocomplete="off">
          <button type="button" class="icon-btn rback" data-act="back" aria-label="Back" hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <label class="visually-hidden" for="rq">Search the rules</label>
          <input id="rq" type="search" enterkeyhint="search" spellcheck="false"
            placeholder="Search rules, or ask a question" aria-autocomplete="list" aria-controls="rsuggest">
          <button type="submit" class="btn rgo">Search</button>
        </form>
        <div class="suggest" id="rsuggest" role="listbox" hidden></div>
      </div>
      <div class="rview"></div>
      <div class="matchbar" hidden>
        <span class="matchcount" aria-live="polite"></span>
        <button class="icon-btn" data-act="prev-match" aria-label="Previous match (Shift+N)" title="Previous match (Shift+N)">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn" data-act="next-match" aria-label="Next match (N)" title="Next match (N)">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn" data-act="clear-match" aria-label="Clear highlights" title="Clear highlights">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>`;
  shell = $(".rules", main);
  wire(shell);
  applyFontSize();
  return shell;
}

function applyFontSize() {
  const i = store.get("fontStep", 2);
  document.documentElement.style.setProperty("--fs", `${FONT_STEPS[i] ?? 1.0625}rem`);
}

// ── Render entry point ───────────────────────────────────────────────────

let state = { marks: [], active: -1, page: null, rules: null };

export async function renderRules(url, main, ctx) {
  const shell = ensureShell(main);
  const view = $(".rview", shell);
  const input = $("#rq", shell);
  hideSuggest(shell);
  $(".matchbar", shell).hidden = true;
  state.marks = [];
  state.page = null;

  const rest = url.pathname.replace(/^\/rules\/?/, "");
  $(".rback", shell).hidden = rest === "";

  let rules;
  try {
    if (!state.rules) view.innerHTML = `<p class="muted loading">Loading rules…</p>`;
    rules = state.rules = await loadRules();
  } catch (err) {
    if (ctx.stale()) return;
    view.innerHTML = "";
    const p = document.createElement("p");
    p.className = "error";
    p.textContent = `Couldn't load the rules. Check your connection and reload. (${err.message})`;
    view.append(p);
    return;
  }
  if (ctx.stale()) return;

  const q = url.searchParams.get("q") ?? "";
  const mode = url.searchParams.get("mode") ?? undefined;

  if (rest === "") {
    document.title = "Rules · TI4 Table";
    input.value = "";
    renderHome(view, rules);
    scrollTo(0, ctx.restoring ? (ctx.scroll ?? 0) : 0);
  } else if (rest === "search") {
    document.title = `“${q}” · Rules · TI4 Table`;
    input.value = q;
    renderResults(view, rules, q, mode);
    scrollTo(0, ctx.restoring ? (ctx.scroll ?? 0) : 0);
  } else {
    const page = rules.byId.get(rest);
    if (!page) {
      document.title = "Page not found · Rules · TI4 Table";
      view.innerHTML = `<div class="empty"><h1>No rules page called “${esc(rest)}”</h1>
        <p>It may have been renamed. <a href="/rules">Browse all rules</a> or search above.</p></div>`;
      return;
    }
    document.title = `${page.title} · Rules · TI4 Table`;
    if (q) input.value = q;
    renderPage(view, rules, page, {
      q,
      mode,
      m: Number(url.searchParams.get("m") ?? 0),
      anchor: decodeURIComponent(url.hash.slice(1)),
      restoreScroll: ctx.restoring ? ctx.scroll : undefined,
    });
  }
}

// ── Home ──────────────────────────────────────────────────────────────────

function renderHome(view, rules) {
  const recentSearches = store.get("recentSearches", []);
  const recentPages = store.get("recentPages", []).map((id) => rules.byId.get(id)).filter(Boolean);
  const tab = KIND_TABS.find((t) => t.kind === store.get("browseTab", "Rules")) ?? KIND_TABS[0];

  view.innerHTML = `
    <div class="home">
      <p class="lede">The Living Rules Reference with Dane’s official rulings.
        Type a rule number like <button class="inline-try" data-try="58.3">58.3</button>,
        a term like <button class="inline-try" data-try="sustain damage">sustain damage</button>,
        or a question like <button class="inline-try" data-try="can I retreat into an empty system">can I retreat into an empty system</button>.</p>
      ${
        recentSearches.length
          ? `<section class="recent">
              <h2>Recent searches <button class="link" data-act="clear-recent">Clear</button></h2>
              <div class="chips">${recentSearches
                .map((s) => `<a class="chip" href="${esc(searchUrl(s))}">${esc(s)}</a>`)
                .join("")}</div>
            </section>`
          : ""
      }
      ${
        recentPages.length
          ? `<section class="recent">
              <h2>Recently read</h2>
              <div class="chips">${recentPages
                .map((p) => `<a class="chip" href="${pageUrl(p.id)}">${esc(p.title)}</a>`)
                .join("")}</div>
            </section>`
          : ""
      }
      <section class="browse">
        <h2 class="visually-hidden">Browse</h2>
        <div class="tabs" role="tablist" aria-label="Browse">
          ${KIND_TABS.map((t) => {
            const n = rules.pages.filter((p) => p.kind === t.kind).length;
            return `<button role="tab" data-tab="${t.kind}" aria-selected="${t === tab}">${t.label} <span class="count">${n}</span></button>`;
          }).join("")}
        </div>
        <ol class="index" data-kind="${tab.kind}">
          ${browseItems(rules, tab.kind)}
        </ol>
      </section>
      ${credits(rules)}
    </div>`;
  void hydrateSymbols(view);
}

function browseItems(rules, kind) {
  let pages = rules.pages.filter((p) => p.kind === kind);
  if (kind === "Rules")
    pages = pages.sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999) || a.title.localeCompare(b.title));
  return pages
    .map(
      (p) => `<li><a href="${pageUrl(p.id)}">
        ${kind === "Rules" ? `<span class="n">${p.number ?? "—"}</span>` : ""}${kind === "Factions" ? symbolSlot(p.id) : ""}
        <span class="t">${esc(p.title)}</span>${p.subtitle ? `<span class="sub">${esc(p.subtitle)}</span>` : ""}</a></li>`,
    )
    .join("");
}

function credits(rules) {
  return `<footer class="credits">
    <p><span class="ruling">Highlighted like this</span> is an official ruling from Dane (the rules designer’s team), not part of the Living Rules Reference.</p>
    <p>Rules text from <a href="${esc(rules.source.repo)}" target="_blank" rel="noopener">tirules-search</a> (${esc(rules.source.commit)}),
      a fork of <a href="https://github.com/dangothemango/tirules" target="_blank" rel="noopener">dangothemango/tirules</a> by dangothemango and BradleyΣ.
      <i>Twilight Imperium</i> is © Fantasy Flight Games. This site isn’t affiliated with them.</p>
  </footer>`;
}

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
  let out = a > (cq.mode === "phrase" ? 0 : match.s) ? "…" : "";
  let pos = a;
  for (const [s, e] of match.ranges) {
    if (e <= a || s >= b) continue;
    out += clean(text.slice(pos, Math.max(s, a))) + "<mark>" + clean(text.slice(Math.max(s, a), Math.min(e, b))) + "</mark>";
    pos = Math.min(e, b);
  }
  out += clean(text.slice(pos, b));
  if (b < (cq.mode === "phrase" ? text.length : match.e)) out += "…";
  return out.trim();
}

function placeLabel(page, pos) {
  const { section, anchor } = placeAt(page, pos);
  const num = anchor && /^\d/.test(anchor.id) ? anchor.id : "";
  const sec = section && !/^Rules Reference$/i.test(section) ? section : "";
  return { num, sec };
}

function renderResults(view, rules, q, mode) {
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
  const otherMode =
    cq.mode === "phrase" && compileQuery(q, "words")?.terms.length > 1
      ? `<a class="link" href="${esc(searchUrl(q, "words"))}">Search for the words separately instead</a>`
      : cq.mode !== "phrase" && !mode
        ? ""
        : cq.mode !== "phrase"
          ? `<a class="link" href="${esc(searchUrl(q))}">Back to exact phrase</a>`
          : "";

  const snippet = (r, i) => {
    const m = r.matches[i];
    const label = placeLabel(r.page, m.ranges[0][0]);
    const where = label.num || label.sec
      ? `<span class="where">${label.num ? `<span class="wn">${esc(label.num)}</span>` : ""}${label.sec ? `<span class="ws">${esc(label.sec)}</span>` : ""}</span>`
      : "";
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
  const count = plural(n, unit === "paragraph" ? "matching paragraph" : unit, unit === "paragraph" ? "matching paragraphs" : units);
  if (page.kind === "Rules") return count;
  return `${esc(kindLabel(page))}, ${count}`;
};

const kindLabel = (page) =>
  page.kind === "Rules"
    ? "Rules Reference"
    : page.kind === "Factions"
      ? "Faction notes"
      : page.subtitle
        ? `Card notes for ${page.subtitle}`
        : "Card notes";

// ── Page ──────────────────────────────────────────────────────────────────

function renderPage(view, rules, page, { q, mode, m, anchor, restoreScroll }) {
  remember("recentPages", page.id, MAX_RECENT_PAGES);
  state.page = page;

  // The faction symbol sits outside .rbody: that is the only part the search
  // index and the highlighter walk, and the slot is empty anyway.
  const isFaction = page.kind === "Factions";
  view.innerHTML = `
    <article class="rpage${isFaction ? " has-fsym" : ""}">
      ${isFaction ? symbolSlot(page.id, "fsym-page") : ""}
      <div class="rtools">
        <span class="spacer"></span>
        <button class="icon-btn" data-act="smaller" aria-label="Smaller text" title="Smaller text">A−</button>
        <button class="icon-btn" data-act="larger" aria-label="Larger text" title="Larger text">A+</button>
      </div>
      <div class="rbody"></div>
      ${credits(rules)}
    </article>`;
  const body = $(".rbody", view);
  body.innerHTML = page.html;
  void hydrateSymbols(view);
  // Attribute, not text: the big number must stay out of the indexed text.
  if (page.number) $(":scope > header", body)?.setAttribute("data-num", page.number);

  // Cross-links in tirules look like "/R_movement", "R_movement" or "C_units".
  for (const a of $$("a[href]", body)) {
    if (a.classList.contains("pn")) continue;
    const href = a.getAttribute("href");
    const link = href.match(/^\/?([RFC]_\w+)\/?(?:\.php)?(#.*)?$/);
    if (link) a.setAttribute("href", `/rules/${link[1]}${link[2] ?? ""}`);
    else if (/^https?:/.test(href)) Object.assign(a, { target: "_blank", rel: "noopener" });
  }

  const cq = q && compileQuery(q, mode ?? "phrase");
  if (cq) {
    const matches = pageMatches(page, cq);
    state.marks = highlight(body, matches.map((x) => x.ranges));
    state.query = { q, mode: cq.mode };
  }

  if (state.marks.length) {
    $(".matchbar").hidden = false;
    setActiveMatch(Math.min(m, state.marks.length - 1), restoreScroll == null);
    if (restoreScroll != null) scrollTo(0, restoreScroll);
  } else if (anchor && document.getElementById(anchor)) {
    targetParagraph(document.getElementById(anchor), restoreScroll == null);
    if (restoreScroll != null) scrollTo(0, restoreScroll);
  } else {
    scrollTo(0, restoreScroll ?? 0);
  }
}

// Wraps each range in <mark>, splitting across element boundaries when a
// match spans e.g. "the <b>Move Ships</b> step". `groups` is one array of
// [start, end] ranges per match; returns the marks grouped the same way.
function highlight(root, groups) {
  const { nodes, starts } = textOf(root);
  const segs = groups
    .flatMap((ranges, g) => ranges.map(([s, e]) => [s, e, g]))
    .sort((a, b) => a[0] - b[0]);
  const marks = groups.map(() => []);
  let k = 0;
  nodes.forEach((node, i) => {
    const ns = starts[i],
      ne = ns + node.nodeValue.length;
    while (k < segs.length && segs[k][1] <= ns) k++;
    const here = [];
    for (let j = k; j < segs.length && segs[j][0] < ne; j++)
      here.push([Math.max(segs[j][0], ns) - ns, Math.min(segs[j][1], ne) - ns, segs[j][2]]);
    if (!here.length) return;
    const v = node.nodeValue,
      frag = document.createDocumentFragment();
    let last = 0;
    for (const [s, e, g] of here) {
      if (s < last) continue; // overlapping ranges: keep the first
      if (s > last) frag.append(v.slice(last, s));
      const mark = document.createElement("mark");
      mark.textContent = v.slice(s, e);
      marks[g].push(mark);
      frag.append(mark);
      last = e;
    }
    if (last < v.length) frag.append(v.slice(last));
    node.replaceWith(frag);
  });
  return marks;
}

function setActiveMatch(i, scroll = true) {
  const { marks } = state;
  if (!marks.length) return;
  i = (i + marks.length) % marks.length;
  for (const el of marks[state.active] ?? []) el.classList.remove("current");
  $$(".hit-block").forEach((el) => el.classList.remove("hit-block"));
  state.active = i;
  for (const el of marks[i]) el.classList.add("current");
  if (state.query?.mode !== "phrase") marks[i][0]?.closest("li, p")?.classList.add("hit-block");

  $(".matchcount").innerHTML = `<b>${i + 1}</b> of ${marks.length} for “${esc(state.query?.q ?? "")}”`;
  const url = new URL(location.href);
  url.searchParams.set("m", String(i));
  url.hash = "";
  setUrl(url.href);
  if (scroll) marks[i][0]?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function clearHighlights() {
  if (!state.page) return;
  const y = scrollY;
  navigate(pageUrl(state.page.id), { replace: true });
  requestAnimationFrame(() => scrollTo(0, y));
}

function targetParagraph(li, scroll) {
  $$(".rbody .target").forEach((el) => el.classList.remove("target"));
  li.classList.add("target");
  if (scroll) li.scrollIntoView({ block: "center" });
}

function paragraphLabel(li, id) {
  if (/^\d/.test(id)) return `Rule ${id}`;
  let el = li.closest("ol.note") ?? li;
  while (el && el.nodeName !== "H2") el = el.previousElementSibling;
  const section = el ? textOf(el).text.trim() : "Notes";
  const num = li.querySelector(":scope > .pn")?.textContent ?? "";
  return `${section}, note ${num}`;
}

function shareParagraph(a) {
  const li = a.parentElement;
  const id = a.dataset.anchor;
  const url = new URL(pageUrl(state.page.id, { anchor: id }), location.origin).href;
  setUrl(url);
  targetParagraph(li, false);
  const label = paragraphLabel(li, id);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Long-press the address bar instead.");
    }
  };
  const actions = [["Copy link", copy]];
  if (navigator.share) actions.push(["Share", () => navigator.share({ title: label, url }).catch(() => {})]);
  toast(label, actions);
}

// ── Suggestions ───────────────────────────────────────────────────────────

let suggestions = [],
  suggestIndex = -1;

function hideSuggest(shell = document) {
  const box = $(".suggest", shell);
  if (box) box.hidden = true;
  $("#rq", shell)?.setAttribute("aria-expanded", "false");
  suggestions = [];
  suggestIndex = -1;
}

function suggestionUrl(s) {
  return pageUrl(s.page.id, { anchor: s.id });
}

function renderSuggest() {
  const box = $(".suggest");
  if (!suggestions.length) return hideSuggest();
  box.hidden = false;
  $("#rq").setAttribute("aria-expanded", "true");
  box.innerHTML =
    suggestions
      .map(
        (s, i) => `<a class="suggestion${i === suggestIndex ? " active" : ""}" role="option" id="sg${i}"
          aria-selected="${i === suggestIndex}" href="${esc(suggestionUrl(s))}">
          <span class="t">${s.label ? `${esc(s.label)} <span class="muted">in ${esc(s.page.title)}</span>` : esc(s.page.title)}</span>
          <span class="muted k">${esc(kindLabel(s.page))}</span></a>`,
      )
      .join("") + `<p class="suggest-hint">Enter searches the full text</p>`;
}

// ── Events ────────────────────────────────────────────────────────────────

function runSearch(q) {
  q = q.trim();
  if (!q) return;
  remember("recentSearches", q, MAX_RECENT_SEARCHES, (a, b) => a.toLowerCase() === b.toLowerCase());
  const rules = state.rules;
  // A bare rule number goes straight to that paragraph.
  if (rules && isRuleNumber(q)) {
    const [hit] = suggest(rules, q);
    if (hit) return navigate(suggestionUrl(hit));
  }
  navigate(searchUrl(q));
  $("#rq").blur();
}

function wire(shell) {
  const input = $("#rq", shell);
  const form = $(".rsearch", shell);

  input.addEventListener("input", async () => {
    const rules = state.rules ?? (await loadRules());
    suggestions = suggest(rules, input.value);
    suggestIndex = -1;
    renderSuggest();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$(".suggest").hidden) hideSuggest();
      else input.blur();
      return;
    }
    if ($(".suggest").hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = suggestions.length + 1; // +1 for "no selection" (full-text search)
      suggestIndex = ((suggestIndex + 1 + (e.key === "ArrowDown" ? 1 : -1) + n) % n) - 1;
      input.setAttribute("aria-activedescendant", suggestIndex >= 0 ? `sg${suggestIndex}` : "");
      renderSuggest();
    }
  });

  input.addEventListener("blur", () =>
    setTimeout(() => !document.activeElement?.closest?.(".suggest") && hideSuggest(), 150),
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pick = suggestions[suggestIndex];
    hideSuggest();
    if (pick) {
      navigate(suggestionUrl(pick));
      input.blur();
    } else runSearch(input.value);
  });

  shell.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;

    // Enter in the form fires a synthetic click on the submit button; only
    // explicit data-act buttons are handled here.
    if (t.classList.contains("pn")) {
      e.preventDefault();
      return shareParagraph(t);
    }
    if (t.dataset.try) {
      input.value = t.dataset.try;
      return runSearch(t.dataset.try);
    }
    if (t.dataset.tab) {
      store.set("browseTab", t.dataset.tab);
      for (const b of $$("[data-tab]", shell)) b.setAttribute("aria-selected", String(b === t));
      const list = $(".index", shell);
      list.dataset.kind = t.dataset.tab;
      list.innerHTML = browseItems(state.rules, t.dataset.tab);
      void hydrateSymbols(list);
      return;
    }
    if (t.classList.contains("suggestion")) hideSuggest();

    switch (t.dataset.act) {
      case "back":
        return back("/rules");
      case "smaller":
      case "larger": {
        const i = store.get("fontStep", 2) + (t.dataset.act === "larger" ? 1 : -1);
        store.set("fontStep", Math.max(0, Math.min(FONT_STEPS.length - 1, i)));
        return applyFontSize();
      }
      case "prev-match":
        return setActiveMatch(state.active - 1);
      case "next-match":
        return setActiveMatch(state.active + 1);
      case "clear-match":
        return clearHighlights();
      case "clear-recent":
        store.set("recentSearches", []);
        return t.closest("section")?.remove();
      case "more":
        t.previousElementSibling.hidden = false;
        return t.remove();
    }
  });

  // Page-wide keys while the rules are showing.
  document.addEventListener("keydown", (e) => {
    if (!document.contains(shell) || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.nodeName);
    if (typing) return;
    if (e.key === "/") {
      e.preventDefault();
      input.focus();
      input.select();
    } else if ((e.key === "n" || e.key === "N") && state.marks.length) {
      e.preventDefault();
      setActiveMatch(state.active + (e.shiftKey ? -1 : 1));
    }
  });
}

