// Per-player cumulative points series for the Analytiikka Pistepörssi
// points-race chart. Unlike division points (reconstructed from the local
// games table), individual skater per-game history isn't in D1 -- fetched
// on demand from the NHL /player/{id}/game-log/{season}/2 endpoint (the
// same one the player card already uses, see pelaajat/[playerId].ts) for
// the current top-20 skaters only, and cached in skater_game_log_cache.
//
// Unlike game_box_scores's write-once cache (a finished game never
// changes), an in-season player's log gains a new entry every time they
// play -- so a cached row is only reused while still fresh (CACHE_TTL_MS),
// not forever.

const NHL_BASE = "https://api-web.nhle.com/v1";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h, matches the slow-tier D1 sync cadence

async function fetchJson(path: string): Promise<any> {
  const response = await fetch(`${NHL_BASE}${path}`);
  if (!response.ok) throw new Error(`NHL API ${path} returned ${response.status}`);
  return response.json();
}

export interface SkaterGamePoint {
  date: string;
  points: number;
}

interface CacheRow {
  player_id: number;
  season_id: number;
  points_json: string;
  cached_at: string;
}

// Cumulative, chronological points for one player's season -- the NHL
// endpoint returns newest-game-first, the opposite of what a running total
// needs, so it's reversed before accumulating.
async function fetchPointsSeries(playerId: number, seasonId: number): Promise<SkaterGamePoint[]> {
  const data = await fetchJson(`/player/${playerId}/game-log/${seasonId}/2`);
  const games = [...(data.gameLog ?? [])].reverse();
  let cumulative = 0;
  return games.map((g: any) => {
    cumulative += g.points ?? 0;
    return { date: g.gameDate, points: cumulative };
  });
}

async function getOne(db: D1Database, playerId: number, seasonId: number): Promise<SkaterGamePoint[]> {
  const cached = await db
    .prepare("SELECT * FROM skater_game_log_cache WHERE player_id = ?")
    .bind(playerId)
    .first<CacheRow>();
  const isFresh = cached && cached.season_id === seasonId && Date.now() - Date.parse(cached.cached_at) < CACHE_TTL_MS;
  if (isFresh) return JSON.parse(cached!.points_json);

  try {
    const series = await fetchPointsSeries(playerId, seasonId);
    await db
      .prepare(
        `INSERT INTO skater_game_log_cache (player_id, season_id, points_json, cached_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           season_id = excluded.season_id, points_json = excluded.points_json, cached_at = excluded.cached_at`,
      )
      .bind(playerId, seasonId, JSON.stringify(series), new Date().toISOString())
      .run();
    return series;
  } catch (error) {
    console.error(`Skater game log fetch failed for ${playerId}:`, error);
    // A stale cached row beats nothing -- only an empty series (never
    // fetched before) actually drops the player from the chart.
    return cached ? JSON.parse(cached.points_json) : [];
  }
}

// Fetched in parallel, one NHL call per player not yet fresh in cache --
// fine at the top-20 scale this is called with, same reasoning as the
// per-game box score cache not scaling to "every game ever played".
export async function getSkaterPointsRace(
  db: D1Database,
  playerIds: number[],
  seasonId: number,
): Promise<Map<number, SkaterGamePoint[]>> {
  const entries = await Promise.all(
    playerIds.map(async (id) => [id, await getOne(db, id, seasonId)] as const),
  );
  return new Map(entries);
}
