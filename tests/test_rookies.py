from morning_hockey.rookies import _age_on_cutoff, _is_candidate, _is_rookie, build_rookie_top

SEASON_ID = 20262027  # 2026-2027 season


def test_age_on_cutoff_uses_september_15_of_the_season_start_year():
    # born 1999-09-16: turns 27 the day *after* the cutoff, so is still 26 on it
    assert _age_on_cutoff("1999-09-16", SEASON_ID) == 26
    # born 1999-09-15: turns 27 exactly on the cutoff
    assert _age_on_cutoff("1999-09-15", SEASON_ID) == 27


def test_is_candidate_requires_a_recent_first_season():
    assert _is_candidate({"firstSeasonForGameType": 20262027}, SEASON_ID) is True
    assert _is_candidate({"firstSeasonForGameType": 20242025}, SEASON_ID) is True  # 2 seasons back
    assert _is_candidate({"firstSeasonForGameType": 20232024}, SEASON_ID) is False  # 3 seasons back
    assert _is_candidate({"firstSeasonForGameType": None}, SEASON_ID) is False


def _landing(birth_date="2003-01-01", season_totals=None):
    return {"birthDate": birth_date, "seasonTotals": season_totals or []}


def test_is_rookie_true_for_a_player_with_no_prior_nhl_seasons():
    assert _is_rookie(_landing(), SEASON_ID) is True


def test_is_rookie_true_for_a_cup_of_coffee_call_up():
    # played 5 games last season -- under the 6-game threshold, still a rookie
    landing = _landing(
        season_totals=[
            {"leagueAbbrev": "NHL", "gameTypeId": 2, "season": 20252026, "gamesPlayed": 5},
        ]
    )
    assert _is_rookie(landing, SEASON_ID) is True


def test_is_rookie_false_after_more_than_25_games_in_one_prior_season():
    landing = _landing(
        season_totals=[
            {"leagueAbbrev": "NHL", "gameTypeId": 2, "season": 20252026, "gamesPlayed": 26},
        ]
    )
    assert _is_rookie(landing, SEASON_ID) is False


def test_is_rookie_false_after_two_separate_six_game_seasons():
    landing = _landing(
        season_totals=[
            {"leagueAbbrev": "NHL", "gameTypeId": 2, "season": 20242025, "gamesPlayed": 6},
            {"leagueAbbrev": "NHL", "gameTypeId": 2, "season": 20252026, "gamesPlayed": 6},
        ]
    )
    assert _is_rookie(landing, SEASON_ID) is False


def test_is_rookie_ignores_non_nhl_and_current_season_entries():
    landing = _landing(
        season_totals=[
            {"leagueAbbrev": "AHL", "gameTypeId": 2, "season": 20252026, "gamesPlayed": 60},
            {"leagueAbbrev": "NHL", "gameTypeId": 3, "season": 20252026, "gamesPlayed": 20},  # playoffs
            {"leagueAbbrev": "NHL", "gameTypeId": 2, "season": SEASON_ID, "gamesPlayed": 10},  # this season
        ]
    )
    assert _is_rookie(landing, SEASON_ID) is True


def test_is_rookie_false_when_26_or_older_on_cutoff():
    landing = _landing(birth_date="1999-01-01")
    assert _is_rookie(landing, SEASON_ID) is False


ALL_SKATERS = [
    {
        "playerId": 1,
        "skaterFullName": "Rookie One",
        "currentTeamAbbrev": "CHI",
        "nationalityCode": "USA",
        "positionCode": "C",
        "gamesPlayed": 5,
        "goals": 3,
        "assists": 4,
        "points": 7,
        "firstSeasonForGameType": SEASON_ID,
    },
    {
        "playerId": 2,
        "skaterFullName": "Veteran Two",
        "currentTeamAbbrev": "CHI",
        "nationalityCode": "CAN",
        "positionCode": "D",
        "gamesPlayed": 5,
        "goals": 1,
        "assists": 1,
        "points": 2,
        "firstSeasonForGameType": 20182019,  # debuted long ago -- filtered out before any landing() call
    },
    {
        "playerId": 3,
        "skaterFullName": "Rookie Three",
        "currentTeamAbbrev": "FLA",
        "nationalityCode": "FIN",
        "positionCode": "D",
        "gamesPlayed": 5,
        "goals": 0,
        "assists": 9,
        "points": 9,
        "firstSeasonForGameType": SEASON_ID,
    },
]

LANDINGS = {
    1: _landing(),
    3: _landing(),
}


class FakeClient:
    def skater_bios(self, cayenne_exp, sort, limit=-1):
        return ALL_SKATERS

    def player_landing(self, player_id):
        if player_id not in LANDINGS:
            raise AssertionError(f"player_landing() should not be called for non-candidate {player_id}")
        return LANDINGS[player_id]


def test_build_rookie_top_skips_non_candidates_and_sorts_rookies_by_points():
    rookies = build_rookie_top(FakeClient(), SEASON_ID)

    assert [r.name for r in rookies] == ["Rookie Three", "Rookie One"]
    assert rookies[0].points == 9
