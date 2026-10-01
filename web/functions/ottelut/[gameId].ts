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
import { decisionFi, escapeHtml, finalTypeFi, humanDate, nationalityFlag } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import type { Env, GameRow, GoalEvent, GoalieGameStat, PlayerGameStat } from "../_shared/types";

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
          <span class="player-cell">
            <img src="${escapeHtml(p.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(p.name)}
              <span class="player-meta">${nationalityFlag(p.nationality)} ${escapeHtml(p.nationality)} · ${escapeHtml(p.position)}</span>
            </span>
          </span>
        </td>
        <td>${p.goals}</td>
        <td>${p.assists}</td>
        <td class="stat-strong">${p.points}</td>
        <td>${p.plus_minus > 0 ? "+" : ""}${p.plus_minus}</td>
        <td>${p.shots}</td>
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
        <th>JH</th>
        <th>Peliaika</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

function renderGoalieTable(goalies: GoalieGameStat[]): string {
  const rows = goalies
    .map(
      (g, i) => `
      <tr>
        <td class="col-rank">${i + 1}</td>
        <td>
          <span class="player-cell">
            <img src="${escapeHtml(g.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(g.name)}
              <span class="player-meta">${nationalityFlag(g.nationality)} ${escapeHtml(g.nationality)}</span>
            </span>
          </span>
        </td>
        <td>${g.saves}</td>
        <td>${g.shots_against - g.saves}</td>
        <td class="stat-strong">${g.save_pct.toFixed(3)}</td>
        <td>${escapeHtml(g.toi)}</td>
        <td>${g.decision ? escapeHtml(decisionFi(g.decision)) : "–"}</td>
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
        <th>Torj.</th>
        <th>Päästi</th>
        <th>SV%</th>
        <th>Peliaika</th>
        <th>Ratkaisu</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
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
  if (game.is_finished) {
    ({ box, fetchError } = await getBoxScore(db, game));
  }

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
</section>

${
  !game.is_finished
    ? `<p class="empty-note">Ottelua ei ole vielä pelattu.</p>`
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
      ${box.teamStats
        .map(
          (stat) => `
      <div class="gd-stat-row">
        <span class="gd-stat-value">${escapeHtml(stat.away_value)}</span>
        <span class="gd-stat-label">${escapeHtml(stat.label)}</span>
        <span class="gd-stat-value">${escapeHtml(stat.home_value)}</span>
      </div>`,
        )
        .join("")}
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
