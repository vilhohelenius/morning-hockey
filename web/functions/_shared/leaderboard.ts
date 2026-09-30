// Shared skater-leaderboard table: identical markup/behavior between
// Tilastot (skater_season_stats) and Rookie-pörssi (rookie_season_stats) --
// same columns, same Kaikki/Hyökkääjät/Puolustajat filter, same click-to-sort
// headers, same top-25 collapse. Only the table id, row source, and
// empty-state message differ, so factored out rather than duplicated a
// second time.

import { escapeHtml, nationalityFlag } from "./format";
import type { SkaterStatsRow } from "./types";

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

export interface LeaderboardOptions {
  tableId: string;
  rows: SkaterStatsRow[];
  emptyMessage?: string;
}

export function renderSkaterLeaderboard(options: LeaderboardOptions): string {
  const { tableId, rows, emptyMessage } = options;

  if (!rows.length && emptyMessage) {
    return `<p class="empty-note">${escapeHtml(emptyMessage)}</p>`;
  }

  const body = rows.map((row, index) => renderRow(row, index + 1)).join("");

  return `
  <div class="table-filters" data-table-id="${tableId}">
    <button type="button" class="filter-btn active" data-position="all">Kaikki</button>
    <button type="button" class="filter-btn" data-position="F">Hyökkääjät</button>
    <button type="button" class="filter-btn" data-position="D">Puolustajat</button>
  </div>
  <div class="stats-table-wrap">
    <table class="stats-table" id="${tableId}" data-collapse-at="${COLLAPSE_AT}">
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
  </div>
  ${
    rows.length > COLLAPSE_AT
      ? `<button type="button" class="expand-toggle" data-table-id="${tableId}"
       data-expand-label="Näytä kaikki (${rows.length}) →"
       data-collapse-label="Näytä vähemmän (top ${COLLAPSE_AT}) ↑"></button>`
      : ""
  }`;
}
