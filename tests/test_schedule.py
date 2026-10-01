from morning_hockey.schedule import SchedulePage, build_schedule

SCHEDULE = {
    "gameWeek": [
        {
            "date": "2026-01-15",
            "games": [
                {
                    "id": 3,
                    "gameState": "OFF",
                    "gameType": 2,
                    # 18:00 UTC -> 20:00 Finnish (winter, UTC+2): stays on the 15th
                    "startTimeUTC": "2026-01-15T18:00:00Z",
                    # /schedule (like /club-schedule-season) uses commonName
                    "awayTeam": {"abbrev": "FLA", "commonName": {"default": "Panthers"}, "logo": "fla.svg", "score": 4},
                    "homeTeam": {"abbrev": "TOR", "commonName": {"default": "Maple Leafs"}, "logo": "tor.svg", "score": 2},
                },
                {
                    "id": 4,
                    "gameState": "FUT",
                    "gameType": 2,
                    # 22:00 UTC -> 00:00 Finnish the *next* day -- a late US
                    # game that's already past midnight in Finland, even
                    # though the API still nominally dates it the 15th
                    "startTimeUTC": "2026-01-15T22:00:00Z",
                    "awayTeam": {"abbrev": "OTT", "name": {"default": "Senators"}, "logo": "ott.svg"},
                    "homeTeam": {"abbrev": "MTL", "name": {"default": "Canadiens"}, "logo": "mtl.svg"},
                },
                {
                    "id": 99,
                    "gameState": "OFF",
                    "gameType": 1,  # preseason -- must never show up in build_schedule's output
                    "startTimeUTC": "2026-01-15T15:00:00Z",
                    "awayTeam": {"abbrev": "CHI", "name": {"default": "Blackhawks"}, "logo": "chi.svg", "score": 1},
                    "homeTeam": {"abbrev": "STL", "name": {"default": "Blues"}, "logo": "stl.svg", "score": 2},
                },
            ],
        },
        {
            "date": "2026-01-16",
            "games": [
                {
                    "id": 1,
                    "gameState": "FUT",
                    "gameType": 2,
                    # 00:00 UTC -> 02:00 Finnish, same day as the API's own bucket
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


def test_build_schedule_regroups_games_onto_their_finnish_calendar_day():
    page = build_schedule(FakeClient())

    assert isinstance(page, SchedulePage)
    assert page.as_of_date == "2026-01-15"
    # one extra trailing day is generated to catch any further rollover
    assert [d.date for d in page.days] == ["2026-01-15", "2026-01-16", "2026-01-17"]

    day_15 = page.days[0]
    # game 4 started at 22:00 UTC (00:00 Finnish the next day) so it moves
    # off this day, even though the API's own bucket still called it the 15th.
    # game 99 is preseason (gameType 1) and must never appear at all.
    assert [g.game_id for g in day_15.games] == [3]
    assert day_15.games[0].is_finished is True
    assert day_15.games[0].away.name == "Panthers"

    day_16 = page.days[1]
    # game 4 (00:00 Finnish) joins game 1 (02:00 Finnish) here, sorted by start time
    assert [g.game_id for g in day_16.games] == [4, 1]
    assert day_16.games[0].is_finished is False
    assert day_16.games[0].away.name == "Senators"

    day_17 = page.days[2]
    assert day_17.games == []
