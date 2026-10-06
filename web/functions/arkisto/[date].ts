// One archived day's games (linked from /arkisto), in the same style as
// the dashboard's "Viime yön ottelut": click-to-expand goal-timeline/team-
// stats info box (#game-details/.game-card-trigger, _shared/gameCard.ts),
// with a Finnish scorer/goalie highlight line and a "Koko ottelun tilastot
// ->" button through to the full /ottelut/[gameId] report.
//
// Box scores are read-only here (getCachedBoxScores, no NHL fetch) -- a
// game nobody's opened yet (on the dashboard or its own report) just has
// no popup/Finnish line until someone does, rather than this page eagerly
// fetching a potentially large backlog from the NHL API on every visit.

import { getCachedBoxScores } from "../_shared/boxScoreCache";
import { buildTimeline } from "../_shared/boxscore";
import { finnishGoalieLines, finnishScorerLines, renderGameCard } from "../_shared/gameCard";
import { resolveHighlightsUrl } from "../_shared/youtube";
import { escapeHtml, humanDate } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import type { Env, GameRow } from "../_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const date = String(context.params.date);

  const { results: games } = await db
    .prepare("SELECT * FROM games WHERE date = ? AND is_finished = 1 ORDER BY start_time_utc ASC")
    .bind(date)
    .all<GameRow>();

  if (!games.length) {
    return new Response(`Ei pelattuja otteluita päivälle ${date}.`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const boxScores = await getCachedBoxScores(db, games.map((g) => g.game_id));
  const gameDetails: Record<number, { timeline?: unknown; team_stats?: unknown; youtube_url?: string }> = {};
  let gameCardsHtml = "";

  for (const game of games) {
    const box = boxScores.get(game.game_id);
    let scorers: ReturnType<typeof finnishScorerLines> = [];
    let goalies: ReturnType<typeof finnishGoalieLines> = [];

    gameDetails[game.game_id] = { youtube_url: await resolveHighlightsUrl(db, context.env, game) };

    if (box) {
      gameDetails[game.game_id] = { ...gameDetails[game.game_id], timeline: buildTimeline(box.goals, box.penalties, game.away_abbrev), team_stats: box.teamStats };
      scorers = [
        ...finnishScorerLines(box.awaySkaters, game.away_abbrev),
        ...finnishScorerLines(box.homeSkaters, game.home_abbrev),
      ].sort((a, b) => b.goals + b.assists - (a.goals + a.assists));
      goalies = [
        ...finnishGoalieLines(box.awayGoalies, game.away_abbrev),
        ...finnishGoalieLines(box.homeGoalies, game.home_abbrev),
      ];
    }

    gameCardsHtml += renderGameCard(game, scorers, goalies);
  }

  // Same defensive escape every other #....-json script tag in this
  // codebase already applies: a stray "</script" inside embedded JSON
  // can't close the tag early.
  const gameDetailsJson = JSON.stringify(gameDetails).replace(/<\//g, "<\\/");

  const content = `
<a class="back-link js-back" href="/arkisto">← Takaisin</a>

<header class="page-header">
  <h1>${escapeHtml(humanDate(date))}</h1>
  <p class="subtitle">${games.length} ottelua</p>
</header>

<div class="game-list">${gameCardsHtml}</div>

<script id="game-details" type="application/json">${gameDetailsJson}</script>
`;

  const html = await renderLayout({
    title: `${humanDate(date)} · Morning Hockey`,
    headerTitle: "Arkisto",
    activePage: "archive",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
