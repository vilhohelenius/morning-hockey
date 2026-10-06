import csv
import json
import math
import pathlib
from datetime import date

import pytest

from morning_hockey.winprob.inputs import compute_wp_inputs
from morning_hockey.winprob.model import MODEL, WinProbState, predict
from morning_hockey.winprob.sync import load_history, predict_upcoming

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def _fixture_games() -> list[dict]:
    goalies: dict[int, list] = {}
    for r in csv.DictReader((FIXTURES / "wp_goalies_2017.csv").open()):
        goalies.setdefault(int(r["gameId"]), []).append(
            {"player_id": int(r["goalieId"]), "team_id": int(r["teamId"]), "shots": int(r["shotsAgainst"]), "gsax": float(r["GSAx"])}
        )
    games = []
    for r in csv.DictReader((FIXTURES / "wp_games_2017.csv").open()):
        side = lambda s: {k: float(r[f"{s}_{k}"]) for k in ("gf", "ga", "xgf", "xga", "xgf5", "xga5", "sog_f", "sog_a", "dz")}
        gid = int(r["game_id"])
        games.append({
            "game_id": gid, "season": int(r["season"]), "date": r["date"], "home_id": int(r["home_id"]),
            "away_id": int(r["away_id"]), "final_type": r["final_type"],
            "teams": {int(r["home_id"]): side("h"), int(r["away_id"]): side("a")}, "goalies": goalies.get(gid, []),
        })
    return games


def _walk(games):
    state, out = WinProbState(), {}
    for g in games:
        f = state.features(g["home_id"], g["away_id"], g["season"], date.fromisoformat(g["date"]))
        out[g["game_id"]] = (f, predict(f)["home_win_prob"])
        state.update(g)
    return out


def test_matches_reference_features_and_probability():
    # expected values come from xGoalBoost data/wp_features.parquet (train_wp.py), goalie feature = team average
    expected = json.loads((FIXTURES / "wp_expected_2017.json").read_text())
    walked = _walk(_fixture_games())
    assert len(expected) == 44
    for gid, exp in expected.items():
        f, p = walked[int(gid)]
        for c in MODEL["features"]:
            # gS: the reference picks an arbitrary starter when two goalies faced equally many shots (31 games of 11k)
            assert f[c] == pytest.approx(exp[c], abs=0.1 if c == "gS" else 1e-4), (gid, c)
        assert p == pytest.approx(exp["p"], abs=0.003), gid


def test_distribution_of_predictions():
    games = _fixture_games()
    ps = [p for gid, (f, p) in _walk(games).items() if gid > games[200]["game_id"]]
    assert 0.50 < sum(ps) / len(ps) < 0.57
    assert sum(p > 0.85 for p in ps) / len(ps) < 0.02
    assert min(ps) > 0.1


def _game(gid, day, home, away, season=20242025, gf=3, ga=1, final="REG", goalie_shots=20):
    side = lambda a, b: {"gf": a, "ga": b, "xgf": 2.0, "xga": 1.0, "xgf5": 1.5, "xga5": 0.5, "sog_f": 30, "sog_a": 20, "dz": 4}
    return {"game_id": gid, "season": season, "date": day, "home_id": home, "away_id": away, "final_type": final,
            "teams": {home: side(gf, ga), away: side(ga, gf)},
            "goalies": [{"player_id": home * 10, "team_id": home, "shots": goalie_shots, "gsax": 1.0},
                        {"player_id": away * 10, "team_id": away, "shots": goalie_shots, "gsax": -1.0}]}


def test_state_update_and_ot_loss_counts_half():
    s = WinProbState()
    s.update(_game(1, "2024-10-10", 1, 2, final="OT"))
    assert s.team[1][10]["win"] == pytest.approx(0.5)  # OT: 0.5 for both, from init 0.5
    s.update(_game(2, "2024-10-12", 1, 2))
    a10 = 1 - 0.5 ** (1 / 10)
    assert s.team[1][10]["win"] == pytest.approx(0.5 + a10 * 0.5)
    assert s.team[2][10]["win"] == pytest.approx(0.5 - a10 * 0.5)
    assert s.team[1][40]["gd"] > 0 > s.team[2][40]["gd"]


def test_season_rollover_pulls_toward_init():
    s = WinProbState()
    s.update(_game(1, "2024-10-10", 1, 2))
    before = s.team[1][10]["win"]
    f = s.features(1, 3, 20252026, date(2025, 10, 8))
    assert s.team[1][10]["win"] == pytest.approx(0.6 * before + 0.4 * 0.5)
    assert f["win_10"] == pytest.approx(0.6 * before + 0.4 * 0.5 - 0.5)


