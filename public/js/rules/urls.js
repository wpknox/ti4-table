// Rules URLs, shared by every rules module so none has to import the view.
//
// URLs:
//   /rules                               home
//   /rules/search?q=…[&mode=…]           results
//   /rules/R_movement[?q=…&mode=…&m=2][#58.3]
//                                        a page, optionally with match 2 of
//                                        the query highlighted, or scrolled
//                                        to paragraph 58.3

// ── URLs ──────────────────────────────────────────────────────────────────

export function pageUrl(id, { q, mode, m, anchor } = {}) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (q && mode && mode !== "phrase") p.set("mode", mode);
  if (q && m) p.set("m", String(m));
  return `/rules/${id}${p.size ? "?" + p : ""}${anchor ? "#" + encodeURIComponent(anchor) : ""}`;
}

export function searchUrl(q, mode) {
  const p = new URLSearchParams({ q });
  if (mode) p.set("mode", mode);
  return `/rules/search?${p}`;
}
