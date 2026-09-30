-- Local-only seed data for `wrangler pages dev`, not applied to real D1.
-- A slice of one division plus a handful of games/stats for TOR, to prove
-- the /joukkueet/:abbrev route renders a non-Chicago team end to end.

-- Eastern/Atlantic: TOR/BOS/TBL top 3, FLA/MTL/OTT fill out the wildcard
-- pool. Eastern/Metropolitan, Western/Central, Western/Pacific added below
-- so both conferences have their full 2-division shape -- playoffit.ts
-- needs at least 2 divisions per conference and 2+ wildcard candidates to
-- build a round-1 bracket at all.
INSERT INTO standings_rows (abbrev, as_of_date, name, logo, conference, division, division_rank, wildcard_rank, qualified, games_played, wins, losses, ot_losses, points, goal_differential, updated_at) VALUES
('TOR', '2026-09-30', 'Maple Leafs', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'Eastern', 'Atlantic', 1, 0, 1, 7, 7, 0, 0, 14, 9, '2026-09-30T12:00:00Z'),
('BOS', '2026-09-30', 'Bruins', 'https://assets.nhle.com/logos/nhl/svg/BOS_light.svg', 'Eastern', 'Atlantic', 2, 0, 1, 7, 6, 1, 0, 12, 4, '2026-09-30T12:00:00Z'),
('TBL', '2026-09-30', 'Lightning', 'https://assets.nhle.com/logos/nhl/svg/TBL_light.svg', 'Eastern', 'Atlantic', 3, 0, 1, 7, 5, 2, 0, 10, 1, '2026-09-30T12:00:00Z'),
('FLA', '2026-09-30', 'Panthers', 'https://assets.nhle.com/logos/nhl/svg/FLA_light.svg', 'Eastern', 'Atlantic', 4, 1, 1, 7, 4, 3, 0, 9, -2, '2026-09-30T12:00:00Z'),
('MTL', '2026-09-30', 'Canadiens', 'https://assets.nhle.com/logos/nhl/svg/MTL_light.svg', 'Eastern', 'Atlantic', 5, 3, 0, 7, 2, 4, 1, 5, -6, '2026-09-30T12:00:00Z'),
('OTT', '2026-09-30', 'Senators', 'https://assets.nhle.com/logos/nhl/svg/OTT_light.svg', 'Eastern', 'Atlantic', 6, 4, 0, 7, 1, 5, 1, 3, -7, '2026-09-30T12:00:00Z'),
('CAR', '2026-09-30', 'Hurricanes', 'https://assets.nhle.com/logos/nhl/svg/CAR_light.svg', 'Eastern', 'Metropolitan', 1, 0, 1, 7, 6, 1, 0, 13, 8, '2026-09-30T12:00:00Z'),
('NYR', '2026-09-30', 'Rangers', 'https://assets.nhle.com/logos/nhl/svg/NYR_light.svg', 'Eastern', 'Metropolitan', 2, 0, 1, 7, 5, 2, 0, 11, 5, '2026-09-30T12:00:00Z'),
('NJD', '2026-09-30', 'Devils', 'https://assets.nhle.com/logos/nhl/svg/NJD_light.svg', 'Eastern', 'Metropolitan', 3, 0, 1, 7, 4, 3, 0, 8, 2, '2026-09-30T12:00:00Z'),
('PIT', '2026-09-30', 'Penguins', 'https://assets.nhle.com/logos/nhl/svg/PIT_light.svg', 'Eastern', 'Metropolitan', 4, 2, 1, 7, 3, 4, 0, 7, -1, '2026-09-30T12:00:00Z'),
('WSH', '2026-09-30', 'Capitals', 'https://assets.nhle.com/logos/nhl/svg/WSH_light.svg', 'Eastern', 'Metropolitan', 5, 5, 0, 7, 1, 6, 0, 2, -8, '2026-09-30T12:00:00Z'),
('COL', '2026-09-30', 'Avalanche', 'https://assets.nhle.com/logos/nhl/svg/COL_light.svg', 'Western', 'Central', 1, 0, 1, 7, 7, 0, 0, 14, 8, '2026-09-30T12:00:00Z'),
('DAL', '2026-09-30', 'Stars', 'https://assets.nhle.com/logos/nhl/svg/DAL_light.svg', 'Western', 'Central', 2, 0, 1, 7, 6, 1, 0, 12, 3, '2026-09-30T12:00:00Z'),
('WPG', '2026-09-30', 'Jets', 'https://assets.nhle.com/logos/nhl/svg/WPG_light.svg', 'Western', 'Central', 3, 0, 1, 7, 5, 2, 0, 10, 2, '2026-09-30T12:00:00Z'),
('MIN', '2026-09-30', 'Wild', 'https://assets.nhle.com/logos/nhl/svg/MIN_light.svg', 'Western', 'Central', 4, 1, 1, 7, 4, 3, 0, 8, -1, '2026-09-30T12:00:00Z'),
('NSH', '2026-09-30', 'Predators', 'https://assets.nhle.com/logos/nhl/svg/NSH_light.svg', 'Western', 'Central', 5, 3, 0, 7, 1, 5, 1, 3, -6, '2026-09-30T12:00:00Z'),
('VGK', '2026-09-30', 'Golden Knights', 'https://assets.nhle.com/logos/nhl/svg/VGK_light.svg', 'Western', 'Pacific', 1, 0, 1, 7, 6, 1, 0, 13, 7, '2026-09-30T12:00:00Z'),
('EDM', '2026-09-30', 'Oilers', 'https://assets.nhle.com/logos/nhl/svg/EDM_light.svg', 'Western', 'Pacific', 2, 0, 1, 7, 5, 2, 0, 11, 4, '2026-09-30T12:00:00Z'),
('LAK', '2026-09-30', 'Kings', 'https://assets.nhle.com/logos/nhl/svg/LAK_light.svg', 'Western', 'Pacific', 3, 0, 1, 7, 4, 3, 0, 9, 1, '2026-09-30T12:00:00Z'),
('CGY', '2026-09-30', 'Flames', 'https://assets.nhle.com/logos/nhl/svg/CGY_light.svg', 'Western', 'Pacific', 4, 2, 1, 7, 3, 4, 0, 6, -3, '2026-09-30T12:00:00Z'),
('SEA', '2026-09-30', 'Kraken', 'https://assets.nhle.com/logos/nhl/svg/SEA_light.svg', 'Western', 'Pacific', 5, 4, 0, 7, 1, 6, 0, 2, -9, '2026-09-30T12:00:00Z');

