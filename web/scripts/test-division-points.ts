// Parity-style unit test for _shared/divisionPoints.ts -- pure function,
// no D1/network needed, run with Node's built-in TS stripping.

import assert from "node:assert/strict";
import { computeDivisionPointsRace } from "../functions/_shared/divisionPoints.ts";
import type { GameRow } from "../functions/_shared/types.ts";

function game(overrides: Partial<GameRow>): GameRow {
  return {
    game_id: 1,
    date: "2026-10-01",
    start_time_utc: "2026-10-01T23:00:00Z",
    away_abbrev: "CHI",
    away_name: "Chicago Blackhawks",
    away_logo: "",
    away_score: 0,
    home_abbrev: "DET",
    home_name: "Detroit Red Wings",
    home_logo: "",
    home_score: 0,
    game_state: "OFF",
    is_finished: 1,
    final_type: "REG",
    ...overrides,
  };
}

{
  const games: GameRow[] = [
    // CHI wins in regulation on the road (2p)
    game({ game_id: 1, date: "2026-10-05", away_abbrev: "CHI", away_score: 4, home_abbrev: "DET", home_score: 2, final_type: "REG" }),
    // CHI loses at home in OT (1p)
    game({ game_id: 2, date: "2026-10-07", away_abbrev: "TOR", away_score: 3, home_abbrev: "CHI", home_score: 2, final_type: "OT" }),
    // CHI loses on the road in regulation (0p)
    game({ game_id: 3, date: "2026-10-09", away_abbrev: "CHI", away_score: 1, home_abbrev: "DET", home_score: 5, final_type: "REG" }),
    // Unrelated game between two other teams -- must not leak into CHI's or DET's series
    game({ game_id: 4, date: "2026-10-10", away_abbrev: "TOR", away_score: 2, home_abbrev: "BOS", home_score: 1, final_type: "SO" }),
    // Unfinished game -- must be excluded
    game({ game_id: 5, date: "2026-10-12", away_abbrev: "CHI", away_score: 0, home_abbrev: "DET", home_score: 0, is_finished: 0 }),
  ];

  const [chi, det] = computeDivisionPointsRace(games, ["CHI", "DET"]);

  assert.equal(chi.abbrev, "CHI");
  assert.deepEqual(
    chi.points,
    [
      { date: "2026-10-05", points: 2 },
      { date: "2026-10-07", points: 3 },
      { date: "2026-10-09", points: 3 },
    ],
  );

  assert.equal(det.abbrev, "DET");
  assert.deepEqual(
    det.points,
    [
      { date: "2026-10-05", points: 0 },
      { date: "2026-10-09", points: 2 },
    ],
  );

  console.log("ok: computeDivisionPointsRace accumulates REG/OT/SO results per team and ignores other teams' games");
}

{
  const games: GameRow[] = [
    game({ game_id: 1, date: "2026-10-05", away_abbrev: "CHI", away_score: 1, home_abbrev: "DET", home_score: 0, final_type: "REG" }),
  ];
  const [chi] = computeDivisionPointsRace(games, ["CHI"]);
  assert.equal(chi.points.length, 1);
  console.log("ok: computeDivisionPointsRace handles a single team with a single game");
}

{
  const [empty] = computeDivisionPointsRace([], ["CHI"]);
  assert.deepEqual(empty.points, []);
  console.log("ok: computeDivisionPointsRace returns an empty series when no games exist yet");
}

console.log("\nAll divisionPoints.ts tests passed.");
