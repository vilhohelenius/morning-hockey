"""Build playerId -> name/team indexes from NHL team roster data, for
looking up who scored/played in a game's raw goal or boxscore data."""
from __future__ import annotations

import requests

from .nhl_api import NHLClient
from .suomiporssi import current_season_id

FINNISH_COUNTRY_CODE = "FIN"


def _nationality_by_id(client: NHLClient) -> dict[int, str]:
    """playerId -> nationalityCode from the stats REST bios reports, the same
    source Suomipörssi/NHL.com use (sporting nationality, e.g. FIN for US-born
    Samuel Helenius). Best-effort: on failure returns {} so callers fall back
    to the roster's birthCountry. Cached per-client by NHLClient."""
    try:
        cayenne_exp = f"seasonId={current_season_id(client)} and gameTypeId=2"
        sort = '[{"property":"playerId","direction":"ASC"}]'
        rows = client.skater_bios(cayenne_exp, sort, limit=-1) + client.goalie_bios(cayenne_exp, sort, limit=-1)
    except (requests.exceptions.RequestException, KeyError, IndexError, TypeError):
        return {}
    return {row["playerId"]: row["nationalityCode"] for row in rows if row.get("nationalityCode")}


def _roster_index(
    roster: dict, team_abbrev: str, finnish_only: bool, nationality_by_id: dict[int, str] | None = None
) -> dict[int, dict]:
    nationality_by_id = nationality_by_id or {}
    index: dict[int, dict] = {}
    for group in ("forwards", "defensemen", "goalies"):
        for player in roster.get(group, []):
            # Players without games this season aren't in the bios report;
            # fall back to birthCountry for them.
            nationality = nationality_by_id.get(player["id"]) or player.get("birthCountry")
            if finnish_only and nationality != FINNISH_COUNTRY_CODE:
                continue
            first = player["firstName"]["default"]
            last = player["lastName"]["default"]
            index[player["id"]] = {"name": f"{first} {last}", "team": team_abbrev}
    return index


def finnish_players_for_teams(client: NHLClient, team_abbrevs: set[str]) -> dict[int, dict]:
    """Map playerId -> {"name": full name, "team": abbrev} for Finnish players
    on the current rosters of the given teams."""
    index: dict[int, dict] = {}
    nationality_by_id = _nationality_by_id(client)
    for abbrev in team_abbrevs:
        index.update(_roster_index(client.roster(abbrev), abbrev, finnish_only=True, nationality_by_id=nationality_by_id))
    return index


def team_players(client: NHLClient, team_abbrev: str) -> dict[int, dict]:
    """Map playerId -> {"name": full name, "team": abbrev} for every player
    on one team's current roster, regardless of nationality."""
    return _roster_index(client.roster(team_abbrev), team_abbrev, finnish_only=False)
