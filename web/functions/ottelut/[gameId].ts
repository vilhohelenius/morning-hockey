// On-demand game report, phase 5: TS port of game_report.py's page, but
// fetched from the NHL API live on first visit instead of pre-built
// nightly for one team's games. A cache hit (game_box_scores) skips the
// NHL fetch entirely; a cache miss fetches landing/right-rail/boxscore +
// both teams' rosters directly from api-web.nhle.com, parses them with the
// same _shared/boxscore.ts + _shared/gameReport.ts logic phase 5's parity
// test already verified against the Python test fixtures, then writes the
// result to D1 before rendering -- so the next visitor gets the cache hit.
//
// Only ever attempted for games.is_finished = 1: an unfinished game has no
// box score yet, so this renders a simple "not played yet" placeholder
// instead of calling the NHL API.
//
// final_type (REG/OT/SO) comes from landing()'s gameOutcome.lastPeriodType
// -- the same field name the scoreboard/schedule endpoints already use
// elsewhere in this codebase, but this is the first place reading it off
// *landing* specifically, since no existing Python code needed to. Falls
// back to "REG" if that assumption turns out wrong; worth checking an OT/SO
// game specifically when verifying this live.

import { getBoxScore, type ParsedBoxScore } from "../_shared/boxScoreCache";
import { buildPreviewTeamStats, buildTimeline } from "../_shared/boxscore";
import { fetchGameTeamXg, fetchTeamSeasonXg, teamXgStatRows } from "../_shared/xg";
import { renderMatchTimeline } from "../_shared/matchTimeline";
import { computeFormGuide, type FormGuideEntry } from "../_shared/formGuide";
import { escapeHtml, finalTypeFi, helsinkiParts, humanDate, nationalityFlag } from "../_shared/format";
import { isLive } from "../_shared/gameCard";
import { renderRosterGoalieTable, renderRosterSkaterTable } from "../_shared/leaderboard";
import { TEAM_COLORS } from "../_shared/teamColors";
import { resolveHighlightsUrl } from "../_shared/youtube";
import { renderLayout } from "../_shared/layout";
import type {
  Env,
  GameRow,
  GoalieGameStat,
  PlayerGameStat,
  TeamRosterGoalieRow,
  TeamRosterSkaterRow,
  TeamSeasonStatsRow,
  TeamStatRow,
} from "../_shared/types";

const FORM_GUIDE_WINDOW = 5;

// A team with no synced season_stats row yet (very early preseason) gets
// zero-valued stats instead of hiding the whole section -- per request,
// "tyhjät tilastot" should render as 0, not disappear.
function emptySeasonStats(abbrev: string): TeamSeasonStatsRow {
  return {
    team_abbrev: abbrev,
    games_played: 0,
    goals_for: 0,
    goals_against: 0,
    power_play_pct: 0,
    penalty_kill_pct: 0,
    faceoff_pct: 0,
    shots_for_per_game: 0,
    shots_against_per_game: 0,
    shutouts: 0,
  };
}

