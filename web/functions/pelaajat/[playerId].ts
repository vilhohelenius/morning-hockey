// Player card: fully on-demand (no D1 storage, nothing synced ahead of
// time) -- fetched straight from the NHL API's /player/{id}/landing (bio +
// every season's totals) and /player/{id}/game-log/{season}/2 (that
// season's per-game log, regular season only). Linked from basically
// everywhere a player's name shows up (leaderboards, rosters, team pages,
// the full game report's player tables) *except* the dashboard/Arkisto
// click-to-expand box-score info card (_shared/gameCard.ts's finn-stats
// lines and app.js's goal-timeline popup) -- those stay plain text, since
// wiring real links into that JSON-driven popup is a separate, less
// valuable change.
//
// No contract/salary info: the public NHL API doesn't expose it at all
// (confirmed -- landing() has nothing resembling it), so that part of the
// ask is simply not available from this data source.

import { escapeHtml, nationalityFlag, seasonLabel, shortDate, teamLogoUrl } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import { TEAM_COLORS } from "../_shared/teamColors";
import type { Env } from "../_shared/types";

const NHL_BASE = "https://api-web.nhle.com/v1";

async function fetchJson(path: string): Promise<any> {
  const response = await fetch(`${NHL_BASE}${path}`);
  if (!response.ok) throw new Error(`NHL API ${path} returned ${response.status}`);
  return response.json();
}

// Same season-id math as _shared/boxScoreCache.ts's seasonIdForDate, just
// based on today's date instead of a game's -- there's no game here to
// derive a season from until the user's picked one, and this is only ever
// used as the *default* selection, not something stored or synced.
function currentSeasonId(): number {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const startYear = month >= 8 ? year : year - 1;
  return startYear * 10_000 + (startYear + 1);
}

function ageFromBirthDate(birthDate: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const now = new Date();
  const nowMonth = now.getUTCMonth() + 1;
  let age = now.getUTCFullYear() - by;
  if (nowMonth < bm || (nowMonth === bm && now.getUTCDate() < bd)) age -= 1;
  return age;
}

const HANDEDNESS_FI: Record<string, string> = { L: "Vasen", R: "Oikea" };
const GOALIE_DECISION_FI: Record<string, string> = { W: "V", L: "H", O: "JH" };

interface SeasonTotal {
  season: number;
  gameTypeId: number;
  leagueAbbrev: string;
  gamesPlayed: number;
  goals?: number;
  assists?: number;
  points?: number;
  plusMinus?: number;
  pim?: number;
  avgToi?: string;
  wins?: number;
  losses?: number;
  otLosses?: number;
  goalsAgainstAvg?: number;
  savePctg?: number;
  shutouts?: number;
  shotsAgainst?: number;
  goalsAgainst?: number;
  timeOnIce?: string; // cumulative, goalies -- avgToi above is skaters' per-game average
}

function renderSeasonSelect(playerId: number, seasons: number[], selected: number): string {
  const options = seasons
    .map((s) => `<option value="${s}" ${s === selected ? "selected" : ""}>${escapeHtml(seasonLabel(s))}</option>`)
    .join("");
  // location.replace() instead of a normal form submit: swapping seasons
  // replaces the current history entry instead of pushing a new one, so
  // "<- Takaisin" (history.back(), in app.js) always leaves the player card
  // in one click no matter how many seasons were browsed first, rather than
  // popping back through each season visited along the way.
  return `
  <form method="get" action="/pelaajat/${playerId}" class="table-filters">
    <select name="season" onchange="location.replace('/pelaajat/${playerId}?season=' + this.value)">${options}</select>
  </form>`;
}

// Shared by the skater career tile section and the (now also tile-based)
// current-season summary -- same tile shape, just fed a different
// SeasonTotal (career vs. the selected season). Tiles read the same visual
// language as the bio section's Ikä/Pituus/Paino/Kätisyys tiles. The
// per-game table below still keeps its own "Kausi" total row too (as a
// <tfoot>, see renderSkaterGameLog) -- this tile section doesn't replace
// it, just adds a higher-up summary.
function renderSkaterStatTiles(t: SeasonTotal): string {
  const tile = (value: string, label: string) =>
    `<div class="stat-tile"><span class="stat-tile-value">${value}</span><span class="stat-tile-label">${label}</span></div>`;

  return `
  <div class="stat-tile-grid">
    ${tile(String(t.gamesPlayed), "Ottelut")}
    ${tile(String(t.goals ?? 0), "Maalit")}
    ${tile(String(t.assists ?? 0), "Syötöt")}
    ${tile(String(t.points ?? 0), "Pisteet")}
    ${tile(`${(t.plusMinus ?? 0) > 0 ? "+" : ""}${t.plusMinus ?? 0}`, "+/-")}
    ${tile(String(t.pim ?? 0), "Jäähyminuutit")}
    ${tile(t.avgToi ? escapeHtml(t.avgToi) : "–", "TOI/GP")}
  </div>`;
}

