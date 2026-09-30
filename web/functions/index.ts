// Dashboard (homepage), phase 4's last page. Combines four already-synced
// sources: last night's digest (digests/digest_games/digest_scorers/
// digest_goalies), top-5 Suomipörssi, top-5 Tilastot, and a CHI team teaser.
//
// Two things templates/dashboard.html has are deliberately NOT ported:
//   - The box-score click-to-expand popup (#game-details JSON) -- same
//     data shape as phase 5's planned game_box_scores cache, not synced
//     yet. app.js only wires up that click handler when #game-details
//     exists, so omitting it is a clean no-op (same pattern as the
//     #team-snapshots and #team-trigger gaps in earlier pages).
//   - The "Aiemmat yöt" archive footer linking to nights/<date>.html --
//     those archive pages don't exist as routes in the new site at all.

import { decisionFi, escapeHtml, finalTypeFi, humanDate, nationalityFlag, shortDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type {
  DigestGameRow,
  DigestGoalieRow,
  DigestRow,
  DigestScorerRow,
  Env,
  FinnishSkaterRow,
  GameRow,
  SkaterStatsRow,
  StandingsRow,
} from "./_shared/types";

const TEASER_TEAM_ABBREV = "CHI"; // matches main.py's TEAM_ABBREVS for now

function renderGameCard(
  game: DigestGameRow,
  scorers: DigestScorerRow[],
  goalies: DigestGoalieRow[],
): string {
  const finnStats =
    scorers.length || goalies.length
      ? `
  <div class="finn-stats">
    ${scorers
      .map(
        (s) => `
    <p class="stat-line scorer">
      <span class="flag">🇫🇮</span><strong>${escapeHtml(s.name)}</strong><span class="team-tag">${escapeHtml(s.team_abbrev)}</span>
      <span class="value">${s.goals}+${s.assists}</span>
    </p>`,
      )
      .join("")}
    ${goalies
      .map(
        (g) => `
    <p class="stat-line goalie">
      <span class="flag">🇫🇮</span><strong>${escapeHtml(g.name)}</strong><span class="team-tag">${escapeHtml(g.team_abbrev)}</span>
      <span class="value">${g.saves}/${g.shots_against}${g.decision ? ` · ${escapeHtml(decisionFi(g.decision))}` : ""}</span>
    </p>`,
      )
      .join("")}
  </div>`
      : "";

  return `
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
  ${game.final_type !== "REG" ? `<p class="ot-tag">${escapeHtml(finalTypeFi(game.final_type))}</p>` : ""}
  ${finnStats}
</section>`;
}

function renderFinnishSkaterRow(row: FinnishSkaterRow, rank: number): string {
  return `
      <tr>
        <td class="col-rank">${rank}</td>
        <td>
          <span class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">${escapeHtml(row.name)}<span class="player-meta">${escapeHtml(row.position)}</span></span>
          </span>
        </td>
        <td><img src="${escapeHtml(row.logo)}" alt="" class="table-team-logo" loading="lazy">${escapeHtml(row.team_abbrev)}</td>
        <td>${row.games_played}</td>
        <td>${row.goals}</td>
        <td>${row.assists}</td>
        <td class="stat-strong">${row.points}</td>
      </tr>`;
}

function renderLeagueSkaterRow(row: SkaterStatsRow, rank: number): string {
  return `
      <tr>
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

function statTeaserTable(title: string, rows: string[], emptyMessage: string, archiveHref: string, archiveLabel: string): string {
  return `
<section class="section-tile">
  <h2 class="section-title">${title}</h2>
  ${
    rows.length
      ? `<div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th>Pelaaja</th>
          <th>Jkk</th>
          <th>O</th>
          <th>M</th>
          <th>S</th>
          <th>P</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  </div>`
      : `<p class="empty-note">${escapeHtml(emptyMessage)}</p>`
  }
  <a class="archive-link" href="${archiveHref}">${archiveLabel}</a>
</section>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const latestDigest = await db.prepare("SELECT * FROM digests ORDER BY date DESC LIMIT 1").first<DigestRow>();

  let gameCardsHtml = "";
  let gameCount = 0;
  if (latestDigest) {
    const { results: games } = await db
      .prepare("SELECT * FROM digest_games WHERE digest_date = ? ORDER BY game_id ASC")
      .bind(latestDigest.date)
      .all<DigestGameRow>();
    gameCount = games.length;

    for (const game of games) {
      const [{ results: scorers }, { results: goalies }] = await Promise.all([
        db.prepare("SELECT * FROM digest_scorers WHERE game_id = ?").bind(game.game_id).all<DigestScorerRow>(),
        db.prepare("SELECT * FROM digest_goalies WHERE game_id = ?").bind(game.game_id).all<DigestGoalieRow>(),
      ]);
      gameCardsHtml += renderGameCard(game, scorers, goalies);
    }
  }

  const { results: finSkaters } = await db
    .prepare("SELECT * FROM finnish_skater_stats ORDER BY points DESC, goals DESC, name ASC LIMIT 5")
    .all<FinnishSkaterRow>();

  const { results: leagueSkaters } = await db
    .prepare("SELECT * FROM skater_season_stats ORDER BY points DESC, goals DESC, name ASC LIMIT 5")
    .all<SkaterStatsRow>();

  const team = await db
    .prepare("SELECT * FROM standings_rows WHERE abbrev = ?")
    .bind(TEASER_TEAM_ABBREV)
    .first<StandingsRow>();

  let teamTeaser = "";
  if (team) {
    const recentGame = await db
      .prepare(
        "SELECT * FROM games WHERE (away_abbrev = ? OR home_abbrev = ?) AND is_finished = 1 ORDER BY date DESC LIMIT 1",
      )
      .bind(TEASER_TEAM_ABBREV, TEASER_TEAM_ABBREV)
      .first<GameRow>();
    const upcomingGame = await db
      .prepare(
        "SELECT * FROM games WHERE (away_abbrev = ? OR home_abbrev = ?) AND is_finished = 0 ORDER BY date ASC LIMIT 1",
      )
      .bind(TEASER_TEAM_ABBREV, TEASER_TEAM_ABBREV)
      .first<GameRow>();

    const recentHtml = recentGame
      ? (() => {
          const isHome = recentGame.home_abbrev === TEASER_TEAM_ABBREV;
          const teamScore = isHome ? recentGame.home_score : recentGame.away_score;
          const opponentScore = isHome ? recentGame.away_score : recentGame.home_score;
          const opponentAbbrev = isHome ? recentGame.away_abbrev : recentGame.home_abbrev;
          const opponentLogo = isHome ? recentGame.away_logo : recentGame.home_logo;
          const result = teamScore > opponentScore ? "W" : "L";
          return `
  <div class="schedule-list">
    <div class="schedule-row">
      <span class="schedule-date">${shortDate(recentGame.date)}</span>
      <span class="schedule-opponent">
        ${isHome ? "vs" : "@"}
        <img src="${escapeHtml(opponentLogo)}" alt="" class="schedule-logo" loading="lazy">
        ${escapeHtml(opponentAbbrev)}
      </span>
      <span class="schedule-score">${teamScore}–${opponentScore}</span>
      <span class="schedule-result result-${result.toLowerCase()}">${result}</span>
    </div>
  </div>`;
        })()
      : "";

    const upcomingHtml = upcomingGame
      ? (() => {
          const isHome = upcomingGame.home_abbrev === TEASER_TEAM_ABBREV;
          const opponentAbbrev = isHome ? upcomingGame.away_abbrev : upcomingGame.home_abbrev;
          const opponentLogo = isHome ? upcomingGame.away_logo : upcomingGame.home_logo;
          return `
  <div class="schedule-list">
    <div class="schedule-row">
      <span class="schedule-date">${shortDate(upcomingGame.date)}</span>
      <span class="schedule-opponent">
        ${isHome ? "vs" : "@"}
        <img src="${escapeHtml(opponentLogo)}" alt="" class="schedule-logo" loading="lazy">
        ${escapeHtml(opponentAbbrev)}
      </span>
    </div>
  </div>`;
        })()
      : "";

    teamTeaser = `
<section class="section-tile">
  <div class="team-teaser-header">
    <img src="${escapeHtml(team.logo)}" alt="" class="team-teaser-logo">
    <div>
      <h2 class="section-title team-teaser-title">${escapeHtml(team.name)}</h2>
      <p class="subtitle">${escapeHtml(team.division)}: ${team.division_rank}. sija</p>
    </div>
  </div>
  <div class="team-teaser-schedule">
    ${recentHtml}
    ${upcomingHtml}
  </div>
  <a class="archive-link" href="/joukkueet/${TEASER_TEAM_ABBREV.toLowerCase()}">Joukkuesivulle →</a>
</section>`;
  }

  const content = `
<header class="page-header">
  <h1 class="brand-heading">🏒 Yön änärit</h1>
  ${
    latestDigest
      ? `<p class="subtitle">${escapeHtml(humanDate(latestDigest.date))} · ${gameCount} ottelua</p>`
      : `<p class="subtitle">Ei vielä otteluita arkistossa</p>`
  }
</header>

${
  latestDigest
    ? `<section>
  <h2 class="section-title">🏒 Viime yön ottelut</h2>
  <div class="game-list">${gameCardsHtml}</div>
</section>`
    : ""
}

${statTeaserTable("🇫🇮 Suomipörssin kärki", finSkaters.map((r, i) => renderFinnishSkaterRow(r, i + 1)), "Ei tilastoituja suomalaispelaajia vielä.", "/suomiporssi", "Koko Suomipörssi →")}

${statTeaserTable("📈 NHL:n kärkipörssi", leagueSkaters.map((r, i) => renderLeagueSkaterRow(r, i + 1)), "Ei tilastoituja pelaajia vielä.", "/tilastot", "Koko Tilastot →")}

${teamTeaser}
`;

  const html = await renderLayout({
    title: "Morning Hockey",
    headerTitle: "Etusivu",
    activePage: "home",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
