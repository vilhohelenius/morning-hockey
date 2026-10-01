"""Full upcoming schedule for the next 7 days, every scheduled game included
(no time-of-day filtering -- the web app's own Prime time page does that
filtering itself, in TypeScript, reading straight from D1).

Regular-season games only (gameType 2) -- preseason and playoff games are
dropped here before they ever reach D1's `games` table, since the fast tier
(the only thing that writes to it) is built on this function.
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

_REGULAR_SEASON = 2  # same convention as team.py's split_schedule


@dataclass(frozen=True)
class ScheduleGame:
    game_id: int
    away: TeamInfo
    home: TeamInfo
    start_local: dt.datetime  # Europe/Helsinki, tz-aware
    game_state: str
    is_finished: bool
    final_type: str  # "REG" | "OT" | "SO", meaningful only once is_finished


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
    """The NHL's /schedule endpoint buckets each game under a nominal
    US-schedule date, not the calendar date it actually falls on in Finland
    -- a game starting late in the evening US time can already be past
    midnight in Helsinki, while one starting in the (US) afternoon is still
    evening of the *same* Finnish day. So every game is regrouped here under
    its real Europe/Helsinki calendar date instead of trusting the
    endpoint's own day buckets.

    That regrouping can push a late game one calendar day past the
    endpoint's own last day, so the local date range generated here runs one
    day longer than the fetched window to make sure that rollover day isn't
    silently dropped.
    """
    schedule = client.schedule(date)
    game_week = schedule.get("gameWeek", [])
    if not game_week:
        return SchedulePage(as_of_date=date, days=[])

    first_date = dt.date.fromisoformat(game_week[0]["date"])
    last_date = dt.date.fromisoformat(game_week[-1]["date"])
    local_dates = [
        (first_date + dt.timedelta(days=offset)).isoformat()
        for offset in range((last_date - first_date).days + 2)
    ]

    games_by_date: dict[str, list[ScheduleGame]] = {local_date: [] for local_date in local_dates}
    for day in game_week:
        for game in day.get("games", []):
            if game.get("gameType") != _REGULAR_SEASON:
                continue
            start_utc = dt.datetime.fromisoformat(game["startTimeUTC"].replace("Z", "+00:00"))
            start_local = start_utc.astimezone(HELSINKI)
            game_state = game.get("gameState", "")
            local_date = start_local.date().isoformat()
            games_by_date.setdefault(local_date, []).append(
                ScheduleGame(
                    game_id=game["id"],
                    away=_team_info(game["awayTeam"]),
                    home=_team_info(game["homeTeam"]),
                    start_local=start_local,
                    game_state=game_state,
                    is_finished=game_state in FINISHED_STATES,
                    final_type=game.get("gameOutcome", {}).get("lastPeriodType", "REG"),
                )
            )

    days = [
        ScheduleDay(date=local_date, games=sorted(games_by_date[local_date], key=lambda g: g.start_local))
        for local_date in sorted(games_by_date)
    ]

    return SchedulePage(as_of_date=first_date.isoformat(), days=days)