// Shared by the goalie career section and the goalie season total (pulled
// out of the per-game game-log table into its own section -- save count,
// W-L-OTL and cumulative TOI, which the per-game table's columns did carry,
// aren't relevant to a summary the way GAA and win count are). Both use the
// same Ottelut/Voitot/Torjunta-%/GAA/Nollapelit tile shape, just fed a
// different SeasonTotal (career vs. the selected season).
function renderGoalieStatTiles(t: SeasonTotal): string {
  const tile = (value: string, label: string) =>
    `<div class="stat-tile"><span class="stat-tile-value">${value}</span><span class="stat-tile-label">${label}</span></div>`;

  return `
  <div class="stat-tile-grid">
    ${tile(String(t.gamesPlayed), "Ottelut")}
    ${tile(String(t.wins ?? 0), "Voitot")}
    ${tile((t.savePctg ?? 0).toFixed(3), "Torjunta-%")}
    ${tile((t.goalsAgainstAvg ?? 0).toFixed(2), "GAA")}
    ${tile(String(t.shutouts ?? 0), "Nollapelit")}
  </div>`;
}

// Shared row shape for every place a skater's SeasonTotal needs to be one
// table row: the per-game table's <tfoot> total, each row (and the total
// row) of the season-history table, and the one-row "Kauden tilastot"
// summary. rowClass defaults to "total-row" (the per-game tfoot and the
// one-row summary both want that emphasis); season-history passes "" for
// its plain per-season rows and "total-row" again for its own total row.
function renderSkaterTotalRow(label: string, t: SeasonTotal, rowClass = "total-row"): string {
  return `
      <tr${rowClass ? ` class="${rowClass}"` : ""}>
        <td>${escapeHtml(label)}</td>
        <td>${t.gamesPlayed}</td>
        <td>${t.goals ?? 0}</td>
        <td>${t.assists ?? 0}</td>
        <td class="stat-strong">${t.points ?? 0}</td>
        <td>${(t.plusMinus ?? 0) > 0 ? "+" : ""}${t.plusMinus ?? 0}</td>
        <td>${t.pim ?? 0}</td>
        <td>${t.avgToi ? escapeHtml(t.avgToi) : "–"}</td>
      </tr>`;
}

// Goalie equivalent of renderSkaterTotalRow -- same Ottelut/Voitot/
// Torjunta-%/GAA/Nollapelit shape as renderGoalieStatTiles, just as a row
// instead of tiles. Used by the season-history table and the one-row
// "Kauden tilastot" summary (goalies never had a per-game tfoot total, so
// no third use here the way skaters have).
function renderGoalieStatRow(label: string, t: SeasonTotal, rowClass = "total-row"): string {
  return `
      <tr${rowClass ? ` class="${rowClass}"` : ""}>
        <td>${escapeHtml(label)}</td>
        <td>${t.gamesPlayed}</td>
        <td>${t.wins ?? 0}</td>
        <td class="stat-strong">${(t.savePctg ?? 0).toFixed(3)}</td>
        <td>${(t.goalsAgainstAvg ?? 0).toFixed(2)}</td>
        <td>${t.shutouts ?? 0}</td>
      </tr>`;
}

