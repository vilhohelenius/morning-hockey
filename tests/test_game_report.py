from morning_hockey.game_report import GameReportPage, build_game_report, build_game_reports
from morning_hockey.team import ScheduleGame

AWAY_FORWARDS = [
    {
        "playerId": 1,
        "name": {"default": "Gustav Forsling"},
        "position": "D",
        "goals": 1,
        "assists": 0,
        "points": 1,
        "plusMinus": 1,
        "sog": 3,
        "pim": 0,
        "toi": "18:20",
    }
]
AWAY_GOALIES = [
    {
        "playerId": 2,
        "name": {"default": "Spencer Knight"},
        "decision": "L",
        "saves": 27,
        "shotsAgainst": 29,
        "savePctg": 0.931,
        "toi": "58:12",
    },
    {
        "playerId": 3,
        "name": {"default": "Backup Goalie"},
        "decision": None,
        "saves": 0,
        "shotsAgainst": 0,
        "savePctg": 0.0,
        "toi": "0:00",  # never entered the game -- must be excluded
    },
]

BOXSCORE = {
    "playerByGameStats": {
        "awayTeam": {"forwards": AWAY_FORWARDS, "defense": [], "goalies": AWAY_GOALIES},
        "homeTeam": {"forwards": [], "defense": [], "goalies": []},
    }
}

LANDING = {
    "summary": {
        "scoring": [
            {
                "periodDescriptor": {"number": 1, "periodType": "REG"},
                "goals": [
                    {
                        "firstName": {"default": "Gustav"},
                        "lastName": {"default": "Forsling"},
                        "teamAbbrev": {"default": "FLA"},
                        "timeInPeriod": "04:55",
                        "strength": "ev",
                        "assists": [],
                    }
                ],
            }
        ]
    }
}

RIGHT_RAIL = {"teamGameStats": [{"category": "sog", "awayValue": 20, "homeValue": 15}]}

GAME = ScheduleGame(
    game_id=2026020001,
    date="2026-01-15",
    is_home=False,
    opponent_abbrev="TOR",
    opponent_name="Maple Leafs",
    opponent_logo="tor.svg",
    team_score=1,
    opponent_score=0,
    final_type="REG",
    result="W",
)


class FakeClient:
    def landing(self, game_id):
        return LANDING

    def right_rail(self, game_id):
        return RIGHT_RAIL

    def boxscore(self, game_id):
        return BOXSCORE


def test_build_game_report_assigns_away_home_by_is_home_flag():
    report = build_game_report(FakeClient(), GAME, "FLA", "Florida Panthers", "fla.svg")

    assert isinstance(report, GameReportPage)
    # GAME.is_home is False, so the team itself (FLA) is away, TOR is home
    assert report.away.abbrev == "FLA"
    assert report.away.name == "Florida Panthers"
    assert report.away.score == 1
    assert report.home.abbrev == "TOR"
    assert report.home.score == 0

    assert len(report.goals) == 1
    assert report.goals[0].scorer == "Gustav Forsling"

    # build_team_stats always emits its fixed set of rows (missing categories
    # show as "–"); just check the one category this fixture actually has
    shots_row = next(row for row in report.team_stats if row.label == "Laukaukset")
    assert shots_row.away_value == "20"
    assert shots_row.home_value == "15"


def test_build_game_report_maps_full_player_stat_lines_and_drops_unused_goalies():
    report = build_game_report(FakeClient(), GAME, "FLA", "Florida Panthers", "fla.svg")

    assert len(report.away_skaters) == 1
    skater = report.away_skaters[0]
    assert skater.name == "Gustav Forsling"
    assert skater.plus_minus == 1
    assert skater.shots == 3
    assert skater.toi == "18:20"

    # the 0:00 TOI backup goalie never played -- must be excluded
    assert len(report.away_goalies) == 1
    assert report.away_goalies[0].name == "Spencer Knight"

    assert report.home_skaters == []
    assert report.home_goalies == []


def test_build_game_reports_skips_a_game_whose_data_fails_without_crashing():
    class PartlyFailingClient(FakeClient):
        def landing(self, game_id):
            if game_id == 999:
                raise KeyError("summary")
            return LANDING

    other_game = ScheduleGame(
        game_id=999,
        date="2026-01-16",
        is_home=True,
        opponent_abbrev="BOS",
        opponent_name="Bruins",
        opponent_logo="bos.svg",
        team_score=2,
        opponent_score=3,
        final_type="OT",
        result="OTL",
    )

    reports = build_game_reports(PartlyFailingClient(), [GAME, other_game], "FLA", "Florida Panthers", "fla.svg")

    assert [r.game_id for r in reports] == [2026020001]
