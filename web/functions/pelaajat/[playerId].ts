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
import {
  XG_INFO_TEXT,
  fetchGameXg,
  fetchSkaterGameOnIcePct,
  fetchGoalieSeasonXg,
  fetchSkaterOnIceXg,
  fetchSkaterSeasonXg,
  formatGsax,
  formatXg,
  xgPercent,
  gsaxPer100,
} from "../_shared/xg";

const NHL_BASE = "https://api-web.nhle.com/v1";

async function fetchJson(path: string): Promise<any> {
  const response = await fetch(`${NHL_BASE}${path}`);
  if (!response.ok) throw new Error(`NHL API ${path} returned ${response.status}`);
  return response.json();
}

const STATS_BASE = "https://api.nhle.com/stats/rest/en";

// The sporting nationality (what Suomipörssi filters on and NHL.com shows),
// from the stats REST bios report's nationalityCode. landing.birthCountry is
// where the player was *born*, which differs for e.g. US-born Finnish
// Samuel Helenius (birthCountry USA, nationalityCode FIN). Best-effort: any
// failure or empty result returns "" so the caller falls back to birthCountry.
async function fetchNationalityCode(playerId: number, isGoalie: boolean): Promise<string> {
  try {
    const report = isGoalie ? "goalie" : "skater";
    const response = await fetch(`${STATS_BASE}/${report}/bios?cayenneExp=playerId=${playerId}&limit=1`);
    if (!response.ok) return "";
    const body: any = await response.json();
    return body?.data?.[0]?.nationalityCode ?? "";
  } catch (error) {
    console.error(`Player nationality fetch failed for ${playerId}:`, error);
    return "";
  }
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
  teamName?: { default?: string };
}

// seasonTotals rows carry only the team's full name (teamName.default), not
// its abbreviation, so logos/abbreviations are resolved from this map
// (current + relocated/renamed franchises). Unknown names fall back to plain
// text without a logo.
const TEAM_ABBREV_BY_NAME: Record<string, string> = {
  "Anaheim Ducks": "ANA", "Mighty Ducks of Anaheim": "ANA", "Arizona Coyotes": "ARI", "Phoenix Coyotes": "PHX",
  "Atlanta Thrashers": "ATL", "Boston Bruins": "BOS", "Buffalo Sabres": "BUF", "Calgary Flames": "CGY",
  "Carolina Hurricanes": "CAR", "Chicago Blackhawks": "CHI", "Colorado Avalanche": "COL",
  "Columbus Blue Jackets": "CBJ", "Dallas Stars": "DAL", "Detroit Red Wings": "DET", "Edmonton Oilers": "EDM",
  "Florida Panthers": "FLA", "Los Angeles Kings": "LAK", "Minnesota Wild": "MIN", "Montréal Canadiens": "MTL",
  "Montreal Canadiens": "MTL", "Nashville Predators": "NSH", "New Jersey Devils": "NJD", "New York Islanders": "NYI",
  "New York Rangers": "NYR", "Ottawa Senators": "OTT", "Philadelphia Flyers": "PHI", "Pittsburgh Penguins": "PIT",
  "San Jose Sharks": "SJS", "Seattle Kraken": "SEA", "St. Louis Blues": "STL", "Tampa Bay Lightning": "TBL",
  "Toronto Maple Leafs": "TOR", "Utah Hockey Club": "UTA", "Utah Mammoth": "UTA", "Vancouver Canucks": "VAN",
  "Vegas Golden Knights": "VGK", "Washington Capitals": "WSH", "Winnipeg Jets": "WPG",
  "Hartford Whalers": "HFD", "Quebec Nordiques": "QUE", "Minnesota North Stars": "MNS",
};

// "2025–2026" -> "2025–26" so the season-history table fits 420px with its
// extra team column.
function shortSeasonLabel(label: string): string {
  return label.replace(/^(\d{4}\D)\d{2}(\d{2})$/, "$1$2");
}