// "Kausi <newest>" and "Uran tilastot" together, rendered twice: a tile
// grid per period (unchanged look, shown under ~860px -- same breakpoint
// the sidebar already switches on) and, for wider screens, ONE combined
// table with a row per period sharing one set of column headers -- closer
// to how NHL.com's own player page lays these two out side by side on
// desktop. Both renderings read the exact same tile/row helpers used
// elsewhere on this page, so the numbers can't drift between the two.
// Pure CSS toggle (.stat-period-tiles/.stat-period-table), no JS.
function renderPeriodStatsSection(isGoalie: boolean, periods: { label: string; total: SeasonTotal }[]): string {
  if (!periods.length) return "";

  const tileFn = isGoalie ? renderGoalieStatTiles : renderSkaterStatTiles;
  const rowFn = isGoalie ? renderGoalieStatRow : renderSkaterTotalRow;
  const headerCells = isGoalie
    ? `<th>Ottelut</th><th>Voitot</th><th>SV%</th><th>GAA</th><th>NP</th>`
    : `<th>Ottelut</th><th>M</th><th>S</th><th>P</th><th>+/-</th><th>JH</th><th>TOI/GP</th>`;

  const tileSections = periods
    .map(
      (p) => `
<section class="stat-period-tiles">
  <h2 class="section-title">${escapeHtml(p.label)}</h2>
  ${tileFn(p.total)}
</section>`,
    )
    .join("");

  const tableRows = periods.map((p) => rowFn(p.label, p.total, "")).join("");

  return `${tileSections}
<section class="stat-period-table">
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr><th></th>${headerCells}</tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
</section>`;
}

function renderSkaterOneRowSummary(t: SeasonTotal): string {
  return `
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th>Kausi</th>
          <th>Ottelut</th>
          <th>M</th>
          <th>S</th>
          <th>P</th>
          <th>+/-</th>
          <th>JH</th>
          <th>TOI/GP</th>
        </tr>
      </thead>
      <tbody>${renderSkaterTotalRow(seasonLabel(t.season), t)}</tbody>
    </table>
  </div>`;
}

function renderGoalieOneRowSummary(t: SeasonTotal): string {
  return `
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th>Kausi</th>
          <th>Ottelut</th>
          <th>Voitot</th>
          <th>SV%</th>
          <th>GAA</th>
          <th>NP</th>
        </tr>
      </thead>
      <tbody>${renderGoalieStatRow(seasonLabel(t.season), t)}</tbody>
    </table>
  </div>`;
}

// Opponent shown as a logo instead of the abbreviation text -- same
// assets.nhle.com CDN path as teamLogoUrl, just inline here since the
// alt text (kept for accessibility/screen readers) still needs the raw
// abbreviation string.
function opponentCell(homeRoadFlag: string, abbrev: string): string {
  const safeAbbrev = escapeHtml(abbrev);
  return `${homeRoadFlag === "H" ? "vs" : "@"} <img src="${escapeHtml(teamLogoUrl(abbrev))}" alt="${safeAbbrev}" class="table-team-logo" loading="lazy" onerror="this.style.visibility='hidden'">`;
}

const GAME_LOG_COLLAPSE_AT = 5;

function renderSkaterGameLog(games: any[], seasonTotal: SeasonTotal | null): string {
  const rows = games
    .map(
      (g) => `
      <tr class="game-row-link" data-game-id="${g.gameId}">
        <td>${escapeHtml(shortDate(g.gameDate))}</td>
        <td>${opponentCell(g.homeRoadFlag, g.opponentAbbrev)}</td>
        <td>${g.goals}</td>
        <td>${g.assists}</td>
        <td class="stat-strong">${g.points}</td>
        <td>${g.plusMinus > 0 ? "+" : ""}${g.plusMinus}</td>
        <td>${g.pim}</td>
        <td>${escapeHtml(g.toi)}</td>
      </tr>`,
    )
    .join("");

  // Season total row moves to <tfoot> (always visible, outside app.js's
  // collapse/expand counting, which only ever looks at tbody rows) instead
  // of being the first <tbody> row like before -- keeps it out of the
  // "show 5 most recent games" budget, and puts it at the bottom alongside
  // the same choice made for the season-history table's own total row.
  const totalRow = seasonTotal ? renderSkaterTotalRow("Kausi", seasonTotal) : "";

  return `
  <div class="stats-table-wrap">
    <table id="player-game-log" class="stats-table game-log-table" data-collapse-at="${GAME_LOG_COLLAPSE_AT}">
      <thead>
        <tr>
          <th>Pvm</th>
          <th>Vast</th>
          <th>M</th>
          <th>S</th>
          <th>P</th>
          <th>+/-</th>
          <th>JH</th>
          <th>Peliaika</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      ${totalRow ? `<tfoot>${totalRow}</tfoot>` : ""}
    </table>
  </div>
  <button type="button" class="expand-toggle" data-table-id="player-game-log" data-page-size="1000"></button>
  <p class="game-row-hint">Näytä ottelun tiedot ▾</p>`;
}

