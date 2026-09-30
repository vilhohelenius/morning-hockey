// Dashboard (homepage). Combines: last night's (or tonight's, once it's
// started) results with Finnish highlights, top-5 Suomipörssi, top-5
// Tilastot, the signed-in user's favorite-team mini-boxes, and the next
// upcoming round of games.
//
// "Last night's games" used to be keyed off the once-daily digest sync
// job's own `digests` table, which meant the section could only ever
// change once a day, at whatever fixed UTC time that cron happened to run
// -- wrong exactly at the edge case that matters: the calendar day
// changing in Finland before the next night's games have actually started.
// Fixed 2026-10-01 by picking the date to show directly from `games`
// (synced every 30 min, always current): the most recent date with any
// game that has actually started, finished or not. `digests`'s child
// tables (digest_scorers/digest_goalies, the Finnish per-game highlights)
// are still used, just as best-effort enrichment keyed by game_id rather
// than as the source of which date/games to show -- so a night's scores
// appear immediately from the fast tier, and the Finnish stat lines fill
// in themselves whenever the daily digest job next catches up.
//
// Two things templates/dashboard.html has are deliberately NOT ported:
//   - The box-score click-to-expand popup (#game-details JSON) -- same
//     data shape as phase 5's planned game_box_scores cache, not synced
//     yet. app.js only wires up that click handler when #game-details
//     exists, so omitting it is a clean no-op (same pattern as the
//     #team-snapshots and #team-trigger gaps in earlier pages).
//   - The "Aiemmat yöt" archive footer linking to nights/<date>.html --
//     superseded by /arkisto, a real route here.

import { currentUsername } from "./_shared/auth";
import { decisionFi, escapeHtml, finalTypeFi, helsinkiParts, humanDate, nationalityFlag } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type {
  DigestGameRow,
  DigestGoalieRow,
  DigestScorerRow,
  Env,
  FavoriteTeamRow,
  FinnishSkaterRow,
  GameRow,
  SkaterStatsRow,
  StandingsRow,
  TeamRosterSkaterRow,
} from "./_shared/types";

// Generous window, same reasoning as sarjataulukko.ts's buildSnapshots:
// fetch once, filter/group in TS, rather than a query per game.
const ENRICHMENT_QUERY_LIMIT = 500;

function renderGameCard(game: GameRow, finalType: string, scorers: DigestScorerRow[], goalies: DigestGoalieRow[]): string {
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
<a class="game-card game-card-link" href="/ottelut/${game.game_id}">
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
</a>`;
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

function renderFavoriteTeamCard(team: StandingsRow, topSkater: TeamRosterSkaterRow | null): string {
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
  if (currentRound) {
    const { results } = await db
      .prepare("SELECT * FROM games WHERE date = ? ORDER BY start_time_utc ASC")
      .bind(currentRound.date)
      .all<GameRow>();
    roundGames = results;

    const [{ results: digestGames }, { results: allScorers }, { results: allGoalies }] = await Promise.all([
      db.prepare("SELECT * FROM digest_games ORDER BY digest_date DESC LIMIT ?").bind(ENRICHMENT_QUERY_LIMIT).all<DigestGameRow>(),
      db.prepare("SELECT * FROM digest_scorers LIMIT ?").bind(ENRICHMENT_QUERY_LIMIT).all<DigestScorerRow>(),
      db.prepare("SELECT * FROM digest_goalies LIMIT ?").bind(ENRICHMENT_QUERY_LIMIT).all<DigestGoalieRow>(),
    ]);
    const finalTypeByGame = new Map(digestGames.map((g) => [g.game_id, g.final_type]));
    const scorersByGame = new Map<number, DigestScorerRow[]>();
    for (const s of allScorers) scorersByGame.set(s.game_id, [...(scorersByGame.get(s.game_id) ?? []), s]);
    const goaliesByGame = new Map<number, DigestGoalieRow[]>();
    for (const g of allGoalies) goaliesByGame.set(g.game_id, [...(goaliesByGame.get(g.game_id) ?? []), g]);

    for (const game of roundGames) {
      gameCardsHtml += renderGameCard(
        game,
        finalTypeByGame.get(game.game_id) ?? "REG",
        scorersByGame.get(game.game_id) ?? [],
        goaliesByGame.get(game.game_id) ?? [],
      );
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
        const topSkater = await db
          .prepare(
            "SELECT * FROM team_roster_skaters WHERE team_abbrev = ? ORDER BY points DESC, goals DESC LIMIT 1",
          )
          .bind(team.abbrev)
          .first<TeamRosterSkaterRow>();
        cards.push(renderFavoriteTeamCard(team, topSkater ?? null));
      }
      favoriteTeamsHtml = `
<section>
  <h2 class="section-title">⭐ Suosikkijoukkueet</h2>
  <div class="fav-team-grid">${cards.join("")}</div>
</section>`;
    }
  }

  // ---------- Next upcoming round ----------

  const nextRound = await db
    .prepare("SELECT date FROM games WHERE is_finished = 0 ORDER BY date ASC LIMIT 1")
    .first<{ date: string }>();

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
