// Shared by /ottelut/[gameId] (the full report) and the dashboard's "Viime
// yön ottelut" click-to-expand info box: fetch a finished game's box score
// from the NHL API on first request and cache it in game_box_scores, or
// read it straight from the cache on every later request (by either
// route). Extracted here so both places share one cache-read/fetch/write
// path instead of the dashboard re-implementing its own copy.

import { attachGoalClips, buildGoalEvents, buildGoalieChanges, buildPenaltyEvents, buildShootoutAttempts, buildTeamStats, parseTimeline, resolveFinalType, serializeTimeline, type RawPlayByPlay } from "./boxscore";
import { rosterNationalities, teamPlayerStats } from "./gameReport";
import type { GameBoxScoreRow, GameRow, GoalEvent, GoalieChange, GoalieGameStat, PenaltyEvent, PlayerGameStat, ShootoutAttempt, TeamStatRow } from "./types";

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
  // From play-by-play; stored alongside goals in game_box_scores.goals_json
  // (see serializeTimeline) so the timeline needed no D1 schema change.
  penalties: PenaltyEvent[];
  goalieChanges: GoalieChange[];
  shootout: ShootoutAttempt[];
  // False if play-by-play could not be fetched/is missing from the cache row.
  timelineComplete: boolean;
  teamStats: TeamStatRow[];
  awaySkaters: PlayerGameStat[];
  homeSkaters: PlayerGameStat[];
  awayGoalies: GoalieGameStat[];
  homeGoalies: GoalieGameStat[];
  live: LiveStatus | null;
  // NHL's own current state for this game ("FUT"|"PRE"|"LIVE"|"CRIT"|"OFF"|
  // "FINAL", same vocabulary digest.py's FINISHED_STATES already uses) --
  // lets getBoxScore below write the result straight back into `games`
  // instead of waiting for the next ~30 min fast-tier cron tick to notice a
  // game has started or finished.
  nhlGameState: string;
}

const NHL_FINISHED_STATES = new Set(["OFF", "FINAL"]);

async function fetchAndParseBoxScore(game: GameRow): Promise<ParsedBoxScore> {
  const seasonId = seasonIdForDate(game.date);

  const [landing, rightRail, boxscore, awayRoster, homeRoster, playByPlay] = await Promise.all([
    fetchJson(`/gamecenter/${game.game_id}/landing`),
    fetchJson(`/gamecenter/${game.game_id}/right-rail`),
    fetchJson(`/gamecenter/${game.game_id}/boxscore`),
    fetchJson(`/roster/${game.away_abbrev}/current`),
    fetchJson(`/roster/${game.home_abbrev}/current`),
    // Penalties + goal highlight clips only live here. Optional: a failure
    // must not take down the rest of the box score.
    fetchJson(`/gamecenter/${game.game_id}/play-by-play`).catch((error): null => {
      console.error(`Play-by-play fetch failed for game ${game.game_id}:`, error);
      return null;
    }) as Promise<RawPlayByPlay | null>,
  ]);


  const finnishIds = new Set<number>();
  const awayNationalities = rosterNationalities(awayRoster);
  const homeNationalities = rosterNationalities(homeRoster);
  for (const [id, country] of awayNationalities) if (country === "FIN") finnishIds.add(id);
  for (const [id, country] of homeNationalities) if (country === "FIN") finnishIds.add(id);
  const nationalities = new Map([...awayNationalities, ...homeNationalities]);

  const baseGoals = buildGoalEvents(landing?.summary?.scoring ?? [], game.away_abbrev, game.home_abbrev, finnishIds);
  const goals = playByPlay ? attachGoalClips(baseGoals, playByPlay, game.away_abbrev, game.home_abbrev) : baseGoals;
  const penalties = playByPlay ? buildPenaltyEvents(playByPlay, game.away_abbrev, game.home_abbrev, finnishIds) : [];
  const goalieChanges = playByPlay ? buildGoalieChanges(playByPlay, game.away_abbrev, game.home_abbrev, finnishIds) : [];
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

  const nhlGameState: string = landing?.gameState ?? game.game_state;
  const finalType = resolveFinalType(landing, playByPlay, NHL_FINISHED_STATES.has(nhlGameState));
  const shootout = buildShootoutAttempts(landing?.summary?.shootout?.events, finnishIds);

  return { finalType, goals, penalties, goalieChanges, shootout, timelineComplete: playByPlay !== null, teamStats, awaySkaters, homeSkaters, awayGoalies, homeGoalies, live, nhlGameState };
}

