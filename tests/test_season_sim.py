import datetime as dt
import pytest

from morning_hockey.winprob.season import fetch_schedule, simulate_season
from morning_hockey.winprob.sync import _TEAM_IDS

TEAMS = sorted(set(_TEAM_IDS) - {"ARI"})
DIVISIONS = {a: ("E" if i < 16 else "W", "ABCD"[i // 8]) for i, a in enumerate(TEAMS)}
TODAY = dt.date(2026, 11, 1)


def _schedule():
    games = []
    for k in range(40):  # every team plays 40 games against a rotating opponent; the first 10 are played
        for i, a in enumerate(TEAMS):
            b = TEAMS[(i + 1 + k) % 32]
            if a < b:
                games.append({"id": len(games), "season": 20262027, "date": f"2026-10-{1 + k % 28:02d}" if k < 10 else f"2027-02-{1 + k % 28:02d}",
                              "home": a, "away": b, "home_score": 4 if a == "BOS" else 2, "away_score": 1,
                              "finished": k < 10, "final_type": "REG"})
    return games


def test_simulation_totals_and_ordering():
    rows = {r["abbrev"]: r for r in simulate_season([], _schedule(), DIVISIONS, TODAY, sims=2000)}
    assert sum(r["p_playoffs"] for r in rows.values()) == pytest.approx(16, abs=0.01)  # 3 x 4 divisions + 2 x 2 wild cards
    assert sum(r["p_division"] for r in rows.values()) == pytest.approx(4, abs=0.01)
    assert sum(r["p_presidents"] for r in rows.values()) == pytest.approx(1, abs=0.01)
    assert all(r["points_p10"] <= r["exp_points"] <= r["points_p90"] for r in rows.values())
    assert rows["BOS"]["points"] > rows["TOR"]["points"] or rows["BOS"]["games_played"] == 0
    assert rows["BOS"]["p_playoffs"] >= rows["TOR"]["p_playoffs"]


def test_fetch_schedule_reads_scores_and_states():
    class Fake:
        def club_schedule_season(self, abbrev):
            g = lambda i, state, t, typ=2: {"id": i, "season": 20262027, "gameType": typ, "gameDate": "2026-10-01", "gameState": state,
                                          "homeTeam": {"abbrev": "BOS", "score": 3}, "awayTeam": {"abbrev": "TOR", "score": 2},
                                          **({"gameOutcome": {"lastPeriodType": t}} if t else {})}
            return {"games": [g(1, "OFF", "OT"), g(2, "FUT", None), g(3, "OFF", "REG", typ=3)]}

    got = fetch_schedule(Fake(), ["BOS", "TOR"])
    assert [(g["id"], g["finished"], g["final_type"]) for g in got] == [(1, True, "OT"), (2, False, "REG")]
