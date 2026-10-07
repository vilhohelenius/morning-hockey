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

import { fetchGoaliesSeasonGsaxMap, fetchLeagueTeamXg,rankBadge as badge, rankIn, teamIdOf, type TeamXg, xgfPct } from "../_shared/xg";
import { currentUsername } from "../_shared/auth";
import { icon, escapeHtml, renderFavStar, renderGameRow, teamHeroBackgroundStyle } from "../_shared/format";
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

// A single .stat-card: header bar + a grid of label/value cells, the same
// markup as the player card's season stats (the old one-row table ran off
// the screen on phones once the xG columns were added).
function renderSeasonStats(
  stats: TeamSeasonStatsRow | null,
  xg: TeamXg | null,
  allStats: TeamSeasonStatsRow[],
  leagueXg: Map<number, TeamXg & { games: number }>,
  teamId: number | undefined,
): string {
  if (!stats) return "";
  const goalDifferential = stats.goals_for - stats.goals_against;

  // Counting stats are ranked per game since teams have played different numbers of games.
  const perGame = (value: number, games: number) => (games > 0 ? value / games : 0);
  const statRank = (value: (r: TeamSeasonStatsRow) => number, higherIsBetter: boolean) =>
    badge(rankIn(value(stats), allStats.map(value), higherIsBetter));
  const diffPerGame = (r: TeamSeasonStatsRow) => perGame(r.goals_for - r.goals_against, r.games_played);
  const xgAll = [...leagueXg.values()];
  const xgRank = (value: (r: TeamXg & { games: number }) => number, higherIsBetter: boolean) =>
    xg && teamId !== undefined && leagueXg.has(teamId) ? badge(rankIn(value(leagueXg.get(teamId)!), xgAll.map(value), higherIsBetter)) : "";
  const pct = (r: TeamXg, five = false) => xgfPct(five ? r.xgf5v5 : r.xgf, five ? r.xga5v5 : r.xga) ?? 0;

  const cell = (label: string, value: string, highlight = false, rank = "") =>
    `<div class="stat-card-cell${highlight ? " stat-card-highlight" : ""}"><span class="stat-card-label">${label}</span><span class="stat-card-value">${value}${rank}</span></div>`;
  const cells = [
    cell("O", `${stats.games_played}`),
    cell("YV%", (stats.power_play_pct * 100).toFixed(1), false, statRank((r) => r.power_play_pct, true)),
    cell("AV%", (stats.penalty_kill_pct * 100).toFixed(1), false, statRank((r) => r.penalty_kill_pct, true)),
    cell("AL%", (stats.faceoff_pct * 100).toFixed(1), false, statRank((r) => r.faceoff_pct, true)),
    cell("TM", `${stats.goals_for}`, false, statRank((r) => perGame(r.goals_for, r.games_played), true)),
    cell("PM", `${stats.goals_against}`, false, statRank((r) => perGame(r.goals_against, r.games_played), false)),
    cell("+/-", `${goalDifferential > 0 ? "+" : ""}${goalDifferential}`, true, statRank(diffPerGame, true)),
    cell("LKT/O", stats.shots_for_per_game.toFixed(1), false, statRank((r) => r.shots_for_per_game, true)),
    cell("NP", `${stats.shutouts}`, false, statRank((r) => r.shutouts, true)),
    ...(xg
      ? [
          cell("xGF", xg.xgf.toFixed(1), false, xgRank((r) => perGame(r.xgf, r.games), true)),
          cell("xGA", xg.xga.toFixed(1), false, xgRank((r) => perGame(r.xga, r.games), false)),
          cell("xGF%", (xgfPct(xg.xgf, xg.xga) ?? 0).toFixed(1), false, xgRank((r) => pct(r), true)),
          cell("xGF% 5v5", (xgfPct(xg.xgf5v5, xg.xga5v5) ?? 0).toFixed(1), false, xgRank((r) => pct(r, true), true)),
        ]
      : []),
  ].join("");

  return `
<section>
  <h2 class="section-title">Kausitilastot</h2>
  <div class="stat-card">
    <div class="stat-card-header">Runkosarja</div>
    <div class="stat-card-grid-cells">${cells}</div>
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
  const goalieGsax = await fetchGoaliesSeasonGsaxMap(db, goalies.map((g) => g.player_id));

  const teamId = teamIdOf(abbrev);
  const leagueXg = await fetchLeagueTeamXg(db);
  const teamXg = teamId !== undefined ? (leagueXg.get(teamId) ?? null) : null;
  const { results: allSeasonStats } = await db.prepare("SELECT * FROM team_season_stats").all<TeamSeasonStatsRow>();

  const username = currentUsername(context.request);
  const isFavoriteTeam = username
    ? !!(await db.prepare("SELECT 1 FROM favorite_teams WHERE username = ? AND team_abbrev = ?").bind(username, abbrev).first())
    : false;

  const content = `
<a class="back-link js-back" href="/sarjataulukko">← Takaisin</a>

<header class="page-header team-page-header hero-banner" data-abbr="${escapeHtml(abbrev)}" style="${escapeHtml(teamHeroBackgroundStyle(abbrev))}">
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
  <div class="team-hero-text">
    <h1>${escapeHtml(team.name)}</h1>
    <p class="subtitle">
      ${escapeHtml(team.division)}: ${team.division_rank}. sija · ${team.wins}-${team.losses}-${team.ot_losses} (${team.points} p)
    </p>
  </div>
</header>

${renderSeasonStats(seasonStats ?? null, teamXg, allSeasonStats, leagueXg, teamId)}

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

<a class="filter-btn team-schedule-link" href="/joukkueet/${abbrev.toLowerCase()}/ottelut">${icon("calendar")} Kaikki ottelut</a>

${skaters.length ? renderRosterSkaterTable(skaters, `${icon("puck")} Rosteri`) : ""}
${goalies.length ? renderRosterGoalieTable(goalies, `${icon("goal")} Maalivahdit`, false, undefined, goalieGsax) : ""}
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
