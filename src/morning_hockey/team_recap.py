"""Last night's game recap for a single team, for a standalone ntfy notification.

Reuses digest.py's goal/boxscore parsing helpers, just keyed by a team's own
roster instead of a nationality filter.
"""
from __future__ import annotations

from dataclasses import dataclass

from .digest import FINISHED_STATES, final_type, goalie_lines, scorer_lines, team_info
from .finnish import team_players
from .models import GoalieLine, ScorerLine, TeamInfo
from .nhl_api import NHLClient


@dataclass(frozen=True)
class TeamRecap:
    team: TeamInfo
    opponent: TeamInfo
    is_home: bool
    final_type: str
    scorers: list[ScorerLine]
    goalies: list[GoalieLine]


def build_team_recap(client: NHLClient, team_abbrev: str) -> TeamRecap | None:
    """None if the team didn't play a completed game in the current slate."""
    scoreboard = client.scoreboard("now")
    game = next(
        (
            g
            for g in scoreboard.get("games", [])
            if g.get("gameState") in FINISHED_STATES
            and team_abbrev in (g["awayTeam"]["abbrev"], g["homeTeam"]["abbrev"])
        ),
        None,
    )
    if game is None:
        return None

    player_index = team_players(client, team_abbrev)
    scorers = scorer_lines(game, player_index)

    boxscore = client.boxscore(game["id"])
    goalies = goalie_lines(boxscore, player_index)

    is_home = game["homeTeam"]["abbrev"] == team_abbrev
    team = team_info(game["homeTeam"] if is_home else game["awayTeam"])
    opponent = team_info(game["awayTeam"] if is_home else game["homeTeam"])

    return TeamRecap(
        team=team,
        opponent=opponent,
        is_home=is_home,
        final_type=final_type(game),
        scorers=scorers,
        goalies=goalies,
    )
