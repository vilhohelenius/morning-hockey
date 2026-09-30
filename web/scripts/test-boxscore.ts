// Plain-node parity test for _shared/boxscore.ts against the exact fixtures
// and expected values from tests/test_boxscore.py, run with Node's built-in
// TS stripping (`node --experimental-strip-types`) -- no wrangler/D1/network
// needed, since buildGoalEvents/buildTeamStats are pure functions. This is
// the one piece of phase 5 fully verifiable without a live NHL API call or
// a deployed Worker; the on-demand fetch route itself isn't testable from
// here (this sandbox's egress proxy blocks api-web.nhle.com) and needs a
// live check once deployed.

import assert from "node:assert/strict";
import { buildGoalEvents, buildTeamStats } from "../functions/_shared/boxscore.ts";

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
  console.log("ok: build_team_stats computes save pct from score and shots");
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

console.log("\nAll boxscore.ts parity tests passed.");