INSERT INTO games (game_id, date, start_time_utc, away_abbrev, away_name, away_logo, away_score, home_abbrev, home_name, home_logo, home_score, game_state, is_finished, updated_at) VALUES
(1001, '2026-09-27', '2026-09-27T23:00:00Z', 'TOR', 'Maple Leafs', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 4, 'BOS', 'Bruins', 'https://assets.nhle.com/logos/nhl/svg/BOS_light.svg', 2, 'OFF', 1, '2026-09-28T01:00:00Z'),
(1002, '2026-09-25', '2026-09-25T23:30:00Z', 'MTL', 'Canadiens', 'https://assets.nhle.com/logos/nhl/svg/MTL_light.svg', 1, 'TOR', 'Maple Leafs', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 5, 'OFF', 1, '2026-09-26T02:00:00Z'),
(1003, '2026-10-02', '2026-10-03T00:00:00Z', 'TOR', 'Maple Leafs', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 0, 'TBL', 'Lightning', 'https://assets.nhle.com/logos/nhl/svg/TBL_light.svg', 0, 'FUT', 0, '2026-09-30T12:00:00Z'),
-- Primetime test cases (Finland is UTC+3 in early October): 1004 lands at
-- 19:00 Helsinki (in window), 1005 at 15:00 Helsinki (outside, excluded),
-- 1006 at 00:15 Helsinki the *next* calendar day (in window, exercises the
-- past-midnight edge of starts_in_window).
(1004, '2026-10-01', '2026-10-01T16:00:00Z', 'CAR', 'Hurricanes', 'https://assets.nhle.com/logos/nhl/svg/CAR_light.svg', 0, 'NYR', 'Rangers', 'https://assets.nhle.com/logos/nhl/svg/NYR_light.svg', 0, 'FUT', 0, '2026-09-30T12:00:00Z'),
(1005, '2026-10-01', '2026-10-01T12:00:00Z', 'COL', 'Avalanche', 'https://assets.nhle.com/logos/nhl/svg/COL_light.svg', 0, 'VGK', 'Golden Knights', 'https://assets.nhle.com/logos/nhl/svg/VGK_light.svg', 0, 'FUT', 0, '2026-09-30T12:00:00Z'),
(1006, '2026-10-02', '2026-10-01T21:15:00Z', 'EDM', 'Oilers', 'https://assets.nhle.com/logos/nhl/svg/EDM_light.svg', 0, 'DAL', 'Stars', 'https://assets.nhle.com/logos/nhl/svg/DAL_light.svg', 0, 'FUT', 0, '2026-09-30T12:00:00Z');

