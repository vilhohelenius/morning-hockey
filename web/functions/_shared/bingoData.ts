// D1 + box-score side of Pistemiesbingo (pure logic lives in bingo.ts).

import { getBoxScore } from "./boxScoreCache";
import { isLive, liveBadgeText } from "./gameCard";
import { addDays, helsinkiToday, teamLogoUrl } from "./format";
import {
  buildBingoRows,
  currentNight,
  gameNight,
  hasStarted,
  pickPhase,
  type BingoGame,
  type BingoGameData,
  type BingoPick,
  type BingoRow,
  type PickPhase,
} from "./bingo";
import type { GameRow } from "./types";

export const MAX_PICKS_PER_ROUND = 25;

export interface PickView extends BingoPick {
  round_date: string;
  phase: PickPhase;
}

interface PickRow {
  player_id: number;
  round_date: string;
  name: string | null;
  headshot: string | null;
  position: string | null;
  team_abbrev: string | null;
}

// Games around now (a few days back covers the current night, a few ahead
// the next one); small, indexed by date.
export async function loadWindowGames(db: D1Database): Promise<GameRow[]> {
  const today = helsinkiToday();
  const { results } = await db
    .prepare("SELECT * FROM games WHERE date >= ? AND date <= ? ORDER BY start_time_utc ASC")
    .bind(addDays(today, -3), addDays(today, 5))
    .all<GameRow>();
  return results;
}

export async function loadPicks(db: D1Database, username: string, games: BingoGame[], nowMs: number): Promise<PickView[]> {
  const { results } = await db
    .prepare(
      `SELECT b.player_id, b.round_date, r.name, r.headshot, r.position, r.team_abbrev
       FROM bingo_picks b LEFT JOIN team_roster_skaters r ON r.player_id = b.player_id
       WHERE b.username = ? ORDER BY b.round_date, r.name`,
    )
    .bind(username)
    .all<PickRow>();
  const current = currentNight(games, nowMs);
  return results.map((r) => ({
    player_id: r.player_id,
    name: r.name ?? `Pelaaja #${r.player_id}`,
    headshot: r.headshot ?? "",
    position: r.position ?? "",
    team_abbrev: r.team_abbrev ?? "",
    team_logo: r.team_abbrev ? teamLogoUrl(r.team_abbrev) : "",
    round_date: r.round_date,
    phase: pickPhase(r.round_date, current, nowMs),
  }));
}

// Rows of the active slip for the current night. Box scores come from the
// shared cache (getBoxScore); only games of picked players' teams that have
// started are looked up.
export async function loadActiveRows(
  db: D1Database,
  allGames: GameRow[],
  picks: PickView[],
  nowMs: number,
): Promise<BingoRow[]> {
  const current = currentNight(allGames, nowMs);
  const active = picks.filter((p) => p.phase === "active");
  if (!current || !active.length) return [];
  const teams = new Set(active.map((p) => p.team_abbrev));
  const nightGames = allGames.filter(
    (g) => gameNight(g.start_time_utc) === current && (teams.has(g.away_abbrev) || teams.has(g.home_abbrev)),
  );
  const data: BingoGameData[] = [];
  for (const game of nightGames) {
    const started = hasStarted(game, nowMs);
    const box = started ? (await getBoxScore(db, game)).box : null;
    const live = !game.is_finished && isLive(game);
    data.push({
      game,
      live,
      liveText: live && box ? liveBadgeText(box.live ?? null) : live ? "LIVE" : "",
      awaySkaters: box?.awaySkaters ?? [],
      homeSkaters: box?.homeSkaters ?? [],
      boxLoaded: !!box,
    });
  }
  return buildBingoRows(active, data, nowMs);
}
