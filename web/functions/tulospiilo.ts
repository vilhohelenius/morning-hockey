// Tulospiilo ("spoiler-free") view: the previous round's finished games,
// shown as bare matchups + a YouTube highlights link, with the actual
// score/stats hidden behind a per-game checkbox. Lets someone watch last
// night's highlight videos before finding out who won.
//
// Only ever shows the same round index.ts's dashboard calls "currentRound"
// (the most recent date with any started game), filtered down to games
// that have actually finished -- a game still live has no highlights yet
// and nothing final to spoil, so it just doesn't show up here until it is.
//
// Reachable via / redirecting here (when the signed-in user's tulospiilo
// cookie is on, see _shared/auth.ts + omat/tulospiilo.ts) or by visiting
// /tulospiilo directly; not in the sidebar nav, since the redirect is the
// intended entry point.

import { finnishGoalieLines, finnishScorerLines, type FinnGoalieLine, type FinnScorerLine } from "./_shared/gameCard";
import { getBoxScore } from "./_shared/boxScoreCache";
import { resolveHighlightsUrl } from "./_shared/youtube";
import { escapeHtml, finalTypeFi, humanDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, GameRow } from "./_shared/types";

function renderFinnStats(scorers: FinnScorerLine[], goalies: FinnGoalieLine[]): string {
  if (!scorers.length && !goalies.length) return "";
  return `
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
      <span class="value">${g.saves}/${g.shots_against}</span>
    </p>`,
      )
      .join("")}
  </div>`;
}

function renderSpoilerGame(
  game: GameRow,
  scorers: FinnScorerLine[],
  goalies: FinnGoalieLine[],
  youtubeUrl: string | null,
): string {
  const checkboxId = `spoiler-reveal-${game.game_id}`;
  const badge = game.final_type !== "REG" ? `<p class="ot-tag">${escapeHtml(finalTypeFi(game.final_type))}</p>` : "";

  return `
<div class="game-card spoiler-game">
  <div class="score-row">
    <div class="team away">
      <img src="${escapeHtml(game.away_logo)}" alt="" class="logo" loading="lazy">
      <span class="abbrev">${escapeHtml(game.away_abbrev)}</span>
    </div>
    <div class="score spoiler-placeholder">?–?</div>
    <div class="team home">
      <span class="abbrev">${escapeHtml(game.home_abbrev)}</span>
      <img src="${escapeHtml(game.home_logo)}" alt="" class="logo" loading="lazy">
    </div>
  </div>
  ${youtubeUrl ? `<a class="game-card-youtube" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener">▶ Highlightit (YouTube)</a>` : ""}
  <input type="checkbox" id="${checkboxId}" class="spoiler-reveal-toggle">
  <label class="spoiler-reveal-label" for="${checkboxId}">Näytä tulos ▾</label>
  <div class="spoiler-result">
    <p class="spoiler-result-score">${game.away_score}–${game.home_score}</p>
    ${badge}
    ${renderFinnStats(scorers, goalies)}
  </div>
</div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const currentRound = await db
    .prepare("SELECT date FROM games WHERE game_state != 'FUT' ORDER BY date DESC LIMIT 1")
    .first<{ date: string }>();

  let gamesHtml = "";
  let roundDate: string | null = null;

  if (currentRound) {
    const { results: games } = await db
      .prepare("SELECT * FROM games WHERE date = ? AND is_finished = 1 ORDER BY start_time_utc ASC")
      .bind(currentRound.date)
      .all<GameRow>();

    if (games.length) {
      roundDate = currentRound.date;
      for (const game of games) {
        const [{ box }, youtubeUrl] = await Promise.all([
          getBoxScore(db, game),
          resolveHighlightsUrl(db, context.env, game),
        ]);

        const scorers = box
          ? [
              ...finnishScorerLines(box.awaySkaters, game.away_abbrev),
              ...finnishScorerLines(box.homeSkaters, game.home_abbrev),
            ].sort((a, b) => b.goals + b.assists - (a.goals + a.assists))
          : [];
        const goalies = box
          ? [
              ...finnishGoalieLines(box.awayGoalies, game.away_abbrev),
              ...finnishGoalieLines(box.homeGoalies, game.home_abbrev),
            ]
          : [];

        gamesHtml += renderSpoilerGame(game, scorers, goalies, youtubeUrl);
      }
    }
  }

  const content = `
<header class="page-header">
  <h1>🙈 Tulospiilo</h1>
  ${roundDate ? `<p class="subtitle">${escapeHtml(humanDate(roundDate))}</p>` : ""}
</header>

${
  gamesHtml
    ? `<div class="game-list">${gamesHtml}</div>`
    : `<p class="empty-note">Ei vielä valmiita otteluita viimeisimmältä kierrokselta.</p>`
}

<a class="spoiler-exit" href="/?tulospiilo=ohita">Poistu tulospiilosta</a>
`;

  const html = await renderLayout({
    title: "Tulospiilo · Morning Hockey",
    headerTitle: "Tulospiilo",
    activePage: "tulospiilo",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
