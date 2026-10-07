// Pistepörssi (league-wide skater leaderboard), phase 4: the first port of
// an existing static page onto the D1-backed site. Reads skater_season_stats
// as synced by the slow-tier workflow -- build_skater_top's cap is high
// enough in practice to mean "every skater who's recorded a point this
// season", so no LIMIT is needed here; the "show 25 more" paging in
// _shared/leaderboard.ts is what keeps the initial page small, not a cut
// at the data source.
//
// Rookie-pörssi used to be its own page/route (rookiet.ts) -- folded in
// here as a filter instead (2026-10-01), since it was the exact same table
// shape and leaderboard renderer reading a second, near-identical table
// (rookie_season_stats). Both leaderboards are rendered server-side and
// toggled client-side (same pill + is-hidden pattern as the day-picker/
// season-type-picker/team-games-picker in app.js), so switching filters
// doesn't need a second request.

import { favoriteTeamAbbrevs, readHighlightsCookie } from "./_shared/auth";
import { icon, escapeHtml, seasonLabel } from "./_shared/format";
import { renderSkaterLeaderboard } from "./_shared/leaderboard";
import { renderLayout } from "./_shared/layout";
import type { Env, SkaterStatsRow } from "./_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const [{ results: skaters }, { results: rookies }] = await Promise.all([
    db.prepare("SELECT * FROM skater_season_stats ORDER BY points DESC, goals DESC, name ASC").all<SkaterStatsRow>(),
    db.prepare("SELECT * FROM rookie_season_stats ORDER BY points DESC, goals DESC, name ASC").all<SkaterStatsRow>(),
  ]);

  const seasonText = skaters.length ? seasonLabel(skaters[0].season_id) : "";
  const favTeams = await favoriteTeamAbbrevs(context.request, context.env);

  const content = `
<header class="page-header">
  <h1>${icon("puck")} Pistepörssi</h1>
  <p class="subtitle">Kausi ${escapeHtml(seasonText)}</p>
  <p class="standings-legend">Napauta sarakeotsikkoa järjestääksesi taulukon sen mukaan.</p>
</header>

<div class="player-filter-picker">
  <button type="button" class="day-pill active" data-filter="all">Kaikki pelaajat</button>
  <button type="button" class="day-pill" data-filter="rookie">${icon("rookie")} Rookiet</button>
</div>

<section class="player-filter-section" data-filter="all">
  ${renderSkaterLeaderboard({ tableId: "skater-stats-table", rows: skaters, favoriteTeamAbbrevs: favTeams, highlights: readHighlightsCookie(context.request) })}
</section>

<section class="player-filter-section is-hidden" data-filter="rookie">
  ${renderSkaterLeaderboard({
    tableId: "rookie-stats-table",
    rows: rookies,
    emptyMessage: "Ei vielä tilastoituja rookieita tällä kaudella.",
    favoriteTeamAbbrevs: favTeams, highlights: readHighlightsCookie(context.request),
  })}
</section>
`;

  const html = await renderLayout({
    title: "Pistepörssi · Morning Hockey",
    headerTitle: "Pistepörssi",
    activePage: "league_stats",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
