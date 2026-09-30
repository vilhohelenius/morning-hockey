// Pistepörssi (league-wide skater leaderboard), phase 4: the first port of
// an existing static page onto the D1-backed site. Reads skater_season_stats
// as synced by the phase 2 slow-tier workflow -- already capped per-position
// by build_skater_top before it ever reaches D1, so no LIMIT is needed here.

import { escapeHtml, seasonLabel } from "./_shared/format";
import { renderSkaterLeaderboard } from "./_shared/leaderboard";
import { renderLayout } from "./_shared/layout";
import type { Env, SkaterStatsRow } from "./_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: skaters } = await db
    .prepare("SELECT * FROM skater_season_stats ORDER BY points DESC, goals DESC, name ASC")
    .all<SkaterStatsRow>();

  const seasonText = skaters.length ? seasonLabel(skaters[0].season_id) : "";

  const content = `
<header class="page-header">
  <h1>🏒 Pistepörssi</h1>
  <p class="subtitle">Kausi ${escapeHtml(seasonText)}</p>
  <p class="standings-legend">Napauta sarakeotsikkoa järjestääksesi taulukon sen mukaan.</p>
</header>

<section>
  ${renderSkaterLeaderboard({ tableId: "skater-stats-table", rows: skaters })}
</section>
`;

  const html = renderLayout({
    title: "Pistepörssi · Morning Hockey",
    headerTitle: "Pistepörssi",
    activePage: "league_stats",
    content,
    request: context.request,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
