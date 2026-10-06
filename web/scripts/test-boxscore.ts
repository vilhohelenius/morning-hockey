// Plain-node parity test for _shared/boxscore.ts against the exact fixtures
// and expected values from tests/test_boxscore.py, run with Node's built-in
// TS stripping (`node --experimental-strip-types`) -- no wrangler/D1/network
// needed, since buildGoalEvents/buildTeamStats are pure functions. This is
// the one piece of phase 5 fully verifiable without a live NHL API call or
// a deployed Worker; the on-demand fetch route itself isn't testable from
// here (this sandbox's egress proxy blocks api-web.nhle.com) and needs a
// live check once deployed.

import assert from "node:assert/strict";
import {
  attachGoalClips,
  buildGoalEvents,
  buildPenaltyEvents,
  buildPreviewTeamStats,
  buildTeamStats,
  buildTimeline,
  parseTimeline,
  penaltyReasonFi,
  serializeTimeline,
  shortName,
} from "../functions/_shared/boxscore.ts";
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
  assert.equal(byLabel["Blokatut laukaukset"].away_value, "11");
  assert.equal(byLabel["Blokatut laukaukset"].home_value, "21");
  assert.equal(byLabel["Kiekon menetykset"].away_value, "12");
  assert.equal(byLabel["Kiekon menetykset"].home_value, "15");
  assert.equal(byLabel["Kiekon riistot"].away_value, "4");
  assert.equal(byLabel["Kiekon riistot"].home_value, "4");
  console.log("ok: build_team_stats computes save pct from score and shots, and carries hits/blocks/giveaways/takeaways");
}

{
  const rows = buildTeamStats(TEAM_GAME_STATS, 1, 2);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));

  // Every row is a continuous share-of-total split (the two sides always
  // sum to ~100, for one continuous bar) -- not an independent per-side
  // scale. Blocked shots: away 11, home 21, total 32.
  assert.ok(Math.abs(byLabel["Blokatut laukaukset"].away_pct! - (11 / 32) * 100) < 1e-6);
  assert.ok(Math.abs(byLabel["Blokatut laukaukset"].home_pct! - (21 / 32) * 100) < 1e-6);
  // Equal takeaways (4/4) split evenly.
  assert.equal(byLabel["Kiekon riistot"].away_pct, 50);
  assert.equal(byLabel["Kiekon riistot"].home_pct, 50);
  // Faceoff win pct already sums to 100 between the two teams, so the
  // share split leaves it unchanged.
  assert.ok(Math.abs(byLabel["Aloitusprosentti"].away_pct! - 41.3793) < 1e-3);
  assert.ok(Math.abs(byLabel["Aloitusprosentti"].home_pct! - 58.6207) < 1e-3);
  // Save pct (derived from score/shots) does NOT sum to 100 on its own
  // (86.7 + 95.0 = 181.7), so the share split normalizes it down.
  assert.ok(Math.abs(byLabel["Torjuntaprosentti"].away_pct! - 47.7064) < 1e-3);
  assert.ok(Math.abs(byLabel["Torjuntaprosentti"].home_pct! - 52.2936) < 1e-3);
  console.log("ok: build_team_stats bar percentages are a continuous share-of-total split for every row");
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

// ---------- match timeline (ottelun kulku) ----------

const PBP = {
  awayTeam: { id: 10 },
  homeTeam: { id: 20 },
  rosterSpots: [
    { playerId: 1, firstName: { default: "Gustav" }, lastName: { default: "Forsling" } },
    { playerId: 3, firstName: { default: "Sebastian" }, lastName: { default: "Aho" } },
    { playerId: 9, firstName: { default: "Brad" }, lastName: { default: "Marchand" } },
  ],
  plays: [
    { typeDescKey: "faceoff", periodDescriptor: { number: 1, periodType: "REG" }, timeInPeriod: "00:00" },
    {
      typeDescKey: "penalty",
      periodDescriptor: { number: 3, periodType: "REG" },
      timeInPeriod: "10:00",
      details: { descKey: "tripping", duration: 2, committedByPlayerId: 9, eventOwnerTeamId: 10 },
    },
    {
      typeDescKey: "penalty",
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: "02:31",
      details: { descKey: "some-new-thing", duration: 5, committedByPlayerId: 3, eventOwnerTeamId: 20 },
    },
    {
      // bench minor: no committing player, served by #1
      typeDescKey: "penalty",
      periodDescriptor: { number: 2, periodType: "REG" },
      timeInPeriod: "04:55",
      details: { descKey: "too-many-men-on-the-ice", duration: 2, servedByPlayerId: 1, eventOwnerTeamId: 10 },
    },
    {
      typeDescKey: "goal",
      periodDescriptor: { number: 2, periodType: "REG" },
      timeInPeriod: "04:55",
      details: { eventOwnerTeamId: 10, highlightClipSharingUrl: "https://nhl.com/video/x-123" },
    },
    {
      typeDescKey: "goal",
      periodDescriptor: { number: 4, periodType: "OT" },
      timeInPeriod: "01:23",
      details: { eventOwnerTeamId: 20, highlightClipSharingUrl: "javascript:alert(1)" },
    },
  ],
};