def test_back_to_back():
    s = WinProbState()
    s.update(_game(1, "2024-10-10", 1, 2))
    assert s.features(1, 2, 20242025, date(2024, 10, 11))["b2b_diff"] == 0  # both played yesterday
    assert s.features(1, 3, 20242025, date(2024, 10, 11))["b2b_diff"] == 1  # only home played yesterday
    assert s.features(3, 1, 20242025, date(2024, 10, 11))["b2b_diff"] == -1
    assert s.features(1, 3, 20242025, date(2024, 10, 12))["b2b_diff"] == 0  # a day's rest


def test_goalie_rating_and_team_average():
    s = WinProbState()
    s.update(_game(1, "2024-10-10", 1, 2, goalie_shots=20))
    assert s.goalie_rating(10) == pytest.approx(100 * 1.0 / (20 + 800))
    s.update(_game(2, "2024-10-12", 1, 2, goalie_shots=30))
    lam = 0.5 ** (1 / 25)
    assert s.goalie_rating(10) == pytest.approx(100 * (lam + 1) / (20 * lam + 30 + 800))
    assert s.team_goalie(3) == 0.0  # no starters yet
    assert s.team_goalie(1) == pytest.approx(s.goalie_rating(10))


def test_components_sum_to_logit():
    p = predict({c: 0.3 for c in MODEL["features"]})
    z = MODEL["intercept"] + p["ability"] + p["chances"] + p["goalie"] + p["context"]
    assert p["home_win_prob"] == pytest.approx(1 / (1 + math.exp(-z)))


def test_predict_upcoming_back_to_back_between_upcoming_games():
    history = [_game(1, "2024-10-08", 1, 2), _game(2, "2024-10-08", 3, 4)]
    up = [
        {"game_id": 2024020010, "start_time_utc": "2024-10-10T23:00:00Z", "home_abbrev": "BOS", "away_abbrev": "BUF"},
        {"game_id": 2024020011, "start_time_utc": "2024-10-11T23:00:00Z", "home_abbrev": "BOS", "away_abbrev": "TOR"},
    ]
    rows = predict_upcoming(history, up, "2024-10-09T00:00:00Z")
    assert [r["game_id"] for r in rows] == [2024020010, 2024020011]
    assert rows[1]["context"] < 0  # BOS plays on consecutive nights, TOR rested


def test_wp_inputs_from_real_pbp():
    pbp = json.loads((FIXTURES / "pbp_2024020001.json").read_text())
    home, away = compute_wp_inputs(pbp)
    assert home["sog_f"] == away["sog_a"] and away["sog_f"] == home["sog_a"]
    assert 15 < home["sog_f"] < 60 and home["dz_giveaways"] >= 0
    assert (home["is_home"], away["is_home"]) == (1, 0) and home["opp_team_id"] == away["team_id"]
    assert (home["gf"], home["ga"], home["final_type"]) == (1, 4, "REG") and home["start_time_utc"] == "2024-10-04T17:00:00Z"


class _FakeD1:
    """Answers load_history's two queries with canned rows."""

    def __init__(self, wp, goalies):
        self.wp, self.goalies = wp, goalies

    def execute(self, sql, params=None):
        rows = self.wp if "team_game_wp_inputs" in sql else self.goalies
        lo, hi = params
        return {"result": [{"results": [r for r in rows if lo <= r["game_id"] <= hi]}]}


def test_load_history_builds_games_from_wp_inputs_and_xg_only():
    def team(t, opp, home, gf, ga, final="SO"):
        return {"game_id": 2024020001, "team_id": t, "opp_team_id": opp, "game_date": "2024-10-04", "start_time_utc": "2024-10-04T23:00:00Z",
                "is_home": home, "gf": gf, "ga": ga, "final_type": final, "sog_f": 30, "sog_a": 25, "dz_giveaways": 4,
                "xgf": 2.5, "xga": 2.0, "xgf_5v5": 1.5, "xga_5v5": 1.0}
    goalie = {"game_id": 2024020001, "player_id": 99, "opp_team_id": 2, "shots_against": 25, "goals_against": 2, "xga": 2.5}
    d1 = _FakeD1([team(1, 2, 1, 3, 2), team(2, 1, 0, 2, 3)], [goalie])
    [g] = load_history(d1, 2024)
    assert (g["home_id"], g["away_id"], g["final_type"], g["season"]) == (1, 2, "SO", 20242025)
    assert g["teams"][1]["gf"] == 3 and g["teams"][2]["sog_f"] == 30
    # opp_team_id 2 shot at the goalie, so he plays for team 1 (home)
    assert g["goalies"] == [{"player_id": 99, "team_id": 1, "shots": 25, "gsax": 0.5}]
