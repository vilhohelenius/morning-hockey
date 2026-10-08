// Server-side HTML for the "ottelun kulku" timeline (Flashscore style): one
// grey band per period, away events left / home events right. The popup in
// app.js (renderTimeline) builds the same markup client-side from the same
// TimelinePeriod[] JSON -- keep the two in sync by hand (no build step).

import { escapeHtml, flagImg, teamLogoUrl } from "./format";
import type { TimelineEvent, TimelinePeriod } from "./boxscore";
import type { GoalEvent, GoalieChange, PenaltyEvent, ShootoutAttempt } from "./types";

const STRENGTH_FI: Record<string, string> = { YV: "YV", AV: "AV" };

// Names carry a trailing FI flag emoji from boxscore.ts; show the SVG flag
// instead (same as app.js elFlags).
function nameHtml(name: string): string {
  return escapeHtml(name).replace(/\u{1F1EB}\u{1F1EE}/gu, flagImg("fi"));
}

function logoHtml(abbrev: string): string {
  return `<img class="mt-logo" src="${escapeHtml(teamLogoUrl(abbrev))}" alt="${escapeHtml(abbrev)}" loading="lazy">`;
}

function goalHtml(goal: GoalEvent, side: "away" | "home"): string {
  const strength = goal.strength ? `<span class="mt-strength mt-strength-tag">${escapeHtml(STRENGTH_FI[goal.strength] ?? goal.strength)}</span>` : "";
  const assists = goal.assists_short ?? goal.assists;
  return `
    <div class="mt-event mt-${side} mt-goal">
      <div class="mt-main">
        ${(goal.period ?? 0) >= 100 ? "" : `<span class="mt-time">${escapeHtml(goal.time_in_period)}</span>`}
        <span class="mt-pill">${logoHtml(goal.team_abbrev)}<span class="mt-pill-score">${goal.away_score} - ${goal.home_score}</span></span>
        <div class="mt-col">
          <span class="mt-who"><strong>${nameHtml(goal.scorer_short ?? goal.scorer)}</strong>${strength}</span>
          ${assists.length ? `<p class="mt-assists">${nameHtml(assists.join(" · "))}</p>` : ""}
        </div>
      </div>
    </div>`;
}

function penaltyHtml(penalty: PenaltyEvent, side: "away" | "home"): string {
  const who = penalty.player || penalty.team_abbrev;
  return `
    <div class="mt-event mt-${side} mt-penalty">
      <div class="mt-main">
        <span class="mt-time">${escapeHtml(penalty.time_in_period)}</span>
        <span class="mt-badge">${penalty.minutes > 0 ? penalty.minutes : "RL"}</span>
        <span class="mt-who"><strong>${nameHtml(who)}</strong>${penalty.reason ? `<span class="mt-reason">(${escapeHtml(penalty.reason)})</span>` : ""}</span>
      </div>
    </div>`;
}

const SO_RESULT_FI: Record<string, string> = { save: "Torjuttu", miss: "Ohi" };

function shootoutHtml(attempt: ShootoutAttempt, awayAbbrev: string): string {
  const side = attempt.team_abbrev === awayAbbrev ? "away" : "home";
  const outcome =
    attempt.result === "goal"
      ? `<span class="mt-pill">${logoHtml(attempt.team_abbrev)}<span class="mt-pill-score">${attempt.away_score} - ${attempt.home_score}</span></span>`
      : `<span class="mt-so-miss">${SO_RESULT_FI[attempt.result]}</span>`;
  return `
    <div class="mt-event mt-${side} mt-so mt-so-${attempt.result}">
      <div class="mt-main">
        <span class="mt-time">${attempt.sequence}.</span>
        ${outcome}
        <span class="mt-who"><strong>${nameHtml(attempt.player)}</strong></span>
      </div>
    </div>`;
}

// Red "swap" arrows (Material swap_horiz); same path in app.js.
const SWAP_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>`;

function goalieChangeHtml(change: GoalieChange, side: "away" | "home"): string {
  return `
    <div class="mt-event mt-${side} mt-goalie">
      <div class="mt-main">
        <span class="mt-time">${escapeHtml(change.time_in_period)}</span>
        <span class="mt-badge mt-swap" title="Maalivahdinvaihto" aria-label="Maalivahdinvaihto">${SWAP_ICON}</span>
        <span class="mt-who"><strong>${nameHtml(change.goalie_in)}</strong><span class="mt-reason">${nameHtml(change.goalie_out)}</span></span>
      </div>
    </div>`;
}

function eventHtml(event: TimelineEvent, awayAbbrev: string): string {
  if (event.kind === "goal") return goalHtml(event.goal, event.goal.team_abbrev === awayAbbrev ? "away" : "home");
  if (event.kind === "goalie") return goalieChangeHtml(event.change, event.change.team_abbrev === awayAbbrev ? "away" : "home");
  return penaltyHtml(event.penalty, event.penalty.team_abbrev === awayAbbrev ? "away" : "home");
}

export function renderMatchTimeline(periods: TimelinePeriod[], awayAbbrev: string): string {
  if (!periods.length) return `<p class="tp-empty">Ei maaleja eikä jäähyjä.</p>`;
  const bands = periods
    .map(
      (period) => `
    <div class="mt-band"><span>${escapeHtml(period.label)}</span><span class="mt-band-score">${period.away_goals} - ${period.home_goals}</span></div>
    ${period.events.map((event) => eventHtml(event, awayAbbrev)).join("")}${(period.shootout ?? []).map((a) => shootoutHtml(a, awayAbbrev)).join("")}`,
    )
    .join("");
  return `<div class="mt">${bands}</div>`;
}
