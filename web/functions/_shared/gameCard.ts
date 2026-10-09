// A game's score card, shared by the dashboard's "Viime yön ottelut" and
// Arkisto's per-day game lists: logos/abbrevs/score, an OT/SO badge, a LIVE
// badge for a game currently in progress, and -- the part that used to
// come from the once-daily digest sync's digest_scorers/digest_goalies
// tables -- a Finnish player highlight line for anyone who recorded a
// point or played goal, derived straight from that game's own box score
// (_shared/boxScoreCache) instead. Keeping this in one place means every
// page gets the same fix at once, rather than one having it and another
// quietly not.
//
// The OT/SO badge reads game.final_type directly (synced by the fast
// tier from the /schedule/{date} endpoint's gameOutcome.lastPeriodType,
// confirmed reliable there) rather than the on-demand box score's own
// copy of it -- the gamecenter/landing endpoint's top-level gameOutcome
// field came back null for a real finished OT game when checked directly,
// so a badge that depended on a successful box-score fetch could stay
// missing indefinitely even once the score itself was showing.
//
// Wrapped in `.game-card-trigger` with `data-game-id`: app.js's existing
// click-to-expand handler (originally written for the static site, reused
// for sarjataulukko.ts's team snapshot) turns it into the goal-timeline +
// team-stats info box, reading a page-level `#game-details` JSON script
// tag keyed by game_id -- callers are responsible for emitting that tag.

import { periodLabel } from "./boxscore";
import type { LiveStatus } from "./boxScoreCache";
import { isGameLive, isStartingSoon } from "./dayGames";
import { flagImg, decisionFi, escapeHtml, finalTypeShort, helsinkiParts } from "./format";
import { jerseyColors } from "./teamColors";
import { formatGsax } from "./xg";
import type { GameRow, GoalieGameStat, PlayerGameStat } from "./types";

export interface FinnScorerLine {
  name: string;
  team_abbrev: string;
  goals: number;
  assists: number;
}

export interface FinnGoalieLine {
  name: string;
  team_abbrev: string;
  decision: string | null;
  saves: number;
  shots_against: number;
  gsax?: number;
}

export function finnishScorerLines(skaters: PlayerGameStat[], teamAbbrev: string): FinnScorerLine[] {
  return skaters
    .filter((p) => p.nationality === "FIN" && (p.goals > 0 || p.assists > 0))
    .map((p) => ({ name: p.name, team_abbrev: teamAbbrev, goals: p.goals, assists: p.assists }));
}

export function finnishGoalieLines(goalies: GoalieGameStat[], teamAbbrev: string, gsax?: Map<number, number>): FinnGoalieLine[] {
  return goalies
    .filter((g) => g.nationality === "FIN")
    .map((g) => ({ name: g.name, team_abbrev: teamAbbrev, decision: g.decision, saves: g.saves, shots_against: g.shots_against, gsax: gsax?.get(g.player_id) }));
}

// A game that has started but isn't finished yet. Primarily per the fast
// tier's own game_state -- same "has it started" definition index.ts's
// currentRound query already uses, so a game counts as live here exactly
// when it's the reason that round is showing at all -- but that field only
// updates every ~30 min, so a game whose scheduled start has already passed
// is treated as live too even while game_state still says "FUT": otherwise
// a just-started game would keep showing its pre-game preview (score text
// box score etc.) for up to half an hour.
//
// The logic itself lives in dayGames.ts (pure, unit-tested).
export function isLive(game: GameRow): boolean {
  return isGameLive(game);
}

export function liveBadgeText(live: LiveStatus | null): string {
  if (!live) return "LIVE";
  if (live.inIntermission) return "Erätauko";
  return `${periodLabel({ periodType: live.periodType, number: live.periodNumber })} · ${live.timeRemaining}`;
}

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// NHL's own YouTube highlight uploads are always titled "{Away} vs. {Home}
// | NHL Highlights | {Month D, YYYY}". The date uses America/New_York (the
// league's own scheduling timezone, not this site's usual Europe/Helsinki)
// since that's the convention NHL itself dates these uploads by -- a late-
// night Finnish-time game can fall on a different Helsinki calendar date
// than its NHL one.
//
// Exported: _shared/youtube.ts uses this exact text as its YouTube Data
// API search query, so the real-video lookup and the search-link fallback
// below always agree on what they're looking for.
export function highlightsSearchTitle(game: GameRow): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(game.start_time_utc));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dateLabel = `${EN_MONTHS[Number(get("month")) - 1] ?? ""} ${get("day")}, ${get("year")}`;

  return `${game.away_name} vs. ${game.home_name} | NHL Highlights | ${dateLabel}`;
}

