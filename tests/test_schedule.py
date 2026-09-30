from morning_hockey.schedule import SchedulePage, build_schedule

SCHEDULE = {
    "gameWeek": [
        {
            "date": "2026-01-15",
            "games": [
                # listed out of chronological order on purpose, to exercise the sort
                {
                    "id": 4,
                    "gameState": "FUT",
                    "startTimeUTC": "2026-01-15T22:00:00Z",
                    "awayTeam": {"abbrev": "OTT", "name": {"default": "Senators"}, "logo": "ott.svg"},
                    "homeTeam": {"abbrev": "MTL", "name": {"default": "Canadiens"}, "logo": "mtl.svg"},
                },
                {
                    "id": 3,
                    "gameState": "OFF",
                    "startTimeUTC": "2026-01-15T18:00:00Z",
                    # /schedule (like /club-schedule-season) uses commonName
                    "awayTeam": {"abbrev": "FLA", "commonName": {"default": "Panthers"}, "logo": "fla.svg", "score": 4},
                    "homeTeam": {"abbrev": "TOR", "commonName": {"default": "Maple Leafs"}, "logo": "tor.svg", "score": 2},
                },
            ],
        },
        {
            "date": "2026-01-16",
            "games": [
                {
                    "id": 1,
                    "gameState": "FUT",
                    "startTimeUTC": "2026-01-16T00:00:00Z",
                    "awayTeam": {"abbrev": "BOS", "name": {"default": "Bruins"}, "logo": "bos.svg"},
                    "homeTeam": {"abbrev": "NYR", "name": {"default": "Rangers"}, "logo": "nyr.svg"},
                },
            ],
        },
    ],
}


class FakeClient:
    def schedule(self, date="now"):
        return SCHEDULE


def test_build_schedule_groups_every_game_by_day_without_time_filtering():
    page = build_schedule(FakeClient())

    assert isinstance(page, SchedulePage)
    assert page.as_of_date == "2026-01-15"
    assert [d.date for d in page.days] == ["2026-01-15", "2026-01-16"]

    day_one = page.days[0]
    # both games on this day are kept, unlike primetime's time-window filter
    assert [g.game_id for g in day_one.games] == [3, 4]
    assert day_one.games[0].is_finished is True
    assert day_one.games[0].away.name == "Panthers"
    assert day_one.games[1].is_finished is False
    assert day_one.games[1].away.name == "Senators"

    day_two = page.days[1]
    assert [g.game_id for g in day_two.games] == [1]


def test_build_schedule_sorts_games_within_a_day_by_start_time():
    page = build_schedule(FakeClient())

    day_one = page.days[0]
    # game 4 (22:00 UTC) starts later than game 3 (18:00 UTC), but is listed
    # second in the fixture -- sorting must fix that up
    assert day_one.games[0].game_id == 3
    assert day_one.games[1].game_id == 4
