// Team page, phase 3 of the Cloudflare migration: the first route that
// reads from D1 instead of Python/Jinja2's static build.
//
// Deliberately narrower than templates/team.html: only tables the fast/slow
// sync workflows already populate (games, standings_rows, skater/goalie
// season stats) are used. Full roster (sweater numbers, per-game TOI,
// +/-) and team-level season stats (PP%/PK%/faceoff%) aren't synced to D1
// yet -- that's deferred to phase 6 alongside the "all 32 teams" rollout,
// per the phase 2 commit. This page shows what's actually available today:
// identity + division standing, recent/upcoming results, and the team's
// own skater/goalie leaders.
//
// Also missing for the same reason: OT/SO badges on finished games -- the
// games table stores game_state/is_finished but not the period-type of the
// finish, so recent results only show plain W/L, not "W OT"/"L SO".

import { escapeHtml, shortDate } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import type { Env, GameRow, GoalieStatsRow, SkaterStatsRow, StandingsRow } from "../_shared/types";

const RECENT_GAMES = 10;
const UPCOMING_GAMES = 10;

function renderDivisionTable(division: StandingsRow[], teamAbbrev: string): string {
  const rows = division
    .map(
      (row) => `
    <div class="division-row ${row.abbrev === teamAbbrev ? "is-team" : ""}">
      <span class="division-rank">${row.division_rank}</span>
      <span class="division-team">
        <img src="${escapeHtml(row.logo)}" alt="" class="division-logo" loading="lazy">
        ${escapeHtml(row.abbrev)}
      </span>
      <span class="division-stats">
        <span>${row.games_played}</span>
        <span>${row.wins}</span>
        <span>${row.losses}</span>
        <span>${row.ot_losses}</span>
        <span class="division-points">${row.points}</span>
      </span>
    </div>`,
    )
    .join("");

  return `
<section>
  <h2 class="section-title">Sarjataulukko · ${escapeHtml(division[0]?.division ?? "")}</h2>
  <div class="division-table">
    <div class="division-row division-header">
      <span class="division-rank"></span>
      <span class="division-team">Joukkue</span>
      <span class="division-stats"><span>O</span><span>V</span><span>H</span><span>JH</span><span>P</span></span>
    </div>
    ${rows}
  </div>
</section>`;
}

function renderGameRow(game: GameRow, teamAbbrev: string, played: boolean): string {
  const isHome = game.home_abbrev === teamAbbrev;
  const teamScore = isHome ? game.home_score : game.away_score;
  const opponentScore = isHome ? game.away_score : game.home_score;
  const opponentAbbrev = isHome ? game.away_abbrev : game.home_abbrev;
  const opponentLogo = isHome ? game.away_logo : game.home_logo;
  const result = played ? (teamScore > opponentScore ? "W" : "L") : null;

  return `
    <div class="schedule-row">
      <span class="schedule-date">${shortDate(game.date)}</span>
      <span class="schedule-opponent">
        ${isHome ? "vs" : "@"}
        <img src="${escapeHtml(opponentLogo)}" alt="" class="schedule-logo" loading="lazy">
        ${escapeHtml(opponentAbbrev)}
      </span>
      ${
        played
          ? `<span class="schedule-score">${teamScore}–${opponentScore}</span>
      <span class="schedule-result result-${result?.toLowerCase()}">${result}</span>`
          : ""
      }
    </div>`;
}

