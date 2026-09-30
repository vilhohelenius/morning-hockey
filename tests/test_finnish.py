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
    def roster(self, team_abbrev):
        return ROSTER


def test_finnish_players_for_teams_filters_by_nationality():
    index = finnish_players_for_teams(FakeClient(), {"CHI"})

    assert list(index.keys()) == [1]
    assert index[1] == {"name": "Sebastian Aho", "team": "CHI"}


def test_team_players_includes_everyone_regardless_of_nationality():
    index = team_players(FakeClient(), "CHI")

    assert set(index.keys()) == {1, 2, 3}
    assert index[2] == {"name": "Tyler Bertuzzi", "team": "CHI"}
    assert index[3] == {"name": "Spencer Knight", "team": "CHI"}
