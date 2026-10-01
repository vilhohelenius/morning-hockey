// Shared by /ottelut/[gameId] (the full report) and the dashboard's "Viime
// yön ottelut" click-to-expand info box: fetch a finished game's box score
// from the NHL API on first request and cache it in game_box_scores, or
// read it straight from the cache on every later request (by either
// route). Extracted here so both places share one cache-read/fetch/write
// path instead of the dashboard re-implementing its own copy.

import { buildGoalEvents, buildTeamStats } from "./boxscore";
import { rosterNationalities, teamPlayerStats } from "./gameReport";
import type { GameBoxScoreRow, GameRow, GoalEvent, GoalieGameStat, PlayerGameStat, TeamStatRow } from "./types";

function seasonIdForDate(dateStr: string): number {
  const [year, month] = dateStr.split("-").map(Number);
  const startYear = month >= 8 ? year : year - 1;
  return startYear * 10_000 + (startYear + 1);
}

const NHL_BASE = "https://api-web.nhle.com/v1";

async function fetchJson(path: string): Promise<any> {
  const response = await fetch(`${NHL_BASE}${path}`);
  if (!response.ok) throw new Error(`NHL API ${path} returned ${response.status}`);
  return response.json();
}

// A live game's current period/clock, from landing's own `clock` +
// `periodDescriptor` -- only meaningful (and only ever populated) for the
// uncached fetchLiveBoxScore path; a cache hit (a finished game) always
// gets `live: null`, since the cache is for settled results only and
// where/how much time is left no longer means anything once a game's over.
export interface LiveStatus {
  periodNumber: number;
  periodType: string; // "REG" | "OT" | "SO"
  timeRemaining: string; // "MM:SS", counts down to 00:00
  inIntermission: boolean;
}

export interface ParsedBoxScore {
  finalType: string;
  goals: GoalEvent[];
  teamStats: TeamStatRow[];
  awaySkaters: PlayerGameStat[];
  homeSkaters: PlayerGameStat[];
  awayGoalies: GoalieGameStat[];
  homeGoalies: GoalieGameStat[];
  live: LiveStatus | null;
}

async function fetchAndParseBoxScore(game: GameRow): Promise<ParsedBoxScore> {
  const seasonId = seasonIdForDate(game.date);

  const [landing, rightRail, boxscore, awayRoster, homeRoster] = await Promise.all([
    fetchJson(`/gamecenter/${game.game_id}/landing`),
    fetchJson(`/gamecenter/${game.game_id}/right-rail`),
    fetchJson(`/gamecenter/${game.game_id}/boxscore`),
    fetchJson(`/roster/${game.away_abbrev}/current`),
    fetchJson(`/roster/${game.home_abbrev}/current`),
  ]);

  const finalType: string = landing?.gameOutcome?.lastPeriodType ?? "REG";

  const finnishIds = new Set<number>();
  const awayNationalities = rosterNationalities(awayRoster);
  const homeNationalities = rosterNationalities(homeRoster);
  for (const [id, country] of awayNationalities) if (country === "FIN") finnishIds.add(id);
  for (const [id, country] of homeNationalities) if (country === "FIN") finnishIds.add(id);
  const nationalities = new Map([...awayNationalities, ...homeNationalities]);

  const goals = buildGoalEvents(landing?.summary?.scoring ?? [], game.away_abbrev, game.home_abbrev, finnishIds);
  const teamStats = buildTeamStats(rightRail?.teamGameStats ?? [], game.away_score, game.home_score);

  const playerStats = boxscore?.playerByGameStats ?? {};
  const { skaters: awaySkaters, goalies: awayGoalies } = teamPlayerStats(
    playerStats.awayTeam ?? {},
    game.away_abbrev,
    seasonId,
    nationalities,
  );
  const { skaters: homeSkaters, goalies: homeGoalies } = teamPlayerStats(
    playerStats.homeTeam ?? {},
    game.home_abbrev,
    seasonId,
    nationalities,
  );

  const live: LiveStatus | null =
    landing?.clock && landing?.periodDescriptor
      ? {
          periodNumber: landing.periodDescriptor.number ?? 0,
          periodType: landing.periodDescriptor.periodType ?? "REG",
          timeRemaining: landing.clock.timeRemaining ?? "00:00",
          inIntermission: !!landing.clock.inIntermission,
        }
      : null;

  return { finalType, goals, teamStats, awaySkaters, homeSkaters, awayGoalies, homeGoalies, live };
}

