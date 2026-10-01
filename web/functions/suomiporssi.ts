// Suomipörssi, phase 4. Reads finnish_skater_stats/finnish_goalie_stats --
// deliberately separate tables from skater_season_stats/goalie_season_stats,
// see the d1/schema.sql comment and the commit that added them: this page
// needs every Finnish player, not the overall top-N cut those hold.
//
// Unlike Tilastot/Rookie-pörssi, there's no position filter here (every row
// is already Finnish, no further split makes sense) and no row-fin
// highlighting (it would highlight every row). Bespoke table markup rather
// than reusing _shared/leaderboard.ts, which assumes both of those.

import { escapeHtml, seasonLabel } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, FinnishGoalieRow, FinnishSkaterRow } from "./_shared/types";

function renderSkaterTable(rows: FinnishSkaterRow[]): string {
  const body = rows
    .map(
      (row, index) => `
      <tr data-name="${escapeHtml(row.name)}" data-team="${escapeHtml(row.team_abbrev)}"
          data-gp="${row.games_played}" data-goals="${row.goals}" data-assists="${row.assists}" data-rank="${index + 1}">
        <td class="col-rank">${index + 1}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(row.name)}
              <span class="player-meta">${escapeHtml(row.position)}</span>
            </span>
          </a>
        </td>
        <td><img src="${escapeHtml(row.logo)}" alt="" class="table-team-logo" loading="lazy">${escapeHtml(row.team_abbrev)}</td>
        <td>${row.games_played}</td>
        <td>${row.goals}</td>
        <td>${row.assists}</td>
        <td class="stat-strong">${row.points}</td>
      </tr>`,
    )
    .join("");

  return `
  <div class="stats-table-wrap">
    <table class="stats-table">
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
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderGoalieTable(rows: FinnishGoalieRow[]): string {
  const body = rows
    .map(
      (row, index) => `
      <tr data-name="${escapeHtml(row.name)}" data-team="${escapeHtml(row.team_abbrev)}"
          data-wins="${row.wins}" data-losses="${row.losses}" data-otl="${row.ot_losses}"
          data-gaa="${row.goals_against_average}" data-shutouts="${row.shutouts}" data-rank="${index + 1}">
        <td class="col-rank">${index + 1}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">${escapeHtml(row.name)}</span>
          </a>
        </td>
        <td><img src="${escapeHtml(row.logo)}" alt="" class="table-team-logo" loading="lazy">${escapeHtml(row.team_abbrev)}</td>
        <td>${row.games_played}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td>${row.ot_losses}</td>
        <td>${row.goals_against_average.toFixed(2)}</td>
        <td class="stat-strong">${row.save_pct.toFixed(3)}</td>
        <td>${row.shutouts}</td>
      </tr>`,
    )
    .join("");

  return `
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="team" data-type="text">Jkk</th>
          <th data-sort="gp">O</th>
          <th data-sort="wins">V</th>
          <th data-sort="losses">H</th>
          <th data-sort="otl">JH</th>
          <th data-sort="gaa">GAA</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">SV%</th>
          <th data-sort="shutouts">NP</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: skaters } = await db
    .prepare("SELECT * FROM finnish_skater_stats ORDER BY points DESC, goals DESC, name ASC")
    .all<FinnishSkaterRow>();

  const { results: goalies } = await db
    .prepare("SELECT * FROM finnish_goalie_stats ORDER BY save_pct DESC, wins DESC, name ASC")
    .all<FinnishGoalieRow>();

  const seasonSource = skaters[0]?.season_id ?? goalies[0]?.season_id;
  const seasonText = seasonSource ? seasonLabel(seasonSource) : "";

  const content = `
<header class="page-header">
  <h1>🇫🇮 Suomipörssi</h1>
  <p class="subtitle">Kausi ${escapeHtml(seasonText)}</p>
</header>

<section>
  <h2 class="section-title">🏒 Pistepörssi · ${skaters.length} pelaajaa</h2>
  ${skaters.length ? renderSkaterTable(skaters) : `<p class="empty-note">Ei tilastoituja suomalaispelaajia tälle kaudelle vielä.</p>`}
</section>

<section>
  <h2 class="section-title">🥅 Maalivahtipörssi · ${goalies.length} pelaajaa</h2>
  ${goalies.length ? renderGoalieTable(goalies) : `<p class="empty-note">Ei tilastoituja suomalaisia maalivahteja tälle kaudelle vielä.</p>`}
</section>
`;

  const html = await renderLayout({
    title: "Suomipörssi · Morning Hockey",
    headerTitle: "Suomipörssi",
    activePage: "suomiporssi",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
