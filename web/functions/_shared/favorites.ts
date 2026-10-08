// Data helpers for /suosikit (the combined favorite teams + players view).
// Pure functions (no D1/fetch except fetchPlayerGameLog) so
// scripts/test-favorites.ts can run them under plain Node.

import { computeFormGuide } from "./formGuide.ts";
import { escapeHtml } from "./format.ts";
import type { GameRow } from "./types.ts";

const NHL_BASE = "https://api-web.nhle.com/v1";
const NHL_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; MorningHockey/1.0)", Accept: "application/json" };

// Each favorite player costs one NHL game-log fetch on /suosikit, and a Worker
// request may make at most 50 subrequests on the free plan.
export const MAX_FAVORITE_PLAYERS = 30;
export const FAVORITE_LIMIT_MESSAGE = "Suosikkipelaajien maksimimäärä saavutettu. Poista jokin, jotta voit lisätä uuden";

export interface GameLogEntry {
  gameId: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  shotsAgainst: number;
  goalsAgainst: number;
  decision: string;
  toiSeconds: number;
}

export function currentSeasonId(now: Date = new Date()): number {
  const startYear = now.getUTCMonth() + 1 >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return startYear * 10_000 + (startYear + 1);
}

// One regular-season game log per favorite, newest game first. Edge-cached
// 5 min (same as the player card); a failed fetch is [] so one flaky call
// only blanks that player's cells instead of the whole page.
export async function fetchPlayerGameLog(playerId: number, seasonId: number): Promise<GameLogEntry[]> {
  try {
    const response = await fetch(`${NHL_BASE}/player/${playerId}/game-log/${seasonId}/2`, {
      headers: NHL_HEADERS,
      cf: { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const data: any = await response.json();
    return (data.gameLog ?? []).map((g: any) => {
      const [m, s] = String(g.toi ?? "0:0").split(":").map(Number);
      return {
        gameId: g.gameId,
        goals: g.goals ?? 0,
        assists: g.assists ?? 0,
        points: g.points ?? 0,
        plusMinus: g.plusMinus ?? 0,
        shotsAgainst: g.shotsAgainst ?? 0,
        goalsAgainst: g.goalsAgainst ?? 0,
        decision: g.decision ?? "",
        toiSeconds: (m || 0) * 60 + (s || 0),
      };
    });
  } catch (error) {
    console.error(`Game log fetch failed for ${playerId}:`, error);
    return [];
  }
}

export function skaterLast(log: GameLogEntry[], n: number) {
  const recent = log.slice(0, n);
  const sum = (key: "goals" | "assists" | "points" | "plusMinus") => recent.reduce((total, g) => total + g[key], 0);
  return { gp: recent.length, goals: sum("goals"), assists: sum("assists"), points: sum("points"), plusMinus: sum("plusMinus") };
}

export function goalieLast(log: GameLogEntry[], n: number) {
  const recent = log.slice(0, n);
  const sa = recent.reduce((total, g) => total + g.shotsAgainst, 0);
  const ga = recent.reduce((total, g) => total + g.goalsAgainst, 0);
  const seconds = recent.reduce((total, g) => total + g.toiSeconds, 0);
  return {
    gp: recent.length,
    wins: recent.filter((g) => g.decision === "W").length,
    savePct: sa ? 1 - ga / sa : null,
    gaa: seconds ? (ga * 3600) / seconds : null,
  };
}

// A team's last n finished games: the form chips plus record, points and
// goal totals for the "Viimeiset 5" table view.
export function teamLast(games: GameRow[], abbrev: string, n: number) {
  const form = computeFormGuide(games, [abbrev], n)[0];
  const recent = games
    .filter((g) => g.is_finished === 1 && (g.away_abbrev === abbrev || g.home_abbrev === abbrev))
    .sort((a, b) => b.date.localeCompare(a.date) || b.game_id - a.game_id)
    .slice(0, n);
  let gf = 0;
  let ga = 0;
  for (const g of recent) {
    const home = g.home_abbrev === abbrev;
    gf += home ? g.home_score : g.away_score;
    ga += home ? g.away_score : g.home_score;
  }
  return { ...form, gf, ga };
}

// "Florida Panthers" -> "Panthers"; the few two-word nicknames are listed.
const TWO_WORD_NICKNAMES = ["Golden Knights", "Maple Leafs", "Blue Jackets", "Red Wings"];
export function teamNickname(name: string): string {
  return TWO_WORD_NICKNAMES.find((nick) => name.endsWith(nick)) ?? name.slice(name.lastIndexOf(" ") + 1);
}

export interface DigestTeam {
  nickname: string;
  goalsFor: number;
  goalsAgainst: number;
  finalType: string;
}

export interface DigestScorer {
  lastName: string;
  goals: number;
  assists: number;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

// The sentence-style recap on top of the page, e.g. "Panthers voitti 4–2.
// Barkov kirjasi maalin ja syötön. Heiskanen jäi ilman pisteitä." Returns
// HTML (names escaped) so the scoring phrase can carry the accent span.
export function buildDigest(teams: DigestTeam[], scorers: DigestScorer[], blanks: string[]): string {
  const sentences: string[] = [];
  for (const t of teams) {
    const score = `${t.goalsFor}–${t.goalsAgainst}`;
    const verb =
      t.goalsFor > t.goalsAgainst
        ? "voitti"
        : t.finalType === "OT"
          ? "hävisi jatkoajalla"
          : t.finalType === "SO"
            ? "hävisi voittolaukauskilpailussa"
            : "hävisi";
    sentences.push(`${escapeHtml(t.nickname)} ${verb} ${score}`);
  }
  for (const s of scorers.slice(0, 3)) {
    const parts = [s.goals ? plural(s.goals, "maalin", "maalia") : "", s.assists ? plural(s.assists, "syötön", "syöttöä") : ""]
      .filter(Boolean)
      .join(" ja ");
    sentences.push(`${escapeHtml(s.lastName)} kirjasi <span class="sk-hit">${parts}</span>`);
  }
  if (blanks.length) {
    sentences.push(
      blanks.length <= 2
        ? `${blanks.map(escapeHtml).join(" ja ")} jäi${blanks.length > 1 ? "vät" : ""} ilman pisteitä`
        : "Muut suosikkipelaajat jäivät ilman pisteitä",
    );
  }
  return sentences.length ? `${sentences.join(". ")}.` : "Suosikkisi eivät pelanneet viime yönä.";
}