// Closest thing the public landing endpoint has to NHL.com's player-page
// "Notes & Transactions" section: draftDetails (year/team/round/pick). The
// real transaction/news feed (signings, trades, waivers) isn't part of this
// API as far as this project's existing NHL API usage goes -- it's sourced
// from NHL.com's own editorial CMS, not api-web.nhle.com. Every field is
// read defensively so an undrafted player (no draftDetails at all) or an
// unexpected shape just skips the tile instead of rendering "undefined".
//
// Lives in the bio .stat-tile-grid as one more tile alongside Ikä/Pituus/
// Paino/Kätisyys (not its own section) -- year + team logo on the value
// line, round + overall pick on the label line. Packing four pieces of info
// into one tile-sized box is tight and the label line will wrap on narrow
// screens; that's accepted as a known trade-off, not a bug.
function renderDraftTile(draft: any): string {
  if (!draft?.year) return "";
  const logo = draft.teamAbbrev
    ? `<img src="${escapeHtml(teamLogoUrl(draft.teamAbbrev))}" alt="" class="stat-tile-draft-logo" onerror="this.style.visibility='hidden'">`
    : "";
  const detailParts: string[] = [];
  if (draft.round) detailParts.push(`kierros ${draft.round}`);
  if (draft.overallPick) detailParts.push(`${draft.overallPick}. kok.`);

  return `
    <div class="stat-tile stat-tile-draft">
      <span class="stat-tile-value">${logo}${draft.year}</span>
      <span class="stat-tile-label">${detailParts.length ? escapeHtml(detailParts.join(" · ")) : "Draft"}</span>
    </div>`;
}

// total: the API-computed career total for this tab (careerTotals.
// regularSeason / .playoffs), reused as-is for the <tfoot> row instead of
// summing the per-season rows ourselves -- averages like SV%/GAA can't be
// correctly derived by averaging per-season averages, so the API's own
// aggregate is the only correct source for that row.
function renderSkaterSeasonHistory(rows: SeasonTotal[], total: SeasonTotal | null): string {
  if (!rows.length) return `<p class="empty-note">Ei NHL-kausia.</p>`;

  const trs = rows.map((t) => renderSkaterTotalRow(seasonLabel(t.season), t, "")).join("");
  const totalRow = total ? renderSkaterTotalRow("Yhteensä", total) : "";

  return `
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th>Kausi</th>
          <th>Ottelut</th>
          <th>M</th>
          <th>S</th>
          <th>P</th>
          <th>+/-</th>
          <th>JH</th>
          <th>TOI/GP</th>
        </tr>
      </thead>
      <tbody>${trs}</tbody>
      ${totalRow ? `<tfoot>${totalRow}</tfoot>` : ""}
    </table>
  </div>`;
}

function renderGoalieSeasonHistory(rows: SeasonTotal[], total: SeasonTotal | null): string {
  if (!rows.length) return `<p class="empty-note">Ei NHL-kausia.</p>`;

  const trs = rows.map((t) => renderGoalieStatRow(seasonLabel(t.season), t, "")).join("");
  const totalRow = total ? renderGoalieStatRow("Yhteensä", total) : "";

  return `
  <div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th>Kausi</th>
          <th>Ottelut</th>
          <th>Voitot</th>
          <th>SV%</th>
          <th>GAA</th>
          <th>NP</th>
        </tr>
      </thead>
      <tbody>${trs}</tbody>
      ${totalRow ? `<tfoot>${totalRow}</tfoot>` : ""}
    </table>
  </div>`;
}

// Regular season/playoffs toggle: same pill-button + is-hidden pattern as
// Otteluohjelma's day-picker (app.js), just targeting .season-history-
// section instead of .schedule-day-section. Both tables render server-side
// up front; the toggle only ever flips which one is visible, no re-fetch.
function renderSeasonHistorySection(
  isGoalie: boolean,
  regularSeasonRows: SeasonTotal[],
  playoffRows: SeasonTotal[],
  careerRegularTotal: SeasonTotal | null,
  careerPlayoffsTotal: SeasonTotal | null,
): string {
  if (!regularSeasonRows.length && !playoffRows.length) return "";

  const render = isGoalie ? renderGoalieSeasonHistory : renderSkaterSeasonHistory;

  return `
<section>
  <h2 class="section-title">Uran tilastot kausittain</h2>
  <div class="season-type-picker">
    <button type="button" class="day-pill active" data-game-type="2">Runkosarja</button>
    <button type="button" class="day-pill" data-game-type="3">Playoffs</button>
  </div>
  <div class="season-history-section" data-game-type="2">${render(regularSeasonRows, careerRegularTotal)}</div>
  <div class="season-history-section is-hidden" data-game-type="3">${render(playoffRows, careerPlayoffsTotal)}</div>
</section>`;
}

