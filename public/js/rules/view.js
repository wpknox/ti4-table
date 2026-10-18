// The Rules section: home (recent + browse), search results, and rule pages.
//
// URLs:
//   /rules                               home
//   /rules/search?q=…[&mode=…]           results
//   /rules/R_movement[?q=…&mode=…&m=2][#58.3]
//                                        a page, optionally with match 2 of
//                                        the query highlighted, or scrolled
//                                        to paragraph 58.3

import { $, $$, esc, store, remember } from "../lib.js";
import { navigate, back } from "../router.js";
import { symbolSlot, hydrateSymbols } from "../factions.js";
import { loadRules, suggest, isRuleNumber } from "./data.js";
import { pageUrl, searchUrl } from "./urls.js";
import { renderResults } from "./results.js";
import { state, credits, renderPage, setActiveMatch, clearHighlights, shareParagraph } from "./page.js";
import { sg, hideSuggest, renderSuggest, suggestionUrl } from "./suggest.js";

const MAX_RECENT_SEARCHES = 12;
const FONT_STEPS = [0.9375, 1, 1.0625, 1.1875, 1.3125, 1.5, 1.75];

const KIND_TABS = [
  { kind: "Rules", label: "Rules" },
  { kind: "Factions", label: "Factions" },
  { kind: "Components", label: "Cards" },
];

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

// The loaded rules, kept between renders.
const loaded = { rules: null };

// Where to scroll on arrival: back where the person was if they pressed back, else the top.
const restoredTop = (ctx) => (ctx.restoring ? (ctx.scroll ?? 0) : 0);

function showLoadError(view, err) {
  view.innerHTML = "";
  const p = document.createElement("p");
  p.className = "error";
  p.textContent = `Couldn't load the rules. Check your connection and reload. (${err.message})`;
  view.append(p);
}

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
    if (!loaded.rules) view.innerHTML = `<p class="muted loading">Loading rules…</p>`;
    rules = loaded.rules = await loadRules();
  } catch (err) {
    if (!ctx.stale()) showLoadError(view, err);
    return;
  }
  if (ctx.stale()) return;

  const q = url.searchParams.get("q") ?? "";
  const mode = url.searchParams.get("mode") ?? undefined;

  if (rest === "") {
    document.title = "Rules · TI4 Table";
    input.value = "";
    renderHome(view, rules);
    scrollTo(0, restoredTop(ctx));
  } else if (rest === "search") {
    document.title = `“${q}” · Rules · TI4 Table`;
    input.value = q;
    renderResults(view, rules, q, mode);
    scrollTo(0, restoredTop(ctx));
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

// The rule number (Rules) or faction symbol (Factions) that leads each browse row.
function browseLead(kind, p) {
  if (kind === "Rules") return `<span class="n">${p.number ?? "—"}</span>`;
  return kind === "Factions" ? symbolSlot(p.id) : "";
}

const browseSub = (p) => (p.subtitle ? `<span class="sub">${esc(p.subtitle)}</span>` : "");

function browseItems(rules, kind) {
  let pages = rules.pages.filter((p) => p.kind === kind);
  if (kind === "Rules")
    pages = pages.sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999) || a.title.localeCompare(b.title));
  return pages
    .map(
      (p) => `<li><a href="${pageUrl(p.id)}">
        ${browseLead(kind, p)}
        <span class="t">${esc(p.title)}</span>${browseSub(p)}</a></li>`,
    )
    .join("");
}

// ── Events ────────────────────────────────────────────────────────────────

function runSearch(q) {
  q = q.trim();
  if (!q) return;
  remember("recentSearches", q, MAX_RECENT_SEARCHES, (a, b) => a.toLowerCase() === b.toLowerCase());
  const rules = loaded.rules;
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
    const rules = loaded.rules ?? (await loadRules());
    sg.items = suggest(rules, input.value);
    sg.index = -1;
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
      const n = sg.items.length + 1; // +1 for "no selection" (full-text search)
      sg.index = ((sg.index + 1 + (e.key === "ArrowDown" ? 1 : -1) + n) % n) - 1;
      input.setAttribute("aria-activedescendant", sg.index >= 0 ? `sg${sg.index}` : "");
      renderSuggest();
    }
  });

  input.addEventListener("blur", () =>
    setTimeout(() => !document.activeElement?.closest?.(".suggest") && hideSuggest(), 150),
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pick = sg.items[sg.index];
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
      list.innerHTML = browseItems(loaded.rules, t.dataset.tab);
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

