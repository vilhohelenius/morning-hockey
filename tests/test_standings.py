from morning_hockey.standings import StandingsPage, is_qualified, build_standings


def _team(
    conference,
    division,
    div_seq,
    wc_seq,
    abbrev,
    points,
    goal_diff=0,
    date="2026-09-29",
):
    return {
        "conferenceName": conference,
        "divisionName": division,
        "divisionSequence": div_seq,
        "wildcardSequence": wc_seq,
        "teamAbbrev": {"default": abbrev},
        "teamCommonName": {"default": abbrev.title()},
        "teamLogo": f"https://assets.nhle.com/logos/nhl/svg/{abbrev}_light.svg",
        "gamesPlayed": 1,
        "wins": 1 if points else 0,
        "losses": 0 if points else 1,
        "otLosses": 0,
        "points": points,
        "goalDifferential": goal_diff,
        "date": date,
    }


STANDINGS = {
    "standings": [
        # Central: 4 teams, top 3 auto-qualify, 4th feeds the wild-card race
        _team("Western", "Central", 1, 0, "COL", 2),
        _team("Western", "Central", 2, 0, "DAL", 2),
        _team("Western", "Central", 3, 0, "MIN", 2),
        _team("Western", "Central", 4, 2, "NSH", 0),
        # Pacific: 4 teams, top 3 auto-qualify, 4th is also in the wild-card race
        _team("Western", "Pacific", 1, 0, "VGK", 2),
        _team("Western", "Pacific", 2, 0, "VAN", 2),
        _team("Western", "Pacific", 3, 0, "EDM", 2),
        _team("Western", "Pacific", 4, 1, "CGY", 1),
    ]
}


class FakeClient:
    def standings(self):
        return STANDINGS


def test_is_qualified_top_three_or_top_two_wildcard():
    assert is_qualified(1, 0) is True
    assert is_qualified(3, 0) is True
    assert is_qualified(4, 1) is True
    assert is_qualified(4, 2) is True
    assert is_qualified(4, 3) is False


def test_build_standings_groups_divisions_and_ranks_wildcard_race():
    page = build_standings(FakeClient())

    assert isinstance(page, StandingsPage)
    assert page.as_of_date == "2026-09-29"

    division_names = [d.name for d in page.divisions]
    assert division_names == ["Central", "Pacific"]

    central = next(d for d in page.divisions if d.name == "Central")
    assert [row.abbrev for row in central.rows] == ["COL", "DAL", "MIN", "NSH"]
    assert central.rows[0].qualified is True
    assert central.rows[-1].qualified is True  # NSH: wildcard_rank 2

    assert len(page.conferences) == 1
    western = page.conferences[0]
    assert western.name == "Western"
    # wild-card race ranked across the whole conference, CGY (wc1) ahead of NSH (wc2)
    assert [row.abbrev for row in western.wildcard_race] == ["CGY", "NSH"]
    assert western.wildcard_race[0].qualified is True
    assert western.wildcard_race[1].qualified is True
