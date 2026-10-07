// TypeScript port of templates/base.html's app shell. Not a 1:1 copy of the
// Jinja2 markup byte-for-byte, but same structure/classes so style.css and
// app.js (copied into public/static unchanged) drive it identically.
//
// Unlike the GitHub Pages build, routes here are real URLs, not a folder of
// relative-linked .html files -- so nav links are absolute paths, no
// asset_prefix "../" juggling needed. Most nav targets don't exist as Pages
// routes yet (only /joukkueet/:abbrev, phase 3); they'll 404 until phase 4
// ports each page in turn, which is fine while this only runs on the
// *.pages.dev preview domain, side by side with the live site.

import { currentUsername, readThemeCookie } from "./auth";
import { icon, escapeHtml } from "./format";
import type { Env, StandingsRow } from "./types";

interface LayoutOptions {
  title: string;
  headerTitle: string;
  activePage: string;
  content: string;
  // Used to read the theme cookie (see auth.ts) and, together with `env`,
  // to look up the signed-in user's favorite teams for the sidebar's Omat
  // dropdown -- every route passes its own `context.request`/`context.env`
  // here so the right nav/theme goes out on every page, not just /omat.
  request?: Request;
  env?: Env;
}

const NAV_HOME = { key: "home", href: "/", label: `${icon("home")}Etusivu` };
const NAV_STANDINGS = { key: "standings", href: "/sarjataulukko", label: `${icon("standings")}Sarjataulukko` };
const NAV_PLAYOFFS = { key: "playoffs", href: "/playoffit", label: `${icon("trophy")}Playoff-bracket` };
const NAV_ARCHIVE = { key: "archive", href: "/arkisto", label: `${icon("archive")}Arkisto` };
const NAV_SETTINGS = { key: "settings", href: "/omat", label: `${icon("settings")}Asetukset` };

const STATS_PAGES = [
  { key: "league_stats", href: "/tilastot", label: "Pistepörssi" },
  { key: "goalie_stats", href: "/maalivahtiporssi", label: "Maalivahtipörssi" },
  { key: "suomiporssi", href: "/suomiporssi", label: "Suomipörssi" },
];

const ANALYTICS_PAGES = [
  { key: "xstats", href: "/odotetut", label: "Edistyneet tilastot" },
  { key: "analytics", href: "/analytiikka", label: "Analytiikka" },
];

const NAV_TEAMS = { key: "teams", href: "/joukkueet", label: `${icon("jersey")}Joukkueet` };

const GAME_PAGES = [
  { key: "schedule", href: "/otteluohjelma", label: "Otteluohjelma" },
  { key: "primetime", href: "/primetime", label: "Prime time" },
  { key: "bingo", href: "/bingo", label: "Pistemiesbingo" },
];

const OMAT_PLAYERS_ITEM = { key: "omat_players", href: "/omat/pelaajat", label: `${icon("star")}Suosikkipelaajat` };

function navLink(item: { key: string; href: string; label: string }, activePage: string): string {
  const active = item.key === activePage ? " active" : "";
  return `<li><a href="${item.href}" class="${active.trim()}">${item.label}</a></li>`;
}

function navGroup(
  groupKey: string,
  label: string,
  items: { key: string; href: string; label: string }[],
  activePage: string,
): string {
  const groupActive = items.some((i) => i.key === activePage);
  return `
      <li class="nav-group">
        <button type="button" class="nav-group-toggle ${groupActive ? "active" : ""}"
          aria-expanded="${groupActive ? "true" : "false"}">
          ${label}
          <span class="nav-group-chevron">▾</span>
        </button>
        <ul class="nav-sublist ${groupActive ? "open" : ""}">
          ${items
            .map(
              (item) =>
                `<li><a href="${item.href}" class="${item.key === activePage ? "active" : ""}">${item.label}</a></li>`,
            )
            .join("\n          ")}
        </ul>
      </li>`;
}

// The Omat group's team entries are per-user, so they're fetched here
// (rather than passed in) -- every route already passes request/env for
// the theme cookie, so this piggybacks on the same plumbing instead of
// every single page handler needing its own favorite_teams query.
async function favoriteTeamNavItems(
  request: Request | undefined,
  env: Env | undefined,
): Promise<{ key: string; href: string; label: string }[]> {
  if (!request || !env) return [];
  const username = currentUsername(request);
  if (!username) return [];

  const { results } = await env.DB.prepare(
    `SELECT s.* FROM favorite_teams f JOIN standings_rows s ON s.abbrev = f.team_abbrev
     WHERE f.username = ? ORDER BY s.name`,
  )
    .bind(username)
    .all<StandingsRow>();

  return results.map((team) => ({
    key: `team_${team.abbrev.toLowerCase()}`,
    href: `/joukkueet/${team.abbrev.toLowerCase()}`,
    label: `<img src="${escapeHtml(team.logo)}" alt="" class="nav-team-logo" loading="lazy">${escapeHtml(team.name)}`,
  }));
}

