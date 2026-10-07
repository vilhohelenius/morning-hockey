// Edistyneet tilastot: xG / GSAx / team xGF% leaders for the latest season,
// straight from the sync_xg tables. Three tabs toggled client-side (the
// analytiikka-view-picker pill wiring in app.js).

import { icon, escapeHtml, nationalityFlag, seasonLabel, teamLogoUrl } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import { COLLAPSE_AT, expandToggle } from "./_shared/leaderboard";
import type { Env, StandingsRow } from "./_shared/types";
import { fetchLeagueTeamXg, formatGsax, formatXg, gsaxPer100, rankedTeamXg, XG_INFO_TEXT, xgfPct, xgPercent } from "./_shared/xg";

const MIN_GAMES = 5; // early-season friendly; raise as the season goes on

interface SkaterRow {
  player_id: number;
  name: string;
  headshot: string;
  team_abbrev: string;
  nationality: string;
  position: string;
  gp: number;
  xg: number;
  goals: number;
  xgf: number | null;
  xga: number | null;
}

interface GoalieRow {
  player_id: number;
  name: string;
  headshot: string;
  team_abbrev: string;
  nationality: string;
  gp: number;
  gsax: number;
  sa: number;
}

const teamLogo = (abbrev: string) =>
  `<img src="${escapeHtml(teamLogoUrl(abbrev))}" alt="${escapeHtml(abbrev)}" class="table-team-logo" loading="lazy">`;

// meta is trusted HTML (flag/logo markup), callers escape any raw values.
const playerCell = (id: number, name: string, headshot: string, meta: string) => `
  <a href="/pelaajat/${id}" class="player-cell">
    <img src="${escapeHtml(headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
    <span class="player-name">
      <span class="player-name-line">${escapeHtml(name)}</span>
      <span class="player-meta">${meta}</span>
    </span>
  </a>`;

