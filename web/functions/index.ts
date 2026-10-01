// Dashboard (homepage). Combines: last night's (or tonight's, once it's
// started) results with Finnish highlights and a click-to-expand goal/
// team-stats info box, top-5 Suomipörssi, top-5 Tilastot, the signed-in
// user's favorite-team mini-boxes (recent/next game + current top scorer),
// and the next upcoming round of games.
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

import { currentUsername } from "./_shared/auth";
import { getBoxScore } from "./_shared/boxScoreCache";
import { decisionFi, escapeHtml, finalTypeFi, helsinkiParts, humanDate, nationalityFlag, shortDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type {
  Env,
  FinnishSkaterRow,
  GameRow,
  GoalieGameStat,
  PlayerGameStat,
  SkaterStatsRow,
  StandingsRow,
  TeamRosterSkaterRow,
} from "./_shared/types";

interface FinnScorerLine {
  name: string;
  team_abbrev: string;
  goals: number;
  assists: number;
}

interface FinnGoalieLine {
  name: string;
  team_abbrev: string;
  decision: string | null;
  saves: number;
  shots_against: number;
}

function finnishScorerLines(skaters: PlayerGameStat[], teamAbbrev: string): FinnScorerLine[] {
  return skaters
    .filter((p) => p.nationality === "FIN" && (p.goals > 0 || p.assists > 0))
    .map((p) => ({ name: p.name, team_abbrev: teamAbbrev, goals: p.goals, assists: p.assists }));
}

function finnishGoalieLines(goalies: GoalieGameStat[], teamAbbrev: string): FinnGoalieLine[] {
  return goalies
    .filter((g) => g.nationality === "FIN")
    .map((g) => ({ name: g.name, team_abbrev: teamAbbrev, decision: g.decision, saves: g.saves, shots_against: g.shots_against }));
}

function renderGameCard(game: GameRow, finalType: string, scorers: FinnScorerLine[], goalies: FinnGoalieLine[]): string {
  const finnStats =
    scorers.length || goalies.length
      ? `
  <div class="finn-stats">
    ${scorers
      .map(
        (s) => `
    <p class="stat-line scorer">
      <span class="flag">🇫🇮</span><strong>${escapeHtml(s.name)}</strong><span class="team-tag">${escapeHtml(s.team_abbrev)}</span>
      <span class="value">${s.goals}+${s.assists}</span>
    </p>`,
      )
      .join("")}
    ${goalies
      .map(
        (g) => `
    <p class="stat-line goalie">
      <span class="flag">🇫🇮</span><strong>${escapeHtml(g.name)}</strong><span class="team-tag">${escapeHtml(g.team_abbrev)}</span>
      <span class="value">${g.saves}/${g.shots_against}${g.decision ? ` · ${escapeHtml(decisionFi(g.decision))}` : ""}</span>
    </p>`,
      )
      .join("")}
  </div>`
      : "";

  return `
<section class="game-card game-card-trigger" data-game-id="${game.game_id}" tabindex="0" role="button" aria-expanded="false">
  <div class="score-row">
    <div class="team away">
      <img src="${escapeHtml(game.away_logo)}" alt="" class="logo" loading="lazy">
      <span class="abbrev">${escapeHtml(game.away_abbrev)}</span>
    </div>
    <div class="score">
      <span>${game.away_score}</span>
      <span class="dash">–</span>
      <span>${game.home_score}</span>
    </div>
    <div class="team home">
      <span class="abbrev">${escapeHtml(game.home_abbrev)}</span>
      <img src="${escapeHtml(game.home_logo)}" alt="" class="logo" loading="lazy">
    </div>
  </div>
  ${game.is_finished && finalType !== "REG" ? `<p class="ot-tag">${escapeHtml(finalTypeFi(finalType))}</p>` : ""}
  ${finnStats}
</section>`;
}

function renderFinnishSkaterRow(row: FinnishSkaterRow, rank: number): string {
  return `
      <tr>
        <td class="col-rank">${rank}</td>
        <td>
          <span class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">${escapeHtml(row.name)}<span class="player-meta">${escapeHtml(row.position)}</span></span>
          </span>
        </td>
        <td><img src="${escapeHtml(row.logo)}" alt="" class="table-team-logo" loading="lazy">${escapeHtml(row.team_abbrev)}</td>
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
          <span class="player-cell">
            <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(row.name)}
              <span class="player-meta">${nationalityFlag(row.nationality)} ${escapeHtml(row.nationality)} · ${escapeHtml(row.position)}</span>
            </span>
          </span>
        </td>
        <td><img src="${escapeHtml(row.logo)}" alt="" class="table-team-logo" loading="lazy">${escapeHtml(row.team_abbrev)}</td>
        <td>${row.games_played}</td>
        <td>${row.goals}</td>
        <td>${row.assists}</td>
        <td class="stat-strong">${row.points}</td>
      </tr>`;
}

function statTeaserTable(title: string, rows: string[], emptyMessage: string, archiveHref: string, archiveLabel: string): string {
  return `
<section class="section-tile">
  <h2 class="section-title">${title}</h2>
  ${
    rows.length
      ? `<div class="stats-table-wrap">
    <table class="stats-table">
      <thead>
        <tr>
          <th class="col-rank">#</th>
          <th>Pelaaja</th>
          <th>Jkk</th>
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
    : "";
  return `
  <div class="fav-team-card-game">
    <span>${shortDate(game.date)}</span>
    <span>${isHome ? "vs" : "@"}</span>
    <img src="${escapeHtml(opponentLogo)}" alt="" class="fav-team-card-game-logo" loading="lazy">
    <span>${escapeHtml(opponentAbbrev)}</span>
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
<a class="fav-team-card" href="/joukkueet/${team.abbrev.toLowerCase()}">
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
<div class="upcoming-cell">
  <div class="upcoming-teams">
    <img src="${escapeHtml(game.away_logo)}" alt="" class="upcoming-logo" loading="lazy">
    <span class="dash">–</span>
    <img src="${escapeHtml(game.home_logo)}" alt="" class="upcoming-logo" loading="lazy">
  </div>
  <div class="upcoming-abbrevs">${escapeHtml(game.away_abbrev)} – ${escapeHtml(game.home_abbrev)}</div>
  <div class="upcoming-time">${time}</div>
</div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const username = currentUsername(context.request);

  // ---------- Last night's (or tonight's) games ----------

  const currentRound = await db
    .prepare("SELECT date FROM games WHERE game_state != 'FUT' ORDER BY date DESC LIMIT 1")
    .first<{ date: string }>();

  let roundGames: GameRow[] = [];
  let gameCardsHtml = "";
  const gameDetails: Record<number, { goals: unknown; team_stats: unknown }> = {};

  if (currentRound) {
    const { results } = await db
      .prepare("SELECT * FROM games WHERE date = ? ORDER BY start_time_utc ASC")
      .bind(currentRound.date)
      .all<GameRow>();
    roundGames = results;

    for (const game of roundGames) {
      let finalType = "REG";
      let scorers: FinnScorerLine[] = [];
      let goalies: FinnGoalieLine[] = [];

      if (game.is_finished) {
        const { box } = await getBoxScore(db, game);
        if (box) {
          finalType = box.finalType;
          gameDetails[game.game_id] = { goals: box.goals, team_stats: box.teamStats };
          scorers = [
            ...finnishScorerLines(box.awaySkaters, game.away_abbrev),
            ...finnishScorerLines(box.homeSkaters, game.home_abbrev),
          ].sort((a, b) => b.goals + b.assists - (a.goals + a.assists));
          goalies = [
            ...finnishGoalieLines(box.awayGoalies, game.away_abbrev),
            ...finnishGoalieLines(box.homeGoalies, game.home_abbrev),
          ];
        }
      }

      gameCardsHtml += renderGameCard(game, finalType, scorers, goalies);
    }
  }

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
  <h2 class="section-title">⭐ Suosikkijoukkueet</h2>
  <div class="fav-team-grid">${cards.join("")}</div>
</section>`;
    }
  }

  // ---------- Next upcoming round ----------

  // Strictly after currentRound's date, not just "any unfinished game" --
  // otherwise, once tonight's round has started (so it's showing up top as
  // currentRound) but not every one of its games has tipped off yet, this
  // would show the same round a second time down here instead of the one
  // after it.
  const nextRound = currentRound
    ? await db
        .prepare("SELECT date FROM games WHERE is_finished = 0 AND date > ? ORDER BY date ASC LIMIT 1")
        .bind(currentRound.date)
        .first<{ date: string }>()
    : await db.prepare("SELECT date FROM games WHERE is_finished = 0 ORDER BY date ASC LIMIT 1").first<{ date: string }>();

  let upcomingHtml = "";
  if (nextRound) {
    const { results: upcomingGames } = await db
      .prepare("SELECT * FROM games WHERE date = ? ORDER BY start_time_utc ASC")
      .bind(nextRound.date)
      .all<GameRow>();

    upcomingHtml = `
<section class="section-tile">
  <h2 class="section-title">📅 Seuraava ottelukierros</h2>
  <p class="subtitle">${escapeHtml(humanDate(nextRound.date))}</p>
  <div class="upcoming-grid">${upcomingGames.map(renderUpcomingCell).join("")}</div>
  <a class="archive-link" href="/otteluohjelma">Koko otteluohjelma →</a>
</section>`;
  }

  // Same defensive escape render.py's _game_details_json / sarjataulukko.ts's
  // #team-snapshots already apply: a stray "</script" inside embedded JSON
  // can't close the tag early.
  const gameDetailsJson = JSON.stringify(gameDetails).replace(/<\//g, "<\\/");

  const content = `
<header class="page-header">
  <h1 class="brand-heading">🏒 Yön änärit</h1>
  ${
    currentRound
      ? `<p class="subtitle">${escapeHtml(humanDate(currentRound.date))} · ${roundGames.length} ottelua</p>`
      : `<p class="subtitle">Ei vielä otteluita tällä kaudella</p>`
  }
</header>

${
  currentRound
    ? `<section>
  <h2 class="section-title">🏒 Viime yön ottelut</h2>
  <div class="game-list">${gameCardsHtml}</div>
</section>`
    : ""
}

${favoriteTeamsHtml}

${statTeaserTable("🇫🇮 Suomipörssin kärki", finSkaters.map((r, i) => renderFinnishSkaterRow(r, i + 1)), "Ei tilastoituja suomalaispelaajia vielä.", "/suomiporssi", "Koko Suomipörssi →")}

${statTeaserTable("📈 NHL:n kärkipörssi", leagueSkaters.map((r, i) => renderLeagueSkaterRow(r, i + 1)), "Ei tilastoituja pelaajia vielä.", "/tilastot", "Koko Tilastot →")}

${upcomingHtml}

<script id="game-details" type="application/json">${gameDetailsJson}</script>
`;

  const html = await renderLayout({
    title: "Morning Hockey",
    headerTitle: "Etusivu",
    activePage: "home",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
