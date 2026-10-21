// Pure checks for the TI Assistant parser and the name matching, on made-up fixtures.
//   node scripts/check-ti-assistant.mjs
import { trimTiGame, applyArchiveScores, tiGameId, logStart } from "../public/js/games/ti-assistant.js";
import { matchPlayer, factionId } from "../public/js/games/match.js";
import { LIVE_GAME, ARCHIVED_EXPORT, ARCHIVE_PAGE, ARCHIVED_ID, ARCHIVED_START } from "./fixtures/ti-assistant.mjs";

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  const why = ok || !detail ? "" : `  -> ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${why}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Live game: data.factions ───
const live = trimTiGame(LIVE_GAME);
check("Live game: date is the earliest log entry (UTC)", live.played_on === "2026-04-11", live.played_on);
check("Live game: points to win 12, PoK on, TE off", live.points_to_win === 12 && live.pok && !live.te);
check("Live game: map string is trimmed", live.map_string === "20 30 40 50 60 70", live.map_string);
check("Live game: four seats in array order", same(live.seats.map((s) => s.seat_index), [0, 1, 2, 3]));
check("Live game: names are trimmed", live.seats[2].name === "Player 3");
check("Live game: known factions map to our ids, unknown to null",
  same(live.seats.map((s) => s.faction), ["F_hacan", "F_sol", "F_norr", null]), JSON.stringify(live.seats.map((s) => s.faction)));
check("Live game: Magenta becomes pink, an unknown color becomes null",
  same(live.seats.map((s) => s.color), ["red", "blue", "pink", null]));
check("Live game: speaker from data.speaker because the log has card picks", live.speaker_index === 2, live.speaker_index);
check("Live game: no points and no winner", live.seats.every((s) => s.points === null && !s.is_winner) && live.scores_from_archive === false);
check("Live game: nothing from the action log is returned", !JSON.stringify(live).includes("Make Up Objective"));

const noPicks = structuredClone(LIVE_GAME);
noPicks.actionLog = noPicks.actionLog.filter((e) => e.data.action !== "ASSIGN_STRATEGY_CARD");
check("Live game: data.speaker is ignored when the log has no card picks", trimTiGame(noPicks).speaker_index === null);

// ── Archived export: ADVANCE_PHASE snapshots ───
const arch = trimTiGame(ARCHIVED_EXPORT);
check("Archived export: six seats from the snapshots", arch.seats.length === 6 && same(arch.seats.map((s) => s.seat_index), [0, 1, 2, 3, 4, 5]));
check("Archived export: all six factions match", arch.seats.every((s) => s.faction), JSON.stringify(arch.seats.map((s) => s.faction)));
check("Archived export: speaker from the earliest snapshot, not a later one", arch.seats[arch.speaker_index]?.faction_name === "Ral Nel Consortium", arch.speaker_index);
check("Archived export: empty map string is null, TE and PoK on", arch.map_string === null && arch.te && arch.pok);
check("Archived export: start is the earliest timestamp", logStart(ARCHIVED_EXPORT) === ARCHIVED_START);
check("Archived export: date is the start day, not the end day", arch.played_on === "2026-04-11", arch.played_on);

// ── Archive scores ───
const entry = ARCHIVE_PAGE[ARCHIVED_ID];
const scored = applyArchiveScores(arch, entry);
check("Scores: points come from the archive entry", same(scored.seats.slice(0, 5).map((s) => s.points), [10, 8, 8, 7, 7]));
check("Scores: a points value over 30 is dropped", scored.seats[5].points === null);
check("Scores: exactly one winner, the named faction", scored.seats.filter((s) => s.is_winner).length === 1 && scored.seats[0].is_winner);
check("Scores: scores_from_archive is true", scored.scores_from_archive === true);
check("Scores: the input is not changed", arch.scores_from_archive === false && arch.seats[0].points === null);
check("Scores: a winner naming no seated faction sets nobody",
  applyArchiveScores(arch, { ...entry, winner: "Nobody" }).seats.every((s) => !s.is_winner));
check("Scores: no entry leaves the game as it was", applyArchiveScores(arch, null) === arch);

// ── Bad input ───
check("A non-object gives null", trimTiGame(null) === null && trimTiGame("x") === null && trimTiGame([]) === null);
check("No data gives null", trimTiGame({ actionLog: [] }) === null);
check("No log timestamps gives null", trimTiGame({ data: LIVE_GAME.data, actionLog: [] }) === null);
check("No seats gives null", trimTiGame({ data: { factions: [], options: {} }, actionLog: LIVE_GAME.actionLog }) === null);
const wild = structuredClone(LIVE_GAME);
wild.data.options = { "victory-points": 99, "map-string": "x".repeat(2001), expansions: "POK" };
wild.data.factions = Array.from({ length: 12 }, (_, i) => ({ id: `Faction ${i}`, color: 5, playerName: "n".repeat(100) }));
const w = trimTiGame(wild);
check("Wild input: VP clamped to 20, long map dropped, expansions not an array ignored",
  w.points_to_win === 20 && w.map_string === null && !w.pok);
check("Wild input: seats capped at 8, names at 40, bad color null, index past 7 not used",
  w.seats.length === 8 && w.seats.every((s) => s.name.length === 40 && s.color === null) && w.seats[7].seat_index === 7);

// ── Link parsing ───
check("tiGameId: /en/game/<id>", tiGameId("https://ti-assistant.com/en/game/AbC123") === "AbC123");
check("tiGameId: /game/<id> with a query", tiGameId("https://ti-assistant.com/game/AbC123?x=1") === "AbC123");
check("tiGameId: /fr/archive/<id>", tiGameId("https://ti-assistant.com/fr/archive/AbC123") === "AbC123");
check("tiGameId: a bare id", tiGameId(" AbC123 ") === "AbC123");
check("tiGameId: no id in the link", tiGameId("https://ti-assistant.com/en/stats") === null && tiGameId("") === null);
check("tiGameId: an id with a bad character", tiGameId("https://ti-assistant.com/en/game/ab_cd") === null);

// ── Matching ───
const roster = [{ id: 1, name: "Player 1" }, { id: 2, name: "José Q" }, { id: 3, name: "Sam" }, { id: 4, name: "sam" }];
check("matchPlayer: ignores case and extra spaces", matchPlayer("  PLAYER   1 ", roster) === 1);
check("matchPlayer: ignores accents", matchPlayer("Jose Q", roster) === 2);
check("matchPlayer: no fuzzy matching", matchPlayer("Player", roster) === null && matchPlayer("Player 12", roster) === null);
check("matchPlayer: empty name or ambiguous roster gives null", matchPlayer("", roster) === null && matchPlayer("Sam", roster) === null);
check("factionId: TI Assistant spellings", factionId("Universities of Jol-Nar") === "F_jol_nar" && factionId("Council Keleres") === "F_keleres");

console.log(failures ? `${failures} check(s) failed` : "All checks passed");
process.exit(failures ? 1 : 0);
