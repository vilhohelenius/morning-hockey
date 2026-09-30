"""Compact per-team snapshots for the standings page's clickable info panel:
last 5 results, in-team scoring leaders, presumed #1 goalie, and the next
game. Skater/goalie season stats are fetched once for the whole league and
grouped by team, rather than once per team, since the stats REST API can
already return every player in one call; only the schedule (for the last-5
results and next game) is fetched per team, since there's no single
"upcoming game" endpoint across all clubs.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from .nhl_api import NHLClient
from .suomiporssi import HEADSHOT_URL, current_team
from .team import ScheduleGame, split_schedule

_RECENT = 5
_TOP_SCORERS = 3

_SKATER_SORT = (
    '[{"property":"points","direction":"DESC"},'
    '{"property":"goals","direction":"DESC"}]'
)
_GOALIE_SORT = (
    '[{"property":"gamesPlayed","direction":"DESC"},'
    '{"property":"savePct","direction":"DESC"}]'
)

# A brief pause between the 32 back-to-back club-schedule-season requests
# (one per team), so this burst is less likely to trip the public API's
# rate limiting in the first place. NHLClient itself retries with backoff
# if a request gets rate-limited anyway.
_SCHEDULE_REQUEST_PAUSE = 0.2


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


def _team_snapshot(
    client: NHLClient,
    abbrev: str,
    skater_rows: list[dict],
    goalie_rows: list[dict],
    season_id: int,
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

    schedule = client.club_schedule_season(abbrev)
    recent_games, upcoming_games = split_schedule(abbrev, schedule["games"])
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

    snapshots = {}
    for i, abbrev in enumerate(team_abbrevs):
        if i > 0:
            time.sleep(_SCHEDULE_REQUEST_PAUSE)
        snapshots[abbrev] = _team_snapshot(
            client, abbrev, skaters_by_team.get(abbrev, []), goalies_by_team.get(abbrev, []), season_id
        )
    return snapshots
