-- Cloudflare D1 schema for the Morning Hockey migration.
-- Applied with: wrangler d1 execute morning-hockey --file=d1/schema.sql
--
-- Phase 1 only: the rolling game schedule/results, synced by the fast-tier
-- (~30 min) GitHub Actions workflow from schedule.py's build_schedule().
-- Rows are upserted, never deleted, so this also becomes a permanent game
-- archive over time as games move through the rolling 7(+1)-day window --
-- no separate "results archive" table needed.
--
-- Phase 2 adds the slow-tier tables below: skater/goalie/rookie season
-- stats and standings, synced a few times a day from league_stats.py,
-- rookies.py and standings.py's existing build_* functions, unchanged.
-- Per-team rosters and the standings page's per-team snapshot panel
-- (recent results/top scorers/next game) are deliberately deferred to the
-- later "all 32 teams" phase, since pulling those out cleanly needs new
-- combinator code, not just a reuse of an existing top-level build_*
-- function the way everything below does.
--
-- Still to come: game_box_scores (on-demand game report cache), teams,
-- favorite_teams, favorite_players, user_settings (auth/favorites). Not
-- created yet -- added when each of those phases is actually built, not
-- speculatively upfront.

CREATE TABLE IF NOT EXISTS games (
    game_id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,               -- Europe/Helsinki calendar date, YYYY-MM-DD
    start_time_utc TEXT NOT NULL,     -- ISO 8601 UTC
    away_abbrev TEXT NOT NULL,
    away_name TEXT NOT NULL,
    away_logo TEXT NOT NULL,
    away_score INTEGER NOT NULL,
    home_abbrev TEXT NOT NULL,
    home_name TEXT NOT NULL,
    home_logo TEXT NOT NULL,
    home_score INTEGER NOT NULL,
    game_state TEXT NOT NULL,
    is_finished INTEGER NOT NULL,     -- 0 or 1
    updated_at TEXT NOT NULL          -- ISO 8601 UTC, when this row was last synced
);

CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
CREATE INDEX IF NOT EXISTS idx_games_away_abbrev ON games(away_abbrev);
CREATE INDEX IF NOT EXISTS idx_games_home_abbrev ON games(home_abbrev);

-- Phase 2: slow tier (a few times a day)

CREATE TABLE IF NOT EXISTS skater_season_stats (
    player_id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    team_abbrev TEXT NOT NULL,
    logo TEXT NOT NULL,
    headshot TEXT NOT NULL,
    nationality TEXT NOT NULL,
    position TEXT NOT NULL,
    games_played INTEGER NOT NULL,
    goals INTEGER NOT NULL,
    assists INTEGER NOT NULL,
    points INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skater_season_stats_points ON skater_season_stats(points DESC);

CREATE TABLE IF NOT EXISTS goalie_season_stats (
    player_id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    team_abbrev TEXT NOT NULL,
    logo TEXT NOT NULL,
    headshot TEXT NOT NULL,
    nationality TEXT NOT NULL,
    games_played INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    ot_losses INTEGER NOT NULL,
    goals_against_average REAL NOT NULL,
    save_pct REAL NOT NULL,
    shutouts INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goalie_season_stats_save_pct ON goalie_season_stats(save_pct DESC);

-- A player's rookie-or-not status is season-scoped, not permanent, so this
-- is keyed the same way as the other season tables rather than merged into
-- skater_season_stats -- being a rookie this season doesn't imply anything
-- about next season's row for the same player_id.
CREATE TABLE IF NOT EXISTS rookie_season_stats (
    player_id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    team_abbrev TEXT NOT NULL,
    logo TEXT NOT NULL,
    headshot TEXT NOT NULL,
    nationality TEXT NOT NULL,
    position TEXT NOT NULL,
    games_played INTEGER NOT NULL,
    goals INTEGER NOT NULL,
    assists INTEGER NOT NULL,
    points INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rookie_season_stats_points ON rookie_season_stats(points DESC);

CREATE TABLE IF NOT EXISTS standings_rows (
    abbrev TEXT PRIMARY KEY,
    as_of_date TEXT NOT NULL,
    name TEXT NOT NULL,
    logo TEXT NOT NULL,
    conference TEXT NOT NULL,
    division TEXT NOT NULL,
    division_rank INTEGER NOT NULL,
    wildcard_rank INTEGER NOT NULL,
    qualified INTEGER NOT NULL,
    games_played INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    ot_losses INTEGER NOT NULL,
    points INTEGER NOT NULL,
    goal_differential INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_standings_rows_division ON standings_rows(conference, division, division_rank);