function renderSkaterTable(skaters: PlayerGameStat[]): string {
  const rows = skaters
    .map(
      (p, i) => `
      <tr>
        <td class="col-rank">${i + 1}</td>
        <td>
          <a href="/pelaajat/${p.player_id}" class="player-cell">
            <img src="${escapeHtml(p.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(p.name)}
              <span class="player-meta">${nationalityFlag(p.nationality)} ${escapeHtml(p.nationality)} · ${escapeHtml(p.position)}</span>
            </span>
          </a>
        </td>
        <td>${p.goals}</td>
        <td>${p.assists}</td>
        <td class="stat-strong">${p.points}</td>
        <td>${p.plus_minus > 0 ? "+" : ""}${p.plus_minus}</td>
        <td>${p.shots}</td>
        <td>${p.blocked_shots}</td>
        <td>${p.hits}</td>
        <td>${p.giveaways}</td>
        <td>${p.takeaways}</td>
        <td>${p.faceoff_pct !== null ? `${(p.faceoff_pct * 100).toFixed(0)} %` : "–"}</td>
        <td>${p.pim}</td>
        <td>${escapeHtml(p.toi)}</td>
      </tr>`,
    )
    .join("");

  return `
<div class="stats-table-wrap">
  <table class="stats-table">
    <thead>
      <tr>
        <th class="col-rank">#</th>
        <th>Pelaaja</th>
        <th title="Maalit">M</th>
        <th title="Syötöt">S</th>
        <th title="Pisteet">P</th>
        <th title="Plus/miinus">+/-</th>
        <th title="Laukaukset">L</th>
        <th title="Blokatut laukaukset">Blokit</th>
        <th title="Taklaukset">Taklat</th>
        <th title="Kiekon menetykset">Menet.</th>
        <th title="Kiekon riistot">Riistot</th>
        <th title="Aloitusprosentti">Al.%</th>
        <th title="Jäähyt (min)">JH</th>
        <th>Peliaika</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// e.g. "2 (1 YV)" -- the base goals-against total, plus a parenthetical
// breakdown only for the special-teams goals within it (even-strength ones
// need no tag, same convention as the goal timeline's own strength labels).
function goalsAgainstBreakdown(g: GoalieGameStat): string {
  const total = g.shots_against - g.saves;
  const tags: string[] = [];
  if (g.pp_goals_against > 0) tags.push(`${g.pp_goals_against} YV`);
  if (g.sh_goals_against > 0) tags.push(`${g.sh_goals_against} AV`);
  return tags.length ? `${total} (${tags.join(", ")})` : String(total);
}

function renderGoalieTable(goalies: GoalieGameStat[]): string {
  const rows = goalies
    .map(
      (g, i) => `
      <tr>
        <td class="col-rank">${i + 1}</td>
        <td>
          <a href="/pelaajat/${g.player_id}" class="player-cell">
            <img src="${escapeHtml(g.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <span class="player-name">
              ${escapeHtml(g.name)}
              <span class="player-meta">${nationalityFlag(g.nationality)} ${escapeHtml(g.nationality)}</span>
            </span>
          </a>
        </td>
        <td>${g.shots_against}</td>
        <td>${g.saves}</td>
        <td>${goalsAgainstBreakdown(g)}</td>
        <td class="stat-strong">${g.save_pct.toFixed(3)}</td>
        <td>${escapeHtml(g.toi)}</td>
      </tr>`,
    )
    .join("");

  return `
<div class="stats-table-wrap">
  <table class="stats-table">
    <thead>
      <tr>
        <th class="col-rank">#</th>
        <th>Pelaaja</th>
        <th title="Laukauksia vastaan">Lauk.</th>
        <th title="Torjunnat">Torj.</th>
        <th title="Päästetyt maalit">Päästi</th>
        <th title="Torjuntaprosentti">SV%</th>
        <th>Peliaika</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

// Last FORM_GUIDE_WINDOW results as the same .form-chip pills sarjataulukko's
// own Kuntopuntari table uses -- "–" when a team has no finished games yet
// (start of season) rather than an empty row.
function renderFormChips(entry: FormGuideEntry | undefined, align: "start" | "end"): string {
  const endClass = align === "end" ? " form-chips-end" : "";
  if (!entry || !entry.results.length) return `<span class="form-chips${endClass}">–</span>`;
  const chips = entry.results.map((r) => `<span class="form-chip result-${r.toLowerCase()}">${r === "OTL" ? "OT" : r}</span>`).join("");
  return `<span class="form-chips${endClass}">${chips}</span>`;
}

// Team-colored, continuous share-of-total bar with a diagonal seam --
// matches the look of NHL.com's own Team Stats section (confirmed via live
// inspection). Shared by the preview page's season-stats comparison (with a
// form-guide row and league ranks) and the finished-game box-score
// comparison (without either, since buildTeamStats never sets rank fields).
function renderStatBarRows(rows: TeamStatRow[], awayAbbrev: string, homeAbbrev: string): string {
  const awayColor = TEAM_COLORS[awayAbbrev] ?? "var(--accent)";
  const homeColor = TEAM_COLORS[homeAbbrev] ?? "color-mix(in srgb, var(--accent) 45%, transparent)";

  return rows
    .map(
      (stat) => `
      <div class="gd-stat-block">
        <div class="gd-stat-row">
          <span class="gd-stat-value">${escapeHtml(stat.away_value)}</span>
          <span class="gd-stat-label">${escapeHtml(stat.label)}</span>
          <span class="gd-stat-value">${escapeHtml(stat.home_value)}</span>
        </div>
        <div class="pts-bar">
          <span class="pts-bar-away" style="width: ${stat.away_pct ?? 50}%; background: ${awayColor}"></span>
          <span class="pts-bar-home" style="width: ${stat.home_pct ?? 50}%; background: ${homeColor}"></span>
        </div>
        ${
          stat.away_rank || stat.home_rank
            ? `<div class="pts-ranks">
          <span>${stat.away_rank ? `${stat.away_rank}.` : "–"}</span>
          <span>${stat.home_rank ? `${stat.home_rank}.` : "–"}</span>
        </div>`
            : ""
        }
      </div>`,
    )
    .join("");
}

function renderPreviewTeamStats(rows: TeamStatRow[], awayAbbrev: string, homeAbbrev: string, awayForm: FormGuideEntry | undefined, homeForm: FormGuideEntry | undefined): string {
  const formRow = `
      <div class="gd-stat-row">
        ${renderFormChips(awayForm, "start")}
        <span class="gd-stat-label">Viimeiset ${FORM_GUIDE_WINDOW} ottelua</span>
        ${renderFormChips(homeForm, "end")}
      </div>`;

  return formRow + renderStatBarRows(rows, awayAbbrev, homeAbbrev);
}

// "Players to watch": each team's own points leader and goals leader
// (skaters are already fetched ordered by points DESC, so [0] is the
// points leader; the goals leader needs its own max since the top scorer
// isn't always the top goal-scorer).
function goalsLeader(skaters: TeamRosterSkaterRow[]): TeamRosterSkaterRow | null {
  if (!skaters.length) return null;
  return skaters.reduce((best, p) => (p.goals > best.goals ? p : best));
}

function renderPlayerWatchRow(label: string, away: TeamRosterSkaterRow | null, home: TeamRosterSkaterRow | null, awayValue: number, homeValue: number): string {
  const side = (player: TeamRosterSkaterRow | null, value: number) =>
    player
      ? `
      <a href="/pelaajat/${player.player_id}" class="pw-player">
        <img src="${escapeHtml(player.headshot)}" alt="" loading="lazy" class="pw-headshot" onerror="this.style.visibility='hidden'">
        <span class="pw-player-info">
          <span class="pw-value">${value}</span>
          <span class="pw-name">${escapeHtml(player.name)}</span>
        </span>
      </a>`
      : `<span class="pw-player pw-player-empty">–</span>`;

  return `
    <div class="pw-row">
      ${side(away, awayValue)}
      <span class="gd-stat-label">${escapeHtml(label)}</span>
      ${side(home, homeValue)}
    </div>`;
}

function renderPlayersToWatch(awaySkaters: TeamRosterSkaterRow[], homeSkaters: TeamRosterSkaterRow[]): string {
  const awayPoints = awaySkaters[0] ?? null;
  const homePoints = homeSkaters[0] ?? null;
  const awayGoals = goalsLeader(awaySkaters);
  const homeGoals = goalsLeader(homeSkaters);

  return `
    ${renderPlayerWatchRow("Pisteet", awayPoints, homePoints, awayPoints?.points ?? 0, homePoints?.points ?? 0)}
    ${renderPlayerWatchRow("Maalit", awayGoals, homeGoals, awayGoals?.goals ?? 0, homeGoals?.goals ?? 0)}`;
}

// One compact stat card per team's presumed starter (reuses the .stat-card
// component from the team page's Kausitilastot box) -- W-L-OTL/GAA/SV%/SO.
function renderGoalieCard(g: TeamRosterGoalieRow, teamLogo: string): string {
  return `
  <div class="stat-card">
    <div class="stat-card-header">
      <img src="${escapeHtml(g.headshot)}" alt="" class="stat-card-headshot" loading="lazy" onerror="this.style.visibility='hidden'">
      <span class="stat-card-name">${escapeHtml(g.name)}</span>
      <img src="${escapeHtml(teamLogo)}" alt="" class="stat-card-team-logo" loading="lazy">
    </div>
    <div class="stat-card-table-wrap">
      <table class="stat-card-table">
        <thead>
          <tr><th>O</th><th>V-H-JH</th><th>GAA</th><th>SV%</th><th>NP</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${g.games_played}</td>
            <td>${g.wins}-${g.losses}-${g.ot_losses}</td>
            <td>${g.goals_against_average.toFixed(2)}</td>
            <td class="stat-card-highlight">${g.save_pct.toFixed(3)}</td>
            <td>${g.shutouts}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
}

// Presumed starter: most games played this season. Ties fall back to save
// pct (the query's own sort order) rather than career games played, since
// no career-games data is synced for goalies -- the user's own phrasing
// ("...jos kaikilla sama niin uralla eniten pelejä ehkä sitten") treated
// that tiebreak as a soft nice-to-have, not a hard requirement.
function pickStarter(goalies: TeamRosterGoalieRow[]): TeamRosterGoalieRow | undefined {
  return goalies.reduce<TeamRosterGoalieRow | undefined>(
    (best, g) => (!best || g.games_played > best.games_played ? g : best),
    undefined,
  );
}

function renderGoaltending(awayGoalies: TeamRosterGoalieRow[], homeGoalies: TeamRosterGoalieRow[], awayLogo: string, homeLogo: string): string {
  const starters = [
    [pickStarter(awayGoalies), awayLogo] as const,
    [pickStarter(homeGoalies), homeLogo] as const,
  ].filter((pair): pair is [TeamRosterGoalieRow, string] => !!pair[0]);
  const cards = starters.map(([g, logo]) => renderGoalieCard(g, logo)).join("");
  return `<div class="stat-card-grid">${cards}</div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const gameId = Number(context.params.gameId);

  if (!Number.isInteger(gameId)) {
    return new Response("Virheellinen ottelu-id", { status: 400 });
  }

  const game = await db.prepare("SELECT * FROM games WHERE game_id = ?").bind(gameId).first<GameRow>();
  if (!game) {
    return new Response(`Ottelua ${gameId} ei löydy.`, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let box: ParsedBoxScore | null = null;
  let fetchError = false;
  let youtubeUrl = "";

  let awaySkaters: TeamRosterSkaterRow[] = [];
  let homeSkaters: TeamRosterSkaterRow[] = [];
  let awayGoalies: TeamRosterGoalieRow[] = [];
  let homeGoalies: TeamRosterGoalieRow[] = [];
  let awaySeasonStats: TeamSeasonStatsRow = emptySeasonStats(game.away_abbrev);
  let homeSeasonStats: TeamSeasonStatsRow = emptySeasonStats(game.home_abbrev);
  let allSeasonStats: TeamSeasonStatsRow[] = [];
  let awayForm: FormGuideEntry | undefined;
  let homeForm: FormGuideEntry | undefined;
  let xgRows: TeamStatRow[] = [];

  if (game.is_finished || isLive(game)) {
    ({ box, fetchError } = await getBoxScore(db, game));
    if (game.is_finished) {
      youtubeUrl = await resolveHighlightsUrl(db, context.env, game);
      const gameXg = await fetchGameTeamXg(db, game.game_id, game.away_abbrev, game.home_abbrev);
      if (gameXg) xgRows = teamXgStatRows(gameXg.away, gameXg.home);
    }
  } else {
    const skaterQuery = (abbrev: string) =>
      db
        .prepare("SELECT * FROM team_roster_skaters WHERE team_abbrev = ? ORDER BY points DESC, goals DESC, name ASC")
        .bind(abbrev)
        .all<TeamRosterSkaterRow>();
    const goalieQuery = (abbrev: string) =>
      db
        .prepare("SELECT * FROM team_roster_goalies WHERE team_abbrev = ? ORDER BY save_pct DESC")
        .bind(abbrev)
        .all<TeamRosterGoalieRow>();
    const seasonStatsQuery = (abbrev: string) =>
      db.prepare("SELECT * FROM team_season_stats WHERE team_abbrev = ?").bind(abbrev).first<TeamSeasonStatsRow>();
    const recentGamesQuery = (abbrev: string) =>
      db
        .prepare("SELECT * FROM games WHERE is_finished = 1 AND (away_abbrev = ? OR home_abbrev = ?) ORDER BY date DESC, game_id DESC LIMIT ?")
        .bind(abbrev, abbrev, FORM_GUIDE_WINDOW)
        .all<GameRow>();

    const [awaySkatersRes, homeSkatersRes, awayGoaliesRes, homeGoaliesRes, awaySeasonRes, homeSeasonRes, allSeasonRes, awayRecentRes, homeRecentRes] =
      await Promise.all([
        skaterQuery(game.away_abbrev),
        skaterQuery(game.home_abbrev),
        goalieQuery(game.away_abbrev),
        goalieQuery(game.home_abbrev),
        seasonStatsQuery(game.away_abbrev),
        seasonStatsQuery(game.home_abbrev),
        db.prepare("SELECT * FROM team_season_stats").all<TeamSeasonStatsRow>(),
        recentGamesQuery(game.away_abbrev),
        recentGamesQuery(game.home_abbrev),
      ]);

    awaySkaters = awaySkatersRes.results;
    homeSkaters = homeSkatersRes.results;
    awayGoalies = awayGoaliesRes.results;
    homeGoalies = homeGoaliesRes.results;
    awaySeasonStats = awaySeasonRes ?? emptySeasonStats(game.away_abbrev);
    homeSeasonStats = homeSeasonRes ?? emptySeasonStats(game.home_abbrev);
    allSeasonStats = allSeasonRes.results;
    awayForm = computeFormGuide(awayRecentRes.results, [game.away_abbrev], FORM_GUIDE_WINDOW)[0];
    homeForm = computeFormGuide(homeRecentRes.results, [game.home_abbrev], FORM_GUIDE_WINDOW)[0];
    const [awayXg, homeXg] = await Promise.all([fetchTeamSeasonXg(db, game.away_abbrev), fetchTeamSeasonXg(db, game.home_abbrev)]);
    if (awayXg && homeXg) xgRows = teamXgStatRows(awayXg, homeXg);
  }

  const hasPreviewData = awaySkaters.length > 0 && homeSkaters.length > 0;

  const content = `
<a class="back-link js-back" href="/">← Takaisin</a>

<header class="page-header">
  <p class="subtitle">${escapeHtml(humanDate(game.date))}</p>
</header>

<section class="game-card">
  <div class="score-row">
    <div class="team away">
      <img src="${escapeHtml(game.away_logo)}" alt="" class="logo" loading="lazy">
      <span class="abbrev">${escapeHtml(game.away_abbrev)}</span>
    </div>
    <div class="score">
      ${
        game.is_finished || isLive(game)
          ? `<span>${game.away_score}</span><span class="dash">–</span><span>${game.home_score}</span>`
          : (() => {
              const { hour, minute } = helsinkiParts(game.start_time_utc);
              return `<span class="score-time">${hour}:${String(minute).padStart(2, "0")}</span>`;
            })()
      }
    </div>
    <div class="team home">
      <span class="abbrev">${escapeHtml(game.home_abbrev)}</span>
      <img src="${escapeHtml(game.home_logo)}" alt="" class="logo" loading="lazy">
    </div>
  </div>
  ${game.is_finished ? `<p class="mt-final-label">Lopputulos</p>` : ""}
  ${game.is_finished && game.final_type !== "REG" ? `<p class="ot-tag">${escapeHtml(finalTypeFi(game.final_type))}</p>` : ""}
  ${game.is_finished ? `<a class="game-card-youtube" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener">▶ Highlightit (YouTube)</a>` : ""}
</section>

${
  !game.is_finished && !isLive(game)
    ? hasPreviewData
      ? `
<section class="team-detail">
  <div class="team-detail-body">
    <div class="tp-section">
      <p class="tp-section-title">Pelaajat seurattavaksi</p>
      <div class="gd-stat-header">
        <span class="gd-stat-team">${escapeHtml(game.away_abbrev)}</span>
        <span class="gd-stat-team">${escapeHtml(game.home_abbrev)}</span>
      </div>
      ${renderPlayersToWatch(awaySkaters, homeSkaters)}
    </div>

    ${
      awayGoalies.length || homeGoalies.length
        ? `
    <div class="tp-section">
      <p class="tp-section-title">Maalivahdit</p>
      ${renderGoaltending(awayGoalies, homeGoalies, game.away_logo, game.home_logo)}
    </div>`
        : ""
    }

    <div class="tp-section">
      <p class="tp-section-title">Joukkuetilastot</p>
      <div class="gd-stat-header">
        <span class="gd-stat-team">${escapeHtml(game.away_abbrev)}</span>
        <span class="gd-stat-team">${escapeHtml(game.home_abbrev)}</span>
      </div>
      ${renderPreviewTeamStats(buildPreviewTeamStats(awaySeasonStats, homeSeasonStats, allSeasonStats), game.away_abbrev, game.home_abbrev, awayForm, homeForm)}
      ${renderStatBarRows(xgRows, game.away_abbrev, game.home_abbrev)}
    </div>
  </div>
</section>

<div class="roster-team-picker toggle-group">
  <button type="button" class="toggle-segment active" data-team="away">${escapeHtml(game.away_abbrev)}</button>
  <button type="button" class="toggle-segment" data-team="home">${escapeHtml(game.home_abbrev)}</button>
</div>
<div class="roster-team-section" data-team="away">
  ${renderRosterSkaterTable(awaySkaters, `<img src="${escapeHtml(game.away_logo)}" alt="" class="nav-icon"> ${escapeHtml(game.away_name)} – kokoonpano`)}
  ${awayGoalies.length ? renderRosterGoalieTable(awayGoalies, `🥅 ${escapeHtml(game.away_name)} – maalivahdit`) : ""}
</div>
<div class="roster-team-section is-hidden" data-team="home">
  ${renderRosterSkaterTable(homeSkaters, `<img src="${escapeHtml(game.home_logo)}" alt="" class="nav-icon"> ${escapeHtml(game.home_name)} – kokoonpano`)}
  ${homeGoalies.length ? renderRosterGoalieTable(homeGoalies, `🥅 ${escapeHtml(game.home_name)} – maalivahdit`) : ""}
</div>`
      : `<p class="empty-note">Ottelua ei ole vielä pelattu.</p>`
    : fetchError
      ? `<p class="empty-note">Ottelun tarkkoja tietoja ei juuri nyt saatu. Yritä myöhemmin uudelleen.</p>`
      : box
        ? `
<section class="team-detail">
  <div class="team-detail-body">
    <div class="tp-section">
      <p class="tp-section-title">Ottelun kulku</p>
      ${renderMatchTimeline(buildTimeline(box.goals, box.penalties, game.away_abbrev, box.shootout), game.away_abbrev)}
    </div>

    <div class="tp-section">
      <p class="tp-section-title">Ottelun tilastot</p>
      <div class="gd-stat-header">
        <span class="gd-stat-team">${escapeHtml(game.away_abbrev)}</span>
        <span class="gd-stat-team">${escapeHtml(game.home_abbrev)}</span>
      </div>
      ${renderStatBarRows([...box.teamStats, ...xgRows], game.away_abbrev, game.home_abbrev)}
    </div>
  </div>
</section>

<div class="roster-team-picker toggle-group">
  <button type="button" class="toggle-segment active" data-team="away">${escapeHtml(game.away_abbrev)}</button>
  <button type="button" class="toggle-segment" data-team="home">${escapeHtml(game.home_abbrev)}</button>
</div>
<div class="roster-team-section" data-team="away">
  <section>
    <h2 class="section-title"><img src="${escapeHtml(game.away_logo)}" alt="" class="nav-icon">${escapeHtml(game.away_name)}</h2>
    ${renderSkaterTable(box.awaySkaters)}
    ${box.awayGoalies.length ? renderGoalieTable(box.awayGoalies) : ""}
  </section>
</div>
<div class="roster-team-section is-hidden" data-team="home">
  <section>
    <h2 class="section-title"><img src="${escapeHtml(game.home_logo)}" alt="" class="nav-icon">${escapeHtml(game.home_name)}</h2>
    ${renderSkaterTable(box.homeSkaters)}
    ${box.homeGoalies.length ? renderGoalieTable(box.homeGoalies) : ""}
  </section>
</div>`
        : ""
}
`;

  const html = await renderLayout({
    title: `${game.away_abbrev} – ${game.home_abbrev} · Morning Hockey`,
    headerTitle: `${game.away_abbrev} – ${game.home_abbrev}`,
    activePage: `team_${game.away_abbrev.toLowerCase()}`,
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
