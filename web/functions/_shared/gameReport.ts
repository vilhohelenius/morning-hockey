// TS port of game_report.py's per-player stat building, field-for-field
// from the already-proven Python code -- with one deliberate deviation:
// nationality comes from each team's current ROSTER (2 cheap calls),
// not a league-wide skater/goalie "bios" sweep of ~800+300 players.
//
// game_report.py's league-wide bios fetch made sense there: build_game_reports
// amortizes it across a whole team's ~10-game batch in one nightly run. Here,
// a single on-demand visit for ONE game would otherwise pay that same
// league-wide fetch cost for nothing -- the roster endpoint already carries
// birthCountry per player (finnish.py's _roster_index reads the same field),
// and a game's players are necessarily on one of these two rosters.

import type { GoalieGameStat, PlayerGameStat } from "./types";

const HEADSHOT_URL = (season: number, abbrev: string, playerId: number) =>
  `https://assets.nhle.com/mugs/nhl/${season}/${abbrev}/${playerId}.png`;

const NO_TOI = new Set(["0:00", "00:00"]);

interface RawRosterPlayer {
  id: number;
  birthCountry?: string;
}

interface RawRoster {
  forwards?: RawRosterPlayer[];
  defensemen?: RawRosterPlayer[];
  goalies?: RawRosterPlayer[];
}

export function rosterNationalities(roster: RawRoster): Map<number, string> {
  const map = new Map<number, string>();
  for (const group of [roster.forwards ?? [], roster.defensemen ?? [], roster.goalies ?? []]) {
    for (const player of group) {
      map.set(player.id, player.birthCountry ?? "");
    }
  }
  return map;
}

interface RawBoxscorePlayer {
  playerId: number;
  name: { default: string };
  position?: string;
  goals?: number;
  assists?: number;
  points?: number;
  plusMinus?: number;
  sog?: number;
  pim?: number;
  toi?: string;
  decision?: string | null;
  saves?: number;
  shotsAgainst?: number;
  savePctg?: number;
}

function skaterStat(row: RawBoxscorePlayer, teamAbbrev: string, seasonId: number, nationalities: Map<number, string>): PlayerGameStat {
  const playerId = row.playerId;
  return {
    player_id: playerId,
    name: row.name.default,
    position: row.position ?? "",
    nationality: nationalities.get(playerId) ?? "",
    headshot: HEADSHOT_URL(seasonId, teamAbbrev, playerId),
    goals: row.goals ?? 0,
    assists: row.assists ?? 0,
    points: row.points ?? 0,
    plus_minus: row.plusMinus ?? 0,
    shots: row.sog ?? 0,
    pim: row.pim ?? 0,
    toi: row.toi ?? "0:00",
  };
}

function goalieStat(row: RawBoxscorePlayer, teamAbbrev: string, seasonId: number, nationalities: Map<number, string>): GoalieGameStat {
  const playerId = row.playerId;
  return {
    player_id: playerId,
    name: row.name.default,
    nationality: nationalities.get(playerId) ?? "",
    headshot: HEADSHOT_URL(seasonId, teamAbbrev, playerId),
    decision: row.decision ?? null,
    saves: row.saves ?? 0,
    shots_against: row.shotsAgainst ?? 0,
    save_pct: row.savePctg ?? 0,
    toi: row.toi ?? "0:00",
  };
}

interface RawBoxscoreSide {
  forwards?: RawBoxscorePlayer[];
  defense?: RawBoxscorePlayer[];
  goalies?: RawBoxscorePlayer[];
}

export function teamPlayerStats(
  side: RawBoxscoreSide,
  teamAbbrev: string,
  seasonId: number,
  nationalities: Map<number, string>,
): { skaters: PlayerGameStat[]; goalies: GoalieGameStat[] } {
  const skaters = [...(side.forwards ?? []), ...(side.defense ?? [])].map((row) =>
    skaterStat(row, teamAbbrev, seasonId, nationalities),
  );
  skaters.sort((a, b) => b.points - a.points || b.goals - a.goals);

  const goalies = (side.goalies ?? [])
    .filter((row) => !NO_TOI.has(row.toi ?? "0:00"))
    .map((row) => goalieStat(row, teamAbbrev, seasonId, nationalities));

  return { skaters, goalies };
}
