// Tulospiilo ("spoiler-free") view: the previous round's finished games,
// shown as bare matchups + a YouTube highlights link, with the actual
// result hidden behind a two-step gate -- a checkbox ("I've watched the
// highlights") that, once checked, reveals a "Näytä tulos" button, which
// in turn opens the exact same goal-timeline + team-stats box the
// dashboard uses (app.js's existing .game-card-trigger / #game-details
// mechanism -- see _shared/gameCard.ts and index.ts), not a separate
// tulospiilo-only rendering of the result.
//
// Only ever shows the same round index.ts's dashboard calls "currentRound"
// (the most recent date with any started game), filtered down to games
// that have actually finished -- a game still live has no highlights yet
// and nothing final to spoil, so it just doesn't show up here until it is.
//
// Reachable via / redirecting here (when the signed-in user's tulospiilo
// cookie is on, see _shared/auth.ts + omat/tulospiilo.ts) or by visiting
// /tulospiilo directly; not in the sidebar nav, since the redirect is the
// intended entry point.
//
// Once every game on the page has been checked, this page's own inline
// script sets a tulospiilo_bypass_date cookie for the round's date --
// index.ts's redirect then skips itself for that date only, without
// touching the user's saved tulospiilo_mode preference (so the next
// round still opens here). Leaving early -- the sidebar or the "Poistu
// tulospiilosta" link -- is guarded by an in-page confirmation modal
// (never a native confirm(), to match the rest of the app's look and
// because it can't be blocked by browsers requiring a user gesture
// first); that guard is skipped once everything's already been revealed,
// since there's nothing left to spoil at that point.

import { currentUsername } from "./_shared/auth";
import { renderBingoSection } from "./_shared/bingo";
import { loadActiveRows, loadPicks, loadWindowGames } from "./_shared/bingoData";
import { getBoxScore, missingBoxRetryScript } from "./_shared/boxScoreCache";
import { buildTimeline } from "./_shared/boxscore";
import { resolveHighlightsUrl } from "./_shared/youtube";
import { escapeHtml, humanDate, teamHeroBackgroundStyle } from "./_shared/format";
import { renderLayout } from "./_shared/layout";
import type { Env, GameRow } from "./_shared/types";

