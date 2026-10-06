// /omat/pelaajat: the "⭐ Suosikkipelaajat" entry in the sidebar's Omat
// dropdown -- a pistepörssi-style leaderboard of just the signed-in user's
// favorite players, split into skaters/goalies same as a team page's roster
// tables (reusing _shared/leaderboard.ts's renderRosterSkaterTable/
// renderRosterGoalieTable directly, with showTeam=true since favorites can
// span several teams). Adding/removing favorites happens on /omat
// (Asetukset), not here -- this page is read-only.

import { currentUsername, favoriteTeamAbbrevs, readHighlightsCookie } from "../_shared/auth";
import { renderLayout } from "../_shared/layout";
import { renderRosterGoalieTable, renderRosterSkaterTable } from "../_shared/leaderboard";
import type { Env, FavoritePlayerRow, TeamRosterGoalieRow, TeamRosterSkaterRow } from "../_shared/types";

function renderNotSignedIn(request: Request): Promise<string> {
  return renderLayout({
    title: "Suosikkipelaajat · Morning Hockey",
    headerTitle: "Suosikkipelaajat",
    activePage: "omat_players",
    request,
    content: `
<header class="page-header"><h1>⭐ Suosikkipelaajat</h1></header>
<p class="empty-note">
  <a href="/kirjaudu?next=${encodeURIComponent("/omat/pelaajat")}">Kirjaudu sisään</a> nähdäksesi suosikkipelaajasi.
</p>`,
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) {
    return new Response(await renderNotSignedIn(context.request), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const db = context.env.DB;
  const { results: favoritePlayerRows } = await db
    .prepare("SELECT * FROM favorite_players WHERE username = ?")
    .bind(username)
    .all<FavoritePlayerRow>();

  const favoriteSkaters: TeamRosterSkaterRow[] = [];
  const favoriteGoalies: TeamRosterGoalieRow[] = [];
  for (const fav of favoritePlayerRows) {
    if (fav.is_goalie) {
      const goalie = await db
        .prepare("SELECT * FROM team_roster_goalies WHERE player_id = ?")
        .bind(fav.player_id)
        .first<TeamRosterGoalieRow>();
      if (goalie) favoriteGoalies.push(goalie);
    } else {
      const skater = await db
        .prepare("SELECT * FROM team_roster_skaters WHERE player_id = ?")
        .bind(fav.player_id)
        .first<TeamRosterSkaterRow>();
      if (skater) favoriteSkaters.push(skater);
    }
  }

  favoriteSkaters.sort((a, b) => b.points - a.points || b.goals - a.goals || a.name.localeCompare(b.name));
  favoriteGoalies.sort((a, b) => b.save_pct - a.save_pct);

  const hl = {
    highlights: readHighlightsCookie(context.request),
    favoriteTeamAbbrevs: await favoriteTeamAbbrevs(context.request, context.env),
  };

  const content = `
<a class="back-link js-back" href="/">← Takaisin</a>

<header class="page-header">
  <h1>⭐ Suosikkipelaajat</h1>
</header>

${
  favoriteSkaters.length || favoriteGoalies.length
    ? ""
    : `<p class="empty-note">Ei vielä suosikkipelaajia. Lisää niitä <a href="/omat">Asetukset</a>-sivulla.</p>`
}

${favoriteSkaters.length ? renderRosterSkaterTable(favoriteSkaters, "🏒 Kenttäpelaajat", true, hl) : ""}
${favoriteGoalies.length ? renderRosterGoalieTable(favoriteGoalies, "🥅 Maalivahdit", true, hl) : ""}
`;

  const html = await renderLayout({
    title: "Suosikkipelaajat · Morning Hockey",
    headerTitle: "Suosikkipelaajat",
    activePage: "omat_players",
    request: context.request,
    env: context.env,
    content,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
