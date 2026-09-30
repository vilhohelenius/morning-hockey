from morning_hockey.digest import build_digest, final_type, goalie_lines, scorer_lines, team_info

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


SCOREBOARD = {
    "currentDate": "2026-09-29",
    "games": [
        {
            "id": 1,
            "gameState": "OFF",
            "gameOutcome": {"lastPeriodType": "REG"},
            "awayTeam": {"abbrev": "FLA", "name": {"default": "Panthers"}, "logo": "fla.svg", "score": 3},
            "homeTeam": {"abbrev": "CAR", "name": {"default": "Hurricanes"}, "logo": "car.svg", "score": 1},
            "goals": [],
        },
        {
            "id": 2,
            "gameState": "OFF",
            "gameOutcome": {"lastPeriodType": "REG"},
            "awayTeam": {"abbrev": "BOS", "name": {"default": "Bruins"}, "logo": "bos.svg", "score": 2},
            "homeTeam": {"abbrev": "TOR", "name": {"default": "Maple Leafs"}, "logo": "tor.svg", "score": 4},
            "goals": [],
        },
    ],
}

EMPTY_ROSTER = {"forwards": [], "defensemen": [], "goalies": []}


class FakeClient:
    def scoreboard(self, date):
        return SCOREBOARD

    def roster(self, team_abbrev):
        return EMPTY_ROSTER

    def boxscore(self, game_id):
        raise AssertionError("boxscore() should not be called when no Finnish players are on the roster")

    def landing(self, game_id):
        if game_id == 2:
            raise KeyError("summary")
        return {
            "summary": {
                "scoring": [
                    {
                        "periodDescriptor": {"number": 1, "periodType": "REG"},
                        "goals": [
                            {
                                "playerId": 1,
                                "firstName": {"default": "Carter"},
                                "lastName": {"default": "Verhaeghe"},
                                "teamAbbrev": {"default": "FLA"},
                                "timeInPeriod": "05:00",
                                "strength": "ev",
                                "assists": [],
                            }
                        ],
                    }
                ]
            }
        }

    def right_rail(self, game_id):
        return {"teamGameStats": [{"category": "sog", "awayValue": 10, "homeValue": 8}]}


def test_build_digest_attaches_box_score_to_every_finished_game():
    digest = build_digest(FakeClient())

    assert len(digest.games) == 2
    assert digest.games[0].box_score is not None
    assert len(digest.games[0].box_score.goals) == 1
    assert digest.games[0].box_score.goals[0].scorer == "Carter Verhaeghe"


def test_build_digest_tolerates_a_box_score_failure_on_one_game():
    digest = build_digest(FakeClient())

    # game id 2's landing() raises KeyError; the digest as a whole still
    # builds, that one game just has no box score
    failing_game = next(g for g in digest.games if g.game_id == 2)
    assert failing_game.box_score is None
    assert failing_game.away.abbrev == "BOS"  # core game data is unaffected
