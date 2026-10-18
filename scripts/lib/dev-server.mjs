// Shared by scripts/check-api.mjs and scripts/check-ui.mjs: a private local D1
// plus `wrangler pages dev` on a chosen port. Node built-ins only.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

// ── Helpers ───
export const wrangler = (...args) => spawnSync("npx", ["wrangler", ...args], { encoding: "utf8" });

export function resetState(state) {
  rmSync(state, { recursive: true, force: true });
  const mig = wrangler("d1", "migrations", "apply", "ti4-table", "--local", "--persist-to", state);
  if (mig.status !== 0) throw new Error(`migrations failed:\n${mig.stdout}${mig.stderr}`);
}

export function makeInvite(state, name, role) {
  const res = spawnSync("node", ["scripts/invite.mjs", "--local", "--persist-to", state, name, role], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`invite.mjs failed for ${name}: ${res.stderr}`);
  return res.stdout.trim();
}

// ── Server ───
const running = new Set();
function stopAll() {
  for (const s of running) {
    try { process.kill(-s.pid, "SIGTERM"); } catch { /* already gone */ }
  }
  running.clear();
}
process.on("exit", stopAll);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopAll(); process.exit(130); });

// `args` are extra wrangler flags, e.g. ["--binding", "NAME=value"].
export async function startServer({ port, state, args = [] }) {
  const base = `http://localhost:${port}`;
  const server = spawn("npx", ["wrangler", "pages", "dev", "--port", String(port), "--persist-to", state, ...args],
    { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  running.add(server);
  const stop = () => {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already gone */ }
    running.delete(server);
  };
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/me`);
      if (res.ok) return { base, stop };
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`wrangler pages dev did not answer GET /api/me within 60 s.\n${log.slice(-1500)}`);
}
