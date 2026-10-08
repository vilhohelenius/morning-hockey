// /bingo -- Pistemiesbingo: set the slip (player search + remove) and see
// the result list (same table as at the bottom of /tulospiilo) on one page.
// If the user has Tulospiilo mode on, the stats start hidden ("?") behind a
// single "Näytä tulokset" button so opening this page can't spoil a night.

import { currentUsername, readTulospiiloCookie } from "./_shared/auth";
import { nightLabel, renderBingoSection } from "./_shared/bingo";
import { loadActiveRows, loadPicks, loadWindowGames, MAX_PICKS_PER_ROUND, type PickView } from "./_shared/bingoData";
import { icon, escapeHtml, nationalityFlag, teamHeroBackgroundStyle, teamLogoUrl } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, TeamRosterSkaterRow } from "./_shared/types";

const SEARCH_RESULTS_LIMIT = 15;

function html(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function pickRow(p: PickView): string {
  const chip = p.phase === "upcoming" ? `<span class="bingo-chip">Seuraava kierros</span>` : "";
  return `
    <div class="fav-row">
      <a href="/pelaajat/${p.player_id}" class="fav-row-info">
        <img src="${escapeHtml(p.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        ${escapeHtml(p.name)} <span class="fav-row-meta"><img src="${escapeHtml(p.team_logo)}" alt="${escapeHtml(p.team_abbrev)}" class="table-team-logo" loading="lazy"></span>
      </a>
      ${chip}
      <form method="post" action="/omat/bingo">
        <input type="hidden" name="player_id" value="${p.player_id}">
        <input type="hidden" name="round_date" value="${escapeHtml(p.round_date)}">
        <input type="hidden" name="bingo_action" value="remove">
        <input type="hidden" name="redirect_to" value="/bingo">
        <button type="submit" class="icon-btn" aria-label="Poista lapusta">${icon("close")}</button>
      </form>
    </div>`;
}

function searchRow(r: TeamRosterSkaterRow): string {
  const flag = nationalityFlag(r.nationality);
  return `
    <div class="fav-row">
      <a href="/pelaajat/${r.player_id}" class="fav-row-info">
        <img src="${escapeHtml(r.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        ${escapeHtml(r.name)} <span class="fav-row-meta">${flag ? `${flag} ` : ""}<img src="${escapeHtml(teamLogoUrl(r.team_abbrev))}" alt="${escapeHtml(r.team_abbrev)}" class="table-team-logo" loading="lazy"></span>
      </a>
      <form method="post" action="/omat/bingo">
        <input type="hidden" name="player_id" value="${r.player_id}">
        <input type="hidden" name="bingo_action" value="add">
        <input type="hidden" name="redirect_to" value="/bingo">
        <button type="submit" class="filter-btn">+ Lisää</button>
      </form>
    </div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const username = currentUsername(context.request);
  if (!username) {
    return html(
      await renderLayout({
        title: "Pistemiesbingo · Morning Hockey",
        headerTitle: "Pistemiesbingo",
        activePage: "bingo",
        request: context.request,
        content: `
<header class="page-header"><h1>${icon("target")} Pistemiesbingo</h1></header>
<p class="empty-note"><a href="/kirjaudu?next=${encodeURIComponent("/bingo")}">Kirjaudu sisään</a> asettaaksesi pistemiesbingo-lappusi.</p>`,
      }),
    );
  }

  const db = context.env.DB;
  const now = Date.now();
  const query = new URL(context.request.url).searchParams.get("q")?.trim() ?? "";

  const games = await loadWindowGames(db);
  const picks = (await loadPicks(db, username, games, now)).filter((p) => p.phase !== "stale");
  const rows = await loadActiveRows(db, games, picks, now);
  const gated = readTulospiiloCookie(context.request);

  let searchHtml = "";
  if (query) {
    const { results } = await db
      .prepare("SELECT * FROM team_roster_skaters WHERE name LIKE ? ORDER BY name LIMIT ?")
      .bind(`%${query}%`, SEARCH_RESULTS_LIMIT)
      .all<TeamRosterSkaterRow>();
    const picked = new Set(picks.map((p) => p.player_id));
    const matches = results.filter((r) => !picked.has(r.player_id));
    searchHtml = matches.length
      ? `<div class="fav-list">${matches.map(searchRow).join("")}</div>`
      : `<p class="empty-note">Ei osumia haulle "${escapeHtml(query)}".</p>`;
  }

  // Slip grouped by night (usually just the current night and/or the next).
  const groups = new Map<string, PickView[]>();
  for (const p of picks) groups.set(p.round_date, [...(groups.get(p.round_date) ?? []), p]);
  const slipHtml = picks.length
    ? [...groups.entries()]
        .map(
          ([date, list]) =>
            `${groups.size > 1 ? `<h3 class="bingo-group-title">Kierros ${nightLabel(date)}</h3>` : ""}<div class="fav-list">${list.map(pickRow).join("")}</div>`,
        )
        .join("")
    : `<p class="empty-note">Ei vielä pelaajia lapussa.</p>`;

  const resultsHtml = rows.length
    ? renderBingoSection(rows, teamHeroBackgroundStyle("NHL", false), { showScore: !gated, gated }, now) +
      (gated
        ? `<button type="button" class="filter-btn bingo-reveal" id="bingo-reveal">Näytä tulokset</button>
<script>
document.getElementById("bingo-reveal").addEventListener("click", function () {
  document.querySelectorAll(".bingo-row[data-gate]").forEach(function (r) { r.classList.add("is-revealed"); });
  this.remove();
});
</script>`
        : "")
    : `<p class="empty-note">${picks.length ? "Lappusi pelaajien kierros ei ole vielä alkanut -- tulokset ilmestyvät tähän, kun pelit alkavat." : "Lisää pelaajia, niin tulokset näkyvät tässä."}</p>`;

  const content = `
<header class="page-header"><h1>${icon("target")} Pistemiesbingo</h1></header>

<div class="settings-page">
<section>
  <h2 class="section-title">Lappu</h2>
  <p class="standings-legend">
    Valitse pelaajat, joiden uskot tekevän pisteen. Lappu koskee seuraavaa alkamatonta pelikierrosta
    ja nollautuu itsestään joka päivä klo 14 Suomen aikaa. Lista näkyy myös Tulospiilon alaosassa.
    (Enintään ${MAX_PICKS_PER_ROUND} pelaajaa kierrosta kohti.)
  </p>
  ${slipHtml}
  ${picks.length ? `<form method="post" action="/omat/bingo" class="bingo-clear">
    <input type="hidden" name="bingo_action" value="clear">
    <input type="hidden" name="redirect_to" value="/bingo">
    <button type="submit" class="filter-btn">Tyhjennä lappu</button>
  </form>` : ""}
  <form method="get" action="/bingo" class="table-filters">
    <input type="search" name="q" id="bingo-search" placeholder="Hae pelaajaa nimellä (vähintään 3 merkkiä)..." value="${escapeHtml(query)}" autocomplete="off">
    <button type="submit" class="filter-btn">Hae</button>
  </form>
  <div id="bingo-search-results">${searchHtml}</div>
<script>
// Live suggestions: from 3 characters on, fetch the server-rendered result
// list (same /bingo?q= markup, each row has its own "+ Lisää" form).
(function () {
  var input = document.getElementById("bingo-search");
  var box = document.getElementById("bingo-search-results");
  var timer = null;
  var seq = 0;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    var q = input.value.trim();
    if (q.length < 3) { if (!q.length) box.innerHTML = ""; return; }
    timer = setTimeout(function () {
      var mine = ++seq;
      fetch("/bingo?q=" + encodeURIComponent(q), { credentials: "same-origin" })
        .then(function (r) { return r.text(); })
        .then(function (text) {
          if (mine !== seq) return;
          var doc = new DOMParser().parseFromString(text, "text/html");
          var fresh = doc.getElementById("bingo-search-results");
          if (fresh) box.innerHTML = fresh.innerHTML;
        })
        .catch(function () {});
    }, 200);
  });
})();
</script>
</section>

<section>
  ${resultsHtml}
</section>
</div>
`;

  return html(
    await renderLayout({
      title: "Pistemiesbingo · Morning Hockey",
      headerTitle: "Pistemiesbingo",
      activePage: "bingo",
      request: context.request,
      env: context.env,
      content,
    }),
  );
};
