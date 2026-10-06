// Unit test for _shared/dayGames.ts -- pure functions, run with Node's
// built-in TS stripping.

import assert from "node:assert/strict";
import { clampDayOffset, selectDayGames } from "../functions/_shared/dayGames.ts";
import type { GameRow } from "../functions/_shared/types.ts";

function game(overrides: Partial<GameRow>): GameRow {
  return {
    game_id: 1,
    date: "2026-10-06",
    start_time_utc: "2026-10-06T23:00:00Z",
    away_abbrev: "CHI",
    away_name: "Chicago Blackhawks",
    away_logo: "",
    away_score: 0,
    home_abbrev: "DET",
    home_name: "Detroit Red Wings",
    home_logo: "",
    home_score: 0,
    game_state: "FUT",
    is_finished: 0,
    final_type: "REG",
    ...overrides,
  };
}

const ids = (gs: GameRow[]) => gs.map((g) => g.game_id);

assert.equal(clampDayOffset(null), 0);
assert.equal(clampDayOffset(""), 0);
assert.equal(clampDayOffset("abc"), 0);
assert.equal(clampDayOffset("1.5"), 0);
assert.equal(clampDayOffset("-1"), -1);
assert.equal(clampDayOffset("1"), 1);
assert.equal(clampDayOffset("+1"), 1);
assert.equal(clampDayOffset("7"), 1);
assert.equal(clampDayOffset("-9"), -1);

const day = "2026-10-06";
// 00:30 Helsinki on the 6th (= 21:30Z on the 5th)
const now = Date.parse("2026-10-05T21:30:00Z");

const rows = [
  game({ game_id: 3, date: day, start_time_utc: "2026-10-06T16:00:00Z" }),
  game({ game_id: 2, date: day, start_time_utc: "2026-10-06T12:00:00Z" }),
  // Yesterday 22:00 Helsinki (19:00Z), still live at 00:30
  game({ game_id: 10, date: "2026-10-05", start_time_utc: "2026-10-05T19:00:00Z", game_state: "LIVE" }),
  // Yesterday, finished before midnight
  game({ game_id: 11, date: "2026-10-05", start_time_utc: "2026-10-05T14:00:00Z", game_state: "OFF", is_finished: 1 }),
  // Yesterday, state stale at FUT but start has passed -> counts as live
  game({ game_id: 12, date: "2026-10-05", start_time_utc: "2026-10-05T20:00:00Z" }),
  // Stale unfinished row from long ago: not carried over
  game({ game_id: 13, date: "2026-10-05", start_time_utc: "2026-10-04T20:00:00Z", game_state: "LIVE" }),
];

// Today view: own games + live carry-over, sorted by start time
assert.deepEqual(ids(selectDayGames(rows, day, true, now)), [10, 12, 2, 3]);

// Once game 10 finishes it drops out
const finished = rows.map((g) => (g.game_id === 10 ? { ...g, game_state: "OFF", is_finished: 1 } : g));
assert.deepEqual(ids(selectDayGames(finished, day, true, now)), [12, 2, 3]);

// Browsing another day: no carry-over
assert.deepEqual(ids(selectDayGames(rows, day, false, now)), [2, 3]);

// Later-dated games never leak into an earlier day's view
assert.deepEqual(ids(selectDayGames([game({ game_id: 20, date: "2026-10-07" })], day, true, now)), []);

console.log("test-day-games: ok");
