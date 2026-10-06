// Division points-race (Analytiikka page): reconstructs each team's
// cumulative standings points over the season straight from `games` --
// no separate history/snapshot table needed, since every finished game
// already carries its date, final score, and final_type. Same win/loss
// point convention as sarjataulukko.ts's recent-results badge (REG loss
// g.final_type !== "REG" distinguishes an OT/SO loss from a regulation one).
//
// One data point per game actually played, not per calendar date -- a step
// chart connects these in date order, matching how standings points really
// move (in jumps on game nights, flat otherwise), so there's no need to
// backfill the empty days in between.

import type { GameRow } from "./types";

interface DivisionPointsPoint {
  date: string;
  points: number;
}

interface DivisionPointsSeries {
  abbrev: string;
  points: DivisionPointsPoint[];
}

export function computeDivisionPointsRace(games: GameRow[], abbrevs: string[]): DivisionPointsSeries[] {
  return abbrevs.map((abbrev) => {
    const teamGames = games
      .filter((g) => g.is_finished === 1 && (g.away_abbrev === abbrev || g.home_abbrev === abbrev))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.game_id - b.game_id);

    let cumulative = 0;
    const points: DivisionPointsPoint[] = teamGames.map((g) => {
      const isHome = g.home_abbrev === abbrev;
      const teamScore = isHome ? g.home_score : g.away_score;
      const opponentScore = isHome ? g.away_score : g.home_score;
      const won = teamScore > opponentScore;
      cumulative += won ? 2 : g.final_type !== "REG" ? 1 : 0;
      return { date: g.date, points: cumulative };
    });

    return { abbrev, points };
  });
}
