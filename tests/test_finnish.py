from morning_hockey.finnish import finnish_players_for_teams, team_players

ROSTER = {
    "forwards": [
        {
            "id": 1,
            "firstName": {"default": "Sebastian"},
            "lastName": {"default": "Aho"},
            "birthCountry": "FIN",
        },
        {
            "id": 2,
            "firstName": {"default": "Tyler"},
            "lastName": {"default": "Bertuzzi"},
            "birthCountry": "CAN",
        },
    ],
    "defensemen": [],
    "goalies": [
        {
            "id": 3,
            "firstName": {"default": "Spencer"},
            "lastName": {"default": "Knight"},
            "birthCountry": "USA",
        }
    ],
}


class FakeClient:
    def __init__(self, skater_bios=(), goalie_bios=()):
        self._skater_bios = list(skater_bios)
        self._goalie_bios = list(goalie_bios)

    def roster(self, team_abbrev):
        return ROSTER

    def standings(self, date="now"):
        return {"standings": [{"seasonId": 20262027}]}

    def skater_bios(self, cayenne_exp, sort, limit=-1):
        return self._skater_bios

    def goalie_bios(self, cayenne_exp, sort, limit=-1):
        return self._goalie_bios


def test_finnish_players_for_teams_filters_by_nationality():
    index = finnish_players_for_teams(FakeClient(), {"CHI"})

    assert list(index.keys()) == [1]
    assert index[1] == {"name": "Sebastian Aho", "team": "CHI"}


def test_team_players_includes_everyone_regardless_of_nationality():
    index = team_players(FakeClient(), "CHI")

    assert set(index.keys()) == {1, 2, 3}
    assert index[2] == {"name": "Tyler Bertuzzi", "team": "CHI"}
    assert index[3] == {"name": "Spencer Knight", "team": "CHI"}


def test_finnish_players_prefers_nationality_code_over_birth_country():
    # Aho: born FIN but represents SWE; Bertuzzi: born CAN, sporting nationality FIN
    client = FakeClient(
        skater_bios=[
            {"playerId": 1, "nationalityCode": "SWE"},
            {"playerId": 2, "nationalityCode": "FIN"},
        ]
    )

    index = finnish_players_for_teams(client, {"CHI"})

    assert list(index.keys()) == [2]


def test_finnish_players_falls_back_to_birth_country_when_not_in_bios():
    client = FakeClient(skater_bios=[{"playerId": 2, "nationalityCode": "CAN"}])

    index = finnish_players_for_teams(client, {"CHI"})

    assert list(index.keys()) == [1]  # Aho not in bios -> birthCountry FIN


def test_finnish_players_falls_back_when_bios_fetch_fails():
    class Broken(FakeClient):
        def skater_bios(self, *args, **kwargs):
            raise KeyError("boom")

    index = finnish_players_for_teams(Broken(), {"CHI"})

    assert list(index.keys()) == [1]
