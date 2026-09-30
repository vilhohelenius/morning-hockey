import datetime as dt

from morning_hockey.d1_sync import D1Client, sync_schedule
from morning_hockey.models import TeamInfo
from morning_hockey.schedule import HELSINKI, ScheduleDay, ScheduleGame, SchedulePage


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self):
        self.calls = []

    def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return FakeResponse({"success": True, "result": []})


def test_d1_client_posts_sql_and_params_with_bearer_auth():
    session = FakeSession()
    client = D1Client("acc123", "db456", "token789", session=session)

    client.execute("SELECT 1 WHERE ? = ?", [1, 1])

    assert len(session.calls) == 1
    call = session.calls[0]
    assert call["url"] == "https://api.cloudflare.com/client/v4/accounts/acc123/d1/database/db456/query"
    assert call["headers"] == {"Authorization": "Bearer token789"}
    assert call["json"] == {"sql": "SELECT 1 WHERE ? = ?", "params": [1, 1]}


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