function renderGoalieGameLog(games: any[]): string {
  const rows = games
    .map((g) => {
      const saves = (g.shotsAgainst ?? 0) - (g.goalsAgainst ?? 0);
      return `
      <tr class="game-row-link" data-game-id="${g.gameId}">
        <td>${escapeHtml(shortDate(g.gameDate))}</td>
        <td>${opponentCell(g.homeRoadFlag, g.opponentAbbrev)}</td>
        <td>${g.decision ? escapeHtml(GOALIE_DECISION_FI[g.decision] ?? g.decision) : "–"}</td>
        <td>${saves}/${g.shotsAgainst ?? 0}</td>
        <td class="stat-strong">${(g.savePctg ?? 0).toFixed(3)}</td>
        <td>${escapeHtml(g.toi)}</td>
      </tr>`;
    })
    .join("");

  // No shutout column here -- that's a season-level fact, not a per-game
  // one worth a whole column; it's already in the season tiles above
  // (renderGoalieStatTiles) and the season-history table.
  return `
  <div class="stats-table-wrap">
    <table id="player-game-log" class="stats-table game-log-table" data-collapse-at="${GAME_LOG_COLLAPSE_AT}">
      <thead>
        <tr>
          <th>Pvm</th>
          <th>Vast</th>
          <th>Rat.</th>
          <th>Torj.</th>
          <th>SV%</th>
          <th>Peliaika</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <button type="button" class="expand-toggle" data-table-id="player-game-log" data-page-size="1000"></button>
  <p class="game-row-hint">Näytä ottelun tiedot ▾</p>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const playerId = Number(context.params.playerId);
  if (!Number.isInteger(playerId)) {
    return new Response("Virheellinen pelaaja-id", { status: 400 });
  }

  let landing: any;
  try {
    landing = await fetchJson(`/player/${playerId}/landing`);
  } catch (error) {
    console.error(`Player landing fetch failed for ${playerId}:`, error);
    return new Response("Pelaajan tietoja ei juuri nyt saatu. Yritä myöhemmin uudelleen.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const isGoalie = landing.position === "G";
  const name = `${landing.firstName?.default ?? ""} ${landing.lastName?.default ?? ""}`.trim();

  const seasonTotals: SeasonTotal[] = (landing.seasonTotals ?? []).filter(
    (s: SeasonTotal) => s.leagueAbbrev === "NHL" && s.gameTypeId === 2,
  );
  const seasons = [...new Set(seasonTotals.map((s) => s.season))].sort((a, b) => b - a);

  const url = new URL(context.request.url);
  const requestedSeason = Number(url.searchParams.get("season"));
  const selectedSeason = seasons.includes(requestedSeason) ? requestedSeason : (seasons[0] ?? currentSeasonId());

  const seasonTotal = seasonTotals.find((s) => s.season === selectedSeason) ?? null;
  const careerTotal: SeasonTotal | null = landing.careerTotals?.regularSeason ?? null;
  const careerPlayoffsTotal: SeasonTotal | null = landing.careerTotals?.playoffs ?? null;

  // Always the newest season with data, independent of the ?season= query
  // param -- the fixed "Kausi <newest>" tile section near the top is an
  // at-a-glance snapshot, not something the season <select> (further down,
  // next to Ottelut) is meant to change.
  const latestSeasonTotal = seasons.length ? (seasonTotals.find((s) => s.season === seasons[0]) ?? null) : null;

  const regularSeasonHistory = [...seasonTotals].sort((a, b) => b.season - a.season);
  const playoffHistory: SeasonTotal[] = (landing.seasonTotals ?? [])
    .filter((s: SeasonTotal) => s.leagueAbbrev === "NHL" && s.gameTypeId === 3)
    .sort((a: SeasonTotal, b: SeasonTotal) => b.season - a.season);

  let gameLogHtml = "";
  try {
    const gameLog = await fetchJson(`/player/${playerId}/game-log/${selectedSeason}/2`);
    const games = gameLog.gameLog ?? [];
    gameLogHtml = games.length
      ? isGoalie
        ? renderGoalieGameLog(games)
        : renderSkaterGameLog(games, seasonTotal)
      : `<p class="empty-note">Ei pelattuja otteluita tälle kaudelle.</p>`;
  } catch (error) {
    console.error(`Player game log fetch failed for ${playerId}/${selectedSeason}:`, error);
    gameLogHtml = `<p class="empty-note">Ottelukohtaisia tilastoja ei juuri nyt saatu.</p>`;
  }

  const age = landing.birthDate ? ageFromBirthDate(landing.birthDate) : null;
  const handedness = landing.shootsCatches ? (HANDEDNESS_FI[landing.shootsCatches] ?? landing.shootsCatches) : null;

  // NHL.com's own player page has a large team-logo watermark behind the
  // photo, "printed on the jersey" -- the public landing endpoint has no
  // field for that specific hero/background image as far as this project's
  // NHL API usage has established with any confidence (unlike draftDetails,
  // which is a well-documented field), so rather than guess at one, this
  // reuses data already fetched and trusted: the player's own team logo,
  // faded large behind the header, over a gradient tinted with that team's
  // TEAM_COLORS accent (the same map the favorite-team leaderboard
  // highlight uses).
  const teamAccent = TEAM_COLORS[landing.currentTeamAbbrev] ?? "";

  const content = `
<a class="back-link js-back" href="/">← Takaisin</a>

<header class="page-header player-card-header"${teamAccent ? ` style="--team-accent:${teamAccent}"` : ""}>
  ${landing.teamLogo ? `<img src="${escapeHtml(landing.teamLogo)}" alt="" class="player-card-header-bg" aria-hidden="true">` : ""}
  <img src="${escapeHtml(landing.headshot ?? "")}" alt="" class="player-card-photo" onerror="this.style.visibility='hidden'">
  <h1>${escapeHtml(name)}</h1>
  ${landing.birthCountry ? `<p class="subtitle">${nationalityFlag(landing.birthCountry)} ${escapeHtml(landing.birthCity?.default ?? "")}, ${escapeHtml(landing.birthCountry)}</p>` : ""}
  <p class="subtitle">
    <img src="${escapeHtml(landing.teamLogo ?? "")}" alt="" class="table-team-logo" loading="lazy">
    ${escapeHtml(landing.fullTeamName?.default ?? landing.currentTeamAbbrev ?? "")}
    ${landing.sweaterNumber ? ` · #${landing.sweaterNumber}` : ""}
    ${landing.position ? ` · ${escapeHtml(landing.position)}` : ""}
  </p>
</header>

<section>
  <div class="stat-tile-grid">
    ${age !== null ? `<div class="stat-tile"><span class="stat-tile-value">${age}</span><span class="stat-tile-label">Ikä</span></div>` : ""}
    ${landing.heightInCentimeters ? `<div class="stat-tile"><span class="stat-tile-value">${landing.heightInCentimeters} cm</span><span class="stat-tile-label">Pituus</span></div>` : ""}
    ${landing.weightInKilograms ? `<div class="stat-tile"><span class="stat-tile-value">${landing.weightInKilograms} kg</span><span class="stat-tile-label">Paino</span></div>` : ""}
    ${handedness ? `<div class="stat-tile"><span class="stat-tile-value">${escapeHtml(handedness)}</span><span class="stat-tile-label">Kätisyys</span></div>` : ""}
    ${renderDraftTile(landing.draftDetails)}
  </div>
</section>

${renderPeriodStatsSection(
  isGoalie,
  [
    latestSeasonTotal ? { label: `Kausi ${seasonLabel(seasons[0])}`, total: latestSeasonTotal } : null,
    careerTotal ? { label: "Uran tilastot", total: careerTotal } : null,
  ].filter((p): p is { label: string; total: SeasonTotal } => p !== null),
)}

${renderSeasonHistorySection(isGoalie, regularSeasonHistory, playoffHistory, careerTotal, careerPlayoffsTotal)}

<section>
  <h2 class="section-title">Ottelut</h2>
  ${renderSeasonSelect(playerId, seasons.length ? seasons : [currentSeasonId()], selectedSeason)}
  ${
    seasonTotal
      ? isGoalie
        ? renderGoalieOneRowSummary(seasonTotal)
        : renderSkaterOneRowSummary(seasonTotal)
      : ""
  }
  ${gameLogHtml}
</section>
`;

  const html = await renderLayout({
    title: `${name} · Morning Hockey`,
    headerTitle: name,
    activePage: "",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
