"""Season-long Finnish skater points leaderboard, from the NHL stats REST API."""
from __future__ import annotations

from dataclasses import dataclass

from .nhl_api import NHLClient

TEAM_LOGO_URL = "https://assets.nhle.com/logos/nhl/svg/{abbrev}_light.svg"
HEADSHOT_URL = "https://assets.nhle.com/mugs/nhl/{season}/{abbrev}/{player_id}.png"

_SORT = (
    '[{"property":"points","direction":"DESC"},'
    '{"property":"goals","direction":"DESC"},'
    '{"property":"skaterFullName","direction":"ASC"}]'
)


@dataclass(frozen=True)
class LeaderboardRow:
    player_id: int
    name: str
    team: str
    logo: str
    headshot: str
    position: str
    games_played: int
    goals: int
    assists: int
    points: int


def current_season_id(client: NHLClient) -> int:
    standings = client.standings()
    return standings["standings"][0]["seasonId"]


def current_team(team_abbrevs: str) -> str:
    """A traded player's teamAbbrevs is a comma list in chronological order;
    the last entry is where they currently play."""
    return team_abbrevs.split(",")[-1].strip()


def build_leaderboard(client: NHLClient, season_id: int) -> list[LeaderboardRow]:
    cayenne_exp = f'nationalityCode="FIN" and seasonId={season_id} and gameTypeId=2'
    rows = client.skater_summary(cayenne_exp, _SORT)

    leaderboard = []
    for row in rows:
        team = current_team(row["teamAbbrevs"])
        leaderboard.append(
            LeaderboardRow(
                player_id=row["playerId"],
                name=row["skaterFullName"],
                team=team,
                logo=TEAM_LOGO_URL.format(abbrev=team),
                headshot=HEADSHOT_URL.format(season=season_id, abbrev=team, player_id=row["playerId"]),
                position=row["positionCode"],
                games_played=row["gamesPlayed"],
                goals=row["goals"],
                assists=row["assists"],
                points=row["points"],
            )
        )
    return leaderboard
