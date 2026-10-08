// "Day's games" window logic for the dashboard, kept pure (no imports other
// than types) so scripts/test-day-games.ts can run it under plain Node.
//
// games.date is already the Europe/Helsinki calendar date of a game's start
// (computed at sync time), so "games of day D" is just date = D. The one
// wrinkle is the live carry-over: a game starting 22:00 and still going at
// 00:00 belongs to yesterday's date but must stay on the *today* view until
// it finishes.

import type { GameRow } from "./types";

// Browsable window: yesterday .. three days ahead (asymmetric).
export const MIN_DAY_OFFSET = -1;
export const MAX_DAY_OFFSET = 3;

// A game that has started but isn't finished yet. Primarily per the fast
// tier's own game_state, but that only updates every ~30 min, so a game
// whose scheduled start has passed counts as live even while the state
// still says "FUT" (otherwise a just-started game would show its pre-game
// preview for up to half an hour).
export function isGameLive(game: GameRow, now: number = Date.now()): boolean {
  if (game.is_finished) return false;
  // PRE = NHL's pre-game phase, opens ~30 min before puck drop: not live yet.
  if (game.game_state !== "FUT" && game.game_state !== "PRE") return true;
  return new Date(game.start_time_utc).getTime() <= now;
}

// Safety net: a game that started this long ago is never carried over, even
// if a stale/postponed row still says unfinished -- keeps it from sticking
// to the homepage forever. Longest real NHL game (multi-OT) is far under this.
const MAX_LIVE_AGE_MS = 8 * 60 * 60 * 1000;

// Parses the ?pv= query value: anything not an integer becomes 0, otherwise
// clamped to MIN_DAY_OFFSET..MAX_DAY_OFFSET (-1..+3).
export function clampDayOffset(raw: string | null | undefined): number {
  if (raw == null || !/^[+-]?\d+$/.test(raw.trim())) return 0;
  return Math.max(MIN_DAY_OFFSET, Math.min(MAX_DAY_OFFSET, parseInt(raw, 10)));
}

// Picks the games to show for `day` (YYYY-MM-DD, Helsinki). `rows` may
// contain games of `day` plus earlier-dated games. Games dated `day` are
// always included; earlier-dated games are included only on the today view
// (isToday) and only while live. Sorted by start time.
export function selectDayGames(rows: GameRow[], day: string, isToday: boolean, now: number = Date.now()): GameRow[] {
  return rows
    .filter((g) => {
      if (g.date === day) return true;
      if (!isToday || g.date > day) return false;
      return isGameLive(g, now) && now - new Date(g.start_time_utc).getTime() <= MAX_LIVE_AGE_MS;
    })
    .sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc) || a.game_id - b.game_id);
}

// Not live yet but about to drop: NHL says PRE, or puck drop is under 30 min
// away (game_state lags by up to ~30 min).
export function isStartingSoon(game: GameRow, now: number = Date.now()): boolean {
  if (game.is_finished || isGameLive(game, now)) return false;
  return game.game_state === "PRE" || new Date(game.start_time_utc).getTime() - now <= 30 * 60 * 1000;
}
