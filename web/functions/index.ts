// Dashboard (homepage). Combines: last night's (or tonight's, once it's
// started) results with Finnish highlights and a click-to-expand goal/
// team-stats info box, top-5 Suomipörssi, top-5 Tilastot, the signed-in
// user's favorite-team mini-boxes (recent/next game + current top scorer),
// and the day's games (Helsinki calendar day, live carry-over past
// midnight, ?pv=-1/0/1 to browse a day back/forward) plus the next round.
//
// "Last night's games" used to be keyed off the once-daily digest sync
// job's own `digests` table, which meant the section could only ever
// change once a day, at whatever fixed UTC time that cron happened to run
// -- wrong exactly at the edge case that matters: the calendar day
// changing in Finland before the next night's games have actually started.
// Fixed 2026-10-01 by picking the date to show directly from `games`
// (synced every 30 min, always current): the most recent date with any
// game that has actually started, finished or not.
//
// The Finnish per-game highlights (scorer/goalie lines) and the click-to-
// expand info box (#game-details, same mechanism as the original static
// site and as sarjataulukko.ts's team snapshot) both come straight off
// _shared/boxScoreCache's getBoxScore -- same cache /ottelut/[gameId] reads
// and writes, so a game already visited there (or by an earlier dashboard
// load) shows instantly; a brand new one fetches+caches it on this page
// load instead. This replaced an earlier version keyed off the once-daily
// digest sync's digest_scorers/digest_goalies tables, which meant a
// Finnish player's line could take until the next day's cron to appear
// even though the box score (and the score itself) was already available
// -- now it shows up the moment the box score does, same as everything
// else on this page. Only attempted for finished games.
//
// The "Aiemmat yöt" archive footer linking to nights/<date>.html isn't
// ported -- superseded by /arkisto, a real route here.

import { currentUsername, readVersionCookie, readTulospiiloBypassDate, readTulospiiloCookie } from "./_shared/auth";
import { getBoxScore, missingBoxRetryScript } from "./_shared/boxScoreCache";
import { buildTimeline } from "./_shared/boxscore";
import {
  finnishGoalieLines,
  finnishScorerLines,
  isLive,
  liveBadgeText,
  renderGameCard,
  type FinnGoalieLine,
  type FinnScorerLine,
} from "./_shared/gameCard";
import { fetchGameTeamXg, fetchGamesGoalieGsax, teamXgStatRows } from "./_shared/xg";
import { resolveHighlightsUrl } from "./_shared/youtube";
import { MAX_DAY_OFFSET, MIN_DAY_OFFSET, clampDayOffset, selectDayGames } from "./_shared/dayGames";
import { flagImg, icon, addDays, escapeHtml, helsinkiParts, helsinkiToday, secondsToHelsinkiMidnight, humanDate, nationalityFlag, shortDate, teamHeroBackgroundStyle } from "./_shared/format";
import { buildFinnishNight, renderFinnishNightSection, type NightGame } from "./_shared/finnishNight";
import { renderLayout } from "./_shared/layout";
import type {
  Env,
  FinnishSkaterRow,
  GameRow,
  SkaterStatsRow,
  StandingsRow,
  TeamRosterSkaterRow,
} from "./_shared/types";

function renderFinnishSkaterRow(row: FinnishSkaterRow, rank: number): string {
  return `
      <tr>
        <td class="col-rank">${rank}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">${escapeHtml(row.name)}<span class="player-meta">${escapeHtml(row.position)} · <img src="${escapeHtml(row.logo)}" alt="${escapeHtml(row.team_abbrev)}" class="table-team-logo" loading="lazy"></span></span>
          </a>
        </td>
        <td>${row.games_played}</td>
        <td>${row.goals}</td>
        <td>${row.assists}</td>
        <td class="stat-strong">${row.points}</td>
      </tr>`;
}

