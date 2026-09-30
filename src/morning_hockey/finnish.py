"""Build playerId -> name/team indexes from NHL team roster data, for
looking up who scored/played in a game's raw goal or boxscore data."""
from __future__ import annotations

from .nhl_api import NHLClient

FINNISH_COUNTRY_CODE = "FIN"


def _roster_index(roster: dict, team_abbrev: str, finnish_only: bool) -> dict[int, dict]:
    index: dict[int, dict] = {}
    for group in ("forwards", "defensemen", "goalies"):
        for player in roster.get(group, []):
            if finnish_only and player.get("birthCountry") != FINNISH_COUNTRY_CODE:
                continue
            first = player["firstName"]["default"]
            last = player["lastName"]["default"]
            index[player["id"]] = {"name": f"{first} {last}", "team": team_abbrev}
    return index


def finnish_players_for_teams(client: NHLClient, team_abbrevs: set[str]) -> dict[int, dict]:
    """Map playerId -> {"name": full name, "team": abbrev} for Finnish players
    on the current rosters of the given teams."""
    index: dict[int, dict] = {}
    for abbrev in team_abbrevs:
        index.update(_roster_index(client.roster(abbrev), abbrev, finnish_only=True))
    return index


def team_players(client: NHLClient, team_abbrev: str) -> dict[int, dict]:
    """Map playerId -> {"name": full name, "team": abbrev} for every player
    on one team's current roster, regardless of nationality."""
    return _roster_index(client.roster(team_abbrev), team_abbrev, finnish_only=False)
