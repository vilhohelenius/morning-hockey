-- Cloudflare D1 schema for the Morning Hockey migration.
-- Applied with: wrangler d1 execute morning-hockey --file=d1/schema.sql
--
-- Phase 1 only: the rolling game schedule/results, synced by the fast-tier
-- (~30 min) GitHub Actions workflow from schedule.py's build_schedule().
-- Rows are upserted, never deleted, so this also becomes a permanent game
-- archive over time as games move through the rolling 7(+1)-day window --
-- no separate "results archive" table needed.
--
-- Later phases add: skater_season_stats, goalie_season_stats,
-- standings_snapshots, rookie_status (slow tier), game_box_scores
-- (on-demand game report cache), teams, favorite_teams, favorite_players,
-- user_settings (auth/favorites). Not created yet -- added when each of
-- those phases is actually built, not speculatively upfront.

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
