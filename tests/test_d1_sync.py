import datetime as dt

from morning_hockey.d1_sync import (
    D1Client,
    sync_digest,
    sync_finnish_goalies,
    sync_finnish_skaters,
    sync_goalie_stats,
    sync_rookie_stats,
    sync_schedule,
    sync_skater_stats,
    sync_standings,
    sync_team_rosters,
    sync_team_season_stats,
)
from morning_hockey.league_stats import GoalieStatRow, SkaterStatRow
from morning_hockey.models import Digest, GameResult, GoalieLine, ScorerLine, TeamInfo
from morning_hockey.team import RosterGoalie, RosterSkater, SeasonStats
from morning_hockey.schedule import HELSINKI, ScheduleDay, ScheduleGame, SchedulePage
from morning_hockey.standings import Conference, Division, StandingsPage, StandingsRow
from morning_hockey.suomiporssi import GoalieLeaderboardRow, LeaderboardRow


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.ok = status_code < 400
        self.text = str(payload)

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, response=None):
        self.calls = []
        self._response = response or FakeResponse({"success": True, "result": []})

    def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return self._response


def test_d1_client_posts_sql_and_params_with_bearer_auth():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    client.execute("SELECT 1 WHERE ? = ?", [1, 1])

    assert len(session.calls) == 1
    call = session.calls[0]
    assert call["url"] == "https://api.cloudflare.com/client/v4/accounts/acc123/d1/database/db456/query"
    assert call["headers"] == {"Authorization": "Bearer token789"}
    assert call["json"] == {"sql": "SELECT 1 WHERE ? = ?", "params": [1, 1]}


def test_d1_client_surfaces_the_response_body_on_failure():
    error_body = {"success": False, "errors": [{"code": 7500, "message": "no such table: games"}]}
    session = FakeSession(response=FakeResponse(error_body, status_code=400))
    client = D1Client("acc123", "db456", "token789", session=session)

    try:
        client.execute("INSERT INTO games VALUES (?)", [1])
        assert False, "expected RuntimeError"
    except RuntimeError as error:
        assert "400" in str(error)
        assert "no such table: games" in str(error)


PAGE = SchedulePage(
    as_of_date="2026-01-15",
    days=[
        ScheduleDay(
            date="2026-01-15",
            games=[
                ScheduleGame(
                    game_id=1,
                    away=TeamInfo(abbrev="FLA", name="Panthers", logo="fla.svg", score=3),
                    home=TeamInfo(abbrev="TOR", name="Maple Leafs", logo="tor.svg", score=2),
                    start_local=dt.datetime(2026, 1, 15, 20, 0, tzinfo=HELSINKI),
                    game_state="OFF",
                    is_finished=True,
                    final_type="OT",
                )
            ],
        ),
        ScheduleDay(
            date="2026-01-16",
            games=[
                ScheduleGame(
                    game_id=2,
                    away=TeamInfo(abbrev="BOS", name="Bruins", logo="bos.svg", score=0),
                    home=TeamInfo(abbrev="NYR", name="Rangers", logo="nyr.svg", score=0),
                    start_local=dt.datetime(2026, 1, 16, 2, 0, tzinfo=HELSINKI),
                    game_state="FUT",
                    is_finished=False,
                    final_type="REG",
                )
            ],
        ),
    ],
)


def test_sync_schedule_upserts_every_game_across_every_day():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    count = sync_schedule(client, PAGE)

    assert count == 2
    assert len(session.calls) == 2

    first_params = session.calls[0]["json"]["params"]
    assert first_params[0] == 1  # game_id
    assert first_params[1] == "2026-01-15"  # day date
    assert first_params[3] == "FLA"
    assert first_params[6] == 3  # away_score
    assert first_params[11] == "OFF"
    assert first_params[12] == 1  # is_finished -> 1
    assert first_params[13] == "OT"  # final_type

    second_params = session.calls[1]["json"]["params"]
    assert second_params[0] == 2
    assert second_params[12] == 0  # is_finished -> 0 (still FUT)


def test_sync_schedule_converts_start_local_to_utc_iso8601():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    sync_schedule(client, PAGE)

    # 20:00 Helsinki (winter, UTC+2) -> 18:00 UTC
    start_time_utc = session.calls[0]["json"]["params"][2]
    assert start_time_utc == "2026-01-15T18:00:00+00:00"


SKATER = SkaterStatRow(
    player_id=1,
    name="Connor McDavid",
    team="EDM",
    logo="edm.svg",
    headshot="mcdavid.png",
    nationality="CAN",
    position="C",
    games_played=1,
    goals=1,
    assists=2,
    points=3,
)

