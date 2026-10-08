// Playoff-bracket, phase 4. Pure derivation from standings_rows -- no new
// D1 table needed, unlike Suomipörssi. TS port of playoffs.py's
// build_bracket(): each conference's 2 division leaders are ranked by
// points (more points plays the weaker WC2, fewer points plays the
// stronger WC1), and each division's 2nd/3rd place teams play each other.
// Only round 1 resolves to real teams; later rounds depend on unplayed
// series, so the diagram shows round 1 and leaves the rest empty.
// With season_sim (playoff odds) the page also gets a probability pie view.

import { TEAM_COLORS } from "./_shared/teamColors";
import { icon, escapeHtml, humanDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, StandingsRow } from "./_shared/types";

type Row = StandingsRow;

function topThree(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => a.division_rank - b.division_rank).slice(0, 3);
}

// Round 1 pairs, top to bottom: [strong 1 v WC2], [strong 2 v 3], [weak 1 v WC1], [weak 2 v 3].
function buildRound1(divisionX: Row[], divisionY: Row[], wildcardRace: Row[]): Row[][] {
  const topX = topThree(divisionX);
  const topY = topThree(divisionY);
  const xIsStronger = topX[0].points >= topY[0].points;
  const strong = xIsStronger ? topX : topY;
  const weak = xIsStronger ? topY : topX;
  const [wc1, wc2] = wildcardRace;
  return [
    [strong[0], wc2],
    [strong[1], strong[2]],
    [weak[0], wc1],
    [weak[1], weak[2]],
  ];
}

// Playoff odds (season_sim, written by sync_season_sim from the season simulation).
interface SimRow {
  abbrev: string;
  as_of: string;
  games_played: number;
  exp_points: number;
  p_playoffs: number;
  p_division: number;
  p_presidents: number;
}

// Missing table or no snapshot yet -> empty, and the odds are hidden.
async function fetchSeasonSim(db: D1Database): Promise<SimRow[]> {
  try {
    const { results } = await db
      .prepare("SELECT abbrev, as_of, games_played, exp_points, p_playoffs, p_division, p_presidents FROM season_sim WHERE as_of = (SELECT MAX(as_of) FROM season_sim)")
      .all<SimRow>();
    return results;
  } catch (error) {
    console.error("Season simulation lookup failed:", error);
    return [];
  }
}

// Never show a certainty the model can't claim.
function formatOdds(p: number): string {
  const pct = p * 100;
  if (pct < 1) return "<1";
  if (pct > 99) return ">99";
  return String(Math.round(pct));
}

const FORECAST_UNCERTAIN_BELOW_GP = 20;
const color = (abbrev: string) => TEAM_COLORS[abbrev] ?? "var(--accent)";

// ---- Tabs: .tab-bar[data-group] buttons toggle the [data-pane=group] panes by id.
function tabs(group: string, items: [string, string][], active = 0): string {
  const buttons = items
    .map(
      ([id, label], i) =>
        `<button type="button" class="standings-tab${i === active ? " active" : ""}" data-target="${id}">${escapeHtml(label)}</button>`,
    )
    .join("");
  return `<div class="tab-bar" data-group="${group}">${buttons}</div>`;
}

const pane = (group: string, id: string, html: string, visible: boolean) =>
  `<div id="${id}" data-pane="${group}"${visible ? "" : " hidden"}>${html}</div>`;

// ---- Bracket diagram (West left, East right, final in the middle).
function renderDiagram(round1ByConf: Map<string, Row[][]>, odds: Map<string, number>): string {
  const slot = (r: Row) =>
    `<div class="pf-s" style="--tc:${color(r.abbrev)}"><img src="${escapeHtml(r.logo)}" alt="">${escapeHtml(r.abbrev)}${
      odds.has(r.abbrev) ? `<small>${formatOdds(odds.get(r.abbrev)!)} %</small>` : ""
    }</div>`;
  const side = (pairs: Row[][], cols: [number, number, number], cls: string) =>
    pairs
      .map((m, k) => `<div class="pf-m" style="grid-column:${cols[0]};grid-row:${2 + 2 * k}/span 2">${m.map(slot).join("")}</div>`)
      .join("") +
    [0, 1].map((k) => `<div class="pf-j ${cls}" style="grid-column:${cols[1]};grid-row:${2 + 4 * k}/span 4"></div>`).join("") +
    `<div class="pf-j ${cls}" style="grid-column:${cols[2]};grid-row:2/span 8"></div>`;

  return `
<div class="pf-bk">
  <h4 style="grid-column:1/4">Western</h4><h4 style="grid-column:5/8;text-align:right">Eastern</h4>
  ${side(round1ByConf.get("Western") ?? [], [1, 2, 3], "w")}${side(round1ByConf.get("Eastern") ?? [], [7, 6, 5], "e")}
  <div class="pf-fin" style="grid-column:4;grid-row:2/span 8"><span>${icon("trophy")}<br>Finaali</span></div>
</div>
<p class="pf-note">Playoff-kaavio jos playoffit alkaisivat tänään.${
    odds.size ? " Prosentti on joukkueen todennäköisyys päästä playoffeihin kauden päätteeksi." : ""
  }</p>`;
}

