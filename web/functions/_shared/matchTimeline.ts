// Server-side HTML for the "ottelun kulku" timeline (Flashscore style): one
// grey band per period, away events left / home events right. The popup in
// app.js (renderTimeline) builds the same markup client-side from the same
// TimelinePeriod[] JSON -- keep the two in sync by hand (no build step).

import { escapeHtml, teamLogoUrl } from "./format";
import type { TimelineEvent, TimelinePeriod } from "./boxscore";
import type { GoalEvent, PenaltyEvent, ShootoutAttempt } from "./types";

const STRENGTH_FI: Record<string, string> = { YV: "YV", AV: "AV" };


function logoHtml(abbrev: string): string {
  return `<img class="mt-logo" src="${escapeHtml(teamLogoUrl(abbrev))}" alt="${escapeHtml(abbrev)}" loading="lazy">`;
}

function goalHtml(goal: GoalEvent, side: "away" | "home"): string {
  const strength = goal.strength ? `<span class="mt-strength">(${escapeHtml(STRENGTH_FI[goal.strength] ?? goal.strength)})</span>` : "";
  const assists = goal.assists_short ?? goal.assists;
  return `
    <div class="mt-event mt-${side} mt-goal">
      <div class="mt-main">
        ${(goal.period ?? 0) >= 100 ? "" : `<span class="mt-time">${escapeHtml(goal.time_in_period)}</span>`}
        <span class="mt-pill">${logoHtml(goal.team_abbrev)}<span class="mt-pill-score">${goal.away_score} - ${goal.home_score}</span></span>
        <span class="mt-who">${strength}<strong>${escapeHtml(goal.scorer_short ?? goal.scorer)}</strong></span>
      </div>
      ${assists.length ? `<p class="mt-assists">${escapeHtml(assists.join(" + "))}</p>` : ""}
    </div>`;
}

function penaltyHtml(penalty: PenaltyEvent, side: "away" | "home"): string {
  const who = penalty.player || penalty.team_abbrev;
  return `
    <div class="mt-event mt-${side} mt-penalty">
      <div class="mt-main">
        <span class="mt-time">${escapeHtml(penalty.time_in_period)}</span>
        <span class="mt-badge">${penalty.minutes > 0 ? penalty.minutes : "RL"}</span>
        <span class="mt-who"><strong>${escapeHtml(who)}</strong>${penalty.reason ? `<span class="mt-reason">(${escapeHtml(penalty.reason)})</span>` : ""}</span>
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
        <span class="mt-who"><strong>${escapeHtml(attempt.player)}</strong></span>
      </div>
    </div>`;
}

function eventHtml(event: TimelineEvent, awayAbbrev: string): string {
  if (event.kind === "goal") return goalHtml(event.goal, event.goal.team_abbrev === awayAbbrev ? "away" : "home");
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