function renderLeagueSkaterRow(row: SkaterStatsRow, rank: number): string {
  return `
      <tr>
        <td class="col-rank">${rank}</td>
        <td>
          <a href="/pelaajat/${row.player_id}" class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(row.name)}
              <span class="player-meta">${nationalityFlag(row.nationality)} · ${escapeHtml(row.position)} · <img src="${escapeHtml(row.logo)}" alt="${escapeHtml(row.team_abbrev)}" class="table-team-logo" loading="lazy"></span>
            </span>
          </a>
        </td>
        <td>${row.games_played}</td>
        <td>${row.goals}</td>
        <td>${row.assists}</td>
        <td class="stat-strong">${row.points}</td>
      </tr>`;
}

function statTeaserTable(
  title: string,
  rows: string[],
  emptyMessage: string,
  archiveHref: string,
  archiveLabel: string,
  heroStyle?: string,
): string {
  return `
<section class="section-tile${heroStyle ? " hero-tinted" : ""}"${heroStyle ? ` style="${escapeHtml(heroStyle)}"` : ""}>
  <h2 class="section-title">${title}</h2>
  ${
    rows.length
      ? `<div class="stats-table-wrap">
    <table class="stats-table porssi-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th>Pelaaja</th>
          <th>O</th>
          <th>M</th>
          <th>S</th>
          <th>P</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  </div>`
      : `<p class="empty-note">${escapeHtml(emptyMessage)}</p>`
  }
  <a class="archive-link" href="${archiveHref}">${archiveLabel}</a>
</section>`;
}

function renderTeamGameLine(team: StandingsRow, game: GameRow, played: boolean): string {
  const isHome = game.home_abbrev === team.abbrev;
  const opponentAbbrev = isHome ? game.away_abbrev : game.home_abbrev;
  const opponentLogo = isHome ? game.away_logo : game.home_logo;
  const scoreHtml = played
    ? (() => {
        const teamScore = isHome ? game.home_score : game.away_score;
        const opponentScore = isHome ? game.away_score : game.home_score;
        return `<span class="fav-row-meta">${teamScore}–${opponentScore} ${teamScore > opponentScore ? "V" : "H"}</span>`;
      })()
    : (() => {
        const { hour, minute } = helsinkiParts(game.start_time_utc);
        return `<span class="fav-row-meta">${hour}:${String(minute).padStart(2, "0")}</span>`;
      })();
  return `
  <div class="fav-team-card-game">
    <span>${shortDate(game.date)}</span>
    <span>${isHome ? "vs" : "@"}</span>
    <img src="${escapeHtml(opponentLogo)}" alt="${escapeHtml(opponentAbbrev)}" class="fav-team-card-game-logo" loading="lazy">
    ${played ? "" : `<span>${escapeHtml(opponentAbbrev)}</span>`}
    ${scoreHtml}
  </div>`;
}

function renderFavoriteTeamCard(
  team: StandingsRow,
  recentGame: GameRow | null,
  upcomingGame: GameRow | null,
  topSkater: TeamRosterSkaterRow | null,
): string {
  const scorerHtml = topSkater
    ? `
  <div class="fav-team-card-scorer">
    <img src="${escapeHtml(topSkater.headshot)}" alt="" class="fav-team-card-photo" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="fav-team-card-scorer-info">
      <span>${nationalityFlag(topSkater.nationality)} ${escapeHtml(topSkater.name)}</span>
      <span class="fav-row-meta">${topSkater.points} p (${topSkater.goals}+${topSkater.assists})</span>
    </div>
  </div>`
    : "";

  return `
<a class="fav-team-card hero-tinted" data-abbr="${escapeHtml(team.abbrev)}" href="/joukkueet/${team.abbrev.toLowerCase()}" style="${escapeHtml(teamHeroBackgroundStyle(team.abbrev))}">
  <div class="fav-team-card-top">
    <img src="${escapeHtml(team.logo)}" alt="" class="fav-team-card-logo" loading="lazy">
    <div>
      <span class="fav-team-card-name">${escapeHtml(team.name)}</span>
      <span class="fav-row-meta">${escapeHtml(team.division)}: ${team.division_rank}. sija</span>
    </div>
  </div>
  <div class="fav-team-card-schedule">
    ${recentGame ? renderTeamGameLine(team, recentGame, true) : ""}
    ${upcomingGame ? renderTeamGameLine(team, upcomingGame, false) : ""}
  </div>
  ${scorerHtml}
</a>`;
}

