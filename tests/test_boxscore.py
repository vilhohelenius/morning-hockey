from morning_hockey.boxscore import build_box_score, build_goal_events, build_team_stats
from morning_hockey.models import GameBoxScore

SCORING_BY_PERIOD = [
    {"periodDescriptor": {"number": 1, "periodType": "REG"}, "goals": []},
    {
        "periodDescriptor": {"number": 2, "periodType": "REG"},
        "goals": [
            {
                "firstName": {"default": "Gustav"},
                "lastName": {"default": "Forsling"},
                "teamAbbrev": {"default": "FLA"},
                "timeInPeriod": "04:55",
                "strength": "ev",
                "assists": [
                    {"firstName": {"default": "Carter"}, "lastName": {"default": "Verhaeghe"}},
                ],
            }
        ],
    },
    {
        "periodDescriptor": {"number": 4, "periodType": "OT"},
        "goals": [
            {
                "firstName": {"default": "Sebastian"},
                "lastName": {"default": "Aho"},
                "teamAbbrev": {"default": "CAR"},
                "timeInPeriod": "01:23",
                "strength": "pp",
                "assists": [],
            }
        ],
    },
]

TEAM_GAME_STATS = [
    {"category": "sog", "awayValue": 20, "homeValue": 15},
    {"category": "faceoffWinningPctg", "awayValue": 0.413793, "homeValue": 0.586207},
    {"category": "powerPlay", "awayValue": "0/7", "homeValue": "1/6"},
    {"category": "powerPlayPctg", "awayValue": 0.0, "homeValue": 0.166667},
    {"category": "pim", "awayValue": 17, "homeValue": 19},
]


def test_build_goal_events_labels_periods_and_carries_full_names():
    events = build_goal_events(SCORING_BY_PERIOD, away_abbrev="FLA", home_abbrev="CAR")

    assert len(events) == 2
    first, second = events

    assert first.period_label == "2. erä"
    assert first.time_in_period == "04:55"
    assert first.team_abbrev == "FLA"
    assert first.scorer == "Gustav Forsling"
    assert first.assists == ["Carter Verhaeghe"]
    assert first.strength == ""  # even strength -> no tag
    assert first.away_score == 1  # FLA (away) scored
    assert first.home_score == 0

    assert second.period_label == "Jatkoaika"
    assert second.scorer == "Sebastian Aho"
    assert second.assists == []
    assert second.strength == "YV"
    assert second.away_score == 1
    assert second.home_score == 1  # CAR (home) tied it up


def test_build_team_stats_computes_save_pct_from_score_and_shots():
    # away scored 1, home scored 2 in this game; home faced 20 shots, away faced 15
    rows = build_team_stats(TEAM_GAME_STATS, away_score=1, home_score=2)
    by_label = {row.label: row for row in rows}

    assert by_label["Laukaukset"].away_value == "20"
    assert by_label["Laukaukset"].home_value == "15"

    # away's goalie faced home's shots (15) and let in home's score (2)
    assert by_label["Torjuntaprosentti"].away_value == "86.7 %"
    # home's goalie faced away's shots (20) and let in away's score (1)
    assert by_label["Torjuntaprosentti"].home_value == "95.0 %"

    assert by_label["Ylivoima (YV%)"].away_value == "0/7 (0.0 %)"
    assert by_label["Ylivoima (YV%)"].home_value == "1/6 (16.7 %)"

    # away's penalty kill = 1 - home's PP% ; home's PK = 1 - away's PP%
    assert by_label["Alivoima (AV%)"].away_value == "83.3 %"
    assert by_label["Alivoima (AV%)"].home_value == "100.0 %"

    assert by_label["Aloitusprosentti"].away_value == "41.4 %"
    assert by_label["Jäähyt (min)"].home_value == "19"


class FakeClient:
    def landing(self, game_id):
        return {"summary": {"scoring": SCORING_BY_PERIOD}}

    def right_rail(self, game_id):
        return {"teamGameStats": TEAM_GAME_STATS}


def test_build_team_stats_shows_a_dash_for_zero_power_play_opportunities():
    stats = [
        {"category": "powerPlay", "awayValue": "0/0", "homeValue": "2/5"},
        {"category": "powerPlayPctg", "awayValue": 0.0, "homeValue": 0.4},
    ]
    rows = build_team_stats(stats, away_score=1, home_score=2)
    by_label = {row.label: row for row in rows}

    assert by_label["Ylivoima (YV%)"].away_value == "–"  # 0 attempts, not 0% of something
    assert by_label["Ylivoima (YV%)"].home_value == "2/5 (40.0 %)"


def test_build_box_score_combines_goals_and_team_stats():
    box = build_box_score(FakeClient(), game_id=1, away_abbrev="FLA", home_abbrev="CAR", away_score=1, home_score=2)

    assert isinstance(box, GameBoxScore)
    assert len(box.goals) == 2
    assert len(box.team_stats) == 6
