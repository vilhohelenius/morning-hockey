// /omat: "Asetukset" -- managing favorite teams/players, the theme
// toggle, and (since 2026-10-01) the account itself. Not the personalized
// view any more: favorite teams and a favorite-players leaderboard
// (/omat/pelaajat) now live directly in the sidebar's "⭐ Omat" dropdown
// (see _shared/layout.ts), so this page is only for adding/removing
// favorites, the theme, and signing in/out, and sits at the bottom of the
// sidebar as its own "⚙️ Asetukset" link.
//
// Path kept as /omat (not renamed to /asetukset) so the favorites/theme
// POST routes under omat/* don't need their redirect targets changed.

import { currentUsername, readHighlightsCookie, readThemeCookie } from "../_shared/auth";
import { icon, escapeHtml, formatToi, teamLogoUrl } from "../_shared/format";
import { loadPicks, loadWindowGames } from "../_shared/bingoData";
import { renderLayout } from "../_shared/layout";
import { fetchGoaliesSeasonGsaxMap, formatGsax } from "../_shared/xg";
import type {
  Env,
  FavoritePlayerRow,
  FavoriteTeamRow,
  StandingsRow,
  TeamRosterGoalieRow,
  TeamRosterSkaterRow,
  UserSettingsRow,
} from "../_shared/types";

const SEARCH_RESULTS_LIMIT = 15;

type SettingsTab = "yleiset" | "suosikit" | "tulospiilo";

function renderNotSignedIn(request: Request): Promise<string> {
  return renderLayout({
    title: "Asetukset · Morning Hockey",
    headerTitle: "Asetukset",
    activePage: "settings",
    request,
    content: `
<header class="page-header"><h1>${icon("settings")} Asetukset</h1></header>
<p class="empty-note">
  <a href="/kirjaudu?next=${encodeURIComponent("/omat")}">Kirjaudu sisään</a> hallitaksesi suosikkejasi ja asetuksiasi.
</p>`,
  });
}

function renderFavoriteTeamRow(team: StandingsRow): string {
  return `
    <div class="fav-row">
      <a href="/joukkueet/${team.abbrev.toLowerCase()}" class="fav-row-info">
        <img src="${escapeHtml(team.logo)}" alt="" loading="lazy">
        ${escapeHtml(team.name)}
      </a>
      <form method="post" action="/omat/favorites/teams">
        <input type="hidden" name="abbrev" value="${escapeHtml(team.abbrev)}">
        <input type="hidden" name="fav_action" value="remove">
        <input type="hidden" name="redirect_to" value="/omat?osio=suosikit">
        <button type="submit" class="icon-btn" aria-label="Poista suosikeista">${icon("close")}</button>
      </form>
    </div>`;
}

function renderFavoritePlayerRow(
  fav: { isGoalie: boolean },
  player: TeamRosterSkaterRow | TeamRosterGoalieRow,
  gsax?: number,
): string {
  const statLine = fav.isGoalie
    ? (() => {
        const g = player as TeamRosterGoalieRow;
        return `${g.wins}-${g.losses}-${g.ot_losses} · ${g.save_pct.toFixed(3)} SV%${gsax === undefined ? "" : ` · ${formatGsax(gsax, 2)} GSAx`}`;
      })()
    : (() => {
        const s = player as TeamRosterSkaterRow;
        return `${s.points} p (${s.goals}+${s.assists}) · ${formatToi(s.avg_toi_seconds)} KA`;
      })();

  return `
    <div class="fav-row">
      <a href="/pelaajat/${player.player_id}" class="fav-row-info">
        <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        ${escapeHtml(player.name)} <span class="fav-row-meta"><img src="${escapeHtml(teamLogoUrl(player.team_abbrev))}" alt="${escapeHtml(player.team_abbrev)}" class="table-team-logo" loading="lazy"></span>
      </a>
      <span class="fav-row-meta">${statLine}</span>
      <form method="post" action="/omat/favorites/players">
        <input type="hidden" name="player_id" value="${player.player_id}">
        <input type="hidden" name="is_goalie" value="${fav.isGoalie ? "1" : "0"}">
        <input type="hidden" name="fav_action" value="remove">
        <input type="hidden" name="redirect_to" value="/omat?osio=suosikit">
        <button type="submit" class="icon-btn" aria-label="Poista suosikeista">${icon("close")}</button>
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
    <input type="hidden" name="fav_action" value="add">
        <input type="hidden" name="redirect_to" value="/omat?osio=suosikit">
    <button type="submit" class="filter-btn">Lisää suosikkijoukkue</button>
  </form>`;
}