// For a game still in progress: the same landing/right-rail/boxscore/
// roster fetch, but never cached -- the data changes play by play, so
// caching it would freeze a live game's state. Called fresh on every
// dashboard load for whichever games are currently live (a handful at
// most), same reasoning as getCachedBoxScores about not scaling this to
// every game ever played.
export async function fetchLiveBoxScore(game: GameRow): Promise<ParsedBoxScore | null> {
  try {
    return await fetchAndParseBoxScore(game);
  } catch (error) {
    console.error(`Live box score fetch failed for game ${game.game_id}:`, error);
    return null;
  }
}

function fromCacheRow(cached: GameBoxScoreRow): ParsedBoxScore {
  return {
    finalType: cached.final_type,
    goals: JSON.parse(cached.goals_json),
    teamStats: JSON.parse(cached.team_stats_json),
    awaySkaters: JSON.parse(cached.away_skaters_json),
    homeSkaters: JSON.parse(cached.home_skaters_json),
    awayGoalies: JSON.parse(cached.away_goalies_json),
    homeGoalies: JSON.parse(cached.home_goalies_json),
    live: null,
  };
}

// Read-only, no NHL fetch -- for pages listing many games at once (Arkisto
// can list a whole season), where eagerly fetching+caching every uncached
// one on a single page load would mean a burst of live NHL calls instead
// of the on-demand, one-game-at-a-time cost the architecture is built
// around. A game not yet cached here (nobody has opened its full report or
// seen it on the dashboard yet) just won't have a popup until someone does.
export async function getCachedBoxScores(db: D1Database, gameIds: number[]): Promise<Map<number, ParsedBoxScore>> {
  const map = new Map<number, ParsedBoxScore>();
  if (!gameIds.length) return map;

  const placeholders = gameIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT * FROM game_box_scores WHERE game_id IN (${placeholders})`)
    .bind(...gameIds)
    .all<GameBoxScoreRow>();

  for (const row of results) map.set(row.game_id, fromCacheRow(row));
  return map;
}

// Only ever call this for games.is_finished = 1 -- an unfinished game has
// no box score yet, and callers should show a "not played yet" placeholder
// instead.
export async function getBoxScore(
  db: D1Database,
  game: GameRow,
): Promise<{ box: ParsedBoxScore | null; fetchError: boolean }> {
  const cached = await db.prepare("SELECT * FROM game_box_scores WHERE game_id = ?").bind(game.game_id).first<GameBoxScoreRow>();
  if (cached) return { box: fromCacheRow(cached), fetchError: false };

  try {
    const box = await fetchAndParseBoxScore(game);
    await db
      .prepare(
        `INSERT INTO game_box_scores (
          game_id, final_type, goals_json, team_stats_json,
          away_skaters_json, home_skaters_json, away_goalies_json, home_goalies_json, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        game.game_id,
        box.finalType,
        JSON.stringify(box.goals),
        JSON.stringify(box.teamStats),
        JSON.stringify(box.awaySkaters),
        JSON.stringify(box.homeSkaters),
        JSON.stringify(box.awayGoalies),
        JSON.stringify(box.homeGoalies),
        new Date().toISOString(),
      )
      .run();
    return { box, fetchError: false };
  } catch (error) {
    console.error(`Box score fetch failed for game ${game.game_id}:`, error);
    return { box: null, fetchError: true };
  }
}
