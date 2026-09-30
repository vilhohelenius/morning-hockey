// Row shapes for the D1 tables this phase reads, matching d1/schema.sql.
// Only the columns actually used by a route are listed per interface.

export interface GameRow {
  game_id: number;
  date: string; // YYYY-MM-DD, Europe/Helsinki calendar date
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
}

export interface StandingsRow {
  abbrev: string;
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
  name: string;
  team_abbrev: string;
  headshot: string;
  position: string;
  games_played: number;
  goals: number;
  assists: number;
  points: number;
}

export interface GoalieStatsRow {
  player_id: number;
  name: string;
  team_abbrev: string;
  headshot: string;
  games_played: number;
  wins: number;
  losses: number;
  ot_losses: number;
  goals_against_average: number;
  save_pct: number;
}

export interface Env {
  DB: D1Database;
}