GOALIE = GoalieStatRow(
    player_id=2,
    name="Jeremy Swayman",
    team="BOS",
    logo="bos.svg",
    headshot="swayman.png",
    nationality="USA",
    games_played=1,
    wins=1,
    losses=0,
    ot_losses=0,
    goals_against_average=1.5,
    save_pct=0.955,
    shutouts=0,
)


def test_sync_skater_stats_deletes_then_reinserts_every_row():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    count = sync_skater_stats(client, [SKATER], 20262027)

    assert count == 1
    assert len(session.calls) == 2
    assert session.calls[0]["json"]["sql"] == "DELETE FROM skater_season_stats"
    insert_params = session.calls[1]["json"]["params"]
    assert insert_params[0] == 1  # player_id
    assert insert_params[1] == 20262027  # season_id
    assert insert_params[2] == "Connor McDavid"
    assert insert_params[-1] is not None  # updated_at


def test_sync_goalie_stats_deletes_then_reinserts_every_row():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    count = sync_goalie_stats(client, [GOALIE], 20262027)

    assert count == 1
    assert session.calls[0]["json"]["sql"] == "DELETE FROM goalie_season_stats"
    insert_params = session.calls[1]["json"]["params"]
    assert insert_params[0] == 2
    assert insert_params[2] == "Jeremy Swayman"
    assert insert_params[11] == 1.5  # goals_against_average
    assert insert_params[12] == 0.955  # save_pct


def test_sync_rookie_stats_reuses_the_skater_shape_into_its_own_table():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    count = sync_rookie_stats(client, [SKATER], 20262027)

    assert count == 1
    assert session.calls[0]["json"]["sql"] == "DELETE FROM rookie_season_stats"
    assert session.calls[1]["json"]["params"][2] == "Connor McDavid"


FIN_SKATER = LeaderboardRow(
    player_id=3,
    name="Mikko Rantanen",
    team="DAL",
    logo="dal.svg",
    headshot="rantanen.png",
    position="R",
    games_played=1,
    goals=1,
    assists=1,
    points=2,
)

FIN_GOALIE = GoalieLeaderboardRow(
    player_id=4,
    name="Juuse Saros",
    team="NSH",
    logo="nsh.svg",
    headshot="saros.png",
    games_played=1,
    wins=1,
    losses=0,
    ot_losses=0,
    goals_against_average=2.0,
    save_pct=0.930,
    shutouts=0,
)


def test_sync_finnish_skaters_deletes_then_reinserts_every_row():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    count = sync_finnish_skaters(client, [FIN_SKATER], 20262027)

    assert count == 1
    assert session.calls[0]["json"]["sql"] == "DELETE FROM finnish_skater_stats"
    insert_params = session.calls[1]["json"]["params"]
    assert insert_params[0] == 3  # player_id
    assert insert_params[1] == 20262027  # season_id
    assert insert_params[2] == "Mikko Rantanen"
    assert insert_params[3] == "DAL"  # team_abbrev


def test_sync_finnish_goalies_deletes_then_reinserts_every_row():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    count = sync_finnish_goalies(client, [FIN_GOALIE], 20262027)

    assert count == 1
    assert session.calls[0]["json"]["sql"] == "DELETE FROM finnish_goalie_stats"
    insert_params = session.calls[1]["json"]["params"]
    assert insert_params[0] == 4
    assert insert_params[2] == "Juuse Saros"
    assert insert_params[10] == 2.0  # goals_against_average
    assert insert_params[11] == 0.930  # save_pct


STANDINGS_PAGE = StandingsPage(
    as_of_date="2026-09-30",
    divisions=[
        Division(
            name="Central",
            conference="Western",
            rows=[
                StandingsRow(
                    division_rank=1,
                    wildcard_rank=0,
                    abbrev="CHI",
                    name="Blackhawks",
                    logo="chi.svg",
                    games_played=1,
                    wins=1,
                    losses=0,
                    ot_losses=0,
                    points=2,
                    goal_differential=1,
                    qualified=True,
                )
            ],
        )
    ],
    conferences=[Conference(name="Western", wildcard_race=[])],
)


def test_sync_standings_upserts_one_row_per_team_with_division_context():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    count = sync_standings(client, STANDINGS_PAGE)

    assert count == 1
    params = session.calls[0]["json"]["params"]
    assert params[0] == "CHI"  # abbrev
    assert params[1] == "2026-09-30"  # as_of_date
    assert params[4] == "Western"  # conference, from the Division wrapper
    assert params[5] == "Central"  # division
    assert params[8] == 1  # qualified -> 1


