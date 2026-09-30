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

# A burst of many similar calls (e.g. one club-schedule-season request per
# team for the standings page's team snapshots) can trip this public API's
# rate limiting, which answers with 429 rather than queuing the request.
_RETRYABLE_STATUSES = {429, 502, 503, 504}
_MAX_RETRIES = 5
_BACKOFF_SECONDS = 1.0

# Once a 429 is seen, every later request (any endpoint) is paced at least
# this far apart, doubling on each further 429 up to the cap. A single
# retry only fixes the one rejected request; the whole burst needs to slow
# down, or the very next call just gets rate-limited again.
_INITIAL_THROTTLE_SECONDS = 1.0
_MAX_THROTTLE_SECONDS = 8.0


class NHLClient:
    def __init__(self, session: requests.Session | None = None) -> None:
        self._session = session or requests.Session()
        self._min_interval = 0.0
        self._last_request_at = 0.0
        # Several call sites legitimately need the same endpoint+params within
        # one run (e.g. standings for both the standings page and a team's own
        # division context) — nothing on the NHL side changes in the ~1-2
        # minutes a build takes, so caching per (path or query) for the life
        # of this client instance is safe and avoids re-fetching identical data.
        self._cache: dict[object, object] = {}

    def _throttle(self) -> None:
        if self._min_interval <= 0:
            return
        wait = self._min_interval - (time.monotonic() - self._last_request_at)
        if wait > 0:
            time.sleep(wait)

    def _request(self, url: str, params: dict | None = None) -> requests.Response:
        for attempt in range(_MAX_RETRIES + 1):
            self._throttle()
            response = self._session.get(url, params=params, timeout=_TIMEOUT)
            self._last_request_at = time.monotonic()

            if response.status_code not in _RETRYABLE_STATUSES:
                response.raise_for_status()
                return response

            if response.status_code == 429:
                self._min_interval = min(
                    max(self._min_interval * 2, _INITIAL_THROTTLE_SECONDS), _MAX_THROTTLE_SECONDS
                )

            if attempt == _MAX_RETRIES:
                response.raise_for_status()
                return response

            retry_after = response.headers.get("Retry-After")
            delay = float(retry_after) if retry_after else _BACKOFF_SECONDS * (2**attempt)
            time.sleep(delay)

        raise AssertionError("unreachable")  # loop always returns or raises

    def _get(self, path: str) -> dict:
        if path not in self._cache:
            self._cache[path] = self._request(f"{BASE_URL}{path}").json()
        return self._cache[path]

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

    def schedule(self, date: str = "now") -> dict:
        """One week of league-wide games starting at the given date
        (YYYY-MM-DD) or the current week ("now"), as {"gameWeek": [{"date":
        ..., "games": [...]}, ...]}."""
        return self._get(f"/schedule/{date}")

    def _stats_query(self, resource: str, cayenne_exp: str, sort: str, limit: int) -> list[dict]:
        """Query a season-long stats report (api.nhle.com/stats/rest)."""
        key = ("stats", resource, cayenne_exp, sort, limit)
        if key not in self._cache:
            response = self._request(
                f"{STATS_BASE_URL}/{resource}",
                params={"cayenneExp": cayenne_exp, "sort": sort, "limit": limit},
            )
            self._cache[key] = response.json()["data"]
        return self._cache[key]

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

    def team_summary(self, cayenne_exp: str, sort: str, limit: int = -1) -> list[dict]:
        """Season team totals: goals for/against, PP%/PK%, faceoff%, etc.
        No abbrev/triCode field to filter by — only a numeric teamId and
        teamFullName, so callers match on the full name instead."""
        return self._stats_query("team/summary", cayenne_exp, sort, limit)

    def landing(self, game_id: int) -> dict:
        """Play-by-play scoring summary (full names, period, strength) plus
        three stars, for one game."""
        return self._get(f"/gamecenter/{game_id}/landing")

    def right_rail(self, game_id: int) -> dict:
        """Team-vs-team game stat comparison (shots, faceoff%, power play,
        PIM, hits, ...) for one game."""
        return self._get(f"/gamecenter/{game_id}/right-rail")
