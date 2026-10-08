// Suomipörssi, phase 4. Reads finnish_skater_stats/finnish_goalie_stats --
// deliberately separate tables from skater_season_stats/goalie_season_stats,
// see the d1/schema.sql comment and the commit that added them: this page
// needs every Finnish player, not the overall top-N cut those hold.
//
// Unlike Tilastot/Rookie-pörssi, there's no position filter here (every row
// is already Finnish, no further split makes sense) and no Finnish
// highlight dot (it would mark every row; only the favorite-team dot shows). Bespoke table markup rather
// than reusing _shared/leaderboard.ts, which assumes both of those.

import { favoriteTeamAbbrevs, readHighlightsCookie } from "./_shared/auth";
import { flagImg, icon, escapeHtml, formatToi, positionTag, seasonLabel } from "./_shared/format";
import { highlightDots, type HighlightOptions } from "./_shared/leaderboard";
import { renderLayout } from "./_shared/layout";
import { fetchGoaliesSeasonGsaxMap, formatGsax, formatPct, xgfPct } from "./_shared/xg";
import type { Env, FinnishGoalieRow, FinnishSkaterRow } from "./_shared/types";

// +/- and avg TOI come from team_roster_skaters (same D1 sync, no API call);
// PIM is finnish_skater_stats.penalty_minutes.
interface Extra {
  plusMinus?: number;
  toi?: number;
  pim?: number;
  xgf?: number;
  xgf5?: number;
}

async function fetchExtras(db: D1Database, rows: FinnishSkaterRow[]): Promise<Map<number, Extra>> {
  const extras = new Map<number, Extra>();
  if (!rows.length) return extras;
  const get = (id: number) => extras.get(id) ?? extras.set(id, {}).get(id)!;
  const season = rows[0].season_id;
  try {
    const { results } = await db.prepare("SELECT player_id, plus_minus, avg_toi_seconds FROM team_roster_skaters").all<{ player_id: number; plus_minus: number; avg_toi_seconds: number }>();
    for (const r of results) Object.assign(get(r.player_id), { plusMinus: r.plus_minus, toi: r.avg_toi_seconds });
  } catch (error) {
    console.error("Suomipörssi roster lookup failed:", error);
  }
  try {
    const { results } = await db
      .prepare("SELECT player_id, SUM(xgf) AS xgf, SUM(xga) AS xga, SUM(xgf_5v5) AS xgf5, SUM(xga_5v5) AS xga5 FROM skater_game_onice_xg WHERE season = ? GROUP BY player_id")
      .bind(season)
      .all<{ player_id: number; xgf: number; xga: number; xgf5: number; xga5: number }>();
    for (const r of results) Object.assign(get(r.player_id), { xgf: xgfPct(r.xgf, r.xga) ?? undefined, xgf5: xgfPct(r.xgf5, r.xga5) ?? undefined });
  } catch (error) {
    console.error("Suomipörssi on-ice xG lookup failed:", error);
  }
  // 0 for everyone = the penalty_minutes column hasn't been synced yet
  if (rows.some((row) => row.penalty_minutes > 0)) for (const row of rows) get(row.player_id).pim = row.penalty_minutes;
  return extras;
}

