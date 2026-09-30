"""Thin client for the public NHL APIs.

- api-web.nhle.com/v1/...       nightly scores, boxscores, rosters
- api.nhle.com/stats/rest/en/...  season-long statistical leaders

Endpoint shapes are documented at
https://github.com/Zmalski/NHL-API-Reference
"""
from __future__ import annotations

import requests

BASE_URL = "https://api-web.nhle.com/v1"
STATS_BASE_URL = "https://api.nhle.com/stats/rest/en"
_TIMEOUT = 15


class NHLClient:
    def __init__(self, session: requests.Session | None = None) -> None:
        self._session = session or requests.Session()

    def _get(self, path: str) -> dict:
        response = self._session.get(f"{BASE_URL}{path}", timeout=_TIMEOUT)
        response.raise_for_status()
        return response.json()

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
        response = self._session.get(
            f"{STATS_BASE_URL}/{resource}",
            params={"cayenneExp": cayenne_exp, "sort": sort, "limit": limit},
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        return response.json()["data"]

    def skater_summary(self, cayenne_exp: str, sort: str, limit: int = -1) -> list[dict]:
        return self._stats_query("skater/summary", cayenne_exp, sort, limit)

    def skater_bios(self, cayenne_exp: str, sort: str, limit: int = -1) -> list[dict]:
        """Like skater_summary, but includes nationalityCode and currentTeamAbbrev."""
        return self._stats_query("skater/bios", cayenne_exp, sort, limit)

    def goalie_summary(self, cayenne_exp: str, sort: str, limit: int = -1) -> list[dict]:
        return self._stats_query("goalie/summary", cayenne_exp, sort, limit)
