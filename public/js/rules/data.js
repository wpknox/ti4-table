// Rules data: loading, paragraph numbering, the search index, and search.
//
// rules.json holds each page's HTML as written in tirules-search. On load we
// parse every page once, give each numbered paragraph a real link (58.3a,
// "guild-ships-2"), and index the text. Rendering uses that same annotated
// HTML, so offsets computed here line up with the DOM on screen: that's what
// makes "tap snippet N" land on highlight N.

import { normChars } from "../lib.js";

// ── Text ──────────────────────────────────────────────────────────────────

// Injected paragraph-number links. Their text is not part of the page text,
// so searching "58" doesn't hit every paragraph of rule 58.
const PN = "pn";

// Concatenates a page's text nodes, skipping paragraph numbers. Both the
// search index and the highlighter use this, so match N in results is
// match N on the page. Any change here applies to both.
export function textOf(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentNode.nodeName === "STYLE" || n.parentNode.classList?.contains(PN)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = [],
    starts = [];
  let text = "";
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
    starts.push(text.length);
    text += walker.currentNode.nodeValue;
  }
  return { text, nodes, starts };
}

export function findMatches(text, re) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

// ── Paragraph numbers ─────────────────────────────────────────────────────

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
const romanLower = (n) => (ROMAN[n] ?? String(n)).toLowerCase();
const alpha = (n) => String.fromCharCode(96 + n);
const greek = (n) => "αβγδεζηθικλμνξοπρστυφχψω"[n - 1] ?? String(n);

const slug = (s) =>
  normChars(s)
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function numberLink(li, id, label) {
  li.id = id;
  const a = document.createElement("a");
  a.className = PN;
  a.href = `#${id}`;
  a.dataset.anchor = id;
  a.textContent = label;
  li.prepend(a);
}

// LRR paragraphs: 58.3, then 58.3a / 58.3i for sub-lists.
function numberLrr(root, num, startAt, numbered) {
  for (const lrr of root.querySelectorAll("ol.lrr")) numberLrrList(lrr, num, startAt, numbered);
}

function numberLrrList(lrr, num, startAt, numbered) {
  let n = startAt,
    top = null,
    sub = 0,
    lastOl = null;
  for (const li of lrr.querySelectorAll(":scope > li, :scope > h2 > li, :scope > ol > li")) {
    const parent = li.parentElement;
    if (parent === lrr || parent.nodeName === "H2") {
      n++;
      top = num ? `${num}.${n}` : String(n);
      numberLink(li, top, top);
      numbered.push({ li, id: top, label: top });
    } else if (top) {
      if (parent !== lastOl) (lastOl = parent), (sub = 0);
      sub++;
      const id = top + (parent.classList.contains("roman") ? romanLower(sub) : alpha(sub));
      numberLink(li, id, id.slice(top.length));
      numbered.push({ li, id, label: id });
    }
  }
}

// Notes restart their roman numerals under each section heading.
function numberNotes(root, numbered) {
  let section = "notes",
    count = 0,
    parentId = null,
    lastOl = null,
    sub = 0;
  const used = new Set();
  for (const el of root.querySelectorAll("article > h2, ol.note > li, ol.note > ol > li")) {
    if (el.nodeName === "H2") {
      section = slug(el.textContent) || "notes";
      count = 0;
      continue;
    }
    if (el.parentElement.classList.contains("note")) {
      count++;
      let id = `${section}-${count}`;
      while (used.has(id)) id += "x";
      used.add(id);
      parentId = id;
      numberLink(el, id, ROMAN[count] ?? String(count));
      numbered.push({ li: el, id, label: ROMAN[count] ?? String(count) });
    } else if (parentId) {
      if (el.parentElement !== lastOl) (lastOl = el.parentElement), (sub = 0);
      sub++;
      const id = `${parentId}-${sub}`;
      numberLink(el, id, greek(sub));
      numbered.push({ li: el, id, label: greek(sub) });
    }
  }
}

