// Plain-node parity test for _shared/boxscore.ts against the exact fixtures
// and expected values from tests/test_boxscore.py, run with Node's built-in
// TS stripping (`node --experimental-strip-types`) -- no wrangler/D1/network
// needed, since buildGoalEvents/buildTeamStats are pure functions. This is
// the one piece of phase 5 fully verifiable without a live NHL API call or
// a deployed Worker; the on-demand fetch route itself isn't testable from
// here (this sandbox's egress proxy blocks api-web.nhle.com) and needs a
// live check once deployed.

import assert from "node:assert/strict";
import { buildGoalEvents, buildPreviewTeamStats, buildTeamStats } from "../functions/_shared/boxscore.ts";
import type { TeamSeasonStatsRow } from "../functions/_shared/types.ts";

const SCORING_BY_PERIOD = [
  { periodDescriptor: { number: 1, periodType: "REG" }, goals: [] },
  {
    periodDescriptor: { number: 2, periodType: "REG" },
    goals: [
      {
        playerId: 1,
        firstName: { default: "Gustav" },
        lastName: { default: "Forsling" },
        teamAbbrev: { default: "FLA" },
        timeInPeriod: "04:55",
        strength: "ev",
        assists: [{ playerId: 2, firstName: { default: "Carter" }, lastName: { default: "Verhaeghe" } }],
      },
    ],
  },
  {
    periodDescriptor: { number: 4, periodType: "OT" },
    goals: [
      {
        playerId: 3,
        firstName: { default: "Sebastian" },
        lastName: { default: "Aho" },
        teamAbbrev: { default: "CAR" },
        timeInPeriod: "01:23",
        strength: "pp",
        assists: [],
      },
    ],
  },
];

{
  const events = buildGoalEvents(SCORING_BY_PERIOD, "FLA", "CAR", new Set());
  assert.equal(events.length, 2);
  const [first, second] = events;

  assert.equal(first.period_label, "2. erä");
  assert.equal(first.time_in_period, "04:55");
  assert.equal(first.team_abbrev, "FLA");
  assert.equal(first.scorer, "Gustav Forsling");
  assert.deepEqual(first.assists, ["Carter Verhaeghe"]);
  assert.equal(first.strength, "");
  assert.equal(first.away_score, 1);
  assert.equal(first.home_score, 0);

  assert.equal(second.period_label, "Jatkoaika");
  assert.equal(second.scorer, "Sebastian Aho");
  assert.deepEqual(second.assists, []);
  assert.equal(second.strength, "YV");
  assert.equal(second.away_score, 1);
  assert.equal(second.home_score, 1);
  console.log("ok: build_goal_events labels periods and carries full names");
}

{
  const events = buildGoalEvents(SCORING_BY_PERIOD, "FLA", "CAR", new Set([2]));
  assert.equal(events[0].scorer, "Gustav Forsling");
  assert.deepEqual(events[0].assists, ["Carter Verhaeghe 🇫🇮"]);
  console.log("ok: build_goal_events flags Finnish scorers and assisters");
}

const TEAM_GAME_STATS = [
  { category: "sog", awayValue: 20, homeValue: 15 },
  { category: "faceoffWinningPctg", awayValue: 0.413793, homeValue: 0.586207 },
  { category: "powerPlay", awayValue: "0/7", homeValue: "1/6" },
  { category: "powerPlayPctg", awayValue: 0.0, homeValue: 0.166667 },
  { category: "pim", awayValue: 17, homeValue: 19 },
  { category: "hits", awayValue: 24, homeValue: 19 },
  { category: "blockedShots", awayValue: 11, homeValue: 21 },
  { category: "giveaways", awayValue: 12, homeValue: 15 },
  { category: "takeaways", awayValue: 4, homeValue: 4 },
];

{
  const rows = buildTeamStats(TEAM_GAME_STATS, 1, 2);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));

  assert.equal(byLabel["Laukaukset"].away_value, "20");
  assert.equal(byLabel["Laukaukset"].home_value, "15");
  assert.equal(byLabel["Torjuntaprosentti"].away_value, "86.7 %");
  assert.equal(byLabel["Torjuntaprosentti"].home_value, "95.0 %");
  assert.equal(byLabel["Ylivoima (YV%)"].away_value, "0/7 (0.0 %)");
  assert.equal(byLabel["Ylivoima (YV%)"].home_value, "1/6 (16.7 %)");
  assert.equal(byLabel["Alivoima (AV%)"].away_value, "83.3 %");
  assert.equal(byLabel["Alivoima (AV%)"].home_value, "100.0 %");
  assert.equal(byLabel["Aloitusprosentti"].away_value, "41.4 %");
  assert.equal(byLabel["Jäähyt (min)"].home_value, "19");
  assert.equal(byLabel["Taklaukset"].away_value, "24");
  assert.equal(byLabel["Taklaukset"].home_value, "19");
  assert.equal(byLabel["Torjutut laukaukset"].away_value, "11");
  assert.equal(byLabel["Torjutut laukaukset"].home_value, "21");
  assert.equal(byLabel["Menetetyt kiekot"].away_value, "12");
  assert.equal(byLabel["Menetetyt kiekot"].home_value, "15");
  assert.equal(byLabel["Riistetyt kiekot"].away_value, "4");
  assert.equal(byLabel["Riistetyt kiekot"].home_value, "4");
  console.log("ok: build_team_stats computes save pct from score and shots, and carries hits/blocks/giveaways/takeaways");
}