INSERT INTO skater_season_stats (player_id, season_id, name, team_abbrev, logo, headshot, nationality, position, games_played, goals, assists, points, updated_at) VALUES
(8479318, 20262027, 'Auston Matthews', 'TOR', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8479318.png', 'USA', 'C', 6, 7, 4, 11, '2026-09-30T12:00:00Z'),
(8478483, 20262027, 'Mitch Marner', 'TOR', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8478483.png', 'CAN', 'R', 6, 3, 8, 11, '2026-09-30T12:00:00Z'),
(8478851, 20262027, 'Morgan Rielly', 'TOR', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8478851.png', 'CAN', 'D', 6, 1, 5, 6, '2026-09-30T12:00:00Z'),
(8481535, 20262027, 'Sebastian Aho', 'BOS', 'https://assets.nhle.com/logos/nhl/svg/BOS_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/BOS/8481535.png', 'FIN', 'C', 6, 4, 5, 9, '2026-09-30T12:00:00Z');

INSERT INTO goalie_season_stats (player_id, season_id, name, team_abbrev, logo, headshot, nationality, games_played, wins, losses, ot_losses, goals_against_average, save_pct, shutouts, updated_at) VALUES
(8480313, 20262027, 'Joseph Woll', 'TOR', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8480313.png', 'USA', 4, 3, 1, 0, 2.31, 0.918, 1, '2026-09-30T12:00:00Z');

INSERT INTO rookie_season_stats (player_id, season_id, name, team_abbrev, logo, headshot, nationality, position, games_played, goals, assists, points, updated_at) VALUES
(8484145, 20262027, 'Easton Cowan', 'TOR', 'https://assets.nhle.com/logos/nhl/svg/TOR_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8484145.png', 'CAN', 'L', 6, 2, 3, 5, '2026-09-30T12:00:00Z');

INSERT INTO finnish_skater_stats (player_id, season_id, name, team_abbrev, logo, headshot, position, games_played, goals, assists, points, updated_at) VALUES
(8481554, 20262027, 'Kaapo Kakko', 'NYR', 'https://assets.nhle.com/logos/nhl/svg/NYR_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/NYR/8481554.png', 'R', 6, 3, 2, 5, '2026-09-30T12:00:00Z');

INSERT INTO finnish_goalie_stats (player_id, season_id, name, team_abbrev, logo, headshot, games_played, wins, losses, ot_losses, goals_against_average, save_pct, shutouts, updated_at) VALUES
(8479193, 20262027, 'Kevin Lankinen', 'FLA', 'https://assets.nhle.com/logos/nhl/svg/FLA_light.svg', 'https://assets.nhle.com/mugs/nhl/20262027/FLA/8479193.png', 5, 4, 1, 0, 2.05, 0.927, 1, '2026-09-30T12:00:00Z');
