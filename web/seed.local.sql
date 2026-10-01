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
('SEA', '2026-09-30', 'Kraken', 'https://assets.nhle.com/logos/nhl/svg/SEA_light.svg', 'Western', 'Pacific', 5, 4, 0, 7, 1, 6, 0, 2, -9, '2026-09-30T12:00:00Z'),
-- CHI: the dashboard's hardcoded team teaser (main.py's TEAM_ABBREVS).
-- Not in either bracket conference above -- doesn't need to be, the
-- teaser only reads standings_rows + games, not the bracket.
('CHI', '2026-09-30', 'Blackhawks', 'https://assets.nhle.com/logos/nhl/svg/CHI_light.svg', 'Western', 'Central', 6, 0, 0, 7, 2, 5, 0, 4, -8, '2026-09-30T12:00:00Z');

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
(1006, '2026-10-02', '2026-10-01T21:15:00Z', 'EDM', 'Oilers', 'https://assets.nhle.com/logos/nhl/svg/EDM_light.svg', 0, 'DAL', 'Stars', 'https://assets.nhle.com/logos/nhl/svg/DAL_light.svg', 0, 'FUT', 0, '2026-09-30T12:00:00Z'),
-- CHI games, for the dashboard team teaser's recent/upcoming panel.
(1007, '2026-09-28', '2026-09-29T00:00:00Z', 'CHI', 'Blackhawks', 'https://assets.nhle.com/logos/nhl/svg/CHI_light.svg', 2, 'MIN', 'Wild', 'https://assets.nhle.com/logos/nhl/svg/MIN_light.svg', 5, 'OFF', 1, '2026-09-29T02:30:00Z'),
(1008, '2026-10-03', '2026-10-04T01:00:00Z', 'CHI', 'Blackhawks', 'https://assets.nhle.com/logos/nhl/svg/CHI_light.svg', 0, 'NSH', 'Predators', 'https://assets.nhle.com/logos/nhl/svg/NSH_light.svg', 0, 'FUT', 0, '2026-09-30T12:00:00Z');

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

