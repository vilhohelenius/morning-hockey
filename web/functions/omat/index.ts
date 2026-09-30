// /omat: the signed-in user's personalized page -- favorite teams/players,
// a picker for each, and the theme toggle. Phase 7, and unlike every
// earlier phase there's no templates/*.html to port: this page doesn't
// exist in the original site at all.
//
// Favorites are looped one at a time (N+1 queries) rather than batch-
// fetched like the standings snapshot's 32-team pass -- a person's
// favorites list is a handful of rows, not 32, so the bulk-query
// complexity that was worth it there isn't worth it here.

import { authenticatedEmail, readThemeCookie } from "../_shared/auth";
import { escapeHtml, formatToi, shortDate } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import type {
  Env,
  FavoritePlayerRow,
  FavoriteTeamRow,
  GameRow,
  StandingsRow,
  TeamRosterGoalieRow,
  TeamRosterSkaterRow,
  UserSettingsRow,
} from "../_shared/types";

const SEARCH_RESULTS_LIMIT = 15;

function renderNotSignedIn(request: Request): string {
  return renderLayout({
    title: "Omat · Morning Hockey",
    headerTitle: "Omat",
    activePage: "omat",
    request,
    content: `
<header class="page-header"><h1>⭐ Omat</h1></header>
<p class="empty-note">Kirjaudu sisään Cloudflare Accessilla nähdäksesi ja hallitaksesi suosikkejasi.</p>`,
  });
}

function renderFavoriteTeamRow(team: StandingsRow, nextGame: GameRow | null): string {
  const nextGameHtml = nextGame
    ? (() => {
        const isHome = nextGame.home_abbrev === team.abbrev;
        const opponentAbbrev = isHome ? nextGame.away_abbrev : nextGame.home_abbrev;
        const opponentLogo = isHome ? nextGame.away_logo : nextGame.home_logo;
        return `
      <span class="schedule-opponent">
        ${shortDate(nextGame.date)} ${isHome ? "vs" : "@"}
        <img src="${escapeHtml(opponentLogo)}" alt="" class="schedule-logo" loading="lazy">
        ${escapeHtml(opponentAbbrev)}
      </span>`;
      })()
    : `<span class="schedule-opponent">Ei tiedossa olevaa ottelua</span>`;

  return `
    <div class="schedule-row">
      <a href="/joukkueet/${team.abbrev.toLowerCase()}" class="schedule-opponent">
        <img src="${escapeHtml(team.logo)}" alt="" class="schedule-logo" loading="lazy">
        ${escapeHtml(team.name)}
      </a>
      ${nextGameHtml}
      <form method="post" action="/omat/favorites/teams">
        <input type="hidden" name="abbrev" value="${escapeHtml(team.abbrev)}">
        <input type="hidden" name="action" value="remove">
        <button type="submit" class="icon-btn" aria-label="Poista suosikeista">✕</button>
      </form>
    </div>`;
}

function renderFavoritePlayerRow(
  fav: { isGoalie: boolean },
  player: TeamRosterSkaterRow | TeamRosterGoalieRow,
): string {
  const statLine = fav.isGoalie
    ? (() => {
        const g = player as TeamRosterGoalieRow;
        return `${g.wins}-${g.losses}-${g.ot_losses} · ${g.save_pct.toFixed(3)} SV%`;
      })()
    : (() => {
        const s = player as TeamRosterSkaterRow;
        return `${s.points} p (${s.goals}+${s.assists}) · ${formatToi(s.avg_toi_seconds)} KA`;
      })();

  return `
    <div class="schedule-row">
      <span class="schedule-opponent">
        <img src="${escapeHtml(player.headshot)}" alt="" class="schedule-logo" loading="lazy" onerror="this.style.visibility='hidden'">
        ${escapeHtml(player.name)} <span class="player-meta">${escapeHtml(player.team_abbrev)}</span>
      </span>
      <span class="schedule-opponent">${statLine}</span>
      <form method="post" action="/omat/favorites/players">
        <input type="hidden" name="player_id" value="${player.player_id}">
        <input type="hidden" name="is_goalie" value="${fav.isGoalie ? "1" : "0"}">
        <input type="hidden" name="action" value="remove">
        <button type="submit" class="icon-btn" aria-label="Poista suosikeista">✕</button>
      </form>
    </div>`;
}

function renderTeamPicker(availableTeams: StandingsRow[]): string {
  if (!availableTeams.length) return "";
  const options = availableTeams
    .map((t) => `<option value="${escapeHtml(t.abbrev)}">${escapeHtml(t.name)}</option>`)
    .join("");
  return `
  <form method="post" action="/omat/favorites/teams" class="table-filters">
    <select name="abbrev">${options}</select>
    <input type="hidden" name="action" value="add">
    <button type="submit" class="filter-btn">Lisää suosikkijoukkue</button>
  </form>`;
}

