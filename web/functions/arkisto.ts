// Arkisto: every finished game this season, grouped by day, newest day
// first -- unlike the old GitHub Pages site's per-night nights/<date>.html
// pages (which don't exist here), this is one continuous list straight off
// the `games` table. That table works as a permanent archive already: the
// fast-tier sync (every 30 min) upserts by game_id and never deletes, so
// once a game's result lands there it stays -- this route just never
// existed to read it back until now.
//
// Each card is a click-to-expand goal-timeline/team-stats info box, same
// #game-details/.game-card-trigger mechanism as the dashboard and the
// original static site, with a button through to the full /ottelut/[gameId]
// report. Read-only against game_box_scores (getCachedBoxScores) rather
// than fetch-and-cache (getBoxScore) -- a whole season can be a lot of
// games, and eagerly fetching every uncached one from the NHL API on a
// single page load would defeat the point of this being on-demand. A game
// nobody's opened yet just won't have a popup until someone does (here, on
// the dashboard, or the full report).
import { getCachedBoxScores } from "./_shared/boxScoreCache";
import { escapeHtml, finalTypeFi, humanDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, GameRow } from "./_shared/types";

function renderGameCard(game: GameRow, finalType: string | null): string {
  return `
<div class="game-card game-card-trigger" data-game-id="${game.game_id}" tabindex="0" role="button" aria-expanded="false">
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
  ${finalType && finalType !== "REG" ? `<p class="ot-tag">${escapeHtml(finalTypeFi(finalType))}</p>` : ""}
</div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const { results: games } = await db
    .prepare("SELECT * FROM games WHERE is_finished = 1 ORDER BY date DESC, start_time_utc DESC")
    .all<GameRow>();

  const boxScores = await getCachedBoxScores(db, games.map((g) => g.game_id));
  const gameDetails: Record<number, { goals: unknown; team_stats: unknown }> = {};
  for (const [gameId, box] of boxScores) gameDetails[gameId] = { goals: box.goals, team_stats: box.teamStats };

  // Map preserves first-insertion order, and `games` is already sorted by
  // date DESC above, so the resulting day groups come out newest-first
  // with no extra sort needed.
  const gamesByDate = new Map<string, GameRow[]>();
  for (const game of games) {
    const list = gamesByDate.get(game.date);
    if (list) list.push(game);
    else gamesByDate.set(game.date, [game]);
  }

  const daysHtml = [...gamesByDate.entries()]
    .map(
      ([date, dayGames]) => `
<section>
  <h2 class="section-title">${escapeHtml(humanDate(date))}</h2>
  <div class="game-list">${dayGames.map((g) => renderGameCard(g, boxScores.get(g.game_id)?.finalType ?? null)).join("")}</div>
</section>`,
    )
    .join("");

  // Same defensive escape every other #....-json script tag in this
  // codebase already applies: a stray "</script" inside embedded JSON
  // can't close the tag early.
  const gameDetailsJson = JSON.stringify(gameDetails).replace(/<\//g, "<\\/");

  const content = `
<header class="page-header">
  <h1>🗂️ Arkisto</h1>
  <p class="subtitle">${games.length} pelattua ottelua</p>
</header>
${daysHtml || `<p class="empty-note">Ei vielä pelattuja otteluita arkistossa.</p>`}

<script id="game-details" type="application/json">${gameDetailsJson}</script>
`;

  const html = await renderLayout({
    title: "Arkisto · Morning Hockey",
    headerTitle: "Arkisto",
    activePage: "archive",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
