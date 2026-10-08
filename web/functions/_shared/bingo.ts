import { icon, positionTag } from "./format.ts";
// Pistemiesbingo: pure logic + rendering. The user's slip (bingo_picks) is a
// list of skaters; this turns it into per-player night stats from the box
// scores the pages already fetch (_shared/boxScoreCache) -- no extra NHL
// calls. Only type imports so scripts/test-bingo.ts can run it under Node's
// TS stripping.
//
// ---- Reset rule ("kierros" = pelipäivä / hockey night) -----------------
// games.date is the Helsinki calendar date of a game's start, which splits
// one North American evening (17:00-22:30 ET = 00:00-05:30 Helsinki, plus
// the odd 19:00-23:59 Helsinki start) over two dates. A slip is therefore
// bound to a *night*, not a date: night(game) = Helsinki date of
// (start - 8 h), so a whole US evening shares one key.
//
//  * When a pick is added, its round_date = night of the earliest game that
//    has NOT started yet at that moment (pickTargetNight). Picks made in
//    the morning after a night thus belong to the next night; picks made
//    mid-evening before the player's game belong to tonight.
//  * currentNight = the latest night that has any started game
//    (currentNight). A pick is
//      - "stale"    when its night was reset: at 14:00 Helsinki time on
//        the day after the night (expiredThrough), same moment for all
//        users, or when a newer night has started (round_date < currentNight)
//      - "active"   when round_date == currentNight   (shown as results)
//      - "upcoming" when round_date  > currentNight   (waiting its night)
//    Stale rows are hidden and deleted the next time the user adds a pick.
//  So last night's results stay visible until 14:00 Finnish time the next
//  day (also in the morning's Tulospiilo), then the slip is empty.

import type { PlayerGameStat } from "./types";

const NIGHT_SHIFT_MS = 8 * 60 * 60 * 1000;

function helsinkiDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Helsinki",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function helsinkiTime(iso: string): string {
  return new Intl.DateTimeFormat("fi-FI", {
    timeZone: "Europe/Helsinki",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(".", ":");
}

export interface BingoGame {
  game_id: number;
  start_time_utc: string;
  away_abbrev: string;
  home_abbrev: string;
  away_logo: string;
  home_logo: string;
  away_score: number;
  home_score: number;
  game_state: string;
  is_finished: number;
}

/** Night key (YYYY-MM-DD, the North-American evening's date) of a game start. */
export function gameNight(startUtcIso: string): string {
  return helsinkiDate(new Date(new Date(startUtcIso).getTime() - NIGHT_SHIFT_MS));
}

export function hasStarted(game: BingoGame, nowMs: number): boolean {
  return !!game.is_finished || (game.game_state !== "FUT" && game.game_state !== "PRE") || new Date(game.start_time_utc).getTime() <= nowMs;
}

/** Latest night with a started game, or null. */
export function currentNight(games: BingoGame[], nowMs: number): string | null {
  let best: string | null = null;
  for (const g of games) {
    if (!hasStarted(g, nowMs)) continue;
    const n = gameNight(g.start_time_utc);
    if (best === null || n > best) best = n;
  }
  return best;
}

/** Night of the earliest game that starts after `atMs`; null if none known. */
export function pickTargetNight(games: BingoGame[], atMs: number): string | null {
  let best: string | null = null;
  for (const g of games) {
    if (new Date(g.start_time_utc).getTime() <= atMs) continue;
    const n = gameNight(g.start_time_utc);
    if (best === null || n < best) best = n;
  }
  return best;
}

/** round_date for a new pick: target night, else (no schedule known) tomorrow's night key. */
export function newPickRoundDate(games: BingoGame[], nowMs: number): string {
  return pickTargetNight(games, nowMs) ?? gameNight(new Date(nowMs + 24 * 60 * 60 * 1000 + NIGHT_SHIFT_MS).toISOString());
}

export type PickPhase = "active" | "upcoming" | "stale";

const RESET_HOUR_HELSINKI = 14;

/** Newest night key whose slip has been reset: night N is cleared for
 *  everyone at 14:00 Helsinki time on the day after (N+1). */
export function expiredThrough(nowMs: number): string {
  const today = helsinkiDate(new Date(nowMs));
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Helsinki", hour: "2-digit", hourCycle: "h23" }).format(new Date(nowMs)),
  );
  return addDaysKey(today, hour >= RESET_HOUR_HELSINKI ? -1 : -2);
}

