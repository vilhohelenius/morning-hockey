from morning_hockey.league_stats import (
    GoalieStatRow,
    SkaterStatRow,
    build_goalie_top,
    build_skater_top,
)


class FakeClient:
    def __init__(self, skaters=None, goalies=None):
        self._skaters = skaters or []
        self._goalies = goalies or []
        self.last_skater_call = None
        self.last_goalie_call = None

    def skater_bios(self, cayenne_exp, sort, limit=-1):
        self.last_skater_call = (cayenne_exp, limit)
        return self._skaters

    def goalie_summary(self, cayenne_exp, sort, limit=-1):
        self.last_goalie_call = (cayenne_exp, limit)
        return self._goalies


def test_build_skater_top_maps_bios_fields_and_builds_asset_urls():
    client = FakeClient(
        skaters=[
            {
                "playerId": 8478402,
                "skaterFullName": "Connor McDavid",
                "currentTeamAbbrev": "EDM",
                "nationalityCode": "CAN",
                "positionCode": "C",
                "gamesPlayed": 1,
                "goals": 1,
                "assists": 2,
                "points": 3,
            }
        ]
    )

    rows = build_skater_top(client, 20262027, limit=50)

    assert len(rows) == 1
    row = rows[0]
    assert isinstance(row, SkaterStatRow)
    assert row.name == "Connor McDavid"
    assert row.team == "EDM"
    assert row.nationality == "CAN"
    assert row.position == "C"
    assert row.points == 3
    assert row.logo == "https://assets.nhle.com/logos/nhl/svg/EDM_light.svg"
    assert row.headshot == "https://assets.nhle.com/mugs/nhl/20262027/EDM/8478402.png"
    assert client.last_skater_call == ("seasonId=20262027 and gameTypeId=2", 50)


def test_build_goalie_top_resolves_current_team_for_traded_players():
    client = FakeClient(
        goalies=[
            {
                "playerId": 8480280,
                "goalieFullName": "Jeremy Swayman",
                "teamAbbrevs": "ANA,BOS",
                "gamesPlayed": 10,
                "wins": 7,
                "losses": 2,
                "otLosses": 1,
                "goalsAgainstAverage": 2.15,
                "savePct": 0.925,
                "shutouts": 1,
            }
        ]
    )

    rows = build_goalie_top(client, 20262027, limit=30)

    assert len(rows) == 1
    row = rows[0]
    assert isinstance(row, GoalieStatRow)
    assert row.name == "Jeremy Swayman"
    assert row.team == "BOS"  # last team in the traded player's list
    assert row.wins == 7
    assert row.save_pct == 0.925
    assert row.logo == "https://assets.nhle.com/logos/nhl/svg/BOS_light.svg"
    assert client.last_goalie_call == ("seasonId=20262027 and gameTypeId=2", 30)
