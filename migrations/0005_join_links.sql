-- A join link lets friends with no account claim a guest seat in one game.
-- Only a hash of the code is stored, like invites.
CREATE TABLE join_links (
  code_hash   TEXT PRIMARY KEY,
  game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  created_by  INTEGER NOT NULL REFERENCES players(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX join_links_game ON join_links(game_id);
