// TS port of boxscore.py's build_goal_events/build_team_stats, field-for-
// field -- the raw NHL /landing and /right-rail response shapes here are
// exactly what that already-proven Python code reads, not a guess.
// Pure functions, no D1/fetch involved, so they're plain-node testable
// (see scripts/test-boxscore.mjs).

import type { GoalEvent, TeamSeasonStatsRow, TeamStatRow } from "./types";

const PERIOD_NUMBER_LABELS: Record<number, string> = { 1: "1. erä", 2: "2. erä", 3: "3. erä" };
const STRENGTH_LABELS: Record<string, string> = { pp: "YV", sh: "AV" };
const FINNISH_FLAG = "🇫🇮";

interface RawPerson {
  playerId: number;
  firstName: { default: string };
  lastName: { default: string };
}

interface RawGoal extends RawPerson {
  teamAbbrev: { default: string };
  timeInPeriod: string;
  strength?: string;
  assists?: RawPerson[];
}

interface RawPeriod {
  periodDescriptor?: { periodType?: string; number?: number };
  goals?: RawGoal[];
}

export function periodLabel(descriptor: { periodType?: string; number?: number }): string {
  const periodType = descriptor.periodType ?? "REG";
  if (periodType === "OT") return "Jatkoaika";
  if (periodType === "SO") return "Voittolaukaukset";
  const number = descriptor.number ?? 0;
  return PERIOD_NUMBER_LABELS[number] ?? `${number}. erä`;
}

function nameWithFlag(person: RawPerson, finnishIds: Set<number>): string {
  const name = `${person.firstName.default} ${person.lastName.default}`;
  return finnishIds.has(person.playerId) ? `${name} ${FINNISH_FLAG}` : name;
}

export function buildGoalEvents(
  scoringByPeriod: RawPeriod[],
  awayAbbrev: string,
  homeAbbrev: string,
  finnishIds: Set<number>,
): GoalEvent[] {
  const events: GoalEvent[] = [];
  let awayScore = 0;
  let homeScore = 0;

  for (const period of scoringByPeriod) {
    const label = periodLabel(period.periodDescriptor ?? {});
    for (const goal of period.goals ?? []) {
      const teamAbbrev = goal.teamAbbrev.default;
      if (teamAbbrev === awayAbbrev) awayScore += 1;
      else if (teamAbbrev === homeAbbrev) homeScore += 1;

      events.push({
        period_label: label,
        time_in_period: goal.timeInPeriod,
        team_abbrev: teamAbbrev,
        scorer: nameWithFlag(goal, finnishIds),
        assists: (goal.assists ?? []).map((a) => nameWithFlag(a, finnishIds)),
        strength: STRENGTH_LABELS[goal.strength ?? ""] ?? "",
        away_score: awayScore,
        home_score: homeScore,
      });
    }
  }
  return events;
}

