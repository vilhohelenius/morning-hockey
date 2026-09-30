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


def _game(game_id, away, home, away_score, home_score, state="OFF", final_type="REG"):
    # Real /schedule/{date} responses don't repeat the date on each game the
    # way club-schedule-season does — only the enclosing day dict has it.
    return {
        "id": game_id,
        "gameType": 2,
        "gameState": state,
        "gameOutcome": {"lastPeriodType": final_type},
        "awayTeam": {"abbrev": away, "commonName": {"default": away}, "logo": f"{away}.svg", "score": away_score},
        "homeTeam": {"abbrev": home, "commonName": {"default": home}, "logo": f"{home}.svg", "score": home_score},
    }


# Two weeks back, "now", and one week forward, as build_team_snapshots walks
# previousStartDate/nextStartDate from the "now" response.
WEEK_MINUS_2 = {
    "previousStartDate": None,
    "nextStartDate": "2026-09-15",
    "gameWeek": [{"date": "2026-09-08", "games": [_game(1, "CHI", "MIN", 1, 4)]}],
}
WEEK_MINUS_1 = {
    "previousStartDate": "2026-09-08",
    "nextStartDate": "2026-09-22",
    "gameWeek": [{"date": "2026-09-15", "games": [_game(2, "TOR", "CHI", 2, 5)]}],
}
WEEK_NOW = {
    "previousStartDate": "2026-09-15",
    "nextStartDate": "2026-09-29",
    "gameWeek": [
        {
            "date": "2026-09-22",
            "games": [
                # not involving CHI at all — should never leak into CHI's snapshot
                _game(3, "TOR", "MTL", 3, 1),
                _game(4, "CHI", "VGK", 2, 3, final_type="OT"),
            ],
        }
    ],
}
WEEK_PLUS_1 = {
    "previousStartDate": "2026-09-22",
    "nextStartDate": "2026-10-06",
    "gameWeek": [{"date": "2026-09-29", "games": [_game(5, "UTA", "CHI", None, None, state="FUT")]}],
}

SCHEDULE_BY_DATE = {
    "now": WEEK_NOW,
    "2026-09-15": WEEK_MINUS_1,
    "2026-09-08": WEEK_MINUS_2,
    "2026-09-29": WEEK_PLUS_1,
}


class FakeClient:
    def __init__(self):
        self.schedule_calls = []

    def skater_bios(self, cayenne_exp, sort, limit=-1):
        return SKATER_STATS

    def goalie_summary(self, cayenne_exp, sort, limit=-1):
        return GOALIE_STATS

    def schedule(self, date="now"):
        self.schedule_calls.append(date)
        return SCHEDULE_BY_DATE[date]


def test_build_team_snapshots_ranks_top_scorers_and_starting_goalie():
    client = FakeClient()
    snapshots = build_team_snapshots(client, ["CHI"], 20262027)

    # only 4 schedule calls total (now + 2 back + 1 forward), never one per team
    assert client.schedule_calls == ["now", "2026-09-15", "2026-09-08", "2026-09-29"]

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

    # 3 played CHI games across the merged weeks, newest first; the TOR@MTL
    # game that doesn't involve CHI never shows up
    assert [r.result for r in snap.recent_results] == ["OTL", "W", "L"]
    assert [r.opponent_abbrev for r in snap.recent_results] == ["VGK", "TOR", "MIN"]

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


def test_build_team_snapshots_stops_walking_when_previous_or_next_start_date_is_missing():
    class NoMoreWeeksClient(FakeClient):
        def schedule(self, date="now"):
            self.schedule_calls.append(date)
            payload = dict(SCHEDULE_BY_DATE[date])
            payload["previousStartDate"] = None
            payload["nextStartDate"] = None
            return payload

    client = NoMoreWeeksClient()
    build_team_snapshots(client, ["CHI"], 20262027)

    # only the "now" week fetched; both walks stop immediately since the
    # first response already reports no further weeks in either direction
    assert client.schedule_calls == ["now"]
