from morning_hockey.team import (
    RosterGoalie,
    RosterSkater,
    TeamPage,
    build_team_page,
    game_result,
    split_schedule,
    team_display_name,
)

STANDINGS = {
    "standings": [
        {
            "teamAbbrev": {"default": "CHI"},
            "teamCommonName": {"default": "Blackhawks"},
            "teamName": {"default": "Chicago Blackhawks"},
            "teamLogo": "https://assets.nhle.com/logos/nhl/svg/CHI_light.svg",
            "divisionAbbrev": "C",
            "divisionName": "Central",
            "divisionSequence": 2,
            "gamesPlayed": 1,
            "wins": 0,
            "losses": 1,
            "otLosses": 0,
            "points": 0,
            "streakCode": "L",
            "streakCount": 1,
        },
        {
            "teamAbbrev": {"default": "NSH"},
            "teamCommonName": {"default": "Predators"},
            "teamName": {"default": "Nashville Predators"},
            "teamLogo": "https://assets.nhle.com/logos/nhl/svg/NSH_light.svg",
            "divisionAbbrev": "C",
            "divisionName": "Central",
            "divisionSequence": 1,
            "gamesPlayed": 1,
            "wins": 1,
            "losses": 0,
            "otLosses": 0,
            "points": 2,
            "streakCode": "W",
            "streakCount": 1,
        },
        {
            "teamAbbrev": {"default": "TOR"},
            "teamCommonName": {"default": "Maple Leafs"},
            "teamName": {"default": "Toronto Maple Leafs"},
            "teamLogo": "https://assets.nhle.com/logos/nhl/svg/TOR_light.svg",
            "divisionAbbrev": "A",
            "divisionName": "Atlantic",
            "divisionSequence": 1,
            "gamesPlayed": 1,
            "wins": 1,
            "losses": 0,
            "otLosses": 0,
            "points": 2,
            "streakCode": "W",
            "streakCount": 1,
        },
    ]
}

SCHEDULE = {
    "games": [
        {
            "id": 1,
            "gameType": 1,
            "gameDate": "2026-09-20",
            "gameState": "OFF",
            "awayTeam": {"abbrev": "CHI", "commonName": {"default": "Blackhawks"}, "logo": "chi.svg", "score": 5},
            "homeTeam": {"abbrev": "MIN", "commonName": {"default": "Wild"}, "logo": "min.svg", "score": 1},
        },
        {
            "id": 2,
            "gameType": 2,
            "gameDate": "2026-09-29",
            "gameState": "OFF",
            "gameOutcome": {"lastPeriodType": "REG"},
            "awayTeam": {"abbrev": "CHI", "commonName": {"default": "Blackhawks"}, "logo": "chi.svg", "score": 2},
            "homeTeam": {"abbrev": "VGK", "commonName": {"default": "Golden Knights"}, "logo": "vgk.svg", "score": 5},
        },
        {
            "id": 3,
            "gameType": 2,
            "gameDate": "2026-10-01",
            "gameState": "FUT",
            "awayTeam": {"abbrev": "UTA", "commonName": {"default": "Mammoth"}, "logo": "uta.svg", "score": None},
            "homeTeam": {"abbrev": "CHI", "commonName": {"default": "Blackhawks"}, "logo": "chi.svg", "score": None},
        },
    ]
}

ROSTER = {
    "forwards": [
        {
            "id": 1,
            "firstName": {"default": "Tyler"},
            "lastName": {"default": "Bertuzzi"},
            "positionCode": "L",
            "sweaterNumber": 59,
            "headshot": "https://assets.nhle.com/mugs/nhl/20262027/CHI/1.png",
        }
    ],
    "defensemen": [],
    "goalies": [
        {
            "id": 2,
            "firstName": {"default": "Spencer"},
            "lastName": {"default": "Knight"},
            "positionCode": "G",
            "sweaterNumber": 30,
            "headshot": "https://assets.nhle.com/mugs/nhl/20262027/CHI/2.png",
        }
    ],
}


SKATER_STATS = [
    {
        "playerId": 1,
        "gamesPlayed": 1,
        "goals": 2,
        "assists": 1,
        "points": 3,
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
    }
]


