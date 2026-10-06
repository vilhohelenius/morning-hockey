// Analytiikka: points-race line charts, first of a planned set of visual
// stats pages (pie charts etc. later). Two views, toggled client-side like
// everywhere else on the site (wirePillToggle in app.js):
//  - Joukkueet: one chart per division, cumulative standings points per
//    team, reconstructed straight from the games table -- see
//    _shared/divisionPoints.ts for why no separate history table is needed.
//  - Pistepörssi: one chart with the current top-10 skaters' cumulative
//    season points, from _shared/skaterGameLog.ts's on-demand NHL game-log
//    fetch+cache (per-game skater history isn't reconstructable from D1 the
//    way team points are -- see that module's header comment).
//
// Everything is computed and embedded server-side as JSON; static/
// analytiikka.js (D3) only ever reads it and draws once -- switching views
// or divisions just toggles which already-drawn section is visible, same
// render-everything-once pattern as the day-picker/team-games-picker.

import { favoriteTeamAbbrevs } from "./_shared/auth";
import { computeDivisionPointsRace } from "./_shared/divisionPoints";
import { abbreviatedName, escapeHtml } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import { getSkaterPointsRace } from "./_shared/skaterGameLog";
import type { Env, GameRow, SkaterStatsRow, StandingsRow } from "./_shared/types";

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

interface AnalyticsSkater {
  playerId: number;
  name: string;
  headshot: string;
  logo: string;
  series: { date: string; points: number }[];
}

const TOP_SKATER_COUNT = 10;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const [{ results: standings }, { results: games }, { results: topSkaters }, favTeams] = await Promise.all([
    db.prepare("SELECT * FROM standings_rows ORDER BY division, division_rank").all<StandingsRow>(),
    db.prepare("SELECT * FROM games WHERE is_finished = 1 ORDER BY date ASC, start_time_utc ASC").all<GameRow>(),
    db
      .prepare("SELECT * FROM skater_season_stats ORDER BY points DESC, goals DESC, name ASC LIMIT ?")
      .bind(TOP_SKATER_COUNT)
      .all<SkaterStatsRow>(),
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

  const seasonId = topSkaters[0]?.season_id;
  const pointsByPlayer = seasonId
    ? await getSkaterPointsRace(
        db,
        topSkaters.map((s) => s.player_id),
        seasonId,
      )
    : new Map<number, { date: string; points: number }[]>();

  const skaters: AnalyticsSkater[] = topSkaters.map((s) => ({
    playerId: s.player_id,
    name: abbreviatedName(s.name),
    headshot: s.headshot,
    logo: s.logo,
    series: pointsByPlayer.get(s.player_id) ?? [],
  }));

  // Same defensive escape sarjataulukko.ts's embedded snapshot JSON already
  // applies: a stray "</script" inside the data can't close the tag early.
  const divisionsJson = JSON.stringify(divisions).replace(/<\//g, "<\\/");
  const skatersJson = JSON.stringify(skaters).replace(/<\//g, "<\\/");

  const content = `
<header class="page-header">
  <h1>📈 Analytiikka</h1>
  <p class="subtitle">Pisterace kauden ajalta</p>
</header>

<div class="analytiikka-view-picker">
  <button type="button" class="day-pill active" data-view="teams">Joukkueet</button>
  <button type="button" class="day-pill" data-view="skaters">Pistepörssi</button>
</div>

<section class="analytiikka-view-section" data-view="teams">
  <div class="division-picker">
    ${picker}
  </div>
  ${sections}
</section>

<section class="analytiikka-view-section is-hidden" data-view="skaters">
  <div class="skater-chart"></div>
</section>

<script type="application/json" id="analytiikka-data">${divisionsJson}</script>
<script type="application/json" id="pisteporssi-data">${skatersJson}</script>
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
