"""Per-team win-probability inputs the xG tables lack, from one play-by-play JSON.

Same definitions as xGoalBoost/winprob/build_games.py: sog = shots on goal
(goals included, shootout excluded, as features.game_shots yields them) and
dz = giveaways the team made in its own defensive zone. Goals are the pbp team
scores (shootout winner's goal included) and final_type the gameOutcome
lastPeriodType, both as the training data used them -- so the win-probability
walk needs nothing from the games table for finished games.
"""
from __future__ import annotations

from collections import Counter

from ..xg.features import game_shots


def compute_wp_inputs(play_by_play: dict) -> list[dict]:
    """Two rows (home, away) shaped like team_game_wp_inputs."""
    sog = Counter()
    for shot in game_shots(play_by_play):
        sog[shot["teamId"]] += shot["onGoal"]
    dz = Counter(
        p["details"]["eventOwnerTeamId"]
        for p in play_by_play["plays"]
        if p["typeDescKey"] == "giveaway" and p.get("details", {}).get("zoneCode") == "D"
    )
    teams = [play_by_play["homeTeam"]["id"], play_by_play["awayTeam"]["id"]]
    score = {t: play_by_play[side]["score"] for t, side in ((teams[0], "homeTeam"), (teams[1], "awayTeam"))}
    final_type = play_by_play.get("gameOutcome", {}).get("lastPeriodType", "REG")
    return [
        {
            "game_id": int(play_by_play["id"]), "team_id": int(t), "season": int(play_by_play["season"]),
            "game_date": play_by_play["gameDate"], "start_time_utc": play_by_play["startTimeUTC"],
            "opp_team_id": int(other), "is_home": int(t == teams[0]),
            "gf": int(score[t]), "ga": int(score[other]), "final_type": final_type,
            "sog_f": int(sog[t]), "sog_a": int(sog[other]), "dz_giveaways": int(dz[t]),
        }
        for t, other in ((teams[0], teams[1]), (teams[1], teams[0]))
    ]
