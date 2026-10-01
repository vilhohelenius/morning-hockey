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

import { escapeHtml, nationalityFlag, shortDate } from "../_shared/format";
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

function seasonLabel(season: number): string {
  const start = Math.floor(season / 10_000);
  const end = season % 10_000;
  return `${start}–${end}`;
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

// Career totals get their own tile grid (same visual language as the bio
// section's Ikä/Pituus/Paino/Kätisyys tiles), not a game-log table row --
// a career sum sitting above single-season per-game rows read as "one
// more game" at a glance, which it isn't. Skaters' season total stays a
// table row (still directly comparable to the per-game rows above it);
// goalies' season total gets its own tile section too (see
// renderGoalieStatTiles) since its stat set no longer matches the
// per-game table's columns.
function renderSkaterCareerStats(t: SeasonTotal): string {
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

function renderSkaterTotalRow(label: string, t: SeasonTotal): string {
  return `
      <tr class="total-row">
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

function renderSkaterGameLog(games: any[], seasonTotal: SeasonTotal | null): string {
  const totalRows = seasonTotal ? renderSkaterTotalRow("Kausi", seasonTotal) : "";

  const rows = games
    .map(
      (g) => `
      <tr>
        <td>${escapeHtml(shortDate(g.gameDate))}</td>
        <td>${g.homeRoadFlag === "H" ? "vs" : "@"} ${escapeHtml(g.opponentAbbrev)}</td>
        <td>${g.goals}</td>
        <td>${g.assists}</td>
        <td class="stat-strong">${g.points}</td>
        <td>${g.plusMinus > 0 ? "+" : ""}${g.plusMinus}</td>
        <td>${g.pim}</td>
        <td>${escapeHtml(g.toi)}</td>
      </tr>`,
    )
    .join("");

  return `
  <div class="stats-table-wrap">
    <table class="stats-table game-log-table">
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
      <tbody>${totalRows}${rows}</tbody>
    </table>
  </div>`;
}

function renderGoalieGameLog(games: any[]): string {
  const rows = games
    .map((g) => {
      const saves = (g.shotsAgainst ?? 0) - (g.goalsAgainst ?? 0);
      return `
      <tr>
        <td>${escapeHtml(shortDate(g.gameDate))}</td>
        <td>${g.homeRoadFlag === "H" ? "vs" : "@"} ${escapeHtml(g.opponentAbbrev)}</td>
        <td>${g.decision ? escapeHtml(GOALIE_DECISION_FI[g.decision] ?? g.decision) : "–"}</td>
        <td>${saves}/${g.shotsAgainst ?? 0}</td>
        <td class="stat-strong">${(g.savePctg ?? 0).toFixed(3)}</td>
        <td>${g.shutouts ? "✓" : ""}</td>
        <td>${escapeHtml(g.toi)}</td>
      </tr>`;
    })
    .join("");

  return `
  <div class="stats-table-wrap">
    <table class="stats-table game-log-table">
      <thead>
        <tr>
          <th>Pvm</th>
          <th>Vast</th>
          <th>Rat.</th>
          <th>Torj.</th>
          <th>SV%</th>
          <th>NP</th>
          <th>Peliaika</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
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

  const content = `
<a class="back-link js-back" href="/">← Takaisin</a>

<header class="page-header player-card-header">
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
  <div class="stat-grid">
    ${age !== null ? `<div class="stat-tile"><span class="stat-tile-value">${age}</span><span class="stat-tile-label">Ikä</span></div>` : ""}
    ${landing.heightInCentimeters ? `<div class="stat-tile"><span class="stat-tile-value">${landing.heightInCentimeters} cm</span><span class="stat-tile-label">Pituus</span></div>` : ""}
    ${landing.weightInKilograms ? `<div class="stat-tile"><span class="stat-tile-value">${landing.weightInKilograms} kg</span><span class="stat-tile-label">Paino</span></div>` : ""}
    ${handedness ? `<div class="stat-tile"><span class="stat-tile-value">${escapeHtml(handedness)}</span><span class="stat-tile-label">Kätisyys</span></div>` : ""}
  </div>
</section>

${
  careerTotal
    ? `<section>
  <h2 class="section-title">Uran tilastot</h2>
  ${isGoalie ? renderGoalieStatTiles(careerTotal) : renderSkaterCareerStats(careerTotal)}
</section>`
    : ""
}

<section>
  <h2 class="section-title">Kauden tilastot</h2>
  ${renderSeasonSelect(playerId, seasons.length ? seasons : [currentSeasonId()], selectedSeason)}
  ${
    isGoalie && seasonTotal
      ? `<p class="subtitle">Kausi yhteensä</p>
  ${renderGoalieStatTiles(seasonTotal)}`
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
