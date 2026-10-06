// xG (skaters) and GSAx (goalies) from the per-game rows that sync_xg.py
// writes to skater_game_xg / goalie_game_xg (regular season only). Season
// totals are summed here in the queries -- the tables hold only per-game
// rows. A player/game without rows (before the backfill, or the sync hasn't
// processed that game yet) just gets no xG value rather than a zero.

import type { Env } from "./types";

// GSAx/100 below this many shots faced is mostly noise, so the maalivahti-
// pörssi shows "–" instead of ranking it.
export const MIN_SHOTS_FOR_PER_100 = 500;

export interface SkaterSeasonXg {
  xg: number;
  goals: number;
  shots: number;
}

export interface GoalieSeasonXg {
  xga: number;
  goalsAgainst: number;
  shotsAgainst: number;
}

export interface GameXg {
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
  sataa kohdattua laukausta kohden, ja se näytetään vasta ${MIN_SHOTS_FOR_PER_100} laukauksen jälkeen.</p>
  <p>Malli on koulutettu NHL:n play-by-play-datalla kausilta 2023–24 – 2025–26 (tarkkuus AUC noin 0,79). Luvut ovat
  mallin raakatulosta eikä niitä ole skaalattu kauden maalimäärään, joten yksittäisen ottelun xG on kohinaista ja
  kausisummat ovat luotettavampia. Vain runkosarja.</p>
</details>`;

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
export function teamXgStatRows(away: TeamXg, home: TeamXg): { label: string; away_value: string; home_value: string; away_pct?: number; home_pct?: number }[] {
  const row = (label: string, a: number | null, h: number | null) => ({
    label,
    away_value: formatPct(a),
    home_value: formatPct(h),
    ...(a !== null && h !== null && a + h > 0 ? { away_pct: (100 * a) / (a + h), home_pct: (100 * h) / (a + h) } : {}),
  });
  return [
    row("xGF%", xgfPct(away.xgf, away.xga), xgfPct(home.xgf, home.xga)),
    row("xGF% 5v5", xgfPct(away.xgf5v5, away.xga5v5), xgfPct(home.xgf5v5, home.xga5v5)),
  ];
}