function fromCacheRow(cached: GameBoxScoreRow): ParsedBoxScore {
  const timeline = parseTimeline(cached.goals_json);
  return {
    finalType: cached.final_type,
    goals: timeline.goals,
    penalties: timeline.penalties,
    goalieChanges: timeline.goalieChanges,
    shootout: timeline.shootout,
    timelineComplete: timeline.complete,
    teamStats: JSON.parse(cached.team_stats_json),
    awaySkaters: JSON.parse(cached.away_skaters_json),
    homeSkaters: JSON.parse(cached.home_skaters_json),
    awayGoalies: JSON.parse(cached.away_goalies_json),
    homeGoalies: JSON.parse(cached.home_goalies_json),
    live: cached.live_json ? JSON.parse(cached.live_json) : null,
    // Only meaningful right after a fresh NHL fetch (see getBoxScore's
    // write-through below) -- nothing reads it off a cache hit.
    nhlGameState: "",
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

// A cache row written before blocked_shots/hits/giveaways/takeaways/
// faceoff_pct (skaters) and ev/pp/sh_goals_against (goalies) existed in the
// parser is missing those keys entirely rather than having them as 0 --
// this substring check is cheaper than JSON.parse and catches exactly that
// gap, so a stale row is treated as a cache miss and transparently
// refetched/re-cached below instead of needing a one-off backfill script.
//
// For a finished game that's otherwise fine, the cache is permanent -- a
// settled result never changes. For a game still in progress, it's instead
// good for LIVE_CACHE_TTL_MS: short enough that nobody waits long for a new
// goal to show up, long enough that several visitors hitting the dashboard
// within the same few seconds share one NHL fetch instead of one each.
const LIVE_CACHE_TTL_MS = 15_000;

function isStale(cached: GameBoxScoreRow, game: GameRow): boolean {
  if (!cached.away_skaters_json.includes('"blocked_shots"') || !cached.away_goalies_json.includes('"ev_goals_against"')) return true;
  // 2026-10-02: team_stats_json's row labels were renamed ("Torjutut
  // laukaukset" -> "Blokatut laukaukset", "Menetetyt kiekot" -> "Kiekon
  // menetykset", "Riistetyt kiekot" -> "Kiekon riistot") -- same
  // cheap-substring-check pattern as the missing-key case above, so an
  // already-cached finished game picks up the new wording on next view
  // instead of being stuck with whatever text was cached before the rename.
  if (cached.team_stats_json.includes('"Torjutut laukaukset"') || cached.team_stats_json.includes('"Menetetyt kiekot"') || cached.team_stats_json.includes('"Riistetyt kiekot"')) return true;
  // 2026-10-06: goals_json became {v:3 -> v:4 2026-10-08 adds goalieChanges; complete, goals, penalties, shootout} (match
  // timeline). A legacy bare-array row, or one whose play-by-play fetch
  // failed (complete:false), is refetched -- again no migration needed.
  if (!cached.goals_json.startsWith('{"v":4,"complete":true')) return true;
  // A cache row is only a trustworthy "settled result" if it was itself
  // captured after the game looked over -- `live_json` is non-null exactly
  // when the fetch that produced this row still saw a clock/period (see
  // fetchAndParseBoxScore). `games.is_finished` flips via the independent
  // fast-tier cron sync, so it can go true well after the last (in-progress)
  // box score fetch -- without this check, that early snapshot would be
  // treated as permanently fresh and never refetched once finished.
  if (game.is_finished) return cached.live_json !== null;
  return Date.now() - new Date(cached.cached_at).getTime() > LIVE_CACHE_TTL_MS;
}

// For any game that's started (finished or currently live -- callers should
// check game.is_finished || isLive(game) first; an upcoming game has no box
// score yet and should show a "not played yet" placeholder instead).
//
// Also self-heals `games.is_finished`/`game_state`/`final_type` the moment a
// live fetch's own landing payload reveals NHL already considers the game
// started or finished but this row's own 30-min-cron-synced fields haven't
// caught up yet -- closes that gap on the next view instead of waiting for
// the next fast-tier sync. Mutates the passed-in `game` to match, so this
// same request's own rendering reflects it immediately too.
export async function getBoxScore(
  db: D1Database,
  game: GameRow,
): Promise<{ box: ParsedBoxScore | null; fetchError: boolean }> {
  const cached = await db.prepare("SELECT * FROM game_box_scores WHERE game_id = ?").bind(game.game_id).first<GameBoxScoreRow>();
  if (cached && !isStale(cached, game)) return { box: fromCacheRow(cached), fetchError: false };

  try {
    const box = await fetchAndParseBoxScore(game);
    const params = [
      box.finalType,
      serializeTimeline({ goals: box.goals, penalties: box.penalties, goalieChanges: box.goalieChanges, shootout: box.shootout, complete: box.timelineComplete }),
      JSON.stringify(box.teamStats),
      JSON.stringify(box.awaySkaters),
      JSON.stringify(box.homeSkaters),
      JSON.stringify(box.awayGoalies),
      JSON.stringify(box.homeGoalies),
      JSON.stringify(box.live),
      new Date().toISOString(),
    ];
    if (cached) {
      await db
        .prepare(
          `UPDATE game_box_scores SET
            final_type = ?, goals_json = ?, team_stats_json = ?,
            away_skaters_json = ?, home_skaters_json = ?, away_goalies_json = ?, home_goalies_json = ?, live_json = ?, cached_at = ?
          WHERE game_id = ?`,
        )
        .bind(...params, game.game_id)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO game_box_scores (
            game_id, final_type, goals_json, team_stats_json,
            away_skaters_json, home_skaters_json, away_goalies_json, home_goalies_json, live_json, cached_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(game.game_id, ...params)
        .run();
    }

    if (box.nhlGameState && box.nhlGameState !== game.game_state) {
      const finished = NHL_FINISHED_STATES.has(box.nhlGameState);
      // Carries the score along too, from the goal timeline's own running
      // tally -- otherwise a self-healed "finished" row would show as
      // finished (no more LIVE badge) while still displaying whatever score
      // the last cron sync happened to have, which can be behind the real
      // final score by up to ~30 min.
      const lastGoal = box.goals[box.goals.length - 1];
      const awayScore = lastGoal ? lastGoal.away_score : game.away_score;
      const homeScore = lastGoal ? lastGoal.home_score : game.home_score;
      await db
        .prepare("UPDATE games SET is_finished = ?, game_state = ?, final_type = ?, away_score = ?, home_score = ? WHERE game_id = ?")
        .bind(finished ? 1 : 0, box.nhlGameState, box.finalType, awayScore, homeScore, game.game_id)
        .run();
      game.is_finished = finished ? 1 : 0;
      game.game_state = box.nhlGameState;
      game.final_type = box.finalType;
      game.away_score = awayScore;
      game.home_score = homeScore;
    }

    return { box, fetchError: false };
  } catch (error) {
    console.error(`Box score fetch failed for game ${game.game_id}:`, error);
    if (cached) return { box: fromCacheRow(cached), fetchError: false };
    return { box: null, fetchError: true };
  }
}

// A page that listed games whose box score fetch failed (e.g. a first view
// right after many games finished: each uncached game costs 6 NHL fetches,
// and one request has a limited fetch budget) reloads itself shortly so the
// already-cached games are free and the rest get their turn. Max 5 tries per 10 min,
// and never once the visitor has started revealing results.
export function missingBoxRetryScript(missing: number): string {
  if (!missing) return "";
  return `<script>
(function () {
  try {
    if (document.querySelector(".spoiler-reveal-toggle:checked")) return;
    // Time-bucketed (10 min) so an exhausted budget doesn't block this page
    // for the rest of the browser session.
    var key = "box-retry:" + location.pathname + location.search + ":" + Math.floor(Date.now() / 600000);
    var tries = Number(sessionStorage.getItem(key) || 0);
    if (tries >= 5) return;
    sessionStorage.setItem(key, String(tries + 1));
    setTimeout(function () { location.reload(); }, 1000);
  } catch (e) {}
})();
</script>`;
}
