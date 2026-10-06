import assert from "node:assert/strict";
import {
  buildBingoRows,
  currentNight,
  gameNight,
  newPickRoundDate,
  nightLabel,
  pickPhase,
  pickTargetNight,
  renderBingoSection,
} from "../functions/_shared/bingo.ts";

const g = (id: number, start: string, away: string, home: string, state = "FUT", fin = 0) =>
  ({ game_id: id, start_time_utc: start, away_abbrev: away, home_abbrev: home, away_logo: "a", home_logo: "h", away_score: 1, home_score: 2, game_state: state, is_finished: fin }) as any;

// Night key: 02:00 Helsinki on Oct 4 (23:00Z Oct 3) is the evening of Oct 3.
assert.equal(gameNight("2026-10-03T23:00:00Z"), "2026-10-03");
assert.equal(gameNight("2026-10-04T02:30:00Z"), "2026-10-03"); // 05:30 Helsinki
assert.equal(gameNight("2026-10-03T16:00:00Z"), "2026-10-03"); // 19:00 Helsinki matinee, same night
assert.equal(gameNight("2026-10-04T16:00:00Z"), "2026-10-04");
assert.equal(nightLabel("2026-10-03"), "3.–4.10.");
assert.equal(nightLabel("2026-09-30"), "30.9.–1.10.");

const n1a = g(1, "2026-10-03T23:00:00Z", "TOR", "BOS", "OFF", 1);
const n1b = g(2, "2026-10-04T02:00:00Z", "EDM", "VGK", "LIVE", 0);
const n2 = g(3, "2026-10-04T23:00:00Z", "TOR", "NYR");
const games = [n1a, n1b, n2];
const t = (iso: string) => new Date(iso).getTime();

// A pick made on the morning after night 1 targets night 2; one made before targets night 1.
assert.equal(pickTargetNight(games, t("2026-10-04T06:00:00Z")), "2026-10-04");
assert.equal(pickTargetNight(games, t("2026-10-03T10:00:00Z")), "2026-10-03");
assert.equal(pickTargetNight([], t("2026-10-03T10:00:00Z")), null);
assert.match(newPickRoundDate([], t("2026-10-03T10:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);

// Reset: slip of night 1 is active until night 2's first game starts, then stale.
const morning = t("2026-10-04T06:00:00Z");
assert.equal(currentNight(games, morning), "2026-10-03");
assert.equal(pickPhase("2026-10-03", currentNight(games, morning)), "active");
assert.equal(pickPhase("2026-10-04", currentNight(games, morning)), "upcoming");
const evening = t("2026-10-04T23:30:00Z");
assert.equal(currentNight(games, evening), "2026-10-04");
assert.equal(pickPhase("2026-10-03", currentNight(games, evening)), "stale");
assert.equal(pickPhase("2026-10-04", currentNight(games, evening)), "active");
assert.equal(pickPhase("2026-10-04", null), "upcoming");

// Rows
const sk = (id: number, goals: number, assists: number, toi = "18:00") => ({ player_id: id, goals, assists, points: goals + assists, toi }) as any;
const pk = (id: number, name: string, team: string) => ({ player_id: id, name, headshot: "", position: "C", team_abbrev: team, team_logo: "l" });
const data = [
  { game: n1a, live: false, liveText: "", awaySkaters: [sk(10, 1, 1), sk(11, 0, 0, "00:00")], homeSkaters: [sk(12, 0, 0)], boxLoaded: true },
  { game: n1b, live: true, liveText: "2. erä · 10:00", awaySkaters: [], homeSkaters: [], boxLoaded: true },
  { game: n2, live: false, liveText: "", awaySkaters: [], homeSkaters: [], boxLoaded: true },
];
const rows = buildBingoRows(
  [pk(10, "Scorer", "TOR"), pk(11, "Scratch", "TOR"), pk(12, "Zero", "BOS"), pk(13, "Live", "EDM"), pk(14, "None", "CHI")],
  data.slice(0, 2),
  morning,
);
const by = Object.fromEntries(rows.map((r) => [r.pick.name, r]));
assert.equal(by.Scorer.status, "played");
assert.equal(by.Scorer.points, 2);
assert.equal(by.Scratch.status, "dnp"); // 00:00 TOI
assert.equal(by.Zero.status, "played");
assert.equal(by.Zero.points, 0);
assert.equal(by.Live.status, "dnp"); // not in the live box score yet
assert.equal(by.None.status, "nogame");
assert.equal(rows[0].pick.name, "Scorer"); // played first, by points
const waiting = buildBingoRows([pk(20, "Later", "NYR")], [data[2]], morning);
assert.equal(waiting[0].status, "waiting");
assert.equal(buildBingoRows([pk(10, "X", "TOR")], [{ ...data[0], boxLoaded: false }], morning)[0].status, "unknown");

// Rendering: gated rows hide stats behind data-gate, no score in spoiler mode.
const html = renderBingoSection(rows, "x", { showScore: false, gated: true, gateFor: (id) => String(id) }, morning);
assert.match(html, /data-gate="1"/);
assert.match(html, /bingo-q/);
assert.doesNotMatch(html, /1–2|2–1/);
const open = renderBingoSection(rows, "x", { showScore: true, gated: false }, morning);
assert.doesNotMatch(open, /data-gate/);
assert.match(open, /2–1/);
assert.match(renderBingoSection(waiting, "x", { showScore: true, gated: true }, morning), /Peli ei ole alkanut · klo \d\d:\d\d/);
console.log("bingo tests passed");
