import { flagImg } from "./format.ts";
// "Yön suomalaiset": every Finnish player (skaters and goalies) who played
// in a started game of the dashboard's today panel. Pure logic + rendering,
// fed with the same box scores the day panels already fetched -- no extra
// NHL calls. Only type imports so scripts/test-finnish-night.ts can run it
// under Node's TS stripping.

import type { GameRow, GoalieGameStat, PlayerGameStat } from "./types";

export interface NightGame {
  game: GameRow;
  awaySkaters: PlayerGameStat[];
  homeSkaters: PlayerGameStat[];
  awayGoalies: GoalieGameStat[];
  homeGoalies: GoalieGameStat[];
  live: boolean;
  // Preformatted live status ("2. erä · 12:34"), only when live.
  liveText: string;
}

interface GameContext {
  teamAbbrev: string;
  teamLogo: string;
  oppAbbrev: string;
  oppLogo: string;
  teamScore: number;
  oppScore: number;
  live: boolean;
  liveText: string;
}

interface NightSkater extends GameContext {
  player: PlayerGameStat;
}

interface NightGoalie extends GameContext {
  player: GoalieGameStat;
}

function context(g: NightGame, away: boolean): GameContext {
  const { game } = g;
  return {
    teamAbbrev: away ? game.away_abbrev : game.home_abbrev,
    teamLogo: away ? game.away_logo : game.home_logo,
    oppAbbrev: away ? game.home_abbrev : game.away_abbrev,
    oppLogo: away ? game.home_logo : game.away_logo,
    teamScore: away ? game.away_score : game.home_score,
    oppScore: away ? game.home_score : game.away_score,
    live: g.live,
    liveText: g.liveText,
  };
}

function played(toi: string): boolean {
  return toi !== "" && toi !== "00:00" && toi !== "0:00";
}

export function buildFinnishNight(games: NightGame[]): { skaters: NightSkater[]; goalies: NightGoalie[] } {
  const skaters: NightSkater[] = [];
  const goalies: NightGoalie[] = [];
  for (const g of games) {
    for (const away of [true, false]) {
      const ctx = context(g, away);
      for (const p of away ? g.awaySkaters : g.homeSkaters) {
        if (p.nationality === "FIN" && played(p.toi)) skaters.push({ ...ctx, player: p });
      }
      for (const p of away ? g.awayGoalies : g.homeGoalies) {
        // A goalie who never got in (backup) has no ice time.
        if (p.nationality === "FIN" && played(p.toi)) goalies.push({ ...ctx, player: p });
      }
    }
  }
  skaters.sort(
    (a, b) =>
      b.player.points - a.player.points ||
      b.player.goals - a.player.goals ||
      a.player.name.localeCompare(b.player.name),
  );
  goalies.sort((a, b) => a.player.name.localeCompare(b.player.name));
  return { skaters, goalies };
}

export function goalieDecisionFi(decision: string | null): string {
  if (decision === "W") return "V";
  if (decision === "L") return "H";
  if (decision) return "JH"; // OT loss
  return "–";
}

function esc(value: string | number): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function playerCell(id: number, name: string, headshot: string, meta: string, logo: string, abbrev: string): string {
  return `<td class="st-first yf-first">
          <a href="/pelaajat/${id}" class="player-cell">
            <img src="${esc(headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">${esc(name)}<span class="player-meta">${meta ? `${esc(meta)} · ` : ""}<img src="${esc(logo)}" alt="${esc(abbrev)}" class="table-team-logo" loading="lazy"></span></span>
          </a>
        </td>`;
}

// "[own logo] 4–1 [opp logo]": logos instead of abbreviations (the abbrev
// stays as alt text); the player's own side is the emphasised one.
function gameResultInline(c: GameContext): string {
  const logo = (src: string, abbrev: string, cls: string) =>
    `<img src="${esc(src)}" alt="${esc(abbrev)}" title="${esc(abbrev)}" class="yf-game-logo ${cls}" loading="lazy" onerror="this.style.visibility='hidden'">`;
  return `<span class="yf-result">${logo(c.teamLogo, c.teamAbbrev, "yf-own")}<span class="yf-score"><strong class="yf-own-score">${c.teamScore}</strong>–<span class="yf-opp-score">${c.oppScore}</span></span>${logo(c.oppLogo, c.oppAbbrev, "yf-opp")}</span>`;
}

function gameCell(c: GameContext): string {
  const live = c.live ? `<span class="yf-live"><span class="live-dot"></span>${esc(c.liveText || "LIVE")}</span>` : "";
  return `<td class="yf-game">${gameResultInline(c)}${live}</td>`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function renderFinnishNightSkaters(rows: NightSkater[]): string {
  if (!rows.length) return "";
  const body = rows
    .map(
      (r) => `
      <tr>
        ${playerCell(r.player.player_id, r.player.name, r.player.headshot, r.player.position, r.teamLogo, r.teamAbbrev)}
        ${gameCell(r)}
        <td>${r.player.goals}</td>
        <td>${r.player.assists}</td>
        <td class="st-pts">${r.player.points}</td>
        <td>${signed(r.player.plus_minus)}</td>
        <td>${esc(r.player.toi)}</td>
      </tr>`,
    )
    .join("");
  return `
  <div class="stand-scroll yf-scroll">
    <table class="stand-table yf-table">
      <thead>
        <tr>
          <th class="st-first">Pelaaja</th>
          <th>Ottelu</th>
          <th title="Maalit">M</th>
          <th title="Syötöt">S</th>
          <th title="Pisteet">P</th>
          <th title="Plus/miinus">+/-</th>
          <th title="Peliaika">Aika</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderFinnishNightGoalies(rows: NightGoalie[]): string {
  if (!rows.length) return "";
  const body = rows
    .map(
      (r) => `
      <tr>
        ${playerCell(r.player.player_id, r.player.name, r.player.headshot, "MV", r.teamLogo, r.teamAbbrev)}
        ${gameCell(r)}
        <td>${r.player.saves}/${r.player.shots_against}</td>
        <td class="st-pts">${r.player.shots_against > 0 ? r.player.save_pct.toFixed(3) : "–"}</td>
        <td>${goalieDecisionFi(r.player.decision)}</td>
        <td>${esc(r.player.toi)}</td>
      </tr>`,
    )
    .join("");
  return `
  <div class="stand-scroll yf-scroll">
    <table class="stand-table yf-table">
      <thead>
        <tr>
          <th class="st-first">Maalivahti</th>
          <th>Ottelu</th>
          <th title="Torjunnat / laukaukset">Torj.</th>
          <th title="Torjuntaprosentti">T-%</th>
          <th title="Päätös: V voitto, H tappio, JH jatkoaikatappio">Pää.</th>
          <th title="Peliaika">Aika</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

export function renderFinnishNightSection(
  night: { skaters: NightSkater[]; goalies: NightGoalie[] },
  heroStyle: string,
): string {
  const empty = !night.skaters.length && !night.goalies.length;
  return `
<section class="section-tile hero-tinted yf-section" style="${esc(heroStyle)}">
  <h2 class="section-title">${flagImg("fi")} Yön suomalaiset</h2>
  ${empty ? `<p class="empty-note">Ei suomalaisia pelaajia yön otteluissa.</p>` : renderFinnishNightSkaters(night.skaters) + renderFinnishNightGoalies(night.goalies)}
</section>`;
}
