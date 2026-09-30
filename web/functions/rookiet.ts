// Rookie-pörssi, phase 4. Same shape as Tilastot -- reads rookie_season_stats
// instead of skater_season_stats via the shared leaderboard renderer.

import { escapeHtml, seasonLabel } from "./_shared/format";
import { renderSkaterLeaderboard } from "./_shared/leaderboard";
import { renderLayout } from "./_shared/layout";
import type { Env, SkaterStatsRow } from "./_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: rookies } = await db
    .prepare("SELECT * FROM rookie_season_stats ORDER BY points DESC, goals DESC, name ASC")
    .all<SkaterStatsRow>();

  const seasonText = rookies.length ? seasonLabel(rookies[0].season_id) : "";

  const content = `
<header class="page-header">
  <h1>🐣 Rookie-pörssi</h1>
  <p class="subtitle">Kausi ${escapeHtml(seasonText)}</p>
  <p class="standings-legend">Napauta sarakeotsikkoa järjestääksesi taulukon sen mukaan.</p>
</header>

<section>
  ${renderSkaterLeaderboard({
    tableId: "rookie-stats-table",
    rows: rookies,
    emptyMessage: "Ei vielä tilastoituja rookieita tällä kaudella.",
  })}
</section>
`;

  const html = await renderLayout({
    title: "Rookie-pörssi · Morning Hockey",
    headerTitle: "Rookie-pörssi",
    activePage: "rookies",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
