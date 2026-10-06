import assert from "node:assert/strict";
import { buildWildCardView, formatPointsPct, sortStandings } from "../functions/_shared/standingsViews.ts";
import type { StandingsRow } from "../functions/_shared/types.ts";

function row(o: Partial<StandingsRow>): StandingsRow {
  return {
    abbrev: "AAA", as_of_date: "2026-10-01", name: "A", logo: "", conference: "Eastern", division: "Atlantic",
    division_rank: 1, wildcard_rank: 0, qualified: 0, games_played: 2, wins: 1, losses: 1, ot_losses: 0,
    points: 2, goal_differential: 0, ...o,
  };
}

assert.equal(formatPointsPct(5, 3), ".833");
assert.equal(formatPointsPct(4, 2), "1.000");
assert.equal(formatPointsPct(0, 3), ".000");
assert.equal(formatPointsPct(0, 0), ".000");

const sorted = sortStandings([
  row({ abbrev: "B", points: 4, games_played: 3 }),
  row({ abbrev: "A", points: 4, games_played: 2 }),
  row({ abbrev: "C", points: 5, games_played: 3 }),
  row({ abbrev: "D", points: 4, games_played: 2, wins: 2 }),
]);
assert.deepEqual(sorted.map((r) => r.abbrev), ["C", "D", "A", "B"]);

const view = buildWildCardView([
  row({ abbrev: "A1", division: "Atlantic", division_rank: 1 }),
  row({ abbrev: "A4", division: "Atlantic", division_rank: 4, wildcard_rank: 2 }),
  row({ abbrev: "A3", division: "Atlantic", division_rank: 3 }),
  row({ abbrev: "A5", division: "Atlantic", division_rank: 5, wildcard_rank: 1 }),
  row({ abbrev: "M1", division: "Metro", division_rank: 1 }),
  row({ abbrev: "W1", conference: "Western", division: "Central", division_rank: 1 }),
]);
assert.deepEqual(view.map((c) => c.conference), ["Eastern", "Western"]);
assert.deepEqual(view[0].leaders[0].rows.map((r) => r.abbrev), ["A1", "A3"]);
assert.deepEqual(view[0].race.map((r) => r.abbrev), ["A5", "A4"]);
console.log("standings views tests passed");