// Fallback used when no YOUTUBE_API_KEY is configured, or _shared/
// youtube.ts hasn't resolved a real video yet: a plain youtube.com search
// for the exact official title text above -- specific enough to surface
// the right video as the top result in practice, even though it isn't a
// guaranteed direct link.
//
// Exported: rendered inside the game-details stat box (app.js's
// openGameDetail) and on the full /ottelut/[gameId] report, not on the
// card itself anymore -- a visitor sees it only once they've actually
// opened a game, not scattered across every card on the dashboard/Arkisto.
export function youtubeHighlightsUrl(game: GameRow): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(highlightsSearchTitle(game))}`;
}

export function renderGameCard(
  game: GameRow,
  scorers: FinnScorerLine[],
  goalies: FinnGoalieLine[],
  live: LiveStatus | null = null,
  // Tulospiilo: the same card, but the score, OT badge and Finnish stat lines
  // stay hidden until the game is checked off and its row opened (see
  // tulospiilo.ts + the .spoiler-* CSS).
  spoiler?: { youtubeUrl: string | null },
): string {
  const finnStats =
    scorers.length || goalies.length
      ? `
  <div class="finn-stats">
    ${scorers
      .map(
        (s) => `
    <p class="stat-line scorer">
      <span class="flag">${flagImg("fi")}</span><strong>${escapeHtml(s.name)}</strong><span class="team-tag">${escapeHtml(s.team_abbrev)}</span>
      <span class="value">${s.goals}+${s.assists}</span>
    </p>`,
      )
      .join("")}
    ${goalies
      .map(
        (g) => `
    <p class="stat-line goalie">
      <span class="flag">${flagImg("fi")}</span><strong>${escapeHtml(g.name)}</strong><span class="team-tag">${escapeHtml(g.team_abbrev)}</span>
      <span class="value">${g.saves}/${g.shots_against}${g.decision ? ` · ${escapeHtml(decisionFi(g.decision))}` : ""}${g.gsax === undefined ? "" : ` · ${formatGsax(g.gsax, 2)} GSAx`}</span>
    </p>`,
      )
      .join("")}
  </div>`
      : "";

  const badge = game.is_finished
    ? ""
    : isLive(game)
      ? `<p class="live-tag"><span class="live-dot"></span>${escapeHtml(liveBadgeText(live))}</p>`
      : isStartingSoon(game)
        ? `<p class="live-tag soon-tag">Alkaa pian</p>`
        : "";

  // Not started yet: the score (always 0-0) says nothing useful, so show
  // its Helsinki-local start time there instead.
  const scoreHtml =
    game.is_finished || isLive(game)
      ? `
      <span>${game.away_score}</span>
      <span class="dash">–</span>
      <span>${game.home_score}</span>`
      : (() => {
          const { hour, minute } = helsinkiParts(game.start_time_utc);
          return `<span class="score-time">${hour}:${String(minute).padStart(2, "0")}</span>`;
        })();

  // Hint only once there's actually something to show -- a not-yet-started
  // game has no box score yet, so .game-card-trigger's click handler would
  // just expand to nothing. Ported from the old static site's game_card
  // macro (_macros.html), which had this same hint but on every card
  // unconditionally since that build never had not-yet-started games mixed
  // into the same list.
  const hasDetails = game.is_finished || isLive(game);
  const hint = hasDetails
    ? `<p class="game-card-hint">Näytä ottelun tiedot ▾</p>`
    : `<p class="game-card-hint">Avaa ottelun esikatselu ›</p>`;

  // Not started yet: nothing to expand inline, so the whole card links to
  // the game page, which renders the pre-game preview.
  const [ca, ch] = jerseyColors(game.away_abbrev, game.home_abbrev);
  const colors = `style="--ca:${ca};--ch:${ch}"`;
  const openTag = hasDetails
    ? `<div class="game-card jersey-card game-card-trigger" ${colors} data-game-id="${game.game_id}" tabindex="0" role="button" aria-expanded="false">`
    : `<a class="game-card jersey-card game-card-link" ${colors} href="/ottelut/${game.game_id}">`;
  const closeTag = hasDetails ? "</div>" : "</a>";

  const scoreRow = `
  <div class="score-row${game.is_finished && game.final_type !== "REG" ? " has-note" : ""}">
    <span class="jc-half jc-away" data-abbr="${escapeHtml(game.away_abbrev)}" aria-hidden="true"></span>
    <span class="jc-half jc-home" data-abbr="${escapeHtml(game.home_abbrev)}" aria-hidden="true"></span>
    <div class="team away">
      <img src="${escapeHtml(game.away_logo)}" alt="" class="logo" loading="lazy">
      <span class="abbrev">${escapeHtml(game.away_abbrev)}</span>
    </div>
    <div class="score${spoiler ? " spoiler-placeholder" : ""}">
      ${spoiler ? "?–?" : scoreHtml}
    </div>
    <div class="team home">
      <span class="abbrev">${escapeHtml(game.home_abbrev)}</span>
      <img src="${escapeHtml(game.home_logo)}" alt="" class="logo" loading="lazy">
    </div>
    ${game.is_finished && game.final_type !== "REG" ? `<span class="score-note">${finalTypeShort(game.final_type)}</span>` : ""}
  </div>`;

  if (spoiler) {
    const checkboxId = `spoiler-check-${game.game_id}`;
    return `
<div class="game-card jersey-card spoiler-game" ${colors}>
  <input type="checkbox" id="${checkboxId}" class="spoiler-reveal-toggle">

  <div class="spoiler-score-row game-card-trigger" data-game-id="${game.game_id}" data-away-score="${game.away_score}" data-home-score="${game.home_score}" tabindex="-1" role="button" aria-expanded="false">
    ${scoreRow}
    ${!game.is_finished && isLive(game) ? `<p class="live-tag spoiler-live"><span class="live-dot"></span>${escapeHtml(liveBadgeText(live))}</p>` : ""}
    ${finnStats}
    <p class="game-card-hint spoiler-reveal-hint">Näytä tulos ▾</p>
  </div>

  <label class="spoiler-check-label" for="${checkboxId}">
    <span class="spoiler-check-box" aria-hidden="true"></span>
    <span class="spoiler-check-text">${!game.is_finished && isLive(game) ? "Merkitse nähdyksi, jos haluat nähdä tilanteen" : "Merkitse nähdyksi, kun olet katsonut highlightit"}</span>
  </label>

  ${spoiler.youtubeUrl ? `<a class="game-card-youtube" href="${escapeHtml(spoiler.youtubeUrl)}" target="_blank" rel="noopener">▶ Highlightit (YouTube)</a>` : ""}
</div>`;
  }

  return `
${openTag}${scoreRow}
  ${badge}
  ${finnStats}
  ${hint}
${closeTag}`;
}
