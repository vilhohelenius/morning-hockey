from morning_hockey.league_stats import (
    GoalieStatRow,
    SkaterStatRow,
    build_goalie_top,
    build_skater_top,
)


class FakeClient:
    def __init__(self, skaters=None, goalies=None, goalie_bios=None):
        self._skaters = skaters or []
        self._goalies = goalies or []
        self._goalie_bios = goalie_bios or []
        self.last_skater_call = None
        self.last_goalie_call = None

    def skater_bios(self, cayenne_exp, sort, limit=-1):
        self.last_skater_call = (cayenne_exp, limit)
        return self._skaters

    def goalie_summary(self, cayenne_exp, sort, limit=-1):
        self.last_goalie_call = (cayenne_exp, limit)
        return self._goalies

    def goalie_bios(self, cayenne_exp, sort, limit=-1):
        return self._goalie_bios


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
    assert client.last_skater_call == ("seasonId=20262027 and gameTypeId=2", -1)


def _skater(player_id, name, position, points, goals=0, assists=0):
    return {
        "playerId": player_id,
        "skaterFullName": name,
        "currentTeamAbbrev": "CHI",
        "nationalityCode": "CAN",
        "positionCode": position,
        "gamesPlayed": 1,
        "goals": goals,
        "assists": assists,
        "points": points,
    }


def test_build_skater_top_caps_forwards_and_defensemen_independently():
    # 3 forwards, 3 defensemen -- capping at 2 should keep 2 of EACH (4 total),
    # not just an overall top-2 (which would be all forwards here)
    client = FakeClient(
        skaters=[
            _skater(1, "Forward A", "C", points=10),
            _skater(2, "Forward B", "L", points=9),
            _skater(3, "Forward C", "R", points=8),
            _skater(4, "Defenseman A", "D", points=7),
            _skater(5, "Defenseman B", "D", points=6),
            _skater(6, "Defenseman C", "D", points=5),
        ]
    )

    rows = build_skater_top(client, 20262027, limit=2)

    names = [r.name for r in rows]
    assert names == ["Forward A", "Forward B", "Defenseman A", "Defenseman B"]


def test_build_goalie_top_resolves_current_team_and_merges_nationality_from_bios():
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
        ],
        goalie_bios=[{"playerId": 8480280, "nationalityCode": "USA"}],
    )

    rows = build_goalie_top(client, 20262027, limit=30)

    assert len(rows) == 1
    row = rows[0]
    assert isinstance(row, GoalieStatRow)
    assert row.name == "Jeremy Swayman"
    assert row.team == "BOS"  # last team in the traded player's list
    assert row.nationality == "USA"
    assert row.wins == 7
    assert row.save_pct == 0.925
    assert row.logo == "https://assets.nhle.com/logos/nhl/svg/BOS_light.svg"
    assert client.last_goalie_call == ("seasonId=20262027 and gameTypeId=2", 30)


def test_build_goalie_top_defaults_nationality_when_missing_from_bios():
    client = FakeClient(
        goalies=[
            {
                "playerId": 999,
                "goalieFullName": "Unknown Goalie",
                "teamAbbrevs": "CHI",
                "gamesPlayed": 1,
                "wins": 0,
                "losses": 1,
                "otLosses": 0,
                "goalsAgainstAverage": 3.0,
                "savePct": 0.9,
                "shutouts": 0,
            }
        ],
        goalie_bios=[],
    )

    rows = build_goalie_top(client, 20262027, limit=30)

    assert rows[0].nationality == ""
