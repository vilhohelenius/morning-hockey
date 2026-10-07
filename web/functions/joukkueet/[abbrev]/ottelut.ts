// Full-season schedule for one team, split into a past/upcoming toggle --
// the team page itself only shows the last/next 10 games each; this is the
// "see everything" view linked from there, same renderGameRow rows (most
// recent played game first, next upcoming game first) with no cap.

import { escapeHtml, renderGameRow, teamHeroBackgroundStyle } from "../../_shared/format";
import { renderLayout } from "../../_shared/layout";
import type { Env, GameRow, StandingsRow } from "../../_shared/types";

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

  const { results: pastGames } = await db
    .prepare("SELECT * FROM games WHERE (away_abbrev = ? OR home_abbrev = ?) AND is_finished = 1 ORDER BY date DESC")
    .bind(abbrev, abbrev)
    .all<GameRow>();

  const { results: upcomingGames } = await db
    .prepare("SELECT * FROM games WHERE (away_abbrev = ? OR home_abbrev = ?) AND is_finished = 0 ORDER BY date ASC")
    .bind(abbrev, abbrev)
    .all<GameRow>();

  const content = `
<a class="back-link js-back" href="/joukkueet/${abbrev.toLowerCase()}">← Takaisin</a>

<header class="page-header team-page-header hero-banner" data-abbr="${escapeHtml(abbrev)}" style="${escapeHtml(teamHeroBackgroundStyle(abbrev))}">
  <img src="${escapeHtml(team.logo)}" alt="" class="team-hero-logo">
  <div class="team-hero-text">
    <h1>${escapeHtml(team.name)}</h1>
    <p class="subtitle">${team.wins}-${team.losses}-${team.ot_losses} (${team.points} p) · Kauden kaikki ottelut</p>
  </div>
</header>

<div class="team-games-picker">
  <button type="button" class="day-pill active" data-filter="past">Menneet</button>
  <button type="button" class="day-pill" data-filter="upcoming">Tulevat</button>
</div>

<section class="team-games-section" data-filter="past">
  ${
    pastGames.length
      ? `<div class="schedule-list">${pastGames.map((g) => renderGameRow(g, abbrev, true)).join("")}</div>`
      : `<p class="empty-note">Ei vielä pelattuja otteluita synkattuna.</p>`
  }
</section>

<section class="team-games-section is-hidden" data-filter="upcoming">
  ${
    upcomingGames.length
      ? `<div class="schedule-list">${upcomingGames.map((g) => renderGameRow(g, abbrev, false)).join("")}</div>`
      : `<p class="empty-note">Ei tiedossa olevia otteluita synkattuna.</p>`
  }
</section>
`;

  const html = await renderLayout({
    title: `${team.name} · Kaikki ottelut · Morning Hockey`,
    headerTitle: team.name,
    activePage: `team_${abbrev.toLowerCase()}`,
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
