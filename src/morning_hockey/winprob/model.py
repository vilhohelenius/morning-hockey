"""Pre-game home win probability: logistic regression on exponentially weighted
team form + goalie ratings. Mirrors xGoalBoost/winprob/train_wp.py (team_state
loop); the model's goalie feature is always the team's recent-starter average.

A "game" dict (chronological, finished regular season) has: game_id, season,
date (YYYY-MM-DD, NHL gameDate), home_id, away_id, final_type (REG/OT/SO),
teams {team_id: {gf, ga, xgf, xga, xgf5, xga5, sog_f, sog_a, dz}} and
goalies [{player_id, team_id, shots, gsax}].
"""
from __future__ import annotations

import json
import math
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

MODEL = json.loads(Path(__file__).with_name("model_wp.json").read_text())
_P = MODEL["params"]
METRICS = ["win", "gd", "xgd", "xgd5", "sogd", "dz"]


class WinProbState:
    def __init__(self, params: dict = _P):
        self.p = params
        self.init = params["init"]
        self.team = defaultdict(lambda: {h: dict(self.init) for h in self.p["half_lives"]})
        self.last_date: dict[int, date] = {}
        self.last_season: dict[int, int] = {}
        self.goalie = defaultdict(lambda: [0.0, 0.0])  # [decayed GSAx, decayed shots]
        self.starters = defaultdict(lambda: deque(maxlen=20))
        self.lam = 0.5 ** (1 / self.p["goalie_half_life"])

    def _rollover(self, team_id: int, season: int) -> None:
        if self.last_season.get(team_id) not in (None, season):
            keep = self.p["offseason_keep"]
            for state in self.team[team_id].values():
                for m in METRICS:
                    state[m] = keep * state[m] + (1 - keep) * self.init[m]
        self.last_season[team_id] = season

    def goalie_rating(self, player_id: int) -> float:
        g, s = self.goalie[player_id]
        return 100 * g / (s + self.p["goalie_prior_shots"])

    def team_goalie(self, team_id: int) -> float:
        ratings = [self.goalie_rating(x) for x in self.starters[team_id]]
        return sum(ratings) / len(ratings) if ratings else 0.0

    def features(self, home: int, away: int, season: int, day: date, last_date: dict | None = None) -> dict:
        """Model features home-minus-away; rolls the season over first, like training.
        last_date overrides the last-played dates (for several upcoming games of one team)."""
        for t in (home, away):
            self._rollover(t, season)
        last = self.last_date if last_date is None else last_date
        f = {f"{m}_{h}": self.team[home][h][m] - self.team[away][h][m] for h in self.p["half_lives"] for m in METRICS}
        b2b = {t: int(t in last and (day - last[t]).days <= 1) for t in (home, away)}
        f["gS"] = self.team_goalie(home) - self.team_goalie(away)
        f["b2b_diff"] = b2b[home] - b2b[away]
        return f

    def update(self, g: dict) -> None:
        """Feed one finished game (call features() for it first, as training does)."""
        day = date.fromisoformat(g["date"])
        for t in (g["home_id"], g["away_id"]):
            self._rollover(t, g["season"])
            r = g["teams"][t]
            m = {
                "win": 0.5 if g["final_type"] != "REG" else float(r["gf"] > r["ga"]),
                "gd": r["gf"] - r["ga"], "xgd": r["xgf"] - r["xga"], "xgd5": r["xgf5"] - r["xga5"],
                "sogd": r["sog_f"] - r["sog_a"], "dz": r["dz"],
            }
            for h in self.p["half_lives"]:
                a = 1 - 0.5 ** (1 / h)
                for k in METRICS:
                    self.team[t][h][k] += a * (m[k] - self.team[t][h][k])
            self.last_date[t] = day
        by_team = defaultdict(list)
        for x in g["goalies"]:
            by_team[x["team_id"]].append(x)
        for t, gs in by_team.items():
            self.starters[t].append(max(gs, key=lambda x: x["shots"])["player_id"])
        for x in g["goalies"]:
            st = self.goalie[x["player_id"]]
            st[0] = st[0] * self.lam + x["gsax"]
            st[1] = st[1] * self.lam + x["shots"]


def predict(features: dict) -> dict:
    """home_win_prob plus the logit contributions per component (intercept = home advantage)."""
    parts = {k: sum(MODEL["coef"][c] * features[c] for c in cols) for k, cols in MODEL["groups"].items()}
    z = MODEL["intercept"] + sum(parts.values())
    return {"home_win_prob": 1 / (1 + math.exp(-z)), **parts}
