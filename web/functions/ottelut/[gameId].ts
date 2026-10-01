// On-demand game report, phase 5: TS port of game_report.py's page, but
// fetched from the NHL API live on first visit instead of pre-built
// nightly for one team's games. A cache hit (game_box_scores) skips the
// NHL fetch entirely; a cache miss fetches landing/right-rail/boxscore +
// both teams' rosters directly from api-web.nhle.com, parses them with the
// same _shared/boxscore.ts + _shared/gameReport.ts logic phase 5's parity
// test already verified against the Python test fixtures, then writes the
// result to D1 before rendering -- so the next visitor gets the cache hit.
//
// Only ever attempted for games.is_finished = 1: an unfinished game has no
// box score yet, so this renders a simple "not played yet" placeholder
// instead of calling the NHL API.
//
// final_type (REG/OT/SO) comes from landing()'s gameOutcome.lastPeriodType
// -- the same field name the scoreboard/schedule endpoints already use
// elsewhere in this codebase, but this is the first place reading it off
// *landing* specifically, since no existing Python code needed to. Falls
// back to "REG" if that assumption turns out wrong; worth checking an OT/SO
// game specifically when verifying this live.

import { getBoxScore, type ParsedBoxScore } from "../_shared/boxScoreCache";
import { buildPreviewTeamStats } from "../_shared/boxscore";
import { escapeHtml, finalTypeFi, humanDate, nationalityFlag } from "../_shared/format";
import { renderRosterGoalieTable, renderRosterSkaterTable } from "../_shared/leaderboard";
import { resolveHighlightsUrl } from "../_shared/youtube";
import { renderLayout } from "../_shared/layout";
import type {
  Env,
  GameRow,
  GoalEvent,
  GoalieGameStat,
  PlayerGameStat,
  TeamRosterGoalieRow,
  TeamRosterSkaterRow,
  TeamSeasonStatsRow,
  TeamStatRow,
} from "../_shared/types";

function renderGoalTimeline(goals: GoalEvent[], awayAbbrev: string, awayLogo: string, homeLogo: string): string {
  if (!goals.length) return `<p class="tp-empty">Ei maaleja.</p>`;

  let html = "";
  let currentPeriod: string | null = null;
  for (const goal of goals) {
    if (goal.period_label !== currentPeriod) {
      currentPeriod = goal.period_label;
      html += `<p class="gd-period">${escapeHtml(currentPeriod)}</p>`;
    }
    const logo = goal.team_abbrev === awayAbbrev ? awayLogo : homeLogo;
    html += `
      <div class="gd-goal-row">
        <div class="gd-goal-main">
          <span class="gd-goal-time">${escapeHtml(goal.time_in_period)}</span>
          <img src="${escapeHtml(logo)}" alt="" class="gd-goal-logo">
          <span class="gd-goal-who">
            <strong>${escapeHtml(goal.scorer)}</strong>
            ${goal.strength ? `<span class="gd-goal-strength">${escapeHtml(goal.strength)}</span>` : ""}
          </span>
          <span class="gd-goal-score">${goal.away_score}–${goal.home_score}</span>
        </div>
        ${goal.assists.length ? `<p class="gd-goal-assists">${escapeHtml(goal.assists.join(", "))}</p>` : ""}
      </div>`;
  }
  return html;
}

