from morning_hockey.playoffs import PlayoffBracket, build_bracket
from morning_hockey.standings import Conference, Division, StandingsPage, StandingsRow


def _row(abbrev, division_rank, wildcard_rank, points, qualified=True):
    return StandingsRow(
        division_rank=division_rank,
        wildcard_rank=wildcard_rank,
        abbrev=abbrev,
        name=abbrev.title(),
        logo=f"https://assets.nhle.com/logos/nhl/svg/{abbrev}_light.svg",
        games_played=10,
        wins=6,
        losses=3,
        ot_losses=1,
        points=points,
        goal_differential=5,
        qualified=qualified,
    )


# Central leader (COL, 40 pts) has MORE points than Pacific leader (VGK, 35 pts),
# so Central is the "strong" division: it should face the weaker wild card (WC2).
CENTRAL = Division(
    name="Central",
    conference="Western",
    rows=[
        _row("COL", 1, 0, 40),
        _row("DAL", 2, 0, 32),
        _row("MIN", 3, 0, 30),
        _row("NSH", 4, 2, 20),
    ],
)
PACIFIC = Division(
    name="Pacific",
    conference="Western",
    rows=[
        _row("VGK", 1, 0, 35),
        _row("VAN", 2, 0, 31),
        _row("EDM", 3, 0, 29),
        _row("CGY", 4, 1, 22),
    ],
)

STANDINGS_PAGE = StandingsPage(
    as_of_date="2026-12-01",
    divisions=[CENTRAL, PACIFIC],
    conferences=[
        Conference(
            name="Western",
            # wc1 (better record) = CGY, wc2 (weaker) = NSH
            wildcard_race=[_row("CGY", 4, 1, 22), _row("NSH", 4, 2, 20)],
        )
    ],
)


def test_build_bracket_pairs_stronger_division_leader_with_weaker_wildcard():
    bracket = build_bracket(STANDINGS_PAGE)

    assert isinstance(bracket, PlayoffBracket)
    assert bracket.as_of_date == "2026-12-01"
    assert len(bracket.conferences) == 1

    western = bracket.conferences[0]
    assert western.name == "Western"
    assert len(western.round1) == 4

    # Central (more points) is the strong division: faces WC2 (the weaker wild card, NSH)
    strong_matchup = western.round1[0]
    assert strong_matchup.higher_seed.abbrev == "COL"
    assert strong_matchup.higher_seed_label == "Central 1"
    assert strong_matchup.lower_seed.abbrev == "NSH"
    assert strong_matchup.lower_seed_label == "Villikortti 2"

    # Central's 2 vs 3
    assert western.round1[1].higher_seed.abbrev == "DAL"
    assert western.round1[1].lower_seed.abbrev == "MIN"

    # Pacific (fewer points) is the weak division: faces WC1 (the stronger wild card, CGY)
    weak_matchup = western.round1[2]
    assert weak_matchup.higher_seed.abbrev == "VGK"
    assert weak_matchup.higher_seed_label == "Pacific 1"
    assert weak_matchup.lower_seed.abbrev == "CGY"
    assert weak_matchup.lower_seed_label == "Villikortti 1"

    # Pacific's 2 vs 3
    assert western.round1[3].higher_seed.abbrev == "VAN"
    assert western.round1[3].lower_seed.abbrev == "EDM"

    assert [row.abbrev for row in western.wildcard_race] == ["CGY", "NSH"]
