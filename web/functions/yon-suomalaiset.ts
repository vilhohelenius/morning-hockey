// /yon-suomalaiset: /suosikit's layout for the Finnish players of the latest
// game round (the front page's "Yön suomalaiset" source: started games of the
// latest round + their cached box scores). Top: a sentence recap and a compact
// list of everyone who played, then the night's own game stats tables.

import { gameNight, nightLabel } from "./_shared/bingo";
import { getBoxScore, loadBoxScoreRows } from "./_shared/boxScoreCache";
import { isGameLive, latestRound, loadRoundCandidates } from "./_shared/dayGames";
import { renderGoalieTable, renderSkaterTable } from "./ottelut/[gameId]";
import { fetchGamePlayerXg } from "./_shared/xg";
import { buildDigest } from "./_shared/favorites";
import { buildFinnishNight, type NightGame } from "./_shared/finnishNight";
import { abbreviatedName, escapeHtml, flagImg } from "./_shared/format";
import { liveBadgeText } from "./_shared/gameCard";
import { renderLayout } from "./_shared/layout";
import type { Env } from "./_shared/types";

const lastName = (full: string) => full.slice(full.lastIndexOf(" ") + 1);
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const db = env.DB;
  const layout = (content: string) =>
    renderLayout({ title: "Yön suomalaiset · Morning Hockey", headerTitle: "Yön suomalaiset", activePage: "yon_suomalaiset", request, env, content });
  const header = `<header class="page-header"><h1>${flagImg("fi")} Yön suomalaiset</h1></header>`;

  const round = latestRound(await loadRoundCandidates(db));
  const boxRows = await loadBoxScoreRows(db, round.map((g) => g.game_id));
  const nightGames: NightGame[] = [];
  for (const game of round) {
    const box = (await getBoxScore(db, game, boxRows)).box;
    if (!box) continue;
    const live = !game.is_finished && isGameLive(game);
    nightGames.push({
      game,
      awaySkaters: box.awaySkaters,
      homeSkaters: box.homeSkaters,
      awayGoalies: box.awayGoalies,
      homeGoalies: box.homeGoalies,
      live,
      liveText: live ? liveBadgeText(box.live ?? null) : "",
    });
  }
  const night = buildFinnishNight(nightGames);
  if (!night.skaters.length && !night.goalies.length) {
    return html(await layout(`${header}<p class="empty-note">Ei suomalaisia pelaajia yön otteluissa.</p>`));
  }

  // ---- recap ----
  const scorers = night.skaters
    .filter((r) => r.player.points > 0)
    .map((r) => ({ lastName: lastName(r.player.name), goals: r.player.goals, assists: r.player.assists }));
  const digest = scorers.length ? buildDigest([], scorers, []) : "";
  const recapRow = (r: { gameId: number; player: { name: string; headshot: string } }, value: string, hot: boolean) =>
    `<a class="sk-row${hot ? " sk-hot" : ""}" href="/ottelut/${r.gameId}"><img class="sk-avatar" src="${escapeHtml(r.player.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="sk-name">${escapeHtml(abbreviatedName(r.player.name))}</span><span class="sk-grow"></span><span class="sk-score">${value}</span></a>`;
  const skaterRecap = night.skaters.map((r) => recapRow(r, `${r.player.goals}+${r.player.assists}`, r.player.points > 0)).join("");
  const goalieRecap = night.goalies.map((r) => recapRow(r, `${r.player.saves}/${r.player.shots_against}`, false)).join("");

  // ---- stats tables: the game page's own tables, all of the night's Finns together ----
  const xgs = await Promise.all(nightGames.filter((g) => g.game.is_finished).map((g) => fetchGamePlayerXg(db, g.game.game_id)));
  const xg = { ixg: new Map<number, number>(), gsax: new Map<number, number>(), xgfPct: new Map<number, number>(), xgfPct5v5: new Map<number, number>() };
  for (const x of xgs) for (const k of Object.keys(xg) as (keyof typeof xg)[]) for (const [id, v] of x[k]) xg[k].set(id, v);

  const teams = new Map([...night.skaters, ...night.goalies].map((r) => [r.player.player_id, { abbrev: r.teamAbbrev, logo: r.teamLogo }]));

  const content = `
${header}

<p class="sk-when">Viime yö ${nightLabel(gameNight(round[0].start_time_utc))}</p>
${digest ? `<p class="sk-digest">${digest}</p>` : ""}

<div class="sk-duo">
  <section><h2 class="sk-h">Kenttäpelaajat</h2>${skaterRecap ? `<div class="sk-list">${skaterRecap}</div>` : `<p class="empty-note">Ei kenttäpelaajia.</p>`}</section>
  <section><h2 class="sk-h">Maalivahdit</h2>${goalieRecap ? `<div class="sk-list">${goalieRecap}</div>` : `<p class="empty-note">Ei maalivahteja.</p>`}</section>
</div>

<div class="sk-stats">
  <div class="sk-stats-head"><h2 class="sk-h">Tilastot</h2></div>
  ${night.skaters.length ? renderSkaterTable(night.skaters.map((r) => r.player), xg, teams) : ""}
  ${night.goalies.length ? renderGoalieTable(night.goalies.map((r) => r.player), xg.gsax, teams) : ""}
</div>`;

  return html(await layout(content));
};
