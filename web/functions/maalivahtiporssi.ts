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
import { XG_INFO_TEXT } from "./_shared/xg";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: goalies } = await db
    .prepare(
      `SELECT g.*, x.xga, x.goals_against AS xg_goals_against, x.shots_against
       FROM goalie_season_stats g
       LEFT JOIN (
         SELECT player_id, season, SUM(xga) AS xga, SUM(goals_against) AS goals_against,
                SUM(shots_against) AS shots_against
         FROM goalie_game_xg
         WHERE season IN (SELECT DISTINCT season_id FROM goalie_season_stats)
         GROUP BY player_id, season
       ) x ON x.player_id = g.player_id AND x.season = g.season_id
       ORDER BY g.save_pct DESC, g.wins DESC, g.name ASC`,
    )
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

${goalies.some((g) => g.xga !== null && g.xga !== undefined) ? XG_INFO_TEXT : ""}
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
