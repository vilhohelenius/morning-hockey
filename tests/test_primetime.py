from morning_hockey.primetime import HELSINKI, PrimeTimePage, build_primetime, starts_in_window

SCHEDULE = {
    "gameWeek": [
        {
            "date": "2026-01-15",
            "games": [
                {
                    "id": 3,
                    "gameState": "OFF",
                    # 13:00 ET matinee -> 20:00 Finnish time: in window, already finished
                    "startTimeUTC": "2026-01-15T18:00:00Z",
                    "awayTeam": {"abbrev": "FLA", "name": {"default": "Panthers"}, "logo": "fla.svg", "score": 4},
                    "homeTeam": {"abbrev": "TOR", "name": {"default": "Maple Leafs"}, "logo": "tor.svg", "score": 2},
                },
                {
                    "id": 4,
                    "gameState": "FUT",
                    # 10:00 ET -> 17:00 Finnish time: before the window, excluded
                    "startTimeUTC": "2026-01-15T15:00:00Z",
                    "awayTeam": {"abbrev": "OTT", "name": {"default": "Senators"}, "logo": "ott.svg"},
                    "homeTeam": {"abbrev": "MTL", "name": {"default": "Canadiens"}, "logo": "mtl.svg"},
                },
            ],
        },
        {
            "date": "2026-01-16",
            "games": [
                {
                    "id": 1,
                    "gameState": "FUT",
                    # 19:00 ET (winter, UTC-5) -> 02:00 Finnish time the next day: past midnight, excluded
                    "startTimeUTC": "2026-01-16T00:00:00Z",
                    "awayTeam": {"abbrev": "BOS", "name": {"default": "Bruins"}, "logo": "bos.svg"},
                    "homeTeam": {"abbrev": "NYR", "name": {"default": "Rangers"}, "logo": "nyr.svg"},
                },
                {
                    "id": 5,
                    "gameState": "FUT",
                    # 16:00 ET -> 23:00 Finnish time: in window
                    "startTimeUTC": "2026-01-16T21:00:00Z",
                    "awayTeam": {"abbrev": "CAR", "name": {"default": "Hurricanes"}, "logo": "car.svg"},
                    "homeTeam": {"abbrev": "WSH", "name": {"default": "Capitals"}, "logo": "wsh.svg"},
                },
            ],
        },
    ],
}


class FakeClient:
    def schedule(self, date="now"):
        return SCHEDULE


def test_starts_in_window_is_evening_up_to_midnight_only():
    import datetime as dt

    assert starts_in_window(dt.datetime(2026, 1, 15, 18, 0, tzinfo=HELSINKI)) is True
    assert starts_in_window(dt.datetime(2026, 1, 15, 23, 59, tzinfo=HELSINKI)) is True
    assert starts_in_window(dt.datetime(2026, 1, 15, 17, 59, tzinfo=HELSINKI)) is False
    assert starts_in_window(dt.datetime(2026, 1, 16, 0, 0, tzinfo=HELSINKI)) is False
    assert starts_in_window(dt.datetime(2026, 1, 16, 2, 0, tzinfo=HELSINKI)) is False


def test_build_primetime_filters_to_window_across_the_week_and_sorts():
    page = build_primetime(FakeClient())

    assert isinstance(page, PrimeTimePage)
    assert page.as_of_date == "2026-01-15"

    # only games 3 (Jan 15 20:00) and 5 (Jan 16 23:00) start in the window;
    # games 4 (17:00, too early) and 1 (02:00 next day) are excluded
    assert [g.game_id for g in page.games] == [3, 5]

    matinee, evening = page.games
    assert matinee.is_finished is True
    assert matinee.away.score == 4
    assert evening.is_finished is False