function renderUpcomingCell(game: GameRow): string {
  const { hour, minute } = helsinkiParts(game.start_time_utc);
  const time = `${hour}:${String(minute).padStart(2, "0")}`;
  return `
<a class="upcoming-cell" href="/ottelut/${game.game_id}">
  <div class="upcoming-teams">
    <img src="${escapeHtml(game.away_logo)}" alt="" class="upcoming-logo" loading="lazy">
    <span class="dash">–</span>
    <img src="${escapeHtml(game.home_logo)}" alt="" class="upcoming-logo" loading="lazy">
  </div>
  <div class="upcoming-abbrevs">${escapeHtml(game.away_abbrev)} – ${escapeHtml(game.home_abbrev)}</div>
  <div class="upcoming-time">${time}</div>
</a>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const db = context.env.DB;

  // ---------- The day's games ----------

  const currentRound = await db
    .prepare("SELECT date FROM games WHERE game_state != 'FUT' ORDER BY date DESC LIMIT 1")
    .first<{ date: string }>();

  // Tulospiilo mode: jump straight to the spoiler-free view instead of the
  // normal dashboard. ?tulospiilo=ohita (set by that page's "Poistu
  // tulospiilosta" button) bypasses this once, without touching the user's
  // saved preference -- otherwise that button would just redirect right
  // back here. tulospiilo_bypass_date (set by /tulospiilo's own inline
  // script once every game in the round has been checked off) bypasses it
  // for that specific round's date, same reasoning but automatic.
  if (
    readTulospiiloCookie(context.request) &&
    url.searchParams.get("tulospiilo") !== "ohita" &&
    readTulospiiloBypassDate(context.request) !== currentRound?.date
  ) {
    return new Response(null, { status: 302, headers: { Location: "/tulospiilo", "Cache-Control": "no-store" } });
  }

  const username = currentUsername(context.request);

  // Which Helsinki calendar day is initially shown: ?pv=-1..+3 (clamped).
  const dayOffset = clampDayOffset(url.searchParams.get("pv"));
  const todayDate = helsinkiToday();

  // Started games of today's panel (offset 0) with their box scores, reused
  // for "Yön suomalaiset" below -- no extra fetches.
  const nightGames: NightGame[] = [];

  const gameDetails: Record<number, { timeline?: unknown; team_stats?: unknown; youtube_url?: string }> = {};
  let missingBoxes = 0;

  // All three days (yesterday/today/tomorrow) are rendered up front as
  // hidden panels, so the arrows switch client-side (app.js) with no reload.
  // Only today's panel carries over still-live games from the previous date.
  // For the HTTP cache lifetime below: any live game / earliest upcoming start on today's panel.
  let anyLive = false;
  let nextStartMs = Infinity;

  async function renderDay(offset: number): Promise<{ title: string; html: string; count: number }> {
    const date = addDays(todayDate, offset);
    const { results } = await db
      .prepare("SELECT * FROM games WHERE date = ? OR (date = ? AND is_finished = 0) ORDER BY start_time_utc ASC")
      .bind(date, addDays(date, -1))
      .all<GameRow>();
    const roundGames = selectDayGames(results, date, offset === 0);
    if (offset === 0) {
      for (const g of roundGames) {
        if (g.is_finished) continue;
        if (isLive(g)) anyLive = true;
        else nextStartMs = Math.min(nextStartMs, new Date(g.start_time_utc).getTime());
      }
    }
    let gameCardsHtml = "";
    const gsaxByGame = await fetchGamesGoalieGsax(db, roundGames.filter((g) => g.is_finished || isLive(g)).map((g) => g.game_id));

    for (const game of roundGames) {
      let scorers: FinnScorerLine[] = [];
      let goalies: FinnGoalieLine[] = [];

      // Finished or live: the shared cached-or-fetch path (short TTL while
      // live, permanent once finished -- see _shared/boxScoreCache).
      // Not started yet: no box score exists.
      const box = game.is_finished || isLive(game) ? (await getBoxScore(db, game)).box : null;
      if (!box && (game.is_finished || isLive(game))) missingBoxes++;

      // The card's own score otherwise only updates every ~30 min (the
      // fast tier's own sync cadence) -- for a live game, the box score
      // fetched above is already current (fetched fresh this request), so
      // use its running tally instead of waiting on the next fast-tier sync.
      let displayGame = game;

      if (game.is_finished) {
        gameDetails[game.game_id] = { youtube_url: await resolveHighlightsUrl(db, context.env, game) };
      }

      if (box && offset === 0) {
        const live = !game.is_finished && isLive(game);
        nightGames.push({
          game,
          awaySkaters: box.awaySkaters,
          homeSkaters: box.homeSkaters,
          awayGoalies: box.awayGoalies,
          homeGoalies: box.homeGoalies,
          live,
          liveText: live ? liveBadgeText(box.live ?? null) : "",
        });
      }

      if (box) {
        const gameXg = game.is_finished ? await fetchGameTeamXg(db, game.game_id, game.away_abbrev, game.home_abbrev) : null;
        gameDetails[game.game_id] = { ...gameDetails[game.game_id], timeline: buildTimeline(box.goals, box.penalties, game.away_abbrev, box.shootout), team_stats: [...box.teamStats, ...(gameXg ? teamXgStatRows(gameXg.away, gameXg.home, true) : [])] };
        scorers = [
          ...finnishScorerLines(box.awaySkaters, game.away_abbrev),
          ...finnishScorerLines(box.homeSkaters, game.home_abbrev),
        ].sort((a, b) => b.goals + b.assists - (a.goals + a.assists));
        goalies = [
          ...finnishGoalieLines(box.awayGoalies, game.away_abbrev, gsaxByGame.get(game.game_id)),
          ...finnishGoalieLines(box.homeGoalies, game.home_abbrev, gsaxByGame.get(game.game_id)),
        ];
        if (isLive(game) && box.goals.length) {
          const lastGoal = box.goals[box.goals.length - 1];
          displayGame = { ...game, away_score: lastGoal.away_score, home_score: lastGoal.home_score };
        }
      }

      gameCardsHtml += renderGameCard(displayGame, scorers, goalies, box?.live ?? null);
    }

    // Two lines: a headline (relative day, or just the weekday further out) and a
    // smaller line with the date + game count. Inserted as HTML (see app.js).
    const count = `${roundGames.length} ${roundGames.length === 1 ? "ottelu" : "ottelua"}`;
    const [weekday, ...dateParts] = humanDate(date).split(" ");
    const relative = offset === 0 ? "Tämän päivän ottelut" : offset === -1 ? "Eilisen ottelut" : offset === 1 ? "Huomisen ottelut" : "";
    const title = relative
      ? `${relative}<span class="day-title-sub">${weekday} ${dateParts.join(" ")} · ${count}</span>`
      : `${weekday}<span class="day-title-sub">${dateParts.join(" ")} · ${count}</span>`;
    return {
      title,
      count: roundGames.length,
      html: roundGames.length ? `<div class="game-list">${gameCardsHtml}</div>` : `<p class="empty-note">Ei otteluita tänä päivänä.</p>`,
    };
  }

  const dayOffsets = Array.from({ length: MAX_DAY_OFFSET - MIN_DAY_OFFSET + 1 }, (_, i) => MIN_DAY_OFFSET + i);
  const days = await Promise.all(dayOffsets.map(renderDay));
  const dayPanelsHtml = days
    .map(
      (d, i) =>
        `<div class="day-panel" data-offset="${dayOffsets[i]}" data-title="${escapeHtml(d.title)}"${dayOffsets[i] === dayOffset ? "" : " hidden"}>${d.html}</div>`,
    )
    .join("");

  // ---------- Stat teasers ----------

  const { results: finSkaters } = await db
    .prepare("SELECT * FROM finnish_skater_stats ORDER BY points DESC, goals DESC, name ASC LIMIT 5")
    .all<FinnishSkaterRow>();

  const { results: leagueSkaters } = await db
    .prepare("SELECT * FROM skater_season_stats ORDER BY points DESC, goals DESC, name ASC LIMIT 5")
    .all<SkaterStatsRow>();

  // ---------- Favorite-team mini-boxes ----------

  let favoriteTeamsHtml = "";
  if (username) {
    const { results: favoriteTeams } = await db
      .prepare(
        `SELECT s.* FROM favorite_teams f JOIN standings_rows s ON s.abbrev = f.team_abbrev
         WHERE f.username = ? ORDER BY s.name`,
      )
      .bind(username)
      .all<StandingsRow>();

    if (favoriteTeams.length) {
      const cards: string[] = [];
      for (const team of favoriteTeams) {
        const [topSkater, recentGame, upcomingGame] = await Promise.all([
          db
            .prepare("SELECT * FROM team_roster_skaters WHERE team_abbrev = ? ORDER BY points DESC, goals DESC LIMIT 1")
            .bind(team.abbrev)
            .first<TeamRosterSkaterRow>(),
          db
            .prepare(
              "SELECT * FROM games WHERE (away_abbrev = ? OR home_abbrev = ?) AND is_finished = 1 ORDER BY date DESC LIMIT 1",
            )
            .bind(team.abbrev, team.abbrev)
            .first<GameRow>(),
          db
            .prepare(
              "SELECT * FROM games WHERE (away_abbrev = ? OR home_abbrev = ?) AND is_finished = 0 ORDER BY date ASC LIMIT 1",
            )
            .bind(team.abbrev, team.abbrev)
            .first<GameRow>(),
        ]);
        cards.push(renderFavoriteTeamCard(team, recentGame ?? null, upcomingGame ?? null, topSkater ?? null));
      }
      favoriteTeamsHtml = `
<section>
  <h2 class="section-title">${icon("star")} Suosikkijoukkueet</h2>
  <div class="fav-team-grid">${cards.join("")}</div>
</section>`;
    }
  }

  // ---------- Next upcoming round ----------

  // The first day after today with unplayed games (the very next round),
  // even though that day is also browsable with the arrows above.
  const nextRound = await db
    .prepare("SELECT date FROM games WHERE is_finished = 0 AND date > ? ORDER BY date ASC LIMIT 1")
    .bind(todayDate)
    .first<{ date: string }>();

  let upcomingHtml = "";
  if (nextRound) {
    const { results: upcomingGames } = await db
      .prepare("SELECT * FROM games WHERE date = ? ORDER BY start_time_utc ASC")
      .bind(nextRound.date)
      .all<GameRow>();

    upcomingHtml = `
<section class="section-tile">
  <h2 class="section-title">${icon("calendar")} Seuraava ottelukierros</h2>
  <p class="subtitle">${escapeHtml(humanDate(nextRound.date))}</p>
  <div class="upcoming-grid">${upcomingGames.map(renderUpcomingCell).join("")}</div>
  <a class="archive-link" href="/otteluohjelma">Koko otteluohjelma →</a>
</section>`;
  }

  // Same defensive escape render.py's _game_details_json / sarjataulukko.ts's
  // #team-snapshots already apply: a stray "</script" inside embedded JSON
  // can't close the tag early.
  const gameDetailsJson = JSON.stringify(gameDetails).replace(/<\//g, "<\\/");

  // Suomipörssi/Tilastot teasers below reuse NYR's/BOS's hero background
  // purely for the look (jersey texture + wires outline) -- neither teaser
  // is about a single team, and there's no "wires" crest for "Finland" or
  // "the NHL" to use instead.
  // Browser-cache lifetime (private + Vary: Cookie): 60 s while a game is
  // live, otherwise up to 30 min, never past the next game start or the
  // Helsinki midnight (the "today" panel changes then).
  // A page with games whose box score failed to load must not stay cached
  // (that left cards without timeline/stats for up to 30 min): minimum TTL.
  const cacheTtl = Math.max(
    15,
    missingBoxes ? 0 : Math.floor(anyLive ? 60 : Math.min(1800, secondsToHelsinkiMidnight(), (nextStartMs - Date.now()) / 1000)),
  );

  const dayHref = (offset: number) => (offset === 0 ? "/" : `/?pv=${offset}`);
  const dayTitle = days[dayOffset - MIN_DAY_OFFSET].title;

  const content = `
<header class="page-header">
  <img src="/static/brand/banner_light_fi.png" alt="Morning Hockey" class="brand-banner brand-banner-light">
  <img src="/static/brand/banner_dark_fi.png" alt="Morning Hockey" class="brand-banner brand-banner-dark">
</header>

<div class="dashboard">
<section class="dashboard-main">
  <div class="section-title-row" id="day-nav" data-offset="${dayOffset}" data-rendered="${Date.now()}" data-ttl="${cacheTtl}" data-ver="${escapeHtml(readVersionCookie(context.request))}">
    <a class="icon-btn day-nav-btn${dayOffset <= MIN_DAY_OFFSET ? " is-disabled" : ""}" ${dayOffset <= MIN_DAY_OFFSET ? 'aria-disabled="true"' : `href="${dayHref(dayOffset - 1)}"`} data-dir="-1" title="Edellinen päivä" aria-label="Edellinen päivä">${icon("chev-l")}</a>
    <h2 class="section-title" id="day-title">${dayTitle}</h2>
    <a class="icon-btn day-nav-btn${dayOffset >= MAX_DAY_OFFSET ? " is-disabled" : ""}" ${dayOffset >= MAX_DAY_OFFSET ? 'aria-disabled="true"' : `href="${dayHref(dayOffset + 1)}"`} data-dir="1" title="Seuraava päivä" aria-label="Seuraava päivä">${icon("chev-r")}</a>
    <button type="button" class="icon-btn refresh-btn" title="Päivitä ottelutiedot" aria-label="Päivitä ottelutiedot" onclick="location.reload()">${icon("refresh")}</button>
  </div>
  <div class="day-panels">${dayPanelsHtml}</div>
</section>

<div class="dashboard-side">
${renderFinnishNightSection(buildFinnishNight(nightGames), teamHeroBackgroundStyle("NYR", false))}

${favoriteTeamsHtml}

${statTeaserTable(`${flagImg("fi")} Suomipörssin kärki`, finSkaters.map((r, i) => renderFinnishSkaterRow(r, i + 1)), "Ei tilastoituja suomalaispelaajia vielä.", "/suomiporssi", "Koko Suomipörssi →", teamHeroBackgroundStyle("NYR", false))}

${statTeaserTable(`${icon("trend")} NHL:n kärkipörssi`, leagueSkaters.map((r, i) => renderLeagueSkaterRow(r, i + 1)), "Ei tilastoituja pelaajia vielä.", "/tilastot", "Koko Tilastot →", teamHeroBackgroundStyle("NHL", false))}

${upcomingHtml}
</div>
</div>

<script id="game-details" type="application/json">${gameDetailsJson}</script>
${missingBoxRetryScript(missingBoxes)}
`;

  const html = await renderLayout({
    title: "Morning Hockey",
    headerTitle: "Etusivu",
    activePage: "home",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": `private, max-age=${cacheTtl}`, Vary: "Cookie" } });
};
