// Playoff-bracket, phase 4. Pure derivation from standings_rows -- no new
// D1 table needed, unlike Suomipörssi. TS port of playoffs.py's
// build_bracket(): each conference's 2 division leaders are ranked by
// points (more points plays the weaker WC2, fewer points plays the
// stronger WC1), and each division's 2nd/3rd place teams play each other.
// Only round 1 resolves to real teams; later rounds depend on unplayed
// series, so the page only ever shows round 1, same as the original.

import { escapeHtml, humanDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, StandingsRow } from "./_shared/types";

interface Matchup {
  higherLabel: string;
  higherSeed: StandingsRow;
  lowerLabel: string;
  lowerSeed: StandingsRow;
}

function topThree(rows: StandingsRow[]): StandingsRow[] {
  return [...rows].sort((a, b) => a.division_rank - b.division_rank).slice(0, 3);
}

function buildRound1(divisionX: StandingsRow[], divisionY: StandingsRow[], wildcardRace: StandingsRow[]): Matchup[] {
  const topX = topThree(divisionX);
  const topY = topThree(divisionY);

  const xIsStronger = topX[0].points >= topY[0].points;
  const strongTop3 = xIsStronger ? topX : topY;
  const weakTop3 = xIsStronger ? topY : topX;
  const strongName = strongTop3[0].division;
  const weakName = weakTop3[0].division;

  const [wc1, wc2] = wildcardRace;

  return [
    { higherLabel: `${strongName} 1`, higherSeed: strongTop3[0], lowerLabel: "Villikortti 2", lowerSeed: wc2 },
    { higherLabel: `${strongName} 2`, higherSeed: strongTop3[1], lowerLabel: `${strongName} 3`, lowerSeed: strongTop3[2] },
    { higherLabel: `${weakName} 1`, higherSeed: weakTop3[0], lowerLabel: "Villikortti 1", lowerSeed: wc1 },
    { higherLabel: `${weakName} 2`, higherSeed: weakTop3[1], lowerLabel: `${weakName} 3`, lowerSeed: weakTop3[2] },
  ];
}

function renderMatchupCard(m: Matchup): string {
  const team = (seed: StandingsRow, label: string) => `
  <div class="matchup-team">
    <img src="${escapeHtml(seed.logo)}" alt="" class="matchup-logo" loading="lazy">
    <span class="matchup-abbrev">${escapeHtml(seed.abbrev)}</span>
    <span class="matchup-seed">${escapeHtml(label)}</span>
    <span class="matchup-points">${seed.points} p</span>
  </div>`;

  return `
<div class="matchup-card">
  ${team(m.higherSeed, m.higherLabel)}
  <div class="matchup-vs">VS</div>
  ${team(m.lowerSeed, m.lowerLabel)}
</div>`;
}

function renderWildcardStanding(rows: StandingsRow[]): string {
  const shown = rows.slice(0, 4);
  const body = shown
    .map(
      (row, index) => `
    <div class="division-row">
      <span class="division-rank">VK${row.wildcard_rank}</span>
      <span class="division-team">
        <img src="${escapeHtml(row.logo)}" alt="" class="division-logo" loading="lazy">
        ${escapeHtml(row.abbrev)}
        ${row.qualified ? `<span class="playoff-dot"></span>` : ""}
      </span>
      <span class="division-stats">
        <span>${row.games_played}</span>
        <span>${row.wins}</span>
        <span>${row.losses}</span>
        <span>${row.ot_losses}</span>
        <span class="division-points">${row.points}</span>
      </span>
    </div>${index + 1 === 2 ? `<div class="wc-cutoff-line"></div>` : ""}`,
    )
    .join("");

  return `
  <h3 class="roster-group-title">Villikorttitilanne</h3>
  <div class="division-table">${body}</div>`;
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
      if (divisionNames.length !== 2) return "";

      const [divisionX, divisionY] = divisionNames.map((name) => conferenceRows.filter((r) => r.division === name));
      const wildcardRace = conferenceRows
        .filter((r) => r.wildcard_rank > 0)
        .sort((a, b) => a.wildcard_rank - b.wildcard_rank);

      if (wildcardRace.length < 2) return "";

      const round1 = buildRound1(divisionX, divisionY, wildcardRace);

      return `
<section>
  <h2 class="section-title">${escapeHtml(conferenceName)}-konferenssi</h2>

  <div class="bracket-grid">
    <div class="bracket-pair">
      ${renderMatchupCard(round1[0])}
      ${renderMatchupCard(round1[1])}
      <div class="bracket-connector"></div>
    </div>
    <div class="bracket-pair">
      ${renderMatchupCard(round1[2])}
      ${renderMatchupCard(round1[3])}
      <div class="bracket-connector"></div>
    </div>
  </div>

  ${renderWildcardStanding(wildcardRace)}
</section>`;
    })
    .join("");

  const content = `
<header class="page-header">
  <h1>🏆 Playoff-bracket</h1>
  <p class="subtitle">Jos pudotuspelit alkaisivat tänään · tilanne ${asOfDate ? escapeHtml(humanDate(asOfDate)) : ""}</p>
  <p class="standings-legend">Näytetään vain 1. kierros — seuraavat kierrokset ratkeavat vasta kun nämä
    ottelut on pelattu. Viiva yhdistää ottelut, joiden voittajat kohtaisivat toisiaan 2. kierroksella.</p>
</header>
${sections}
`;

  const html = renderLayout({
    title: "Playoff-bracket · Morning Hockey",
    headerTitle: "Playoff-bracket",
    activePage: "playoffs",
    content,
    request: context.request,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
