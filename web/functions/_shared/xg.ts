// xG (skaters) and GSAx (goalies) from the per-game rows that sync_xg.py
// writes to skater_game_xg / goalie_game_xg (regular season only). Season
// totals are summed here in the queries -- the tables hold only per-game
// rows. A player/game without rows (before the backfill, or the sync hasn't
// processed that game yet) just gets no xG value rather than a zero.

import type { Env } from "./types";

// GSAx/100 below this many shots faced is mostly noise, so the maalivahti-
// pörssi shows "–" instead of ranking it.
const MIN_SHOTS_FOR_PER_100 = 300;

interface SkaterSeasonXg {
  xg: number;
  goals: number;
  shots: number;
}

interface GoalieSeasonXg {
  xga: number;
  goalsAgainst: number;
  shotsAgainst: number;
}

interface GameXg {
  skaterXg: Map<number, number>; // game_id -> xG
  goalieGsax: Map<number, number>; // game_id -> GSAx (xGA - goals against)
}

export async function fetchSkaterSeasonXg(db: D1Database, playerId: number, season: number): Promise<SkaterSeasonXg | null> {
  try {
    const row = await db
      .prepare("SELECT SUM(xg) AS xg, SUM(goals) AS goals, SUM(shots) AS shots FROM skater_game_xg WHERE player_id = ? AND season = ?")
      .bind(playerId, season)
      .first<{ xg: number | null; goals: number | null; shots: number | null }>();
    return row && row.xg !== null ? { xg: row.xg, goals: row.goals ?? 0, shots: row.shots ?? 0 } : null;
  } catch (error) {
    console.error(`Skater xG lookup failed for ${playerId}:`, error);
    return null;
  }
}

export async function fetchGoalieSeasonXg(db: D1Database, playerId: number, season: number): Promise<GoalieSeasonXg | null> {
  try {
    const row = await db
      .prepare(
        "SELECT SUM(xga) AS xga, SUM(goals_against) AS ga, SUM(shots_against) AS sa FROM goalie_game_xg WHERE player_id = ? AND season = ?",
      )
      .bind(playerId, season)
      .first<{ xga: number | null; ga: number | null; sa: number | null }>();
    return row && row.xga !== null ? { xga: row.xga, goalsAgainst: row.ga ?? 0, shotsAgainst: row.sa ?? 0 } : null;
  } catch (error) {
    console.error(`Goalie xG lookup failed for ${playerId}:`, error);
    return null;
  }
}

export async function fetchGameXg(db: D1Database, playerId: number, season: number, isGoalie: boolean): Promise<Map<number, number>> {
  const sql = isGoalie
    ? "SELECT game_id, xga - goals_against AS value FROM goalie_game_xg WHERE player_id = ? AND season = ?"
    : "SELECT game_id, xg AS value FROM skater_game_xg WHERE player_id = ? AND season = ?";
  try {
    const { results } = await db.prepare(sql).bind(playerId, season).all<{ game_id: number; value: number }>();
    return new Map(results.map((r) => [r.game_id, r.value]));
  } catch (error) {
    console.error(`Per-game xG lookup failed for ${playerId}/${season}:`, error);
    return new Map();
  }
}

export function formatXg(value: number | undefined | null): string {
  return value === undefined || value === null ? "–" : value.toFixed(1);
}