// Same markup as the Pistepörssi tables (porssi-table, click-to-sort headers,
// "show 25 more" paging). head items: [label, sortKey?]; the last-sorted-by-
// default column carries data-rank (the SQL order), like leaderboard.ts.
const table = (id: string, head: [string, string?][], rows: string, count: number) => `
  <div class="stats-table-wrap"><table class="stats-table porssi-table" id="${id}" data-collapse-at="${count ? COLLAPSE_AT : 0}"><thead><tr>${head
    .map(([h, key]) =>
      key === "rank" ? `<th data-sort="rank" data-first-dir="asc" class="sort-asc">${h}</th>`
      : key === "name" ? `<th data-sort="name" data-type="text">${h}</th>`
      : key === "xga" ? `<th data-sort="xga" data-first-dir="asc">${h}</th>` // fewer chances against = better
      : key ? `<th data-sort="${key}">${h}</th>` : `<th${h === "#" ? ' class="col-rank"' : ""}>${h}</th>`)
    .join("")}</tr></thead><tbody>${rows}</tbody></table></div>
  ${expandToggle(id, count)}`;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const [{ results: skaters }, { results: goalies }, { results: standings }, league, season] = await Promise.all([
    db
      .prepare(
        `SELECT s.player_id, s.name, s.headshot, s.team_abbrev, s.nationality, s.position, s.games_played AS gp,
                SUM(x.xg) AS xg, SUM(x.goals) AS goals, o.xgf, o.xga
         FROM skater_game_xg x
         JOIN skater_season_stats s ON s.player_id = x.player_id AND s.season_id = x.season
         LEFT JOIN (SELECT player_id, SUM(xgf) AS xgf, SUM(xga) AS xga FROM skater_game_onice_xg
                    WHERE season = (SELECT MAX(season) FROM skater_game_xg) GROUP BY player_id) o ON o.player_id = x.player_id
         WHERE x.season = (SELECT MAX(season) FROM skater_game_xg) AND s.games_played >= MIN(?, (SELECT MAX(games_played) FROM skater_season_stats))
         GROUP BY x.player_id ORDER BY xg DESC`,
      )
      .bind(MIN_GAMES)
      .all<SkaterRow>(),
    db
      .prepare(
        `SELECT s.player_id, s.name, s.headshot, s.team_abbrev, s.nationality, s.games_played AS gp,
                SUM(x.xga) - SUM(x.goals_against) AS gsax, SUM(x.shots_against) AS sa
         FROM goalie_game_xg x
         JOIN goalie_season_stats s ON s.player_id = x.player_id AND s.season_id = x.season
         WHERE x.season = (SELECT MAX(season) FROM goalie_game_xg) AND s.games_played >= MIN(?, (SELECT MAX(games_played) FROM goalie_season_stats))
         GROUP BY x.player_id ORDER BY gsax DESC`,
      )
      .bind(MIN_GAMES)
      .all<GoalieRow>(),
    db.prepare("SELECT * FROM standings_rows").all<StandingsRow>(),
    fetchLeagueTeamXg(db),
    db.prepare("SELECT MAX(season) AS s FROM skater_game_xg").first<{ s: number | null }>(),
  ]);

  const skaterRows = skaters
    .map(
      (p, i) => {
        const pct = p.xgf !== null && p.xga !== null ? xgfPct(p.xgf, p.xga) : null;
        return `<tr data-name="${escapeHtml(p.name)}" data-gp="${p.gp}" data-goals="${p.goals}" data-xg="${p.xg}"
      data-xgpg="${p.xg / p.gp}" data-xgf="${pct ?? -1}" data-rank="${i + 1}">
    <td class="col-rank">${i + 1}</td>
    <td>${playerCell(p.player_id, p.name, p.headshot, `${nationalityFlag(p.nationality)} ${escapeHtml(p.nationality)} · ${escapeHtml(p.position)} · ${teamLogo(p.team_abbrev)}`)}</td>
    <td>${p.gp}</td><td>${p.goals}</td><td class="stat-strong">${formatXg(p.xg)}</td>
    <td>${(p.xg / p.gp).toFixed(2)}</td>
    <td>${pct !== null && p.xgf !== null && p.xga !== null ? xgPercent(p.xgf, p.xga) : "–"}</td>
  </tr>`;
      },
    )
    .join("");

  const goalieRows = goalies
    .map((g, i) => {
      const per100 = gsaxPer100(g.gsax, g.sa);
      return `<tr data-name="${escapeHtml(g.name)}" data-gp="${g.gp}" data-gsax="${g.gsax}" data-gsax100="${per100 ?? -1000}"
      data-sa="${g.sa}" data-rank="${i + 1}">
    <td class="col-rank">${i + 1}</td>
    <td>${playerCell(g.player_id, g.name, g.headshot, `${nationalityFlag(g.nationality)} ${escapeHtml(g.nationality)} · ${teamLogo(g.team_abbrev)}`)}</td>
    <td>${g.gp}</td><td class="stat-strong">${formatGsax(g.gsax)}</td><td>${per100 === null ? "–" : formatGsax(per100, 2)}</td><td>${g.sa}</td>
  </tr>`;
    })
    .join("");

  const names = new Map(standings.map((s) => [s.abbrev, s]));
  const teamRows = rankedTeamXg(league)
    .map((t, i) => {
      const s = names.get(t.abbrev);
      return `<tr data-name="${escapeHtml(s?.name ?? t.abbrev)}" data-xgf="${t.xgf}" data-xga="${t.xga}" data-rank="${i + 1}">
    <td class="col-rank">${i + 1}</td>
    <td><a href="/joukkueet/${t.abbrev.toLowerCase()}" class="player-cell">${s ? `<img src="${escapeHtml(s.logo)}" alt="" class="team-logo-plain" loading="lazy">` : ""}<span class="player-name"><span class="player-name-line">${escapeHtml(s?.name ?? t.abbrev)}</span></span></a></td>
    <td>${t.games}</td><td class="stat-strong">${t.pct.toFixed(1)}</td>
    <td>${t.xgf.toFixed(1)}</td><td>${t.xga.toFixed(1)}</td>
  </tr>`;
    })
    .join("");

  const empty = `<p class="empty-note">Ei vielä dataa.</p>`;
  const content = `
<header class="page-header">
  <h1>${icon("analytics")} Edistyneet tilastot</h1>
  <p class="subtitle">Kausi ${season?.s ? escapeHtml(seasonLabel(season.s)) : ""} · runkosarja</p>
</header>

${XG_INFO_TEXT}

<div class="analytiikka-view-picker">
  <button type="button" class="day-pill active" data-view="skaters">Pelaajat</button>
  <button type="button" class="day-pill" data-view="goalies">Maalivahdit</button>
  <button type="button" class="day-pill" data-view="teams">Joukkueet</button>
</div>

<section class="analytiikka-view-section" data-view="skaters">
  <h2 class="section-title">Kärki xG:n mukaan</h2>
  <p class="standings-legend">Vähintään ${MIN_GAMES} ottelua. Napauta sarakeotsikkoa järjestääksesi. xG/O = xG per ottelu, xGF% = joukkueen xG-osuus pelaajan ollessa jäällä.</p>
  ${skaterRows ? table("xg-skaters-table", [["#"], ["Pelaaja", "name"], ["O", "gp"], ["M", "goals"], ["xG", "rank"], ["xG/O", "xgpg"], ["xGF%", "xgf"]], skaterRows, skaters.length) : empty}
</section>

<section class="analytiikka-view-section is-hidden" data-view="goalies">
  <h2 class="section-title">Kärki GSAx:n mukaan</h2>
  <p class="standings-legend">Vähintään ${MIN_GAMES} ottelua. Napauta sarakeotsikkoa järjestääksesi. GSAx/100 näytetään vasta 300 laukauksen jälkeen.</p>
  ${goalieRows ? table("xg-goalies-table", [["#"], ["Maalivahti", "name"], ["O", "gp"], ["GSAx", "rank"], ["GSAx/100", "gsax100"], ["L", "sa"]], goalieRows, goalies.length) : empty}
</section>

<section class="analytiikka-view-section is-hidden" data-view="teams">
  <h2 class="section-title">Joukkueet xGF%:n mukaan</h2>
  <p class="standings-legend">xGF ja xGA per ottelu. Napauta sarakeotsikkoa järjestääksesi.</p>
  ${teamRows ? table("xg-teams-table", [["#"], ["Joukkue", "name"], ["O"], ["xGF%", "rank"], ["xGF", "xgf"], ["xGA", "xga"]], teamRows, 0) : empty}
</section>
`;

  const html = await renderLayout({
    title: "Edistyneet tilastot · Morning Hockey",
    headerTitle: "Edistyneet tilastot",
    activePage: "xstats",
    content,
    request: context.request,
    env: context.env,
  });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
