"""Identify Finnish players from NHL team roster data."""
from __future__ import annotations

from .nhl_api import NHLClient

FINNISH_COUNTRY_CODE = "FIN"


def finnish_players_for_teams(client: NHLClient, team_abbrevs: set[str]) -> dict[int, dict]:
    """Map playerId -> {"name": full name, "team": abbrev} for Finnish players
    on the current rosters of the given teams."""
    index: dict[int, dict] = {}
    for abbrev in team_abbrevs:
        roster = client.roster(abbrev)
        for group in ("forwards", "defensemen", "goalies"):
            for player in roster.get(group, []):
                if player.get("birthCountry") != FINNISH_COUNTRY_CODE:
                    continue
                first = player["firstName"]["default"]
                last = player["lastName"]["default"]
                index[player["id"]] = {"name": f"{first} {last}", "team": abbrev}
    return index
