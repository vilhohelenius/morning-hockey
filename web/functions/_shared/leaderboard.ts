// Shared leaderboard tables: identical markup/behavior between Tilastot
// (skater_season_stats), Maalivahtipörssi (goalie_season_stats) and
// Rookie-pörssi (rookie_season_stats) -- same team/nationality dropdown
// filters (skater tables also get a position filter), same click-to-sort
// headers, same incremental "show 25 more" paging. Only the table id, row
// source/shape, and empty-state message differ, so factored out rather
// than duplicated.

import { escapeHtml, formatToi, nationalityFlag, positionTag, teamLogoUrl } from "./format";
import { TEAM_COLORS } from "./teamColors";
import { formatGsax, gsaxPer100 } from "./xg";
import type { GoalieStatsRow, SkaterStatsRow, TeamRosterGoalieRow, TeamRosterSkaterRow } from "./types";

export const COLLAPSE_AT = 25;
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
      label: `<img src="${escapeHtml(logoByTeam.get(t) ?? "")}" alt="${escapeHtml(t)}" title="${escapeHtml(t)}" class="multi-filter-logo" loading="lazy">`,
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

export function expandToggle(tableId: string, totalRows: number): string {
  return totalRows > COLLAPSE_AT
    ? `<button type="button" class="expand-toggle" data-table-id="${tableId}" data-page-size="${PAGE_SIZE}"></button>`
    : "";
}

// Small colored dots after a player's name (replacing the old left-edge row
// stripes): blue = Finnish, team color = on one of the user's favorite
// teams. The team color always comes from the fixed TEAM_COLORS map, never
// from request/user input, so it's safe in a style attribute with no
// escaping. highlights=false (the user's Asetukset toggle) -> no dots.
export interface HighlightOptions {
  highlights: boolean;
  favoriteTeamAbbrevs: Set<string>;
}

export function highlightDots(nationality: string, teamAbbrev: string, options: HighlightOptions): string {
  if (!options.highlights) return "";
  const dots: string[] = [];
  if (nationality === "FIN") {
    dots.push(`<span class="hl-dot hl-dot-fin" title="Suomalainen pelaaja" aria-label="Suomalainen pelaaja"></span>`);
  }
  if (options.favoriteTeamAbbrevs.has(teamAbbrev)) {
    const color = TEAM_COLORS[teamAbbrev] ?? "var(--accent)";
    const label = `Suosikkijoukkue ${escapeHtml(teamAbbrev)}`;
    dots.push(`<span class="hl-dot hl-dot-team" style="--dot-color:${color}" title="${label}" aria-label="${label}"></span>`);
  }
  return dots.length ? `<span class="hl-dots">${dots.join("")}</span>` : "";
}

function renderRow(row: SkaterStatsRow, rank: number, hl: HighlightOptions, withShots: boolean): string {
  const spg = row.games_played ? (row.shots ?? 0) / row.games_played : 0;
  return `
      <tr data-name="${escapeHtml(row.name)}" data-team="${escapeHtml(row.team_abbrev)}"
          data-nationality="${escapeHtml(row.nationality)}"
          data-gp="${row.games_played}" data-goals="${row.goals}" data-assists="${row.assists}"
          data-rank="${rank}" data-position="${escapeHtml(row.position)}" data-spg="${spg}">
        <td class="col-rank">${rank}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              <span class="player-name-line">${escapeHtml(row.name)}${highlightDots(row.nationality, row.team_abbrev, hl)}</span>
              <span class="player-meta">${nationalityFlag(row.nationality)} · ${positionTag(row.position)} · <img src="${escapeHtml(row.logo)}" alt="${escapeHtml(row.team_abbrev)}" class="table-team-logo" loading="lazy"></span>
            </span>
          </a>
        </td>
        <td>${row.games_played}</td>
        <td>${row.goals}</td>
        <td>${row.assists}</td>
        <td class="stat-strong">${row.points}</td>
        ${withShots ? `<td>${spg.toFixed(1)}</td>` : ""}
      </tr>`;
}