export function pickPhase(roundDate: string, current: string | null, nowMs: number): PickPhase {
  if (roundDate <= expiredThrough(nowMs)) return "stale";
  if (current === null) return "upcoming";
  if (roundDate === current) return "active";
  return roundDate > current ? "upcoming" : "stale";
}

function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + days));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/** "3.–4.10." for night key 2026-10-03 (the games run into the 4th Helsinki time). */
export function nightLabel(key: string): string {
  const [, m1, d1] = key.split("-").map(Number);
  const [, m2, d2] = addDaysKey(key, 1).split("-").map(Number);
  return m1 === m2 ? `${d1}.–${d2}.${m2}.` : `${d1}.${m1}.–${d2}.${m2}.`;
}

// ---------------------------------------------------------------- rows

export interface BingoPick {
  player_id: number;
  name: string;
  headshot: string;
  position: string;
  team_abbrev: string;
  team_logo: string;
}

export interface BingoGameData {
  game: BingoGame;
  live: boolean;
  liveText: string;
  awaySkaters: PlayerGameStat[];
  homeSkaters: PlayerGameStat[];
  boxLoaded: boolean;
}

type BingoStatus = "played" | "dnp" | "waiting" | "nogame" | "unknown";

export interface BingoRow {
  pick: BingoPick;
  status: BingoStatus;
  goals: number;
  assists: number;
  points: number;
  data: BingoGameData | null;
  isHome: boolean;
}

function played(toi: string): boolean {
  return toi !== "" && toi !== "00:00" && toi !== "0:00";
}

export function buildBingoRows(picks: BingoPick[], games: BingoGameData[], nowMs: number): BingoRow[] {
  const rows: BingoRow[] = picks.map((pick) => {
    const data = games.find((g) => g.game.away_abbrev === pick.team_abbrev || g.game.home_abbrev === pick.team_abbrev) ?? null;
    const base = { pick, goals: 0, assists: 0, points: 0, data, isHome: data ? data.game.home_abbrev === pick.team_abbrev : false };
    if (!data) return { ...base, status: "nogame" as const };
    if (!hasStarted(data.game, nowMs)) return { ...base, status: "waiting" as const };
    if (!data.boxLoaded) return { ...base, status: "unknown" as const };
    const list = base.isHome ? data.homeSkaters : data.awaySkaters;
    const stat = list.find((s) => s.player_id === pick.player_id);
    if (!stat || !played(stat.toi)) return { ...base, status: "dnp" as const };
    return { ...base, status: "played" as const, goals: stat.goals, assists: stat.assists, points: stat.points };
  });
  const rank = (r: BingoRow) => (r.status === "played" ? 0 : 1);
  rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.points - a.points ||
      b.goals - a.goals ||
      a.pick.name.localeCompare(b.pick.name, "fi"),
  );
  return rows;
}

// ------------------------------------------------------------ rendering

function esc(value: string | number): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface BingoRenderOptions {
  // Show the game's score / live badge (off in spoiler-free contexts).
  showScore: boolean;
  // Rows of started games get data-gate and stay hidden ("?") until the
  // page's script adds .is-revealed. gateFor maps a game id to its gate key.
  gated: boolean;
  gateFor?: (gameId: number) => string;
}

function playerCell(p: BingoPick): string {
  return `<td class="bingo-first">
          <a href="/pelaajat/${p.player_id}" class="player-cell">
            <img src="${esc(p.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">${esc(p.name)}<span class="player-meta">${p.position ? `${positionTag(p.position)} · ` : ""}<img src="${esc(p.team_logo)}" alt="${esc(p.team_abbrev)}" class="table-team-logo" loading="lazy"></span></span>
          </a>
        </td>`;
}

