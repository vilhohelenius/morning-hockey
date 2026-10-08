// /suosikit: the signed-in user's favorite teams and players in one view.
// Top: a sentence recap of the latest game night plus two compact lists
// (teams / players, side by side even on a phone) that include favorites
// who didn't play; then tonight's games with a favorite in them; then the
// season / last-5 stats tables with a toggle. Managing the favorites still
// lives on /omat (Asetukset).
//
// "Last night" = the latest game night (gameNight, bingo.ts) that has a
// finished game. A row whose team/player played links to that game's report,
// otherwise to the team/player page.

import { currentUsername } from "./_shared/auth";
import { gameNight, nightLabel } from "./_shared/bingo";
import {
  buildDigest,
  currentSeasonId,
  fetchPlayerGameLog,
  goalieLast,
  skaterLast,
  teamLast,
  teamNickname,
  type DigestScorer,
  type GameLogEntry,
} from "./_shared/favorites";
import { abbreviatedName, escapeHtml, helsinkiParts, icon, shortWeekdayDate, teamLogoUrl } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, GameRow, StandingsRow, TeamRosterGoalieRow, TeamRosterSkaterRow, TeamSeasonStatsRow } from "./_shared/types";

const LAST_N = 5;
const DIVISION_SHORT: Record<string, string> = { Atlantic: "Atl", Metropolitan: "Met", Central: "Cen", Pacific: "Pac" };

const placeholders = (n: number) => Array(n).fill("?").join(",");
const lastName = (full: string) => full.slice(full.lastIndexOf(" ") + 1);
const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

// Season / last-5 values live in the same cell and the toggle (app.js) flips
// which one shows.
const dual = (season: string | number, last: string | number) =>
  `<span class="sk-s">${season}</span><span class="sk-l">${last}</span>`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const pct = (v: number | null) => (v === null ? "–" : v.toFixed(3).replace(/^0/, ""));

interface FavSkater {
  row: TeamRosterSkaterRow;
  log: GameLogEntry[];
}
interface FavGoalie {
  row: TeamRosterGoalieRow;
  log: GameLogEntry[];
}

function renderResult(game: GameRow, abbrev: string): { chip: string; score: string } {
  const home = game.home_abbrev === abbrev;
  const us = home ? game.home_score : game.away_score;
  const them = home ? game.away_score : game.home_score;
  const cls = us > them ? "w" : game.final_type === "REG" ? "l" : "otl";
  const label = us > them ? "W" : game.final_type === "REG" ? "L" : "OT";
  return { chip: `<span class="sk-res ${cls}">${label}</span>`, score: `${us}–${them}` };
}