interface LeaderboardOptions {
  tableId: string;
  rows: SkaterStatsRow[];
  emptyMessage?: string;
  favoriteTeamAbbrevs?: Set<string>;
  highlights?: boolean;
}

export function renderSkaterLeaderboard(options: LeaderboardOptions): string {
  const { tableId, rows, emptyMessage, favoriteTeamAbbrevs = new Set<string>(), highlights = true } = options;
  const hl = { highlights, favoriteTeamAbbrevs };

  if (!rows.length && emptyMessage) {
    return `<p class="empty-note">${escapeHtml(emptyMessage)}</p>`;
  }

  // Column only when shots are synced (rookie table has none).
  const withShots = rows.some((row) => (row.shots ?? 0) > 0);
  const body = rows.map((row, index) => renderRow(row, index + 1, hl, withShots)).join("");

  return `
  <div class="table-filters" data-table-id="${tableId}">
    ${positionFilterSelect()}
    ${teamFilterDropdown(rows)}
    ${nationalityFilterDropdown(rows)}
  </div>
  <div class="stats-table-wrap">
    <table class="stats-table porssi-table" id="${tableId}" data-collapse-at="${COLLAPSE_AT}">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="gp">O</th>
          <th data-sort="goals">M</th>
          <th data-sort="assists">S</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">P</th>
          ${withShots ? '<th data-sort="spg">L/O</th>' : ""}
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>
  ${expandToggle(tableId, rows.length)}`;
}

// Missing xG sorts last in either direction's usual use (-1000 is below any
// real GSAx), and shows as "–".
function gsaxValues(row: GoalieStatsRow): { gsax: number | null; per100: number | null } {
  if (row.xga === null || row.xga === undefined) return { gsax: null, per100: null };
  const gsax = row.xga - (row.xg_goals_against ?? 0);
  return { gsax, per100: gsaxPer100(gsax, row.shots_against ?? 0) };
}

function renderGoalieRow(row: GoalieStatsRow, rank: number, hl: HighlightOptions, withXg: boolean): string {
  const { gsax, per100 } = gsaxValues(row);
  return `
      <tr data-name="${escapeHtml(row.name)}" data-team="${escapeHtml(row.team_abbrev)}"
          data-nationality="${escapeHtml(row.nationality)}"
          data-gp="${row.games_played}" data-wins="${row.wins}" data-shutouts="${row.shutouts}"
          data-gaa="${row.goals_against_average}" data-gsax="${gsax ?? -1000}" data-gsax100="${per100 ?? -1000}" data-rank="${rank}">
        <td class="col-rank">${rank}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              <span class="player-name-line">${escapeHtml(row.name)}${highlightDots(row.nationality, row.team_abbrev, hl)}</span>
              <span class="player-meta">${nationalityFlag(row.nationality)} · <img src="${escapeHtml(row.logo)}" alt="${escapeHtml(row.team_abbrev)}" class="table-team-logo" loading="lazy"></span>
            </span>
          </a>
        </td>
        <td>${row.games_played}</td>
        <td>${row.wins}</td>
        <td>${row.goals_against_average.toFixed(2)}</td>
        <td class="stat-strong">${row.save_pct.toFixed(3)}</td>
        <td>${row.shutouts}</td>
        ${withXg ? `<td>${formatGsax(gsax)}</td><td>${formatGsax(per100, 2)}</td>` : ""}
      </tr>`;
}

interface GoalieLeaderboardOptions {
  tableId: string;
  rows: GoalieStatsRow[];
  emptyMessage?: string;
  favoriteTeamAbbrevs?: Set<string>;
  highlights?: boolean;
}