// ---- Standings tables with playoff % and expected points.
function renderTableRow(r: Row, lead: string, inPlayoffs: boolean, sim: Map<string, SimRow>): string {
  const s = sim.get(r.abbrev);
  return `
<div class="pf-row${inPlayoffs ? " in" : ""}${s ? "" : " no-sim"}" style="--tc:${color(r.abbrev)}">
  <span>${lead}</span><span class="tm"><img src="${escapeHtml(r.logo)}" alt="" loading="lazy">${escapeHtml(r.abbrev)}</span>
  <span>${r.games_played}</span><span>${r.wins}</span><span>${r.losses}</span><span>${r.ot_losses}</span><span class="pts">${r.points}</span>${
    s ? `<span>${Math.round(s.exp_points)}</span><span class="pp">${formatOdds(s.p_playoffs)} %</span>` : ""
  }
</div>`;
}

function tableHead(lead: string, hasSim: boolean): string {
  return `<div class="pf-head${hasSim ? "" : " no-sim"}"><span>${lead}</span><span>Joukkue</span><span>O</span><span>V</span><span>H</span><span>JA</span><span>P</span>${
    hasSim ? "<span>xP</span><span>Playoffit</span>" : ""
  }</div>`;
}

function renderWildcardTable(wildcardRace: Row[], sim: Map<string, SimRow>): string {
  const body = wildcardRace
    .map((r, i) => renderTableRow(r, `WC${r.wildcard_rank}`, r.wildcard_rank <= 2, sim) + (i === 1 ? `<div class="pf-cut"></div>` : ""))
    .join("");
  return `${tableHead("WC", sim.size > 0)}${body}<p class="pf-note">Divisioonan kolme parasta ovat jo varmistaneet paikkansa tämän hetken tilanteessa. Konferenssin kaksi parasta muuta joukkuetta saavat villin kortin.</p>`;
}

function renderDivisionTable(divRows: Row[], sim: Map<string, SimRow>): string {
  const body = [...divRows]
    .sort((a, b) => a.division_rank - b.division_rank)
    .map(
      (r) =>
        renderTableRow(r, `${r.division_rank}.`, r.division_rank <= 3 || (r.wildcard_rank > 0 && r.wildcard_rank <= 2), sim) +
        (r.division_rank === 3 ? `<div class="pf-cut"></div>` : ""),
    )
    .join("");
  return `${tableHead("#", sim.size > 0)}${body}<p class="pf-note">Kolme parasta pääsee suoraan playoffeihin.</p>`;
}

function renderStandings(conferenceRows: Row[], divisionNames: string[], wildcardRace: Row[], sim: Map<string, SimRow>, id: string): string {
  const group = `sec${id}`;
  const items: [string, string][] = [[`wc${id}`, "Villikortti"], ...divisionNames.map((n): [string, string] => [`${id}${n}`, n])];
  const panes =
    pane(group, `wc${id}`, renderWildcardTable(wildcardRace, sim), true) +
    divisionNames
      .map((n) => pane(group, `${id}${n}`, renderDivisionTable(conferenceRows.filter((r) => r.division === n), sim), false))
      .join("");
  return tabs(group, items) + panes;
}

// ---- Probability pie: every slice labelled outside the pie (logo + %) in a column per side.
interface PieGroup {
  name: string;
  teams: { abbrev: string; logo: string; p: number }[];
}
interface PieOpts {
  bygroup?: boolean; // first group on the right, second on the left, whatever the angles
  heads?: boolean; // group names as column headings
}

const W = 520;
const R = 140;
const GAP = 30;
const HG = 22;

