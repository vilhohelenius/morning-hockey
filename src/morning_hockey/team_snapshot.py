"""Compact per-team snapshots for the standings page's clickable info panel:
last 5 results, in-team scoring leaders, presumed #1 goalie, and the next
game.

Skater/goalie season stats and the schedule are each fetched a small,
fixed number of times for the whole league and then grouped/filtered by
team locally, rather than once per team (a 32-request burst that reliably
tripped the public NHL API's rate limiting): skater/goalie stats already
support a single unfiltered query, and the last-5-results/next-game data
turns out to need only a handful of weeks of the league-wide schedule
(teams play often enough that 5 played games and the next game are always
within a ~4-week window around "now"), fetched by walking the weekly
schedule endpoint's previousStartDate/nextStartDate a few steps.
"""
from __future__ import annotations

from dataclasses import dataclass

from .nhl_api import NHLClient
from .suomiporssi import HEADSHOT_URL, current_team
from .team import ScheduleGame, split_schedule

_RECENT = 5
_TOP_SCORERS = 3
_WEEKS_BACK = 2
_WEEKS_FORWARD = 1

_SKATER_SORT = (
    '[{"property":"points","direction":"DESC"},'
    '{"property":"goals","direction":"DESC"}]'
)
_GOALIE_SORT = (
    '[{"property":"gamesPlayed","direction":"DESC"},'
    '{"property":"savePct","direction":"DESC"}]'
)


@dataclass(frozen=True)
class RecentResult:
    result: str  # "W" | "L" | "OTL"
    opponent_abbrev: str


@dataclass(frozen=True)
class TopScorer:
    name: str
    headshot: str
    goals: int
    assists: int
    points: int


@dataclass(frozen=True)
class SnapshotGoalie:
    name: str
    headshot: str
    games_played: int
    save_pct: float


@dataclass(frozen=True)
class TeamSnapshot:
    abbrev: str
    recent_results: list[RecentResult]
    top_scorers: list[TopScorer]
    starting_goalie: SnapshotGoalie | None
    next_game: ScheduleGame | None


def _skaters_by_team(client: NHLClient, season_id: int) -> dict[str, list[dict]]:
    cayenne_exp = f"seasonId={season_id} and gameTypeId=2"
    by_team: dict[str, list[dict]] = {}
    for row in client.skater_bios(cayenne_exp, _SKATER_SORT, limit=-1):
        by_team.setdefault(row["currentTeamAbbrev"], []).append(row)
    return by_team


def _goalies_by_team(client: NHLClient, season_id: int) -> dict[str, list[dict]]:
    cayenne_exp = f"seasonId={season_id} and gameTypeId=2"
    by_team: dict[str, list[dict]] = {}
    for row in client.goalie_summary(cayenne_exp, _GOALIE_SORT, limit=-1):
        team = current_team(row["teamAbbrevs"])
        by_team.setdefault(team, []).append(row)
    return by_team


def _nearby_weeks_of_games(client: NHLClient) -> list[dict]:
    """A few weeks of the league-wide schedule around "now" (2 back, 1
    forward by default), merged and deduplicated by game id, sorted
    chronologically so split_schedule's ordering assumption holds."""
    games_by_id: dict[int, dict] = {}

    def _collect(payload: dict) -> None:
        for day in payload.get("gameWeek", []):
            for game in day.get("games", []):
                games_by_id[game["id"]] = game

    current = client.schedule("now")
    _collect(current)

    cursor = current.get("previousStartDate")
    for _ in range(_WEEKS_BACK):
        if not cursor:
            break
        payload = client.schedule(cursor)
        _collect(payload)
        cursor = payload.get("previousStartDate")

    cursor = current.get("nextStartDate")
    for _ in range(_WEEKS_FORWARD):
        if not cursor:
            break
        payload = client.schedule(cursor)
        _collect(payload)
        cursor = payload.get("nextStartDate")

    return sorted(games_by_id.values(), key=lambda g: (g["gameDate"], g["id"]))


def _team_snapshot(
    abbrev: str,
    skater_rows: list[dict],
    goalie_rows: list[dict],
    season_id: int,
    games: list[dict],
) -> TeamSnapshot:
    top_scorers = [
        TopScorer(
            name=row["skaterFullName"],
            headshot=HEADSHOT_URL.format(season=season_id, abbrev=abbrev, player_id=row["playerId"]),
            goals=row["goals"],
            assists=row["assists"],
            points=row["points"],
        )
        for row in skater_rows[:_TOP_SCORERS]
    ]

    starting_goalie = None
    if goalie_rows:
        top = goalie_rows[0]
        starting_goalie = SnapshotGoalie(
            name=top["goalieFullName"],
            headshot=HEADSHOT_URL.format(season=season_id, abbrev=abbrev, player_id=top["playerId"]),
            games_played=top["gamesPlayed"],
            save_pct=top["savePct"],
        )

    recent_games, upcoming_games = split_schedule(abbrev, games)
    recent_results = [
        RecentResult(result=g.result, opponent_abbrev=g.opponent_abbrev) for g in recent_games[:_RECENT]
    ]
    next_game = upcoming_games[0] if upcoming_games else None

    return TeamSnapshot(
        abbrev=abbrev,
        recent_results=recent_results,
        top_scorers=top_scorers,
        starting_goalie=starting_goalie,
        next_game=next_game,
    )


def build_team_snapshots(
    client: NHLClient, team_abbrevs: list[str], season_id: int
) -> dict[str, TeamSnapshot]:
    skaters_by_team = _skaters_by_team(client, season_id)
    goalies_by_team = _goalies_by_team(client, season_id)
    games = _nearby_weeks_of_games(client)

    return {
        abbrev: _team_snapshot(
            abbrev, skaters_by_team.get(abbrev, []), goalies_by_team.get(abbrev, []), season_id, games
        )
        for abbrev in team_abbrevs
    }
