"""A full per-game report for one of a team's own past games: the same goal
timeline and team-stat comparison boxscore.py already builds for the
homepage's box score panel, plus a full per-player stat line for every
skater and goalie on both teams (from the /boxscore endpoint, which
boxscore.py doesn't otherwise need).
"""
from __future__ import annotations

from dataclasses import dataclass

import requests

from .boxscore import build_goal_events, build_team_stats
from .models import GoalEvent, TeamInfo, TeamStatRow
from .nhl_api import NHLClient
from .team import ScheduleGame

_NO_TOI = ("0:00", "00:00")


@dataclass(frozen=True)
class PlayerGameStat:
    player_id: int
    name: str
    position: str
    goals: int
    assists: int
    points: int
    plus_minus: int
    shots: int
    pim: int
    toi: str


@dataclass(frozen=True)
class GoalieGameStat:
    player_id: int
    name: str
    decision: str | None
    saves: int
    shots_against: int
    save_pct: float
    toi: str


@dataclass(frozen=True)
class GameReportPage:
    game_id: int
    date: str
    away: TeamInfo
    home: TeamInfo
    final_type: str
    goals: list[GoalEvent]
    team_stats: list[TeamStatRow]
    away_skaters: list[PlayerGameStat]
    home_skaters: list[PlayerGameStat]
    away_goalies: list[GoalieGameStat]
    home_goalies: list[GoalieGameStat]


def _player_name(row: dict) -> str:
    return row["name"]["default"]


def _skater_stat(row: dict) -> PlayerGameStat:
    return PlayerGameStat(
        player_id=row["playerId"],
        name=_player_name(row),
        position=row["position"],
        goals=row.get("goals", 0),
        assists=row.get("assists", 0),
        points=row.get("points", 0),
        plus_minus=row.get("plusMinus", 0),
        shots=row.get("sog", 0),
        pim=row.get("pim", 0),
        toi=row.get("toi", "0:00"),
    )


def _goalie_stat(row: dict) -> GoalieGameStat:
    return GoalieGameStat(
        player_id=row["playerId"],
        name=_player_name(row),
        decision=row.get("decision"),
        saves=row.get("saves", 0),
        shots_against=row.get("shotsAgainst", 0),
        save_pct=row.get("savePctg", 0.0),
        toi=row.get("toi", "0:00"),
    )


def _team_player_stats(side: dict) -> tuple[list[PlayerGameStat], list[GoalieGameStat]]:
    skaters = [_skater_stat(row) for row in side.get("forwards", []) + side.get("defense", [])]
    skaters.sort(key=lambda s: (-s.points, -s.goals))
    goalies = [_goalie_stat(row) for row in side.get("goalies", []) if row.get("toi", "0:00") not in _NO_TOI]
    return skaters, goalies


def build_game_report(
    client: NHLClient, game: ScheduleGame, team_abbrev: str, team_name: str, team_logo: str
) -> GameReportPage:
    if game.is_home:
        home = TeamInfo(abbrev=team_abbrev, name=team_name, logo=team_logo, score=game.team_score)
        away = TeamInfo(
            abbrev=game.opponent_abbrev, name=game.opponent_name, logo=game.opponent_logo, score=game.opponent_score
        )
    else:
        away = TeamInfo(abbrev=team_abbrev, name=team_name, logo=team_logo, score=game.team_score)
        home = TeamInfo(
            abbrev=game.opponent_abbrev, name=game.opponent_name, logo=game.opponent_logo, score=game.opponent_score
        )

    landing = client.landing(game.game_id)
    right_rail = client.right_rail(game.game_id)
    boxscore = client.boxscore(game.game_id)

    goals = build_goal_events(landing.get("summary", {}).get("scoring", []), away.abbrev, home.abbrev)
    team_stats = build_team_stats(right_rail.get("teamGameStats", []), away.score, home.score)

    player_stats = boxscore.get("playerByGameStats", {})
    away_skaters, away_goalies = _team_player_stats(player_stats.get("awayTeam", {}))
    home_skaters, home_goalies = _team_player_stats(player_stats.get("homeTeam", {}))

    return GameReportPage(
        game_id=game.game_id,
        date=game.date,
        away=away,
        home=home,
        final_type=game.final_type,
        goals=goals,
        team_stats=team_stats,
        away_skaters=away_skaters,
        home_skaters=home_skaters,
        away_goalies=away_goalies,
        home_goalies=home_goalies,
    )


def build_game_reports(
    client: NHLClient, games: list[ScheduleGame], team_abbrev: str, team_name: str, team_logo: str
) -> list[GameReportPage]:
    """One report per game, skipping (rather than failing the whole build)
    any single game whose detailed data couldn't be fetched or parsed."""
    reports = []
    for game in games:
        try:
            reports.append(build_game_report(client, game, team_abbrev, team_name, team_logo))
        except (requests.exceptions.RequestException, KeyError, TypeError) as error:
            print(f"  huom: ottelun {game.game_id} raporttia ei saatu ({error}).")
    return reports
