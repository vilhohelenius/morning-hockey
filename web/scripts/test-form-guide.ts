// Parity-style unit test for _shared/formGuide.ts -- pure function, no
// D1/network needed, run with Node's built-in TS stripping.

import assert from "node:assert/strict";
import { computeFormGuide } from "../functions/_shared/formGuide.ts";
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
    // Oldest first in the fixture; computeFormGuide must reorder internally.
    game({ game_id: 1, date: "2026-10-05", away_abbrev: "CHI", away_score: 4, home_abbrev: "DET", home_score: 2, final_type: "REG" }), // CHI win (2p)
    game({ game_id: 2, date: "2026-10-07", away_abbrev: "TOR", away_score: 3, home_abbrev: "CHI", home_score: 2, final_type: "OT" }), // CHI OTL (1p)
    game({ game_id: 3, date: "2026-10-09", away_abbrev: "CHI", away_score: 1, home_abbrev: "DET", home_score: 5, final_type: "REG" }), // CHI loss (0p)
    // Unrelated game between two other teams -- must not leak into CHI's series
    game({ game_id: 4, date: "2026-10-10", away_abbrev: "TOR", away_score: 2, home_abbrev: "BOS", home_score: 1, final_type: "SO" }),
    // Unfinished game -- must be excluded
    game({ game_id: 5, date: "2026-10-12", away_abbrev: "CHI", away_score: 0, home_abbrev: "DET", home_score: 0, is_finished: 0 }),
  ];

  const [chi] = computeFormGuide(games, ["CHI"], 10);

  assert.equal(chi.abbrev, "CHI");
  assert.deepEqual(chi.results, ["W", "OTL", "L"]);
  assert.equal(chi.wins, 1);
  assert.equal(chi.losses, 1);
  assert.equal(chi.otLosses, 1);
  assert.equal(chi.points, 3);
  assert.equal(chi.maxPoints, 6);
  assert.equal(chi.pointsPct, 0.5);

  console.log("ok: computeFormGuide accumulates W/OTL/L over a team's own games and ignores other teams'");
}

{
  // windowSize smaller than games played -> only the most recent N, still chronological.
  const games: GameRow[] = [
    game({ game_id: 1, date: "2026-10-01", away_abbrev: "CHI", away_score: 5, home_abbrev: "DET", home_score: 1, final_type: "REG" }), // win, outside window
    game({ game_id: 2, date: "2026-10-03", away_abbrev: "CHI", away_score: 0, home_abbrev: "DET", home_score: 3, final_type: "REG" }), // loss
    game({ game_id: 3, date: "2026-10-05", away_abbrev: "CHI", away_score: 4, home_abbrev: "DET", home_score: 2, final_type: "REG" }), // win
  ];

  const [chi] = computeFormGuide(games, ["CHI"], 2);
  assert.deepEqual(chi.results, ["L", "W"]);
  assert.equal(chi.maxPoints, 4);

  console.log("ok: computeFormGuide only keeps the most recent windowSize games, in chronological order");
}

{
  const [empty] = computeFormGuide([], ["CHI"], 10);
  assert.deepEqual(empty.results, []);
  assert.equal(empty.maxPoints, 0);
  assert.equal(empty.pointsPct, 0);
  console.log("ok: computeFormGuide handles a team with no games yet without dividing by zero");
}

{
  // Ranking: higher points percentage sorts first, ties broken by raw points.
  const games: GameRow[] = [
    game({ game_id: 1, date: "2026-10-05", away_abbrev: "CHI", away_score: 4, home_abbrev: "DET", home_score: 2, final_type: "REG" }), // CHI: 1 game, 2/2
    game({ game_id: 2, date: "2026-10-05", away_abbrev: "TOR", away_score: 2, home_abbrev: "BOS", home_score: 1, final_type: "OT" }), // TOR: 1 game, 2/2
    game({ game_id: 3, date: "2026-10-07", away_abbrev: "TOR", away_score: 5, home_abbrev: "BOS", home_score: 1, final_type: "REG" }), // TOR: 2 games, 4/4
  ];

  const ranked = computeFormGuide(games, ["CHI", "TOR"], 10);
  assert.deepEqual(ranked.map((r) => r.abbrev), ["TOR", "CHI"]);

  console.log("ok: computeFormGuide ranks by points percentage, tie-broken by raw points earned");
}

console.log("\nAll formGuide.ts tests passed.");
