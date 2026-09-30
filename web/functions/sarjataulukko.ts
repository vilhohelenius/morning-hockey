// Sarjataulukko (standings), phase 4. Division tables + wildcard race are
// fully covered by standings_rows (already synced). The click-a-team
// snapshot popup (recent results/top scorers/next game) is NOT ported here
// -- it needs team_snapshot.py's data, explicitly deferred to phase 6 per
// the phase 2 commit. The .team-trigger buttons are kept (same markup,
// same hover styling) but stay inert: app.js only wires up the popup's
// click handler when a #team-snapshots <script> element exists on the
// page, so omitting it is a clean no-op, not a dangling broken feature.

import { escapeHtml, humanDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, StandingsRow } from "./_shared/types";

const WILDCARD_SPOTS_SHOWN = 6;
const WILDCARD_CUTOFF = 2;

function renderTeamRow(row: StandingsRow, rankLabel: string): string {
  return `
    <div class="division-row">
      <span class="division-rank">${rankLabel}</span>
      <button type="button" class="division-team team-trigger" data-team-abbrev="${escapeHtml(row.abbrev)}" data-team-name="${escapeHtml(row.name)}">
        <img src="${escapeHtml(row.logo)}" alt="" class="division-logo" loading="lazy">
        ${escapeHtml(row.abbrev)}
        ${row.qualified ? `<span class="playoff-dot"></span>` : ""}
      </button>
      <span class="division-stats cols-6">
        <span>${row.games_played}</span>
        <span>${row.wins}</span>
        <span>${row.losses}</span>
        <span>${row.ot_losses}</span>
        <span>${row.goal_differential > 0 ? "+" : ""}${row.goal_differential}</span>
        <span class="division-points">${row.points}</span>
      </span>
    </div>`;
}

function renderDivisionTable(rows: StandingsRow[]): string {
  return `
  <div class="division-table">
    <div class="division-row division-header">
      <span class="division-rank"></span>
      <span class="division-team">Joukkue</span>
      <span class="division-stats cols-6"><span>O</span><span>V</span><span>H</span><span>JH</span><span>+/-</span><span>P</span></span>
    </div>
    ${rows.map((row) => renderTeamRow(row, String(row.division_rank))).join("")}
  </div>`;
}

function renderWildcardRace(rows: StandingsRow[]): string {
  const shown = rows.slice(0, WILDCARD_SPOTS_SHOWN);
  const rowsHtml = shown
    .map((row, index) => renderTeamRow(row, `VK${row.wildcard_rank}`) + (index + 1 === WILDCARD_CUTOFF ? `<div class="wc-cutoff-line"></div>` : ""))
    .join("");

  return `
  <h3 class="roster-group-title">Villi kortti -taisto</h3>
  <div class="division-table">${rowsHtml}</div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: rows } = await db
    .prepare("SELECT * FROM standings_rows ORDER BY conference, division, division_rank")
    .all<StandingsRow>();

  const asOfDate = rows[0]?.as_of_date ?? "";

  const conferenceNames = [...new Set(rows.map((r) => r.conference))].sort();

  const sections = conferenceNames
    .map((conferenceName) => {
      const conferenceRows = rows.filter((r) => r.conference === conferenceName);
      const divisionNames = [...new Set(conferenceRows.map((r) => r.division))].sort();

      const divisionTables = divisionNames
        .map((divisionName) => {
          const divisionRows = conferenceRows.filter((r) => r.division === divisionName);
          return `
  <h3 class="roster-group-title">${escapeHtml(divisionName)}</h3>
  ${renderDivisionTable(divisionRows)}`;
        })
        .join("");

      const wildcardRows = conferenceRows
        .filter((r) => r.wildcard_rank > 0)
        .sort((a, b) => a.wildcard_rank - b.wildcard_rank);

      return `
<section>
  <h2 class="section-title">${escapeHtml(conferenceName)}-konferenssi</h2>
  ${divisionTables}
  ${renderWildcardRace(wildcardRows)}
</section>`;
    })
    .join("");

  const content = `
<header class="page-header">
  <h1>Sarjataulukko</h1>
  <p class="subtitle">Tilanne ${asOfDate ? escapeHtml(humanDate(asOfDate)) : ""}</p>
  <p class="standings-legend"><span class="playoff-dot"></span> mahtuisi pudotuspeleihin tänään</p>
</header>
${sections}
`;

  const html = renderLayout({
    title: "Sarjataulukko · Morning Hockey",
    headerTitle: "Sarjataulukko",
    activePage: "standings",
    content,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
