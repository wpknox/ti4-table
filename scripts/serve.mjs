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
  ".txt": "text/plain; charset=utf-8",
};

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
  // Missing assets should 404, not silently get the app shell.
  const looksLikeAsset = /\.\w+$/.test(pathname);
  const path =
    (await fileFor(pathname)) ?? (looksLikeAsset ? null : join(ROOT, "index.html"));
  if (!path) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(await readFile(path));
}).listen(PORT, () => console.log(`Serving public/ at http://localhost:${PORT}`));
