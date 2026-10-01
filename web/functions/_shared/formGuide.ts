// Kuntopuntari (form guide): each team's momentum over its most recent
// games, same win/loss point convention as divisionPoints.ts/sarjataulukko.ts
// (win=2, OT/SO loss=1, REG loss=0). Ranked by points percentage over the
// window rather than raw points, so a team with fewer than `windowSize`
// games played (start of season, or a postponed game) is still comparable
// to one with a full window.

import type { GameRow } from "./types";

export type FormResult = "W" | "L" | "OTL";

export interface FormGuideEntry {
  abbrev: string;
  // Chronological oldest -> newest, at most windowSize entries.
  results: FormResult[];
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  maxPoints: number;
  pointsPct: number;
}

export function computeFormGuide(games: GameRow[], abbrevs: string[], windowSize: number): FormGuideEntry[] {
  const entries = abbrevs.map((abbrev) => {
    const teamGames = games
      .filter((g) => g.is_finished === 1 && (g.away_abbrev === abbrev || g.home_abbrev === abbrev))
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.game_id - a.game_id)
      .slice(0, windowSize)
      .reverse();

    let wins = 0;
    let losses = 0;
    let otLosses = 0;
    let points = 0;

    const results: FormResult[] = teamGames.map((g) => {
      const isHome = g.home_abbrev === abbrev;
      const teamScore = isHome ? g.home_score : g.away_score;
      const opponentScore = isHome ? g.away_score : g.home_score;
      const won = teamScore > opponentScore;

      if (won) {
        wins++;
        points += 2;
        return "W";
      }
      if (g.final_type !== "REG") {
        otLosses++;
        points += 1;
        return "OTL";
      }
      losses++;
      return "L";
    });

    const maxPoints = teamGames.length * 2;
    const pointsPct = maxPoints > 0 ? points / maxPoints : 0;

    return { abbrev, results, wins, losses, otLosses, points, maxPoints, pointsPct };
  });

  return entries.sort((a, b) => b.pointsPct - a.pointsPct || b.points - a.points);
}
