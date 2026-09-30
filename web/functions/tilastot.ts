// Pistepörssi (league-wide skater leaderboard), phase 4: the first port of
// an existing static page onto the D1-backed site. Reads skater_season_stats
// as synced by the phase 2 slow-tier workflow -- already capped per-position
// by build_skater_top before it ever reaches D1, so no LIMIT is needed here.
//
// The sort/filter/collapse behavior (click a column header, Kaikki/Hyökkääjät/
// Puolustajat filter buttons, "show all" toggle past 25 rows) is unchanged
// app.js driving data-* attributes -- this route only has to emit the same
// markup templates/league_stats.html did, not reimplement the behavior.

import { escapeHtml, nationalityFlag, seasonLabel } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, SkaterStatsRow } from "./_shared/types";

const COLLAPSE_AT = 25;

function renderRow(row: SkaterStatsRow, rank: number): string {
  const rowClasses = [row.nationality === "FIN" ? "row-fin" : "", row.team_abbrev === "CHI" ? "row-chi" : ""]
    .filter(Boolean)
    .join(" ");

  return `
      <tr class="${rowClasses}" data-name="${escapeHtml(row.name)}" data-team="${escapeHtml(row.team_abbrev)}"
          data-gp="${row.games_played}" data-goals="${row.goals}" data-assists="${row.assists}"
          data-rank="${rank}" data-position="${escapeHtml(row.position)}">
        <td class="col-rank">${rank}</td>
        <td>
          <span class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(row.name)}
              <span class="player-meta">${nationalityFlag(row.nationality)} ${escapeHtml(row.nationality)} · ${escapeHtml(row.position)}</span>
            </span>
          </span>
        </td>
        <td><img src="${escapeHtml(row.logo)}" alt="" class="table-team-logo" loading="lazy">${escapeHtml(row.team_abbrev)}</td>
        <td>${row.games_played}</td>
        <td>${row.goals}</td>
        <td>${row.assists}</td>
        <td class="stat-strong">${row.points}</td>
      </tr>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: skaters } = await db
    .prepare("SELECT * FROM skater_season_stats ORDER BY points DESC, goals DESC, name ASC")
    .all<SkaterStatsRow>();

  const seasonText = skaters.length ? seasonLabel(skaters[0].season_id) : "";
  const rows = skaters.map((row, index) => renderRow(row, index + 1)).join("");

  const content = `
<header class="page-header">
  <h1>🏒 Pistepörssi</h1>
  <p class="subtitle">Kausi ${escapeHtml(seasonText)}</p>
  <p class="standings-legend">Napauta sarakeotsikkoa järjestääksesi taulukon sen mukaan.</p>
</header>

<section>
  <div class="table-filters" data-table-id="skater-stats-table">
    <button type="button" class="filter-btn active" data-position="all">Kaikki</button>
    <button type="button" class="filter-btn" data-position="F">Hyökkääjät</button>
    <button type="button" class="filter-btn" data-position="D">Puolustajat</button>
  </div>
  <div class="stats-table-wrap">
    <table class="stats-table" id="skater-stats-table" data-collapse-at="${COLLAPSE_AT}">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="team" data-type="text">Jkk</th>
          <th data-sort="gp">O</th>
          <th data-sort="goals">M</th>
          <th data-sort="assists">S</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">P</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${
    skaters.length > COLLAPSE_AT
      ? `<button type="button" class="expand-toggle" data-table-id="skater-stats-table"
       data-expand-label="Näytä kaikki (${skaters.length}) →"
       data-collapse-label="Näytä vähemmän (top ${COLLAPSE_AT}) ↑"></button>`
      : ""
  }
</section>
`;

  const html = renderLayout({
    title: "Pistepörssi · Morning Hockey",
    headerTitle: "Pistepörssi",
    activePage: "league_stats",
    content,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
