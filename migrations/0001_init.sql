CREATE TABLE players (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role        TEXT NOT NULL DEFAULT 'none' CHECK (role IN ('none','editor','admin')),
  email       TEXT UNIQUE COLLATE NOCASE,
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE games (
  id               INTEGER PRIMARY KEY,
  client_id        TEXT NOT NULL UNIQUE,
  played_on        TEXT NOT NULL CHECK (played_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  points_to_win    INTEGER NOT NULL DEFAULT 10 CHECK (points_to_win BETWEEN 4 AND 20),
  pok              INTEGER NOT NULL DEFAULT 1 CHECK (pok IN (0,1)),
  te               INTEGER NOT NULL DEFAULT 0 CHECK (te IN (0,1)),
  map_string       TEXT,
  ti_assistant_url TEXT,
  notes            TEXT NOT NULL DEFAULT '',
  created_by       INTEGER NOT NULL REFERENCES players(id),
  updated_by       INTEGER NOT NULL REFERENCES players(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deleted_at       TEXT
);
CREATE INDEX games_played_on ON games(played_on DESC) WHERE deleted_at IS NULL;

CREATE TABLE seats (
  game_id          INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id        INTEGER NOT NULL REFERENCES players(id),
  faction          TEXT NOT NULL,
  color            TEXT,
  seat_index       INTEGER CHECK (seat_index BETWEEN 0 AND 7),
  points           INTEGER NOT NULL CHECK (points BETWEEN 0 AND 30),
  is_winner        INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0,1)),
  is_speaker_start INTEGER NOT NULL DEFAULT 0 CHECK (is_speaker_start IN (0,1)),
  PRIMARY KEY (game_id, player_id),
  UNIQUE (game_id, faction),
  UNIQUE (game_id, seat_index)
);
CREATE UNIQUE INDEX seats_one_winner  ON seats(game_id) WHERE is_winner = 1;
CREATE UNIQUE INDEX seats_one_speaker ON seats(game_id) WHERE is_speaker_start = 1;
CREATE INDEX seats_player  ON seats(player_id);
CREATE INDEX seats_faction ON seats(faction);

CREATE TABLE game_revisions (
  id         INTEGER PRIMARY KEY,
  game_id    INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  edited_by  INTEGER NOT NULL REFERENCES players(id),
  edited_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at   TEXT NOT NULL,
  user_agent   TEXT
);
CREATE INDEX sessions_player ON sessions(player_id);

CREATE TABLE invites (
  code_hash   TEXT PRIMARY KEY,
  player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  role        TEXT CHECK (role IN ('editor','admin')),
  created_by  INTEGER REFERENCES players(id),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

CREATE TABLE redeem_attempts (
  ip_hash      TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX redeem_attempts_ip ON redeem_attempts(ip_hash, attempted_at);
