// The Page section: one rules page, its match highlighting and paragraph links.

import { $, $$, esc, remember, toast } from "../lib.js";
import { navigate, setUrl } from "../router.js";
import { symbolSlot, hydrateSymbols } from "../factions.js";
import { compileQuery, pageMatches, textOf } from "./data.js";
import { pageUrl } from "./urls.js";

const MAX_RECENT_PAGES = 8;

// The page being shown and its highlights. One object so the match bar and
// the key handler in view.js can read and reset it.
export const state = { marks: [], active: -1, page: null, query: undefined };

export function credits(rules) {
  return `<footer class="credits">
    <p><span class="ruling">Highlighted like this</span> is an official ruling from Dane (the rules designer’s team), not part of the Living Rules Reference.</p>
    <p>Rules text from <a href="${esc(rules.source.repo)}" target="_blank" rel="noopener">tirules-search</a> (${esc(rules.source.commit)}),
      a fork of <a href="https://github.com/dangothemango/tirules" target="_blank" rel="noopener">dangothemango/tirules</a> by dangothemango and BradleyΣ.
      <i>Twilight Imperium</i> is © Fantasy Flight Games. This site isn’t affiliated with them.</p>
  </footer>`;
}

// ── Page ──────────────────────────────────────────────────────────────────

// Cross-links in tirules look like "/R_movement", "R_movement" or "C_units".
function rewriteLinks(body) {
  for (const a of $$("a[href]", body)) {
    if (a.classList.contains("pn")) continue;
    const href = a.getAttribute("href");
    const link = href.match(/^\/?([RFC]_\w+)\/?(?:\.php)?(#.*)?$/);
    if (link) a.setAttribute("href", `/rules/${link[1]}${link[2] ?? ""}`);
    else if (/^https?:/.test(href)) Object.assign(a, { target: "_blank", rel: "noopener" });
  }
}

export function renderPage(view, rules, page, { q, mode, m, anchor, restoreScroll }) {
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

  rewriteLinks(body);

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

export function setActiveMatch(i, scroll = true) {
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

export function clearHighlights() {
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

export function shareParagraph(a) {
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