function renderPlayerSearchResult(row: TeamRosterSkaterRow | TeamRosterGoalieRow, isGoalie: boolean): string {
  return `
    <div class="fav-row">
      <a href="/pelaajat/${row.player_id}" class="fav-row-info">
        <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        ${escapeHtml(row.name)} <span class="fav-row-meta"><img src="${escapeHtml(teamLogoUrl(row.team_abbrev))}" alt="${escapeHtml(row.team_abbrev)}" class="table-team-logo" loading="lazy"></span>
      </a>
      <form method="post" action="/omat/favorites/players">
        <input type="hidden" name="player_id" value="${row.player_id}">
        <input type="hidden" name="is_goalie" value="${isGoalie ? "1" : "0"}">
        <input type="hidden" name="fav_action" value="add">
        <input type="hidden" name="redirect_to" value="/omat?osio=suosikit">
        <button type="submit" class="filter-btn">+ Suosikki</button>
      </form>
    </div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) {
    return new Response(await renderNotSignedIn(context.request), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const db = context.env.DB;
  const url = new URL(context.request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  const [{ results: favoriteTeamRows }, { results: favoritePlayerRows }, settings, { results: allTeams }] =
    await Promise.all([
      db.prepare("SELECT * FROM favorite_teams WHERE username = ?").bind(username).all<FavoriteTeamRow>(),
      db.prepare("SELECT * FROM favorite_players WHERE username = ?").bind(username).all<FavoritePlayerRow>(),
      db.prepare("SELECT * FROM user_settings WHERE username = ?").bind(username).first<UserSettingsRow>(),
      db.prepare("SELECT * FROM standings_rows ORDER BY name").all<StandingsRow>(),
    ]);

  const favoriteTeamsHtml = favoriteTeamRows
    .map((fav) => allTeams.find((t) => t.abbrev === fav.team_abbrev))
    .filter((t): t is StandingsRow => !!t)
    .map(renderFavoriteTeamRow);

  const favoritePlayersHtml: string[] = [];
  const goalieGsax = await fetchGoaliesSeasonGsaxMap(db, favoritePlayerRows.filter((f) => f.is_goalie).map((f) => f.player_id));
  for (const fav of favoritePlayerRows) {
    const player = fav.is_goalie
      ? await db.prepare("SELECT * FROM team_roster_goalies WHERE player_id = ?").bind(fav.player_id).first<TeamRosterGoalieRow>()
      : await db.prepare("SELECT * FROM team_roster_skaters WHERE player_id = ?").bind(fav.player_id).first<TeamRosterSkaterRow>();
    if (player) favoritePlayersHtml.push(renderFavoritePlayerRow({ isGoalie: !!fav.is_goalie }, player, goalieGsax.get(fav.player_id)));
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
      ? `<div class="fav-list">${results.join("")}</div>`
      : `<p class="empty-note">Ei osumia haulle "${escapeHtml(query)}".</p>`;
  }

  const currentTheme = settings?.theme ?? readThemeCookie(context.request) ?? "system";
  const tulospiiloEnabled = !!settings?.tulospiilo_mode;
  const highlightsEnabled = settings ? !!settings.highlights : readHighlightsCookie(context.request);

  const tabParam = url.searchParams.get("osio");
  const tab: SettingsTab = query ? "suosikit" : tabParam === "suosikit" || tabParam === "tulospiilo" ? tabParam : "yleiset";
  const back = `<input type="hidden" name="redirect_to" value="/omat?osio=${tab}">`;

  const accountSection = `
<section>
  <h2 class="section-title">Tili</h2>
  <div class="fav-row">
    <span class="fav-row-info">${icon("user")} ${escapeHtml(username)}</span>
    <form method="post" action="/kirjaudu/ulos">
      <button type="submit" class="filter-btn">Kirjaudu ulos</button>
    </form>
  </div>
</section>`;

  const themeSection = `
<section>
  <h2 class="section-title">Teema</h2>
  <div class="toggle-group">
    ${(["light", "dark", "system"] as const)
      .map(
        (value) => `<form method="post" action="/omat/theme">
      <input type="hidden" name="theme" value="${value}">
      ${back}
      <button type="submit" class="toggle-segment ${currentTheme === value ? "active" : ""}">${value === "light" ? `${icon("sun")} Vaalea` : value === "dark" ? `${icon("moon")} Tumma` : `${icon("settings")} Järjestelmä`}</button>
    </form>`,
      )
      .join("\n    ")}
  </div>
</section>`;

  const highlightsSection = `
<section>
  <h2 class="section-title">${icon("dot")} Pörssien korostukset</h2>
  <p class="standings-legend">
    Pörsseissä (Pistepörssi, Maalivahtipörssi, Suomipörssi, Suosikkipelaajat) pelaajan nimen perässä
    näkyy pieni pallura: sininen = suomalainen pelaaja, joukkueen värinen = suosikkijoukkueen pelaaja.
  </p>
  <div class="toggle-group">
    <form method="post" action="/omat/highlights">
      <input type="hidden" name="enabled" value="1">
      ${back}
      <button type="submit" class="toggle-segment ${highlightsEnabled ? "active" : ""}">Päällä</button>
    </form>
    <form method="post" action="/omat/highlights">
      <input type="hidden" name="enabled" value="0">
      ${back}
      <button type="submit" class="toggle-segment ${highlightsEnabled ? "" : "active"}">Pois päältä</button>
    </form>
  </div>
</section>`;

  const favoriteTeamsSection = `
<section>
  <h2 class="section-title">Suosikkijoukkueet</h2>
  <p class="standings-legend">Näkyvät sivupalkin ${icon("star")} Omat -valikossa, linkkinä suoraan joukkueen tilastosivulle.</p>
  ${
    favoriteTeamsHtml.length
      ? `<div class="fav-list">${favoriteTeamsHtml.join("")}</div>`
      : `<p class="empty-note">Ei vielä suosikkijoukkueita.</p>`
  }
  ${renderTeamPicker(availableTeams)}
</section>`;

  const favoritePlayersSection = `
<section>
  <h2 class="section-title">Suosikkipelaajat</h2>
  <p class="standings-legend">Näkyvät koottuna listana sivupalkin ${icon("star")} Omat → Suosikkipelaajat -kohdassa.</p>
  ${
    favoritePlayersHtml.length
      ? `<div class="fav-list">${favoritePlayersHtml.join("")}</div>`
      : `<p class="empty-note">Ei vielä suosikkipelaajia.</p>`
  }
  <form method="get" action="/omat" class="table-filters">
    <input type="hidden" name="osio" value="suosikit">
    <input type="search" name="q" placeholder="Hae pelaajaa nimellä..." value="${escapeHtml(query)}">
    <button type="submit" class="filter-btn">Hae</button>
  </form>
  ${searchResultsHtml}
</section>`;

  let tulospiiloSections = "";
  if (tab === "tulospiilo") {
    const nowMs = Date.now();
    const windowGames = await loadWindowGames(db);
    const picks = (await loadPicks(db, username, windowGames, nowMs)).filter((p) => p.phase !== "stale");
    tulospiiloSections = `
<section>
  <h2 class="section-title">${icon("hide")} Tulospiilo</h2>
  <p class="standings-legend">
    Päällä ollessaan etusivu avautuu suoraan Tulospiilo-näkymään, jossa edellisen kierroksen
    ottelut ja YouTube-highlightit näkyvät ilman tuloksia -- tulos paljastuu ottelukohtaisesti
    ruksimalla.
  </p>
  <div class="toggle-group">
    <form method="post" action="/omat/tulospiilo">
      <input type="hidden" name="enabled" value="1">
      ${back}
      <button type="submit" class="toggle-segment ${tulospiiloEnabled ? "active" : ""}">${icon("hide")} Päällä</button>
    </form>
    <form method="post" action="/omat/tulospiilo">
      <input type="hidden" name="enabled" value="0">
      ${back}
      <button type="submit" class="toggle-segment ${tulospiiloEnabled ? "" : "active"}">Pois päältä</button>
    </form>
  </div>
</section>

<section>
  <h2 class="section-title">${icon("target")} Pistemiesbingo</h2>
  <p class="standings-legend">
    Pistemiesbingo-lappusi pelaajat näkyvät Tulospiilon alaosassa: pelaajan tilasto paljastuu samalla
    kun ottelun tulos. Lappu nollautuu itsestään, kun seuraava pelikierros alkaa.
  </p>
  <div class="fav-row">
    <span class="fav-row-info">${picks.length ? `${picks.length} ${picks.length === 1 ? "pelaaja" : "pelaajaa"} lapussa` : "Ei pelaajia lapussa"}</span>
    <a class="filter-btn" href="/bingo">Muokkaa lappua →</a>
  </div>
</section>`;
  }

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: "yleiset", label: "Yleiset" },
    { key: "suosikit", label: "Suosikit" },
    { key: "tulospiilo", label: "Tulospiilo" },
  ];
  const tabsHtml = `<nav class="standings-tab-picker settings-tabs" aria-label="Asetusten osiot">
  ${tabs
    .map(
      (t) =>
        `<a class="standings-tab${t.key === tab ? " active" : ""}" href="/omat${t.key === "yleiset" ? "" : `?osio=${t.key}`}"${t.key === tab ? ' aria-current="page"' : ""}>${t.label}</a>`,
    )
    .join("\n  ")}
</nav>`;

  const sections =
    tab === "yleiset"
      ? accountSection + themeSection + highlightsSection
      : tab === "suosikit"
        ? favoriteTeamsSection + favoritePlayersSection
        : tulospiiloSections;

  const content = `
<header class="page-header">
  <h1>${icon("settings")} Asetukset</h1>
</header>

${tabsHtml}

<div class="settings-page">
${sections}
</div>
`;

  const html = await renderLayout({
    title: "Asetukset · Morning Hockey",
    headerTitle: "Asetukset",
    activePage: "settings",
    request: context.request,
    env: context.env,
    content,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
