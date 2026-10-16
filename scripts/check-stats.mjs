// Runs public/js/games/stats.js over the live games in db/seed.sql and compares
// with the hand count in that file's header.  node scripts/check-stats.mjs
import { readFileSync } from "node:fs";
import * as S from "../public/js/games/stats.js";

const sql = readFileSync(new URL("../db/seed.sql", import.meta.url), "utf8");
const tuples = (table) => {
  const m = sql.match(new RegExp(`INSERT INTO ${table} \\([^)]*\\) VALUES([\\s\\S]*?);`));
  // Values are 'quoted strings' (may contain commas) or bare numbers/NULL.
  return [...m[1].matchAll(/\(((?:'[^']*'|[^()'])*)\)/g)].map((t) =>
    [...t[1].matchAll(/'([^']*)'|([^,\s][^,]*)/g)].map((v) => (v[1] ?? v[2]).trim()));
};
const players = new Map(tuples("players").map(([id, name]) => [+id, name]));
const gameRows = tuples("games"); // id, client, played_on, ptw, pok, te, notes, cb, ub, deleted_at
const live = gameRows.filter((r) => r[9] === "NULL");
const liveIds = new Set(live.map((r) => +r[0]));
const seatRows = tuples("seats").filter((r) => liveIds.has(+r[0]));
const games = live.map((r) => ({
  id: +r[0], played_on: r[2],
  seats: seatRows.filter((s) => +s[0] === +r[0]).map((s) => ({
    player_id: +s[1], player_name: players.get(+s[1]), faction: s[2], seat_index: +s[4],
    points: +s[5], is_winner: s[6] === "1",
  })),
}));

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${label}`);
};

eq("live games", games.length, 4);
const w = Object.fromEntries(S.winsByPlayer(games).map((p) => [p.name, [p.games, p.wins]]));
eq("games and wins per player", w, {
  "Player A": [4, 2], "Player B": [3, 1], "Player C": [4, 1],
  "Player D": [2, 0], "Player E": [3, 0], "Player F": [3, 0],
});
const f = S.byFaction(games);
eq("19 factions played", f.length, 19);
eq("each faction once", f.every((x) => x.games === 1), true);
eq("deleted game's factions absent",
  ["F_empyrean", "F_argent", "F_lizix", "F_nomad"].some((id) => f.some((x) => x.faction === id)), false);
eq("A's unplayed count", S.unplayedFactions(games, 1).length, 31 - 4);
eq("A average points", S.averagePoints(games, 1), (10 + 9 + 10 + 8) / 4);
eq("head to head A v B", S.headToHead(games, 1, 2),
  { together: 3, aAhead: 2, bAhead: 1, tied: 0, aWins: 2, bWins: 1 });
eq("seat effects gated below 20 games", S.seatEffects(games).enough, false);
console.log(fails ? `${fails} failed` : "All stats match the hand count.");
process.exit(fails ? 1 : 0);
