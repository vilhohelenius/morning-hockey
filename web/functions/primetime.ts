// Prime time, phase 4: upcoming games starting 18:00-00:30 Europe/Helsinki,
// grouped by local calendar date. Fully derivable from the games table
// already synced by the fast-tier workflow -- no new D1 table needed.
//
// games accumulates permanently (phase 1: upserted, never deleted), so
// "upcoming week" here means "from today's Helsinki date onward" rather
// than trying to reproduce build_primetime's exact 7-day NHL schedule
// window -- whatever's actually in D1 past today is what the fast-tier
// sync has kept current.

import { icon, escapeHtml, helsinkiParts, helsinkiToday, humanDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, GameRow } from "./_shared/types";

const WINDOW_START_HOUR = 18;
const DEFAULT_DAYS_SHOWN = 5;

function startsInWindow(hour: number, minute: number): boolean {
  if (hour >= WINDOW_START_HOUR) return true;
  return hour === 0 && minute <= 30;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const today = helsinkiToday();

  const { results: rows } = await db
    .prepare("SELECT * FROM games WHERE date >= ? ORDER BY start_time_utc ASC")
    .bind(today)
    .all<GameRow>();

  const games = rows
    .map((game) => ({ game, local: helsinkiParts(game.start_time_utc) }))
    .filter(({ local }) => startsInWindow(local.hour, local.minute));

  // One <div> per calendar day with games, rather than a flat list -- lets
  // the "next 5 days" default collapse whole days at once (CSS is-hidden,
  // see app.js) without needing to count individual games, and without the
  // table-row-oriented collapse/expand JS used elsewhere (this isn't a
  // <table>, so that logic doesn't apply here).
  let body = "";
  let currentDate: string | null = null;
  let dayIndex = -1;
  for (const { game, local } of games) {
    if (local.date !== currentDate) {
      currentDate = local.date;
      dayIndex++;
      if (dayIndex > 0) body += `</div>`;
      body += `<div class="primetime-day-group${dayIndex >= DEFAULT_DAYS_SHOWN ? " is-hidden" : ""}" data-day-index="${dayIndex}">`;
      body += `<h2 class="roster-group-title primetime-day">${escapeHtml(humanDate(local.date))}</h2>`;
    }

    const time = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
    const score = game.is_finished
      ? `<span class="primetime-score">${game.away_score}–${game.home_score}</span>`
      : `<span class="primetime-score primetime-score-pending">–</span>`;

    body += `
  <a class="primetime-row ${game.is_finished ? "is-finished" : ""}" href="/ottelut/${game.game_id}">
    <span class="primetime-time">${time}</span>
    <span class="primetime-matchup">
      <img src="${escapeHtml(game.away_logo)}" alt="" class="schedule-logo" loading="lazy">
      ${escapeHtml(game.away_abbrev)}
      <span class="primetime-at">@</span>
      <img src="${escapeHtml(game.home_logo)}" alt="" class="schedule-logo" loading="lazy">
      ${escapeHtml(game.home_abbrev)}
    </span>
    ${score}
  </a>`;
  }
  if (dayIndex >= 0) body += `</div>`;

  const totalDays = dayIndex + 1;
  const expandButton =
    totalDays > DEFAULT_DAYS_SHOWN
      ? `<button type="button" id="primetime-expand" class="expand-toggle">Näytä kaikki ${totalDays} päivää →</button>`
      : "";

  const content = `
<header class="page-header">
  <h1>${icon("moon")} Prime time</h1>
  <p class="subtitle">Tuleva viikko, alkaen ${escapeHtml(humanDate(today))}</p>
  <p class="standings-legend">Ottelut, jotka alkavat Suomen aikaa klo 18–00.30 — nämä ehtii katsomaan
    illalla ilman yövalvomista.</p>
</header>

${games.length ? body : `<p class="empty-note">Ei klo 18–00.30 alkavia otteluita tulevalla viikolla.</p>`}
${expandButton}
`;

  const html = await renderLayout({
    title: "Prime time · Morning Hockey",
    headerTitle: "Prime time",
    activePage: "primetime",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
