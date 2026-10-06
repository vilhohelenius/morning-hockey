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
  <p><strong>xGF%</strong>: kentällä olon aikana pelaajan joukkueen luoma xG jaettuna luodun ja päästetyn xG:n summalla.
  Yli 50 % tarkoittaa, että joukkue on hallinnut pelaajan jäällä ollessa. 5v5 laskee vain viisi viittä -tilanteet.</p>
</details>`;

// Skater on-ice xG (skater_game_onice_xg, `sync_xg --backfill-onice`): the xG
// the player's team generated/conceded while he was on the ice. xGF% =
// xGF / (xGF + xGA).
export interface SkaterOnIceXg {
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
