// Pure stats over the `games` array from GET /api/games?full=1. No DOM, so
// scripts/check-stats.mjs can run it in Node. A game looks like
// { id, played_on, seats: [{ player_id, player_name, faction, points, is_winner, seat_index }] }.

import { FACTION_IDS } from "./names.js";

const rate = (wins, games) => (games ? wins / games : 0);

// Everyone who has sat at a table: games, wins, win rate.
export function winsByPlayer(games) {
  const by = new Map();
  for (const g of games)
    for (const s of g.seats) {
      const p = by.get(s.player_id) ?? { id: s.player_id, name: s.player_name, games: 0, wins: 0 };
      p.games++;
      if (s.is_winner) p.wins++;
      by.set(s.player_id, p);
    }
  return [...by.values()]
    .map((p) => ({ ...p, rate: rate(p.wins, p.games) }))
    .sort((a, b) => b.wins - a.wins || b.rate - a.rate || a.name.localeCompare(b.name));
}

// Every faction that has been played (optionally only by one player).
export function byFaction(games, playerId = null) {
  const by = new Map();
  for (const g of games)
    for (const s of g.seats) {
      if (playerId != null && s.player_id !== playerId) continue;
      const f = by.get(s.faction) ?? { faction: s.faction, games: 0, wins: 0 };
      f.games++;
      if (s.is_winner) f.wins++;
      by.set(s.faction, f);
    }
  return [...by.values()]
    .map((f) => ({ ...f, rate: rate(f.wins, f.games) }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.faction.localeCompare(b.faction));
}

// Faction ids this player has never played, in list order.
export function unplayedFactions(games, playerId, all = FACTION_IDS) {
  const seen = new Set(byFaction(games, playerId).map((f) => f.faction));
  return all.filter((f) => !seen.has(f));
}

// Games where both sat down. aAhead counts games a scored more than b.
export function headToHead(games, a, b) {
  const r = { together: 0, aAhead: 0, bAhead: 0, tied: 0, aWins: 0, bWins: 0 };
  for (const g of games) {
    const sa = g.seats.find((s) => s.player_id === a);
    const sb = g.seats.find((s) => s.player_id === b);
    if (!sa || !sb) continue;
    r.together++;
    if (sa.points > sb.points) r.aAhead++;
    else if (sb.points > sa.points) r.bAhead++;
    else r.tied++;
    if (sa.is_winner) r.aWins++;
    if (sb.is_winner) r.bWins++;
  }
  return r;
}

// Mean final score, or null if the player has no games.
export function averagePoints(games, playerId) {
  let n = 0, sum = 0;
  for (const g of games)
    for (const s of g.seats)
      if (s.player_id === playerId) { n++; sum += s.points; }
  return n ? sum / n : null;
}

export const SEAT_EFFECTS_MIN = 20;

// By seat position (seat_index + 1): games, wins, average points. Needs
// SEAT_EFFECTS_MIN games with positions recorded, else `enough` is false.
export function seatEffects(games) {
  const usable = games.filter((g) => g.seats.some((s) => s.seat_index != null));
  const by = new Map();
  for (const g of usable)
    for (const s of g.seats) {
      if (s.seat_index == null) continue;
      const e = by.get(s.seat_index) ?? { seat: s.seat_index + 1, games: 0, wins: 0, points: 0 };
      e.games++;
      e.points += s.points;
      if (s.is_winner) e.wins++;
      by.set(s.seat_index, e);
    }
  const rows = [...by.values()]
    .sort((a, b) => a.seat - b.seat)
    .map((e) => ({ seat: e.seat, games: e.games, wins: e.wins, rate: rate(e.wins, e.games), avgPoints: e.points / e.games }));
  return { enough: usable.length >= SEAT_EFFECTS_MIN, games: usable.length, rows };
}
