// TS port of boxscore.py's build_goal_events/build_team_stats, field-for-
// field -- the raw NHL /landing and /right-rail response shapes here are
// exactly what that already-proven Python code reads, not a guess.
// Pure functions, no D1/fetch involved, so they're plain-node testable
// (see scripts/test-boxscore.mjs).

import type { GoalEvent, TeamStatRow } from "./types";

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

  const awaySavePct = homeSog ? 1 - homeScore / homeSog : undefined;
  const homeSavePct = awaySog ? 1 - awayScore / awaySog : undefined;

  return [
    { label: "Laukaukset", away_value: awaySog !== undefined ? String(awaySog) : "–", home_value: homeSog !== undefined ? String(homeSog) : "–" },
    { label: "Torjuntaprosentti", away_value: awaySavePct !== undefined ? percent(awaySavePct) : "–", home_value: homeSavePct !== undefined ? percent(homeSavePct) : "–" },
    { label: "Ylivoima (YV%)", away_value: awayPp !== undefined ? powerPlayDisplay(awayPp, awayPpPct ?? 0) : "–", home_value: homePp !== undefined ? powerPlayDisplay(homePp, homePpPct ?? 0) : "–" },
    { label: "Alivoima (AV%)", away_value: homePpPct !== undefined ? percent(1 - homePpPct) : "–", home_value: awayPpPct !== undefined ? percent(1 - awayPpPct) : "–" },
    { label: "Aloitusprosentti", away_value: awayFaceoff !== undefined ? percent(awayFaceoff) : "–", home_value: homeFaceoff !== undefined ? percent(homeFaceoff) : "–" },
    { label: "Jäähyt (min)", away_value: awayPim !== undefined ? String(awayPim) : "–", home_value: homePim !== undefined ? String(homePim) : "–" },
  ];
}
