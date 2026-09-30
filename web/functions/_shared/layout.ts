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

export interface LayoutOptions {
  title: string;
  headerTitle: string;
  activePage: string;
  content: string;
}

const NAV_HOME = { key: "home", href: "/", label: "🏠 Etusivu" };
const NAV_STANDINGS = { key: "standings", href: "/sarjataulukko", label: "📊 Sarjataulukko" };
const NAV_PLAYOFFS = { key: "playoffs", href: "/playoffit", label: "🏆 Playoff-bracket" };
const NAV_ARCHIVE = { key: "archive", href: "/arkisto", label: "🗂️ Arkisto" };

const STATS_PAGES = [
  { key: "league_stats", href: "/tilastot", label: "Pistepörssi" },
  { key: "goalie_stats", href: "/maalivahtiporssi", label: "Maalivahtipörssi" },
  { key: "rookies", href: "/rookiet", label: "Rookie-pörssi" },
  { key: "suomiporssi", href: "/suomiporssi", label: "Suomipörssi" },
];

const GAME_PAGES = [
  { key: "schedule", href: "/otteluohjelma", label: "Otteluohjelma" },
  { key: "primetime", href: "/primetime", label: "Prime time" },
];

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

export function renderLayout(options: LayoutOptions): string {
  const { title, headerTitle, activePage, content } = options;
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<div class="app-shell">
  <div id="backdrop" class="backdrop"></div>

  <nav id="sidebar" class="sidebar" aria-label="Päävalikko">
    <div class="sidebar-header">
      <span class="brand">🏒 Morning Hockey</span>
      <button id="sidebar-close" class="icon-btn" aria-label="Sulje valikko">✕</button>
    </div>
    <ul class="nav-list">
      ${navLink(NAV_HOME, activePage)}
      ${navLink(NAV_STANDINGS, activePage)}
      ${navGroup("stats", "📈 Tilastot", STATS_PAGES, activePage)}
      ${navLink(NAV_PLAYOFFS, activePage)}
      ${navGroup("games", "📅 Ottelut", GAME_PAGES, activePage)}
      ${navLink(NAV_ARCHIVE, activePage)}
    </ul>
  </nav>

  <div class="main-column">
    <header class="topbar">
      <button id="sidebar-open" class="icon-btn" aria-label="Avaa valikko">☰</button>
      <span class="topbar-title">${headerTitle}</span>
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