function renderSkaterTable(rows: FinnishSkaterRow[], hl: HighlightOptions, extras: Map<number, Extra>): string {
  const num = (v: number | undefined) => (v === undefined ? -1 : v);
  const body = rows
    .map((row, index) => {
      const x = extras.get(row.player_id) ?? {};
      return `
      <tr data-name="${escapeHtml(row.name)}" data-team="${escapeHtml(row.team_abbrev)}"
          data-gp="${row.games_played}" data-goals="${row.goals}" data-assists="${row.assists}" data-rank="${index + 1}"
          data-plusminus="${x.plusMinus ?? -999}" data-toi="${num(x.toi)}" data-pim="${num(x.pim)}" data-xgf="${num(x.xgf)}" data-xgf5="${num(x.xgf5)}">
        <td class="col-rank">${index + 1}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              <span class="player-name-line">${escapeHtml(row.name)}${highlightDots("", row.team_abbrev, hl)}</span>
              <span class="player-meta">${positionTag(row.position)} · <img src="${escapeHtml(row.logo)}" alt="${escapeHtml(row.team_abbrev)}" class="table-team-logo" loading="lazy"></span>
            </span>
          </a>
        </td>
        <td>${row.games_played}</td>
        <td>${row.goals}</td>
        <td>${row.assists}</td>
        <td class="stat-strong">${row.points}</td>
        <td>${x.plusMinus === undefined ? "–" : (x.plusMinus > 0 ? "+" : "") + x.plusMinus}</td>
        <td>${x.toi === undefined ? "–" : formatToi(x.toi)}</td>
        <td>${x.pim ?? "–"}</td>
        <td>${formatPct(x.xgf ?? null)}</td>
        <td>${formatPct(x.xgf5 ?? null)}</td>
      </tr>`;
    })
    .join("");

  return `
  <div class="stats-table-wrap">
    <table class="stats-table porssi-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="gp">O</th>
          <th data-sort="goals">M</th>
          <th data-sort="assists">S</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">P</th>
          <th data-sort="plusminus">+/-</th>
          <th data-sort="toi">KA</th>
          <th data-sort="pim">JM</th>
          <th data-sort="xgf">xGF%</th>
          <th data-sort="xgf5">xGF% 5v5</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderGoalieTable(rows: FinnishGoalieRow[], hl: HighlightOptions, gsax: Map<number, number>): string {
  const withGsax = gsax.size > 0;
  const body = rows
    .map(
      (row, index) => `
      <tr data-name="${escapeHtml(row.name)}" data-team="${escapeHtml(row.team_abbrev)}"
          data-wins="${row.wins}" data-losses="${row.losses}" data-otl="${row.ot_losses}"
          data-gaa="${row.goals_against_average}" data-shutouts="${row.shutouts}" data-gsax="${gsax.get(row.player_id) ?? -1000}" data-rank="${index + 1}">
        <td class="col-rank">${index + 1}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              <span class="player-name-line">${escapeHtml(row.name)}${highlightDots("", row.team_abbrev, hl)}</span>
              <span class="player-meta"><img src="${escapeHtml(row.logo)}" alt="${escapeHtml(row.team_abbrev)}" class="table-team-logo" loading="lazy"></span>
            </span>
          </a>
        </td>
        <td>${row.games_played}</td>
        <td>${row.wins}</td>
        <td>${row.losses}</td>
        <td>${row.ot_losses}</td>
        <td>${row.goals_against_average.toFixed(2)}</td>
        <td class="stat-strong">${row.save_pct.toFixed(3)}</td>
        <td>${row.shutouts}</td>
        ${withGsax ? `<td>${formatGsax(gsax.get(row.player_id), 2)}</td>` : ""}
      </tr>`,
    )
    .join("");

  return `
  <div class="stats-table-wrap">
    <table class="stats-table porssi-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th data-sort="name" data-type="text">Pelaaja</th>
          <th data-sort="gp">O</th>
          <th data-sort="wins">V</th>
          <th data-sort="losses">H</th>
          <th data-sort="otl">JH</th>
          <th data-sort="gaa">GAA</th>
          <th data-sort="rank" data-first-dir="asc" class="sort-asc">SV%</th>
          <th data-sort="shutouts">NP</th>
          ${withGsax ? '<th data-sort="gsax">GSAx</th>' : ""}
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: skaters } = await db
    .prepare("SELECT * FROM finnish_skater_stats ORDER BY points DESC, goals DESC, name ASC")
    .all<FinnishSkaterRow>();

  const { results: goalies } = await db
    .prepare("SELECT * FROM finnish_goalie_stats ORDER BY save_pct DESC, wins DESC, name ASC")
    .all<FinnishGoalieRow>();

  const seasonSource = skaters[0]?.season_id ?? goalies[0]?.season_id;
  const seasonText = seasonSource ? seasonLabel(seasonSource) : "";

  const hl = {
    highlights: readHighlightsCookie(context.request),
    favoriteTeamAbbrevs: await favoriteTeamAbbrevs(context.request, context.env),
  };

  const content = `
<header class="page-header">
  <h1>${flagImg("fi")} Suomipörssi</h1>
  <p class="subtitle">Kausi ${escapeHtml(seasonText)}</p>
</header>

<section>
  <h2 class="section-title">${icon("puck")} Pistepörssi · ${skaters.length} pelaajaa</h2>
  ${skaters.length ? renderSkaterTable(skaters, hl, await fetchExtras(db, skaters)) : `<p class="empty-note">Ei tilastoituja suomalaispelaajia tälle kaudelle vielä.</p>`}
</section>

<section>
  <h2 class="section-title">${icon("goal")} Maalivahtipörssi · ${goalies.length} pelaajaa</h2>
  ${goalies.length ? renderGoalieTable(goalies, hl, await fetchGoaliesSeasonGsaxMap(db, goalies.map((g) => g.player_id))) : `<p class="empty-note">Ei tilastoituja suomalaisia maalivahteja tälle kaudelle vielä.</p>`}
</section>
`;

  const html = await renderLayout({
    title: "Suomipörssi · Morning Hockey",
    headerTitle: "Suomipörssi",
    activePage: "suomiporssi",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