interface RawTeamStat {
  category: string;
  awayValue: string | number;
  homeValue: string | number;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function powerPlayDisplay(attempts: string, pct: number): string {
  if (attempts.endsWith("/0")) return "–";
  return `${attempts} (${percent(pct)})`;
}

export function buildTeamStats(teamGameStats: RawTeamStat[], awayScore: number, homeScore: number): TeamStatRow[] {
  const byCategory = new Map(teamGameStats.map((row) => [row.category, row]));
  const raw = (category: string): [string | number | undefined, string | number | undefined] => {
    const row = byCategory.get(category);
    return row ? [row.awayValue, row.homeValue] : [undefined, undefined];
  };

  const [awaySog, homeSog] = raw("sog") as [number | undefined, number | undefined];
  const [awayPpPct, homePpPct] = raw("powerPlayPctg") as [number | undefined, number | undefined];
  const [awayPp, homePp] = raw("powerPlay") as [string | undefined, string | undefined];
  const [awayFaceoff, homeFaceoff] = raw("faceoffWinningPctg") as [number | undefined, number | undefined];
  const [awayPim, homePim] = raw("pim") as [number | undefined, number | undefined];
  const [awayHits, homeHits] = raw("hits") as [number | undefined, number | undefined];
  const [awayBlocked, homeBlocked] = raw("blockedShots") as [number | undefined, number | undefined];
  const [awayGiveaways, homeGiveaways] = raw("giveaways") as [number | undefined, number | undefined];
  const [awayTakeaways, homeTakeaways] = raw("takeaways") as [number | undefined, number | undefined];

  const awaySavePct = homeSog ? 1 - homeScore / homeSog : undefined;
  const homeSavePct = awaySog ? 1 - awayScore / awaySog : undefined;
  const awayPkPct = homePpPct !== undefined ? 1 - homePpPct : undefined;
  const homePkPct = awayPpPct !== undefined ? 1 - awayPpPct : undefined;

  // Same continuous share-of-total split the preview page's Team Stats
  // uses (shareSplit below), not an independent-per-side scale -- so the
  // two bar halves always add up to one continuous 100%-wide bar.
  const [sogAwayPct, sogHomePct] = shareSplit(awaySog ?? 0, homeSog ?? 0);
  const [saveAwayPct, saveHomePct] = shareSplit((awaySavePct ?? 0) * 100, (homeSavePct ?? 0) * 100);
  const [faceoffAwayPct, faceoffHomePct] = shareSplit((awayFaceoff ?? 0) * 100, (homeFaceoff ?? 0) * 100);
  const [ppAwayPct, ppHomePct] = shareSplit((awayPpPct ?? 0) * 100, (homePpPct ?? 0) * 100);
  const [pkAwayPct, pkHomePct] = shareSplit((awayPkPct ?? 0) * 100, (homePkPct ?? 0) * 100);
  const [pimAwayPct, pimHomePct] = shareSplit(awayPim ?? 0, homePim ?? 0);
  const [hitsAwayPct, hitsHomePct] = shareSplit(awayHits ?? 0, homeHits ?? 0);
  const [blockedAwayPct, blockedHomePct] = shareSplit(awayBlocked ?? 0, homeBlocked ?? 0);
  const [giveawaysAwayPct, giveawaysHomePct] = shareSplit(awayGiveaways ?? 0, homeGiveaways ?? 0);
  const [takeawaysAwayPct, takeawaysHomePct] = shareSplit(awayTakeaways ?? 0, homeTakeaways ?? 0);

  return [
    {
      label: "Laukaukset",
      away_value: awaySog !== undefined ? String(awaySog) : "–",
      home_value: homeSog !== undefined ? String(homeSog) : "–",
      away_pct: sogAwayPct,
      home_pct: sogHomePct,
    },
    {
      label: "Torjuntaprosentti",
      away_value: awaySavePct !== undefined ? percent(awaySavePct) : "–",
      home_value: homeSavePct !== undefined ? percent(homeSavePct) : "–",
      away_pct: saveAwayPct,
      home_pct: saveHomePct,
    },
    {
      label: "Aloitusprosentti",
      away_value: awayFaceoff !== undefined ? percent(awayFaceoff) : "–",
      home_value: homeFaceoff !== undefined ? percent(homeFaceoff) : "–",
      away_pct: faceoffAwayPct,
      home_pct: faceoffHomePct,
    },
    {
      label: "Ylivoima (YV%)",
      away_value: awayPp !== undefined ? powerPlayDisplay(awayPp, awayPpPct ?? 0) : "–",
      home_value: homePp !== undefined ? powerPlayDisplay(homePp, homePpPct ?? 0) : "–",
      away_pct: ppAwayPct,
      home_pct: ppHomePct,
    },
    {
      label: "Alivoima (AV%)",
      away_value: awayPkPct !== undefined ? percent(awayPkPct) : "–",
      home_value: homePkPct !== undefined ? percent(homePkPct) : "–",
      away_pct: pkAwayPct,
      home_pct: pkHomePct,
    },
    {
      label: "Jäähyt (min)",
      away_value: awayPim !== undefined ? String(awayPim) : "–",
      home_value: homePim !== undefined ? String(homePim) : "–",
      away_pct: pimAwayPct,
      home_pct: pimHomePct,
    },
    {
      label: "Taklaukset",
      away_value: awayHits !== undefined ? String(awayHits) : "–",
      home_value: homeHits !== undefined ? String(homeHits) : "–",
      away_pct: hitsAwayPct,
      home_pct: hitsHomePct,
    },
    {
      label: "Torjutut laukaukset",
      away_value: awayBlocked !== undefined ? String(awayBlocked) : "–",
      home_value: homeBlocked !== undefined ? String(homeBlocked) : "–",
      away_pct: blockedAwayPct,
      home_pct: blockedHomePct,
    },
    {
      label: "Menetetyt kiekot",
      away_value: awayGiveaways !== undefined ? String(awayGiveaways) : "–",
      home_value: homeGiveaways !== undefined ? String(homeGiveaways) : "–",
      away_pct: giveawaysAwayPct,
      home_pct: giveawaysHomePct,
    },
    {
      label: "Riistetyt kiekot",
      away_value: awayTakeaways !== undefined ? String(awayTakeaways) : "–",
      home_value: homeTakeaways !== undefined ? String(homeTakeaways) : "–",
      away_pct: takeawaysAwayPct,
      home_pct: takeawaysHomePct,
    },
  ];
}

// Continuous single-bar split (away + home always fill the full bar
// together), vs. barSplit's two independent halves -- matches NHL.com's own
// Team Stats bar, confirmed by inspecting its rendered pixel widths: e.g.
// 20.7% vs 24.7% power play renders at ~45.7%/~54.3%, i.e. away/(away+home),
// not "smaller side scaled to the larger one" (which barSplit does for the
// Game Stats section elsewhere on that same page).
function shareSplit(away: number, home: number): [number, number] {
  const a = Math.max(away, 0);
  const h = Math.max(home, 0);
  const total = a + h;
  if (total === 0) return [50, 50];
  return [(a / total) * 100, (h / total) * 100];
}

// League rank (1 = best) for one team on one season-stats metric, among
// every team D1 has a season_stats row for. Ties just get whichever order
// Array.sort leaves them in -- no shared-rank handling, the same scope cut
// standings_rows' own ranks don't need since they come pre-computed from
// the NHL API rather than derived here.
function computeRank(allStats: TeamSeasonStatsRow[], abbrev: string, value: (r: TeamSeasonStatsRow) => number, higherIsBetter: boolean): number {
  const sorted = [...allStats].sort((a, b) => (higherIsBetter ? value(b) - value(a) : value(a) - value(b)));
  const index = sorted.findIndex((r) => r.team_abbrev === abbrev);
  return index === -1 ? 0 : index + 1;
}

function perGame(goals: number, gamesPlayed: number): number {
  return gamesPlayed ? goals / gamesPlayed : 0;
}

// Season-long team comparison for an unplayed game's preview (vs.
// buildTeamStats above, which compares one finished game's own box score).
// Same 5 fields NHL.com's own Team Stats section shows (PP%/PK%/FO%/GF per
// game/GA per game) with its continuous share-bar + league-rank styling,
// rather than buildTeamStats's Game Stats bar look.
export function buildPreviewTeamStats(away: TeamSeasonStatsRow, home: TeamSeasonStatsRow, allStats: TeamSeasonStatsRow[]): TeamStatRow[] {
  const awayGfPerGame = perGame(away.goals_for, away.games_played);
  const homeGfPerGame = perGame(home.goals_for, home.games_played);
  const awayGaPerGame = perGame(away.goals_against, away.games_played);
  const homeGaPerGame = perGame(home.goals_against, home.games_played);

  const gfPerGame = (r: TeamSeasonStatsRow) => perGame(r.goals_for, r.games_played);
  const gaPerGame = (r: TeamSeasonStatsRow) => perGame(r.goals_against, r.games_played);

  const rank = (value: (r: TeamSeasonStatsRow) => number, higherIsBetter: boolean) => [
    computeRank(allStats, away.team_abbrev, value, higherIsBetter),
    computeRank(allStats, home.team_abbrev, value, higherIsBetter),
  ];

  const [ppAwayPct, ppHomePct] = shareSplit(away.power_play_pct, home.power_play_pct);
  const [pkAwayPct, pkHomePct] = shareSplit(away.penalty_kill_pct, home.penalty_kill_pct);
  const [foAwayPct, foHomePct] = shareSplit(away.faceoff_pct, home.faceoff_pct);
  const [gfAwayPct, gfHomePct] = shareSplit(awayGfPerGame, homeGfPerGame);
  const [gaAwayPct, gaHomePct] = shareSplit(awayGaPerGame, homeGaPerGame);

  const [ppAwayRank, ppHomeRank] = rank((r) => r.power_play_pct, true);
  const [pkAwayRank, pkHomeRank] = rank((r) => r.penalty_kill_pct, true);
  const [foAwayRank, foHomeRank] = rank((r) => r.faceoff_pct, true);
  const [gfAwayRank, gfHomeRank] = rank(gfPerGame, true);
  const [gaAwayRank, gaHomeRank] = rank(gaPerGame, false);

  return [
    {
      label: "Ylivoima (YV%)",
      away_value: percent(away.power_play_pct),
      home_value: percent(home.power_play_pct),
      away_pct: ppAwayPct,
      home_pct: ppHomePct,
      away_rank: ppAwayRank,
      home_rank: ppHomeRank,
    },
    {
      label: "Alivoima (AV%)",
      away_value: percent(away.penalty_kill_pct),
      home_value: percent(home.penalty_kill_pct),
      away_pct: pkAwayPct,
      home_pct: pkHomePct,
      away_rank: pkAwayRank,
      home_rank: pkHomeRank,
    },
    {
      label: "Aloitusprosentti",
      away_value: percent(away.faceoff_pct),
      home_value: percent(home.faceoff_pct),
      away_pct: foAwayPct,
      home_pct: foHomePct,
      away_rank: foAwayRank,
      home_rank: foHomeRank,
    },
    {
      label: "Maalia / ottelu",
      away_value: awayGfPerGame.toFixed(2),
      home_value: homeGfPerGame.toFixed(2),
      away_pct: gfAwayPct,
      home_pct: gfHomePct,
      away_rank: gfAwayRank,
      home_rank: gfHomeRank,
    },
    {
      label: "Päästetyt / ottelu",
      away_value: awayGaPerGame.toFixed(2),
      home_value: homeGaPerGame.toFixed(2),
      away_pct: gaAwayPct,
      home_pct: gaHomePct,
      away_rank: gaAwayRank,
      home_rank: gaHomeRank,
    },
  ];
}