function teamChip(name: string | undefined): string {
  if (!name) return "";
  const abbrev = TEAM_ABBREV_BY_NAME[name];
  if (!abbrev) return `<span class="season-team"><span class="season-team-abbr">${escapeHtml(name)}</span></span>`;
  return `<span class="season-team"><img src="${escapeHtml(teamLogoUrl(abbrev))}" alt="" class="season-team-logo" loading="lazy" onerror="this.style.visibility='hidden'"><span class="season-team-abbr">${abbrev}</span></span>`;
}

function seasonTeamsHtml(t: SeasonTotal): string {
  return teamChip(t.teamName?.default);
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

// Shared row shape for every place a skater's SeasonTotal needs to be one
// table row: each row (and the total row) of the season-history table, and
// the one-row "Ottelut" summary. rowClass defaults to "total-row" (the
// one-row summary wants that emphasis); season-history passes "" for its
// plain per-season rows and "total-row" again for its own total row.
function renderSkaterTotalRow(label: string, t: SeasonTotal, rowClass = "total-row", withTeam = false): string {
  return `
      <tr${rowClass ? ` class="${rowClass}"` : ""}>
        <td>${escapeHtml(withTeam ? shortSeasonLabel(label) : label)}</td>
        ${withTeam ? `<td>${seasonTeamsHtml(t)}</td>` : ""}
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
function renderGoalieStatRow(label: string, t: SeasonTotal, rowClass = "total-row", withTeam = false): string {
  return `
      <tr${rowClass ? ` class="${rowClass}"` : ""}>
        <td>${escapeHtml(withTeam ? shortSeasonLabel(label) : label)}</td>
        ${withTeam ? `<td>${seasonTeamsHtml(t)}</td>` : ""}
        <td>${t.gamesPlayed}</td>
        <td>${t.wins ?? 0}</td>
        <td class="stat-strong">${(t.savePctg ?? 0).toFixed(3)}</td>
        <td>${(t.goalsAgainstAvg ?? 0).toFixed(2)}</td>
        <td>${t.shutouts ?? 0}</td>
      </tr>`;
}

// One stat-card per period (current season, career) instead of one shared
// table with a row per period -- mirrors nhl.com's own player stats page,
// which shows "2026-27 Season" and "Career" as two separate boxed tables
// rather than two rows of one table. See the "Stat cards" block in
// style.css.
function statCell(label: string, value: string, highlight = false): string {
  return `<div class="stat-card-cell${highlight ? " stat-card-highlight" : ""}"><span class="stat-card-label">${label}</span><span class="stat-card-value">${value}</span></div>`;
}

function renderSkaterStatCardCells(t: SeasonTotal, ranks: LeagueRanks = {}): string {
  return [
    statCell("O", `${t.gamesPlayed}`),
    statCell("M", `${t.goals ?? 0}${rankBadge(ranks.goals)}`),
    statCell("S", `${t.assists ?? 0}${rankBadge(ranks.assists)}`),
    statCell("P", `${t.points ?? 0}${rankBadge(ranks.points)}`, true),
    statCell("+/-", `${(t.plusMinus ?? 0) > 0 ? "+" : ""}${t.plusMinus ?? 0}`),
    statCell("JH", `${t.pim ?? 0}`),
    statCell("TOI/GP", t.avgToi ? escapeHtml(t.avgToi) : "–"),
  ].join("");
}

function renderGoalieStatCardCells(t: SeasonTotal, ranks: LeagueRanks = {}): string {
  return [
    statCell("O", `${t.gamesPlayed}`),
    statCell("V", `${t.wins ?? 0}${rankBadge(ranks.wins)}`),
    statCell("SV%", `${(t.savePctg ?? 0).toFixed(3)}${rankBadge(ranks.savePct)}`, true),
    statCell("GAA", `${(t.goalsAgainstAvg ?? 0).toFixed(2)}${rankBadge(ranks.gaa)}`),
    statCell("NP", `${t.shutouts ?? 0}${rankBadge(ranks.shutouts)}`),
  ].join("");
}

// League rank (1-based) per stat category, only filled in for categories
// where the player is in the top RANK_BADGE_MAX; see fetchLeagueRanks.
interface LeagueRanks {
  goals?: number;
  assists?: number;
  points?: number;
  wins?: number;
  savePct?: number;
  gaa?: number;
  shutouts?: number;
}

const RANK_BADGE_MAX = 10;

function rankBadge(rank: number | undefined): string {
  return rank ? `<span class="rank-badge" title="Sija NHL-pörssissä">#${rank}</span>` : "";
}

// Rank = 1 + number of players strictly ahead, using the same ordering as
// the leaderboards (tilastot.ts: points DESC, goals DESC; maalivahtiporssi.ts:
// save_pct DESC, wins DESC) -- so tied players share a rank instead of the
// leaderboard's alphabetical tiebreak implying a fake gap. Read from the
// synced skater_season_stats/goalie_season_stats tables (no extra NHL API
// call). A zero value never gets a badge, and goalies with no games are
// skipped for SV%/GAA. Goalies use the same no-minimum-games rule as the
// leaderboard.
async function fetchLeagueRanks(
  db: D1Database,
  playerId: number,
  seasonId: number,
  isGoalie: boolean,
): Promise<LeagueRanks> {
  const sql = isGoalie
    ? `SELECT
         (SELECT COUNT(*) + 1 FROM goalie_season_stats o WHERE o.season_id = s.season_id AND o.wins > s.wins) AS wins,
         (SELECT COUNT(*) + 1 FROM goalie_season_stats o WHERE o.season_id = s.season_id AND o.games_played > 0
            AND (o.save_pct > s.save_pct OR (o.save_pct = s.save_pct AND o.wins > s.wins))) AS savePct,
         (SELECT COUNT(*) + 1 FROM goalie_season_stats o WHERE o.season_id = s.season_id AND o.games_played > 0
            AND o.goals_against_average < s.goals_against_average) AS gaa,
         (SELECT COUNT(*) + 1 FROM goalie_season_stats o WHERE o.season_id = s.season_id AND o.shutouts > s.shutouts) AS shutouts,
         s.wins AS wins_v, s.shutouts AS shutouts_v, s.games_played AS gp
       FROM goalie_season_stats s WHERE s.player_id = ? AND s.season_id = ?`
    : `SELECT
         (SELECT COUNT(*) + 1 FROM skater_season_stats o WHERE o.season_id = s.season_id AND o.goals > s.goals) AS goals,
         (SELECT COUNT(*) + 1 FROM skater_season_stats o WHERE o.season_id = s.season_id AND o.assists > s.assists) AS assists,
         (SELECT COUNT(*) + 1 FROM skater_season_stats o WHERE o.season_id = s.season_id
            AND (o.points > s.points OR (o.points = s.points AND o.goals > s.goals))) AS points,
         s.goals AS goals_v, s.assists AS assists_v, s.points AS points_v
       FROM skater_season_stats s WHERE s.player_id = ? AND s.season_id = ?`;
  let row: Record<string, number> | null = null;
  try {
    row = await db.prepare(sql).bind(playerId, seasonId).first<Record<string, number>>();
  } catch (error) {
    console.error(`League rank lookup failed for ${playerId}:`, error);
  }
  if (!row) return {};
  const top = (rank: number, value: number) => (value > 0 && rank <= RANK_BADGE_MAX ? rank : undefined);
  return isGoalie
    ? {
        wins: top(row.wins, row.wins_v),
        savePct: top(row.savePct, row.gp),
        gaa: top(row.gaa, row.gp),
        shutouts: top(row.shutouts, row.shutouts_v),
      }
    : {
        goals: top(row.goals, row.goals_v),
        assists: top(row.assists, row.assists_v),
        points: top(row.points, row.points_v),
      };
}

// The latest season's xG (skaters) or GSAx + GSAx/100 (goalies) as extra
// stat-card cells, or "" when sync_xg hasn't produced rows for that season.
async function latestSeasonXgCells(
  db: D1Database,
  playerId: number,
  season: number | undefined,
  isGoalie: boolean,
): Promise<string> {
  if (season === undefined) return "";
  if (isGoalie) {
    const x = await fetchGoalieSeasonXg(db, playerId, season);
    if (!x) return "";
    const gsax = x.xga - x.goalsAgainst;
    const per100 = gsaxPer100(gsax, x.shotsAgainst);
    return statCell("GSAx", formatGsax(gsax)) + statCell("GSAx/100", formatGsax(per100, 2));
  }
  const x = await fetchSkaterSeasonXg(db, playerId, season);
  if (!x) return "";
  const onIce = await fetchSkaterOnIceXg(db, playerId, season);
  return (
    statCell("xG", formatXg(x.xg)) +
    (onIce ? statCell("xGF%", xgPercent(onIce.xgf, onIce.xga)) + statCell("xGF% 5v5", xgPercent(onIce.xgf5v5, onIce.xga5v5)) : "")
  );
}

interface StatPeriod {
  label: string;
  total: SeasonTotal;
  ranks?: LeagueRanks;
  teams?: string;
  extraCells?: string; // e.g. the xG/GSAx cells, appended after the NHL API's own stats
}

function renderPeriodStatsSection(
  isGoalie: boolean,
  periods: StatPeriod[],
): string {
  if (!periods.length) return "";

  const cellsFn = isGoalie ? renderGoalieStatCardCells : renderSkaterStatCardCells;

  const cards = periods
    .map(
      (p) => `
    <div class="stat-card">
      <div class="stat-card-header">
        <span class="stat-card-title">${escapeHtml(p.label)}</span>
        ${p.teams ? `<span class="stat-card-teams">${p.teams}</span>` : ""}
      </div>
      <div class="stat-card-grid-cells">${cellsFn(p.total, p.ranks)}${p.extraCells ?? ""}</div>
    </div>`,
    )
    .join("");

  return `
<section class="player-period-stats">
  <div class="stat-card-grid">${cards}</div>
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

function renderSkaterGameLog(games: any[], xgByGame: Map<number, number>, onIceByGame: Map<number, number>): string {
  const rows = games
    .map(
      (g) => `
      <tr class="game-row-link" data-game-id="${g.gameId}">
        <td>${escapeHtml(shortDate(g.gameDate))}</td>
        <td>${opponentCell(g.homeRoadFlag, g.opponentAbbrev)}</td>
        <td>${g.goals}</td>
        ${xgByGame.size ? `<td>${formatXg(xgByGame.get(g.gameId))}</td>` : ""}
        <td>${g.assists}</td>
        <td class="stat-strong">${g.points}</td>
        <td>${g.plusMinus > 0 ? "+" : ""}${g.plusMinus}</td>
        <td>${g.pim}</td>
        <td>${escapeHtml(g.toi)}</td>
        ${onIceByGame.size ? `<td>${onIceByGame.has(g.gameId) ? `${onIceByGame.get(g.gameId)!.toFixed(1)} %` : "–"}</td>` : ""}
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
          ${xgByGame.size ? '<th title="Yksilöllinen odotettu maalimäärä">ixG</th>' : ""}
          <th>S</th>
          <th>P</th>
          <th>+/-</th>
          <th>JH</th>
          <th>Peliaika</th>
          ${onIceByGame.size ? "<th>xGF%</th>" : ""}
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
  const nationality = landing.nationalityCode || landing.birthCountry;
  if (nationality) {
    rows.push({
      label: "Kansallisuus",
      value: `${nationalityFlag(nationality)} ${escapeHtml(nationality)}`,
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

  const trs = rows.map((t) => renderSkaterTotalRow(seasonLabel(t.season), t, "", true)).join("");
  const totalRow = total ? renderSkaterTotalRow("Yhteensä", total, "total-row", true) : "";

  return `
  <div class="stats-table-wrap">
    <table class="stats-table season-history-table">
      <thead>
        <tr>
          <th>Kausi</th>
          <th>Joukkue</th>
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

  const trs = rows.map((t) => renderGoalieStatRow(seasonLabel(t.season), t, "", true)).join("");
  const totalRow = total ? renderGoalieStatRow("Yhteensä", total, "total-row", true) : "";

  return `
  <div class="stats-table-wrap">
    <table class="stats-table season-history-table">
      <thead>
        <tr>
          <th>Kausi</th>
          <th>Joukkue</th>
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

function renderGoalieGameLog(games: any[], gsaxByGame: Map<number, number>): string {
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
        ${gsaxByGame.size ? `<td>${formatGsax(gsaxByGame.get(g.gameId))}</td>` : ""}
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
          ${gsaxByGame.size ? "<th>GSAx</th>" : ""}
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
  landing.nationalityCode = await fetchNationalityCode(playerId, isGoalie);
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
    const xgByGame = await fetchGameXg(context.env.DB, playerId, selectedSeason, isGoalie);
    const onIceByGame = isGoalie ? new Map<number, number>() : await fetchSkaterGameOnIcePct(context.env.DB, playerId, selectedSeason);
    gameLogHtml = games.length
      ? isGoalie
        ? renderGoalieGameLog(games, xgByGame)
        : renderSkaterGameLog(games, xgByGame, onIceByGame)
      : `<p class="empty-note">Ei pelattuja otteluita tälle kaudelle.</p>`;
  } catch (error) {
    console.error(`Player game log fetch failed for ${playerId}/${selectedSeason}:`, error);
    gameLogHtml = `<p class="empty-note">Ottelukohtaisia tilastoja ei juuri nyt saatu.</p>`;
  }

  // League-rank badges only make sense for the current season's card (the
  // leaderboard tables only hold the current season).
  const latestRanks: LeagueRanks =
    seasons.length && seasons[0] === currentSeasonId()
      ? await fetchLeagueRanks(context.env.DB, playerId, seasons[0], isGoalie)
      : {};

  const xgCells = await latestSeasonXgCells(context.env.DB, playerId, seasons[0], isGoalie);

  const age = landing.birthDate ? ageFromBirthDate(landing.birthDate) : null;

  const heroNationality: string = landing.nationalityCode || landing.birthCountry || "";
  const heroFlag = heroNationality ? nationalityFlag(heroNationality) : "";
  const latestSeasonTeams = seasons.length
    ? seasonTotals
        .filter((t) => t.season === seasons[0])
        .map(seasonTeamsHtml)
        .join("")
    : "";

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
        ${age !== null ? `<span>${age} v.</span>` : ""}
        ${landing.heightInCentimeters ? `<span>${landing.heightInCentimeters} cm</span>` : ""}
        ${landing.weightInKilograms ? `<span>${landing.weightInKilograms} kg</span>` : ""}
        ${heroFlag ? `<span class="player-hero-flag" title="${escapeHtml(heroNationality)}">${heroFlag}</span>` : ""}
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
  ([
    latestSeasonTotal
      ? { label: `Kausi ${seasonLabel(seasons[0])}`, total: latestSeasonTotal, ranks: latestRanks, teams: latestSeasonTeams, extraCells: xgCells }
      : null,
    careerTotal ? { label: "Uran tilastot", total: careerTotal } : null,
  ] as (StatPeriod | null)[]).filter((p): p is StatPeriod => p !== null),
)}

${xgCells ? XG_INFO_TEXT : ""}

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
