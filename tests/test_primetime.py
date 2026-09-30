from morning_hockey.primetime import PrimeTimePage, build_primetime, is_prime_time

SCOREBOARD = {
    "currentDate": "2026-01-15",
    "games": [
        {
            "id": 1,
            "gameState": "FUT",
            # 19:00 ET (winter, UTC-5) -> 02:00 Finnish time the next day: prime time
            "startTimeUTC": "2026-01-16T00:00:00Z",
            "awayTeam": {"abbrev": "BOS", "name": {"default": "Bruins"}, "logo": "bos.svg"},
            "homeTeam": {"abbrev": "NYR", "name": {"default": "Rangers"}, "logo": "nyr.svg"},
        },
        {
            "id": 2,
            "gameState": "FUT",
            # 22:00 PT (UTC-8) -> 08:00 Finnish time: not prime time
            "startTimeUTC": "2026-01-16T06:00:00Z",
            "awayTeam": {"abbrev": "LAK", "name": {"default": "Kings"}, "logo": "lak.svg"},
            "homeTeam": {"abbrev": "SJS", "name": {"default": "Sharks"}, "logo": "sjs.svg"},
        },
        {
            "id": 3,
            "gameState": "OFF",
            # 13:00 ET matinee -> 20:00 Finnish time: prime time, already finished
            "startTimeUTC": "2026-01-15T18:00:00Z",
            "gameOutcome": {"lastPeriodType": "REG"},
            "awayTeam": {"abbrev": "FLA", "name": {"default": "Panthers"}, "logo": "fla.svg", "score": 4},
            "homeTeam": {"abbrev": "TOR", "name": {"default": "Maple Leafs"}, "logo": "tor.svg", "score": 2},
        },
    ],
}


class FakeClient:
    def scoreboard(self, date="now"):
        return SCOREBOARD


def test_is_prime_time_evening_and_early_night_window():
    import datetime as dt

    from morning_hockey.primetime import HELSINKI

    assert is_prime_time(dt.datetime(2026, 1, 15, 18, 0, tzinfo=HELSINKI)) is True
    assert is_prime_time(dt.datetime(2026, 1, 16, 2, 0, tzinfo=HELSINKI)) is True
    assert is_prime_time(dt.datetime(2026, 1, 16, 2, 59, tzinfo=HELSINKI)) is True
    assert is_prime_time(dt.datetime(2026, 1, 16, 3, 0, tzinfo=HELSINKI)) is False
    assert is_prime_time(dt.datetime(2026, 1, 15, 17, 59, tzinfo=HELSINKI)) is False


def test_build_primetime_converts_times_sorts_and_flags_prime_window():
    page = build_primetime(FakeClient())

    assert isinstance(page, PrimeTimePage)
    assert page.as_of_date == "2026-01-15"
    assert len(page.games) == 3

    # sorted chronologically by Finnish local start time
    assert [g.game_id for g in page.games] == [3, 1, 2]

    matinee, evening, late_night = page.games
    assert matinee.is_prime_time is True
    assert matinee.is_finished is True
    assert matinee.away.score == 4

    assert evening.is_prime_time is True
    assert evening.is_finished is False

    assert late_night.is_prime_time is False
