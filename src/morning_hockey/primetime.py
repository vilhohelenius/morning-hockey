"""Upcoming NHL games, filtered to the ones a Finnish fan could watch live:
those starting between 18:00 and 24:00 Europe/Helsinki local time, across
the next week's schedule.
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

_WINDOW_START_HOUR = 18  # 18:00 Finnish time
_WINDOW_END_HOUR = 24  # up to (not including) midnight


@dataclass(frozen=True)
class PrimeTimeGame:
    game_id: int
    away: TeamInfo
    home: TeamInfo
    start_local: dt.datetime  # Europe/Helsinki, tz-aware
    game_state: str
    is_finished: bool


@dataclass(frozen=True)
class PrimeTimePage:
    as_of_date: str
    games: list[PrimeTimeGame]


def starts_in_window(local_start: dt.datetime) -> bool:
    return _WINDOW_START_HOUR <= local_start.hour < _WINDOW_END_HOUR


def _team_info(payload: dict) -> TeamInfo:
    return TeamInfo(
        abbrev=payload["abbrev"],
        name=team_display_name(payload),
        logo=payload["logo"],
        score=payload.get("score", 0),
    )


def build_primetime(client: NHLClient, date: str = "now") -> PrimeTimePage:
    schedule = client.schedule(date)
    game_week = schedule.get("gameWeek", [])
    as_of_date = game_week[0]["date"] if game_week else date

    games = []
    for day in game_week:
        for game in day.get("games", []):
            start_utc = dt.datetime.fromisoformat(game["startTimeUTC"].replace("Z", "+00:00"))
            start_local = start_utc.astimezone(HELSINKI)
            if not starts_in_window(start_local):
                continue

            game_state = game.get("gameState", "")
            games.append(
                PrimeTimeGame(
                    game_id=game["id"],
                    away=_team_info(game["awayTeam"]),
                    home=_team_info(game["homeTeam"]),
                    start_local=start_local,
                    game_state=game_state,
                    is_finished=game_state in FINISHED_STATES,
                )
            )
    games.sort(key=lambda g: g.start_local)

    return PrimeTimePage(as_of_date=as_of_date, games=games)
