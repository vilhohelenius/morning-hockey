// Arkisto: every finished game this season, grouped by day, newest day
// first -- unlike the old GitHub Pages site's per-night nights/<date>.html
// pages (which don't exist here), this is one continuous list straight off
// the `games` table. That table works as a permanent archive already: the
// fast-tier sync (every 30 min) upserts by game_id and never deletes, so
// once a game's result lands there it stays -- this route just never
// existed to read it back until now.
//
// No OT/SO badge here -- same known gap as the team page and Otteluohjelma
// (games has no final_type column, only /ottelut/[gameId] gets that from
// the NHL API's own landing() response).

import { escapeHtml, humanDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, GameRow } from "./_shared/types";

function renderGameCard(game: GameRow): string {
  return `
<a class="game-card archive-game-card" href="/ottelut/${game.game_id}">
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
</a>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const { results: games } = await db
    .prepare("SELECT * FROM games WHERE is_finished = 1 ORDER BY date DESC, start_time_utc DESC")
    .all<GameRow>();

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
  <div class="game-list">${dayGames.map(renderGameCard).join("")}</div>
</section>`,
    )
    .join("");

  const content = `
<header class="page-header">
  <h1>🗂️ Arkisto</h1>
  <p class="subtitle">${games.length} pelattua ottelua</p>
</header>
${daysHtml || `<p class="empty-note">Ei vielä pelattuja otteluita arkistossa.</p>`}
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
