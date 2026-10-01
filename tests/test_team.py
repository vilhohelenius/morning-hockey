from morning_hockey.team import (
    RosterGoalie,
    RosterSkater,
    SeasonStats,
    build_all_team_rosters,
    build_all_team_season_stats,
    team_display_name,
)

STANDINGS = {
    "standings": [
        {
            "teamAbbrev": {"default": "TOR"},
            "teamName": {"default": "Toronto Maple Leafs"},
        },
        {
            "teamAbbrev": {"default": "NSH"},
            "teamName": {"default": "Nashville Predators"},
        },
    ]
}

ROSTERS = {
    "TOR": {
        "forwards": [
            {
                "id": 1,
                "firstName": {"default": "Auston"},
                "lastName": {"default": "Matthews"},
                "positionCode": "C",
                "sweaterNumber": 34,
                "headshot": "https://assets.nhle.com/mugs/nhl/20262027/TOR/1.png",
            }
        ],
        "defensemen": [],
        "goalies": [
            {
                "id": 2,
                "firstName": {"default": "Joseph"},
                "lastName": {"default": "Woll"},
                "positionCode": "G",
                "sweaterNumber": 60,
                "headshot": "https://assets.nhle.com/mugs/nhl/20262027/TOR/2.png",
            }
        ],
    },
    "NSH": {"forwards": [], "defensemen": [], "goalies": []},
}

SKATER_STATS = [
    {
        "playerId": 1,
        "gamesPlayed": 1,
        "goals": 2,
        "assists": 1,
        "points": 3,
        "plusMinus": -1,
        "timeOnIcePerGame": 1025.0,  # 17:05
    }
]

GOALIE_STATS = [
    {
        "playerId": 2,
        "gamesPlayed": 1,
        "wins": 1,
        "losses": 0,
        "otLosses": 0,
        "goalsAgainstAverage": 1.5,
        "savePct": 0.955,
        "shutouts": 1,
    }
]

TEAM_SUMMARY = [
    {
        "teamFullName": "Toronto Maple Leafs",
        "gamesPlayed": 1,
        "goalsFor": 2,
        "goalsAgainst": 5,
        "powerPlayPct": 0.0,
        "penaltyKillPct": 0.666667,
        "faceoffWinPct": 0.431034,
        "shotsForPerGame": 26.0,
        "shotsAgainstPerGame": 37.0,
        "teamShutouts": 0,
    },
]


class FakeClient:
    def standings(self):
        return STANDINGS

    def roster(self, team_abbrev):
        return ROSTERS[team_abbrev]

    def skater_summary(self, cayenne_exp, sort, limit=-1):
        return SKATER_STATS

    def goalie_summary(self, cayenne_exp, sort, limit=-1):
        return GOALIE_STATS

    def team_summary(self, cayenne_exp, sort, limit=-1):
        return TEAM_SUMMARY


def test_team_display_name_prefers_common_name_then_falls_back_to_name_then_abbrev():
    assert team_display_name({"abbrev": "TOR", "commonName": {"default": "Maple Leafs"}}) == "Maple Leafs"
    assert team_display_name({"abbrev": "TOR", "name": {"default": "Maple Leafs"}}) == "Maple Leafs"
    assert team_display_name({"abbrev": "TOR"}) == "TOR"


def test_build_all_team_rosters_merges_roster_identity_with_season_stats():
    rosters = build_all_team_rosters(FakeClient(), ["TOR", "NSH"], 20262027)

    tor_skaters, tor_goalies = rosters["TOR"]
    assert len(tor_skaters) == 1
    assert isinstance(tor_skaters[0], RosterSkater)
    assert tor_skaters[0].name == "Auston Matthews"
    assert tor_skaters[0].points == 3
    assert tor_skaters[0].goals == 2
    assert tor_skaters[0].plus_minus == -1
    assert tor_skaters[0].avg_toi == "17:05"

    assert len(tor_goalies) == 1
    assert isinstance(tor_goalies[0], RosterGoalie)
    assert tor_goalies[0].name == "Joseph Woll"
    assert tor_goalies[0].save_pct == 0.955
    assert tor_goalies[0].shutouts == 1

    nsh_skaters, nsh_goalies = rosters["NSH"]
    assert nsh_skaters == []
    assert nsh_goalies == []


def test_build_all_team_rosters_defaults_stats_to_zero_for_players_without_recorded_games():
    class NoStatsClient(FakeClient):
        def skater_summary(self, cayenne_exp, sort, limit=-1):
            return []

        def goalie_summary(self, cayenne_exp, sort, limit=-1):
            return []

    skaters, goalies = build_all_team_rosters(NoStatsClient(), ["TOR"], 20262027)["TOR"]

    assert skaters[0].games_played == 0
    assert skaters[0].points == 0
    assert skaters[0].plus_minus == 0
    assert skaters[0].avg_toi == "0:00"
    assert goalies[0].games_played == 0
    assert goalies[0].save_pct == 0.0
    assert goalies[0].shutouts == 0


def test_build_all_team_season_stats_returns_stats_per_team():
    stats = build_all_team_season_stats(FakeClient(), ["TOR", "NSH"], 20262027)

    assert isinstance(stats["TOR"], SeasonStats)
    assert stats["TOR"].goals_for == 2
    assert stats["TOR"].goals_against == 5
    assert stats["TOR"].goal_differential == -3
    assert stats["TOR"].penalty_kill_pct == 0.666667

    # NSH has no row in team_summary's output -> None, not a KeyError
    assert stats["NSH"] is None


def test_build_all_team_season_stats_skips_abbrevs_missing_from_standings():
    stats = build_all_team_season_stats(FakeClient(), ["TOR", "UNKNOWN"], 20262027)

    assert "TOR" in stats
    assert "UNKNOWN" not in stats
