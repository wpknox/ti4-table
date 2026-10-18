// Made-up TI Assistant data for check-ti-assistant.mjs and check-api.mjs. The shapes
// follow docs/research/ti-assistant.md; the ids, names and numbers are invented.
// Never put a real game id or a real player name in here.

const T0 = Date.UTC(2026, 3, 11, 23, 30); // 2026-04-11 23:30 UTC, so the game ends on the 12th
const entry = (offsetMin, action, event = {}) => ({
  timestampMillis: T0 + offsetMin * 60000, gameSeconds: offsetMin * 60, schema: "2.0.0",
  data: { action, event, gameTime: offsetMin * 60, timestamp: T0 + offsetMin * 60000 },
});

// ── A live game: data.factions is filled in ───
export const LIVE_ID = "AbC123";
export const LIVE_GAME = {
  data: {
    factions: [
      { id: "Emirates of Hacan", color: "Red", playerName: "Player 1" },
      { id: "Federation of Sol", color: "Blue", playerName: "Player 2" },
      { id: "Sardakk N'orr", color: "Magenta", playerName: "  Player 3  " },
      { id: "Savages of Nowhere", color: "Teal", playerName: "Player 4" },
    ],
    speaker: 2,
    options: {
      expansions: ["POK"], events: [], "game-variant": "normal", "map-style": "standard",
      "map-string": " 20 30 40 50 60 70 ", "victory-points": 12,
    },
  },
  timers: {},
  actionLog: [
    entry(120, "SCORE_OBJECTIVE", { faction: "Federation of Sol", objective: "Make Up Objective" }),
    entry(60, "ASSIGN_STRATEGY_CARD", { pickedBy: "Sardakk N'orr", card: "Leadership" }),
    entry(0, "ADVANCE_PHASE", {}),
  ],
};

// ── An archived export: data.factions is empty, seats come from ADVANCE_PHASE snapshots ───
export const ARCHIVED_ID = "XyZ789";
const snap = (round, phase, speaker) => ({
  factions: {
    "Universities of Jol-Nar": { id: "Universities of Jol-Nar", color: "Purple", mapPosition: 0, playerName: "Player 1", order: 1 },
    "Naaz-Rokha Alliance": { id: "Naaz-Rokha Alliance", color: "Green", mapPosition: 1, playerName: "Player 2", order: 2 },
    "Ghosts of Creuss": { id: "Ghosts of Creuss", color: "Orange", mapPosition: 2, playerName: "Player 3", order: 3 },
    "Ral Nel Consortium": { id: "Ral Nel Consortium", color: "Black", mapPosition: 3, playerName: "Player 4", order: 4 },
    "Crimson Rebellion": { id: "Crimson Rebellion", color: "Yellow", mapPosition: 4, playerName: "José Q", order: 5 },
    "Deepwrought Scholarate": { id: "Deepwrought Scholarate", color: "Red", mapPosition: 5, playerName: "Player 6", order: 6 },
  },
  state: { round, phase, speaker },
});
export const ARCHIVED_EXPORT = {
  data: {
    factions: [], speaker: 0,
    options: {
      expansions: ["POK", "CODEX ONE", "CODEX TWO", "THUNDERS EDGE"], events: [], "map-string": "", "victory-points": 10,
    },
  },
  timers: {},
  // Newest first, like the real thing: the SETUP snapshot is the last element.
  actionLog: [
    entry(900, "END_GAME"),
    entry(880, "SCORE_OBJECTIVE", { faction: "Crimson Rebellion", objective: "Make Up Objective" }),
    entry(600, "ADVANCE_PHASE", snap(3, "STRATEGY", "Ghosts of Creuss")),
    entry(300, "ADVANCE_PHASE", snap(2, "STRATEGY", "Naaz-Rokha Alliance")),
    entry(10, "ASSIGN_STRATEGY_CARD", { pickedBy: "Ral Nel Consortium", card: "Leadership" }),
    entry(0, "ADVANCE_PHASE", snap(1, "SETUP", "Ral Nel Consortium")),
  ],
};
export const ARCHIVED_START = T0;

// An archive-list page: our game plus two others (which must be dropped).
export const ARCHIVE_PAGE = {
  OtHer1: { victoryPoints: 10, winner: "Winnu", factions: { Winnu: { points: 10 }, Nomad: { points: 4 } }, timestampMillis: T0 + 5 },
  [ARCHIVED_ID]: {
    victoryPoints: 10, winner: "Universities of Jol-Nar", timestampMillis: T0,
    factions: {
      "Universities of Jol-Nar": { points: 10 }, "Naaz-Rokha Alliance": { points: 8 }, "Ghosts of Creuss": { points: 8 },
      "Ral Nel Consortium": { points: 7 }, "Crimson Rebellion": { points: 7 }, "Deepwrought Scholarate": { points: 99 },
    },
  },
  OtHer2: { victoryPoints: 10, winner: "Yin Brotherhood", factions: {}, timestampMillis: T0 - 5 },
};