export function formatGsax(value: number | undefined | null, digits = 1): string {
  if (value === undefined || value === null) return "–";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function gsaxPer100(gsax: number, shotsAgainst: number): number | null {
  return shotsAgainst >= MIN_SHOTS_FOR_PER_100 ? (gsax / shotsAgainst) * 100 : null;
}

export const XG_INFO_TEXT = `
<details class="xg-info">
  <summary>Mitä xG ja GSAx tarkoittavat?</summary>
  <p><strong>xG (odotetut maalit)</strong>: jokaiselle laukaukselle lasketaan malli, joka arvioi sijainnin, laukaustyypin,
  edeltävän tapahtuman ja pelitilanteen perusteella todennäköisyyden, että laukaus on maali. Pelaajan xG on näiden
  todennäköisyyksien summa. Jos maaleja on enemmän kuin xG, pelaaja on viimeistellyt odotettua paremmin.</p>
  <p><strong>GSAx (torjutut maalit odottamaa vastaan)</strong>: maalivahdin kohtaamien laukausten xG:n summa miinus
  päästetyt maalit. Positiivinen luku tarkoittaa, että maalivahti on torjunut odotettua paremmin. GSAx/100 on sama
  sataa kohdattua laukausta kohden, ja se näytetään vasta ${MIN_SHOTS_FOR_PER_100} laukauksen jälkeen. GSAx lasketaan
  erillisellä maalivahtimallilla vain maalia kohti tulleista laukauksista (ei tyhjiin maaleihin), kun taas joukkueen xG
  lasketaan laukaisijamallilla kaikista torjumattomista laukausyrityksistä. Siksi esimerkiksi joukkueen xG ja
  vastustajan maalivahdin GSAx voivat poiketa toisistaan muutamalla sadasosalla.</p>
  <p>Malli on koulutettu NHL:n play-by-play-datalla kausilta 2023–24 – 2025–26 (tarkkuus AUC noin 0,79). Luvut ovat
  mallin raakatulosta eikä niitä ole skaalattu kauden maalimäärään, joten yksittäisen ottelun xG on kohinaista ja
  kausisummat ovat luotettavampia. Vain runkosarja.</p>
  <p><strong>xGF%</strong>: kentällä olon aikana pelaajan joukkueen luoma xG jaettuna luodun ja päästetyn xG:n summalla.
  Yli 50 % tarkoittaa, että joukkue on hallinnut pelaajan jäällä ollessa. 5v5 laskee vain viisi viittä -tilanteet.</p>
</details>`;

// Skater on-ice xG (skater_game_onice_xg, `sync_xg --backfill-onice`): the xG
// the player's team generated/conceded while he was on the ice. xGF% =
// xGF / (xGF + xGA).
interface SkaterOnIceXg {
  xgf: number;
  xga: number;
  xgf5v5: number;
  xga5v5: number;
}

export async function fetchSkaterOnIceXg(db: D1Database, playerId: number, season: number): Promise<SkaterOnIceXg | null> {
  try {
    const row = await db
      .prepare(
        "SELECT SUM(xgf) AS xgf, SUM(xga) AS xga, SUM(xgf_5v5) AS xgf5, SUM(xga_5v5) AS xga5 FROM skater_game_onice_xg WHERE player_id = ? AND season = ?",
      )
      .bind(playerId, season)
      .first<{ xgf: number | null; xga: number | null; xgf5: number | null; xga5: number | null }>();
    return row && row.xgf !== null
      ? { xgf: row.xgf, xga: row.xga ?? 0, xgf5v5: row.xgf5 ?? 0, xga5v5: row.xga5 ?? 0 }
      : null;
  } catch (error) {
    console.error(`Skater on-ice xG lookup failed for ${playerId}:`, error);
    return null;
  }
}

export function xgPercent(xgf: number, xga: number): string {
  return xgf + xga > 0 ? `${((xgf / (xgf + xga)) * 100).toFixed(1)} %` : "–";
}

// ---- Team xGF% (team_game_xg) ----

// games/standings_rows carry only abbrevs, team_game_xg only NHL team ids.
const TEAM_IDS: Record<string, number> = {
  ANA: 24, BOS: 6, BUF: 7, CAR: 12, CBJ: 29, CGY: 20, CHI: 16, COL: 21, DAL: 25, DET: 17, EDM: 22, FLA: 13, LAK: 26, MIN: 30, MTL: 8, NJD: 1,
  NSH: 18, NYI: 2, NYR: 3, OTT: 9, PHI: 4, PIT: 5, SEA: 55, SJS: 28, STL: 19, TBL: 14, TOR: 10, UTA: 68, VAN: 23, VGK: 54, WPG: 52, WSH: 15,
};

export interface TeamXg {
  xgf: number;
  xga: number;
  xgf5v5: number;
  xga5v5: number;
}

export function xgfPct(xgf: number, xga: number): number | null {
  return xgf + xga > 0 ? (100 * xgf) / (xgf + xga) : null;
}

export function formatPct(value: number | null): string {
  return value === null ? "–" : `${value.toFixed(1)} %`;
}

const TEAM_XG_SUMS = "SUM(xgf) AS xgf, SUM(xga) AS xga, SUM(xgf_5v5) AS xgf5v5, SUM(xga_5v5) AS xga5v5";

// Latest season's totals for a team (regular season only), or null before
// the team has any rows.
export async function fetchTeamSeasonXg(db: D1Database, abbrev: string): Promise<TeamXg | null> {
  const teamId = TEAM_IDS[abbrev];
  if (!teamId) return null;
  try {
    const row = await db
      .prepare(
        `SELECT ${TEAM_XG_SUMS} FROM team_game_xg WHERE team_id = ? AND season = (SELECT MAX(season) FROM team_game_xg WHERE team_id = ?)`,
      )
      .bind(teamId, teamId)
      .first<{ xgf: number | null; xga: number; xgf5v5: number; xga5v5: number }>();
    return row && row.xgf !== null ? (row as TeamXg) : null;
  } catch (error) {
    console.error(`Team xG lookup failed for ${abbrev}:`, error);
    return null;
  }
}

// One finished game's team xG, keyed by side.
export async function fetchGameTeamXg(db: D1Database, gameId: number, awayAbbrev: string, homeAbbrev: string): Promise<{ away: TeamXg; home: TeamXg } | null> {
  try {
    const { results } = await db
      .prepare("SELECT team_id, xgf, xga, xgf_5v5 AS xgf5v5, xga_5v5 AS xga5v5 FROM team_game_xg WHERE game_id = ?")
      .bind(gameId)
      .all<TeamXg & { team_id: number }>();
    const away = results.find((r) => r.team_id === TEAM_IDS[awayAbbrev]);
    const home = results.find((r) => r.team_id === TEAM_IDS[homeAbbrev]);
    return away && home ? { away, home } : null;
  } catch (error) {
    console.error(`Game team xG lookup failed for ${gameId}:`, error);
    return null;
  }
}

// Two TeamStatRow-shaped rows (all situations, 5v5) for the stat-bar renderer.
export function teamXgStatRows(
  away: TeamXg,
  home: TeamXg,
  withTotals = false,
  ranks?: { away: { pct?: number; pct5v5?: number }; home: { pct?: number; pct5v5?: number } },
): { label: string; away_value: string; home_value: string; away_pct?: number; home_pct?: number; away_rank?: number; home_rank?: number }[] {
  const row = (label: string, a: number | null, h: number | null, key?: "pct" | "pct5v5") => ({
    label,
    ...(key && ranks ? { away_rank: ranks.away[key], home_rank: ranks.home[key] } : {}),
    away_value: formatPct(a),
    home_value: formatPct(h),
    ...(a !== null && h !== null && a + h > 0 ? { away_pct: (100 * a) / (a + h), home_pct: (100 * h) / (a + h) } : {}),
  });
  const total = withTotals
    ? [{ label: "xG", away_value: away.xgf.toFixed(2), home_value: home.xgf.toFixed(2), ...(away.xgf + home.xgf > 0 ? { away_pct: (100 * away.xgf) / (away.xgf + home.xgf), home_pct: (100 * home.xgf) / (away.xgf + home.xgf) } : {}) }]
    : [];
  return [
    ...total,
    row("xGF%", xgfPct(away.xgf, away.xga), xgfPct(home.xgf, home.xga), "pct"),
    row("xGF% 5v5", xgfPct(away.xgf5v5, away.xga5v5), xgfPct(home.xgf5v5, home.xga5v5), "pct5v5"),
  ];
}

// game_id -> on-ice xGF% (all situations, 0-100) for one skater's season.
export async function fetchSkaterGameOnIcePct(db: D1Database, playerId: number, season: number): Promise<Map<number, number>> {
  try {
    const { results } = await db
      .prepare("SELECT game_id, xgf, xga FROM skater_game_onice_xg WHERE player_id = ? AND season = ?")
      .bind(playerId, season)
      .all<{ game_id: number; xgf: number; xga: number }>();
    return new Map(results.filter((r) => r.xgf + r.xga > 0).map((r) => [r.game_id, (100 * r.xgf) / (r.xgf + r.xga)]));
  } catch (error) {
    console.error(`Per-game on-ice xG lookup failed for ${playerId}/${season}:`, error);
    return new Map();
  }
}

export function teamIdOf(abbrev: string): number | undefined {
  return TEAM_IDS[abbrev];
}

// Every team's latest-season totals (+ games played), keyed by team_id, for
// league ranks on the team page.
export async function fetchLeagueTeamXg(db: D1Database): Promise<Map<number, TeamXg & { games: number }>> {
  try {
    const { results } = await db
      .prepare(
        `SELECT team_id, COUNT(*) AS games, ${TEAM_XG_SUMS} FROM team_game_xg WHERE season = (SELECT MAX(season) FROM team_game_xg) GROUP BY team_id`,
      )
      .all<TeamXg & { team_id: number; games: number }>();
    return new Map(results.map((r) => [r.team_id, r]));
  } catch (error) {
    console.error("League team xG lookup failed:", error);
    return new Map();
  }
}

// Rank = 1 + teams strictly ahead (ties share a rank).
export function rankIn(own: number, all: number[], higherIsBetter: boolean): number {
  return 1 + all.filter((v) => (higherIsBetter ? v > own : v < own)).length;
}

export function rankBadge(rank: number | undefined): string {
  return rank ? `<span class="rank-badge" title="Sija NHL:ssä">#${rank}</span>` : "";
}

// League rank of a team's xGF% (all situations / 5v5) among fetchLeagueTeamXg's teams.
export function teamXgfRanks(league: Map<number, TeamXg & { games: number }>, abbrev: string): { pct?: number; pct5v5?: number } {
  const id = TEAM_IDS[abbrev];
  const own = id === undefined ? undefined : league.get(id);
  if (!own) return {};
  const all = [...league.values()];
  const pct = (r: TeamXg, five: boolean) => xgfPct(five ? r.xgf5v5 : r.xgf, five ? r.xga5v5 : r.xga) ?? 0;
  return { pct: rankIn(pct(own, false), all.map((r) => pct(r, false)), true), pct5v5: rankIn(pct(own, true), all.map((r) => pct(r, true)), true) };
}

// Latest season's per-player xG (skaters) / GSAx (goalies) for a few players in one query.
async function fetchSeasonSums(db: D1Database, table: string, expr: string, ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  try {
    const { results } = await db
      .prepare(
        `SELECT player_id, SUM(${expr}) AS v FROM ${table} WHERE player_id IN (${ids.map(() => "?").join(",")}) AND season = (SELECT MAX(season) FROM ${table}) GROUP BY player_id`,
      )
      .bind(...ids)
      .all<{ player_id: number; v: number | null }>();
    return new Map(results.filter((r) => r.v !== null).map((r) => [r.player_id, r.v as number]));
  } catch (error) {
    console.error(`Season ${table} lookup failed:`, error);
    return new Map();
  }
}

export const fetchGoaliesSeasonGsaxMap = (db: D1Database, ids: number[]) => fetchSeasonSums(db, "goalie_game_xg", "xga - goals_against", ids);

// --- Finished-game report: per-player xG / GSAx for one game ---------------
// player_id -> ixG (skaters) and player_id -> GSAx (goalies); empty maps when
// the sync hasn't processed the game, so the report hides the columns.
export async function fetchGamePlayerXg(
  db: D1Database,
  gameId: number,
): Promise<{ ixg: Map<number, number>; gsax: Map<number, number>; xgfPct: Map<number, number>; xgfPct5v5: Map<number, number> }> {
  try {
    const [s, g, o] = await Promise.all([
      db.prepare("SELECT player_id, xg AS v FROM skater_game_xg WHERE game_id = ?").bind(gameId).all<{ player_id: number; v: number }>(),
      db.prepare("SELECT player_id, xga - goals_against AS v FROM goalie_game_xg WHERE game_id = ?").bind(gameId).all<{ player_id: number; v: number }>(),
      db.prepare("SELECT player_id, xgf, xga, xgf_5v5, xga_5v5 FROM skater_game_onice_xg WHERE game_id = ?").bind(gameId).all<{ player_id: number; xgf: number; xga: number; xgf_5v5: number; xga_5v5: number }>(),
    ]);
    const pct = (key: "xgf" | "xgf_5v5", against: "xga" | "xga_5v5") =>
      new Map(o.results.flatMap((r) => { const v = xgfPct(r[key], r[against]); return v === null ? [] : [[r.player_id, v] as [number, number]]; }));
    return {
      ixg: new Map(s.results.map((r) => [r.player_id, r.v])),
      gsax: new Map(g.results.map((r) => [r.player_id, r.v])),
      xgfPct: pct("xgf", "xga"),
      xgfPct5v5: pct("xgf_5v5", "xga_5v5"),
    };
  } catch (error) {
    console.error(`Game player xG lookup failed for ${gameId}:`, error);
    return { ixg: new Map(), gsax: new Map(), xgfPct: new Map(), xgfPct5v5: new Map() };
  }
}

// ---- League team table (/joukkueet, /odotetut) ----

interface RankedTeamXg {
  abbrev: string;
  games: number;
  xgf: number;
  xga: number;
  pct: number;
  rankPct: number;
  rankXgf: number; // per game
  rankXga: number; // per game, fewer is better
}

// Every team with rows in `league`, best xGF% first, with league ranks.
export function rankedTeamXg(league: Map<number, TeamXg & { games: number }>): RankedTeamXg[] {
  const rows = Object.entries(TEAM_IDS).flatMap(([abbrev, id]) => {
    const r = league.get(id);
    return r ? [{ abbrev, games: r.games, xgf: r.xgf, xga: r.xga, pct: xgfPct(r.xgf, r.xga) ?? 0 }] : [];
  });
  const pg = (v: number, g: number) => (g > 0 ? v / g : 0);
  return rows
    .map((r) => ({
      ...r,
      rankPct: rankIn(r.pct, rows.map((x) => x.pct), true),
      rankXgf: rankIn(pg(r.xgf, r.games), rows.map((x) => pg(x.xgf, x.games)), true),
      rankXga: rankIn(pg(r.xga, r.games), rows.map((x) => pg(x.xga, x.games)), false),
    }))
    .sort((a, b) => b.pct - a.pct);
}

// ---- Game preview: players to watch (on-ice xGF% + points tie-break) ----

// player_id -> latest-season on-ice xGF% (all situations, 0-100).
export async function fetchSkatersOnIcePctMap(db: D1Database, ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  try {
    const { results } = await db
      .prepare(
        `SELECT player_id, SUM(xgf) AS xgf, SUM(xga) AS xga FROM skater_game_onice_xg WHERE player_id IN (${ids.map(() => "?").join(",")}) AND season = (SELECT MAX(season) FROM skater_game_onice_xg) GROUP BY player_id`,
      )
      .bind(...ids)
      .all<{ player_id: number; xgf: number; xga: number }>();
    return new Map(
      results.flatMap((r) => {
        const p = xgfPct(r.xgf, r.xga);
        return p === null ? [] : [[r.player_id, p] as [number, number]];
      }),
    );
  } catch (error) {
    console.error("Skater on-ice xGF% map lookup failed:", error);
    return new Map();
  }
}

interface WatchSkater {
  player_id: number;
  position: string;
  points: number;
  goals: number;
}

// Points desc, goals desc, last season's points desc; Array.sort is stable so
// a remaining tie keeps the roster order.
export function sortWatchSkaters<T extends WatchSkater>(skaters: T[], prevPoints: Map<number, number>): T[] {
  return [...skaters].sort(
    (a, b) => b.points - a.points || b.goals - a.goals || (prevPoints.get(b.player_id) ?? 0) - (prevPoints.get(a.player_id) ?? 0),
  );
}

// Only players tied (points+goals) with the top scorer, the top D or the
// second D (the D pick when the top scorer is a D) need last season's points.
// `skaters` must already be ordered points desc, goals desc.
export function tiedWatchIds(skaters: WatchSkater[]): number[] {
  const same = (a: WatchSkater, b: WatchSkater) => a.points === b.points && a.goals === b.goals;
  const defence = skaters.filter((p) => p.position === "D");
  const ids = new Set<number>();
  for (const [pool, anchor] of [[skaters, skaters[0]], [defence, defence[0]], [defence, defence[1]]] as [WatchSkater[], WatchSkater | undefined][]) {
    const tied = anchor ? pool.filter((p) => same(p, anchor)) : [];
    if (tied.length > 1) tied.forEach((p) => ids.add(p.player_id));
  }
  return [...ids];
}

// Regular-season NHL points in `season` (e.g. 20252026) per player, from the
// NHL landing endpoint (no D1 table keeps previous seasons); cached 24 h at
// the edge, failures count as 0.
export async function fetchPrevSeasonPoints(ids: number[], season: number): Promise<Map<number, number>> {
  const entries = await Promise.all(
    ids.map(async (id): Promise<[number, number]> => {
      try {
        const res = await fetch(`https://api-web.nhle.com/v1/player/${id}/landing`, { cf: { cacheTtl: 86400, cacheEverything: true } });
        if (!res.ok) return [id, 0];
        const landing = (await res.json()) as { seasonTotals?: { season: number; leagueAbbrev: string; gameTypeId: number; points?: number }[] };
        const pts = (landing.seasonTotals ?? [])
          .filter((s) => s.season === season && s.leagueAbbrev === "NHL" && s.gameTypeId === 2)
          .reduce((sum, s) => sum + (s.points ?? 0), 0);
        return [id, pts];
      } catch {
        return [id, 0];
      }
    }),
  );
  return new Map(entries);
}

// ---- Game-level goalie GSAx for many games in one query (game cards) ----
// game_id -> player_id -> GSAx; empty when the sync hasn't processed the games.
export async function fetchGamesGoalieGsax(db: D1Database, gameIds: number[]): Promise<Map<number, Map<number, number>>> {
  const out = new Map<number, Map<number, number>>();
  if (!gameIds.length) return out;
  try {
    const { results } = await db
      .prepare(`SELECT game_id, player_id, xga - goals_against AS v FROM goalie_game_xg WHERE game_id IN (${gameIds.map(() => "?").join(",")})`)
      .bind(...gameIds)
      .all<{ game_id: number; player_id: number; v: number }>();
    for (const r of results) {
      if (!out.has(r.game_id)) out.set(r.game_id, new Map());
      out.get(r.game_id)!.set(r.player_id, r.v);
    }
  } catch (error) {
    console.error("Games goalie GSAx lookup failed:", error);
  }
  return out;
}
