-- Games logged from memory: the date may be only a month or a year, and a seat's points may be unknown.
ALTER TABLE games ADD COLUMN from_memory INTEGER NOT NULL DEFAULT 0 CHECK (from_memory IN (0,1));
ALTER TABLE games ADD COLUMN date_precision TEXT NOT NULL DEFAULT 'day' CHECK (date_precision IN ('day','month','year'));

-- seats.points becomes nullable (NULL = not remembered).
-- SQLite can't drop NOT NULL, so rebuild the table.
CREATE TABLE seats_new (
  game_id          INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id        INTEGER NOT NULL REFERENCES players(id),
  faction          TEXT,
  color            TEXT,
  seat_index       INTEGER CHECK (seat_index BETWEEN 0 AND 7),
  points           INTEGER CHECK (points BETWEEN 0 AND 30),
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
