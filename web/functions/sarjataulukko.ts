// Sarjataulukko (standings). Division tables + wildcard race come from
// standings_rows (phase 4). The click-a-team snapshot popup (recent
// results/top scorers/next game) needed team_roster_skaters/
// team_roster_goalies, which didn't exist until phase 6 -- see that
// commit for why skater_season_stats/goalie_season_stats (global top-N
// cuts) couldn't back a *per-team* top-3/starting-goalie lookup.
//
// Rather than one query per team per data kind (32 teams x 4 = 128 round
// trips), each snapshot ingredient is fetched once for every team and
// grouped in TS: still fast against D1's native binding, but the more
// obvious approach doesn't scale the same way through the HTTP API the
// Python sync side uses.

import { computeFormGuide, type FormGuideEntry } from "./_shared/formGuide";
import { escapeHtml, humanDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import { TEAM_COLORS } from "./_shared/teamColors";
import { buildWildCardView, formatPointsPct, sortStandings } from "./_shared/standingsViews";
import type { Env, GameRow, StandingsRow, TeamRosterGoalieRow, TeamRosterSkaterRow } from "./_shared/types";

const WILDCARD_SPOTS_SHOWN = 6;
const WILDCARD_CUTOFF = 2;
const RECENT_RESULTS = 5;
const TOP_SCORERS = 3;
const GAMES_QUERY_LIMIT = 500; // generous window; see module comment
const FORM_WINDOWS = [10, 5];
const FORM_SCOPES = [
  { key: "division", label: "Divisioona" },
  { key: "conference", label: "Konferenssi" },
  { key: "league", label: "Liiga" },
];
const VENUES = [
  { key: "all", label: "Kaikki" },
  { key: "home", label: "Koti" },
  { key: "away", label: "Vieras" },
];

interface TeamSnapshot {
  recent_results: { result: "W" | "L" | "OTL"; opponent_abbrev: string }[];
  top_scorers: { name: string; headshot: string; goals: number; assists: number; points: number }[];
  starting_goalie: { name: string; headshot: string; games_played: number; save_pct: number } | null;
  next_game: { date: string; is_home: boolean; opponent_logo: string; opponent_abbrev: string } | null;
}

interface SnapshotsResult {
  snapshots: Record<string, TeamSnapshot>;
  // Exposed so the caller can also feed it into computeFormGuide without a
  // second identical D1 query.
  recentGames: GameRow[];
}

async function buildSnapshots(db: D1Database, abbrevs: string[]): Promise<SnapshotsResult> {
  const [{ results: recentGames }, { results: upcomingGames }, { results: skaters }, { results: goalies }] =
    await Promise.all([
      db
        .prepare("SELECT * FROM games WHERE is_finished = 1 ORDER BY date DESC LIMIT ?")
        .bind(GAMES_QUERY_LIMIT)
        .all<GameRow>(),
      db
        .prepare("SELECT * FROM games WHERE is_finished = 0 ORDER BY date ASC LIMIT ?")
        .bind(GAMES_QUERY_LIMIT)
        .all<GameRow>(),
      db.prepare("SELECT * FROM team_roster_skaters ORDER BY team_abbrev, points DESC, goals DESC").all<TeamRosterSkaterRow>(),
      db
        .prepare("SELECT * FROM team_roster_goalies ORDER BY team_abbrev, games_played DESC, save_pct DESC")
        .all<TeamRosterGoalieRow>(),
    ]);

  const snapshots: Record<string, TeamSnapshot> = {};

  for (const abbrev of abbrevs) {
    const recent_results = recentGames
      .filter((g) => g.away_abbrev === abbrev || g.home_abbrev === abbrev)
      .slice(0, RECENT_RESULTS)
      .map((g) => {
        const isHome = g.home_abbrev === abbrev;
        const teamScore = isHome ? g.home_score : g.away_score;
        const opponentScore = isHome ? g.away_score : g.home_score;
        const opponent_abbrev = isHome ? g.away_abbrev : g.home_abbrev;
        const result = (teamScore > opponentScore ? "W" : g.final_type !== "REG" ? "OTL" : "L") as "W" | "L" | "OTL";
        return { result, opponent_abbrev };
      });

    const top_scorers = skaters
      .filter((s) => s.team_abbrev === abbrev)
      .slice(0, TOP_SCORERS)
      .map((s) => ({ name: s.name, headshot: s.headshot, goals: s.goals, assists: s.assists, points: s.points }));

    const startingGoalie = goalies.find((g) => g.team_abbrev === abbrev);
    const starting_goalie = startingGoalie
      ? {
          name: startingGoalie.name,
          headshot: startingGoalie.headshot,
          games_played: startingGoalie.games_played,
          save_pct: startingGoalie.save_pct,
        }
      : null;

    const nextGameRow = upcomingGames.find((g) => g.away_abbrev === abbrev || g.home_abbrev === abbrev);
    const next_game = nextGameRow
      ? {
          date: nextGameRow.date,
          is_home: nextGameRow.home_abbrev === abbrev,
          opponent_logo: nextGameRow.home_abbrev === abbrev ? nextGameRow.away_logo : nextGameRow.home_logo,
          opponent_abbrev: nextGameRow.home_abbrev === abbrev ? nextGameRow.away_abbrev : nextGameRow.home_abbrev,
        }
      : null;

    snapshots[abbrev] = { recent_results, top_scorers, starting_goalie, next_game };
  }

  return { snapshots, recentGames };
}

// Table-based standings (NHL-app look): first cell (rank + logo + abbrev) is
// sticky, the stat columns scroll horizontally. Rows carry .stand-row (the
// snapshot popup in app.js finds its anchor via .division-row or .stand-row)
// and keep the .team-trigger button.
const STAND_HEADERS = ["O", "V", "H", "JH", "P", "P%", "+/-"];
const STAND_TOTAL_COLS = 1 + STAND_HEADERS.length;

function renderStandRow(row: StandingsRow, rankLabel: string): string {
  const diff = `${row.goal_differential > 0 ? "+" : ""}${row.goal_differential}`;
  return `
      <tr class="stand-row ${row.qualified ? "qualified" : ""}" style="--tc:${TEAM_COLORS[row.abbrev] ?? "var(--accent)"}">
        <td class="st-first"><span class="st-rank">${escapeHtml(rankLabel)}</span><button type="button" class="team-trigger st-team" data-team-abbrev="${escapeHtml(row.abbrev)}" data-team-name="${escapeHtml(row.name)}"><img src="${escapeHtml(row.logo)}" alt="" class="st-logo" loading="lazy"><span class="st-abbrev">${escapeHtml(row.abbrev)}</span>${row.qualified ? `<span class="playoff-dot"></span>` : ""}</button></td>
        <td>${row.games_played}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td>${row.ot_losses}</td>
        <td class="st-pts">${row.points}</td>
        <td>${formatPointsPct(row.points, row.games_played)}</td>
        <td>${diff}</td>
      </tr>`;
}

// `rowsHtml` is pre-rendered so callers can splice a cutoff line in.
function renderStandTable(title: string, rowsHtml: string): string {
  const headCells = STAND_HEADERS.map((h) => `<th${h === "P" ? ` class="st-active"` : ""}>${h}${h === "P" ? `<span class="st-arrow"></span>` : ""}</th>`).join("");
  return `
  <div class="stand-scroll">
    <table class="stand-table">
      <thead><tr><th class="st-first">${escapeHtml(title)}</th>${headCells}</tr></thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>
  </div>`;
}

function renderRanked(title: string, rows: StandingsRow[]): string {
  return renderStandTable(title, rows.map((row, i) => renderStandRow(row, String(i + 1))).join(""));
}

function renderWildcardRace(rows: StandingsRow[]): string {
  const rowsHtml = rows
    .slice(0, WILDCARD_SPOTS_SHOWN)
    .map(
      (row, index) =>
        renderStandRow(row, `VK${row.wildcard_rank}`) +
        (index + 1 === WILDCARD_CUTOFF
          ? `<tr class="stand-cutoff"><td colspan="${STAND_TOTAL_COLS}"><div class="wc-cutoff-line"></div></td></tr>`
          : ""),
    )
    .join("");
  return renderStandTable("Villi kortti -taisto", rowsHtml);
}

// Kuntopuntari ("form guide"): one league-wide table ranked by points
// percentage over each team's last FORM_GUIDE_WINDOW games -- momentum cuts
// across divisions/conferences, so unlike the standings above this isn't
// split by them. Rows reuse .division-row/.team-trigger so clicking a team
// here opens the exact same snapshot popup as the standings tables, for
// free (app.js's click handler just looks for the nearest .division-row).
function renderFormGuideRow(entry: FormGuideEntry, rank: number, team: StandingsRow, windowSize: number): string {
  const chips = entry.results
    .map((r) => `<span class="form-chip result-${r.toLowerCase()}">${r === "OTL" ? "OT" : r}</span>`)
    .join("");
  // Always FORM_GUIDE_WINDOW slots so rows line up, empty ones early in the season.
  const empty = `<span class="form-chip is-empty"></span>`.repeat(Math.max(0, windowSize - entry.results.length));

  return `
    <div class="division-row form-row" style="--tc:${TEAM_COLORS[team.abbrev] ?? "var(--accent)"}">
      <span class="division-rank">${rank}</span>
      <button type="button" class="division-team team-trigger" data-team-abbrev="${escapeHtml(team.abbrev)}" data-team-name="${escapeHtml(team.name)}">
        <img src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.abbrev)}" class="division-logo" loading="lazy">
        <span class="division-name">${escapeHtml(team.name)}</span>
      </button>
      <span class="form-summary">
        <span class="form-record">${entry.wins}-${entry.losses}-${entry.otLosses}</span>
        <span class="form-points">${entry.points}<small>/${entry.maxPoints} p</small></span>
      </span>
      <span class="form-chips" style="--n:${windowSize}">${empty}${chips}</span>
      <span class="form-bar" aria-hidden="true"><i style="width:${Math.round(entry.pointsPct * 100)}%"></i></span>
    </div>`;
}

function renderFormTable(entries: FormGuideEntry[], teamsByAbbrev: Map<string, StandingsRow>, windowSize: number, title = ""): string {
  const rowsHtml = entries
    .map((entry, index) => {
      const team = teamsByAbbrev.get(entry.abbrev);
      return team ? renderFormGuideRow(entry, index + 1, team, windowSize) : "";
    })
    .join("");

  return `
  <div class="form-block">
  ${title ? `<h2 class="section-title">${escapeHtml(title)}</h2>` : ""}
  <div class="division-table">
    <div class="division-row division-header">
      <span class="division-rank"></span>
      <span class="division-team">Joukkue</span>
      <span class="form-summary"><span>Viimeiset ${windowSize} ottelua</span></span>
    </div>
    ${rowsHtml}
  </div>
  </div>`;
}

// One pre-rendered section per (window, scope); the inline script on the page
// just shows the one matching the active pills.
function renderFormGuide(recentGames: GameRow[], teamsByAbbrev: Map<string, StandingsRow>): string {
  const teams = [...teamsByAbbrev.values()];
  const groupBy = (key: (t: StandingsRow) => string) => [...new Set(teams.map(key))].sort();
  return FORM_WINDOWS.flatMap((w) => {
    const entries = computeFormGuide(recentGames, teams.map((t) => t.abbrev), w);
    const tables = (scope: string): string => {
      if (scope === "league") return renderFormTable(entries, teamsByAbbrev, w);
      const key = scope === "conference" ? (t: StandingsRow) => t.conference : (t: StandingsRow) => `${t.conference}|${t.division}`;
      return groupBy(key)
        .map((g) =>
          renderFormTable(
            entries.filter((e) => teamsByAbbrev.get(e.abbrev) && key(teamsByAbbrev.get(e.abbrev)!) === g),
            teamsByAbbrev,
            w,
            scope === "conference" ? `${g}-konferenssi` : g.split("|")[1],
          ),
        )
        .join("");
    };
    return FORM_SCOPES.map(
      (sc) => `<div class="form-sec${w === 10 && sc.key === "league" ? "" : " is-hidden"}" data-win="${w}" data-scope="${sc.key}">${tables(sc.key)}</div>`,
    );
  }).join("");
}

// Home/away standings derived from the finished games (standings_rows only
// has overall numbers). Same row shape, so the normal renderers work.
function venueRows(rows: StandingsRow[], games: GameRow[], venue: "home" | "away"): StandingsRow[] {
  const by = new Map(rows.map((r) => [r.abbrev, { ...r, games_played: 0, wins: 0, losses: 0, ot_losses: 0, points: 0, goal_differential: 0, qualified: 0 }]));
  for (const g of games) {
    const abbrev = venue === "home" ? g.home_abbrev : g.away_abbrev;
    const r = by.get(abbrev);
    if (!r) continue;
    const mine = venue === "home" ? g.home_score : g.away_score;
    const theirs = venue === "home" ? g.away_score : g.home_score;
    r.games_played++;
    r.goal_differential += mine - theirs;
    if (mine > theirs) { r.wins++; r.points += 2; }
    else if (g.final_type !== "REG") { r.ot_losses++; r.points += 1; }
    else r.losses++;
  }
  return [...by.values()];
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: rows } = await db
    .prepare("SELECT * FROM standings_rows ORDER BY conference, division, division_rank")
    .all<StandingsRow>();

  const asOfDate = rows[0]?.as_of_date ?? "";

  const conferenceNames = [...new Set(rows.map((r) => r.conference))].sort();

  const confHeading = (name: string) => `<h2 class="section-title">${escapeHtml(name)}-konferenssi</h2>`;

  const { results: finishedGames } = await db
    .prepare("SELECT away_abbrev, home_abbrev, away_score, home_score, final_type FROM games WHERE is_finished = 1")
    .all<GameRow>();

  const buildViews = (data: StandingsRow[], overall: boolean) => {
    const divisionView = conferenceNames
      .map((conferenceName) => {
        const conferenceRows = data.filter((r) => r.conference === conferenceName);
        const divisionNames = [...new Set(conferenceRows.map((r) => r.division))].sort();
        const tables = divisionNames
          .map((d) => {
            const divRows = conferenceRows.filter((r) => r.division === d);
            return renderRanked(d, overall ? divRows.sort((a, b) => a.division_rank - b.division_rank) : sortStandings(divRows));
          })
          .join("");
        return `<section>${confHeading(conferenceName)}${tables}</section>`;
      })
      .join("");
    const conferenceView = conferenceNames
      .map((c) => `<section>${confHeading(c)}${renderRanked("Konferenssi", sortStandings(data.filter((r) => r.conference === c)))}</section>`)
      .join("");
    return { division: divisionView, conference: conferenceView, league: renderRanked("Liiga", sortStandings(data)) };
  };

  const venueViews = {
    all: buildViews(rows, true),
    home: buildViews(venueRows(rows, finishedGames, "home"), false),
    away: buildViews(venueRows(rows, finishedGames, "away"), false),
  };

  const wildCardView = buildWildCardView(rows)
    .map((conf) => {
      const leaderTables = conf.leaders.map((l) => renderRanked(l.division, l.rows)).join("");
      return `<section>${confHeading(conf.conference)}${leaderTables}${renderWildcardRace(conf.race)}</section>`;
    })
    .join("");

  const venueSections = (view: "division" | "conference" | "league") =>
    VENUES.map((v) => `<div class="venue-sec${v.key === "all" ? "" : " is-hidden"}" data-venue="${v.key}">${venueViews[v.key as "all"][view]}</div>`).join("");
  const tabs: { key: string; label: string; html: string }[] = [
    { key: "wildcard", label: "Wild Card", html: wildCardView },
    { key: "division", label: "Divisioona", html: venueSections("division") },
    { key: "conference", label: "Konferenssi", html: venueSections("conference") },
    { key: "league", label: "Liiga", html: venueSections("league") },
  ];
  const tabButtons = tabs
    .map((t) => `<button type="button" class="standings-tab${t.key === "division" ? " active" : ""}" data-tab="${t.key}">${t.label}</button>`)
    .join("");
  const sections = tabs
    .map((t) => `<div class="standings-tab-section${t.key === "division" ? "" : " is-hidden"}" data-tab="${t.key}">${t.html}</div>`)
    .join("");

  const { snapshots, recentGames } = await buildSnapshots(db, rows.map((r) => r.abbrev));
  // Same defensive escape render.py's _game_details_json already applies:
  // a stray "</script" inside embedded JSON (team/player names are NHL
  // data, not user input, but this costs nothing) can't close the tag early.
  const snapshotsJson = JSON.stringify(snapshots).replace(/<\//g, "<\\/");

  const teamsByAbbrev = new Map(rows.map((r) => [r.abbrev, r]));

  const content = `
<header class="page-header">
  <h1>Sarjataulukko</h1>
  <p class="subtitle">Tilanne ${asOfDate ? escapeHtml(humanDate(asOfDate)) : ""}</p>
</header>

<div class="sarjataulukko-view-picker">
  <button type="button" class="day-pill active" data-view="standings">Sarjataulukko</button>
  <button type="button" class="day-pill" data-view="form">Kuntopuntari</button>
</div>

<section class="sarjataulukko-view-section" data-view="standings">
  <p class="standings-legend"><span class="playoff-dot"></span> mahtuisi pudotuspeleihin tänään</p>
  <p class="standings-legend">Klikkaa joukkuetta nähdäksesi sen viimeisimmät ottelut, pistepörssin
    ja seuraavan ottelun.</p>
  <div class="standings-tab-picker" role="tablist">${tabButtons}</div>
  <div class="tab-bar" id="venue-picker">${VENUES.map((x) => `<button type="button" class="standings-tab${x.key === "all" ? " active" : ""}" data-venue="${x.key}">${x.label}</button>`).join("")}</div>
  ${sections}
</section>

<section class="sarjataulukko-view-section is-hidden" data-view="form">
  <p class="standings-legend">Joukkueet järjestetty pisteprosentin mukaan viimeisten ottelujen ajalta.
    Klikkaa joukkuetta nähdäksesi sen viimeisimmät ottelut, pistepörssin ja seuraavan ottelun.</p>
  <div class="tab-bar" id="form-win-picker">${FORM_WINDOWS.map((w) => `<button type="button" class="standings-tab${w === 10 ? " active" : ""}" data-win="${w}">${w} ottelua</button>`).join("")}</div>
  <div class="tab-bar" id="form-scope-picker">${FORM_SCOPES.map((x) => `<button type="button" class="standings-tab${x.key === "league" ? " active" : ""}" data-scope="${x.key}">${x.label}</button>`).join("")}</div>
  ${renderFormGuide(recentGames, teamsByAbbrev)}
</section>

<script>
(function () {
  // Pill groups -> show the matching pre-rendered section(s).
  function wire(pickerId, sectionSel, key) {
    var picker = document.getElementById(pickerId);
    if (!picker) return;
    picker.addEventListener("click", function (e) {
      var pill = e.target.closest(".standings-tab");
      if (!pill) return;
      picker.querySelectorAll(".standings-tab").forEach(function (p) { p.classList.toggle("active", p === pill); });
      sync();
    });
  }
  function active(id, key) {
    var el = document.querySelector("#" + id + " .standings-tab.active");
    return el && el.dataset[key];
  }
  function sync() {
    var v = active("venue-picker", "venue");
    document.querySelectorAll(".venue-sec").forEach(function (s) { s.classList.toggle("is-hidden", s.dataset.venue !== v); });
    var w = active("form-win-picker", "win"), sc = active("form-scope-picker", "scope");
    document.querySelectorAll(".form-sec").forEach(function (s) { s.classList.toggle("is-hidden", s.dataset.win !== w || s.dataset.scope !== sc); });
  }
  wire("venue-picker"); wire("form-win-picker"); wire("form-scope-picker");
  // Wild Card is always the overall table, so the venue pills don't apply there.
  var venue = document.getElementById("venue-picker");
  document.querySelector(".standings-tab-picker").addEventListener("click", function (e) {
    var tab = e.target.closest(".standings-tab");
    if (tab) venue.hidden = tab.dataset.tab === "wildcard";
  });
})();
</script>

<script id="team-snapshots" type="application/json">${snapshotsJson}</script>
`;

  const html = await renderLayout({
    title: "Sarjataulukko · Morning Hockey",
    headerTitle: "Sarjataulukko",
    activePage: "standings",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
