// Team page. Phase 3 built this against a top-N proxy (skater_season_stats/
// goalie_season_stats, globally capped) since no per-team roster sync
// existed yet. Phase 6 added team_roster_skaters/team_roster_goalies
// (every team's actual current roster) and team_season_stats (PP%/PK%/
// faceoff%/shots) -- this is the real, complete port of team.html.
//
// Still missing: OT/SO badges on finished games here -- the games table
// stores game_state/is_finished but not the period-type of the finish, so
// recent results only show plain W/L, not "W OT"/"L SO". (The
// /ottelut/[gameId] report page *does* show that badge -- it gets
// final_type from the NHL API's landing() response directly, not from
// this table.)
//
// Every finished game's row links to its report page -- on-demand
// fetching (phase 5) means any finished game's report exists the moment
// someone visits it, unlike the original team.html, which only linked
// games nightly-digest.yml happened to pre-build a report for.

import { currentUsername } from "../_shared/auth";
import { escapeHtml, helsinkiParts, renderFavStar, shortDate, teamHeroBackgroundStyle } from "../_shared/format";
import { renderRosterGoalieTable, renderRosterSkaterTable } from "../_shared/leaderboard";
import { renderLayout } from "../_shared/layout";
import type {
  Env,
  GameRow,
  StandingsRow,
  TeamRosterGoalieRow,
  TeamRosterSkaterRow,
  TeamSeasonStatsRow,
} from "../_shared/types";

const RECENT_GAMES = 10;
const UPCOMING_GAMES = 10;

function renderDivisionTable(division: StandingsRow[], teamAbbrev: string): string {
  const rows = division
    .map(
      (row) => `
    <div class="division-row ${row.abbrev === teamAbbrev ? "is-team" : ""}">
      <span class="division-rank">${row.division_rank}</span>
      <span class="division-team">
        <img src="${escapeHtml(row.logo)}" alt="${escapeHtml(row.abbrev)}" class="division-logo" loading="lazy">
        <span class="division-name">${escapeHtml(row.name)}</span>
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
  const result = played ? (teamScore > opponentScore ? "W" : game.final_type !== "REG" ? "OTL" : "L") : null;

  const inner = `
      <span class="schedule-date">${shortDate(game.date)}</span>
      <span class="schedule-opponent">
        ${isHome ? "vs" : "@"}
        <img src="${escapeHtml(opponentLogo)}" alt="${escapeHtml(opponentAbbrev)}" class="schedule-logo" loading="lazy">
        ${escapeHtml(opponentAbbrev)}
      </span>
      ${
        played
          ? `<span class="schedule-score">${teamScore}–${opponentScore}</span>
      <span class="schedule-result result-${result?.toLowerCase()}">${result}</span>`
          : `<span class="schedule-time">${(() => {
              const { hour, minute } = helsinkiParts(game.start_time_utc);
              return `${hour}:${String(minute).padStart(2, "0")}`;
            })()}</span>`
      }`;

  return played
    ? `<a class="schedule-row schedule-row-link" href="/ottelut/${game.game_id}">${inner}</a>`
    : `<div class="schedule-row">${inner}</div>`;
}

function renderSeasonStats(stats: TeamSeasonStatsRow | null): string {
  if (!stats) return "";
  const goalDifferential = stats.goals_for - stats.goals_against;

  const tile = (value: string, label: string) => `
    <div class="stat-tile">
      <span class="stat-tile-value">${value}</span>
      <span class="stat-tile-label">${label}</span>
    </div>`;

  return `
<section>
  <h2 class="section-title">Kausitilastot</h2>
  <div class="stat-grid">
    ${tile(`${(stats.power_play_pct * 100).toFixed(1)} %`, "YV%")}
    ${tile(`${(stats.penalty_kill_pct * 100).toFixed(1)} %`, "AV%")}
    ${tile(`${(stats.faceoff_pct * 100).toFixed(1)} %`, "Aloitus%")}
    ${tile(String(stats.goals_for), "Tehdyt maalit")}
    ${tile(String(stats.goals_against), "Päästetyt maalit")}
    ${tile(`${goalDifferential > 0 ? "+" : ""}${goalDifferential}`, "Maaliero")}
    ${tile(stats.shots_for_per_game.toFixed(1), "Laukaukset/ottelu")}
    ${tile(String(stats.shutouts), "Nollapelit")}
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

  const seasonStats = await db
    .prepare("SELECT * FROM team_season_stats WHERE team_abbrev = ?")
    .bind(abbrev)
    .first<TeamSeasonStatsRow>();

  const { results: skaters } = await db
    .prepare(
      "SELECT * FROM team_roster_skaters WHERE team_abbrev = ? ORDER BY points DESC, goals DESC, name ASC",
    )
    .bind(abbrev)
    .all<TeamRosterSkaterRow>();

  const { results: goalies } = await db
    .prepare("SELECT * FROM team_roster_goalies WHERE team_abbrev = ? ORDER BY save_pct DESC")
    .bind(abbrev)
    .all<TeamRosterGoalieRow>();

  const username = currentUsername(context.request);
  const isFavoriteTeam = username
    ? !!(await db.prepare("SELECT 1 FROM favorite_teams WHERE username = ? AND team_abbrev = ?").bind(username, abbrev).first())
    : false;

  const content = `
<a class="back-link js-back" href="/sarjataulukko">← Takaisin</a>

<header class="page-header team-page-header hero-banner" style="${escapeHtml(teamHeroBackgroundStyle(abbrev))}">
  ${
    username
      ? renderFavStar({
          formAction: "/omat/favorites/teams",
          hiddenFields: { abbrev },
          isFavorite: isFavoriteTeam,
          redirectTo: `/joukkueet/${abbrev.toLowerCase()}`,
        })
      : ""
  }
  <img src="${escapeHtml(team.logo)}" alt="" class="team-hero-logo">
  <h1>${escapeHtml(team.name)}</h1>
  <p class="subtitle">
    ${escapeHtml(team.division)}: ${team.division_rank}. sija · ${team.wins}-${team.losses}-${team.ot_losses} (${team.points} p)
  </p>
</header>

${renderSeasonStats(seasonStats ?? null)}

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

${skaters.length ? renderRosterSkaterTable(skaters, "🏒 Pistepörssi") : ""}
${goalies.length ? renderRosterGoalieTable(goalies, "🥅 Maalivahdit") : ""}
`;

  const html = await renderLayout({
    title: `${team.name} · Morning Hockey`,
    headerTitle: team.name,
    activePage: `team_${abbrev.toLowerCase()}`,
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