function renderSkaterTable(skaters: PlayerGameStat[]): string {
  const rows = skaters
    .map(
      (p, i) => `
      <tr>
        <td class="col-rank">${i + 1}</td>
        <td>
          <a href="/pelaajat/${p.player_id}" class="player-cell">
            <img src="${escapeHtml(p.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(p.name)}
              <span class="player-meta">${nationalityFlag(p.nationality)} ${escapeHtml(p.nationality)} · ${escapeHtml(p.position)}</span>
            </span>
          </a>
        </td>
        <td>${p.goals}</td>
        <td>${p.assists}</td>
        <td class="stat-strong">${p.points}</td>
        <td>${p.plus_minus > 0 ? "+" : ""}${p.plus_minus}</td>
        <td>${p.shots}</td>
        <td>${p.blocked_shots}</td>
        <td>${p.hits}</td>
        <td>${p.giveaways}</td>
        <td>${p.takeaways}</td>
        <td>${p.faceoff_pct !== null ? `${(p.faceoff_pct * 100).toFixed(0)} %` : "–"}</td>
        <td>${p.pim}</td>
        <td>${escapeHtml(p.toi)}</td>
      </tr>`,
    )
    .join("");

  return `
<div class="stats-table-wrap">
  <table class="stats-table">
    <thead>
      <tr>
        <th class="col-rank">#</th>
        <th>Pelaaja</th>
        <th>M</th>
        <th>S</th>
        <th>P</th>
        <th>+/-</th>
        <th>L</th>
        <th>Torj.</th>
        <th>Tak.</th>
        <th>Men.</th>
        <th>Riis.</th>
        <th>Al.%</th>
        <th>JH</th>
        <th>Peliaika</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// e.g. "2 (1 YV)" -- the base goals-against total, plus a parenthetical
// breakdown only for the special-teams goals within it (even-strength ones
// need no tag, same convention as the goal timeline's own strength labels).
function goalsAgainstBreakdown(g: GoalieGameStat): string {
  const total = g.shots_against - g.saves;
  const tags: string[] = [];
  if (g.pp_goals_against > 0) tags.push(`${g.pp_goals_against} YV`);
  if (g.sh_goals_against > 0) tags.push(`${g.sh_goals_against} AV`);
  return tags.length ? `${total} (${tags.join(", ")})` : String(total);
}

function renderGoalieTable(goalies: GoalieGameStat[]): string {
  const rows = goalies
    .map(
      (g, i) => `
      <tr>
        <td class="col-rank">${i + 1}</td>
        <td>
          <a href="/pelaajat/${g.player_id}" class="player-cell">
            <img src="${escapeHtml(g.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(g.name)}
              <span class="player-meta">${nationalityFlag(g.nationality)} ${escapeHtml(g.nationality)}</span>
            </span>
          </a>
        </td>
        <td>${g.shots_against}</td>
        <td>${g.saves}</td>
        <td>${goalsAgainstBreakdown(g)}</td>
        <td class="stat-strong">${g.save_pct.toFixed(3)}</td>
        <td>${escapeHtml(g.toi)}</td>
      </tr>`,
    )
    .join("");

  return `
<div class="stats-table-wrap">
  <table class="stats-table">
    <thead>
      <tr>
        <th class="col-rank">#</th>
        <th>Pelaaja</th>
        <th>Lauk.</th>
        <th>Torj.</th>
        <th>Päästi</th>
        <th>SV%</th>
        <th>Peliaika</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// Shared by the finished-game box-score comparison and the unplayed-game
// season-stats comparison below -- same TeamStatRow shape, same bar-chart
// markup, different source data.
function renderTeamStatRows(rows: TeamStatRow[]): string {
  return rows
    .map(
      (stat) => `
      <div class="gd-stat-block">
        <div class="gd-stat-row">
          <span class="gd-stat-value">${escapeHtml(stat.away_value)}</span>
          <span class="gd-stat-label">${escapeHtml(stat.label)}</span>
          <span class="gd-stat-value">${escapeHtml(stat.home_value)}</span>
        </div>
        ${
          stat.away_pct !== undefined && stat.home_pct !== undefined
            ? `<div class="gd-stat-bar">
          <span class="gd-stat-bar-away" style="width: ${stat.away_pct}%"></span>
          <span class="gd-stat-bar-home" style="width: ${stat.home_pct}%"></span>
        </div>`
            : ""
        }
      </div>`,
    )
    .join("");
}

// "Players to watch": each team's own points leader and goals leader
// (skaters are already fetched ordered by points DESC, so [0] is the
// points leader; the goals leader needs its own max since the top scorer
// isn't always the top goal-scorer).
function goalsLeader(skaters: TeamRosterSkaterRow[]): TeamRosterSkaterRow | null {
  if (!skaters.length) return null;
  return skaters.reduce((best, p) => (p.goals > best.goals ? p : best));
}

function renderPlayerWatchRow(label: string, away: TeamRosterSkaterRow | null, home: TeamRosterSkaterRow | null, awayValue: number, homeValue: number): string {
  const side = (player: TeamRosterSkaterRow | null, value: number) =>
    player
      ? `
      <a href="/pelaajat/${player.player_id}" class="pw-player">
        <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" class="pw-headshot" onerror="this.style.visibility='hidden'">
        <span class="pw-player-info">
          <span class="pw-value">${value}</span>
          <span class="pw-name">${escapeHtml(player.name)}</span>
        </span>
      </a>`
      : `<span class="pw-player pw-player-empty">–</span>`;

  return `
    <div class="pw-row">
      ${side(away, awayValue)}
      <span class="gd-stat-label">${escapeHtml(label)}</span>
      ${side(home, homeValue)}
    </div>`;
}

function renderPlayersToWatch(awaySkaters: TeamRosterSkaterRow[], homeSkaters: TeamRosterSkaterRow[]): string {
  const awayPoints = awaySkaters[0] ?? null;
  const homePoints = homeSkaters[0] ?? null;
  const awayGoals = goalsLeader(awaySkaters);
  const homeGoals = goalsLeader(homeSkaters);

  return `
    ${renderPlayerWatchRow("Pisteet", awayPoints, homePoints, awayPoints?.points ?? 0, homePoints?.points ?? 0)}
    ${renderPlayerWatchRow("Maalit", awayGoals, homeGoals, awayGoals?.goals ?? 0, homeGoals?.goals ?? 0)}`;
}

// Top 2 goalies by games played per team, each as its own compact stat
// card (reuses the .stat-card component from the team page's Kausitilastot
// box) -- W-L-OTL/GAA/SV%/SO, matching what the user asked for.
function renderGoalieCard(g: TeamRosterGoalieRow): string {
  return `
  <div class="stat-card">
    <div class="stat-card-header">${escapeHtml(g.name)}</div>
    <div class="stat-card-table-wrap">
      <table class="stat-card-table">
        <thead>
          <tr><th>O</th><th>V-H-JH</th><th>GAA</th><th>SV%</th><th>NP</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${g.games_played}</td>
            <td>${g.wins}-${g.losses}-${g.ot_losses}</td>
            <td>${g.goals_against_average.toFixed(2)}</td>
            <td class="stat-card-highlight">${g.save_pct.toFixed(3)}</td>
            <td>${g.shutouts}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

function renderGoaltending(awayGoalies: TeamRosterGoalieRow[], homeGoalies: TeamRosterGoalieRow[]): string {
  const cards = [...awayGoalies.slice(0, 2), ...homeGoalies.slice(0, 2)].map(renderGoalieCard).join("");
  return `<div class="stat-card-grid stat-card-grid-wrap">${cards}</div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const gameId = Number(context.params.gameId);

  if (!Number.isInteger(gameId)) {
    return new Response("Virheellinen ottelu-id", { status: 400 });
  }

  const game = await db.prepare("SELECT * FROM games WHERE game_id = ?").bind(gameId).first<GameRow>();
  if (!game) {
    return new Response(`Ottelua ${gameId} ei löydy.`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let box: ParsedBoxScore | null = null;
  let fetchError = false;
  let youtubeUrl = "";

  let awaySkaters: TeamRosterSkaterRow[] = [];
  let homeSkaters: TeamRosterSkaterRow[] = [];
  let awayGoalies: TeamRosterGoalieRow[] = [];
  let homeGoalies: TeamRosterGoalieRow[] = [];
  let awaySeasonStats: TeamSeasonStatsRow | null = null;
  let homeSeasonStats: TeamSeasonStatsRow | null = null;

  if (game.is_finished) {
    ({ box, fetchError } = await getBoxScore(db, game));
    youtubeUrl = await resolveHighlightsUrl(db, context.env, game);
  } else {
    const skaterQuery = (abbrev: string) =>
      db
        .prepare("SELECT * FROM team_roster_skaters WHERE team_abbrev = ? ORDER BY points DESC, goals DESC, name ASC")
        .bind(abbrev)
        .all<TeamRosterSkaterRow>();
    const goalieQuery = (abbrev: string) =>
      db
        .prepare("SELECT * FROM team_roster_goalies WHERE team_abbrev = ? ORDER BY save_pct DESC")
        .bind(abbrev)
        .all<TeamRosterGoalieRow>();
    const seasonStatsQuery = (abbrev: string) =>
      db.prepare("SELECT * FROM team_season_stats WHERE team_abbrev = ?").bind(abbrev).first<TeamSeasonStatsRow>();

    const [awaySkatersRes, homeSkatersRes, awayGoaliesRes, homeGoaliesRes, awaySeasonRes, homeSeasonRes] =
      await Promise.all([
        skaterQuery(game.away_abbrev),
        skaterQuery(game.home_abbrev),
        goalieQuery(game.away_abbrev),
        goalieQuery(game.home_abbrev),
        seasonStatsQuery(game.away_abbrev),
        seasonStatsQuery(game.home_abbrev),
      ]);

    awaySkaters = awaySkatersRes.results;
    homeSkaters = homeSkatersRes.results;
    awayGoalies = awayGoaliesRes.results;
    homeGoalies = homeGoaliesRes.results;
    awaySeasonStats = awaySeasonRes ?? null;
    homeSeasonStats = homeSeasonRes ?? null;
  }

  const hasPreviewData = awaySkaters.length > 0 && homeSkaters.length > 0;

  const content = `
<a class="back-link js-back" href="/">← Takaisin</a>

<header class="page-header">
  <p class="subtitle">${escapeHtml(humanDate(game.date))}</p>
</header>

<section class="game-card">
  <div class="score-row">
    <div class="team away">
      <img src="${escapeHtml(game.away_logo)}" alt="" class="logo" loading="lazy">
      <span class="abbrev">${escapeHtml(game.away_abbrev)}</span>
    </div>
    <div class="score">
      <span>${game.away_score}</span>
      <span class="dash">–</span>
      <span>${game.home_score}</span>
    </div>
    <div class="team home">
      <span class="abbrev">${escapeHtml(game.home_abbrev)}</span>
      <img src="${escapeHtml(game.home_logo)}" alt="" class="logo" loading="lazy">
    </div>
  </div>
  ${game.is_finished && game.final_type !== "REG" ? `<p class="ot-tag">${escapeHtml(finalTypeFi(game.final_type))}</p>` : ""}
  ${game.is_finished ? `<a class="game-card-youtube" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener">▶ Highlightit (YouTube)</a>` : ""}
</section>

${
  !game.is_finished
    ? hasPreviewData
      ? `
<section class="team-detail">
  <div class="team-detail-body">
    <div class="tp-section">
      <p class="tp-section-title">Pelaajat seurattavaksi</p>
      <div class="gd-stat-header">
        <span class="gd-stat-team">${escapeHtml(game.away_abbrev)}</span>
        <span class="gd-stat-team">${escapeHtml(game.home_abbrev)}</span>
      </div>
      ${renderPlayersToWatch(awaySkaters, homeSkaters)}
    </div>

    ${
      awayGoalies.length || homeGoalies.length
        ? `
    <div class="tp-section">
      <p class="tp-section-title">Maalivahdit</p>
      ${renderGoaltending(awayGoalies, homeGoalies)}
    </div>`
        : ""
    }

    ${
      awaySeasonStats && homeSeasonStats
        ? `
    <div class="tp-section">
      <p class="tp-section-title">Joukkuetilastot</p>
      <div class="gd-stat-header">
        <span class="gd-stat-team">${escapeHtml(game.away_abbrev)}</span>
        <span class="gd-stat-team">${escapeHtml(game.home_abbrev)}</span>
      </div>
      ${renderTeamStatRows(buildPreviewTeamStats(awaySeasonStats, homeSeasonStats))}
    </div>`
        : ""
    }
  </div>
</section>

${renderRosterSkaterTable(awaySkaters, `🏒 ${escapeHtml(game.away_name)} – kokoonpano`)}
${awayGoalies.length ? renderRosterGoalieTable(awayGoalies, `🥅 ${escapeHtml(game.away_name)} – maalivahdit`) : ""}
${renderRosterSkaterTable(homeSkaters, `🏒 ${escapeHtml(game.home_name)} – kokoonpano`)}
${homeGoalies.length ? renderRosterGoalieTable(homeGoalies, `🥅 ${escapeHtml(game.home_name)} – maalivahdit`) : ""}`
      : `<p class="empty-note">Ottelua ei ole vielä pelattu.</p>`
    : fetchError
      ? `<p class="empty-note">Ottelun tarkkoja tietoja ei juuri nyt saatu. Yritä myöhemmin uudelleen.</p>`
      : box
        ? `
<section class="team-detail">
  <div class="team-detail-body">
    <div class="tp-section">
      <p class="tp-section-title">Maalit</p>
      ${renderGoalTimeline(box.goals, game.away_abbrev, game.away_logo, game.home_logo)}
    </div>

    <div class="tp-section">
      <p class="tp-section-title">Ottelun tilastot</p>
      <div class="gd-stat-header">
        <span class="gd-stat-team">${escapeHtml(game.away_abbrev)}</span>
        <span class="gd-stat-team">${escapeHtml(game.home_abbrev)}</span>
      </div>
      ${renderTeamStatRows(box.teamStats)}
    </div>
  </div>
</section>

<section>
  <h2 class="section-title"><img src="${escapeHtml(game.away_logo)}" alt="" class="nav-icon">${escapeHtml(game.away_name)}</h2>
  ${renderSkaterTable(box.awaySkaters)}
  ${box.awayGoalies.length ? renderGoalieTable(box.awayGoalies) : ""}
</section>

<section>
  <h2 class="section-title"><img src="${escapeHtml(game.home_logo)}" alt="" class="nav-icon">${escapeHtml(game.home_name)}</h2>
  ${renderSkaterTable(box.homeSkaters)}
  ${box.homeGoalies.length ? renderGoalieTable(box.homeGoalies) : ""}
</section>`
        : ""
}
`;

  const html = await renderLayout({
    title: `${game.away_abbrev} – ${game.home_abbrev} · Morning Hockey`,
    headerTitle: `${game.away_abbrev} – ${game.home_abbrev}`,
    activePage: `team_${game.away_abbrev.toLowerCase()}`,
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
