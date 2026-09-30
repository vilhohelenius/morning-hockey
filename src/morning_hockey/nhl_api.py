"""Thin client for the public NHL APIs.

- api-web.nhle.com/v1/...       nightly scores, boxscores, rosters
- api.nhle.com/stats/rest/en/...  season-long statistical leaders

Endpoint shapes are documented at
https://github.com/Zmalski/NHL-API-Reference
"""
from __future__ import annotations

import time

import requests

BASE_URL = "https://api-web.nhle.com/v1"
STATS_BASE_URL = "https://api.nhle.com/stats/rest/en"
_TIMEOUT = 15

# The 32-teams-in-a-row calls (e.g. one club-schedule-season request per team
# for the standings page's team snapshots) can trip this public API's rate
# limiting, which answers with 429 rather than queuing the request.
_RETRYABLE_STATUSES = {429, 502, 503, 504}
_MAX_RETRIES = 5
_BACKOFF_SECONDS = 1.0


class NHLClient:
    def __init__(self, session: requests.Session | None = None) -> None:
        self._session = session or requests.Session()

    def _request(self, url: str, params: dict | None = None) -> requests.Response:
        for attempt in range(_MAX_RETRIES + 1):
            response = self._session.get(url, params=params, timeout=_TIMEOUT)
            if response.status_code not in _RETRYABLE_STATUSES or attempt == _MAX_RETRIES:
                response.raise_for_status()
                return response

            retry_after = response.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else _BACKOFF_SECONDS * (2**attempt)
            time.sleep(delay)

        raise AssertionError("unreachable")  # loop always returns or raises

    def _get(self, path: str) -> dict:
        return self._request(f"{BASE_URL}{path}").json()

    def scoreboard(self, date: str = "now") -> dict:
        """Scores for a given date (YYYY-MM-DD) or the current slate ("now")."""
        return self._get(f"/score/{date}")

    def boxscore(self, game_id: int) -> dict:
        return self._get(f"/gamecenter/{game_id}/boxscore")

    def roster(self, team_abbrev: str) -> dict:
        return self._get(f"/roster/{team_abbrev}/current")

    def standings(self, date: str = "now") -> dict:
        return self._get(f"/standings/{date}")

    def club_schedule_season(self, team_abbrev: str) -> dict:
        return self._get(f"/club-schedule-season/{team_abbrev}/now")

    def _stats_query(self, resource: str, cayenne_exp: str, sort: str, limit: int) -> list[dict]:
        """Query a season-long stats report (api.nhle.com/stats/rest)."""
        response = self._request(
            f"{STATS_BASE_URL}/{resource}",
            params={"cayenneExp": cayenne_exp, "sort": sort, "limit": limit},
        )
        return response.json()["data"]

    def skater_summary(self, cayenne_exp: str, sort: str, limit: int = -1) -> list[dict]:
        return self._stats_query("skater/summary", cayenne_exp, sort, limit)

    def skater_bios(self, cayenne_exp: str, sort: str, limit: int = -1) -> list[dict]:
        """Like skater_summary, but includes nationalityCode and currentTeamAbbrev."""
        return self._stats_query("skater/bios", cayenne_exp, sort, limit)

    def goalie_summary(self, cayenne_exp: str, sort: str, limit: int = -1) -> list[dict]:
        return self._stats_query("goalie/summary", cayenne_exp, sort, limit)

    def goalie_bios(self, cayenne_exp: str, sort: str, limit: int = -1) -> list[dict]:
        """Like goalie_summary, but includes nationalityCode (no GAA/SV%)."""
        return self._stats_query("goalie/bios", cayenne_exp, sort, limit)
