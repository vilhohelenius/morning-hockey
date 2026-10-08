// /joukkueet: all 32 teams as compact rows (logo -> team page, record, season
// xGF% with league-rank badge), grouped by division with a division filter;
// the xG sort lives on /odotetut.

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

  const row = (t: StandingsRow) => {
    const x = xg.get(t.abbrev);
    return `
<a class="team-row" style="--tc:${TEAM_COLORS[t.abbrev] ?? "var(--accent)"}" href="/joukkueet/${t.abbrev.toLowerCase()}">
  <img src="${escapeHtml(t.logo)}" alt="" class="team-row-logo" loading="lazy">
  <span class="team-row-name">${escapeHtml(t.name)}</span>
  <span class="team-row-rec">${t.wins}-${t.losses}-${t.ot_losses}</span>
  <span class="team-row-xg"><span class="team-row-xg-label">xGF%</span> ${x ? x.pct.toFixed(1) : "–"}${x ? rankBadge(x.rankPct) : ""}</span>
</a>`;
  };
  const divisions = [...new Set(teams.map((t) => t.division))];
  const picker = ["Kaikki", ...divisions]
    .map((d, i) => `<button type="button" class="day-pill ${i ? "" : "active"}" data-division="${i ? escapeHtml(d) : ""}">${escapeHtml(d)}</button>`)
    .join("");
  const groups = divisions
    .map(
      (d) =>
        `<section class="team-index-group" data-division="${escapeHtml(d)}"><h2 class="section-title">${escapeHtml(d)}</h2><div class="team-list">${teams.filter((t) => t.division === d).map(row).join("")}</div></section>`,
    )
    .join("");

  const content = `
<header class="page-header">
  <h1>${icon("jersey")} Joukkueet</h1>
  <p class="subtitle">Ennätys (W-L-OTL) ja kauden xGF%. Merkki #n on sija NHL:ssä.</p>
</header>
<div class="day-picker team-division-picker">${picker}</div>
<div class="team-index-grid">${groups}</div>
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
