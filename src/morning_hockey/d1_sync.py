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
import hashlib
import re

import requests

from .schedule import SchedulePage

_D1_QUERY_URL = "https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query"

_UPSERT_GAME_SQL = """
INSERT INTO games (
    game_id, date, start_time_utc, away_abbrev, away_name, away_logo, away_score,
    home_abbrev, home_name, home_logo, home_score, game_state, is_finished, final_type, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(game_id) DO UPDATE SET
    away_score = excluded.away_score,
    home_score = excluded.home_score,
    game_state = excluded.game_state,
    is_finished = excluded.is_finished,
    final_type = excluded.final_type,
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
        game.final_type,
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
    name = excluded.name,
    logo = excluded.logo,
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


# ---------- Suomipörssi (every Finnish player, not a top-N cut) ----------

_INSERT_FINNISH_SKATER_SQL = """
INSERT INTO finnish_skater_stats (
    player_id, season_id, name, team_abbrev, logo, headshot, position,
    games_played, goals, assists, points, penalty_minutes, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

_INSERT_FINNISH_GOALIE_SQL = """
INSERT INTO finnish_goalie_stats (
    player_id, season_id, name, team_abbrev, logo, headshot,
    games_played, wins, losses, ot_losses, goals_against_average, save_pct, shutouts, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def _finnish_skater_params(row, season_id: int, synced_at: str) -> list:
    return [
        row.player_id, season_id, row.name, row.team, row.logo, row.headshot,
        row.position, row.games_played, row.goals, row.assists, row.points, row.penalty_minutes, synced_at,
    ]


def _finnish_goalie_params(row, season_id: int, synced_at: str) -> list:
    return [
        row.player_id, season_id, row.name, row.team, row.logo, row.headshot,
        row.games_played, row.wins, row.losses, row.ot_losses,
        row.goals_against_average, row.save_pct, row.shutouts, synced_at,
    ]


def sync_finnish_skaters(client: D1Client, rows: list, season_id: int) -> int:
    """Replaces the whole finnish_skater_stats table -- same delete-then-
    reinsert reasoning as the other leaderboard tables above."""
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    client.execute("DELETE FROM finnish_skater_stats")
    for row in rows:
        client.execute(_INSERT_FINNISH_SKATER_SQL, _finnish_skater_params(row, season_id, synced_at))
    return len(rows)


def sync_finnish_goalies(client: D1Client, rows: list, season_id: int) -> int:
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    client.execute("DELETE FROM finnish_goalie_stats")
    for row in rows:
        client.execute(_INSERT_FINNISH_GOALIE_SQL, _finnish_goalie_params(row, season_id, synced_at))
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


# ---------- Digest (dashboard hero: last night's games, once a day) ----------

_UPSERT_DIGEST_SQL = """
INSERT INTO digests (date, generated_at) VALUES (?, ?)
ON CONFLICT(date) DO UPDATE SET generated_at = excluded.generated_at
"""

_UPSERT_DIGEST_GAME_SQL = """
INSERT INTO digest_games (
    game_id, digest_date, away_abbrev, away_name, away_logo, away_score,
    home_abbrev, home_name, home_logo, home_score, final_type, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(game_id) DO UPDATE SET
    away_score = excluded.away_score,
    home_score = excluded.home_score,
    final_type = excluded.final_type,
    updated_at = excluded.updated_at
"""

_INSERT_DIGEST_SCORER_SQL = """
INSERT INTO digest_scorers (game_id, name, team_abbrev, goals, assists) VALUES (?, ?, ?, ?, ?)
"""

_INSERT_DIGEST_GOALIE_SQL = """
INSERT INTO digest_goalies (game_id, name, team_abbrev, decision, saves, shots_against, save_pct, toi)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
"""


def sync_digest(client: D1Client, digest) -> int:
    """Syncs one night's Digest (digest.py's build_digest() output, called
    unchanged) into D1. Each game is upserted by game_id, safe to re-run for
    the same night; each game's Finnish scorer/goalie lines have no natural
    key of their own, so they're deleted and reinserted first rather than
    left to accumulate duplicates across re-runs. Returns the game count."""
    client.execute(_UPSERT_DIGEST_SQL, [digest.date, digest.generated_at])

    for game in digest.games:
        client.execute(
            _UPSERT_DIGEST_GAME_SQL,
            [
                game.game_id, digest.date,
                game.away.abbrev, game.away.name, game.away.logo, game.away.score,
                game.home.abbrev, game.home.name, game.home.logo, game.home.score,
                game.final_type, digest.generated_at,
            ],
        )

        client.execute("DELETE FROM digest_scorers WHERE game_id = ?", [game.game_id])
        for scorer in game.scorers:
            client.execute(
                _INSERT_DIGEST_SCORER_SQL,
                [game.game_id, scorer.name, scorer.team, scorer.goals, scorer.assists],
            )

        client.execute("DELETE FROM digest_goalies WHERE game_id = ?", [game.game_id])
        for goalie in game.goalies:
            client.execute(
                _INSERT_DIGEST_GOALIE_SQL,
                [
                    game.game_id, goalie.name, goalie.team, goalie.decision,
                    goalie.saves, goalie.shots_against, goalie.save_pct, goalie.toi,
                ],
            )

    return len(digest.games)


# ---------- Team rosters (all 32 teams, full roster + season stats) ----------

_DELETE_ROSTER_SKATERS_SQL = "DELETE FROM team_roster_skaters"
_INSERT_ROSTER_SKATER_SQL = """
INSERT INTO team_roster_skaters (
    player_id, team_abbrev, name, position, nationality, sweater_number, headshot,
    games_played, goals, assists, points, plus_minus, avg_toi_seconds, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

_DELETE_ROSTER_GOALIES_SQL = "DELETE FROM team_roster_goalies"
_INSERT_ROSTER_GOALIE_SQL = """
INSERT INTO team_roster_goalies (
    player_id, team_abbrev, name, nationality, sweater_number, headshot,
    games_played, wins, losses, ot_losses, goals_against_average, save_pct, shutouts, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""


def sync_team_rosters(client: D1Client, rosters: dict) -> tuple[int, int]:
    """Replaces the whole team_roster_skaters/team_roster_goalies tables
    with the given {abbrev: (skaters, goalies)} map. Full delete-then-
    reinsert, same reasoning as the other leaderboard tables: a traded or
    waived player needs to disappear from their old team's roster, not
    just stop getting updated. Returns (skater_count, goalie_count)."""
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    client.execute(_DELETE_ROSTER_SKATERS_SQL)
    client.execute(_DELETE_ROSTER_GOALIES_SQL)

    skater_count = 0
    goalie_count = 0
    for abbrev, (skaters, goalies) in rosters.items():
        for row in skaters:
            client.execute(
                _INSERT_ROSTER_SKATER_SQL,
                [
                    row.player_id, abbrev, row.name, row.position, row.nationality,
                    row.sweater_number, row.headshot,
                    row.games_played, row.goals, row.assists, row.points, row.plus_minus,
                    row.avg_toi_seconds, synced_at,
                ],
            )
            skater_count += 1
        for row in goalies:
            client.execute(
                _INSERT_ROSTER_GOALIE_SQL,
                [
                    row.player_id, abbrev, row.name, row.nationality, row.sweater_number, row.headshot,
                    row.games_played, row.wins, row.losses, row.ot_losses,
                    row.goals_against_average, row.save_pct, row.shutouts, synced_at,
                ],
            )
            goalie_count += 1
    return skater_count, goalie_count


_UPSERT_TEAM_SEASON_STATS_SQL = """
INSERT INTO team_season_stats (
    team_abbrev, games_played, goals_for, goals_against, power_play_pct,
    penalty_kill_pct, faceoff_pct, shots_for_per_game, shots_against_per_game, shutouts, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(team_abbrev) DO UPDATE SET
    games_played = excluded.games_played,
    goals_for = excluded.goals_for,
    goals_against = excluded.goals_against,
    power_play_pct = excluded.power_play_pct,
    penalty_kill_pct = excluded.penalty_kill_pct,
    faceoff_pct = excluded.faceoff_pct,
    shots_for_per_game = excluded.shots_for_per_game,
    shots_against_per_game = excluded.shots_against_per_game,
    shutouts = excluded.shutouts,
    updated_at = excluded.updated_at
"""


def sync_team_season_stats(client: D1Client, stats_by_team: dict) -> int:
    """Upserts team_season_stats for every team with a non-None SeasonStats
    -- a plain upsert, like standings_rows, since the set of 32 teams never
    shrinks. A team with no stats yet (e.g. hasn't played this season) is
    just skipped rather than writing a row of zeros."""
    synced_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    count = 0
    for abbrev, stats in stats_by_team.items():
        if stats is None:
            continue
        client.execute(
            _UPSERT_TEAM_SEASON_STATS_SQL,
            [
                abbrev, stats.games_played, stats.goals_for, stats.goals_against,
                stats.power_play_pct, stats.penalty_kill_pct, stats.faceoff_pct,
                stats.shots_for_per_game, stats.shots_against_per_game, stats.shutouts, synced_at,
            ],
        )
        count += 1
    return count


# ---------- xG / GSAx (per-game rows from play-by-play, see xg/ and sync_xg.py) ----------

_XG_SKATER_COLUMNS = ["game_id", "player_id", "team_id", "season", "game_date", "shots", "on_goal", "goals", "xg"]
_XG_GOALIE_COLUMNS = [
    "game_id", "player_id", "opp_team_id", "season", "game_date", "shots_against", "goals_against", "xga",
]
_XG_INSERT_CHUNK = 200


def _sql_literal(value) -> str:
    """Inlined instead of bound: D1 caps a statement at 100 bound parameters,
    which would mean one HTTP call per ~11 rows -- far too slow for a
    backfill of tens of thousands of rows. Only ever called with values
    compute_game() produced (ints, floats, an ISO date string)."""
    if isinstance(value, str):
        if not re.fullmatch(r"[0-9A-Za-z:\-]+", value):
            raise ValueError(f"unexpected string in xG row: {value!r}")
        return f"'{value}'"
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"unexpected value in xG row: {value!r}")
    return repr(value)


def _insert_rows(client: D1Client, table: str, columns: list[str], rows: list[dict]) -> None:
    for start in range(0, len(rows), _XG_INSERT_CHUNK):
        values = ",".join(
            "(" + ",".join(_sql_literal(row[c]) for c in columns) + ")"
            for row in rows[start : start + _XG_INSERT_CHUNK]
        )
        client.execute(f"INSERT OR REPLACE INTO {table} ({','.join(columns)}) VALUES {values}")


_XG_TEAM_COLUMNS = ["game_id", "team_id", "season", "game_date", "xgf", "xga", "xgf_5v5", "xga_5v5"]


def sync_team_xg_games(client: D1Client, team_rows: list[dict]) -> None:
    """Upserts team_game_xg rows (primary key (game_id, team_id))."""
    _insert_rows(client, "team_game_xg", _XG_TEAM_COLUMNS, team_rows)


def sync_xg_games(client: D1Client, skater_rows: list[dict], goalie_rows: list[dict]) -> None:
    """Upserts per-game xG rows (primary key (game_id, player_id), so safe to
    re-run for the same game). Season totals are summed in the web queries
    rather than stored, so there is one source of truth."""
    _insert_rows(client, "skater_game_xg", _XG_SKATER_COLUMNS, skater_rows)
    _insert_rows(client, "goalie_game_xg", _XG_GOALIE_COLUMNS, goalie_rows)


def unprocessed_xg_game_ids(client: D1Client, limit: int, since: str = "") -> list[int]:
    """Finished regular-season games (started after the ISO timestamp `since`) with no xG rows yet."""
    return query_game_ids(
        client,
        "SELECT game_id FROM games WHERE is_finished = 1 AND substr(game_id, 5, 2) = '02' "
        "AND start_time_utc > ? AND game_id NOT IN (SELECT game_id FROM skater_game_xg) ORDER BY game_id LIMIT ?",
        [since, limit],
    )


def sync_if_changed(client: D1Client, key: str, data, write):
    """Runs write() only when repr(data) differs from what the last successful
    write stored under `key` in sync_state; returns write()'s result, or None
    when skipped. Saves the delete-and-reinsert of an unchanged table."""
    digest = hashlib.sha256(repr(data).encode()).hexdigest()
    rows = client.execute("SELECT hash FROM sync_state WHERE key = ?", [key])["result"][0]["results"]
    if rows and rows[0]["hash"] == digest:
        return None
    result = write()
    client.execute("INSERT OR REPLACE INTO sync_state (key, hash) VALUES (?, ?)", [key, digest])
    return result


def query_game_ids(client: D1Client, sql: str, params: list | None = None) -> list[int]:
    """Runs a SELECT returning a single game_id column."""
    result = client.execute(sql, params)["result"][0]["results"]
    return [row["game_id"] for row in result]


_ONICE_COLUMNS = [
    "game_id", "player_id", "team_id", "season", "game_date",
    "toi_sec", "toi_5v5_sec", "xgf", "xga", "xgf_5v5", "xga_5v5",
]


def sync_onice_games(client: D1Client, rows: list[dict]) -> None:
    """Upserts per-skater on-ice xG rows (primary key (game_id, player_id))."""
    _insert_rows(client, "skater_game_onice_xg", _ONICE_COLUMNS, rows)
