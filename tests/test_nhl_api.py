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


def test_get_returns_json_on_first_success():
    session = FakeSession([FakeResponse(200, {"ok": True})])
    client = NHLClient(session=session)

    assert client._get("/standings/now") == {"ok": True}
    assert session.calls == 1


def test_get_retries_on_429_then_succeeds(monkeypatch):
    sleeps = []
    monkeypatch.setattr("morning_hockey.nhl_api.time.sleep", lambda s: sleeps.append(s))

    session = FakeSession([FakeResponse(429), FakeResponse(429), FakeResponse(200, {"ok": True})])
    client = NHLClient(session=session)

    assert client._get("/club-schedule-season/CAR/now") == {"ok": True}
    assert session.calls == 3
    assert len(sleeps) == 2


def test_get_honors_retry_after_header(monkeypatch):
    sleeps = []
    monkeypatch.setattr("morning_hockey.nhl_api.time.sleep", lambda s: sleeps.append(s))

    session = FakeSession([FakeResponse(429, headers={"Retry-After": "3"}), FakeResponse(200, {"ok": True})])
    client = NHLClient(session=session)

    client._get("/standings/now")
    assert sleeps == [3.0]


def test_get_raises_after_exhausting_retries(monkeypatch):
    monkeypatch.setattr("morning_hockey.nhl_api.time.sleep", lambda s: None)

    session = FakeSession([FakeResponse(429) for _ in range(10)])
    client = NHLClient(session=session)

    try:
        client._get("/standings/now")
        assert False, "expected HTTPError"
    except requests.exceptions.HTTPError:
        pass


def test_get_does_not_retry_non_retryable_errors(monkeypatch):
    monkeypatch.setattr("morning_hockey.nhl_api.time.sleep", lambda s: None)

    session = FakeSession([FakeResponse(404)])
    client = NHLClient(session=session)

    try:
        client._get("/standings/now")
        assert False, "expected HTTPError"
    except requests.exceptions.HTTPError:
        pass
    assert session.calls == 1
