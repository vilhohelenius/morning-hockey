// Arkisto's top level: just a list of game days with finished games this
// season, newest first -- straight off `games`, which already works as a
// permanent archive (fast-tier upserts by game_id, never deletes). Each
// day links to /arkisto/<date> for that day's games in the usual card
// style (see arkisto/[date].ts). Split out of what used to be one long
// page listing every game inline, which wouldn't have scaled to a full
// season's worth of nights.

import { icon, escapeHtml, humanDate } from "../_shared/format";
import { renderLayout } from "../_shared/layout";
import type { Env } from "../_shared/types";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const { results: days } = await db
    .prepare("SELECT date, COUNT(*) as count FROM games WHERE is_finished = 1 GROUP BY date ORDER BY date DESC")
    .all<{ date: string; count: number }>();

  const listHtml = days.length
    ? `<ul class="archive-full-list">
  ${days
    .map(
      (day) => `
  <li><a href="/arkisto/${day.date}">
    ${escapeHtml(humanDate(day.date))}
    <span class="fav-row-meta">${day.count} ottelua</span>
  </a></li>`,
    )
    .join("")}
</ul>`
    : `<p class="empty-note">Ei vielä pelattuja otteluita arkistossa.</p>`;

  const content = `
<header class="page-header">
  <h1>${icon("archive")} Arkisto</h1>
  <p class="subtitle">${days.length} pelipäivää</p>
</header>
${listHtml}
`;

  const html = await renderLayout({
    title: "Arkisto · Morning Hockey",
    headerTitle: "Arkisto",
    activePage: "archive",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