function nextGameLabel(game: GameRow | undefined, abbrev: string): string {
  if (!game) return "–";
  const { date, hour, minute } = helsinkiParts(game.start_time_utc);
  const weekday = shortWeekdayDate(date).split(" ")[0];
  const away = game.away_abbrev === abbrev;
  return `${weekday} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${away ? "@" : "vs"} ${away ? game.home_abbrev : game.away_abbrev}`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const layout = (content: string) =>
    renderLayout({ title: "Suosikit · Morning Hockey", headerTitle: "Suosikit", activePage: "suosikit", request, env, content });

  const username = currentUsername(request);
  if (!username) {
    return html(
      await layout(`
<header class="page-header"><h1>${icon("star")} Suosikit</h1></header>
<p class="empty-note"><a href="/kirjaudu?next=${encodeURIComponent("/suosikit")}">Kirjaudu sisään</a> nähdäksesi suosikkisi.</p>`),
    );
  }

  const db = env.DB;
  const [{ results: favTeamRows }, { results: favPlayerRows }] = await Promise.all([
    db.prepare("SELECT team_abbrev FROM favorite_teams WHERE username = ?").bind(username).all<{ team_abbrev: string }>(),
    db.prepare("SELECT player_id, is_goalie FROM favorite_players WHERE username = ?").bind(username).all<{ player_id: number; is_goalie: number }>(),
  ]);

  if (!favTeamRows.length && !favPlayerRows.length) {
    return html(
      await layout(`
<header class="page-header"><h1>${icon("star")} Suosikit</h1></header>
<p class="empty-note">Ei vielä suosikkeja. Lisää joukkueita ja pelaajia <a href="/omat?osio=suosikit">Asetukset</a>-sivulla.</p>`),
    );
  }

  const teamAbbrevs = favTeamRows.map((r) => r.team_abbrev);
  const skaterIds = favPlayerRows.filter((r) => !r.is_goalie).map((r) => r.player_id);
  const goalieIds = favPlayerRows.filter((r) => r.is_goalie).map((r) => r.player_id);

  const [standings, seasonStats, skaterRows, goalieRows] = await Promise.all([
    teamAbbrevs.length
      ? db.prepare(`SELECT * FROM standings_rows WHERE abbrev IN (${placeholders(teamAbbrevs.length)})`).bind(...teamAbbrevs).all<StandingsRow>()
      : { results: [] as StandingsRow[] },
    teamAbbrevs.length
      ? db.prepare(`SELECT * FROM team_season_stats WHERE team_abbrev IN (${placeholders(teamAbbrevs.length)})`).bind(...teamAbbrevs).all<TeamSeasonStatsRow>()
      : { results: [] as TeamSeasonStatsRow[] },
    skaterIds.length
      ? db.prepare(`SELECT * FROM team_roster_skaters WHERE player_id IN (${placeholders(skaterIds.length)})`).bind(...skaterIds).all<TeamRosterSkaterRow>()
      : { results: [] as TeamRosterSkaterRow[] },
    goalieIds.length
      ? db.prepare(`SELECT * FROM team_roster_goalies WHERE player_id IN (${placeholders(goalieIds.length)})`).bind(...goalieIds).all<TeamRosterGoalieRow>()
      : { results: [] as TeamRosterGoalieRow[] },
  ]);

  const seasonId = currentSeasonId();
  const [skaterLogs, goalieLogs] = await Promise.all([
    Promise.all(skaterRows.results.map((row) => fetchPlayerGameLog(row.player_id, seasonId))),
    Promise.all(goalieRows.results.map((row) => fetchPlayerGameLog(row.player_id, seasonId))),
  ]);
  const skaters: FavSkater[] = skaterRows.results.map((row, i) => ({ row, log: skaterLogs[i] }));
  const goalies: FavGoalie[] = goalieRows.results.map((row, i) => ({ row, log: goalieLogs[i] }));

  // Every team that matters here: favorite teams plus the teams of favorite players.
  const relevant = [...new Set([...teamAbbrevs, ...skaters.map((s) => s.row.team_abbrev), ...goalies.map((g) => g.row.team_abbrev)])];
  const { results: games } = await db
    .prepare(`SELECT * FROM games WHERE away_abbrev IN (${placeholders(relevant.length)}) OR home_abbrev IN (${placeholders(relevant.length)})`)
    .bind(...relevant, ...relevant)
    .all<GameRow>();
  const latestFinished = await db
    .prepare("SELECT start_time_utc FROM games WHERE is_finished = 1 ORDER BY start_time_utc DESC LIMIT 1")
    .first<{ start_time_utc: string }>();

  const recapNight = latestFinished ? gameNight(latestFinished.start_time_utc) : null;
  const recapGames = games.filter((g) => g.is_finished === 1 && recapNight !== null && gameNight(g.start_time_utc) === recapNight);
  const recapGameFor = (abbrev: string) => recapGames.find((g) => g.away_abbrev === abbrev || g.home_abbrev === abbrev);

  const upcoming = games.filter((g) => g.is_finished === 0).sort((a, b) => a.start_time_utc.localeCompare(b.start_time_utc));
  const nextNight = upcoming.length ? gameNight(upcoming[0].start_time_utc) : null;
  const tonight = upcoming.filter((g) => gameNight(g.start_time_utc) === nextNight);
  const nextGameFor = (abbrev: string) => upcoming.find((g) => g.away_abbrev === abbrev || g.home_abbrev === abbrev);

  // ---- recap lists ----
  const standingsByAbbrev = new Map(standings.results.map((s) => [s.abbrev, s]));
  const favTeams = teamAbbrevs
    .map((abbrev) => standingsByAbbrev.get(abbrev))
    .filter((s): s is StandingsRow => !!s)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const teamRecapRows = favTeams
    .map((team) => ({ team, game: recapGameFor(team.abbrev) }))
    .sort((a, b) => Number(!!b.game) - Number(!!a.game));

  const teamRecapHtml = teamRecapRows
    .map(({ team, game }) => {
      if (!game) {
        return `<a class="sk-row sk-dim" href="/joukkueet/${team.abbrev.toLowerCase()}"><img class="sk-logo" src="${escapeHtml(team.logo)}" alt="" loading="lazy"><b>${escapeHtml(team.abbrev)}</b><span class="sk-grow"></span><span class="sk-none">ei peliä</span></a>`;
      }
      const { chip, score } = renderResult(game, team.abbrev);
      return `<a class="sk-row" href="/ottelut/${game.game_id}"><img class="sk-logo" src="${escapeHtml(team.logo)}" alt="" loading="lazy"><b>${escapeHtml(team.abbrev)}</b><span class="sk-grow"></span>${chip}<span class="sk-score">${score}</span></a>`;
    })
    .join("");

  const recapIds = new Set(recapGames.map((g) => g.game_id));
  interface PlayerRecap {
    id: number;
    name: string;
    headshot: string;
    value: string;
    gameId: number | null;
    points: number;
    goals: number;
    assists: number;
    isGoalie: boolean;
  }
  const playerRecaps: PlayerRecap[] = [
    ...skaters.map(({ row, log }): PlayerRecap => {
      const entry = log.find((g) => recapIds.has(g.gameId));
      return {
        id: row.player_id,
        name: row.name,
        headshot: row.headshot,
        value: entry ? `${entry.goals}+${entry.assists}` : "–",
        gameId: entry?.gameId ?? null,
        points: entry?.points ?? 0,
        goals: entry?.goals ?? 0,
        assists: entry?.assists ?? 0,
        isGoalie: false,
      };
    }),
    ...goalies.map(({ row, log }): PlayerRecap => {
      const entry = log.find((g) => recapIds.has(g.gameId) && g.toiSeconds > 0);
      return {
        id: row.player_id,
        name: row.name,
        headshot: row.headshot,
        value: entry ? `${entry.shotsAgainst - entry.goalsAgainst}/${entry.shotsAgainst}` : "–",
        gameId: entry?.gameId ?? null,
        points: 0,
        goals: 0,
        assists: 0,
        isGoalie: true,
      };
    }),
  ].sort((a, b) => Number(b.gameId !== null) - Number(a.gameId !== null) || b.points - a.points || a.name.localeCompare(b.name));

  const playerRecapHtml = playerRecaps
    .map((p) => {
      const href = p.gameId !== null ? `/ottelut/${p.gameId}` : `/pelaajat/${p.id}`;
      const cls = `sk-row${p.points > 0 ? " sk-hot" : ""}${p.gameId === null ? " sk-dim" : ""}`;
      return `<a class="${cls}" href="${href}"><img class="sk-avatar" src="${escapeHtml(p.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="sk-name">${escapeHtml(abbreviatedName(p.name))}</span><span class="sk-grow"></span><span class="sk-score">${p.value}</span></a>`;
    })
    .join("");

  const digest = buildDigest(
    teamRecapRows
      .filter((r) => r.game)
      .map(({ team, game }) => {
        const home = game!.home_abbrev === team.abbrev;
        return {
          nickname: teamNickname(team.name),
          goalsFor: home ? game!.home_score : game!.away_score,
          goalsAgainst: home ? game!.away_score : game!.home_score,
          finalType: game!.final_type,
        };
      }),
    playerRecaps
      .filter((p) => p.points > 0)
      .map((p): DigestScorer => ({ lastName: lastName(p.name), goals: p.goals, assists: p.assists })),
    playerRecaps.filter((p) => !p.isGoalie && p.gameId !== null && p.points === 0).map((p) => lastName(p.name)),
  );

  // ---- tonight ----
  const favTeamSet = new Set(teamAbbrevs);
  const tonightHtml = tonight
    .map((game) => {
      const names = [
        ...[game.away_abbrev, game.home_abbrev].filter((a) => favTeamSet.has(a)).map((a) => teamNickname(standingsByAbbrev.get(a)?.name ?? a)),
        ...[...skaters.map((s) => s.row), ...goalies.map((g) => g.row)]
          .filter((p) => p.team_abbrev === game.away_abbrev || p.team_abbrev === game.home_abbrev)
          .map((p) => lastName(p.name)),
      ];
      if (!names.length) return "";
      const { hour, minute } = helsinkiParts(game.start_time_utc);
      return `<a class="sk-night-row" href="/ottelut/${game.game_id}"><span class="sk-time">${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}</span><span><b>${escapeHtml(game.away_abbrev)} – ${escapeHtml(game.home_abbrev)}</b><span class="sk-night-fav">Suosikkisi: ${names.map(escapeHtml).join(", ")}</span></span></a>`;
    })
    .join("");

  // ---- stats tables ----
  const statsByAbbrev = new Map(seasonStats.results.map((s) => [s.team_abbrev, s]));
  const teamRows = favTeams
    .map((team, i) => {
      const last = teamLast(games, team.abbrev, LAST_N);
      const season = statsByAbbrev.get(team.abbrev);
      const chips = last.results.map((r) => `<span class="form-chip result-${r.toLowerCase()}">${r === "OTL" ? "OT" : r}</span>`).join("");
      return `
      <tr>
        <td class="col-rank">${i + 1}</td>
        <td><a href="/joukkueet/${team.abbrev.toLowerCase()}" class="player-cell"><img src="${escapeHtml(team.logo)}" alt="" loading="lazy"><span class="player-name">${escapeHtml(team.name)}<span class="player-meta">${team.division_rank}. ${DIVISION_SHORT[team.division] ?? escapeHtml(team.division)}</span></span></a></td>
        <td>${dual(team.games_played, last.results.length)}</td>
        <td>${dual(`${team.wins}-${team.losses}-${team.ot_losses}`, `${last.wins}-${last.losses}-${last.otLosses}`)}</td>
        <td class="stat-strong">${dual(team.points, last.points)}</td>
        <td>${dual(season ? `${season.goals_for}–${season.goals_against}` : "–", `${last.gf}–${last.ga}`)}</td>
        <td><span class="form-chips">${chips || "–"}</span></td>
        <td class="sk-next">${escapeHtml(nextGameLabel(nextGameFor(team.abbrev), team.abbrev))}</td>
      </tr>`;
    })
    .join("");

  const playerCell = (p: { player_id: number; name: string; headshot: string; team_abbrev: string }) =>
    `<td><a href="/pelaajat/${p.player_id}" class="player-cell"><img src="${escapeHtml(p.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="player-name">${escapeHtml(p.name)}<span class="player-meta">${escapeHtml(p.team_abbrev)}</span></span></a></td>`;

  const skaterTableRows = skaters
    .sort((a, b) => b.row.points - a.row.points || b.row.goals - a.row.goals || a.row.name.localeCompare(b.row.name))
    .map(({ row, log }, i) => {
      const last = skaterLast(log, LAST_N);
      return `
      <tr>
        <td class="col-rank">${i + 1}</td>${playerCell(row)}
        <td>${dual(row.games_played, last.gp)}</td>
        <td>${dual(row.goals, last.goals)}</td>
        <td>${dual(row.assists, last.assists)}</td>
        <td class="stat-strong">${dual(row.points, last.points)}</td>
        <td>${dual(signed(row.plus_minus), signed(last.plusMinus))}</td>
      </tr>`;
    })
    .join("");

  const goalieTableRows = goalies
    .sort((a, b) => b.row.save_pct - a.row.save_pct)
    .map(({ row, log }, i) => {
      const last = goalieLast(log, LAST_N);
      return `
      <tr>
        <td class="col-rank">${i + 1}</td>${playerCell(row)}
        <td>${dual(row.games_played, last.gp)}</td>
        <td>${dual(row.wins, last.wins)}</td>
        <td class="stat-strong">${dual(pct(row.save_pct), pct(last.savePct))}</td>
        <td>${dual(row.goals_against_average.toFixed(2), last.gaa === null ? "–" : last.gaa.toFixed(2))}</td>
      </tr>`;
    })
    .join("");

  const table = (head: string, rows: string) =>
    `<div class="stats-table-wrap"><table class="stats-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;

  const content = `
<header class="page-header"><h1>${icon("star")} Suosikit</h1></header>

${recapNight ? `<p class="sk-when">Viime yö ${nightLabel(recapNight)}</p>` : ""}
<p class="sk-digest">${digest}</p>

<div class="sk-duo">
  <section><h2 class="sk-h">Joukkueet</h2>${teamRecapHtml ? `<div class="sk-list">${teamRecapHtml}</div>` : `<p class="empty-note">Ei suosikkijoukkueita.</p>`}</section>
  <section><h2 class="sk-h">Pelaajat</h2>${playerRecapHtml ? `<div class="sk-list">${playerRecapHtml}</div>` : `<p class="empty-note">Ei suosikkipelaajia.</p>`}</section>
</div>

${tonightHtml ? `<h2 class="sk-h">Tänä yönä</h2><div class="sk-list">${tonightHtml}</div>` : ""}

<div id="sk-stats" class="sk-stats">
  <div class="sk-stats-head">
    <h2 class="sk-h">Tilastot</h2>
    <div class="sk-seg" role="group" aria-label="Jakso">
      <button type="button" class="day-pill active" data-sk-mode="s">Koko kausi</button>
      <button type="button" class="day-pill" data-sk-mode="l">Viimeiset ${LAST_N}</button>
    </div>
  </div>
  ${teamRows ? table(`<th class="col-rank">#</th><th>Joukkue</th><th>GP</th><th>W-L-OTL</th><th>PTS</th><th>GF–GA</th><th>Muoto</th><th>Seuraava</th>`, teamRows) : ""}
  ${skaterTableRows ? table(`<th class="col-rank">#</th><th>Pelaaja</th><th>GP</th><th>G</th><th>A</th><th>PTS</th><th>+/-</th>`, skaterTableRows) : ""}
  ${goalieTableRows ? table(`<th class="col-rank">#</th><th>Maalivahti</th><th>GP</th><th>W</th><th>SV%</th><th>GAA</th>`, goalieTableRows) : ""}
</div>`;

  return html(await layout(content));
};
