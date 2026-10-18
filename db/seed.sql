-- Local-only fake data for development and for checking public/js/games/stats.js.
-- Never apply this to the production database.
--
-- Hand count (finished games only; game 5 is soft-deleted and game 6 is planned, so neither counts):
--   Counted games: 6 (ids 1 to 4, 7 and 8). Deleted: 1 (id 5). Planned: 1 (id 6, players A, B and E, no factions).
--   Games 7 and 8 were logged from memory (see the end of this file): some points and factions are unknown.
--   Wins per player: Player A 2 (games 1, 3), Player B 2 (games 2, 8), Player C 2 (games 4, 7),
--                    Players D, E and F 0.
--   Games per player: A 6, B 4, C 5, D 3, E 4, F 5.
--   Games per faction: each of these is 1:
--     F_arborec F_hacan F_sol F_muaat F_xxcha F_yssaril F_mahact F_naalu F_keleres
--     F_firmament F_ul F_letnev F_jol_nar F_nekro F_saar F_winnu F_mentak F_yin F_creuss
--     F_vuilraith F_naaz_rokha F_ral_nel F_norr F_bastion F_deepwrought F_rebellion
--   (26 factions). Seats with no faction (game 7's Player D) count for no faction.
--   All other factions are 0, including the deleted game's F_empyrean, F_argent,
--   F_lizix and F_nomad.
--   Points known: Player A's known points are games 1 to 4 only (10, 9, 10, 8): average 9.25 over 4 scores.
--   Expansions: games 1, 3, 7 are PoK only, games 2 and 8 are PoK + Thunder's Edge, game 4 is base only.

INSERT INTO players (id, name, role) VALUES
  (1, 'Player A', 'none'), (2, 'Player B', 'none'), (3, 'Player C', 'none'),
  (4, 'Player D', 'none'), (5, 'Player E', 'none'), (6, 'Player F', 'none');

INSERT INTO games (id, client_id, played_on, points_to_win, pok, te, notes, created_by, updated_by, deleted_at) VALUES
  (1, 'seed-game-0001', '2026-09-06', 10, 1, 0, 'Six players, long game.', 1, 1, NULL),
  (2, 'seed-game-0002', '2026-09-20', 10, 1, 1, '', 2, 2, NULL),
  (3, 'seed-game-0003', '2026-10-04', 10, 1, 0, '', 1, 1, NULL),
  (4, 'seed-game-0004', '2026-10-04', 10, 0, 0, 'Base game only.', 3, 3, NULL),
  (5, 'seed-game-0005', '2026-10-11', 10, 1, 0, 'Logged by mistake.', 4, 4, '2026-10-12T09:00:00Z');

INSERT INTO seats (game_id, player_id, faction, color, seat_index, points, is_winner, is_speaker_start) VALUES
  (1, 1, 'F_arborec', 'green',  0, 10, 1, 1),
  (1, 2, 'F_hacan',   'yellow', 1, 8,  0, 0),
  (1, 3, 'F_sol',     'blue',   2, 7,  0, 0),
  (1, 4, 'F_muaat',   'red',    3, 6,  0, 0),
  (1, 5, 'F_xxcha',   'purple', 4, 5,  0, 0),
  (1, 6, 'F_yssaril', 'black',  5, 4,  0, 0),

  (2, 2, 'F_mahact',    'blue',   0, 10, 1, 1),
  (2, 1, 'F_naalu',     'yellow', 1, 9,  0, 0),
  (2, 3, 'F_keleres',   'green',  2, 6,  0, 0),
  (2, 5, 'F_firmament', 'red',    3, 5,  0, 0),
  (2, 6, 'F_ul',        'purple', 4, 4,  0, 0),

  (3, 1, 'F_letnev',  'black',  0, 10, 1, 1),
  (3, 4, 'F_jol_nar', 'blue',   1, 7,  0, 0),
  (3, 3, 'F_nekro',   'green',  2, 6,  0, 0),
  (3, 2, 'F_saar',    'orange', 3, 5,  0, 0),

  (4, 3, 'F_winnu',  'purple', 0, 10, 1, 1),
  (4, 1, 'F_mentak', 'orange', 1, 8,  0, 0),
  (4, 5, 'F_yin',    'yellow', 2, 7,  0, 0),
  (4, 6, 'F_creuss', 'green',  3, 3,  0, 0),

  (5, 4, 'F_empyrean', 'red',    0, 10, 1, 1),
  (5, 1, 'F_argent',   'yellow', 1, 9,  0, 0),
  (5, 2, 'F_lizix',    'blue',   2, 7,  0, 0),
  (5, 6, 'F_nomad',    'black',  3, 5,  0, 0);

-- Planned game: stats must ignore it (A, B and E would each gain a game if they counted it).
INSERT INTO games (id, client_id, status, played_on, points_to_win, pok, te, notes, created_by, updated_by) VALUES
  (6, 'seed-game-0006', 'planned', '2026-12-05', 10, 1, 0, 'Not played yet.', 1, 1);

INSERT INTO seats (game_id, player_id, faction, color, seat_index, points, is_winner, is_speaker_start) VALUES
  (6, 1, NULL, NULL, 0, 0, 0, 0),
  (6, 2, NULL, NULL, 1, 0, 0, 0),
  (6, 5, NULL, NULL, 2, 0, 0, 0);

-- Games logged from memory. Both finished, so stats count them.
-- Game 7: July 2024 (month precision), no points at all, seat 4 (Player D) has no faction.
--         Players A, C, D, F. Winner Player C.
-- Game 8: 2023 (year precision), points known for the winner (Player B, 10) and Player E (7) only.
--         Players B, E, F, A. Factions: F_norr, F_bastion, F_deepwrought, F_rebellion. Winner Player B.
INSERT INTO games (id, client_id, played_on, date_precision, from_memory, points_to_win, pok, te, notes, created_by, updated_by) VALUES
  (7, 'seed-game-0007', '2024-07-01', 'month', 1, 10, 1, 0, 'Remembered at the table.', 1, 1),
  (8, 'seed-game-0008', '2023-01-01', 'year', 1, 10, 1, 1, '', 2, 2);

INSERT INTO seats (game_id, player_id, faction, color, seat_index, points, is_winner, is_speaker_start) VALUES
  (7, 3, 'F_vuilraith', NULL, NULL, NULL, 1, 0),
  (7, 1, 'F_naaz_rokha', NULL, NULL, NULL, 0, 0),
  (7, 6, 'F_ral_nel', NULL, NULL, NULL, 0, 0),
  (7, 4, NULL, NULL, NULL, NULL, 0, 0),

  (8, 2, 'F_norr', NULL, NULL, 10, 1, 0),
  (8, 5, 'F_bastion', NULL, NULL, 7, 0, 0),
  (8, 6, 'F_deepwrought', NULL, NULL, NULL, 0, 0),
  (8, 1, 'F_rebellion', NULL, NULL, NULL, 0, 0);