function point(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function renderPie(groups: PieGroup[], { bygroup = false, heads = true }: PieOpts = {}): string {
  const total = groups.reduce((sum, g) => sum + g.teams.reduce((t, x) => t + x.p, 0), 0);
  interface Item { abbrev: string; logo: string; p: number; gi: number; g: string; a0: number; a1: number; mid: number; side: "L" | "R" }
  const items: Item[] = [];
  let a = 0;
  groups.forEach((g, gi) => {
    [...g.teams].sort((x, y) => y.p - x.p).forEach((t) => {
      const ang = (t.p / total) * 360;
      const mid = a + ang / 2;
      items.push({ ...t, gi, g: g.name, a0: a, a1: a + ang, mid, side: (bygroup ? gi === 0 : mid < 180) ? "R" : "L" });
      a += ang;
    });
  });

  const seq = (side: "L" | "R") => {
    const s = items.filter((i) => i.side === side);
    return side === "R" ? s : s.reverse(); // top to bottom
  };
  let need = 0;
  for (const side of ["R", "L"] as const) {
    const s = seq(side);
    need = Math.max(need, s.length * GAP + new Set(s.map((i) => i.g)).size * HG);
  }
  const H = Math.max(2 * R + 70, need + 40);
  const cx = W / 2;
  const cy = H / 2;

  const slices = items
    .map((i) => {
      const [x0, y0] = point(cx, cy, R, i.a0);
      const [x1, y1] = point(cx, cy, R, i.a1);
      const large = i.a1 - i.a0 > 180 ? 1 : 0;
      return `<path class="sl" d="M${cx} ${cy} L${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}Z" fill="${TEAM_COLORS[i.abbrev] ?? "#888"}"/>`;
    })
    .join("");

  let labels = "";
  for (const side of ["R", "L"] as const) {
    interface Slot { head?: string; it?: Item; h: number; ideal: number; y: number }
    const rows: Slot[] = [];
    let prev: string | null = null;
    for (const it of seq(side)) {
      const ideal = point(cx, cy, R + 16, it.mid)[1];
      if (heads && it.g !== prev) rows.push({ head: it.g, h: HG, ideal: ideal - GAP * 0.6, y: 0 });
      prev = it.g;
      rows.push({ it, h: GAP, ideal, y: 0 });
    }
    rows.forEach((r, i) => {
      r.y = i === 0 ? r.ideal : Math.max(r.ideal, rows[i - 1].y + (rows[i - 1].h + r.h) / 2);
      r.y = Math.max(r.y, 14 + r.h / 2);
    });
    for (let i = rows.length - 1; i >= 0; i--) {
      const lim = i === rows.length - 1 ? H - 14 - rows[i].h / 2 : rows[i + 1].y - (rows[i].h + rows[i + 1].h) / 2;
      rows[i].y = Math.min(rows[i].y, lim);
    }
    const right = side === "R";
    const colx = cx + (right ? R + 34 : -(R + 34));
    const sgn = right ? 1 : -1;
    for (const r of rows) {
      if (r.head) {
        labels += `<text class="dl" x="${colx.toFixed(1)}" y="${(r.y + 4).toFixed(1)}" text-anchor="${right ? "start" : "end"}">${escapeHtml(r.head)}</text>`;
        continue;
      }
      const it = r.it!;
      const [sx, sy] = point(cx, cy, R, it.mid);
      const [ex, ey] = point(cx, cy, R + 14, it.mid);
      labels +=
        `<path class="lead" d="M${sx.toFixed(1)} ${sy.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${(colx - sgn * 4).toFixed(1)} ${r.y.toFixed(1)}"/>` +
        `<image href="${escapeHtml(it.logo)}" x="${(right ? colx : colx - 24).toFixed(1)}" y="${(r.y - 12).toFixed(1)}" width="24" height="24"/>` +
        `<text class="pp-out" x="${(right ? colx + 30 : colx - 30).toFixed(1)}" y="${(r.y + 5.5).toFixed(1)}" text-anchor="${right ? "start" : "end"}">${formatOdds(it.p)} %</text>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="Playoff-paikkojen jakautuminen joukkueiden kesken">${slices}${labels}</svg>`;
}

function renderPies(rows: Row[], odds: Map<string, number>): string {
  const confs = ["Eastern", "Western"];
  const divsOf = (conf: string) => [...new Set(rows.filter((r) => r.conference === conf).map((r) => r.division))].sort();
  const group = (div: string): PieGroup => ({
    name: div,
    teams: rows.filter((r) => r.division === div && odds.has(r.abbrev)).map((r) => ({ abbrev: r.abbrev, logo: r.logo, p: odds.get(r.abbrev)! })),
  });
  const wrap = (svg: string) => `<div class="pf-pie-wrap">${svg}</div>`;
  const cap = (text: string, center = false) => `<div class="pf-cap${center ? " center" : ""}">${escapeHtml(text)}</div>`;

  // East on the right: clockwise from the top, Eastern groups first.
  const leagueHtml = `<div class="pf-cap"><span>Western</span><span>Eastern</span></div>${wrap(renderPie(confs.flatMap(divsOf).map(group)))}`;

  const confDivs = confs.map((c) => divsOf(c));
  const conferenceHtml =
    tabs("pcc", confs.map((c): [string, string] => [`pc${c}`, c])) +
    confs.map((c, i) => pane("pcc", `pc${c}`, cap(c, true) + wrap(renderPie(confDivs[i].map(group), { bygroup: true })), i === 0)).join("");

  const allDivs = confDivs.flat();
  const divisionHtml =
    tabs("pdd", allDivs.map((d): [string, string] => [`pd${d}`, d])) +
    allDivs.map((d, i) => pane("pdd", `pd${d}`, cap(d, true) + wrap(renderPie([group(d)], { heads: false })), i === 0)).join("");

  return `
${tabs("pie", [["pl", "Liiga"], ["pc", "Konferenssit"], ["pd", "Divisioonat"]])}
<p class="pf-note">Piirakka jakaa kaikki playoff-paikat joukkueiden kesken. Logon vieressä on joukkueen todennäköisyys päästä playoffeihin.</p>
${pane("pie", "pl", leagueHtml, true)}${pane("pie", "pc", conferenceHtml, false)}${pane("pie", "pd", divisionHtml, false)}`;
}

// ---- Season forecast: division winner and Presidents' Trophy odds as bar lists.
function renderSeasonForecast(rows: Row[], simRows: SimRow[]): string {
  const byAbbrev = new Map(rows.map((r) => [r.abbrev, r]));
  const list = (teams: SimRow[], pick: (s: SimRow) => number) =>
    teams
      .map((s) => {
        const r = byAbbrev.get(s.abbrev);
        if (!r) return "";
        return `<div class="pf-bar-row" style="--tc:${color(s.abbrev)}"><span class="tm"><img src="${escapeHtml(r.logo)}" alt="" loading="lazy">${escapeHtml(s.abbrev)}</span><span class="bar"><span style="width:${(pick(s) * 100).toFixed(1)}%"></span></span><b>${formatOdds(pick(s))} %</b></div>`;
      })
      .join("");
  const divisions = [...new Set(rows.map((r) => r.division))].sort();
  const divisionHtml = divisions
    .map((d) => {
      const teams = simRows.filter((s) => byAbbrev.get(s.abbrev)?.division === d).sort((a, b) => b.p_division - a.p_division);
      return `<h4 class="pf-sub">${escapeHtml(d)}</h4>${list(teams, (s) => s.p_division)}`;
    })
    .join("");
  const presidents = [...simRows].sort((a, b) => b.p_presidents - a.p_presidents).slice(0, 10);
  return `
<h3 class="roster-group-title">Divisioonan voitto</h3>${divisionHtml}
<h3 class="roster-group-title">Presidents' Trophy</h3>${list(presidents, (s) => s.p_presidents)}
<p class="pf-note">Todennäköisyys voittaa divisioona tai runkosarjan paras pistemäärä. Presidents' Trophy -listassa kymmenen todennäköisintä.</p>`;
}

function renderForecastInfo(sim: SimRow[]): string {
  const gp = Math.max(...sim.map((s) => s.games_played));
  const early =
    gp < FORECAST_UNCERTAIN_BELOW_GP
      ? `<p class="standings-legend pf-warning">Kausi on vasta alussa, joten playoff-prosentit ovat vielä suuntaa-antavia.</p>`
      : "";
  return `
${early}
<details class="xg-info">
  <summary>Miten ennuste lasketaan?</summary>
  <p><strong>Näin ennuste syntyy.</strong> Jokaiselle jäljellä olevalle ottelulle lasketaan voittotodennäköisyys
  samalla mallilla kuin ottelun ennakossa: joukkueiden viimeaikaiset tulokset, maalipaikat ja laukaukset,
  maalivahtien taso, kotietu ja pelirasitus. Sen jälkeen loppukausi pelataan satatuhatta kertaa läpi, myös
  jatkoajat ja voittolaukaukset mukaan lukien. Prosentti kertoo, kuinka suuressa osassa simulaatioita joukkue
  pääsi playoffeihin. xP on ennustettu pistemäärä kauden lopussa.</p>
  <p><strong>Kuinka tarkka ennuste on.</strong> Tarkkuus on mitattu viiden kauden (2021–22 – 2025–26)
  takautuvalla testillä, jossa ennuste tehtiin vain sen hetken tiedoilla.</p>
  <ul>
    <li>Kauden alussa loppupisteet poikkesivat ennusteesta keskimäärin 12–14 pistettä, neljänneksen kohdalla noin 10, puolivälissä noin 7 ja kolmen neljänneksen jälkeen noin 4.</li>
    <li>Playoff-prosentit ovat alkukaudesta suuntaa-antavia ja tarkentuvat selvästi kauden edetessä.</li>
    <li>Kalibrointi on hyvä: kun malli antoi joukkueelle 85–95 %, joukkue pääsi playoffeihin noin 89 %:ssa tapauksista, ja kun se antoi 5–15 %, toteuma oli noin 15 %.</li>
  </ul>
  <p><strong>Mitä malli ei tiedä.</strong> Loukkaantumiset, kaupat ja tulevat maalivahtivalinnat eivät näy
  ennusteessa. Tasainen kausi on mallille vaikeampi kuin sellainen, jossa vahvuuserot ovat selviä. Ennuste
  päivittyy kerran päivässä, ja siinä on mukana vain päättyneet ottelut.</p>
</details>`;
}

const TAB_SCRIPT = `<script>
document.querySelectorAll(".tab-bar[data-group]").forEach(function (bar) {
  bar.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    bar.querySelectorAll("button").forEach(function (b) { b.classList.toggle("active", b === btn); });
    document.querySelectorAll('[data-pane="' + bar.dataset.group + '"]').forEach(function (p) { p.hidden = p.id !== btn.dataset.target; });
  });
});
</script>`;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const { results: rows } = await db
    .prepare("SELECT * FROM standings_rows ORDER BY conference, division, division_rank")
    .all<Row>();

  const simRows = await fetchSeasonSim(db);
  const sim = new Map(simRows.map((s) => [s.abbrev, s]));
  const odds = new Map(simRows.map((s) => [s.abbrev, s.p_playoffs]));
  const asOfDate = rows[0]?.as_of_date ?? "";

  const round1ByConf = new Map<string, Row[][]>();
  let standings = "";
  for (const conf of ["Eastern", "Western"]) {
    const conferenceRows = rows.filter((r) => r.conference === conf);
    const divisionNames = [...new Set(conferenceRows.map((r) => r.division))].sort();
    if (divisionNames.length !== 2) continue;
    const [divisionX, divisionY] = divisionNames.map((name) => conferenceRows.filter((r) => r.division === name));
    const wildcardRace = conferenceRows.filter((r) => r.wildcard_rank > 0).sort((a, b) => a.wildcard_rank - b.wildcard_rank);
    if (wildcardRace.length < 2) continue;

    round1ByConf.set(conf, buildRound1(divisionX, divisionY, wildcardRace));
    standings += pane("wcc", `w${conf}`, renderStandings(conferenceRows, divisionNames, wildcardRace, sim, conf[0]), conf === "Eastern");
  }

  const confTabs = [...round1ByConf.keys()].map((c): [string, string] => [`w${c}`, c]);
  const bracketHtml = `
${renderDiagram(round1ByConf, odds)}
<h3 class="roster-group-title">Sarjatilanne</h3>
${tabs("wcc", confTabs)}${standings}`;

  const hasOdds = simRows.length > 0;
  const content = `
<header class="page-header">
  <h1>${icon("trophy")} Playoffit</h1>
  <p class="subtitle">Jos playoffit alkaisivat tänään · tilanne ${asOfDate ? escapeHtml(humanDate(asOfDate)) : ""}${
    hasOdds ? ` · ennuste ${escapeHtml(humanDate(simRows[0].as_of))}` : ""
  }</p>
</header>
${
  hasOdds
    ? tabs("top", [["bk", "Playoff-bracket"], ["pie", "Playoff-ennuste"], ["fc", "Kausiennuste"]]) +
      pane("top", "bk", bracketHtml, true) +
      pane("top", "pie", renderPies(rows, odds), false) +
      pane("top", "fc", renderSeasonForecast(rows, simRows), false)
    : bracketHtml
}
${hasOdds ? renderForecastInfo(simRows) : ""}
${TAB_SCRIPT}
`;

  const html = await renderLayout({
    title: "Playoffit · Morning Hockey",
    headerTitle: "Playoffit",
    activePage: "playoffs",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