// Home-page-only player search (see app.js's ".player-search" handler and
// haku/pelaajat.ts). Rendered twice -- once in .topbar (mobile, where it's
// the only header besides the hamburger+title) and once in .sidebar-header
// (desktop, which has no .topbar at all -- see style.css's 860px media
// query). Both instances share this exact markup; app.js finds them with
// querySelectorAll and drives each independently, so no unique ids needed.
function renderPlayerSearch(): string {
  return `
      <div class="player-search" data-player-search>
        <div class="player-search-field">
          <input type="text" class="player-search-input" placeholder="Hae pelaajaa..." autocomplete="off" aria-label="Hae pelaajaa">
        </div>
        <button type="button" class="icon-btn player-search-toggle" aria-label="Hae pelaajaa" aria-expanded="false">
          <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <svg class="close-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div class="player-search-results"></div>
      </div>`;
}

export async function renderLayout(options: LayoutOptions): Promise<string> {
  const { title, headerTitle, activePage, content, request, env } = options;
  const theme = request ? readThemeCookie(request) : null;
  const omatItems = [...(await favoriteTeamNavItems(request, env)), OMAT_PLAYERS_ITEM];
  const playerSearch = activePage === "home" ? renderPlayerSearch() : "";

  return `<!doctype html>
<html lang="fi"${theme ? ` data-theme="${theme}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Teko:wght@500;600;700&family=Instrument+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/static/style.css">
${["TBL", "TOR", "NSH"].map((t) => `<link rel="preload" as="image" href="https://assets.nhle.com/logos/nhl/svg/${t}_dark.svg"${theme === "dark" ? "" : ' media="(prefers-color-scheme: dark)"'}>`).join("\n")}
<link rel="icon" type="image/svg+xml" href="/static/brand/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/static/brand/favicon_32.png">
<link rel="apple-touch-icon" href="/static/brand/apple_touch_icon.png">
<link rel="manifest" href="/static/manifest.json">
<meta name="theme-color" content="#0D0D0F">
<meta name="apple-mobile-web-app-title" content="Morning Hockey">
<meta name="apple-mobile-web-app-capable" content="yes">
</head>
<body>
<div class="app-shell">
  <div id="backdrop" class="backdrop"></div>

  <nav id="sidebar" class="sidebar" aria-label="Päävalikko">
    <div class="sidebar-header">
      <img src="/static/brand/banner_light_fi.png" alt="Morning Hockey" class="brand-banner brand-banner-light sidebar-banner">
      <img src="/static/brand/banner_dark_fi.png" alt="Morning Hockey" class="brand-banner brand-banner-dark sidebar-banner">
      ${playerSearch}
      <button id="sidebar-close" class="icon-btn" aria-label="Sulje valikko">${icon("close")}</button>
    </div>
    <ul class="nav-list">
      ${navLink(NAV_HOME, activePage)}
      ${navGroup("omat", `${icon("star")}Omat`, omatItems, activePage)}
      ${navLink(NAV_STANDINGS, activePage)}
      ${navGroup("stats", `${icon("trend")}Tilastot`, STATS_PAGES, activePage)}
      ${navGroup("analytics", `${icon("analytics")}Analytiikka`, ANALYTICS_PAGES, activePage)}
      ${navLink(NAV_TEAMS, activePage)}
      ${navGroup("games", `${icon("calendar")}Pelit`, GAME_PAGES, activePage)}
      ${navLink(NAV_PLAYOFFS, activePage)}
      ${navLink(NAV_ARCHIVE, activePage)}
      ${navLink(NAV_SETTINGS, activePage)}
    </ul>
  </nav>

  <div class="main-column">
    <header class="topbar">
      <button id="sidebar-open" class="icon-btn" aria-label="Avaa valikko">${icon("menu")}</button>
      <span class="topbar-title">${headerTitle}</span>
      ${playerSearch}
    </header>

    <main>
      ${content}
    </main>
  </div>
</div>
<script src="/static/app.js"></script>
</body>
</html>
`;
}
