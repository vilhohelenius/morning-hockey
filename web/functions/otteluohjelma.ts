// Otteluohjelma, phase 4: the next 8 calendar days (today + 7), every game,
// no time-of-day filter -- unlike Prime time. Same games table, grouped by
// the "date" column (already the correct Europe/Helsinki calendar date,
// computed once at sync time by schedule.py's own regrouping logic), so no
// per-game UTC->local conversion is needed here the way Prime time needed.
//
// Every day in the 8-day window gets its own section even with zero games
// (matching the original: the day-picker must have a pill for every day,
// and an empty day shows "Ei otteluita tänä päivänä" rather than vanishing).

import { jerseyColors } from "./_shared/teamColors";
import { addDays, escapeHtml, helsinkiParts, helsinkiToday, humanDate, shortWeekdayDate } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, GameRow } from "./_shared/types";

const WINDOW_DAYS = 8; // today + 7

function renderGameRow(game: GameRow): string {
  const local = helsinkiParts(game.start_time_utc);
  const time = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  const score = game.is_finished
    ? `<span class="primetime-score">${game.away_score}–${game.home_score}</span>`
    : `<span class="primetime-score primetime-score-pending">–</span>`;

  return `
    <a class="primetime-row ${game.is_finished ? "is-finished" : ""}" style="--ca:${jerseyColors(game.away_abbrev, game.home_abbrev)[0]};--ch:${jerseyColors(game.away_abbrev, game.home_abbrev)[1]}" href="/ottelut/${game.game_id}">
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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const today = helsinkiToday();
  const lastDate = addDays(today, WINDOW_DAYS - 1);

  const { results: rows } = await db
    .prepare("SELECT * FROM games WHERE date >= ? AND date <= ? ORDER BY date ASC, start_time_utc ASC")
    .bind(today, lastDate)
    .all<GameRow>();

  const gamesByDate = new Map<string, GameRow[]>();
  for (const row of rows) {
    const list = gamesByDate.get(row.date) ?? [];
    list.push(row);
    gamesByDate.set(row.date, list);
  }

  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i));

  const dayPicker = days
    .map((date, i) => `<button type="button" class="day-pill ${i === 0 ? "active" : ""}" data-date="${date}">${shortWeekdayDate(date)}</button>`)
    .join("");

  const sections = days
    .map((date, i) => {
      const games = gamesByDate.get(date) ?? [];
      return `
<section class="schedule-day-section ${i === 0 ? "" : "is-hidden"}" data-date="${date}">
  <h2 class="roster-group-title">${escapeHtml(humanDate(date))}</h2>
  ${games.length ? games.map(renderGameRow).join("") : `<p class="empty-note">Ei otteluita tänä päivänä.</p>`}
</section>`;
    })
    .join("");

  const content = `
<header class="page-header">
  <h1>📅 Otteluohjelma</h1>
  <p class="subtitle">Seuraavat 7 päivää, alkaen ${escapeHtml(humanDate(today))}</p>
</header>

<div class="day-picker">
  ${dayPicker}
</div>
${sections}
`;

  const html = await renderLayout({
    title: "Otteluohjelma · Morning Hockey",
    headerTitle: "Otteluohjelma",
    activePage: "schedule",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
