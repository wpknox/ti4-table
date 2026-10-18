// Runs public/js/games/stats.js over the live games in db/seed.sql and compares
// with the hand count in that file's header.  node scripts/check-stats.mjs
import { readFileSync } from "node:fs";
import * as S from "../public/js/games/stats.js";

const sql = readFileSync(new URL("../db/seed.sql", import.meta.url), "utf8");
// Every INSERT for a table, as objects keyed by column name (the games inserts differ in columns).
const rows = (table) => [...sql.matchAll(new RegExp(`INSERT INTO ${table} \\(([^)]*)\\) VALUES([\\s\\S]*?);`, "g"))].flatMap((m) => {
  const cols = m[1].split(",").map((c) => c.trim());
  // Values are 'quoted strings' (may contain commas) or bare numbers/NULL.
  return [...m[2].matchAll(/\(((?:'[^']*'|[^()'])*)\)/g)].map((t) => {
    const vals = [...t[1].matchAll(/'([^']*)'|([^,\s][^,]*)/g)].map((v) => (v[1] ?? v[2]).trim());
    return Object.fromEntries(cols.map((c, i) => [c, vals[i]]));
  });
});
const players = new Map(rows("players").map((r) => [+r.id, r.name]));
const live = rows("games").filter((r) => (r.deleted_at ?? "NULL") === "NULL" && (r.status ?? "finished") === "finished");
const liveIds = new Set(live.map((r) => +r.id));
const seatRows = rows("seats").filter((r) => liveIds.has(+r.game_id));
const num = (v) => (v === "NULL" ? null : +v);
const games = live.map((r) => ({
  id: +r.id, played_on: r.played_on, from_memory: r.from_memory === "1",
  seats: seatRows.filter((s) => +s.game_id === +r.id).map((s) => ({
    player_id: +s.player_id, player_name: players.get(+s.player_id), faction: s.faction === "NULL" ? null : s.faction,
    seat_index: num(s.seat_index), points: num(s.points), is_winner: s.is_winner === "1",
  })),
}));

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

eq("counted games", games.length, 6);
eq("games logged from memory", games.filter((g) => g.from_memory).length, 2);
const w = Object.fromEntries(S.winsByPlayer(games).map((p) => [p.name, [p.games, p.wins]]).sort(([a], [b]) => a.localeCompare(b)));
eq("games and wins per player", w, {
  "Player A": [6, 2], "Player B": [4, 2], "Player C": [5, 2],
  "Player D": [3, 0], "Player E": [4, 0], "Player F": [5, 0],
});
const f = S.byFaction(games);
eq("26 factions played (the unknown faction is skipped)", f.length, 26);
eq("each faction once", f.every((x) => x.games === 1), true);
eq("no null faction row", f.some((x) => !x.faction), false);
eq("deleted game's factions absent",
  ["F_empyrean", "F_argent", "F_lizix", "F_nomad"].some((id) => f.some((x) => x.faction === id)), false);
eq("A's unplayed count", S.unplayedFactions(games, 1).length, 31 - 6);
eq("A average points", S.averagePoints(games, 1), { avg: (10 + 9 + 10 + 8) / 4, n: 4 });
eq("D's average skips game 7's unknown", S.averagePoints(games, 4), { avg: (6 + 7) / 2, n: 2 });
eq("B's average counts all four known scores", S.averagePoints(games, 2), { avg: (8 + 10 + 5 + 10) / 4, n: 4 });
eq("head to head A v B", S.headToHead(games, 1, 2),
  { together: 4, aAhead: 2, bAhead: 1, tied: 0, unknown: 1, aWins: 2, bWins: 2 });
eq("head to head B v E (game 8 known for both)", S.headToHead(games, 2, 5).unknown, 0);
eq("head to head B v F (game 8: F unknown)", S.headToHead(games, 2, 6).unknown, 1);
eq("seat effects gated below 20 games", S.seatEffects(games).enough, false);
console.log(fails ? `${fails} failed` : "All stats match the hand count.");
process.exit(fails ? 1 : 0);