function gameCell(r: BingoRow, opts: BingoRenderOptions, nowMs: number): string {
  const d = r.data;
  if (!d) return `<td class="bingo-game">–</td>`;
  const g = d.game;
  const oppAbbrev = r.isHome ? g.away_abbrev : g.home_abbrev;
  const oppLogo = r.isHome ? g.away_logo : g.home_logo;
  const matchup = `${r.isHome ? "vs" : "@"} <img src="${esc(oppLogo)}" alt="${esc(oppAbbrev)}" class="table-team-logo bingo-opp" loading="lazy">`;
  let extra = "";
  if (!hasStarted(g, nowMs)) {
    extra = `<span class="bingo-time">klo ${esc(helsinkiTime(g.start_time_utc))}</span>`;
  } else if (opts.showScore) {
    const ts = r.isHome ? g.home_score : g.away_score;
    const os = r.isHome ? g.away_score : g.home_score;
    extra = ` ${ts}–${os}`;
    if (d.live) extra += `<span class="bingo-live"><span class="live-dot"></span>${esc(d.liveText || "LIVE")}</span>`;
  }
  return `<td class="bingo-game">${matchup}${extra}</td>`;
}

function statusText(r: BingoRow, nowMs: number): string {
  switch (r.status) {
    case "dnp":
      return r.data?.live ? "Ei vielä pelannut" : "Ei pelannut";
    case "waiting":
      return `Peli ei ole alkanut · klo ${esc(helsinkiTime(r.data!.game.start_time_utc))}`;
    case "nogame":
      return "Ei peliä tällä kierroksella";
    default:
      return "Tietoja ei saatu";
  }
}

function statCells(r: BingoRow, gated: boolean, nowMs: number): string {
  const wrap = (inner: string, attrs = "") =>
    gated ? `<td${attrs}><span class="bingo-val">${inner}</span><span class="bingo-q">?</span></td>` : `<td${attrs}>${inner}</td>`;
  if (r.status === "played") {
    return `${wrap(String(r.goals))}${wrap(String(r.assists))}${wrap(String(r.points), ' class="bingo-pts"')}`;
  }
  const status = `<span class="bingo-status">${statusText(r, nowMs)}</span>`;
  if (!gated) return wrap(status, ' colspan="3"');
  // Even "didn't play"/"no data" would spoil a result, so while hidden every
  // stat column shows its own "?"; the status text replaces them on reveal.
  const q = `<td class="bingo-hidden-only"><span class="bingo-q">?</span></td>`;
  return `${q}${q}${q}<td colspan="3" class="bingo-revealed-only">${status}</td>`;
}

function renderBingoTable(rows: BingoRow[], opts: BingoRenderOptions, nowMs: number): string {
  const body = rows
    .map((r) => {
      const started = !!r.data && hasStarted(r.data.game, nowMs);
      const gated = opts.gated && started;
      const gate = gated ? ` data-gate="${esc(opts.gateFor ? opts.gateFor(r.data!.game.game_id) : "all")}"` : "";
      return `
      <tr class="bingo-row"${gate}>
        ${playerCell(r.pick)}
        ${gameCell(r, opts, nowMs)}
        ${statCells(r, gated, nowMs)}
      </tr>`;
    })
    .join("");
  return `
  <div class="bingo-scroll">
    <table class="bingo-table">
      <thead>
        <tr>
          <th class="bingo-first">Pelaaja</th>
          <th>Ottelu</th>
          <th title="Maalit">G</th>
          <th title="Syötöt">A</th>
          <th title="Pisteet">PTS</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

// Same tile as the front page's top-5 teasers (.section-tile.hero-tinted +
// team hero background); the table itself reuses Yön suomalaiset's classes.
export function renderBingoSection(rows: BingoRow[], heroStyle: string, opts: BingoRenderOptions, nowMs: number): string {
  return `
<section class="section-tile hero-tinted bingo-section" style="${esc(heroStyle)}">
  <h2 class="section-title">${icon("target")} Pistemiesbingo</h2>
  ${renderBingoTable(rows, opts, nowMs)}
</section>`;
}
