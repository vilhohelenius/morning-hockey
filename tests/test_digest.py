from morning_hockey.digest import final_type, goalie_lines, scorer_lines, team_info

FINNISH_INDEX = {
    8478427: {"name": "Sebastian Aho", "team": "CAR"},
    8477493: {"name": "Juuse Saros", "team": "NSH"},
}

# Shapes mirror real responses from api-web.nhle.com/v1/score/{date}
GAME = {
    "id": 2026020001,
    "awayTeam": {
        "abbrev": "FLA",
        "name": {"default": "Panthers"},
        "logo": "https://assets.nhle.com/logos/nhl/svg/FLA_light.svg",
        "score": 1,
    },
    "homeTeam": {
        "abbrev": "CAR",
        "name": {"default": "Hurricanes"},
        "logo": "https://assets.nhle.com/logos/nhl/svg/CAR_light.svg",
        "score": 3,
    },
    "gameOutcome": {"lastPeriodType": "OT"},
    "goals": [
        {
            "playerId": 8478427,
            "assists": [{"playerId": 8480001}],
        },
        {
            "playerId": 8478427,
            "assists": [{"playerId": 8477934}],
        },
        {
            "playerId": 8480002,
            "assists": [{"playerId": 8478427}],
        },
    ],
}

# Shape mirrors playerByGameStats from /gamecenter/{id}/boxscore
BOXSCORE = {
    "playerByGameStats": {
        "awayTeam": {"goalies": []},
        "homeTeam": {
            "goalies": [
                {
                    "playerId": 8477493,
                    "decision": "W",
                    "saves": 27,
                    "shotsAgainst": 29,
                    "savePctg": 0.931,
                    "toi": "59:12",
                },
                {
                    "playerId": 8481033,
                    "decision": None,
                    "saves": 0,
                    "shotsAgainst": 0,
                    "savePctg": None,
                    "toi": "00:00",
                },
            ]
        },
    }
}


def test_team_info_reads_nested_fields():
    info = team_info(GAME["homeTeam"])
    assert info.abbrev == "CAR"
    assert info.name == "Hurricanes"
    assert info.score == 3


def test_final_type_defaults_to_reg():
    assert final_type({"gameOutcome": {"lastPeriodType": "OT"}}) == "OT"
    assert final_type({}) == "REG"


def test_scorer_lines_tallies_goals_and_assists_for_finnish_players_only():
    lines = scorer_lines(GAME, FINNISH_INDEX)

    assert len(lines) == 1
    aho = lines[0]
    assert aho.name == "Sebastian Aho"
    assert aho.goals == 2
    assert aho.assists == 1
    assert aho.line == "2+1"
    assert aho.points == 3


def test_goalie_lines_skips_non_finnish_and_zero_minute_appearances():
    lines = goalie_lines(BOXSCORE, FINNISH_INDEX)

    assert len(lines) == 1
    saros = lines[0]
    assert saros.name == "Juuse Saros"
    assert saros.saves == 27
    assert saros.shots_against == 29
    assert saros.decision == "W"


def test_no_finnish_players_yields_empty_lines():
    assert scorer_lines(GAME, {}) == []
    assert goalie_lines(BOXSCORE, {}) == []
