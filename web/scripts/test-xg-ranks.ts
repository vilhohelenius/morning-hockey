import assert from "node:assert/strict";
import { rankBadge, rankedTeamXg, rankIn, teamXgfRanks } from "../functions/_shared/xg.ts";

assert.equal(rankIn(5, [5, 5, 3, 9], true), 2); // ties share a rank
assert.equal(rankIn(3, [5, 5, 3, 9], false), 1);
assert.equal(rankBadge(undefined), "");
assert.match(rankBadge(3), /#3/);

const t = (xgf: number, xga: number) => ({ xgf, xga, xgf5v5: xgf, xga5v5: xga, games: 1 });
const league = new Map([[6, t(6, 4)], [7, t(5, 5)], [8, t(5, 5)]]); // BOS, BUF, MTL
assert.deepEqual(teamXgfRanks(league, "BOS"), { pct: 1, pct5v5: 1 });
assert.deepEqual(teamXgfRanks(league, "MTL"), { pct: 2, pct5v5: 2 });
assert.deepEqual(teamXgfRanks(league, "TOR"), {});
const ranked = rankedTeamXg(league);
assert.deepEqual(ranked.map((r) => r.abbrev), ["BOS", "BUF", "MTL"]);
assert.deepEqual(ranked.map((r) => r.rankPct), [1, 2, 2]);
assert.equal(ranked[0].rankXga, 1);
console.log("xg ranks ok");
