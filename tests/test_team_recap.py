from morning_hockey.team_recap import TeamRecap, build_team_recap

SCOREBOARD = {
    "games": [
        {
            "id": 1,
            "gameState": "FUT",
            "awayTeam": {"abbrev": "MTL"},
            "homeTeam": {"abbrev": "TOR"},
        },
        {
            "id": 2026020001,
            "gameState": "OFF",
            "gameOutcome": {"lastPeriodType": "OT"},
            "awayTeam": {
                "abbrev": "CHI",
                "name": {"default": "Blackhawks"},
                "logo": "chi.svg",
                "score": 2,
            },
            "homeTeam": {
                "abbrev": "VGK",
                "name": {"default": "Golden Knights"},
                "logo": "vgk.svg",
                "score": 5,
            },
            "goals": [
                {
                    "playerId": 1,
                    "teamAbbrev": "CHI",
                    "assists": [{"playerId": 2}],
                }
            ],
        },
    ]
}

ROSTER = {
    "forwards": [
        {"id": 1, "firstName": {"default": "Ryan"}, "lastName": {"default": "Donato"}},
        {"id": 2, "firstName": {"default": "Patrick"}, "lastName": {"default": "Kane"}},
    ],
    "defensemen": [],
    "goalies": [{"id": 3, "firstName": {"default": "Spencer"}, "lastName": {"default": "Knight"}}],
}

BOXSCORE = {
    "playerByGameStats": {
        "awayTeam": {
            "goalies": [
                {"playerId": 3, "decision": "L", "saves": 30, "shotsAgainst": 35, "toi": "60:00"},
            ]
        },
        "homeTeam": {"goalies": []},
    }
}


class FakeClient:
    def __init__(self, scoreboard):
        self._scoreboard = scoreboard

    def scoreboard(self, date):
        return self._scoreboard

    def roster(self, team_abbrev):
        return ROSTER

    def boxscore(self, game_id):
        return BOXSCORE


def test_build_team_recap_returns_none_when_team_did_not_play():
    assert build_team_recap(FakeClient({"games": []}), "CHI") is None


def test_build_team_recap_ignores_unfinished_games_for_the_team():
    scoreboard = {"games": [{"id": 1, "gameState": "FUT", "awayTeam": {"abbrev": "CHI"}, "homeTeam": {"abbrev": "TOR"}}]}
    assert build_team_recap(FakeClient(scoreboard), "CHI") is None


def test_build_team_recap_builds_scorers_and_goalies_for_the_team_only():
    recap = build_team_recap(FakeClient(SCOREBOARD), "CHI")

    assert isinstance(recap, TeamRecap)
    assert recap.is_home is False
    assert recap.team.abbrev == "CHI"
    assert recap.team.score == 2
    assert recap.opponent.abbrev == "VGK"
    assert recap.final_type == "OT"

    assert len(recap.scorers) == 2
    scorer_names = {s.name for s in recap.scorers}
    assert scorer_names == {"Ryan Donato", "Patrick Kane"}

    assert len(recap.goalies) == 1
    assert recap.goalies[0].name == "Spencer Knight"
    assert recap.goalies[0].saves == 30
