from morning_hockey.suomiporssi import (
    GoalieLeaderboardRow,
    LeaderboardRow,
    build_goalie_leaderboard,
    build_leaderboard,
    current_season_id,
    current_team,
)


class FakeClient:
    def __init__(self, standings=None, skaters=None, goalie_bios=None, goalie_summary=None):
        self._standings = standings
        self._skaters = skaters or []
        self._goalie_bios = goalie_bios or []
        self._goalie_summary = goalie_summary or []
        self.last_cayenne_exp = None

    def standings(self):
        return self._standings

    def skater_summary(self, cayenne_exp, sort, limit=-1):
        self.last_cayenne_exp = cayenne_exp
        return self._skaters

    def goalie_bios(self, cayenne_exp, sort, limit=-1):
        self.last_cayenne_exp = cayenne_exp
        return self._goalie_bios

    def goalie_summary(self, cayenne_exp, sort, limit=-1):
        return self._goalie_summary


def test_current_team_picks_the_most_recent_team_for_traded_players():
    assert current_team("CAR") == "CAR"
    assert current_team("FLA,CAR") == "CAR"
    assert current_team("FLA, CAR") == "CAR"


def test_current_season_id_reads_first_standings_row():
    client = FakeClient({"standings": [{"seasonId": 20262027}]}, [])
    assert current_season_id(client) == 20262027


def test_build_leaderboard_maps_rows_and_builds_asset_urls():
    client = FakeClient(
        standings=None,
        skaters=[
            {
                "playerId": 8477493,
                "skaterFullName": "Aleksander Barkov",
                "teamAbbrevs": "FLA",
                "positionCode": "C",
                "gamesPlayed": 1,
                "goals": 1,
                "assists": 2,
                "points": 3,
            }
        ],
    )

    rows = build_leaderboard(client, 20262027)

    assert len(rows) == 1
    row = rows[0]
    assert isinstance(row, LeaderboardRow)
    assert row.name == "Aleksander Barkov"
    assert row.team == "FLA"
    assert row.points == 3
    assert row.logo == "https://assets.nhle.com/logos/nhl/svg/FLA_light.svg"
    assert row.headshot == "https://assets.nhle.com/mugs/nhl/20262027/FLA/8477493.png"
    assert client.last_cayenne_exp == 'nationalityCode="FIN" and seasonId=20262027 and gameTypeId=2'


def test_build_goalie_leaderboard_merges_bios_and_summary():
    client = FakeClient(
        goalie_bios=[
            {
                "playerId": 8477293,
                "goalieFullName": "Juuse Saros",
                "currentTeamAbbrev": "NSH",
                "gamesPlayed": 1,
                "wins": 1,
                "losses": 0,
                "otLosses": 0,
                "shutouts": 0,
            }
        ],
        goalie_summary=[
            {
                "playerId": 8477293,
                "gamesPlayed": 1,
                "wins": 1,
                "losses": 0,
                "otLosses": 0,
                "goalsAgainstAverage": 1.5,
                "savePct": 0.955,
                "shutouts": 0,
            }
        ],
    )

    rows = build_goalie_leaderboard(client, 20262027)

    assert len(rows) == 1
    row = rows[0]
    assert isinstance(row, GoalieLeaderboardRow)
    assert row.name == "Juuse Saros"
    assert row.team == "NSH"
    assert row.save_pct == 0.955
    assert row.logo == "https://assets.nhle.com/logos/nhl/svg/NSH_light.svg"
    assert row.headshot == "https://assets.nhle.com/mugs/nhl/20262027/NSH/8477293.png"
    assert client.last_cayenne_exp == 'nationalityCode="FIN" and seasonId=20262027 and gameTypeId=2'


def test_build_goalie_leaderboard_returns_empty_when_no_finnish_goalies():
    client = FakeClient(goalie_bios=[])
    assert build_goalie_leaderboard(client, 20262027) == []


def test_build_goalie_leaderboard_defaults_when_missing_from_summary():
    client = FakeClient(
        goalie_bios=[
            {
                "playerId": 999,
                "goalieFullName": "Backup Goalie",
                "currentTeamAbbrev": "CHI",
                "gamesPlayed": 0,
                "wins": 0,
                "losses": 0,
                "otLosses": 0,
                "shutouts": 0,
            }
        ],
        goalie_summary=[],
    )

    rows = build_goalie_leaderboard(client, 20262027)

    assert rows[0].save_pct == 0.0
    assert rows[0].games_played == 0
