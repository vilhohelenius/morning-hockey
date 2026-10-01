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
import type { Env, GameRow, StandingsRow, TeamRosterGoalieRow, TeamRosterSkaterRow } from "./_shared/types";

const WILDCARD_SPOTS_SHOWN = 6;
const WILDCARD_CUTOFF = 2;
const RECENT_RESULTS = 5;
const TOP_SCORERS = 3;
const GAMES_QUERY_LIMIT = 500; // generous window; see module comment
const FORM_GUIDE_WINDOW = 10;

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

function renderTeamRow(row: StandingsRow, rankLabel: string): string {
  return `
    <div class="division-row ${row.qualified ? "qualified" : ""}">
      <span class="division-rank">${rankLabel}</span>
      <button type="button" class="division-team team-trigger" data-team-abbrev="${escapeHtml(row.abbrev)}" data-team-name="${escapeHtml(row.name)}">
        <img src="${escapeHtml(row.logo)}" alt="${escapeHtml(row.abbrev)}" class="division-logo" loading="lazy">
        <span class="division-name">${escapeHtml(row.name)}</span>
        ${row.qualified ? `<span class="playoff-dot"></span>` : ""}
      </button>
      <span class="division-stats cols-6">
        <span>${row.games_played}</span>
        <span>${row.wins}</span>
        <span>${row.losses}</span>
        <span>${row.ot_losses}</span>
        <span>${row.goal_differential > 0 ? "+" : ""}${row.goal_differential}</span>
        <span class="division-points">${row.points}</span>
      </span>
    </div>`;
}

function renderDivisionTable(rows: StandingsRow[]): string {
  return `
  <div class="division-table">
    <div class="division-row division-header">
      <span class="division-rank"></span>
      <span class="division-team">Joukkue</span>
      <span class="division-stats cols-6"><span>O</span><span>V</span><span>H</span><span>JH</span><span>+/-</span><span>P</span></span>
    </div>
    ${rows.map((row) => renderTeamRow(row, String(row.division_rank))).join("")}
  </div>`;
}

function renderWildcardRace(rows: StandingsRow[]): string {
  const shown = rows.slice(0, WILDCARD_SPOTS_SHOWN);
  const rowsHtml = shown
    .map((row, index) => renderTeamRow(row, `VK${row.wildcard_rank}`) + (index + 1 === WILDCARD_CUTOFF ? `<div class="wc-cutoff-line"></div>` : ""))
    .join("");

  return `
  <h3 class="roster-group-title">Villi kortti -taisto</h3>
  <div class="division-table">${rowsHtml}</div>`;
}

// Kuntopuntari ("form guide"): one league-wide table ranked by points
// percentage over each team's last FORM_GUIDE_WINDOW games -- momentum cuts
// across divisions/conferences, so unlike the standings above this isn't
// split by them. Rows reuse .division-row/.team-trigger so clicking a team
// here opens the exact same snapshot popup as the standings tables, for
// free (app.js's click handler just looks for the nearest .division-row).
function renderFormGuideRow(entry: FormGuideEntry, rank: number, team: StandingsRow): string {
  const chips = entry.results
    .map((r) => `<span class="form-chip result-${r.toLowerCase()}">${r === "OTL" ? "OT" : r}</span>`)
    .join("");

  return `
    <div class="division-row">
      <span class="division-rank">${rank}</span>
      <button type="button" class="division-team team-trigger" data-team-abbrev="${escapeHtml(team.abbrev)}" data-team-name="${escapeHtml(team.name)}">
        <img src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.abbrev)}" class="division-logo" loading="lazy">
        <span class="division-name">${escapeHtml(team.name)}</span>
      </button>
      <span class="form-row-stats">
        <span class="form-chips">${chips || "–"}</span>
        <span class="form-record">${entry.wins}-${entry.losses}-${entry.otLosses}</span>
      </span>
    </div>`;
}

function renderFormGuide(entries: FormGuideEntry[], teamsByAbbrev: Map<string, StandingsRow>): string {
  const rowsHtml = entries
    .map((entry, index) => {
      const team = teamsByAbbrev.get(entry.abbrev);
      return team ? renderFormGuideRow(entry, index + 1, team) : "";
    })
    .join("");

  return `
  <div class="division-table">
    <div class="division-row division-header">
      <span class="division-rank"></span>
      <span class="division-team">Joukkue</span>
      <span class="form-row-stats"><span>Viimeiset ${FORM_GUIDE_WINDOW} ottelua</span></span>
    </div>
    ${rowsHtml}
  </div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: rows } = await db
    .prepare("SELECT * FROM standings_rows ORDER BY conference, division, division_rank")
    .all<StandingsRow>();

  const asOfDate = rows[0]?.as_of_date ?? "";

  const conferenceNames = [...new Set(rows.map((r) => r.conference))].sort();

  const sections = conferenceNames
    .map((conferenceName) => {
      const conferenceRows = rows.filter((r) => r.conference === conferenceName);
      const divisionNames = [...new Set(conferenceRows.map((r) => r.division))].sort();

      const divisionTables = divisionNames
        .map((divisionName) => {
          const divisionRows = conferenceRows.filter((r) => r.division === divisionName);
          return `
  <h3 class="roster-group-title">${escapeHtml(divisionName)}</h3>
  ${renderDivisionTable(divisionRows)}`;
        })
        .join("");

      const wildcardRows = conferenceRows
        .filter((r) => r.wildcard_rank > 0)
        .sort((a, b) => a.wildcard_rank - b.wildcard_rank);

      return `
<section>
  <h2 class="section-title">${escapeHtml(conferenceName)}-konferenssi</h2>
  ${divisionTables}
  ${renderWildcardRace(wildcardRows)}
</section>`;
    })
    .join("");

  const { snapshots, recentGames } = await buildSnapshots(db, rows.map((r) => r.abbrev));
  // Same defensive escape render.py's _game_details_json already applies:
  // a stray "</script" inside embedded JSON (team/player names are NHL
  // data, not user input, but this costs nothing) can't close the tag early.
  const snapshotsJson = JSON.stringify(snapshots).replace(/<\//g, "<\\/");

  const teamsByAbbrev = new Map(rows.map((r) => [r.abbrev, r]));
  const formGuideEntries = computeFormGuide(recentGames, rows.map((r) => r.abbrev), FORM_GUIDE_WINDOW);

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
  ${sections}
</section>

<section class="sarjataulukko-view-section is-hidden" data-view="form">
  <p class="standings-legend">Joukkueet järjestetty pisteprosentin mukaan viimeisten ${FORM_GUIDE_WINDOW} ottelun
    ajalta. Klikkaa joukkuetta nähdäksesi sen viimeisimmät ottelut, pistepörssin ja seuraavan ottelun.</p>
  ${renderFormGuide(formGuideEntries, teamsByAbbrev)}
</section>

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
