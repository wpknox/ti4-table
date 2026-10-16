// Offline support: the app shell and rules are cached on install, then every
// same-origin GET is served from cache while a fresh copy is fetched in the
// background (stale-while-revalidate). So the site works offline, and a deploy
// shows up on the next load after the one that fetched it.
//
// Bump VERSION when the precache list changes. API calls are never cached.

const VERSION = "v5";
const CACHE = `ti4table-${VERSION}`;
const PRECACHE = [
  "/",
  "/index.html",
  "/css/base.css",
  "/css/rules.css",
  "/css/map.css",
  "/css/games.css",
  "/js/app.js",
  "/js/router.js",
  "/js/lib.js",
  "/js/factions.js",
  "/js/about.js",
  "/js/rules/data.js",
  "/js/rules/view.js",
  "/js/games/api.js",
  "/js/games/view.js",
  "/js/games/form.js",
  "/js/games/admin.js",
  "/js/games/stats.js",
  "/js/games/names.js",
  "/js/games/ui.js",
  "/js/map/view.js",
  "/js/map/svg.js",
  "/js/map/parse.js",
  "/js/map/analyze.js",
  "/data/rules.json",
  "/data/tiles.json",
  "/fonts/saira.woff2",
  "/fonts/atkinson.woff2",
  "/fonts/atkinson-italic.woff2",
  "/icons/icon.svg",
  "/manifest.webmanifest",
  "/img/space/deep-field.webp",
  ...[
    "arborec", "argent", "bastion", "creuss", "deepwrought", "empyrean", "firmament", "hacan", "jol_nar",
    "keleres", "letnev", "lizix", "mahact", "mentak", "muaat", "naalu", "naaz_rokha", "nekro", "nomad",
    "norr", "obsidian", "ral_nel", "rebellion", "saar", "sol", "ul", "vuilraith", "winnu", "xxcha", "yin", "yssaril",
  ].map((f) => `/img/factions/F_${f}.svg`),
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Every app route (/rules/R_movement…) is the same shell.
  const key = req.mode === "navigate" ? "/index.html" : req;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key, { ignoreSearch: req.mode === "navigate" });
      const fresh = fetch(req.mode === "navigate" ? "/index.html" : req)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached ?? Response.error());
      if (cached) {
        e.waitUntil(fresh);
        return cached;
      }
      return fresh;
    }),
  );
});
