from morning_hockey.leaderboard import (
    LeaderboardRow,
    build_leaderboard,
    current_season_id,
    current_team,
)


class FakeClient:
    def __init__(self, standings, skaters):
        self._standings = standings
        self._skaters = skaters
        self.last_cayenne_exp = None

    def standings(self):
        return self._standings

    def skater_summary(self, cayenne_exp, sort, limit=-1):
        self.last_cayenne_exp = cayenne_exp
        return self._skaters


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
