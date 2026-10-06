import assert from "node:assert/strict";
import { buildFinnishNight, goalieDecisionFi, renderFinnishNightSection } from "../functions/_shared/finnishNight.ts";

const sk = (id: number, name: string, nat: string, goals: number, assists: number, toi = "18:00") =>
  ({ player_id: id, name, position: "C", nationality: nat, headshot: "", goals, assists, points: goals + assists, plus_minus: 1, shots: 0, blocked_shots: 0, hits: 0, giveaways: 0, takeaways: 0, faceoff_pct: null, pim: 0, toi }) as any;
const gl = (id: number, name: string, nat: string, toi: string, decision: string | null) =>
  ({ player_id: id, name, nationality: nat, headshot: "", decision, saves: 20, shots_against: 22, save_pct: 0.909, ev_goals_against: 2, pp_goals_against: 0, sh_goals_against: 0, toi }) as any;

const game = { game_id: 1, away_abbrev: "PHI", away_logo: "a", away_score: 1, home_abbrev: "TBL", home_logo: "h", home_score: 4 } as any;
const night = buildFinnishNight([
  {
    game,
    awaySkaters: [sk(1, "Pointless Fin", "FIN", 0, 0), sk(2, "Swede", "SWE", 3, 0)],
    homeSkaters: [sk(3, "Scorer Fin", "FIN", 1, 1), sk(4, "Scratched Fin", "FIN", 0, 0, "00:00")],
    awayGoalies: [gl(5, "Away Goalie", "FIN", "60:00", "L")],
    homeGoalies: [gl(6, "Backup", "FIN", "00:00", null)],
    live: false,
    liveText: "",
  },
]);
assert.deepEqual(night.skaters.map((s) => s.player.player_id), [3, 1]);
assert.equal(night.skaters[0].teamAbbrev, "TBL");
assert.equal(night.skaters[0].teamScore, 4);
assert.equal(night.skaters[1].oppAbbrev, "TBL");
assert.equal(night.skaters[1].teamScore, 1);
assert.deepEqual(night.goalies.map((g) => g.player.player_id), [5]);
assert.equal(goalieDecisionFi("W"), "V");
assert.equal(goalieDecisionFi("L"), "H");
assert.equal(goalieDecisionFi("O"), "JH");
assert.equal(goalieDecisionFi(null), "–");
assert.equal(night.skaters[0].oppLogo, "a");
const html = renderFinnishNightSection(night, "x");
// Scorer Fin (home): own logo TBL, 4–1, opp logo PHI -- logos, not abbreviation text.
assert.match(html, /<td class="yf-game"><span class="yf-result"><img src="h" alt="TBL"[^>]*class="yf-game-logo yf-own"[^>]*><span class="yf-score"><strong class="yf-own-score">4<\/strong>–<span class="yf-opp-score">1<\/span><\/span><img src="a" alt="PHI"[^>]*class="yf-game-logo yf-opp"/);
assert.doesNotMatch(html, /TBL 4–1 PHI/);
// Away skater sees the same game from the other side.
assert.match(html, /<img src="a" alt="PHI"[^>]*class="yf-game-logo yf-own"[^>]*><span class="yf-score"><strong class="yf-own-score">1<\/strong>–<span class="yf-opp-score">4<\/span>/);
assert.match(renderFinnishNightSection({ skaters: [], goalies: [] }, "x"), /Ei suomalaisia pelaajia yön otteluissa\./);
console.log("finnish-night tests passed");
