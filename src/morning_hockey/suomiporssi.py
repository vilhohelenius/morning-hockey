"""Season-long Finnish skater and goalie leaderboards ("Suomipörssi"), from
the NHL stats REST API."""
from __future__ import annotations

from dataclasses import dataclass

from .nhl_api import NHLClient

TEAM_LOGO_URL = "https://assets.nhle.com/logos/nhl/svg/{abbrev}_light.svg"
HEADSHOT_URL = "https://assets.nhle.com/mugs/nhl/{season}/{abbrev}/{player_id}.png"

_SKATER_SORT = (
    '[{"property":"points","direction":"DESC"},'
    '{"property":"goals","direction":"DESC"},'
    '{"property":"skaterFullName","direction":"ASC"}]'
)
_GOALIE_SORT = (
    '[{"property":"savePct","direction":"DESC"},'
    '{"property":"wins","direction":"DESC"},'
    '{"property":"goalieFullName","direction":"ASC"}]'
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
    penalty_minutes: int = 0


@dataclass(frozen=True)
class GoalieLeaderboardRow:
    player_id: int
    name: str
    team: str
    logo: str
    headshot: str
    games_played: int
    wins: int
    losses: int
    ot_losses: int
    goals_against_average: float
    save_pct: float
    shutouts: int


def current_season_id(client: NHLClient) -> int:
    standings = client.standings()
    return standings["standings"][0]["seasonId"]


def current_team(team_abbrevs: str) -> str:
    """A traded player's teamAbbrevs is a comma list in chronological order;
    the last entry is where they currently play."""
    return team_abbrevs.split(",")[-1].strip()


def build_leaderboard(client: NHLClient, season_id: int) -> list[LeaderboardRow]:
    cayenne_exp = f'nationalityCode="FIN" and seasonId={season_id} and gameTypeId=2'
    rows = client.skater_summary(cayenne_exp, _SKATER_SORT)

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
                penalty_minutes=row.get("penaltyMinutes") or 0,
            )
        )
    return leaderboard


def build_goalie_leaderboard(client: NHLClient, season_id: int) -> list[GoalieLeaderboardRow]:
    """Finnish goalies aren't a nationalityCode field on goalie/summary, so the
    Finnish subset comes from goalie/bios and is then enriched with GAA/SV%
    from goalie/summary (which has no nationalityCode of its own)."""
    cayenne_exp = f'nationalityCode="FIN" and seasonId={season_id} and gameTypeId=2'
    bios_sort = '[{"property":"goalieFullName","direction":"ASC"}]'
    bios_rows = client.goalie_bios(cayenne_exp, bios_sort, limit=-1)
    if not bios_rows:
        return []

    summary_rows = client.goalie_summary(
        f"seasonId={season_id} and gameTypeId=2", _GOALIE_SORT, limit=-1
    )
    summary_by_id = {row["playerId"]: row for row in summary_rows}

    goalies = []
    for bio in bios_rows:
        stats = summary_by_id.get(bio["playerId"], {})
        team = bio["currentTeamAbbrev"]
        goalies.append(
            GoalieLeaderboardRow(
                player_id=bio["playerId"],
                name=bio["goalieFullName"],
                team=team,
                logo=TEAM_LOGO_URL.format(abbrev=team),
                headshot=HEADSHOT_URL.format(season=season_id, abbrev=team, player_id=bio["playerId"]),
                games_played=stats.get("gamesPlayed", bio.get("gamesPlayed", 0)),
                wins=stats.get("wins", bio.get("wins", 0)),
                losses=stats.get("losses", bio.get("losses", 0)),
                ot_losses=stats.get("otLosses", bio.get("otLosses", 0)),
                goals_against_average=stats.get("goalsAgainstAverage", 0.0),
                save_pct=stats.get("savePct", 0.0),
                shutouts=stats.get("shutouts", bio.get("shutouts", 0)),
            )
        )
    goalies.sort(key=lambda g: -g.save_pct)
    return goalies
