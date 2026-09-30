import requests

from morning_hockey.nhl_api import NHLClient


class FakeResponse:
    def __init__(self, status_code, payload=None, headers=None):
        self.status_code = status_code
        self._payload = payload
        self.headers = headers or {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.exceptions.HTTPError(f"{self.status_code} error")


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def get(self, url, params=None, timeout=None):
        self.calls += 1
        return self.responses.pop(0)


def _freeze_time(monkeypatch):
    """Mock out time.sleep (record calls, don't actually wait) and pin
    time.monotonic so _throttle()'s wait-time math is deterministic instead
    of depending on how fast the test happens to run."""
    sleeps = []
    monkeypatch.setattr("morning_hockey.nhl_api.time.sleep", lambda s: sleeps.append(s))
    monkeypatch.setattr("morning_hockey.nhl_api.time.monotonic", lambda: 0.0)
    return sleeps


def test_get_returns_json_on_first_success():
    session = FakeSession([FakeResponse(200, {"ok": True})])
    client = NHLClient(session=session)

    assert client._get("/standings/now") == {"ok": True}
    assert session.calls == 1


def test_get_retries_on_429_then_succeeds(monkeypatch):
    _freeze_time(monkeypatch)

    session = FakeSession([FakeResponse(429), FakeResponse(429), FakeResponse(200, {"ok": True})])
    client = NHLClient(session=session)

    assert client._get("/club-schedule-season/CAR/now") == {"ok": True}
    assert session.calls == 3


def test_get_honors_retry_after_header(monkeypatch):
    sleeps = _freeze_time(monkeypatch)

    session = FakeSession([FakeResponse(429, headers={"Retry-After": "3"}), FakeResponse(200, {"ok": True})])
    client = NHLClient(session=session)

    client._get("/standings/now")
    assert sleeps[0] == 3.0


def test_get_raises_after_exhausting_retries(monkeypatch):
    _freeze_time(monkeypatch)

    session = FakeSession([FakeResponse(429) for _ in range(10)])
    client = NHLClient(session=session)

    try:
        client._get("/standings/now")
        assert False, "expected HTTPError"
    except requests.exceptions.HTTPError:
        pass


def test_get_does_not_retry_non_retryable_errors(monkeypatch):
    _freeze_time(monkeypatch)

    session = FakeSession([FakeResponse(404)])
    client = NHLClient(session=session)

    try:
        client._get("/standings/now")
        assert False, "expected HTTPError"
    except requests.exceptions.HTTPError:
        pass
    assert session.calls == 1


def test_a_429_throttles_every_later_request_not_just_the_retry(monkeypatch):
    """A burst of many identical calls (e.g. one schedule request per team)
    needs to slow down as a whole once rate-limited, not just retry the one
    rejected request while the next one fires immediately after."""
    sleeps = _freeze_time(monkeypatch)

    session = FakeSession(
        [
            FakeResponse(429),  # first call: rate-limited, triggers throttling
            FakeResponse(200, {"n": 1}),  # retry of the same call succeeds
            FakeResponse(200, {"n": 2}),  # a later, unrelated call
        ]
    )
    client = NHLClient(session=session)

    assert client._min_interval == 0.0

    client._get("/club-schedule-season/CAR/now")
    assert client._min_interval > 0.0
    throttle_step = client._min_interval

    sleeps_before_next_call = len(sleeps)
    client._get("/club-schedule-season/CGY/now")
    # the next, otherwise-unrelated request was paced by the throttle
    assert len(sleeps) > sleeps_before_next_call
    assert sleeps[-1] == throttle_step


def test_get_caches_identical_paths_within_one_client():
    session = FakeSession([FakeResponse(200, {"n": 1})])
    client = NHLClient(session=session)

    first = client._get("/standings/now")
    second = client._get("/standings/now")

    assert first == {"n": 1}
    assert second == {"n": 1}
    assert session.calls == 1  # second call served from cache, no new HTTP request


def test_get_does_not_cache_across_different_paths():
    session = FakeSession([FakeResponse(200, {"n": 1}), FakeResponse(200, {"n": 2})])
    client = NHLClient(session=session)

    assert client._get("/roster/CHI/current") == {"n": 1}
    assert client._get("/roster/CAR/current") == {"n": 2}
    assert session.calls == 2


def test_stats_query_caches_identical_queries_but_not_different_ones():
    session = FakeSession(
        [
            FakeResponse(200, {"data": [{"n": 1}]}),
            FakeResponse(200, {"data": [{"n": 2}]}),
        ]
    )
    client = NHLClient(session=session)

    first = client._stats_query("skater/summary", 'seasonId=1 and gameTypeId=2', "[]", -1)
    again = client._stats_query("skater/summary", 'seasonId=1 and gameTypeId=2', "[]", -1)
    different = client._stats_query("skater/summary", 'seasonId=2 and gameTypeId=2', "[]", -1)

    assert first == [{"n": 1}]
    assert again == [{"n": 1}]  # served from cache
    assert different == [{"n": 2}]  # different cayenneExp -> real second request
    assert session.calls == 2
