"""Per-game skater xG and goalie xGA from one play-by-play JSON.

features.py is a verbatim copy of xGoalBoost's nhl_pbp/features.py (training
and inference must run identical feature extraction); do not edit it here --
change it there, retrain, and re-copy it together with models/.
"""
from __future__ import annotations

import json
import pathlib
from functools import lru_cache

import pandas as pd
import xgboost as xgb

from .features import CATEGORICAL, FEATURES, game_shots

_MODELS = pathlib.Path(__file__).parent / "models"


@lru_cache(maxsize=1)
def _load() -> tuple[xgb.Booster, xgb.Booster, dict]:
    # Booster instead of XGBClassifier: same binary:logistic probabilities,
    # without pulling in scikit-learn just for the wrapper.
    skater, goalie = xgb.Booster(), xgb.Booster()
    skater.load_model(str(_MODELS / "model_skater.json"))
    goalie.load_model(str(_MODELS / "model_goalie.json"))
    meta = json.loads((_MODELS / "model_meta.json").read_text())
    return skater, goalie, meta["categories"]


def shot_probabilities(play_by_play: dict) -> pd.DataFrame:
    """One row per shot attempt (features.game_shots) plus xg_skater/xg_goalie.
    xg_goalie is only meaningful for onGoal == 1 and emptyNet == 0."""
    rows = pd.DataFrame(game_shots(play_by_play))
    if rows.empty:
        return rows
    skater, goalie, categories = _load()
    X = rows[FEATURES].copy()
    for column in CATEGORICAL:  # unseen category -> NaN, which XGBoost handles
        X[column] = pd.Categorical(X[column], categories=categories[column])
    matrix = xgb.DMatrix(X, enable_categorical=True)
    rows["xg_skater"] = skater.predict(matrix)
    rows["xg_goalie"] = goalie.predict(matrix)
    return rows


def compute_team_game(play_by_play: dict) -> list[dict]:
    """Two rows (home, away) shaped like team_game_xg: xgf is the xG of the
    team's own shot attempts, xga the opponent's. The 5v5 columns count only
    shots with five skaters on each side and no empty net."""
    shots = shot_probabilities(play_by_play)
    if shots.empty:
        return []
    even = shots[(shots["shooterSkaters"] == 5) & (shots["defenderSkaters"] == 5) & (shots["emptyNet"] == 0)]
    teams = [play_by_play["homeTeam"]["id"], play_by_play["awayTeam"]["id"]]
    xgf = {t: float(shots.loc[shots["teamId"] == t, "xg_skater"].sum()) for t in teams}
    xgf_5v5 = {t: float(even.loc[even["teamId"] == t, "xg_skater"].sum()) for t in teams}
    return [
        {
            "game_id": int(play_by_play["id"]), "team_id": int(t), "season": int(play_by_play["season"]),
            "game_date": play_by_play["gameDate"],
            "xgf": xgf[t], "xga": xgf[other], "xgf_5v5": xgf_5v5[t], "xga_5v5": xgf_5v5[other],
        }
        for t, other in ((teams[0], teams[1]), (teams[1], teams[0]))
    ]


def compute_game(play_by_play: dict) -> tuple[list[dict], list[dict]]:
    """(skater_rows, goalie_rows) for one finished game, shaped like the
    skater_game_xg / goalie_game_xg D1 tables."""
    shots = shot_probabilities(play_by_play)
    if shots.empty:
        return [], []

    skaters = (
        shots.dropna(subset=["shooterId"])
        .groupby(["gameId", "shooterId"])
        .agg(
            team_id=("teamId", "first"), season=("season", "first"), game_date=("date", "first"),
            shots=("eventId", "count"), on_goal=("onGoal", "sum"), goals=("goal", "sum"), xg=("xg_skater", "sum"),
        )
        .reset_index()
    )
    skater_rows = [
        {
            "game_id": int(r.gameId), "player_id": int(r.shooterId), "team_id": int(r.team_id),
            "season": int(r.season), "game_date": r.game_date,
            "shots": int(r.shots), "on_goal": int(r.on_goal), "goals": int(r.goals), "xg": float(r.xg),
        }
        for r in skaters.itertuples()
    ]

    faced = shots[(shots["onGoal"] == 1) & (shots["emptyNet"] == 0) & shots["goalieId"].notna()]
    goalies = (
        faced.groupby(["gameId", "goalieId"])
        .agg(
            opp_team_id=("teamId", "first"), season=("season", "first"), game_date=("date", "first"),
            shots_against=("eventId", "count"), goals_against=("goal", "sum"), xga=("xg_goalie", "sum"),
        )
        .reset_index()
    )
    goalie_rows = [
        {
            "game_id": int(r.gameId), "player_id": int(r.goalieId), "opp_team_id": int(r.opp_team_id),
            "season": int(r.season), "game_date": r.game_date,
            "shots_against": int(r.shots_against), "goals_against": int(r.goals_against), "xga": float(r.xga),
        }
        for r in goalies.itertuples()
    ]
    return skater_rows, goalie_rows