function renderSpoilerGame(game: GameRow, youtubeUrl: string | null): string {
  const checkboxId = `spoiler-check-${game.game_id}`;

  return `
<div class="game-card spoiler-game">
  <input type="checkbox" id="${checkboxId}" class="spoiler-reveal-toggle">
  <label class="spoiler-check-label" for="${checkboxId}">
    <span class="spoiler-check-text">Merkitse nähdyksi, kun olet katsonut highlightit</span>
  </label>

  <div class="spoiler-score-row game-card-trigger" data-game-id="${game.game_id}" data-away-score="${game.away_score}" data-home-score="${game.home_score}" tabindex="-1" role="button" aria-expanded="false">
    <div class="score-row">
      <div class="team away">
        <img src="${escapeHtml(game.away_logo)}" alt="" class="logo" loading="lazy">
        <span class="abbrev">${escapeHtml(game.away_abbrev)}</span>
      </div>
      <div class="score spoiler-placeholder">?–?</div>
      <div class="team home">
        <span class="abbrev">${escapeHtml(game.home_abbrev)}</span>
        <img src="${escapeHtml(game.home_logo)}" alt="" class="logo" loading="lazy">
      </div>
    </div>
    <p class="game-card-hint spoiler-reveal-hint">Näytä tulos ▾</p>
  </div>

  ${youtubeUrl ? `<a class="game-card-youtube" href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener">▶ Highlightit (YouTube)</a>` : ""}
</div>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;

  const currentRound = await db
    .prepare("SELECT date FROM games WHERE game_state != 'FUT' ORDER BY date DESC LIMIT 1")
    .first<{ date: string }>();

  let gamesHtml = "";
  let roundDate: string | null = null;
  let roundComplete = false;
  const gameDetails: Record<number, { timeline?: unknown; team_stats?: unknown; youtube_url?: string }> = {};
  let missingBoxes = 0;

  if (currentRound) {
    const [{ results: games }, { results: allRoundGames }] = await Promise.all([
      db
        .prepare("SELECT * FROM games WHERE date = ? AND is_finished = 1 ORDER BY start_time_utc ASC")
        .bind(currentRound.date)
        .all<GameRow>(),
      db.prepare("SELECT game_id FROM games WHERE date = ?").bind(currentRound.date).all<{ game_id: number }>(),
    ]);
    // Only the already-finished games are listed/checkable here -- if the
    // round still has one or more games in progress, checking off every
    // *listed* game isn't the same as the round actually being over, so the
    // inline script below must not set tulospiilo_bypass_date in that case
    // (it would otherwise permanently skip the redirect for a round that
    // still has unrevealed results coming later the same night).
    roundComplete = games.length === allRoundGames.length;

    if (games.length) {
      roundDate = currentRound.date;
      for (const game of games) {
        const [{ box }, youtubeUrl] = await Promise.all([
          getBoxScore(db, game),
          resolveHighlightsUrl(db, context.env, game),
        ]);

        if (!box) missingBoxes++;
        gameDetails[game.game_id] = {
          youtube_url: youtubeUrl ?? undefined,
          ...(box ? { timeline: buildTimeline(box.goals, box.penalties, game.away_abbrev, box.shootout), team_stats: box.teamStats } : {}),
        };

        gamesHtml += renderSpoilerGame(game, youtubeUrl);
      }
    }
  }

  // Pistemiesbingo (bottom of the page, only if the signed-in user has an
  // active slip). Stats of started games are gated ("?") per game by the same
  // checkbox that reveals that game's result; games without a checkbox here
  // wait for all of them (data-gate="all"). See _shared/bingo.ts.
  let bingoHtml = "";
  const username = currentUsername(context.request);
  if (username) {
    const now = Date.now();
    const windowGames = await loadWindowGames(db);
    const picks = await loadPicks(db, username, windowGames, now);
    const rows = await loadActiveRows(db, windowGames, picks, now);
    missingBoxes += rows.filter((r) => r.status === "unknown").length;
    if (rows.length) {
      const listed = new Set(Object.keys(gameDetails).map(Number));
      bingoHtml = renderBingoSection(
        rows,
        teamHeroBackgroundStyle("BOS", false),
        { showScore: false, gated: true, gateFor: (id) => (listed.has(id) ? String(id) : "all") },
        now,
      );
    }
  }

  // Same defensive escape index.ts's own #game-details tag applies: a
  // stray "</script" inside embedded JSON can't close the tag early.
  const gameDetailsJson = JSON.stringify(gameDetails).replace(/<\//g, "<\\/");

  const content = `
<header class="page-header">
  <h1>🙈 Tulospiilo</h1>
  ${roundDate ? `<p class="subtitle">${escapeHtml(humanDate(roundDate))}</p>` : ""}
</header>

${
  gamesHtml
    ? `<div class="spoiler-bulk"><button type="button" class="filter-btn" id="spoiler-check-all">Valitse kaikki</button></div>
<div class="game-list">${gamesHtml}</div>`
    : `<p class="empty-note">Ei vielä valmiita otteluita viimeisimmältä kierrokselta.</p>`
}

${bingoHtml}

<a class="spoiler-exit" href="/?tulospiilo=ohita">Poistu tulospiilosta</a>

<div id="tulospiilo-exit-modal" class="tp-exit-modal" hidden>
  <div class="tp-exit-modal-box">
    <p class="tp-exit-modal-text">Tulokset saattavat näkyä muualla sivustolla. Haluatko silti poistua tulospiilosta?</p>
    <div class="tp-exit-modal-actions">
      <button type="button" class="filter-btn" id="tp-exit-stay">Pysy tulospiilossa</button>
      <button type="button" class="filter-btn active" id="tp-exit-confirm">Poistu tulospiilosta</button>
    </div>
  </div>
</div>

<script id="game-details" type="application/json">${gameDetailsJson}</script>
${missingBoxRetryScript(missingBoxes)}
<script>
(function () {
  var ROUND_DATE = ${JSON.stringify(roundDate)};
  var ROUND_COMPLETE = ${JSON.stringify(roundComplete)};
  var checkboxes = Array.prototype.slice.call(document.querySelectorAll(".spoiler-reveal-toggle"));
  var allRevealed = false;

  function syncRow(checkbox) {
    var row = checkbox.parentElement.querySelector(".spoiler-score-row");
    if (row) row.tabIndex = checkbox.checked ? 0 : -1;
  }

  function recomputeAllRevealed() {
    allRevealed = ROUND_COMPLETE && checkboxes.length > 0 && checkboxes.every(function (cb) { return cb.checked; });
    if (allRevealed && ROUND_DATE) {
      document.cookie = "tulospiilo_bypass_date=" + encodeURIComponent(ROUND_DATE) + "; path=/; max-age=259200; samesite=lax";
    }
  }

  checkboxes.forEach(function (cb) {
    syncRow(cb);
    cb.addEventListener("change", function () {
      syncRow(cb);
      recomputeAllRevealed();
      // One-way: once watched-and-checked, locked so it can't be
      // unchecked again (by the box itself or its <label>) -- nothing
      // should be able to re-hide an already-revealed result.
      if (cb.checked) cb.disabled = true;
    });
  });
  recomputeAllRevealed();

  // Pistemiesbingo rows reveal together with the game's own result.
  var bingoRows = Array.prototype.slice.call(document.querySelectorAll(".bingo-row[data-gate]"));
  function syncBingo() {
    var all = checkboxes.length > 0 && checkboxes.every(function (cb) { return cb.checked; });
    bingoRows.forEach(function (row) {
      var gate = row.getAttribute("data-gate");
      var cb = gate === "all" ? null : document.getElementById("spoiler-check-" + gate);
      row.classList.toggle("is-revealed", cb ? cb.checked : all);
    });
  }
  checkboxes.forEach(function (cb) { cb.addEventListener("change", syncBingo); });
  syncBingo();

  // "Valitse kaikki" and the YouTube highlights link both just tick the
  // same checkbox(es) a manual click would, via the change handler above
  // (so reveal/lock/bypass-cookie logic stays in one place). Already-
  // checked (hence disabled) boxes are skipped.
  function checkBox(cb) {
    if (cb.checked) return;
    cb.checked = true;
    cb.dispatchEvent(new Event("change"));
  }

  var checkAllBtn = document.getElementById("spoiler-check-all");
  if (checkAllBtn) {
    checkAllBtn.addEventListener("click", function () { checkboxes.forEach(checkBox); });
  }

  Array.prototype.slice.call(document.querySelectorAll(".game-card-youtube")).forEach(function (link) {
    link.addEventListener("click", function () {
      var cb = link.closest(".spoiler-game").querySelector(".spoiler-reveal-toggle");
      if (cb) checkBox(cb);
    });
  });

  // Clicking/activating the row opens the shared goal-timeline/team-stats
  // box (app.js's own delegated .game-card-trigger listener, unaffected by
  // this) -- this separate listener only swaps the "?-?" placeholder for
  // the actual score at the same moment, since the checkbox gate already
  // keeps this row unreachable (pointer-events/tabindex) until revealed.
  function revealScore(row) {
    var placeholder = row.querySelector(".spoiler-placeholder");
    if (!placeholder) return;
    placeholder.textContent = row.dataset.awayScore + "–" + row.dataset.homeScore;
  }

  Array.prototype.slice.call(document.querySelectorAll(".spoiler-score-row")).forEach(function (row) {
    row.addEventListener("click", function () { revealScore(row); });
    row.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") revealScore(row);
    });
  });

  var modal = document.getElementById("tulospiilo-exit-modal");
  var stayBtn = document.getElementById("tp-exit-stay");
  var confirmBtn = document.getElementById("tp-exit-confirm");
  var pendingHref = null;

  function closeModal() {
    modal.hidden = true;
    pendingHref = null;
  }

  function guardNavigation(event, href) {
    if (allRevealed) return;
    event.preventDefault();
    pendingHref = href;
    modal.hidden = false;
  }

  var exitLink = document.querySelector(".spoiler-exit");
  if (exitLink) {
    exitLink.addEventListener("click", function (event) {
      guardNavigation(event, exitLink.href);
    });
  }

  Array.prototype.slice.call(document.querySelectorAll("#sidebar .nav-list a")).forEach(function (link) {
    link.addEventListener("click", function (event) {
      guardNavigation(event, link.href);
    });
  });

  if (stayBtn) stayBtn.addEventListener("click", closeModal);
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function () {
      var href = pendingHref;
      closeModal();
      if (href) window.location.href = href;
    });
  }
})();
</script>
`;

  const html = await renderLayout({
    title: "Tulospiilo · Morning Hockey",
    headerTitle: "Tulospiilo",
    activePage: "tulospiilo",
    content,
    request: context.request,
    env: context.env,
  });

  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
