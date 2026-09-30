"""Full upcoming schedule for the next 7 days. Unlike primetime.py, every
scheduled game is included -- no time-of-day filtering.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from .digest import FINISHED_STATES
from .models import TeamInfo
from .nhl_api import NHLClient
from .team import team_display_name

HELSINKI = ZoneInfo("Europe/Helsinki")


@dataclass(frozen=True)
class ScheduleGame:
    game_id: int
    away: TeamInfo
    home: TeamInfo
    start_local: dt.datetime  # Europe/Helsinki, tz-aware
    game_state: str
    is_finished: bool


@dataclass(frozen=True)
class ScheduleDay:
    date: str
    games: list[ScheduleGame]


@dataclass(frozen=True)
class SchedulePage:
    as_of_date: str
    days: list[ScheduleDay]


def _team_info(payload: dict) -> TeamInfo:
    return TeamInfo(
        abbrev=payload["abbrev"],
        name=team_display_name(payload),
        logo=payload["logo"],
        score=payload.get("score", 0),
    )


def build_schedule(client: NHLClient, date: str = "now") -> SchedulePage:
    schedule = client.schedule(date)
    game_week = schedule.get("gameWeek", [])
    as_of_date = game_week[0]["date"] if game_week else date

    days = []
    for day in game_week:
        games = []
        for game in day.get("games", []):
            start_utc = dt.datetime.fromisoformat(game["startTimeUTC"].replace("Z", "+00:00"))
            game_state = game.get("gameState", "")
            games.append(
                ScheduleGame(
                    game_id=game["id"],
                    away=_team_info(game["awayTeam"]),
                    home=_team_info(game["homeTeam"]),
                    start_local=start_utc.astimezone(HELSINKI),
                    game_state=game_state,
                    is_finished=game_state in FINISHED_STATES,
                )
            )
        games.sort(key=lambda g: g.start_local)
        days.append(ScheduleDay(date=day["date"], games=games))

    return SchedulePage(as_of_date=as_of_date, days=days)
