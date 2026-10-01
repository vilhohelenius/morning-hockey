// Home-page player search ("Etusivu" top bar / sidebar header): a
// fragment-returning GET, not run through renderLayout -- app.js's
// ".player-search" handler fetch()es this and drops the response straight
// into .player-search-results via innerHTML. First route in the codebase
// where injected markup comes from fetch() rather than a full page load
// (every other dynamic bit of UI, like the day-picker, just toggles classes
// on markup the page already has).
//
// Public and unauthenticated, same as /pelaajat/[playerId].ts itself --
// unlike /omat's favorites search, this isn't scoped to a signed-in user.

import { escapeHtml, nationalityFlag, teamLogoUrl } from "../_shared/format";
import type { Env, TeamRosterGoalieRow, TeamRosterSkaterRow } from "../_shared/types";

const MIN_QUERY_LENGTH = 3;
const RESULTS_LIMIT = 20;

interface SearchResult {
  player_id: number;
  team_abbrev: string;
  name: string;
  sweater_number: number;
  headshot: string;
  nationality: string;
}

function teamMetaLogo(abbrev: string): string {
  return `<img src="${escapeHtml(teamLogoUrl(abbrev))}" alt="${escapeHtml(abbrev)}" class="table-team-logo" loading="lazy">`;
}

function renderResult(row: SearchResult): string {
  const flag = nationalityFlag(row.nationality);
  return `
<a href="/pelaajat/${row.player_id}" class="player-cell search-result-item">
  <img src="${escapeHtml(row.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
  <span class="player-name">
    ${escapeHtml(row.name)}
    <span class="player-meta">${teamMetaLogo(row.team_abbrev)} #${row.sweater_number}${flag ? ` · ${flag}` : ""}</span>
  </span>
</a>`;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const query = (new URL(context.request.url).searchParams.get("q") ?? "").trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return new Response("", { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const db = context.env.DB;
  const likeQuery = `%${query}%`;
  const [{ results: skaters }, { results: goalies }] = await Promise.all([
    db
      .prepare("SELECT * FROM team_roster_skaters WHERE name LIKE ? ORDER BY name LIMIT ?")
      .bind(likeQuery, RESULTS_LIMIT)
      .all<TeamRosterSkaterRow>(),
    db
      .prepare("SELECT * FROM team_roster_goalies WHERE name LIKE ? ORDER BY name LIMIT ?")
      .bind(likeQuery, RESULTS_LIMIT)
      .all<TeamRosterGoalieRow>(),
  ]);

  // Goalies carry no nationality column (see d1/schema.sql) -- their flag
  // is just left off rather than faked; nationalityFlag("") already
  // returns "" for an unmapped code, so renderResult needs no extra branch.
  const results: SearchResult[] = [
    ...skaters.map((r) => ({
      player_id: r.player_id,
      team_abbrev: r.team_abbrev,
      name: r.name,
      sweater_number: r.sweater_number,
      headshot: r.headshot,
      nationality: r.nationality,
    })),
    ...goalies.map((r) => ({
      player_id: r.player_id,
      team_abbrev: r.team_abbrev,
      name: r.name,
      sweater_number: r.sweater_number,
      headshot: r.headshot,
      nationality: "",
    })),
  ]
    .sort((a, b) => a.name.localeCompare(b.name, "fi"))
    .slice(0, RESULTS_LIMIT);

  const html = results.length
    ? results.map(renderResult).join("")
    : `<p class="empty-note">Ei osumia haulle "${escapeHtml(query)}".</p>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
};