class FakeClient:
    def standings(self):
        return STANDINGS

    def club_schedule_season(self, team_abbrev):
        return SCHEDULE

    def roster(self, team_abbrev):
        return ROSTER

    def skater_bios(self, cayenne_exp, sort, limit=-1):
        return SKATER_STATS

    def goalie_summary(self, cayenne_exp, sort, limit=-1):
        return GOALIE_STATS


def test_game_result_classifies_wins_losses_and_ot_losses():
    assert game_result(3, 1, "REG") == "W"
    assert game_result(3, 5, "REG") == "L"
    assert game_result(2, 5, "OT") == "OTL"
    assert game_result(4, 1, "SO") == "W"


def test_build_team_page_assembles_division_schedule_and_roster():
    page = build_team_page(FakeClient(), "CHI", 20262027)

    assert isinstance(page, TeamPage)
    assert page.name == "Chicago Blackhawks"
    assert page.division_name == "Central"
    assert page.division_rank == 2

    # only the Central-division teams, sorted by division rank
    assert [row.abbrev for row in page.division_table] == ["NSH", "CHI"]
    assert page.division_table[1].is_team is True
    assert page.division_table[0].is_team is False

    # preseason (gameType 1) game is excluded; regular season split by state
    assert [g.game_id for g in page.recent_games] == [2]
    assert page.recent_games[0].result == "L"
    assert [g.game_id for g in page.upcoming_games] == [3]
    assert page.upcoming_games[0].opponent_abbrev == "UTA"

    assert len(page.skaters) == 1
    assert isinstance(page.skaters[0], RosterSkater)
    assert page.skaters[0].name == "Tyler Bertuzzi"
    assert page.skaters[0].points == 3
    assert page.skaters[0].goals == 2

    assert len(page.goalies) == 1
    assert isinstance(page.goalies[0], RosterGoalie)
    assert page.goalies[0].name == "Spencer Knight"
    assert page.goalies[0].save_pct == 0.955


def test_team_display_name_prefers_common_name_then_falls_back_to_name_then_abbrev():
    assert team_display_name({"abbrev": "CHI", "commonName": {"default": "Blackhawks"}}) == "Blackhawks"
    assert team_display_name({"abbrev": "CHI", "name": {"default": "Blackhawks"}}) == "Blackhawks"
    assert team_display_name({"abbrev": "CHI"}) == "CHI"


def test_split_schedule_ignores_games_that_do_not_involve_the_team():
    # A merged, league-wide games list (e.g. several weeks of the schedule
    # endpoint) contains plenty of games that have nothing to do with the
    # team being queried; only NSH's own games should come back.
    league_games = [
        {
            "id": 10,
            "gameType": 2,
            "gameDate": "2026-09-25",
            "gameState": "OFF",
            "gameOutcome": {"lastPeriodType": "REG"},
            "awayTeam": {"abbrev": "TOR", "commonName": {"default": "Maple Leafs"}, "logo": "tor.svg", "score": 3},
            "homeTeam": {"abbrev": "MTL", "commonName": {"default": "Canadiens"}, "logo": "mtl.svg", "score": 2},
        },
        {
            "id": 11,
            "gameType": 2,
            "gameDate": "2026-09-27",
            "gameState": "OFF",
            "gameOutcome": {"lastPeriodType": "REG"},
            "awayTeam": {"abbrev": "NSH", "commonName": {"default": "Predators"}, "logo": "nsh.svg", "score": 4},
            "homeTeam": {"abbrev": "DAL", "commonName": {"default": "Stars"}, "logo": "dal.svg", "score": 1},
        },
    ]

    recent, upcoming = split_schedule("NSH", league_games)

    assert [g.game_id for g in recent] == [11]
    assert recent[0].result == "W"
    assert upcoming == []


def test_build_team_page_defaults_stats_to_zero_for_players_without_recorded_games():
    class NoStatsClient(FakeClient):
        def skater_bios(self, cayenne_exp, sort, limit=-1):
            return []

        def goalie_summary(self, cayenne_exp, sort, limit=-1):
            return []

    page = build_team_page(NoStatsClient(), "CHI", 20262027)

    assert page.skaters[0].games_played == 0
    assert page.skaters[0].points == 0
    assert page.goalies[0].games_played == 0
    assert page.goalies[0].save_pct == 0.0
