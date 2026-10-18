-- Fetches of TI Assistant games, per player, for the hourly limit on
-- GET /api/ti-assistant/:gameId. Rows older than an hour are pruned on each call.
CREATE TABLE ti_fetches (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  at        TEXT NOT NULL
);
CREATE INDEX ti_fetches_player ON ti_fetches(player_id, at);
