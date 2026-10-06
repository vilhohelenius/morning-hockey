import assert from "node:assert/strict";
import { sortWatchSkaters, tiedWatchIds } from "../functions/_shared/xg.ts";

const p = (player_id: number, position: string, points: number, goals: number) => ({ player_id, position, points, goals });
const roster = [p(1, "C", 5, 2), p(2, "D", 5, 2), p(3, "W", 5, 3), p(4, "D", 4, 0)];
assert.deepEqual(sortWatchSkaters(roster, new Map()).map((x) => x.player_id), [3, 1, 2, 4]); // goals, then stable
assert.deepEqual(sortWatchSkaters(roster, new Map([[2, 60], [1, 50]])).map((x) => x.player_id), [3, 2, 1, 4]); // last season
assert.deepEqual(tiedWatchIds(sortWatchSkaters(roster, new Map())), []);
assert.deepEqual(tiedWatchIds([p(1, "C", 5, 2), p(2, "W", 5, 2), p(3, "D", 1, 0)]), [1, 2]);
console.log("watch tiebreak ok");