function renderSkaterTable(skaters: SkaterStatsRow[]): string {
  const rows = skaters
    .map(
      (player, index) => `
      <tr>
        <td class="col-rank">${index + 1}</td>
        <td>
          <span class="player-cell">
            <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(player.name)}
              <span class="player-meta">${escapeHtml(player.position)}</span>
            </span>
          </span>
        </td>
        <td>${player.games_played}</td>
        <td>${player.goals}</td>
        <td>${player.assists}</td>
        <td class="stat-strong">${player.points}</td>
      </tr>`,
    )
    .join("");

  return `
<section>
  <h2 class="section-title">🏒 Pistepörssi</h2>
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th>Pelaaja</th>
          <th>O</th>
          <th>M</th>
          <th>S</th>
          <th>P</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

function renderGoalieTable(goalies: GoalieStatsRow[]): string {
  const rows = goalies
    .map(
      (player, index) => `
      <tr>
        <td class="col-rank">${index + 1}</td>
        <td>
          <span class="player-cell">
            <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">${escapeHtml(player.name)}</span>
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
  <h2 class="section-title">🥅 Maalivahdit</h2>
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th>Pelaaja</th>
          <th>O</th>
          <th>V</th>
          <th>H</th>
          <th>JH</th>
          <th>GAA</th>
          <th>SV%</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const abbrev = String(context.params.abbrev).toUpperCase();
  const db = context.env.DB;

  const team = await db
    .prepare("SELECT * FROM standings_rows WHERE abbrev = ?")
    .bind(abbrev)
    .first<StandingsRow>();

  if (!team) {
    return new Response(`Tuntematon joukkue tai ei vielä synkattu D1:een: ${escapeHtml(abbrev)}`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const { results: division } = await db
    .prepare("SELECT * FROM standings_rows WHERE conference = ? AND division = ? ORDER BY division_rank")
    .bind(team.conference, team.division)
    .all<StandingsRow>();

  const { results: recentGames } = await db
    .prepare(
      "SELECT * FROM games WHERE (away_abbrev = ? OR home_abbrev = ?) AND is_finished = 1 ORDER BY date DESC LIMIT ?",
    )
    .bind(abbrev, abbrev, RECENT_GAMES)
    .all<GameRow>();

  const { results: upcomingGames } = await db
    .prepare(
      "SELECT * FROM games WHERE (away_abbrev = ? OR home_abbrev = ?) AND is_finished = 0 ORDER BY date ASC LIMIT ?",
    )
    .bind(abbrev, abbrev, UPCOMING_GAMES)
    .all<GameRow>();

  const { results: skaters } = await db
    .prepare("SELECT * FROM skater_season_stats WHERE team_abbrev = ? ORDER BY points DESC")
    .bind(abbrev)
    .all<SkaterStatsRow>();

  const { results: goalies } = await db
    .prepare("SELECT * FROM goalie_season_stats WHERE team_abbrev = ? ORDER BY save_pct DESC")
    .bind(abbrev)
    .all<GoalieStatsRow>();

  const content = `
<header class="page-header team-page-header">
  <img src="${escapeHtml(team.logo)}" alt="" class="team-hero-logo">
  <h1>${escapeHtml(team.name)}</h1>
  <p class="subtitle">
    ${escapeHtml(team.division)}: ${team.division_rank}. sija · ${team.wins}-${team.losses}-${team.ot_losses} (${team.points} p)
  </p>
</header>

${renderDivisionTable(division, abbrev)}

<section>
  <h2 class="section-title">Edelliset ottelut</h2>
  ${
    recentGames.length
      ? `<div class="schedule-list">${recentGames.map((g) => renderGameRow(g, abbrev, true)).join("")}</div>`
      : `<p class="empty-note">Ei vielä pelattuja otteluita synkattuna.</p>`
  }
</section>

<section>
  <h2 class="section-title">Tulevat ottelut</h2>
  ${
    upcomingGames.length
      ? `<div class="schedule-list">${upcomingGames.map((g) => renderGameRow(g, abbrev, false)).join("")}</div>`
      : `<p class="empty-note">Ei tiedossa olevia otteluita synkattuna.</p>`
  }
</section>

${skaters.length ? renderSkaterTable(skaters) : ""}
${goalies.length ? renderGoalieTable(goalies) : ""}
`;

  const html = renderLayout({
    title: `${team.name} · Morning Hockey`,
    headerTitle: team.name,
    activePage: `team_${abbrev.toLowerCase()}`,
    content,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