{
  assert.equal(shortName("Vladislav", "Podkolzin"), "Podkolzin V.");
  assert.equal(shortName("", "Cher"), "Cher");
  const events = buildGoalEvents(SCORING_BY_PERIOD, "FLA", "CAR", new Set([2]));
  assert.equal(events[0].scorer_short, "Forsling G.");
  assert.deepEqual(events[0].assists_short, ["Verhaeghe C. 🇫🇮"]);
  assert.equal(events[0].period, 2);
  assert.equal(events[1].period, 4);
  console.log("ok: goal events carry short names and a sortable period number");
}

{
  assert.equal(penaltyReasonFi("tripping"), "Kampitus");
  assert.equal(penaltyReasonFi("interference"), "Estäminen");
  assert.equal(penaltyReasonFi("roughing"), "Väkivaltaisuus");
  assert.equal(penaltyReasonFi("some-new-thing"), "Some new thing");
  assert.equal(penaltyReasonFi("ps-hooking-on-breakaway"), "Rangaistuslaukaus");
  assert.equal(penaltyReasonFi(undefined), "");
  console.log("ok: penalty reasons translate with a humanised fallback");
}

{
  const penalties = buildPenaltyEvents(PBP, "FLA", "CAR", new Set([3]));
  assert.equal(penalties.length, 3);
  assert.deepEqual(penalties[0], {
    period: 3,
    period_label: "3. erä",
    time_in_period: "10:00",
    team_abbrev: "FLA",
    player: "Marchand B.",
    minutes: 2,
    reason: "Kampitus",
  });
  assert.equal(penalties[1].team_abbrev, "CAR");
  assert.equal(penalties[1].player, "Aho S. 🇫🇮");
  assert.equal(penalties[1].minutes, 5);
  assert.equal(penalties[2].player, "Forsling G.", "bench minor falls back to the serving player");
  console.log("ok: build_penalty_events maps team, player, minutes and Finnish reason");
}

{
  const goals = attachGoalClips(buildGoalEvents(SCORING_BY_PERIOD, "FLA", "CAR", new Set()), PBP, "FLA", "CAR");
  assert.equal(goals[0].clip_url, "https://nhl.com/video/x-123");
  assert.equal(goals[1].clip_url, undefined, "non-nhl.com links are dropped");
  console.log("ok: goal clips are matched by period/time/team and restricted to nhl.com");
}

{
  const goals = buildGoalEvents(SCORING_BY_PERIOD, "FLA", "CAR", new Set());
  const penalties = buildPenaltyEvents(PBP, "FLA", "CAR", new Set());
  const periods = buildTimeline(goals, penalties, "FLA");
  assert.deepEqual(
    periods.map((p) => [p.label, p.away_goals, p.home_goals, p.events.length]),
    [
      ["1. erä", 0, 0, 1],
      ["2. erä", 1, 0, 2],
      ["3. erä", 0, 0, 1],
      ["Jatkoaika", 0, 1, 1],
    ],
  );
  // same second: the penalty comes before the goal
  assert.deepEqual(periods[1].events.map((e) => e.kind), ["penalty", "goal"]);
  console.log("ok: build_timeline groups by period in clock order with per-period scores");
}

{
  const goals = buildGoalEvents(SCORING_BY_PERIOD, "FLA", "CAR", new Set());
  const penalties = buildPenaltyEvents(PBP, "FLA", "CAR", new Set());
  const round = parseTimeline(serializeTimeline({ goals, penalties, complete: true }));
  assert.deepEqual(round.goals, goals);
  assert.deepEqual(round.penalties, penalties);
  assert.equal(round.complete, true);
  assert.ok(serializeTimeline({ goals, penalties, complete: true }).startsWith('{"v":2,"complete":true'));
  assert.equal(parseTimeline(serializeTimeline({ goals, penalties: [], complete: false })).complete, false);

  // legacy cache row: a bare goals array, no period field
  const legacy = parseTimeline(JSON.stringify(goals.map(({ period, ...rest }) => rest)));
  assert.equal(legacy.complete, false);
  assert.deepEqual(legacy.penalties, []);
  assert.deepEqual(legacy.goals.map((g) => g.period), [2, 4]);
  console.log("ok: goals_json envelope round-trips and still reads legacy rows");
}
