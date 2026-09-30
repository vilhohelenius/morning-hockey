from morning_hockey.team_snapshot import TeamSnapshot, build_team_snapshots

# Pre-sorted as the real skater/bios query would return them (points DESC) —
# build_team_snapshots trusts that ordering rather than re-sorting locally.
SKATER_STATS = [
    {"playerId": 2, "skaterFullName": "Connor Bedard", "currentTeamAbbrev": "CHI", "goals": 2, "assists": 4, "points": 6},
    {"playerId": 1, "skaterFullName": "Tyler Bertuzzi", "currentTeamAbbrev": "CHI", "goals": 3, "assists": 2, "points": 5},
    {"playerId": 3, "skaterFullName": "Nazem Kadri", "currentTeamAbbrev": "CGY", "goals": 1, "assists": 1, "points": 2},
    {"playerId": 4, "skaterFullName": "Extra Skater", "currentTeamAbbrev": "CHI", "goals": 0, "assists": 1, "points": 1},
]

GOALIE_STATS = [
    {
        "playerId": 10,
        "goalieFullName": "Spencer Knight",
        "teamAbbrevs": "FLA,CHI",
        "gamesPlayed": 8,
        "savePct": 0.915,
    },
    {
        "playerId": 11,
        "goalieFullName": "Backup Goalie",
        "teamAbbrevs": "CHI",
        "gamesPlayed": 2,
        "savePct": 0.930,
    },
]

SCHEDULE = {
    "games": [
        {
            "id": 1,
            "gameType": 2,
            "gameDate": "2026-09-28",
            "gameState": "OFF",
            "gameOutcome": {"lastPeriodType": "REG"},
            "awayTeam": {"abbrev": "CHI", "commonName": {"default": "Blackhawks"}, "logo": "chi.svg", "score": 5},
            "homeTeam": {"abbrev": "MIN", "commonName": {"default": "Wild"}, "logo": "min.svg", "score": 1},
        },
        {
            "id": 2,
            "gameType": 2,
            "gameDate": "2026-09-30",
            "gameState": "OFF",
            "gameOutcome": {"lastPeriodType": "OT"},
            "awayTeam": {"abbrev": "CHI", "commonName": {"default": "Blackhawks"}, "logo": "chi.svg", "score": 2},
            "homeTeam": {"abbrev": "VGK", "commonName": {"default": "Golden Knights"}, "logo": "vgk.svg", "score": 3},
        },
        {
            "id": 3,
            "gameType": 2,
            "gameDate": "2026-10-02",
            "gameState": "FUT",
            "awayTeam": {"abbrev": "UTA", "commonName": {"default": "Mammoth"}, "logo": "uta.svg", "score": None},
            "homeTeam": {"abbrev": "CHI", "commonName": {"default": "Blackhawks"}, "logo": "chi.svg", "score": None},
        },
    ]
}


class FakeClient:
    def skater_bios(self, cayenne_exp, sort, limit=-1):
        return SKATER_STATS

    def goalie_summary(self, cayenne_exp, sort, limit=-1):
        return GOALIE_STATS

    def club_schedule_season(self, team_abbrev):
        return SCHEDULE


def test_build_team_snapshots_ranks_top_scorers_and_starting_goalie():
    snapshots = build_team_snapshots(FakeClient(), ["CHI"], 20262027)

    assert set(snapshots) == {"CHI"}
    snap = snapshots["CHI"]
    assert isinstance(snap, TeamSnapshot)

    # top 3 by points, extra 4th skater excluded
    assert [s.name for s in snap.top_scorers] == ["Connor Bedard", "Tyler Bertuzzi", "Extra Skater"]
    assert snap.top_scorers[0].headshot == "https://assets.nhle.com/mugs/nhl/20262027/CHI/2.png"

    # most games played wins the presumed #1 goalie spot, not best save pct
    assert snap.starting_goalie.name == "Spencer Knight"
    assert snap.starting_goalie.games_played == 8
    assert snap.starting_goalie.headshot == "https://assets.nhle.com/mugs/nhl/20262027/CHI/10.png"

    # last 5 (here: 2) results, newest first, OT loss classified correctly
    assert [r.result for r in snap.recent_results] == ["OTL", "W"]
    assert [r.opponent_abbrev for r in snap.recent_results] == ["VGK", "MIN"]

    assert snap.next_game.opponent_abbrev == "UTA"


def test_build_team_snapshots_defaults_for_team_with_no_stats():
    class EmptyStatsClient(FakeClient):
        def skater_bios(self, cayenne_exp, sort, limit=-1):
            return []

        def goalie_summary(self, cayenne_exp, sort, limit=-1):
            return []

    snapshots = build_team_snapshots(EmptyStatsClient(), ["CHI"], 20262027)

    snap = snapshots["CHI"]
    assert snap.top_scorers == []
    assert snap.starting_goalie is None