function renderPlayerSearchResult(row: TeamRosterSkaterRow | TeamRosterGoalieRow, isGoalie: boolean): string {
  return `
    <div class="schedule-row">
      <span class="schedule-opponent">
        <img src="${escapeHtml(row.headshot)}" alt="" class="schedule-logo" loading="lazy" onerror="this.style.visibility='hidden'">
        ${escapeHtml(row.name)} <span class="player-meta">${escapeHtml(row.team_abbrev)}</span>
      </span>
      <form method="post" action="/omat/favorites/players">
        <input type="hidden" name="player_id" value="${row.player_id}">
        <input type="hidden" name="is_goalie" value="${isGoalie ? "1" : "0"}">
        <input type="hidden" name="action" value="add">
        <button type="submit" class="filter-btn">+ Suosikki</button>
      </form>
    </div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const email = authenticatedEmail(context.request);
  if (!email) {
    return new Response(renderNotSignedIn(context.request), { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const db = context.env.DB;
  const url = new URL(context.request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  const [{ results: favoriteTeamRows }, { results: favoritePlayerRows }, settings, { results: allTeams }] =
    await Promise.all([
      db.prepare("SELECT * FROM favorite_teams WHERE email = ?").bind(email).all<FavoriteTeamRow>(),
      db.prepare("SELECT * FROM favorite_players WHERE email = ?").bind(email).all<FavoritePlayerRow>(),
      db.prepare("SELECT * FROM user_settings WHERE email = ?").bind(email).first<UserSettingsRow>(),
      db.prepare("SELECT * FROM standings_rows ORDER BY name").all<StandingsRow>(),
    ]);

  const favoriteTeamsHtml: string[] = [];
  for (const fav of favoriteTeamRows) {
    const team = allTeams.find((t) => t.abbrev === fav.team_abbrev);
    if (!team) continue;
    const nextGame = await db
      .prepare(
        "SELECT * FROM games WHERE (away_abbrev = ? OR home_abbrev = ?) AND is_finished = 0 ORDER BY date ASC LIMIT 1",
      )
      .bind(fav.team_abbrev, fav.team_abbrev)
      .first<GameRow>();
    favoriteTeamsHtml.push(renderFavoriteTeamRow(team, nextGame));
  }

  const favoritePlayersHtml: string[] = [];
  for (const fav of favoritePlayerRows) {
    const player = fav.is_goalie
      ? await db.prepare("SELECT * FROM team_roster_goalies WHERE player_id = ?").bind(fav.player_id).first<TeamRosterGoalieRow>()
      : await db.prepare("SELECT * FROM team_roster_skaters WHERE player_id = ?").bind(fav.player_id).first<TeamRosterSkaterRow>();
    if (player) favoritePlayersHtml.push(renderFavoritePlayerRow({ isGoalie: !!fav.is_goalie }, player));
  }

  const favoritedAbbrevs = new Set(favoriteTeamRows.map((f) => f.team_abbrev));
  const availableTeams = allTeams.filter((t) => !favoritedAbbrevs.has(t.abbrev));

  let searchResultsHtml = "";
  if (query) {
    const likeQuery = `%${query}%`;
    const favoritedPlayerIds = new Set(favoritePlayerRows.map((f) => f.player_id));
    const [{ results: skaterMatches }, { results: goalieMatches }] = await Promise.all([
      db
        .prepare("SELECT * FROM team_roster_skaters WHERE name LIKE ? ORDER BY name LIMIT ?")
        .bind(likeQuery, SEARCH_RESULTS_LIMIT)
        .all<TeamRosterSkaterRow>(),
      db
        .prepare("SELECT * FROM team_roster_goalies WHERE name LIKE ? ORDER BY name LIMIT ?")
        .bind(likeQuery, SEARCH_RESULTS_LIMIT)
        .all<TeamRosterGoalieRow>(),
    ]);
    const results = [
      ...skaterMatches.filter((r) => !favoritedPlayerIds.has(r.player_id)).map((r) => renderPlayerSearchResult(r, false)),
      ...goalieMatches.filter((r) => !favoritedPlayerIds.has(r.player_id)).map((r) => renderPlayerSearchResult(r, true)),
    ];
    searchResultsHtml = results.length
      ? `<div class="schedule-list">${results.join("")}</div>`
      : `<p class="empty-note">Ei osumia haulle "${escapeHtml(query)}".</p>`;
  }

  const currentTheme = settings?.theme ?? readThemeCookie(context.request) ?? "system (selaimen oma)";

  const content = `
<header class="page-header">
  <h1>⭐ Omat</h1>
  <p class="subtitle">${escapeHtml(email)}</p>
</header>

<section>
  <h2 class="section-title">Suosikkijoukkueet</h2>
  ${
    favoriteTeamsHtml.length
      ? `<div class="schedule-list">${favoriteTeamsHtml.join("")}</div>`
      : `<p class="empty-note">Ei vielä suosikkijoukkueita.</p>`
  }
  ${renderTeamPicker(availableTeams)}
</section>

<section>
  <h2 class="section-title">Suosikkipelaajat</h2>
  ${
    favoritePlayersHtml.length
      ? `<div class="schedule-list">${favoritePlayersHtml.join("")}</div>`
      : `<p class="empty-note">Ei vielä suosikkipelaajia.</p>`
  }
  <form method="get" action="/omat" class="table-filters">
    <input type="search" name="q" placeholder="Hae pelaajaa nimellä..." value="${escapeHtml(query)}">
    <button type="submit" class="filter-btn">Hae</button>
  </form>
  ${searchResultsHtml}
</section>

<section>
  <h2 class="section-title">Teema</h2>
  <p class="subtitle">Nykyinen: ${escapeHtml(currentTheme)}</p>
  <div class="table-filters">
    <form method="post" action="/omat/theme">
      <input type="hidden" name="theme" value="light">
      <button type="submit" class="filter-btn ${currentTheme === "light" ? "active" : ""}">☀️ Vaalea</button>
    </form>
    <form method="post" action="/omat/theme">
      <input type="hidden" name="theme" value="dark">
      <button type="submit" class="filter-btn ${currentTheme === "dark" ? "active" : ""}">🌙 Tumma</button>
    </form>
  </div>
</section>
`;

  const html = renderLayout({
    title: "Omat · Morning Hockey",
    headerTitle: "Omat",
    activePage: "omat",
    request: context.request,
    content,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
