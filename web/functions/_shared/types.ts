// Row shapes for the D1 tables this phase reads, matching d1/schema.sql.
// Only the columns actually used by a route are listed per interface.

export interface GameRow {
  game_id: number;
  date: string; // YYYY-MM-DD, Europe/Helsinki calendar date
  start_time_utc: string; // ISO 8601 UTC
  away_abbrev: string;
  away_name: string;
  away_logo: string;
  away_score: number;
  home_abbrev: string;
  home_name: string;
  home_logo: string;
  home_score: number;
  game_state: string;
  is_finished: number; // 0 or 1
  final_type: string; // "REG" | "OT" | "SO", meaningful only once is_finished
}

export interface StandingsRow {
  abbrev: string;
  as_of_date: string;
  name: string;
  logo: string;
  conference: string;
  division: string;
  division_rank: number;
  wildcard_rank: number;
  qualified: number;
  games_played: number;
  wins: number;
  losses: number;
  ot_losses: number;
  points: number;
  goal_differential: number;
}

export interface SkaterStatsRow {
  player_id: number;
  season_id: number;
  name: string;
  team_abbrev: string;
  logo: string;
  headshot: string;
  nationality: string;
  position: string;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
}

export interface GoalieStatsRow {
  player_id: number;
  season_id: number;
  name: string;
  team_abbrev: string;
  logo: string;
  headshot: string;
  nationality: string;
  games_played: number;
  wins: number;
  losses: number;
  ot_losses: number;
  goals_against_average: number;
  save_pct: number;
  shutouts: number;
}

export interface FinnishSkaterRow {
  player_id: number;
  season_id: number;
  name: string;
  team_abbrev: string;
  logo: string;
  headshot: string;
  position: string;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
}

export interface FinnishGoalieRow {
  player_id: number;
  season_id: number;
  name: string;
  team_abbrev: string;
  logo: string;
  headshot: string;
  games_played: number;
  wins: number;
  losses: number;
  ot_losses: number;
  goals_against_average: number;
  save_pct: number;
  shutouts: number;
}

export interface DigestRow {
  date: string;
  generated_at: string;
}

export interface DigestGameRow {
  game_id: number;
  digest_date: string;
  away_abbrev: string;
  away_name: string;
  away_logo: string;
  away_score: number;
  home_abbrev: string;
  home_name: string;
  home_logo: string;
  home_score: number;
  final_type: string;
}

export interface DigestScorerRow {
  game_id: number;
  name: string;
  team_abbrev: string;
  goals: number;
  assists: number;
}

export interface DigestGoalieRow {
  game_id: number;
  name: string;
  team_abbrev: string;
  decision: string | null;
  saves: number;
  shots_against: number;
  save_pct: number | null;
  toi: string;
}

// ---------- Phase 5: on-demand game report ----------

export interface GoalEvent {
  period_label: string;
  time_in_period: string;
  team_abbrev: string;
  scorer: string;
  assists: string[];
  strength: string; // "" | "YV" | "AV"
  away_score: number;
  home_score: number;
}

export interface TeamStatRow {
  label: string;
  away_value: string;
  home_value: string;
  // Bar-chart fill, 0-100 scale, relative within this row only (the NHL.com
  // "Game Stats" look) -- omitted for rows a two-sided bar wouldn't make
  // sense for.
  away_pct?: number;
  home_pct?: number;
  // League rank (1 = best) for this stat, preview team-stats rows only --
  // NHL.com's own Team Stats section shows one under each side's bar.
  away_rank?: number;
  home_rank?: number;
}

export interface PlayerGameStat {
  player_id: number;
  name: string;
  position: string;
  nationality: string;
  headshot: string;
  goals: number;
  assists: number;
  points: number;
  plus_minus: number;
  shots: number;
  blocked_shots: number;
  hits: number;
  giveaways: number;
  takeaways: number;
  faceoff_pct: number | null;
  pim: number;
  toi: string;
}

export interface GoalieGameStat {
  player_id: number;
  name: string;
  nationality: string;
  headshot: string;
  decision: string | null;
  saves: number;
  shots_against: number;
  save_pct: number;
  ev_goals_against: number;
  pp_goals_against: number;
  sh_goals_against: number;
  toi: string;
}

// The D1 cache row: sub-objects stored as JSON text, parsed back to the
// interfaces above on read. See d1/schema.sql for why they're not
// normalized into their own tables.
export interface GameBoxScoreRow {
  game_id: number;
  final_type: string;
  goals_json: string;
  team_stats_json: string;
  away_skaters_json: string;
  home_skaters_json: string;
  away_goalies_json: string;
  home_goalies_json: string;
  live_json: string | null;
  cached_at: string;
}

// ---------- Phase 6: full per-team rosters ----------

export interface TeamRosterSkaterRow {
  player_id: number;
  team_abbrev: string;
  name: string;
  position: string;
  nationality: string;
  sweater_number: number;
  headshot: string;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
  plus_minus: number;
  avg_toi_seconds: number;
}

export interface TeamRosterGoalieRow {
  player_id: number;
  team_abbrev: string;
  name: string;
  nationality: string;
  sweater_number: number;
  headshot: string;
  games_played: number;
  wins: number;
  losses: number;
  ot_losses: number;
  goals_against_average: number;
  save_pct: number;
  shutouts: number;
}

export interface TeamSeasonStatsRow {
  team_abbrev: string;
  games_played: number;
  goals_for: number;
  goals_against: number;
  power_play_pct: number;
  penalty_kill_pct: number;
  faceoff_pct: number;
  shots_for_per_game: number;
  shots_against_per_game: number;
  shutouts: number;
}

// ---------- Phase 7: favorites + settings ----------

export interface FavoriteTeamRow {
  username: string;
  team_abbrev: string;
  created_at: string;
}

export interface FavoritePlayerRow {
  username: string;
  player_id: number;
  is_goalie: number; // 0 or 1
  created_at: string;
}

export interface UserSettingsRow {
  username: string;
  theme: string;
  tulospiilo_mode: number;
  highlights: number;
  updated_at: string;
}

// Simple username(+optional password) login, replacing Cloudflare Access
// 2026-10-01 -- see _shared/auth.ts.
export interface UserRow {
  username: string;
  password_hash: string | null;
  created_at: string;
}

export interface Env {
  DB: D1Database;
  YOUTUBE_API_KEY?: string;
}

// See _shared/youtube.ts -- video_url is null for a checked-but-not-found-
// yet game.
export interface YoutubeHighlightRow {
  game_id: number;
  video_url: string | null;
  checked_at: string;
}
