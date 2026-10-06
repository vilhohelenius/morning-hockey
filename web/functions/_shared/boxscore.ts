// TS port of boxscore.py's build_goal_events/build_team_stats, field-for-
// field -- the raw NHL /landing and /right-rail response shapes here are
// exactly what that already-proven Python code reads, not a guess.
// Pure functions, no D1/fetch involved, so they're plain-node testable
// (see scripts/test-boxscore.mjs).

import type { GoalEvent, PenaltyEvent, ShootoutAttempt, TeamSeasonStatsRow, TeamStatRow } from "./types";

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

// OT (incl. playoff OT2+) sorts after regulation, shootout after that.
function periodOrder(descriptor: { periodType?: string; number?: number }): number {
  if (descriptor.periodType === "SO") return 100;
  if (descriptor.periodType === "OT") return Math.max(descriptor.number ?? 4, 4);
  return descriptor.number ?? 0;
}

// Back-fills GoalEvent.period for a legacy cached row, from its Finnish label.
function periodFromLabel(label: string): number {
  if (label === "Voittolaukaukset") return 100;
  if (label === "Jatkoaika") return 4;
  const match = label.match(/^(\d+)\./);
  return match ? Number(match[1]) : 0;
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

// "Podkolzin V." -- the compact form the match timeline shows (Flashscore
// style). Multi-word first names ("Jean-Gabriel") just use the initial.
export function shortName(first: string, last: string): string {
  const initial = first.trim().charAt(0);
  return initial ? `${last} ${initial}.` : last;
}

function shortNameWithFlag(person: RawPerson, finnishIds: Set<number>): string {
  const name = shortName(person.firstName.default, person.lastName.default);
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
        period: periodOrder(period.periodDescriptor ?? {}),
        time_in_period: goal.timeInPeriod,
        team_abbrev: teamAbbrev,
        scorer: nameWithFlag(goal, finnishIds),
        scorer_short: shortNameWithFlag(goal, finnishIds),
        assists: (goal.assists ?? []).map((a) => nameWithFlag(a, finnishIds)),
        assists_short: (goal.assists ?? []).map((a) => shortNameWithFlag(a, finnishIds)),
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
      label: "Blokatut laukaukset",
      away_value: awayBlocked !== undefined ? String(awayBlocked) : "–",
      home_value: homeBlocked !== undefined ? String(homeBlocked) : "–",
      away_pct: blockedAwayPct,
      home_pct: blockedHomePct,
    },
    {
      label: "Kiekon menetykset",
      away_value: awayGiveaways !== undefined ? String(awayGiveaways) : "–",
      home_value: homeGiveaways !== undefined ? String(homeGiveaways) : "–",
      away_pct: giveawaysAwayPct,
      home_pct: giveawaysHomePct,
    },
    {
      label: "Kiekon riistot",
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

// ---------- Match timeline (ottelun kulku): penalties, clips, grouping ----------

// NHL play-by-play penalty descKey -> Finnish. Keys the NHL adds later fall
// back to a humanised form of the key itself (see penaltyReasonFi).
const PENALTY_REASONS_FI: Record<string, string> = {
  "abuse-of-officials": "Tuomarin loukkaaminen",
  "abusive-language": "Rienaaminen",
  aggressor: "Hyökkääjä",
  "attempt-to-injure": "Loukkaamisyritys",
  "bench-minor": "Vaihtopenkin rangaistus",
  boarding: "Laitaan taklaus",
  "broken-stick": "Rikkinäinen maila",
  "butt-ending": "Mailan pää",
  charging: "Ryntäys",
  clipping: "Polviin taklaus",
  "closing-hand-on-puck": "Kiekon peittäminen kädellä",
  "cross-checking": "Ristiintarkistus",
  "delaying-game": "Pelin viivyttäminen",
  "delaying-game-puck-over-glass": "Kiekko katsomoon",
  "delaying-game-smothering-puck": "Kiekon peittäminen",
  "delaying-game-unsuccessful-challenge": "Epäonnistunut haaste",
  diving: "Filmaus",
  elbowing: "Kyynärpäätaklaus",
  embellishment: "Filmaus",
  "face-off-violation": "Aloitusrike",
  fighting: "Nyrkkitappelu",
  "game-misconduct": "Pelikielto",
  "goalie-leave-crease": "Maalivahti ylitti alueen",
  "goalkeeper-displaced-net": "Maalin siirtäminen",
  "head-butting": "Päällä puskeminen",
  "high-sticking": "Korkea maila",
  "high-sticking-double-minor": "Korkea maila (kaksoisrangaistus)",
  holding: "Pitäminen",
  "holding-the-stick": "Mailasta pitäminen",
  hooking: "Koukkaus",
  "illegal-check-to-head": "Taklaus päähän",
  "illegal-equipment": "Kielletty varuste",
  "illegal-stick": "Kielletty maila",
  instigator: "Tappelun aloittaja",
  interference: "Estäminen",
  "interference-goalkeeper": "Maalivahdin estäminen",
  kneeing: "Polvitaklaus",
  "leaving-penalty-box": "Rangaistusaitiosta poistuminen",
  misconduct: "Kurinpitorangaistus",
  "player-equipment": "Pelaajan varuste",
  "premature-substitution": "Ennenaikainen vaihto",
  "puck-thrown-forward-goalkeeper": "Kiekon heitto eteenpäin",
  roughing: "Väkivaltaisuus",
  slashing: "Mailalla lyönti",
  spearing: "Keihästys",
  "throwing-stick": "Mailan heittäminen",
  "too-many-men-on-the-ice": "Liian monta pelaajaa",
  tripping: "Kampitus",
  "unsportsmanlike-conduct": "Epäurheilijamainen käytös",
};

export function penaltyReasonFi(descKey: string | undefined): string {
  if (!descKey) return "";
  const known = PENALTY_REASONS_FI[descKey];
  if (known) return known;
  // Penalty-shot variants ("ps-hooking-on-breakaway" etc.).
  if (descKey.startsWith("ps-")) return "Rangaistuslaukaus";
  const words = descKey.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface RawPbpPlay {
  typeDescKey?: string;
  periodDescriptor?: { periodType?: string; number?: number };
  timeInPeriod?: string;
  details?: {
    descKey?: string;
    duration?: number;
    committedByPlayerId?: number;
    servedByPlayerId?: number;
    eventOwnerTeamId?: number;
    highlightClipSharingUrl?: string;
  };
}

interface RawPbpRosterSpot {
  playerId: number;
  firstName?: { default: string };
  lastName?: { default: string };
}

export interface RawPlayByPlay {
  gameOutcome?: { lastPeriodType?: string };
  awayTeam?: { id?: number };
  homeTeam?: { id?: number };
  plays?: RawPbpPlay[];
  rosterSpots?: RawPbpRosterSpot[];
}

function pbpPlayerName(spots: Map<number, RawPbpRosterSpot>, playerId: number | undefined, finnishIds: Set<number>): string {
  if (playerId === undefined) return "";
  const spot = spots.get(playerId);
  if (!spot?.lastName) return "";
  const name = shortName(spot.firstName?.default ?? "", spot.lastName.default);
  return finnishIds.has(playerId) ? `${name} ${FINNISH_FLAG}` : name;
}

function teamAbbrevForId(pbp: RawPlayByPlay, teamId: number | undefined, awayAbbrev: string, homeAbbrev: string): string {
  if (teamId !== undefined && teamId === pbp.awayTeam?.id) return awayAbbrev;
  if (teamId !== undefined && teamId === pbp.homeTeam?.id) return homeAbbrev;
  return "";
}

export function buildPenaltyEvents(pbp: RawPlayByPlay, awayAbbrev: string, homeAbbrev: string, finnishIds: Set<number>): PenaltyEvent[] {
  const spots = new Map((pbp.rosterSpots ?? []).map((s) => [s.playerId, s]));
  const events: PenaltyEvent[] = [];
  for (const play of pbp.plays ?? []) {
    if (play.typeDescKey !== "penalty" || !play.details) continue;
    const team = teamAbbrevForId(pbp, play.details.eventOwnerTeamId, awayAbbrev, homeAbbrev);
    if (!team) continue;
    const descriptor = play.periodDescriptor ?? {};
    // Bench / too-many-men minors have no committing player; whoever serves
    // it is the closest thing to a name, else it's shown as a team penalty.
    const player =
      pbpPlayerName(spots, play.details.committedByPlayerId, finnishIds) ||
      pbpPlayerName(spots, play.details.servedByPlayerId, finnishIds);
    events.push({
      period: periodOrder(descriptor),
      period_label: periodLabel(descriptor),
      time_in_period: play.timeInPeriod ?? "00:00",
      team_abbrev: team,
      player,
      minutes: play.details.duration ?? 0,
      reason: penaltyReasonFi(play.details.descKey),
    });
  }
  return events;
}

// Highlight clip page per goal, matched on period + time + scoring team
// (landing's goal list has no event id to join on, and no two goals by one
// team share a second). Only nhl.com links are accepted.
export function attachGoalClips(goals: GoalEvent[], pbp: RawPlayByPlay, awayAbbrev: string, homeAbbrev: string): GoalEvent[] {
  const clips = new Map<string, string>();
  for (const play of pbp.plays ?? []) {
    if (play.typeDescKey !== "goal") continue;
    const url = play.details?.highlightClipSharingUrl;
    if (!url || !/^https:\/\/(www\.)?nhl\.com\//.test(url)) continue;
    const team = teamAbbrevForId(pbp, play.details?.eventOwnerTeamId, awayAbbrev, homeAbbrev);
    clips.set(`${periodOrder(play.periodDescriptor ?? {})}|${play.timeInPeriod}|${team}`, url);
  }
  return goals.map((goal) => {
    const url = clips.get(`${goal.period}|${goal.time_in_period}|${goal.team_abbrev}`);
    return url ? { ...goal, clip_url: url } : goal;
  });
}

export type TimelineEvent =
  | { kind: "goal"; time: string; goal: GoalEvent }
  | { kind: "penalty"; time: string; penalty: PenaltyEvent };

export interface TimelinePeriod {
  label: string;
  away_goals: number;
  home_goals: number;
  events: TimelineEvent[];
  // Set only on the shootout band: the individual attempts (events is empty).
  shootout?: ShootoutAttempt[];
}

function timeToSeconds(time: string): number {
  const [m, s] = time.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

// Groups goals + penalties into one band per period, events in clock order
// (a penalty sorts before a goal at the exact same second -- it was called
// first). Period score counts that period's goals only, as Flashscore does.
// With `shootout` attempts, the shootout winner "goal" that landing's
// scoring list also carries is dropped (the attempts already include it) and
// the shootout band's score is the attempts' own tally.
export function buildTimeline(goals: GoalEvent[], penalties: PenaltyEvent[], awayAbbrev: string, shootout: ShootoutAttempt[] = []): TimelinePeriod[] {
  const entries: { period: number; label: string; seconds: number; rank: number; event: TimelineEvent }[] = [];
  for (const goal of goals) {
    const period = goal.period ?? periodFromLabel(goal.period_label);
    if (shootout.length && period >= 100) continue;
    entries.push({
      period,
      label: goal.period_label,
      seconds: timeToSeconds(goal.time_in_period),
      rank: 1,
      event: { kind: "goal", time: goal.time_in_period, goal },
    });
  }
  for (const penalty of penalties) {
    entries.push({
      period: penalty.period,
      label: penalty.period_label,
      seconds: timeToSeconds(penalty.time_in_period),
      rank: 0,
      event: { kind: "penalty", time: penalty.time_in_period, penalty },
    });
  }
  entries.sort((a, b) => a.period - b.period || a.seconds - b.seconds || a.rank - b.rank);

  const periods: TimelinePeriod[] = [];
  let current: TimelinePeriod | null = null;
  let currentKey: number | null = null;
  for (const entry of entries) {
    if (!current || currentKey !== entry.period) {
      current = { label: entry.label, away_goals: 0, home_goals: 0, events: [] };
      currentKey = entry.period;
      periods.push(current);
    }
    current.events.push(entry.event);
    if (entry.event.kind === "goal") {
      if (entry.event.goal.team_abbrev === awayAbbrev) current.away_goals += 1;
      else current.home_goals += 1;
    }
  }

  if (shootout.length) {
    const scored = shootout.filter((a) => a.result === "goal");
    periods.push({
      label: periodLabel({ periodType: "SO" }),
      away_goals: scored.filter((a) => a.team_abbrev === awayAbbrev).length,
      home_goals: scored.filter((a) => a.team_abbrev !== awayAbbrev).length,
      events: [],
      shootout,
    });
  }
  return periods;
}

interface RawShootoutEvent {
  sequence?: number;
  playerId: number;
  teamAbbrev: { default: string };
  firstName: { default: string };
  lastName: { default: string };
  result?: string;
  gameWinner?: boolean;
  homeScore?: number;
  awayScore?: number;
}

// landing.summary.shootout.events -> one entry per attempt (shooter, team,
// goal/save/miss, running shootout score).
export function buildShootoutAttempts(events: RawShootoutEvent[] | undefined, finnishIds: Set<number>): ShootoutAttempt[] {
  if (!Array.isArray(events)) return [];
  return events.map((e, i) => ({
    sequence: e.sequence ?? i + 1,
    team_abbrev: e.teamAbbrev.default,
    player: shortNameWithFlag(e, finnishIds),
    result: e.result === "goal" ? "goal" : e.result === "save" ? "save" : "miss",
    away_score: e.awayScore ?? 0,
    home_score: e.homeScore ?? 0,
    winner: !!e.gameWinner,
  }));
}

// landing has no gameOutcome (it lives on the schedule + play-by-play
// payloads). Order: play-by-play's gameOutcome, landing's if present, then --
// for a finished game only -- landing's own periodDescriptor, which for a
// settled game is its last period (REG/OT/SO, confirmed on a real shootout).
export function resolveFinalType(
  landing: { gameOutcome?: { lastPeriodType?: string }; periodDescriptor?: { periodType?: string } } | null | undefined,
  playByPlay: { gameOutcome?: { lastPeriodType?: string } } | null | undefined,
  finished: boolean,
): string {
  const explicit = playByPlay?.gameOutcome?.lastPeriodType ?? landing?.gameOutcome?.lastPeriodType;
  if (explicit) return explicit;
  if (finished) {
    const type = landing?.periodDescriptor?.periodType;
    if (type === "OT" || type === "SO") return type;
  }
  return "REG";
}

// ---- cache envelope: goals_json holds goals + penalties with no schema change ----

interface Timeline {
  goals: GoalEvent[];
  penalties: PenaltyEvent[];
  shootout: ShootoutAttempt[];
  // False when the play-by-play fetch failed (or the row predates the
  // timeline) -- penalties/clips are then missing, so the cache row is
  // treated as stale and retried on the next view.
  complete: boolean;
}

export function serializeTimeline(timeline: Timeline): string {
  return JSON.stringify({ v: 3, complete: timeline.complete, goals: timeline.goals, penalties: timeline.penalties, shootout: timeline.shootout });
}

// Reads both the current envelope and the legacy bare goals array.
export function parseTimeline(goalsJson: string): Timeline {
  const parsed = JSON.parse(goalsJson);
  if (Array.isArray(parsed)) {
    return {
      goals: parsed.map((g: GoalEvent) => ({ ...g, period: g.period ?? periodFromLabel(g.period_label) })),
      penalties: [],
      shootout: [],
      complete: false,
    };
  }
  return { goals: parsed.goals ?? [], penalties: parsed.penalties ?? [], shootout: parsed.shootout ?? [], complete: parsed.complete !== false };
}
