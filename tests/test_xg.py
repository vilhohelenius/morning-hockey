import json
import pathlib

import pandas as pd

from morning_hockey.xg.compute import compute_game, shot_probabilities

FIXTURES = pathlib.Path(__file__).parent / "fixtures"
PBP = json.loads((FIXTURES / "pbp_2024020001.json").read_text())


def test_matches_golden_per_shot():
    golden = pd.read_csv(FIXTURES / "golden_2024020001.csv")
    shots = shot_probabilities(PBP)
    merged = golden.merge(shots, on=["gameId", "eventId"], suffixes=("_g", ""))
    assert len(merged) == len(golden) == 90
    assert (merged["xg_skater"] - merged["xg_skater_g"]).abs().max() < 1e-4
    on_goal = merged[(merged["onGoal"] == 1) & (merged["emptyNet"] == 0)]
    assert (on_goal["xg_goalie"] - on_goal["xg_goalie_g"]).abs().max() < 1e-4


def test_compute_game_sums_match_golden():
    skaters, goalies = compute_game(PBP)
    assert abs(sum(r["xg"] for r in skaters) - 5.715) < 0.01
    assert sum(r["shots"] for r in skaters) == 90
    assert abs(sum(r["xga"] for r in goalies) - 3.786) < 0.01
    assert all(r["season"] == 20242025 for r in skaters + goalies)


def test_empty_net_shots_are_not_charged_to_a_goalie():
    shots = shot_probabilities(PBP)
    empty_net = int(((shots["onGoal"] == 1) & (shots["emptyNet"] == 1)).sum())
    _, goalies = compute_game(PBP)
    faced = int(((shots["onGoal"] == 1) & (shots["emptyNet"] == 0) & shots["goalieId"].notna()).sum())
    assert sum(r["shots_against"] for r in goalies) == faced
    assert empty_net == int(((shots["onGoal"] == 1) & (shots["emptyNet"] == 1)).sum())


def test_slot_shot_scores_far_higher_than_blue_line_shot():
    shots = shot_probabilities(PBP)
    slot = shots[(shots["dist"] < 15) & (shots["emptyNet"] == 0)]["xg_skater"].mean()
    point = shots[(shots["dist"] > 45) & (shots["emptyNet"] == 0)]["xg_skater"].mean()
    assert slot > 3 * point