// Turns the CSS counters tirules uses (".lrr > li:before { content: '58.' … }")
// into real numbered links, then drops the page's <style> tags so they can't
// leak onto the rest of the site.
function annotate(root, page) {
  const num = page.html.match(/content:\s*'(\d+)\.'\s*counter\(item/)?.[1] ?? null;
  const startAt = Number(page.html.match(/\.lrr\s*\{\s*counter-reset:\s*item\s+(\d+)/)?.[1] ?? 0);
  page.number = num;
  const numbered = [];
  numberLrr(root, num, startAt, numbered);
  numberNotes(root, numbered);

  for (const s of root.querySelectorAll("style")) s.remove();
  return numbered;
}

// ── Loading & indexing ────────────────────────────────────────────────────

const BLOCKS = "li, p, h2, h1";

let rulesPromise = null;

export function loadRules() {
  rulesPromise ??= fetch("/data/rules.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(index)
    .catch((err) => {
      rulesPromise = null; // let the next attempt retry
      throw err;
    });
  return rulesPromise;
}

function index(data) {
  const tpl = document.createElement("template");
  data.byId = new Map();
  data.byNumber = new Map(); // "58" -> page, "58.3a" -> {page, id}

  for (const page of data.pages) {
    tpl.innerHTML = page.html;
    const root = tpl.content;
    const numbered = annotate(root, page);
    page.html = tpl.innerHTML;

    const { text, nodes, starts } = textOf(root);
    const startOf = new Map(nodes.map((n, i) => [n, starts[i]]));
    page.text = text;
    page.normText = normChars(text);
    page.normTitle = normChars(page.title).toLowerCase();

    // Offset of an element's first indexed text node.
    const firstAt = (el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (startOf.has(w.currentNode)) return startOf.get(w.currentNode);
      return null;
    };

    page.headings = [];
    for (const h of root.querySelectorAll("h2")) {
      const at = firstAt(h);
      const label = textOf(h).text.replace(/\s+/g, " ").trim();
      if (at != null && label) page.headings.push({ at, label });
    }

    page.anchors = numbered
      .map(({ li, id, label }) => ({ at: firstAt(li), id, label }))
      .filter((a) => a.at != null)
      .sort((a, b) => a.at - b.at);

    // Paragraph-sized blocks for word search. Each text node belongs to its
    // nearest block, so nested lists don't make a parent swallow its children.
    const blocks = new Map();
    nodes.forEach((n, i) => {
      const el = n.parentElement?.closest(BLOCKS);
      if (!el) return;
      const s = starts[i],
        e = s + n.nodeValue.length;
      const b = blocks.get(el);
      if (b) b.e = e;
      else blocks.set(el, { s, e });
    });
    page.blocks = [...blocks.values()]
      .filter((b) => page.text.slice(b.s, b.e).trim())
      .sort((a, b) => a.s - b.s);

    data.byId.set(page.id, page);
    if (page.number) data.byNumber.set(page.number, { page });
    for (const a of page.anchors)
      if (/^\d/.test(a.id)) data.byNumber.set(a.id, { page, id: a.id });
  }
  return data;
}

// The section (heading) and nearest numbered paragraph at a text offset.
export function placeAt(page, pos) {
  let section = "",
    anchor = null;
  for (const h of page.headings) {
    if (h.at > pos) break;
    section = h.label;
  }
  for (const a of page.anchors) {
    if (a.at > pos) break;
    anchor = a;
  }
  return { section, anchor };
}

// ── Queries ───────────────────────────────────────────────────────────────

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

// Words that carry no meaning in a rules question.
const STOP = new Set(
  `a about after again all also am an and any are as at be been before being
  but by can cant could did do does doesnt dont during each else for from get
  gets got had has have having he her here hers him his how i if in into is
  isnt it its just let me might more most must my need no nor not now of off
  on once only or other our out over own player players rule rules same
  should so some such than that the their them then there these they this
  those through to too under until up use used uses using very was we were
  what when where whether which while who whom why will with work works would
  you your yours`.split(/\s+/),
);

// Common table shorthand, expanded to the words the rules use.
const ALIASES = {
  afb: "anti-fighter barrage",
  ac: "action card",
  acs: "action card",
  pn: "promissory note",
  pns: "promissory note",
  tg: "trade good",
  tgs: "trade good",
  vp: "victory point",
  vps: "victory point",
  mr: "mecatol rex",
  rex: "mecatol rex",
  dn: "dreadnought",
  dns: "dreadnought",
  ws: "war sun",
  sc: "strategy card",
  cc: "command token",
  ccs: "command token",
};

// Light suffix stripping so "retreats", "retreating" and "retreat" all
// match. Terms then match as word prefixes, which covers the rest.
function stem(w) {
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3);
  if (/(ss|sh|ch|x)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 5) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  return w;
}

// Turns one word or alias into a regex source matching it as a word prefix.
function termPattern(word) {
  const phrase = ALIASES[word] ?? word;
  const parts = phrase.split(/\s+/);
  return parts
    .map((p, i) =>
      i === parts.length - 1
        ? String.raw`\b${escapeRe(stem(p))}[\w']*`
        : String.raw`\b${escapeRe(p)}`,
    )
    .join(String.raw`\s+`);
}

export function termsOf(q) {
  const words = normChars(q)
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/[^a-z0-9'\- ]+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, "").replaceAll("'", ""))
    .filter((w) => w.length > 1 && !STOP.has(w));
  const seen = new Set();
  return words.filter((w) => {
    const k = stem(ALIASES[w] ?? w);
    return !seen.has(k) && seen.add(k);
  });
}

function phraseRegex(q) {
  const words = normChars(q.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return new RegExp(words.map(escapeRe).join(String.raw`\s+`), "gi");
}

// mode "phrase": exact phrase, as typed.
// mode "words":  paragraphs containing every meaningful word.
// mode "some":   paragraphs containing all but one of them (fallback).
export function compileQuery(q, mode = "phrase") {
  if (mode === "phrase") {
    const re = phraseRegex(q);
    return re && { q, mode, re };
  }
  const terms = termsOf(q);
  if (!terms.length) return null;
  return {
    q,
    mode,
    terms,
    termRes: terms.map((t) => new RegExp(termPattern(t), "gi")),
    anyRe: new RegExp(terms.map(termPattern).join("|"), "gi"),
    need: mode === "some" ? Math.max(1, terms.length - 1) : terms.length,
  };
}

// Every match on one page, in document order. Each match is
// {s, e, ranges}: the region a snippet shows, and the text to highlight.
export function pageMatches(page, cq) {
  if (cq.mode === "phrase") {
    return findMatches(page.normText, cq.re).map(([s, e]) => ({ s, e, ranges: [[s, e]], hits: 1 }));
  }
  const out = [];
  for (const b of page.blocks) {
    const slice = page.normText.slice(b.s, b.e);
    const hit = cq.termRes.filter((re) => ((re.lastIndex = 0), re.test(slice))).length;
    if (hit < cq.need) continue;
    const ranges = findMatches(slice, cq.anyRe).map(([s, e]) => [s + b.s, e + b.s]);
    out.push({ s: b.s, e: b.e, ranges, hits: hit });
  }
  return out;
}

function rank(rules, cq) {
  const results = [];
  for (const page of rules.pages) {
    const matches = pageMatches(page, cq);
    if (!matches.length) continue;
    let score;
    if (cq.mode === "phrase") {
      const titleHit = page.normTitle.includes(normChars(cq.q.trim()).toLowerCase());
      score = (titleHit ? 1000 : 0) + matches.length;
    } else {
      const titleHits = cq.termRes.filter((re) => ((re.lastIndex = 0), re.test(page.normTitle))).length;
      const best = Math.max(...matches.map((m) => m.hits * 10 - (m.e - m.s) / 400));
      score = best + titleHits * 6 + Math.log2(1 + matches.length);
    }
    results.push({ page, matches, score });
  }
  return results.sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title));
}

// Exact phrase first. When the phrase isn't in the rules (typical for a
// question), fall back to paragraphs holding all of its words, then most.
export function search(rules, q, mode) {
  const modes = mode ? [mode] : ["phrase", "words", "some"];
  let last = null;
  for (const m of modes) {
    const cq = compileQuery(q, m);
    if (!cq) continue;
    if (m === "some" && cq.terms.length < 3) continue;
    const results = rank(rules, cq);
    last = { cq, results };
    if (results.length) return last;
  }
  return last ?? { cq: null, results: [] };
}

// ── Title & number suggestions ────────────────────────────────────────────

const NUMBER_RE = /^\s*(\d+)(?:\.(\d+)([a-z])?)?\s*$/i;

export function suggest(rules, q) {
  const n = q.match(NUMBER_RE);
  if (n) {
    const key = n[2] ? `${n[1]}.${n[2]}${(n[3] ?? "").toLowerCase()}` : n[1];
    const hit = rules.byNumber.get(key);
    if (!hit) return [];
    return [{ page: hit.page, id: hit.id, label: hit.id ? `Rule ${hit.id}` : `Rule ${key}` }];
  }
  const nq = normChars(q.trim()).toLowerCase();
  if (!nq) return [];
  const starts = (p) => p.normTitle.replace(/^[^a-z0-9]*(the )?/, "").startsWith(nq);
  return rules.pages
    .filter((p) => p.normTitle.includes(nq))
    .sort((a, b) => starts(b) - starts(a) || a.title.localeCompare(b.title))
    .slice(0, 6)
    .map((page) => ({ page }));
}

export const isRuleNumber = (q) => NUMBER_RE.test(q);
