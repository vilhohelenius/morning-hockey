"""Tonight's NHL schedule converted to Finnish local time, so a Finnish fan
can see at a glance which games land in the evening/early-night window they
can actually watch live — US matinee and early-evening games, through the
typical 7pm ET slate (which lands around 2am Finnish time).

West-coast games starting even later (landing in the Finnish early-morning
hours) are still listed, just not flagged as prime time.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from .digest import FINISHED_STATES, team_info
from .models import TeamInfo
from .nhl_api import NHLClient

HELSINKI = ZoneInfo("Europe/Helsinki")

# Prime time = Finnish local hour is >= 18 (evening) or < 3 (early night).
_PRIME_START_HOUR = 18
_PRIME_END_HOUR = 3


@dataclass(frozen=True)
class PrimeTimeGame:
    game_id: int
    away: TeamInfo
    home: TeamInfo
    start_local: dt.datetime  # Europe/Helsinki, tz-aware
    game_state: str
    is_prime_time: bool
    is_finished: bool


@dataclass(frozen=True)
class PrimeTimePage:
    as_of_date: str
    games: list[PrimeTimeGame]


def is_prime_time(local_start: dt.datetime) -> bool:
    hour = local_start.hour
    return hour >= _PRIME_START_HOUR or hour < _PRIME_END_HOUR


def build_primetime(client: NHLClient, date: str = "now") -> PrimeTimePage:
    scoreboard = client.scoreboard(date)
    target_date = scoreboard.get("currentDate", date)

    games = []
    for game in scoreboard.get("games", []):
        start_utc = dt.datetime.fromisoformat(game["startTimeUTC"].replace("Z", "+00:00"))
        start_local = start_utc.astimezone(HELSINKI)
        game_state = game.get("gameState", "")
        games.append(
            PrimeTimeGame(
                game_id=game["id"],
                away=team_info(game["awayTeam"]),
                home=team_info(game["homeTeam"]),
                start_local=start_local,
                game_state=game_state,
                is_prime_time=is_prime_time(start_local),
                is_finished=game_state in FINISHED_STATES,
            )
        )
    games.sort(key=lambda g: g.start_local)

    return PrimeTimePage(as_of_date=target_date, games=games)
