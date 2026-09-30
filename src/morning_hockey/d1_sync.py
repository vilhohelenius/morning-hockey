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


# ---------- Slow tier (a few times a day) ----------

_INSERT_SKATER_SQL = """
INSERT INTO skater_season_stats (
    player_id, season_id, name, team_abbrev, logo, headshot, nationality, position,
    games_played, goals, assists, points, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

_INSERT_GOALIE_SQL = """
INSERT INTO goalie_season_stats (
    player_id, season_id, name, team_abbrev, logo, headshot, nationality,
    games_played, wins, losses, ot_losses, goals_against_average, save_pct, shutouts, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

_INSERT_ROOKIE_SQL = """
INSERT INTO rookie_season_stats (
    player_id, season_id, name, team_abbrev, logo, headshot, nationality, position,
    games_played, goals, assists, points, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

_UPSERT_STANDINGS_SQL = """
INSERT INTO standings_rows (
    abbrev, as_of_date, name, logo, conference, division, division_rank, wildcard_rank,
    qualified, games_played, wins, losses, ot_losses, points, goal_differential, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(abbrev) DO UPDATE SET
    as_of_date = excluded.as_of_date,
    division_rank = excluded.division_rank,
    wildcard_rank = excluded.wildcard_rank,
    qualified = excluded.qualified,
    games_played = excluded.games_played,
    wins = excluded.wins,
    losses = excluded.losses,
    ot_losses = excluded.ot_losses,
    points = excluded.points,
    goal_differential = excluded.goal_differential,
    updated_at = excluded.updated_at
"""


def _skater_params(row, season_id: int, synced_at: str) -> list:
    return [
        row.player_id, season_id, row.name, row.team, row.logo, row.headshot,
        row.nationality, row.position, row.games_played, row.goals, row.assists, row.points, synced_at,
    ]


def _goalie_params(row, season_id: int, synced_at: str) -> list:
    return [
        row.player_id, season_id, row.name, row.team, row.logo, row.headshot, row.nationality,
        row.games_played, row.wins, row.losses, row.ot_losses,
        row.goals_against_average, row.save_pct, row.shutouts, synced_at,
    ]


def sync_skater_stats(client: D1Client, rows: list, season_id: int) -> int:
    """Replaces the whole skater_season_stats table with the given rows.
    A full delete-then-reinsert (not an upsert) is deliberate: this is a
    top-N leaderboard, so a player who drops out of it needs to disappear
    from the table too, not just never get updated again."""
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    client.execute("DELETE FROM skater_season_stats")
    for row in rows:
        client.execute(_INSERT_SKATER_SQL, _skater_params(row, season_id, synced_at))
    return len(rows)


def sync_goalie_stats(client: D1Client, rows: list, season_id: int) -> int:
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    client.execute("DELETE FROM goalie_season_stats")
    for row in rows:
        client.execute(_INSERT_GOALIE_SQL, _goalie_params(row, season_id, synced_at))
    return len(rows)


def sync_rookie_stats(client: D1Client, rows: list, season_id: int) -> int:
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    client.execute("DELETE FROM rookie_season_stats")
    for row in rows:
        client.execute(_INSERT_ROOKIE_SQL, _skater_params(row, season_id, synced_at))
    return len(rows)


def sync_standings(client: D1Client, page) -> int:
    """Upserts every team's standings row -- unlike the leaderboards above,
    the set of teams never shrinks, so a plain upsert (matching games) is
    correct here, not a delete-then-reinsert."""
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    count = 0
    for division in page.divisions:
        for row in division.rows:
            params = [
                row.abbrev, page.as_of_date, row.name, row.logo, division.conference, division.name,
                row.division_rank, row.wildcard_rank, 1 if row.qualified else 0,
                row.games_played, row.wins, row.losses, row.ot_losses, row.points,
                row.goal_differential, synced_at,
            ]
            client.execute(_UPSERT_STANDINGS_SQL, params)
            count += 1
    return count
