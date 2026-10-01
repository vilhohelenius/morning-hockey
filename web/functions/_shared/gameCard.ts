// A finished (or in-progress) game's score card, shared by the dashboard's
// "Viime yön ottelut" and Arkisto's per-day game lists: logos/abbrevs/
// score, an OT/SO badge when the box score says so, and -- the part that
// used to come from the once-daily digest sync's digest_scorers/
// digest_goalies tables -- a Finnish player highlight line for anyone who
// recorded a point or played goal, derived straight from that game's own
// box score (_shared/boxScoreCache) instead. Keeping this in one place
// means both pages get the same Finnish-highlight fix at once, rather than
// the dashboard having it and Arkisto quietly not.
//
// Wrapped in `.game-card-trigger` with `data-game-id`: app.js's existing
// click-to-expand handler (originally written for the static site, reused
// for sarjataulukko.ts's team snapshot) turns it into the goal-timeline +
// team-stats info box, reading a page-level `#game-details` JSON script
// tag keyed by game_id -- callers are responsible for emitting that tag.

import { decisionFi, escapeHtml, finalTypeFi } from "./format";
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

export function renderGameCard(game: GameRow, finalType: string, scorers: FinnScorerLine[], goalies: FinnGoalieLine[]): string {
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

  return `
<div class="game-card game-card-trigger" data-game-id="${game.game_id}" tabindex="0" role="button" aria-expanded="false">
  <div class="score-row">
    <div class="team away">
      <img src="${escapeHtml(game.away_logo)}" alt="" class="logo" loading="lazy">
      <span class="abbrev">${escapeHtml(game.away_abbrev)}</span>
    </div>
    <div class="score">
      <span>${game.away_score}</span>
      <span class="dash">–</span>
      <span>${game.home_score}</span>
    </div>
    <div class="team home">
      <span class="abbrev">${escapeHtml(game.home_abbrev)}</span>
      <img src="${escapeHtml(game.home_logo)}" alt="" class="logo" loading="lazy">
    </div>
  </div>
  ${game.is_finished && finalType !== "REG" ? `<p class="ot-tag">${escapeHtml(finalTypeFi(finalType))}</p>` : ""}
  ${finnStats}
</div>`;
}
