"""Offseason / empty-standings degradation tests.

The NHL standings API returns an empty list during the NHL offseason (roughly
mid-June through early September), which historically crashed the nightly cron
with IndexError / StopIteration at several points. These tests pin the graceful
degradation so the site still builds and deploys year-round.
"""
import datetime as dt

from morning_hockey.playoffs import PlayoffBracket, build_bracket
from morning_hockey.standings import (
    Conference,
    Division,
    StandingsPage,
    build_standings,
)
from morning_hockey.suomiporssi import current_season_id
from morning_hockey.team import build_team_page


class EmptyStandingsClient:
    def standings(self):
        return {"standings": []}


class EmptyEverythingClient(EmptyStandingsClient):
    def __init__(self):
        super().__init__()
        self._roster = {"forwards": [], "defensemen": [], "goalies": []}

    def roster(self, team_abbrev):
        return self._roster

    def skater_bios(self, cayenne_exp, sort, limit=-1):
        return []

    def goalie_summary(self, cayenne_exp, sort, limit=-1):
        return []

    def club_schedule_season(self, team_abbrev):
        return {"games": []}


def test_current_season_id_falls_back_to_date_when_standings_empty():
    # August: season belongs to the calendar year that just ended (2025->2026).
    assert current_season_id(EmptyStandingsClient(), today=dt.date(2026, 8, 1)) == 20252026
    # September: the upcoming season starts this calendar year (2026->2027).
    assert current_season_id(EmptyStandingsClient(), today=dt.date(2026, 9, 1)) == 20262027
    # January: mid-season, belongs to the previous calendar year.
    assert current_season_id(EmptyStandingsClient(), today=dt.date(2026, 1, 15)) == 20252026


def test_build_standings_returns_empty_page_when_standings_empty():
    page = build_standings(EmptyStandingsClient(), today=dt.date(2026, 7, 15))
    assert isinstance(page, StandingsPage)
    assert page.as_of_date == "2026-07-15"
    assert page.divisions == []
    assert page.conferences == []


def test_build_bracket_survives_partially_populated_conference():
    # A conference with only one division and no wild-card teams must not crash.
    page = StandingsPage(
        as_of_date="2026-07-15",
        divisions=[Division(name="Central", conference="Western", rows=[])],
        conferences=[Conference(name="Western", wildcard_race=[])],
    )
    bracket = build_bracket(page)
    assert isinstance(bracket, PlayoffBracket)
    assert bracket.as_of_date == "2026-07-15"
    assert len(bracket.conferences) == 1
    assert bracket.conferences[0].round1 == []


def test_build_team_page_returns_none_when_team_missing_from_standings():
    assert build_team_page(EmptyEverythingClient(), "CHI", 20262027) is None