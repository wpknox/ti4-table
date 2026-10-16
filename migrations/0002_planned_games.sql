-- Planned games: a game can be set up before it is played.
ALTER TABLE games ADD COLUMN status TEXT NOT NULL DEFAULT 'finished' CHECK (status IN ('planned','finished'));

-- seats.faction becomes nullable (a planned game may not have factions yet).
-- SQLite can't drop NOT NULL, so rebuild the table.
CREATE TABLE seats_new (
  game_id          INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id        INTEGER NOT NULL REFERENCES players(id),
  faction          TEXT,
  color            TEXT,
  seat_index       INTEGER CHECK (seat_index BETWEEN 0 AND 7),
  points           INTEGER NOT NULL CHECK (points BETWEEN 0 AND 30),
  is_winner        INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0,1)),
  is_speaker_start INTEGER NOT NULL DEFAULT 0 CHECK (is_speaker_start IN (0,1)),
  PRIMARY KEY (game_id, player_id),
  UNIQUE (game_id, faction),
  UNIQUE (game_id, seat_index)
);
INSERT INTO seats_new (game_id, player_id, faction, color, seat_index, points, is_winner, is_speaker_start)
  SELECT game_id, player_id, faction, color, seat_index, points, is_winner, is_speaker_start FROM seats;
DROP TABLE seats;
ALTER TABLE seats_new RENAME TO seats;
CREATE UNIQUE INDEX seats_one_winner  ON seats(game_id) WHERE is_winner = 1;
CREATE UNIQUE INDEX seats_one_speaker ON seats(game_id) WHERE is_speaker_start = 1;
CREATE INDEX seats_player  ON seats(player_id);
CREATE INDEX seats_faction ON seats(faction);

CREATE INDEX games_status ON games(status, played_on DESC) WHERE deleted_at IS NULL;
