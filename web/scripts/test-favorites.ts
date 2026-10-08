// Pure helpers behind /suosikit (functions/_shared/favorites.ts).

import assert from "node:assert/strict";
import test from "node:test";
import { buildDigest, currentSeasonId, goalieLast, skaterLast, teamNickname, type GameLogEntry } from "../functions/_shared/favorites.ts";

const entry = (o: Partial<GameLogEntry>): GameLogEntry => ({
  gameId: 1, goals: 0, assists: 0, points: 0, plusMinus: 0, shotsAgainst: 0, goalsAgainst: 0, decision: "", toiSeconds: 0, ...o,
});

test("season id rolls over in August", () => {
  assert.equal(currentSeasonId(new Date("2026-10-08")), 20262027);
  assert.equal(currentSeasonId(new Date("2027-03-01")), 20262027);
});

test("skaterLast sums only the newest n games", () => {
  const log = [entry({ goals: 1, points: 2, plusMinus: 1 }), entry({ goals: 2, points: 2, plusMinus: -1 }), entry({ goals: 9, points: 9 })];
  assert.deepEqual(skaterLast(log, 2), { gp: 2, goals: 3, assists: 0, points: 4, plusMinus: 0 });
});

test("goalieLast: save pct, wins, null without games", () => {
  const log = [entry({ shotsAgainst: 30, goalsAgainst: 3, decision: "W", toiSeconds: 3600 })];
  const last = goalieLast(log, 5);
  assert.equal(last.wins, 1);
  assert.equal(last.savePct, 0.9);
  assert.equal(last.gaa, 3);
  assert.equal(goalieLast([], 5).savePct, null);
});

test("teamNickname", () => {
  assert.equal(teamNickname("Florida Panthers"), "Panthers");
  assert.equal(teamNickname("Vegas Golden Knights"), "Golden Knights");
});

test("buildDigest", () => {
  const html = buildDigest(
    [{ nickname: "Panthers", goalsFor: 4, goalsAgainst: 2, finalType: "REG" }],
    [{ lastName: "Barkov", goals: 1, assists: 1 }],
    ["Heiskanen"],
  );
  assert.equal(html, 'Panthers voitti 4–2. Barkov kirjasi <span class="sk-hit">maalin ja syötön</span>. Heiskanen jäi ilman pisteitä.');
  assert.equal(buildDigest([], [], []), "Suosikkisi eivät pelanneet viime yönä.");
});
