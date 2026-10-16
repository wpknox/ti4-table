// A tiny client-side router over the History API. Real URLs (/rules/R_movement)
// so links can be shared and the phone's back gesture works. Each section
// registers a prefix and a render function.

const sections = [];
let renderSeq = 0;

// render(url, main, ctx) may be async. ctx.restoring is true on back/forward.
export function addSection({ prefix, label, render, nav = true }) {
  sections.push({ prefix, label, render, nav });
}

export function navigate(href, { replace = false } = {}) {
  const url = new URL(href, location.href);
  if (url.href === location.href && !replace) return;
  saveScroll();
  const depth = (history.state?.depth ?? 0) + (replace ? 0 : 1);
  history[replace ? "replaceState" : "pushState"]({ depth }, "", url);
  void render(false);
}

// In-app Back. A home-screen web app has no browser back button, and the
// first page opened has nothing to go back to, so fall back to `home`.
export function back(home) {
  if ((history.state?.depth ?? 0) > 0) history.back();
  else navigate(home, { replace: true });
}

// Updates the URL without re-rendering, e.g. stepping through matches.
export function setUrl(href) {
  history.replaceState({ ...history.state }, "", new URL(href, location.href));
}

function saveScroll() {
  history.replaceState({ ...history.state, scroll: scrollY }, "");
}

function sectionFor(pathname) {
  return sections.find((s) => pathname === s.prefix || pathname.startsWith(s.prefix + "/"));
}

function renderNav(active) {
  const nav = document.querySelector(".sections");
  const items = sections.filter((s) => s.nav);
  // One section isn't navigation yet; the brand link covers it.
  nav.innerHTML =
    items.length < 2
      ? ""
      : items
          .map(
            (s) =>
              `<a href="${s.prefix}"${s === active ? ' aria-current="page"' : ""}>${s.label}</a>`,
          )
          .join("");
}

async function render(restoring) {
  const seq = ++renderSeq;
  const url = new URL(location.href);
  const main = document.getElementById("main");

  if (url.pathname === "/") {
    // The rules are the whole site for now; the home hub comes with more sections.
    history.replaceState(history.state, "", "/rules");
    return render(restoring);
  }

  const section = sectionFor(url.pathname);
  renderNav(section);
  if (!section) {
    document.title = "Not found · TI4 Table";
    main.innerHTML = `<div class="notfound"><h1>Nothing at ${url.pathname.replace(/[<>&"]/g, "")}</h1><p><a href="/rules">Go to the rules</a></p></div>`;
    return;
  }

  const ctx = {
    restoring,
    scroll: history.state?.scroll,
    stale: () => seq !== renderSeq, // a newer navigation started
  };
  try {
    await section.render(url, main, ctx);
  } catch (err) {
    if (ctx.stale()) return;
    console.error(err);
    // textContent, so this still works if an HTML helper is what broke.
    const p = document.createElement("p");
    p.className = "error page-error";
    p.textContent = `Something went wrong showing this page: ${err?.message ?? err}`;
    main.replaceChildren(p);
  }
}

export function start() {
  history.scrollRestoration = "manual";
  addEventListener("popstate", () => void render(true));
  addEventListener("pagehide", saveScroll);

  // Same-origin links go through the router unless the user wants a new tab.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // in-page anchor
    e.preventDefault();
    navigate(url.href);
  });

  void render(false);
}
