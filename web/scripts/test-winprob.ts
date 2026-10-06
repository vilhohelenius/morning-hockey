// Unit test for _shared/winProb.ts display helpers (pure, no D1).
import assert from "node:assert/strict";
import { biggestFactor, winProbInfoText, winProbPercents, winProbStatRow } from "../functions/_shared/winProb.ts";

assert.deepEqual(winProbPercents(0.584), { home: 58, away: 42 });
assert.deepEqual(winProbPercents(0.9999), { home: 99, away: 1 });
assert.deepEqual(winProbPercents(0.5), { home: 50, away: 50 });

const p = { home_win_prob: 0.584, ability: 0.1, chances: 0.4, goalie: -0.02, context: 0 };
assert.equal(biggestFactor(p), "maalipaikat");
assert.equal(biggestFactor({ ...p, ability: 0, chances: 0.01 }), null);
const row = winProbStatRow(p);
assert.equal(row.home_value, "58 %");
assert.equal(row.away_value, "42 %");
assert.ok(winProbInfoText(p).includes("suurin tekijä: maalipaikat"));
assert.ok(!/\d[.,]\d/.test(row.home_value + row.away_value));
console.log("winprob ok");
