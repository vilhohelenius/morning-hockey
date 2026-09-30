-- Local-only seed data for `wrangler pages dev`, not applied to real D1.
-- A slice of one division plus a handful of games/stats for TOR, to prove
-- the /joukkueet/:abbrev route renders a non-Chicago team end to end.

INSERT INTO standings_rows (abbrev, as_of_date, name, logo, conference, division, division_rank, wildcard_rank, qualified, games_played, wins, losses, ot_losses, points, goal_differential, updated_at) VALUES
('TOR', '2026-09-30', 'Maple Leafs', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'Eastern', 'Atlantic', 1, 0, 1, 6, 5, 1, 0, 10, 9, '2026-09-30T12:00:00Z'),
('BOS', '2026-09-30', 'Bruins', 'https://assets.nhle.com/logos/nhl/svg/BOS_light.svg', 'Eastern', 'Atlantic', 2, 0, 1, 6, 4, 2, 0, 8, 4, '2026-09-30T12:00:00Z'),
('TBL', '2026-09-30', 'Lightning', 'https://assets.nhle.com/logos/nhl/svg/TBL_light.svg', 'Eastern', 'Atlantic', 3, 0, 1, 6, 3, 3, 0, 6, 1, '2026-09-30T12:00:00Z'),
('FLA', '2026-09-30', 'Panthers', 'https://assets.nhle.com/logos/nhl/svg/FLA_light.svg', 'Eastern', 'Atlantic', 4, 1, 1, 6, 3, 3, 0, 6, -2, '2026-09-30T12:00:00Z'),
('MTL', '2026-09-30', 'Canadiens', 'https://assets.nhle.com/logos/nhl/svg/MTL_light.svg', 'Eastern', 'Atlantic', 5, 2, 0, 6, 1, 4, 1, 3, -6, '2026-09-30T12:00:00Z');

INSERT INTO games (game_id, date, start_time_utc, away_abbrev, away_name, away_logo, away_score, home_abbrev, home_name, home_logo, home_score, game_state, is_finished, updated_at) VALUES
(1001, '2026-09-27', '2026-09-27T23:00:00Z', 'TOR', 'Maple Leafs', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 4, 'BOS', 'Bruins', 'https://assets.nhle.com/logos/nhl/svg/BOS_light.svg', 2, 'OFF', 1, '2026-09-28T01:00:00Z'),
(1002, '2026-09-25', '2026-09-25T23:30:00Z', 'MTL', 'Canadiens', 'https://assets.nhle.com/logos/nhl/svg/MTL_light.svg', 1, 'TOR', 'Maple Leafs', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 5, 'OFF', 1, '2026-09-26T02:00:00Z'),
(1003, '2026-10-02', '2026-10-03T00:00:00Z', 'TOR', 'Maple Leafs', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 0, 'TBL', 'Lightning', 'https://assets.nhle.com/logos/nhl/svg/TBL_light.svg', 0, 'FUT', 0, '2026-09-30T12:00:00Z');

INSERT INTO skater_season_stats (player_id, season_id, name, team_abbrev, logo, headshot, nationality, position, games_played, goals, assists, points, updated_at) VALUES
(8479318, 20262027, 'Auston Matthews', 'TOR', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8479318.png', 'USA', 'C', 6, 7, 4, 11, '2026-09-30T12:00:00Z'),
(8478483, 20262027, 'Mitch Marner', 'TOR', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8478483.png', 'CAN', 'R', 6, 3, 8, 11, '2026-09-30T12:00:00Z');

INSERT INTO goalie_season_stats (player_id, season_id, name, team_abbrev, logo, headshot, nationality, games_played, wins, losses, ot_losses, goals_against_average, save_pct, shutouts, updated_at) VALUES
(8480313, 20262027, 'Joseph Woll', 'TOR', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8480313.png', 'USA', 4, 3, 1, 0, 2.31, 0.918, 1, '2026-09-30T12:00:00Z');
