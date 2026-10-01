// Analytiikka: division points-race line chart, first of a planned set of
// visual stats pages (pie charts etc. later). Uses computeDivisionPointsRace
// (_shared/divisionPoints.ts) to reconstruct every team's cumulative points
// straight from the games table -- see that module for why no separate
// history/snapshot table is needed.
//
// All four divisions are computed and embedded server-side as one JSON
// blob; static/analytiikka.js (D3) only ever reads that, and switching
// divisions toggles which already-drawn section is visible -- same
// render-everything-once, toggle-client-side pattern as the day-picker/
// team-games-picker elsewhere on the site, so it never refetches.

import { favoriteTeamAbbrevs } from "./_shared/auth";
import { computeDivisionPointsRace } from "./_shared/divisionPoints";
import { escapeHtml } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, GameRow, StandingsRow } from "./_shared/types";

interface AnalyticsTeam {
  abbrev: string;
  name: string;
  logo: string;
  series: { date: string; points: number }[];
}

interface AnalyticsDivision {
  division: string;
  teams: AnalyticsTeam[];
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const [{ results: standings }, { results: games }, favTeams] = await Promise.all([
    db.prepare("SELECT * FROM standings_rows ORDER BY division, division_rank").all<StandingsRow>(),
    db.prepare("SELECT * FROM games WHERE is_finished = 1 ORDER BY date ASC, start_time_utc ASC").all<GameRow>(),
    favoriteTeamAbbrevs(context.request, context.env),
  ]);

  const teamsByAbbrev = new Map(standings.map((row) => [row.abbrev, row]));
  const divisionNames = [...new Set(standings.map((row) => row.division))].sort();

  const divisions: AnalyticsDivision[] = divisionNames.map((division) => {
    const teams = standings.filter((row) => row.division === division);
    const series = computeDivisionPointsRace(games, teams.map((t) => t.abbrev));
    return {
      division,
      teams: series.map((s) => {
        const team = teamsByAbbrev.get(s.abbrev)!;
        return { abbrev: s.abbrev, name: team.name, logo: team.logo, series: s.points };
      }),
    };
  });

  const favoriteAbbrev = [...favTeams][0];
  const defaultDivision = (favoriteAbbrev && teamsByAbbrev.get(favoriteAbbrev)?.division) || divisionNames[0] || "";

  const picker = divisionNames
    .map(
      (division) =>
        `<button type="button" class="day-pill ${division === defaultDivision ? "active" : ""}" data-division="${escapeHtml(division)}">${escapeHtml(division)}</button>`,
    )
    .join("");

  const sections = divisions
    .map(
      (d) => `
<section class="division-chart-section ${d.division === defaultDivision ? "" : "is-hidden"}" data-division="${escapeHtml(d.division)}">
  <div class="division-chart" data-division="${escapeHtml(d.division)}"></div>
</section>`,
    )
    .join("");

  // Same defensive escape sarjataulukko.ts's embedded snapshot JSON already
  // applies: a stray "</script" inside the data can't close the tag early.
  const dataJson = JSON.stringify(divisions).replace(/<\//g, "<\\/");

  const content = `
<header class="page-header">
  <h1>📈 Analytiikka</h1>
  <p class="subtitle">Divisioonan pisterace kauden ajalta</p>
</header>

<div class="division-picker">
  ${picker}
</div>
${sections}

<script type="application/json" id="analytiikka-data">${dataJson}</script>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<script src="/static/analytiikka.js"></script>
`;

  const html = await renderLayout({
    title: "Analytiikka · Morning Hockey",
    headerTitle: "Analytiikka",
    activePage: "analytics",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
