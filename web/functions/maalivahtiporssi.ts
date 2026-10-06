// Maalivahtipörssi (league-wide goalie leaderboard) -- the nav link for
// this has existed since phase 4 (_shared/layout.ts's STATS_PAGES), but the
// route itself was never built; goalie_season_stats was previously capped
// at 30 (build_goalie_top's old default) and the site had nowhere to show
// them anyway. Now that the cap is gone (see league_stats.py) and
// _shared/leaderboard.ts has a goalie-shaped table, this is the same port
// pattern as tilastot.ts.

import { favoriteTeamAbbrevs, readHighlightsCookie } from "./_shared/auth";
import { escapeHtml, seasonLabel } from "./_shared/format";
import { renderGoalieLeaderboard } from "./_shared/leaderboard";
import { renderLayout } from "./_shared/layout";
import type { Env, GoalieStatsRow } from "./_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: goalies } = await db
    .prepare("SELECT * FROM goalie_season_stats ORDER BY save_pct DESC, wins DESC, name ASC")
    .all<GoalieStatsRow>();

  const seasonText = goalies.length ? seasonLabel(goalies[0].season_id) : "";
  const favTeams = await favoriteTeamAbbrevs(context.request, context.env);

  const content = `
<header class="page-header">
  <h1>🥅 Maalivahtipörssi</h1>
  <p class="subtitle">Kausi ${escapeHtml(seasonText)}</p>
  <p class="standings-legend">Napauta sarakeotsikkoa järjestääksesi taulukon sen mukaan.</p>
</header>

<section>
  ${renderGoalieLeaderboard({ tableId: "goalie-stats-table", rows: goalies, favoriteTeamAbbrevs: favTeams, highlights: readHighlightsCookie(context.request) })}
</section>
`;

  const html = await renderLayout({
    title: "Maalivahtipörssi · Morning Hockey",
    headerTitle: "Maalivahtipörssi",
    activePage: "goalie_stats",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