export function renderGoalieLeaderboard(options: GoalieLeaderboardOptions): string {
  const { tableId, rows, emptyMessage, favoriteTeamAbbrevs = new Set<string>(), highlights = true } = options;
  const hl = { highlights, favoriteTeamAbbrevs };

  if (!rows.length && emptyMessage) {
    return `<p class="empty-note">${escapeHtml(emptyMessage)}</p>`;
  }

  const withXg = rows.some((row) => row.xga !== null && row.xga !== undefined);
  const body = rows.map((row, index) => renderGoalieRow(row, index + 1, hl, withXg)).join("");

  return `
  <div class="table-filters" data-table-id="${tableId}">
    ${teamFilterDropdown(rows)}
    ${nationalityFilterDropdown(rows)}
  </div>
  <div class="stats-table-wrap">
    <table class="stats-table porssi-table" id="${tableId}" data-collapse-at="${COLLAPSE_AT}">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="gp">O</th>
          <th data-sort="wins">V</th>
          <th data-sort="gaa">GAA</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">SV%</th>
          <th data-sort="shutouts">NP</th>
          ${withXg ? '<th data-sort="gsax">GSAx</th><th data-sort="gsax100">GSAx/100</th>' : ""}
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

// showTeam's small inline team tag -- unlike the leaderboard tables above,
// TeamRosterSkaterRow/TeamRosterGoalieRow carry no `logo` column of their
// own (every other row on a roster table is already the same team, so it's
// normally redundant), hence teamLogoUrl() instead of a stored logo field.
function teamMetaLogo(abbrev: string): string {
  return `<img src="${escapeHtml(teamLogoUrl(abbrev))}" alt="${escapeHtml(abbrev)}" class="table-team-logo" loading="lazy">`;
}

// `hl` (only passed by /omat/pelaajat) makes the roster table pörssi-style:
// larger rows plus highlight dots. Team/game pages omit it and keep the
// compact table.
export function renderRosterSkaterTable(
  skaters: TeamRosterSkaterRow[],
  sectionTitle: string,
  showTeam = false,
  hl?: HighlightOptions,
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
              <span class="player-name-line">${escapeHtml(player.name)}${hl ? highlightDots(player.nationality, player.team_abbrev, hl) : ""}</span>
              <span class="player-meta">#${player.sweater_number} · ${nationalityFlag(player.nationality)} ${positionTag(player.position)}${showTeam ? ` · ${teamMetaLogo(player.team_abbrev)}` : ""}</span>
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
    <table class="stats-table${hl ? " porssi-table porssi-table-fav" : ""}">
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
  hl?: HighlightOptions,
  gsax?: Map<number, number>, // season GSAx per player_id; column hidden when empty/absent
): string {
  const withGsax = !!gsax?.size;
  const rows = goalies
    .map(
      (player, index) => `
      <tr data-name="${escapeHtml(player.name)}" data-gp="${player.games_played}" data-wins="${player.wins}"
          data-shutouts="${player.shutouts}"
          data-gaa="${player.goals_against_average}" data-gsax="${gsax?.get(player.player_id) ?? -1000}" data-rank="${index + 1}">
        <td class="col-rank">${index + 1}</td>
        <td>
          <a href="/pelaajat/${player.player_id}" class="player-cell">
            <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              <span class="player-name-line">${escapeHtml(player.name)}${hl ? highlightDots(player.nationality, player.team_abbrev, hl) : ""}</span>
              <span class="player-meta">#${player.sweater_number} · ${nationalityFlag(player.nationality)}${showTeam ? ` · ${teamMetaLogo(player.team_abbrev)}` : ""}</span>
            </span>
          </a>
        </td>
        <td>${player.games_played}</td>
        <td>${player.wins}</td>
        <td>${player.shutouts}</td>
        <td>${player.goals_against_average.toFixed(2)}</td>
        <td class="stat-strong">${player.save_pct.toFixed(3)}</td>
        ${withGsax ? `<td>${formatGsax(gsax!.get(player.player_id), 2)}</td>` : ""}
      </tr>`,
    )
    .join("");

  return `
<section>
  <h2 class="section-title">${sectionTitle}</h2>
  <div class="stats-table-wrap">
    <table class="stats-table${hl ? " porssi-table porssi-table-fav" : ""}">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="gp">O</th>
          <th data-sort="wins">V</th>
          <th data-sort="shutouts">NP</th>
          <th data-sort="gaa">GAA</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">SV%</th>
          ${withGsax ? '<th data-sort="gsax">GSAx</th>' : ""}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}
