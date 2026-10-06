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

-- Added 2026-10-01 for the OT/SO badge wherever a finished game's score is
-- shown (dashboard/Arkisto cards, previously only available via an
-- on-demand box-score fetch, which could fail or lag). The /schedule/{date}
-- endpoint's gameOutcome.lastPeriodType is reliable here -- confirmed live,
-- unlike the gamecenter/landing endpoint's own top-level gameOutcome field,
-- which came back null for a real finished game when checked directly.
ALTER TABLE games ADD COLUMN final_type TEXT NOT NULL DEFAULT 'REG';

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

-- Phase 4 (Suomipörssi page port): every Finnish skater/goalie, fetched
-- directly by nationalityCode="FIN" -- NOT derivable from skater_season_stats
-- /goalie_season_stats above, which are overall top-100-per-position/top-30
-- cuts and would silently miss a Finnish player outside that cut (goalies
-- especially, with only 30 synced league-wide). Delete-then-reinsert each
-- sync, same reasoning as the other leaderboard tables: a Finnish player
-- who's sent down, injured, or traded out of the NHL needs to disappear,
-- not just stop getting updated.
CREATE TABLE IF NOT EXISTS finnish_skater_stats (
    player_id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    team_abbrev TEXT NOT NULL,
    logo TEXT NOT NULL,
    headshot TEXT NOT NULL,
    position TEXT NOT NULL,
    games_played INTEGER NOT NULL,
    goals INTEGER NOT NULL,
    assists INTEGER NOT NULL,
    points INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finnish_skater_stats_points ON finnish_skater_stats(points DESC);

CREATE TABLE IF NOT EXISTS finnish_goalie_stats (
    player_id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    team_abbrev TEXT NOT NULL,
    logo TEXT NOT NULL,
    headshot TEXT NOT NULL,
    games_played INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    ot_losses INTEGER NOT NULL,
    goals_against_average REAL NOT NULL,
    save_pct REAL NOT NULL,
    shutouts INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finnish_goalie_stats_save_pct ON finnish_goalie_stats(save_pct DESC);

-- Phase 4 (dashboard): last night's digest -- every league-wide finished
-- game, with Finnish players' per-game scorer/goalie lines. Mirrors
-- digest.py's Digest/GameResult/ScorerLine/GoalieLine shapes exactly (see
-- build_digest, called unchanged by sync_digest.py). Deliberately does NOT
-- include GameBoxScore (goal-by-goal detail, team stats) -- that backs the
-- game-card's click-to-expand popup, which is the same shape as phase 5's
-- planned on-demand game_box_scores cache and belongs there, not here.
--
-- Runs on its own once-daily cadence (sync-digest.yml), separate from both
-- the 30-min fast tier and the 4-hour slow tier: last night's games don't
-- change again until the next night, so syncing more often would just
-- re-fetch the same already-settled data.
CREATE TABLE IF NOT EXISTS digests (
    date TEXT PRIMARY KEY,
    generated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS digest_games (
    game_id INTEGER PRIMARY KEY,
    digest_date TEXT NOT NULL,
    away_abbrev TEXT NOT NULL,
    away_name TEXT NOT NULL,
    away_logo TEXT NOT NULL,
    away_score INTEGER NOT NULL,
    home_abbrev TEXT NOT NULL,
    home_name TEXT NOT NULL,
    home_logo TEXT NOT NULL,
    home_score INTEGER NOT NULL,
    final_type TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_digest_games_date ON digest_games(digest_date);

-- No natural primary key -- a re-run for the same night deletes a game's
-- rows before reinserting (see sync_digest in d1_sync.py) rather than
-- relying on a key to dedupe.
CREATE TABLE IF NOT EXISTS digest_scorers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    team_abbrev TEXT NOT NULL,
    goals INTEGER NOT NULL,
    assists INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_digest_scorers_game ON digest_scorers(game_id);

CREATE TABLE IF NOT EXISTS digest_goalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    team_abbrev TEXT NOT NULL,
    decision TEXT,
    saves INTEGER NOT NULL,
    shots_against INTEGER NOT NULL,
    save_pct REAL,
    toi TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_digest_goalies_game ON digest_goalies(game_id);

-- Phase 5: on-demand game report cache. Unlike every table above, this one
-- is written by the TypeScript Pages Function itself (web/functions/ottelut/
-- [gameId].ts), not by a Python sync script -- the whole point of "on
-- demand" is fetching a game's detailed box score from the NHL API only
-- when someone actually visits that game's page, not pre-building all of
-- them nightly. A cache hit skips the NHL fetch entirely.
--
-- Rows are written once and never updated: only finished games (games.
-- is_finished = 1) are ever fetched/cached, and a finished game's box score
-- doesn't change afterward. Parsed sub-objects (goal timeline, team stat
-- comparison, per-player stat lines) are stored as JSON rather than
-- normalized into their own tables -- they're always read and rendered
-- whole, by game_id, never filtered or sorted at the SQL level, so
-- normalizing them would only add join complexity with no query benefit.
-- Team identity (abbrev/name/logo/score) and date aren't duplicated here --
-- the games table (already synced) has those, joined by game_id.
CREATE TABLE IF NOT EXISTS game_box_scores (
    game_id INTEGER PRIMARY KEY,
    final_type TEXT NOT NULL,
    goals_json TEXT NOT NULL,
    team_stats_json TEXT NOT NULL,
    away_skaters_json TEXT NOT NULL,
    home_skaters_json TEXT NOT NULL,
    away_goalies_json TEXT NOT NULL,
    home_goalies_json TEXT NOT NULL,
    cached_at TEXT NOT NULL
);

-- Caches a finished game's real NHL Highlights video on YouTube
-- (_shared/youtube.ts), resolved via the YouTube Data API v3 (needs
-- YOUTUBE_API_KEY as a Cloudflare Pages secret; without it the site just
-- falls back to a plain youtube.com search link, no row ever written
-- here). video_url is NULL when a search has been tried but found nothing
-- yet -- highlights can take hours to appear after a game ends, and
-- checked_at lets _shared/youtube.ts only retry periodically instead of
-- re-querying YouTube's metered search quota on every page view.
CREATE TABLE IF NOT EXISTS youtube_highlights (
    game_id INTEGER PRIMARY KEY,
    video_url TEXT,
    checked_at TEXT NOT NULL
);

-- Phase 6: full per-team rosters, for all 32 teams -- NOT derivable from
-- skater_season_stats/goalie_season_stats above, same reasoning as
-- finnish_skater_stats/finnish_goalie_stats: those are a global top-N cut
-- (100 per skater position, 30 goalies league-wide), and a below-average
-- team's actual roster, or even its own top scorers, can easily fall
-- outside that cut entirely. Built from team.py's existing build_* roster
-- helpers unchanged, called once per team (client.roster() has no
-- league-wide equivalent) -- NHLClient's per-instance cache means the
-- underlying skater_summary/goalie_summary/team_summary calls those
-- helpers also make are still only fetched once, not once per team.
--
-- Delete-then-reinsert (whole table, every sync): a roster's membership
-- changes -- trades, call-ups, waivers -- and a player who's left a team
-- needs to disappear from it, not just stop updating.
CREATE TABLE IF NOT EXISTS team_roster_skaters (
    player_id INTEGER PRIMARY KEY,
    team_abbrev TEXT NOT NULL,
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    sweater_number INTEGER NOT NULL,
    headshot TEXT NOT NULL,
    games_played INTEGER NOT NULL,
    goals INTEGER NOT NULL,
    assists INTEGER NOT NULL,
    points INTEGER NOT NULL,
    plus_minus INTEGER NOT NULL,
    avg_toi_seconds REAL NOT NULL,
    updated_at TEXT NOT NULL
);

-- Added 2026-10-01 for the dashboard's per-favorite-team top-scorer mini-box
-- (nationality flag next to the name). Already present on every roster
-- player payload as birthCountry -- no extra API call, see team.py's
-- _build_skaters. DEFAULT '' only matters until the next slow-tier sync
-- (delete+reinsert, every 4h) overwrites every row anyway.
ALTER TABLE team_roster_skaters ADD COLUMN nationality TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_team_roster_skaters_team ON team_roster_skaters(team_abbrev, points DESC);

CREATE TABLE IF NOT EXISTS team_roster_goalies (
    player_id INTEGER PRIMARY KEY,
    team_abbrev TEXT NOT NULL,
    name TEXT NOT NULL,
    sweater_number INTEGER NOT NULL,
    headshot TEXT NOT NULL,
    games_played INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    ot_losses INTEGER NOT NULL,
    goals_against_average REAL NOT NULL,
    save_pct REAL NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_roster_goalies_team ON team_roster_goalies(team_abbrev, games_played DESC);

-- Added 2026-10-01 for the team page's goalie roster table (replaces
-- losses/ot_losses there with shutouts). Already present on the same
-- goalie_summary API response team.py's _build_goalies already queries for
-- wins/save_pct/etc -- no extra API call. DEFAULT 0 only matters until the
-- next slow-tier sync (delete+reinsert, every 4h) overwrites every row.
ALTER TABLE team_roster_goalies ADD COLUMN shutouts INTEGER NOT NULL DEFAULT 0;

-- Added 2026-10-01 for the home page search results (haku/pelaajat.ts) and
-- the team page's goalie roster table, matching team_roster_skaters'
-- nationality column above. Same source (birthCountry on the roster payload
-- team.py's _build_goalies already reads) -- no extra API call. DEFAULT ''
-- only matters until the next slow-tier sync (delete+reinsert, every 4h)
-- overwrites every row.
ALTER TABLE team_roster_goalies ADD COLUMN nationality TEXT NOT NULL DEFAULT '';

-- Team-level season stats (PP%/PK%/faceoff%/shots), for the team page's
-- "Kausitilastot" stat grid -- flagged as missing since phase 3, closed
-- here alongside the roster sync since both come from the same per-team
-- build_team_page pass. Plain upsert: the set of 32 teams never shrinks.
CREATE TABLE IF NOT EXISTS team_season_stats (
    team_abbrev TEXT PRIMARY KEY,
    games_played INTEGER NOT NULL,
    goals_for INTEGER NOT NULL,
    goals_against INTEGER NOT NULL,
    power_play_pct REAL NOT NULL,
    penalty_kill_pct REAL NOT NULL,
    faceoff_pct REAL NOT NULL,
    shots_for_per_game REAL NOT NULL,
    shots_against_per_game REAL NOT NULL,
    shutouts INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

-- Phase 7: favorites + settings. Unlike every table above, these are
-- written by the TypeScript Pages Functions themselves (web/functions/
-- omat/*), in direct response to a signed-in user's own action (favorite
-- a team/player, change theme) -- not by any Python sync, and not on a
-- schedule. Keyed by username -- originally the Cloudflare-Access-
-- authenticated email, switched 2026-10-01 to a self-service username (see
-- the `users` table + _shared/auth.ts): the RENAME COLUMN statements below
-- preserve whatever favorites/theme rows already existed under the old
-- email-keyed scheme, they just relabel the column.
CREATE TABLE IF NOT EXISTS favorite_teams (
    email TEXT NOT NULL,
    team_abbrev TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (email, team_abbrev)
);

ALTER TABLE favorite_teams RENAME COLUMN email TO username;

-- No player name/team columns here on purpose -- team_roster_skaters/
-- team_roster_goalies (phase 6) are the live source of that, joined by
-- player_id at render time, so a trade shows up immediately instead of
-- needing this row updated too. is_goalie picks which of those two tables
-- to join against, since a player_id alone doesn't say which shape it is.
CREATE TABLE IF NOT EXISTS favorite_players (
    email TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    is_goalie INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (email, player_id)
);

ALTER TABLE favorite_players RENAME COLUMN email TO username;

-- One row per signed-in user. Plain upsert -- a user either has a stored
-- preference or doesn't yet, nothing here is ever a leaderboard to prune.
CREATE TABLE IF NOT EXISTS user_settings (
    email TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

ALTER TABLE user_settings RENAME COLUMN email TO username;

-- Accounts for the simple username(+optional password) login (_shared/
-- auth.ts): created on first login, not a separate signup step. No email,
-- no password-reset flow, no salted/iterated hash -- a plain SHA-256 of the
-- password (null if the user never set one) is enough for a handful of
-- friends who all already have the URL; this can be swapped for Cloudflare
-- Access or real OAuth later without any downstream code changes, since
-- every route only ever asks _shared/auth.ts's currentUsername() for "who
-- is this, or null".
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT,
    created_at TEXT NOT NULL
);

-- Tulospiilo ("spoiler-free") mode: when on, / redirects straight to
-- /tulospiilo instead of showing the dashboard, so highlight videos can be
-- watched before seeing any score. Mirrored into a cookie the same way
-- theme is (see _shared/auth.ts), so every request to / can check it
-- without a D1 round-trip.
ALTER TABLE user_settings ADD COLUMN tulospiilo_mode INTEGER NOT NULL DEFAULT 0;

-- Pörssi highlight dots (Finnish player / favorite team) on/off; default on.
-- Mirrored into the `highlights` cookie like tulospiilo_mode.
ALTER TABLE user_settings ADD COLUMN highlights INTEGER NOT NULL DEFAULT 1;

-- Analytiikka's Pistepörssi points-race chart (2026-10-01): per-player
-- game-by-game cumulative points, for the current top-20 skaters only (from
-- skater_season_stats), fetched on demand from the NHL
-- /player/{id}/game-log/{season}/2 endpoint -- see _shared/skaterGameLog.ts.
-- Unlike game_box_scores (a finished game's box score never changes, so
-- that cache is write-once), an in-season player's game log gains a new row
-- every time they play, so this is refreshed on a TTL rather than cached
-- forever -- see CACHE_TTL_MS there.
CREATE TABLE IF NOT EXISTS skater_game_log_cache (
    player_id INTEGER PRIMARY KEY,
    season_id INTEGER NOT NULL,
    points_json TEXT NOT NULL,
    cached_at TEXT NOT NULL
);

-- 2026-10-02: extends game_box_scores (previously finished-games-only, write
-- once) to also cache a live game's box score on a short TTL (see
-- LIVE_CACHE_TTL_MS in _shared/boxScoreCache.ts) instead of fetching the NHL
-- API fresh on every single dashboard/game-page load while a game is in
-- progress. live_json holds that fetch's LiveStatus (period/clock) so a
-- cache hit can still render the right "2. erä · 14:32" badge text instead
-- of falling back to a generic "LIVE" -- NULL for a finished game (landing
-- has no clock once a game's over) or for any row cached before this column
-- existed.
ALTER TABLE game_box_scores ADD COLUMN live_json TEXT;

-- Pistemiesbingo (2026-10): a user's bingo slip, one row per picked skater
-- per round. round_date is the "night" key (see web/functions/_shared/
-- bingo.ts): the date of the North-American evening of the first game that
-- had not started when the pick was made. Rows with round_date older than
-- the current night are stale and ignored/pruned. Idempotent.
CREATE TABLE IF NOT EXISTS bingo_picks (
    username TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    round_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (username, player_id, round_date)
);

CREATE INDEX IF NOT EXISTS idx_bingo_picks_user ON bingo_picks(username);