{
  const rows = buildTeamStats(TEAM_GAME_STATS, 1, 2);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));

  // Larger side of each count-based row fills its full half; the other is
  // proportional to it. Blocked shots: away 11, home 21 -> home is max.
  assert.equal(byLabel["Torjutut laukaukset"].home_pct, 100);
  assert.ok(Math.abs(byLabel["Torjutut laukaukset"].away_pct! - (11 / 21) * 100) < 1e-6);
  // Equal takeaways (4/4) both fill 100%.
  assert.equal(byLabel["Riistetyt kiekot"].away_pct, 100);
  assert.equal(byLabel["Riistetyt kiekot"].home_pct, 100);
  // Percentage rows use the percentage itself, not a relative split.
  assert.ok(Math.abs(byLabel["Aloitusprosentti"].away_pct! - 41.3793) < 1e-3);
  assert.ok(Math.abs(byLabel["Aloitusprosentti"].home_pct! - 58.6207) < 1e-3);
  console.log("ok: build_team_stats bar percentages scale count rows by their max and percentage rows directly");
}

{
  const stats = [
    { category: "powerPlay", awayValue: "0/0", homeValue: "2/5" },
    { category: "powerPlayPctg", awayValue: 0.0, homeValue: 0.4 },
  ];
  const rows = buildTeamStats(stats, 1, 2);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(byLabel["Ylivoima (YV%)"].away_value, "–");
  assert.equal(byLabel["Ylivoima (YV%)"].home_value, "2/5 (40.0 %)");
  console.log("ok: build_team_stats shows a dash for zero power play opportunities");
}

{
  const away: TeamSeasonStatsRow = {
    team_abbrev: "TOR",
    games_played: 7,
    goals_for: 25,
    goals_against: 18,
    power_play_pct: 0.24,
    penalty_kill_pct: 0.82,
    faceoff_pct: 0.51,
    shots_for_per_game: 32.1,
    shots_against_per_game: 27.4,
    shutouts: 1,
    updated_at: "2026-09-30T12:00:00Z",
  };
  const home: TeamSeasonStatsRow = {
    team_abbrev: "TBL",
    games_played: 7,
    goals_for: 28,
    goals_against: 20,
    power_play_pct: 0.27,
    penalty_kill_pct: 0.79,
    faceoff_pct: 0.49,
    shots_for_per_game: 33.4,
    shots_against_per_game: 29.0,
    shutouts: 1,
    updated_at: "2026-09-30T12:00:00Z",
  };

  const rows = buildPreviewTeamStats(away, home, [away, home]);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));

  assert.equal(byLabel["Ylivoima (YV%)"].away_value, "24.0 %");
  assert.equal(byLabel["Ylivoima (YV%)"].home_value, "27.0 %");
  assert.equal(byLabel["Alivoima (AV%)"].away_value, "82.0 %");
  assert.equal(byLabel["Aloitusprosentti"].home_value, "49.0 %");

  // 25/7 = 3.5714..., 28/7 = 4.0 -- the bar is a continuous share-of-total
  // split (away/(away+home)), matching NHL.com's own Team Stats bar, not
  // the Game Stats section's "larger side fills its own half" split.
  assert.equal(byLabel["Maalia / ottelu"].away_value, "3.57");
  assert.equal(byLabel["Maalia / ottelu"].home_value, "4.00");
  const expectedAwayShare = (3.5714285714 / (3.5714285714 + 4)) * 100;
  assert.ok(Math.abs(byLabel["Maalia / ottelu"].away_pct! - expectedAwayShare) < 1e-3);
  assert.ok(Math.abs(byLabel["Maalia / ottelu"].home_pct! - (100 - expectedAwayShare)) < 1e-3);

  assert.equal(byLabel["Päästetyt / ottelu"].away_value, "2.57");
  assert.equal(byLabel["Päästetyt / ottelu"].home_value, "2.86");

  // Among just [away, home]: home (TBL) has the better (higher) GF/GP ->
  // rank 1 for home, 2 for away. Home also has the worse (higher) GA/GP ->
  // rank 2 for home, 1 for away there, since lower GA/GP is better.
  assert.equal(byLabel["Maalia / ottelu"].away_rank, 2);
  assert.equal(byLabel["Maalia / ottelu"].home_rank, 1);
  assert.equal(byLabel["Päästetyt / ottelu"].away_rank, 1);
  assert.equal(byLabel["Päästetyt / ottelu"].home_rank, 2);
  console.log("ok: build_preview_team_stats computes per-game rates, a share-of-total bar split, and league ranks");
}

console.log("\nAll boxscore.ts parity tests passed.");
