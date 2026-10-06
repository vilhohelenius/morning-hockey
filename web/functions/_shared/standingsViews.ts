// Pure helpers for the Sarjataulukko tab views (Wild Card / Divisioona /
// Konferenssi / Liiga). Only uses columns standings_rows really has.

import type { StandingsRow } from "./types";

// ".833" / "1.000" like the NHL app; 0 games -> ".000".
export function formatPointsPct(points: number, gamesPlayed: number): string {
  if (gamesPlayed <= 0) return ".000";
  const pct = points / (2 * gamesPlayed);
  const text = pct.toFixed(3);
  return pct >= 1 ? text : text.replace(/^0/, "");
}

// Conference/league order: points, fewer games played, more wins, goal diff.
// (No regulation-wins column in our data, so wins stands in for RW.)
export function sortStandings(rows: StandingsRow[]): StandingsRow[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      a.games_played - b.games_played ||
      b.wins - a.wins ||
      b.goal_differential - a.goal_differential ||
      a.abbrev.localeCompare(b.abbrev),
  );
}

export interface WildCardConference {
  conference: string;
  // Each division's top `leadersPerDivision` teams by division rank.
  leaders: { division: string; rows: StandingsRow[] }[];
  // Wild-card race, ordered by wildcard_rank.
  race: StandingsRow[];
}

export function buildWildCardView(rows: StandingsRow[], leadersPerDivision = 3): WildCardConference[] {
  const conferences = [...new Set(rows.map((r) => r.conference))].sort();
  return conferences.map((conference) => {
    const confRows = rows.filter((r) => r.conference === conference);
    const divisions = [...new Set(confRows.map((r) => r.division))].sort();
    return {
      conference,
      leaders: divisions.map((division) => ({
        division,
        rows: confRows
          .filter((r) => r.division === division && r.division_rank <= leadersPerDivision)
          .sort((a, b) => a.division_rank - b.division_rank),
      })),
      race: confRows.filter((r) => r.wildcard_rank > 0).sort((a, b) => a.wildcard_rank - b.wildcard_rank),
    };
  });
}
