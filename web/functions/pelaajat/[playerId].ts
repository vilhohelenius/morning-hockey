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

import { currentUsername } from "../_shared/auth";
import {
  escapeHtml,
  nationalityFlag,
  renderFavStar,
  seasonLabel,
  shortDate,
  teamHeroBackgroundStyle,
  teamLogoUrl,
} from "../_shared/format";
import { renderLayout } from "../_shared/layout";
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

const POSITION_ABBR: Record<string, string> = { C: "C", L: "LW", R: "RW", D: "D", G: "G" };
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
// table row: each row (and the total row) of the season-history table, and
// the one-row "Ottelut" summary. rowClass defaults to "total-row" (the
// one-row summary wants that emphasis); season-history passes "" for its
// plain per-season rows and "total-row" again for its own total row.
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

function renderSkaterGameLog(games: any[]): string {
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

  // No "Kausi" total row here any more -- it duplicated the one-row summary
  // that already sits at the top of the Ottelut section, right above this
  // table, and with few games played the two rows could show identical
  // numbers right next to each other.
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
    </table>
  </div>
  <button type="button" class="expand-toggle" data-table-id="player-game-log" data-page-size="1000"></button>`;
}

// "17.9.1997" from the landing endpoint's "1997-09-17" -- distinct from
// shortDate() above, which deliberately drops the year (game-log rows are
// all within one season, so it'd be redundant there); the hero card's back
// face needs the year since a birth date without one isn't a birth date.
function fullBirthDate(birthDate: string): string {
  const [y, m, d] = birthDate.split("-").map(Number);
  return `${d}.${m}.${y}`;
}

// landing.birthCity/.birthStateProvince are both { default: "..." } (plus
// per-locale keys this project never reads, same shape as every other
// *.default field here) -- state/province is only present for
// US/Canadian-born players, so it's appended only when the API actually
// sent one rather than assumed.
function birthPlace(landing: any): string {
  const city = landing.birthCity?.default;
  if (!city) return "";
  const region = landing.birthStateProvince?.default;
  return region ? `${city}, ${region}` : city;
}

// The back face of the hero card (see the flip markup in onRequestGet):
// every bio field that used to sit in the front's player-hero-meta line or
// in the old bottom-of-page draft section, now together in one place. Read
// defensively field-by-field (same approach the old renderDraftSection
// took) so a player missing e.g. birthStateProvince or draftDetails just
// gets a shorter grid instead of an "undefined" row.
function renderPlayerHeroBack(landing: any, age: number | null): string {
  const rows: { label: string; value: string }[] = [];
  if (landing.heightInCentimeters) rows.push({ label: "Pituus", value: `${landing.heightInCentimeters} cm` });
  if (landing.weightInKilograms) rows.push({ label: "Paino", value: `${landing.weightInKilograms} kg` });
  if (landing.shootsCatches) rows.push({ label: "Kätisyys", value: escapeHtml(landing.shootsCatches) });
  if (landing.birthDate) {
    rows.push({
      label: "Syntymäaika",
      value: `${fullBirthDate(landing.birthDate)}${age !== null ? ` (${age} v.)` : ""}`,
    });
  }
  const place = birthPlace(landing);
  if (place) rows.push({ label: "Syntymäpaikka", value: escapeHtml(place) });
  if (landing.birthCountry) {
    rows.push({
      label: "Kansallisuus",
      value: `${nationalityFlag(landing.birthCountry)} ${escapeHtml(landing.birthCountry)}`,
    });
  }

  const draft = landing.draftDetails;
  const draftHtml = draft?.year
    ? `
  <div class="player-hero-draft">
    ${
      draft.teamAbbrev
        ? `<img src="${escapeHtml(teamLogoUrl(draft.teamAbbrev))}" alt="" class="player-hero-draft-logo" onerror="this.style.visibility='hidden'">`
        : ""
    }
    <span>Draft ${draft.year}${draft.round ? ` · kierros ${draft.round}` : ""}${draft.overallPick ? ` · ${draft.overallPick}. kok.` : ""}</span>
  </div>`
    : "";

  return `
  <h2 class="player-hero-back-title">Bio</h2>
  <div class="player-hero-bio-grid">
    ${rows
      .map(
        (r) =>
          `<div class="player-hero-bio-item"><span class="player-hero-bio-label">${r.label}</span><span class="player-hero-bio-value">${r.value}</span></div>`,
      )
      .join("")}
  </div>
  ${draftHtml}`;
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
  <button type="button" class="expand-toggle" data-table-id="player-game-log" data-page-size="1000"></button>`;
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
        : renderSkaterGameLog(games)
      : `<p class="empty-note">Ei pelattuja otteluita tälle kaudelle.</p>`;
  } catch (error) {
    console.error(`Player game log fetch failed for ${playerId}/${selectedSeason}:`, error);
    gameLogHtml = `<p class="empty-note">Ottelukohtaisia tilastoja ei juuri nyt saatu.</p>`;
  }

  const age = landing.birthDate ? ageFromBirthDate(landing.birthDate) : null;

  const username = currentUsername(context.request);
  const isFavoritePlayer = username
    ? !!(await context.env.DB.prepare("SELECT 1 FROM favorite_players WHERE username = ? AND player_id = ?")
        .bind(username, playerId)
        .first())
    : false;

  const content = `
<a class="back-link js-back" href="/">← Takaisin</a>

<div class="player-hero-flip js-player-hero-flip" role="button" tabindex="0" aria-pressed="false" aria-label="Käännä kortti nähdäksesi pelaajan taustatiedot">
  ${
    username
      ? renderFavStar({
          formAction: "/omat/favorites/players",
          hiddenFields: { player_id: String(playerId), is_goalie: isGoalie ? "1" : "0" },
          isFavorite: isFavoritePlayer,
          redirectTo: `/pelaajat/${playerId}`,
        })
      : ""
  }
  <div class="player-hero-flip-inner">
    <div class="page-header player-card-header hero-banner player-hero-face player-hero-front" style="${escapeHtml(teamHeroBackgroundStyle(landing.currentTeamAbbrev))}">
      <h1>${escapeHtml(name)}</h1>
      <p class="player-hero-meta player-hero-meta-front">
        ${landing.sweaterNumber ? `<span>#${landing.sweaterNumber}</span>` : ""}
        ${landing.position ? `<span>${escapeHtml(POSITION_ABBR[landing.position] ?? landing.position)}</span>` : ""}
      </p>
      <div class="player-hero-footer">
        <img src="${escapeHtml(landing.headshot ?? "")}" alt="" class="player-hero-photo" onerror="this.style.visibility='hidden'">
        ${landing.teamLogo ? `<img src="${escapeHtml(landing.teamLogo)}" alt="" class="player-hero-team-logo" loading="lazy">` : ""}
      </div>
      <span class="player-hero-flip-hint" aria-hidden="true">⟲ Bio</span>
    </div>
    <div class="page-header player-card-header hero-banner player-hero-face player-hero-back" style="${escapeHtml(teamHeroBackgroundStyle(landing.currentTeamAbbrev))}">
      ${renderPlayerHeroBack(landing, age)}
    </div>
  </div>
</div>

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
