// /joukkueet: all 32 teams as stat-cards (logo -> team page, record, season
// xG with league-rank badges). Grouped by division; the xG sort lives on /odotetut.

import { TEAM_COLORS } from "../_shared/teamColors";
import { icon, escapeHtml } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import type { Env, StandingsRow } from "../_shared/types";
import { fetchLeagueTeamXg, rankBadge, rankedTeamXg } from "../_shared/xg";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const [{ results: teams }, league] = await Promise.all([
    db.prepare("SELECT * FROM standings_rows ORDER BY conference, division, name").all<StandingsRow>(),
    fetchLeagueTeamXg(db),
  ]);
  const xg = new Map(rankedTeamXg(league).map((r) => [r.abbrev, r]));

  const cell = (label: string, value: string, rank = "") =>
    `<div class="stat-card-cell"><span class="stat-card-label">${label}</span><span class="stat-card-value">${value}${rank}</span></div>`;

  const card = (t: StandingsRow) => {
      const x = xg.get(t.abbrev);
      return `
<div class="stat-card" style="--tc:${TEAM_COLORS[t.abbrev] ?? "var(--accent)"}">
  <a class="stat-card-header team-index-header" href="/joukkueet/${t.abbrev.toLowerCase()}">
    <img src="${escapeHtml(t.logo)}" alt="" class="stat-card-team-logo" loading="lazy">
    <span class="stat-card-name">${escapeHtml(t.name)}</span>
  </a>
  <div class="stat-card-grid-cells">
    ${cell("W-L-OTL", `${t.wins}-${t.losses}-${t.ot_losses}`)}
    ${cell("xGF%", x ? x.pct.toFixed(1) : "–", x ? rankBadge(x.rankPct) : "")}
    ${cell("xGF", x ? x.xgf.toFixed(1) : "–", x ? rankBadge(x.rankXgf) : "")}
    ${cell("xGA", x ? x.xga.toFixed(1) : "–", x ? rankBadge(x.rankXga) : "")}
  </div>
</div>`;
  };
  const divisions = [...new Set(teams.map((t) => t.division))];
  const cards = divisions
    .map(
      (d) =>
        `<section class="team-index-group"><h2 class="section-title">${escapeHtml(d)}</h2>${teams.filter((t) => t.division === d).map(card).join("")}</section>`,
    )
    .join("");

  const content = `
<header class="page-header">
  <h1>${icon("jersey")} Joukkueet</h1>
  <p class="subtitle">Ennätys ja kauden odotetut maalit. xGF- ja xGA-sijat ovat per ottelu.</p>
</header>
<div class="team-index-grid">${cards}</div>
`;

  const html = await renderLayout({
    title: "Joukkueet · Morning Hockey",
    headerTitle: "Joukkueet",
    activePage: "teams",
    content,
    request: context.request,
    env: context.env,
  });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
