// Make a sign-in code for a player (bootstrap or recovery).
//   node scripts/invite.mjs --local  "Name" [admin|editor]
//   node scripts/invite.mjs --remote "Name" [admin|editor]
// Optional: --persist-to <dir> (local state dir). The player is created if missing.
// Prints the code on stdout; everything else goes to stderr.
import { spawnSync } from "node:child_process";
import { newCode, formatCode, sha256Hex, nowIso } from "../server/auth.js";

// ── Arguments ───
const args = process.argv.slice(2);
let target = null, persist = null;
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--local" || args[i] === "--remote") target = args[i];
  else if (args[i] === "--persist-to") persist = args[++i];
  else rest.push(args[i]);
}
const [name, role = "editor"] = rest;
if (!target || !name || !["admin", "editor"].includes(role)) {
  console.error('Usage: node scripts/invite.mjs --local|--remote [--persist-to <dir>] "Name" [admin|editor]');
  process.exit(2);
}

// ── Insert ───
const q = (s) => `'${s.replace(/'/g, "''")}'`; // SQL string literal
const code = newCode();
const hash = await sha256Hex(code);
const expires = nowIso(Date.now() + 7 * 86400000);
const sql =
  `INSERT OR IGNORE INTO players (name) VALUES (${q(name)}); ` +
  `INSERT INTO invites (code_hash, player_id, role, expires_at) ` +
  `VALUES (${q(hash)}, (SELECT id FROM players WHERE name = ${q(name)}), ${q(role)}, ${q(expires)});`;

const cmd = ["wrangler", "d1", "execute", "ti4-table", target, ...(persist ? ["--persist-to", persist] : []), "--command", sql];
const res = spawnSync("npx", cmd, { stdio: ["ignore", "ignore", "inherit"] });
if (res.status !== 0) {
  console.error("wrangler failed; no code was made.");
  process.exit(res.status || 1);
}
console.error(`Code for ${name} (${role}), valid 7 days:`);
console.log(formatCode(code));
