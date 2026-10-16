import { HttpError, json, readJson } from "./http.js";
import { requireRole } from "./auth.js";

// ── Names ───
function cleanName(value) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 40) throw new HttpError(400, "A name needs 1 to 40 characters.");
  return name;
}

const isUnique = (err) => /UNIQUE/i.test(String(err?.message));

// ── Routes ───
// Public: no roles or emails.
export async function listPlayers(ctx) {
  const { results } = await ctx.env.DB.prepare(
    "SELECT id, name, archived FROM players ORDER BY name COLLATE NOCASE"
  ).all();
  return json({ players: results.map((p) => ({ id: p.id, name: p.name, archived: !!p.archived })) });
}

export async function createPlayer(ctx) {
  requireRole(ctx, "editor");
  const name = cleanName((await readJson(ctx.request)).name);
  try {
    const res = await ctx.env.DB.prepare("INSERT INTO players (name) VALUES (?)").bind(name).run();
    return json({ id: res.meta.last_row_id }, 201);
  } catch (err) {
    if (isUnique(err)) throw new HttpError(409, "Someone with that name is already on the list.");
    throw err;
  }
}

export async function renamePlayer(ctx, id) {
  requireRole(ctx, "editor");
  const name = cleanName((await readJson(ctx.request)).name);
  const target = await ctx.env.DB.prepare("SELECT role FROM players WHERE id = ?").bind(id).first();
  if (!target) throw new HttpError(404, "No such player.");
  // Names credit wins, so editors may rename only themselves or roster-only guests.
  if (ctx.player.role !== "admin" && id !== ctx.player.id && target.role !== "none") {
    throw new HttpError(403, "You can only rename yourself or a guest.");
  }
  try {
    await ctx.env.DB.prepare("UPDATE players SET name = ? WHERE id = ?").bind(name, id).run();
  } catch (err) {
    if (isUnique(err)) throw new HttpError(409, "Someone with that name is already on the list.");
    throw err;
  }
  return json({ ok: true });
}
