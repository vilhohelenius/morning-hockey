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
import { decisionFi, escapeHtml, finalTypeFi, helsinkiParts } from "./format";
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
}

export function finnishScorerLines(skaters: PlayerGameStat[], teamAbbrev: string): FinnScorerLine[] {
  return skaters
    .filter((p) => p.nationality === "FIN" && (p.goals > 0 || p.assists > 0))
    .map((p) => ({ name: p.name, team_abbrev: teamAbbrev, goals: p.goals, assists: p.assists }));
}

export function finnishGoalieLines(goalies: GoalieGameStat[], teamAbbrev: string): FinnGoalieLine[] {
  return goalies
    .filter((g) => g.nationality === "FIN")
    .map((g) => ({ name: g.name, team_abbrev: teamAbbrev, decision: g.decision, saves: g.saves, shots_against: g.shots_against }));
}

// A game that has started (per the fast tier's own game_state) but isn't
// finished yet -- same "has it started" definition index.ts's currentRound
// query already uses, so a game counts as live here exactly when it's the
// reason that round is showing at all.
export function isLive(game: GameRow): boolean {
  return !game.is_finished && game.game_state !== "FUT";
}

function liveBadgeText(live: LiveStatus | null): string {
  if (!live) return "LIVE";
  if (live.inIntermission) return "Erätauko";
  return `${periodLabel({ periodType: live.periodType, number: live.periodNumber })} · ${live.timeRemaining}`;
}

export function renderGameCard(
  game: GameRow,
  scorers: FinnScorerLine[],
  goalies: FinnGoalieLine[],
  live: LiveStatus | null = null,
): string {
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

  const badge = game.is_finished
    ? game.final_type !== "REG"
      ? `<p class="ot-tag">${escapeHtml(finalTypeFi(game.final_type))}</p>`
      : ""
    : isLive(game)
      ? `<p class="live-tag"><span class="live-dot"></span>${escapeHtml(liveBadgeText(live))}</p>`
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

  return `
<div class="game-card game-card-trigger" data-game-id="${game.game_id}" tabindex="0" role="button" aria-expanded="false">
  <div class="score-row">
    <div class="team away">
      <img src="${escapeHtml(game.away_logo)}" alt="" class="logo" loading="lazy">
      <span class="abbrev">${escapeHtml(game.away_abbrev)}</span>
    </div>
    <div class="score">
      ${scoreHtml}
    </div>
    <div class="team home">
      <span class="abbrev">${escapeHtml(game.home_abbrev)}</span>
      <img src="${escapeHtml(game.home_logo)}" alt="" class="logo" loading="lazy">
    </div>
  </div>
  ${badge}
  ${finnStats}
</div>`;
}
