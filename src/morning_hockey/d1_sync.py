"""Writes locally-built data into Cloudflare D1 via its HTTP API.

This is the one new piece of infrastructure code the Cloudflare migration
needs on the write side -- everything upstream of it (schedule.py and every
other build_* function in this package) stays exactly as it already is and
already was, unchanged. A separate, thin read-side layer (Cloudflare Pages
Functions, in TypeScript) is what the migrated site's pages actually query;
this module only ever writes.
"""
from __future__ import annotations

import datetime as dt

import requests

from .schedule import SchedulePage

_D1_QUERY_URL = "https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query"

_UPSERT_GAME_SQL = """
INSERT INTO games (
    game_id, date, start_time_utc, away_abbrev, away_name, away_logo, away_score,
    home_abbrev, home_name, home_logo, home_score, game_state, is_finished, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(game_id) DO UPDATE SET
    away_score = excluded.away_score,
    home_score = excluded.home_score,
    game_state = excluded.game_state,
    is_finished = excluded.is_finished,
    updated_at = excluded.updated_at
"""


class D1Client:
    """A minimal wrapper around D1's HTTP query endpoint. Reads never go
    through here in production -- only the GitHub Actions write side uses
    this; the live site's Pages Functions bind D1 natively instead."""

    def __init__(
        self, account_id: str, database_id: str, api_token: str, session: requests.Session | None = None
    ) -> None:
        self._url = _D1_QUERY_URL.format(account_id=account_id, database_id=database_id)
        self._headers = {"Authorization": f"Bearer {api_token}"}
        self._session = session or requests.Session()

    def execute(self, sql: str, params: list | None = None) -> dict:
        response = self._session.post(self._url, headers=self._headers, json={"sql": sql, "params": params or []})
        if not response.ok:
            # D1's actual error detail (e.g. "no such table: games") is in the
            # JSON body, not in requests' generic HTTPError message -- surface
            # it directly so a failure is diagnosable from the Actions log
            # alone, without needing the Cloudflare dashboard.
            raise RuntimeError(f"D1 query failed ({response.status_code}): {response.text}")
        return response.json()


def _game_params(day_date: str, game, synced_at: str) -> list:
    return [
        game.game_id,
        day_date,
        game.start_local.astimezone(dt.timezone.utc).isoformat(timespec="seconds"),
        game.away.abbrev,
        game.away.name,
        game.away.logo,
        game.away.score,
        game.home.abbrev,
        game.home.name,
        game.home.logo,
        game.home.score,
        game.game_state,
        1 if game.is_finished else 0,
        synced_at,
    ]


def sync_schedule(client: D1Client, page: SchedulePage) -> int:
    """Upserts every game in the rolling schedule window into D1's `games`
    table. Meant to be run by the fast-tier (~30 min) workflow. Returns how
    many games were synced, for the caller to log."""
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    count = 0
    for day in page.days:
        for game in day.games:
            client.execute(_UPSERT_GAME_SQL, _game_params(day.date, game, synced_at))
            count += 1
    return count
