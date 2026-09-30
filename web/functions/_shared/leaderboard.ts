// Shared skater-leaderboard table: identical markup/behavior between
// Tilastot (skater_season_stats) and Rookie-pörssi (rookie_season_stats) --
// same columns, same Kaikki/Hyökkääjät/Puolustajat filter, same click-to-sort
// headers, same top-25 collapse. Only the table id, row source, and
// empty-state message differ, so factored out rather than duplicated a
// second time.

import { escapeHtml, formatToi, nationalityFlag } from "./format";
import type { SkaterStatsRow, TeamRosterGoalieRow, TeamRosterSkaterRow } from "./types";

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

// Roster-shaped tables (team_roster_skaters/team_roster_goalies), as opposed
// to the top-N leaderboard tables above (skater_season_stats etc.) --
// different row shape (sweater number instead of nationality/season_id, no
// position filter), but same stats-table markup/sort/column-rank behavior.
// Originally private to joukkueet/[abbrev].ts; factored out here so
// /omat/pelaajat's favorites list can reuse the identical table instead of
// duplicating it.

export function renderRosterSkaterTable(
  skaters: TeamRosterSkaterRow[],
  sectionTitle: string,
  showTeam = false,
): string {
  const rows = skaters
    .map(
      (player, index) => `
      <tr data-name="${escapeHtml(player.name)}" data-gp="${player.games_played}"
          data-goals="${player.goals}" data-assists="${player.assists}" data-rank="${index + 1}"
          data-plusminus="${player.plus_minus}" data-toi="${player.avg_toi_seconds}">
        <td class="col-rank">${index + 1}</td>
        <td>
          <span class="player-cell">
            <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(player.name)}
              <span class="player-meta">#${player.sweater_number} · ${nationalityFlag(player.nationality)} ${escapeHtml(player.position)}${showTeam ? ` · ${escapeHtml(player.team_abbrev)}` : ""}</span>
            </span>
          </span>
        </td>
        <td>${player.games_played}</td>
        <td>${player.goals}</td>
        <td>${player.assists}</td>
        <td class="stat-strong">${player.points}</td>
        <td>${player.plus_minus > 0 ? "+" : ""}${player.plus_minus}</td>
        <td>${formatToi(player.avg_toi_seconds)}</td>
      </tr>`,
    )
    .join("");

  return `
<section>
  <h2 class="section-title">${sectionTitle}</h2>
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="gp">O</th>
          <th data-sort="goals">M</th>
          <th data-sort="assists">S</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">P</th>
          <th data-sort="plusminus">+/-</th>
          <th data-sort="toi">KA</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

export function renderRosterGoalieTable(
  goalies: TeamRosterGoalieRow[],
  sectionTitle: string,
  showTeam = false,
): string {
  const rows = goalies
    .map(
      (player, index) => `
      <tr data-name="${escapeHtml(player.name)}" data-gp="${player.games_played}" data-wins="${player.wins}"
          data-losses="${player.losses}" data-otl="${player.ot_losses}"
          data-gaa="${player.goals_against_average}" data-rank="${index + 1}">
        <td class="col-rank">${index + 1}</td>
        <td>
          <span class="player-cell">
            <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(player.name)}
              <span class="player-meta">#${player.sweater_number}${showTeam ? ` · ${escapeHtml(player.team_abbrev)}` : ""}</span>
            </span>
          </span>
        </td>
        <td>${player.games_played}</td>
        <td>${player.wins}</td>
        <td>${player.losses}</td>
        <td>${player.ot_losses}</td>
        <td>${player.goals_against_average.toFixed(2)}</td>
        <td class="stat-strong">${player.save_pct.toFixed(3)}</td>
      </tr>`,
    )
    .join("");

  return `
<section>
  <h2 class="section-title">${sectionTitle}</h2>
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="gp">O</th>
          <th data-sort="wins">V</th>
          <th data-sort="losses">H</th>
          <th data-sort="otl">JH</th>
          <th data-sort="gaa">GAA</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">SV%</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}