-- Dashboard digest: one night, two games -- 2001 has a Finnish scorer and
-- goalie (tests the finn-stats block + the OT tag), 2002 has neither
-- (tests the game card's bare-scoreline path with no finn-stats div).
INSERT INTO digests (date, generated_at) VALUES ('2026-09-29', '2026-09-30T06:00:00Z');

INSERT INTO games (game_id, date, start_time_utc, away_abbrev, away_name, away_logo, away_score, home_abbrev, home_name, home_logo, home_score, game_state, is_finished, updated_at) VALUES
(2001, '2026-09-29', '2026-09-29T00:00:00Z', 'CAR', 'Hurricanes', 'https://assets.nhle.com/logos/nhl/svg/CAR_light.svg', 3, 'NYR', 'Rangers', 'https://assets.nhle.com/logos/nhl/svg/NYR_light.svg', 2, 'OFF', 1, '2026-09-29T03:00:00Z'),
(2002, '2026-09-29', '2026-09-29T00:00:00Z', 'VGK', 'Golden Knights', 'https://assets.nhle.com/logos/nhl/svg/VGK_light.svg', 4, 'LAK', 'Kings', 'https://assets.nhle.com/logos/nhl/svg/LAK_light.svg', 1, 'OFF', 1, '2026-09-29T03:00:00Z');

INSERT INTO digest_games (game_id, digest_date, away_abbrev, away_name, away_logo, away_score, home_abbrev, home_name, home_logo, home_score, final_type, updated_at) VALUES
(2001, '2026-09-29', 'CAR', 'Hurricanes', 'https://assets.nhle.com/logos/nhl/svg/CAR_light.svg', 3, 'NYR', 'Rangers', 'https://assets.nhle.com/logos/nhl/svg/NYR_light.svg', 2, 'OT', '2026-09-30T06:00:00Z'),
(2002, '2026-09-29', 'VGK', 'Golden Knights', 'https://assets.nhle.com/logos/nhl/svg/VGK_light.svg', 4, 'LAK', 'Kings', 'https://assets.nhle.com/logos/nhl/svg/LAK_light.svg', 1, 'REG', '2026-09-30T06:00:00Z');

INSERT INTO digest_scorers (game_id, name, team_abbrev, goals, assists) VALUES
(2001, 'Sebastian Aho', 'CAR', 2, 1);

INSERT INTO digest_goalies (game_id, name, team_abbrev, decision, saves, shots_against, save_pct, toi) VALUES
(2001, 'Juuse Saros', 'CAR', 'W', 28, 30, 0.933, '60:00');

-- Phase 5 game report cache test cases:
--   1002 (MTL @ TOR, finished) -- cached game_box_scores row below, tests
--     the cache-hit rendering path (goals, team stats, both teams' skater/
--     goalie tables).
--   1001 (TOR @ BOS, finished, no cache row) -- left uncached on purpose:
--     visiting it locally exercises the cache-miss -> live NHL fetch path,
--     which this sandbox can't reach (egress blocked), so it should fall
--     back to the "tietoja ei juuri nyt saatu" message rather than crash.
--   1003 (TOR @ TBL, not finished) -- already seeded above, tests the
--     "not played yet" placeholder.
--   9999 (doesn't exist) -- tests the 404 path.
INSERT INTO game_box_scores (game_id, final_type, goals_json, team_stats_json, away_skaters_json, home_skaters_json, away_goalies_json, home_goalies_json, cached_at) VALUES
(1002, 'REG',
'[{"period_label":"1. erä","time_in_period":"05:12","team_abbrev":"MTL","scorer":"Cole Caufield","assists":["Nick Suzuki"],"strength":"","away_score":1,"home_score":0},{"period_label":"3. erä","time_in_period":"14:40","team_abbrev":"TOR","scorer":"Auston Matthews","assists":[],"strength":"YV","away_score":1,"home_score":1}]',
'[{"label":"Laukaukset","away_value":"28","home_value":"32"},{"label":"Aloitusprosentti","away_value":"48.5 %","home_value":"51.5 %"}]',
'[{"player_id":8481540,"name":"Cole Caufield","position":"R","nationality":"USA","headshot":"https://assets.nhle.com/mugs/nhl/20262027/MTL/8481540.png","goals":1,"assists":0,"points":1,"plus_minus":1,"shots":4,"pim":0,"toi":"18:22"}]',
'[{"player_id":8479318,"name":"Auston Matthews","position":"C","nationality":"USA","headshot":"https://assets.nhle.com/mugs/nhl/20262027/TOR/8479318.png","goals":1,"assists":0,"points":1,"plus_minus":0,"shots":6,"pim":0,"toi":"19:40"}]',
'[{"player_id":8478406,"name":"Sam Montembeault","nationality":"CAN","headshot":"https://assets.nhle.com/mugs/nhl/20262027/MTL/8478406.png","decision":"L","saves":27,"shots_against":32,"save_pct":0.844,"toi":"59:12"}]',
'[{"player_id":8480313,"name":"Joseph Woll","nationality":"USA","headshot":"https://assets.nhle.com/mugs/nhl/20262027/TOR/8480313.png","decision":"W","saves":26,"shots_against":28,"save_pct":0.929,"toi":"60:00"}]',
'2026-09-30T12:00:00Z'),
-- 2001 (CAR @ NYR, part of the digest seed above and of whichever date
-- ends up as the dashboard's "currentRound") -- cached so the dashboard's
-- click-to-expand info box has something to show without a live NHL fetch.
(2001, 'OT',
'[{"period_label":"3. erä","time_in_period":"11:05","team_abbrev":"CAR","scorer":"Sebastian Aho","assists":["Andrei Svechnikov"],"strength":"","away_score":2,"home_score":2},{"period_label":"Jatkoaika","time_in_period":"02:14","team_abbrev":"CAR","scorer":"Sebastian Aho","assists":[],"strength":"","away_score":3,"home_score":2}]',
'[{"label":"Laukaukset","away_value":"30","home_value":"28"},{"label":"Aloitusprosentti","away_value":"52.0 %","home_value":"48.0 %"}]',
'[]', '[]', '[]', '[]',
'2026-09-30T12:00:00Z');

-- Phase 6: full per-team rosters + season stats, for TOR (team page's own
-- tables) and CAR (already has a digest game from 2001 above, so its
-- standings snapshot popup gets real recent_results too). Two TOR goalies
-- with different games_played tests that "starting goalie" in the
-- snapshot picks the one with MORE starts (Woll), not just the first row.
INSERT INTO team_roster_skaters (player_id, team_abbrev, name, position, nationality, sweater_number, headshot, games_played, goals, assists, points, plus_minus, avg_toi_seconds, updated_at) VALUES
(8479318, 'TOR', 'Auston Matthews', 'C', 'USA', 34, 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8479318.png', 7, 8, 5, 13, 3, 1220, '2026-09-30T12:00:00Z'),
(8478483, 'TOR', 'Mitch Marner', 'R', 'CAN', 16, 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8478483.png', 7, 4, 9, 13, 2, 1150, '2026-09-30T12:00:00Z'),
(8481535, 'CAR', 'Sebastian Aho', 'C', 'FIN', 20, 'https://assets.nhle.com/mugs/nhl/20262027/CAR/8481535.png', 7, 6, 4, 10, 4, 1190, '2026-09-30T12:00:00Z');

INSERT INTO team_roster_goalies (player_id, team_abbrev, name, sweater_number, headshot, games_played, wins, losses, ot_losses, goals_against_average, save_pct, updated_at) VALUES
(8480313, 'TOR', 'Joseph Woll', 60, 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8480313.png', 4, 3, 1, 0, 2.31, 0.918, '2026-09-30T12:00:00Z'),
(8475831, 'TOR', 'Anthony Stolarz', 41, 'https://assets.nhle.com/mugs/nhl/20262027/TOR/8475831.png', 3, 1, 2, 0, 3.10, 0.890, '2026-09-30T12:00:00Z'),
(8479978, 'CAR', 'Pyotr Kochetkov', 52, 'https://assets.nhle.com/mugs/nhl/20262027/CAR/8479978.png', 5, 4, 1, 0, 2.10, 0.925, '2026-09-30T12:00:00Z');

INSERT INTO team_season_stats (team_abbrev, games_played, goals_for, goals_against, power_play_pct, penalty_kill_pct, faceoff_pct, shots_for_per_game, shots_against_per_game, shutouts, updated_at) VALUES
('TOR', 7, 25, 18, 0.24, 0.82, 0.51, 32.1, 27.4, 1, '2026-09-30T12:00:00Z');

-- Phase 7: one local test user's favorites/theme, for exercising the
-- sidebar's Omat dropdown and /omat/pelaajat/ /omat (Asetukset) without a
-- real login -- `wrangler pages dev` accepts a spoofed mh_user cookie
-- locally (see _shared/auth.ts). password_hash NULL: this test account has
-- no password, same as picking one blank at /kirjaudu.
INSERT INTO users (username, password_hash, created_at) VALUES
('testuser', NULL, '2026-09-30T12:00:00Z');

INSERT INTO favorite_teams (username, team_abbrev, created_at) VALUES
('testuser', 'TOR', '2026-09-30T12:00:00Z'),
('testuser', 'CAR', '2026-09-30T12:00:00Z');

INSERT INTO favorite_players (username, player_id, is_goalie, created_at) VALUES
('testuser', 8479318, 0, '2026-09-30T12:00:00Z'),
('testuser', 8480313, 1, '2026-09-30T12:00:00Z');

INSERT INTO user_settings (username, theme, updated_at) VALUES
('testuser', 'dark', '2026-09-30T12:00:00Z');
