// Shared leaderboard tables: identical markup/behavior between Tilastot
// (skater_season_stats), Maalivahtipörssi (goalie_season_stats) and
// Rookie-pörssi (rookie_season_stats) -- same team/nationality dropdown
// filters (skater tables also get a position filter), same click-to-sort
// headers, same incremental "show 25 more" paging. Only the table id, row
// source/shape, and empty-state message differ, so factored out rather
// than duplicated.

import { escapeHtml, formatToi, nationalityFlag } from "./format";
import type { GoalieStatsRow, SkaterStatsRow, TeamRosterGoalieRow, TeamRosterSkaterRow } from "./types";

const COLLAPSE_AT = 25;
const PAGE_SIZE = 25;

// A checkbox-panel dropdown (not a <select>, which can't do multi-choice
// in a mobile-friendly way) -- any number of boxes can be checked at once,
// AND'd with every other active filter. <details>/<summary> gives this for
// free: no open/close JS needed, just reading which boxes are checked.
function multiFilterDropdown(filterKey: string, allLabel: string, options: { value: string; label: string }[]): string {
  return `
  <details class="multi-filter" data-filter="${filterKey}">
    <summary data-all-label="${escapeHtml(allLabel)}">${escapeHtml(allLabel)}</summary>
    <div class="multi-filter-panel">
      ${options
        .map((o) => `<label><input type="checkbox" value="${escapeHtml(o.value)}">${o.label}</label>`)
        .join("")}
    </div>
  </details>`;
}

function teamFilterDropdown(rows: { team_abbrev: string; logo: string }[]): string {
  const logoByTeam = new Map(rows.map((r) => [r.team_abbrev, r.logo]));
  const teams = [...logoByTeam.keys()].sort();
  return multiFilterDropdown(
    "team",
    "Kaikki joukkueet",
    teams.map((t) => ({
      value: t,
      label: `<img src="${escapeHtml(logoByTeam.get(t) ?? "")}" alt="" class="multi-filter-logo" loading="lazy">${escapeHtml(t)}`,
    })),
  );
}

function nationalityFilterDropdown(rows: { nationality: string }[]): string {
  const nationalities = [...new Set(rows.map((r) => r.nationality))].filter(Boolean).sort();
  return multiFilterDropdown(
    "nationality",
    "Kaikki maat",
    nationalities.map((n) => ({ value: n, label: `${nationalityFlag(n)} ${escapeHtml(n)}` })),
  );
}

function positionFilterSelect(): string {
  return `
  <select data-filter="position">
    <option value="all">Kaikki pelipaikat</option>
    <option value="F">Hyökkääjät</option>
    <option value="D">Puolustajat</option>
  </select>`;
}

function expandToggle(tableId: string, totalRows: number): string {
  return totalRows > COLLAPSE_AT
    ? `<button type="button" class="expand-toggle" data-table-id="${tableId}" data-page-size="${PAGE_SIZE}"></button>`
    : "";
}

function renderRow(row: SkaterStatsRow, rank: number): string {
  const rowClasses = [row.nationality === "FIN" ? "row-fin" : "", row.team_abbrev === "CHI" ? "row-chi" : ""]
    .filter(Boolean)
    .join(" ");

  return `
      <tr class="${rowClasses}" data-name="${escapeHtml(row.name)}" data-team="${escapeHtml(row.team_abbrev)}"
          data-nationality="${escapeHtml(row.nationality)}"
          data-gp="${row.games_played}" data-goals="${row.goals}" data-assists="${row.assists}"
          data-rank="${rank}" data-position="${escapeHtml(row.position)}">
        <td class="col-rank">${rank}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(row.name)}
              <span class="player-meta">${nationalityFlag(row.nationality)} ${escapeHtml(row.nationality)} · ${escapeHtml(row.position)}</span>
            </span>
          </a>
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
    ${positionFilterSelect()}
    ${teamFilterDropdown(rows)}
    ${nationalityFilterDropdown(rows)}
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
  ${expandToggle(tableId, rows.length)}`;
}

function renderGoalieRow(row: GoalieStatsRow, rank: number): string {
  const rowClasses = [row.nationality === "FIN" ? "row-fin" : ""].filter(Boolean).join(" ");

  return `
      <tr class="${rowClasses}" data-name="${escapeHtml(row.name)}" data-team="${escapeHtml(row.team_abbrev)}"
          data-nationality="${escapeHtml(row.nationality)}"
          data-gp="${row.games_played}" data-wins="${row.wins}" data-shutouts="${row.shutouts}"
          data-gaa="${row.goals_against_average}" data-rank="${rank}">
        <td class="col-rank">${rank}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(row.name)}
              <span class="player-meta">${nationalityFlag(row.nationality)} ${escapeHtml(row.nationality)}</span>
            </span>
          </a>
        </td>
        <td><img src="${escapeHtml(row.logo)}" alt="" class="table-team-logo" loading="lazy">${escapeHtml(row.team_abbrev)}</td>
        <td>${row.games_played}</td>
        <td>${row.wins}</td>
        <td>${row.goals_against_average.toFixed(2)}</td>
        <td class="stat-strong">${row.save_pct.toFixed(3)}</td>
        <td>${row.shutouts}</td>
      </tr>`;
}

export interface GoalieLeaderboardOptions {
  tableId: string;
  rows: GoalieStatsRow[];
  emptyMessage?: string;
}

export function renderGoalieLeaderboard(options: GoalieLeaderboardOptions): string {
  const { tableId, rows, emptyMessage } = options;

  if (!rows.length && emptyMessage) {
    return `<p class="empty-note">${escapeHtml(emptyMessage)}</p>`;
  }

  const body = rows.map((row, index) => renderGoalieRow(row, index + 1)).join("");

  return `
  <div class="table-filters" data-table-id="${tableId}">
    ${teamFilterDropdown(rows)}
    ${nationalityFilterDropdown(rows)}
  </div>
  <div class="stats-table-wrap">
    <table class="stats-table" id="${tableId}" data-collapse-at="${COLLAPSE_AT}">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="team" data-type="text">Jkk</th>
          <th data-sort="gp">O</th>
          <th data-sort="wins">V</th>
          <th data-sort="gaa">GAA</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">SV%</th>
          <th data-sort="shutouts">NP</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>
  ${expandToggle(tableId, rows.length)}`;
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
          <a href="/pelaajat/${player.player_id}" class="player-cell">
            <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(player.name)}
              <span class="player-meta">#${player.sweater_number} · ${nationalityFlag(player.nationality)} ${escapeHtml(player.position)}${showTeam ? ` · ${escapeHtml(player.team_abbrev)}` : ""}</span>
            </span>
          </a>
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
          <a href="/pelaajat/${player.player_id}" class="player-cell">
            <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(player.name)}
              <span class="player-meta">#${player.sweater_number}${showTeam ? ` · ${escapeHtml(player.team_abbrev)}` : ""}</span>
            </span>
          </a>
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
