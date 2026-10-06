// Server-side HTML for the "ottelun kulku" timeline (Flashscore style): one
// grey band per period, away events left / home events right. The popup in
// app.js (renderTimeline) builds the same markup client-side from the same
// TimelinePeriod[] JSON -- keep the two in sync by hand (no build step).

import { escapeHtml } from "./format";
import type { TimelineEvent, TimelinePeriod } from "./boxscore";
import type { GoalEvent, PenaltyEvent } from "./types";

const STRENGTH_FI: Record<string, string> = { YV: "Ylivoima", AV: "Alivoima" };

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="2.5" y="4.5" width="19" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>`;
const PUCK_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><ellipse cx="12" cy="9.5" rx="9" ry="4.5" fill="currentColor"/><path d="M3 9.5v4c0 2.5 4 4.5 9 4.5s9-2 9-4.5v-4c0 2.5-4 4.5-9 4.5S3 12 3 9.5z" fill="currentColor" opacity="0.75"/></svg>`;

function goalHtml(goal: GoalEvent, side: "away" | "home"): string {
  const strength = goal.strength ? `<span class="mt-strength">(${escapeHtml(STRENGTH_FI[goal.strength] ?? goal.strength)})</span>` : "";
  const clip = goal.clip_url
    ? `<a class="mt-clip" href="${escapeHtml(goal.clip_url)}" target="_blank" rel="noopener" aria-label="Maalin kooste (NHL.com)">${PLAY_ICON}</a>`
    : "";
  const assists = goal.assists_short ?? goal.assists;
  return `
    <div class="mt-event mt-${side} mt-goal">
      <div class="mt-main">
        ${(goal.period ?? 0) >= 100 ? "" : `<span class="mt-time">${escapeHtml(goal.time_in_period)}</span>`}
        <span class="mt-pill"><span class="mt-icon">${PUCK_ICON}</span><span class="mt-pill-score">${goal.away_score} - ${goal.home_score}</span></span>
        <span class="mt-who">${strength}<strong>${escapeHtml(goal.scorer_short ?? goal.scorer)}</strong></span>
        ${clip}
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
    ${period.events.map((event) => eventHtml(event, awayAbbrev)).join("")}`,
    )
    .join("");
  return `<div class="mt">${bands}</div>`;
}
