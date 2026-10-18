// Local dev server for public/. No dependencies.
// Usage: node scripts/serve.mjs [port]   (default 8787)
//
// Behaves like Cloudflare Pages for a site without a 404.html: real files are
// served as-is, and any other path gets index.html so the client router can
// handle /rules/R_movement and friends.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const PORT = Number(process.argv[2] ?? 8787);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

// The "/*" headers from public/_headers (the CSP and friends), so CSP
// violations show up here and not first in production.
async function siteHeaders() {
  const text = await readFile(join(ROOT, "_headers"), "utf8").catch(() => "");
  const out = {};
  let inAll = false;
  for (const line of text.split("\n")) {
    if (/^\S/.test(line)) inAll = line.trim() === "/*";
    else if (inAll && line.includes(":")) {
      const i = line.indexOf(":");
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  delete out["Strict-Transport-Security"]; // not over plain http
  return out;
}
const HEADERS = await siteHeaders();

async function fileFor(urlPath) {
  const path = join(ROOT, decodeURIComponent(urlPath));
  if (!path.startsWith(ROOT)) return null;
  try {
    const s = await stat(path);
    if (s.isFile()) return path;
    if (s.isDirectory()) {
      const index = join(path, "index.html");
      if ((await stat(index).catch(() => null))?.isFile()) return index;
    }
  } catch {}
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  // No Functions here. Say so in JSON instead of handing the API the app shell.
  if (pathname.startsWith("/api/")) {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "The games API isn't running on this dev server. Use npm run dev." }));
    return;
  }
  // Missing assets should 404, not silently get the app shell.
  const looksLikeAsset = /\.\w+$/.test(pathname);
  if (pathname === "/_headers") {
    res.writeHead(404).end("Not found"); // Pages doesn't serve it either
    return;
  }
  const path =
    (await fileFor(pathname)) ?? (looksLikeAsset ? null : join(ROOT, "index.html"));
  if (!path) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, {
    ...HEADERS,
    "Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(await readFile(path));
}).listen(PORT, () => console.log(`Serving public/ at http://localhost:${PORT}`));