DIGEST = Digest(
    date="2026-09-30",
    generated_at="2026-09-30T06:00:00+00:00",
    games=[
        GameResult(
            game_id=1,
            away=TeamInfo(abbrev="CAR", name="Hurricanes", logo="car.svg", score=3),
            home=TeamInfo(abbrev="NYR", name="Rangers", logo="nyr.svg", score=2),
            final_type="OT",
            scorers=[ScorerLine(name="Sebastian Aho", team="CAR", goals=2, assists=1)],
            goalies=[
                GoalieLine(
                    name="Juuse Saros",
                    team="CAR",
                    decision="W",
                    saves=28,
                    shots_against=30,
                    save_pct=0.933,
                    toi="60:00",
                )
            ],
        )
    ],
)


def test_sync_digest_upserts_the_digest_row_and_each_game():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    count = sync_digest(client, DIGEST)

    assert count == 1
    calls = session.calls
    assert calls[0]["json"]["sql"].startswith("\nINSERT INTO digests")
    assert calls[0]["json"]["params"] == ["2026-09-30", "2026-09-30T06:00:00+00:00"]

    game_params = calls[1]["json"]["params"]
    assert game_params[0] == 1  # game_id
    assert game_params[1] == "2026-09-30"  # digest_date
    assert game_params[2] == "CAR"  # away_abbrev
    assert game_params[10] == "OT"  # final_type


def test_sync_digest_deletes_then_reinserts_scorers_and_goalies_per_game():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    sync_digest(client, DIGEST)

    calls = session.calls
    assert calls[2]["json"]["sql"] == "DELETE FROM digest_scorers WHERE game_id = ?"
    assert calls[2]["json"]["params"] == [1]
    scorer_params = calls[3]["json"]["params"]
    assert scorer_params == [1, "Sebastian Aho", "CAR", 2, 1]

    assert calls[4]["json"]["sql"] == "DELETE FROM digest_goalies WHERE game_id = ?"
    assert calls[4]["json"]["params"] == [1]
    goalie_params = calls[5]["json"]["params"]
    assert goalie_params == [1, "Juuse Saros", "CAR", "W", 28, 30, 0.933, "60:00"]


ROSTER_SKATER = RosterSkater(
    player_id=5,
    name="Connor Bedard",
    position="C",
    nationality="CAN",
    sweater_number=98,
    headshot="bedard.png",
    games_played=6,
    goals=5,
    assists=4,
    points=9,
    plus_minus=-2,
    avg_toi_seconds=1080.0,
    avg_toi="18:00",
)

ROSTER_GOALIE = RosterGoalie(
    player_id=6,
    name="Petr Mrazek",
    nationality="CZE",
    sweater_number=34,
    headshot="mrazek.png",
    games_played=3,
    wins=1,
    losses=2,
    ot_losses=0,
    goals_against_average=3.2,
    save_pct=0.889,
    shutouts=1,
)


def test_sync_team_rosters_replaces_the_whole_table_across_every_team():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    skater_count, goalie_count = sync_team_rosters(
        client, {"CHI": ([ROSTER_SKATER], [ROSTER_GOALIE]), "TOR": ([], [])}
    )

    assert skater_count == 1
    assert goalie_count == 1
    assert session.calls[0]["json"]["sql"] == "DELETE FROM team_roster_skaters"
    assert session.calls[1]["json"]["sql"] == "DELETE FROM team_roster_goalies"

    skater_params = session.calls[2]["json"]["params"]
    assert skater_params[0] == 5  # player_id
    assert skater_params[1] == "CHI"  # team_abbrev
    assert skater_params[4] == "CAN"  # nationality
    assert skater_params[5] == 98  # sweater_number

    goalie_params = session.calls[3]["json"]["params"]
    assert goalie_params[0] == 6
    assert goalie_params[1] == "CHI"
    assert goalie_params[3] == "CZE"  # nationality
    assert goalie_params[11] == 0.889  # save_pct
    assert goalie_params[12] == 1  # shutouts


SEASON_STATS = SeasonStats(
    games_played=7,
    goals_for=25,
    goals_against=20,
    goal_differential=5,
    power_play_pct=0.22,
    penalty_kill_pct=0.81,
    faceoff_pct=0.51,
    shots_for_per_game=31.4,
    shots_against_per_game=28.9,
    shutouts=1,
)


def test_sync_team_season_stats_upserts_and_skips_missing_teams():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    count = sync_team_season_stats(client, {"CHI": SEASON_STATS, "TOR": None})

    assert count == 1
    assert len(session.calls) == 1
    params = session.calls[0]["json"]["params"]
    assert params[0] == "CHI"
    assert params[4] == 0.22  # power_play_pct
    assert params[9] == 1  # shutouts
