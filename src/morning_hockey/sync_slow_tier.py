"""CLI entry point for the Cloudflare migration's slow-tier sync job:
skater/goalie/rookie season stats and standings, a few times a day.

Reuses league_stats.py, rookies.py and standings.py's existing build_*
functions completely unchanged -- this script is only the new D1 write
adapter on top. See d1/schema.sql and morning_hockey.d1_sync.
"""
from __future__ import annotations

import os

from .d1_sync import (
    D1Client,
    sync_if_changed,
    sync_finnish_goalies,
    sync_finnish_skaters,
    sync_goalie_stats,
    sync_rookie_stats,
    sync_skater_stats,
    sync_standings,
    sync_team_rosters,
    sync_team_season_stats,
)
from .league_stats import build_goalie_top, build_skater_top
from .nhl_api import NHLClient
from .rookies import build_rookie_top
from .standings import build_standings
from .suomiporssi import build_goalie_leaderboard, build_leaderboard, current_season_id
from .team import build_all_team_rosters, build_all_team_season_stats


def _sync(d1: D1Client, key: str, data, write, label: str) -> None:
    result = sync_if_changed(d1, key, data, write)
    print(f"{label}: unchanged, skipped." if result is None else f"{label}: wrote {result}.")


def run() -> None:
    account_id = os.environ["CF_ACCOUNT_ID"]
    database_id = os.environ["CF_D1_DATABASE_ID"]
    api_token = os.environ["CF_API_TOKEN"]

    client = NHLClient()
    d1 = D1Client(account_id, database_id, api_token)
    d1.execute("CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, hash TEXT NOT NULL)")

    season_id = current_season_id(client)

    skaters = build_skater_top(client, season_id)
    _sync(d1, "skaters", (season_id, skaters), lambda: sync_skater_stats(d1, skaters, season_id), "Skaters")

    goalies = build_goalie_top(client, season_id)
    _sync(d1, "goalies", (season_id, goalies), lambda: sync_goalie_stats(d1, goalies, season_id), "Goalies")

    rookies = build_rookie_top(client, season_id)
    _sync(d1, "rookies", (season_id, rookies), lambda: sync_rookie_stats(d1, rookies, season_id), "Rookies")

    standings = build_standings(client)
    _sync(d1, "standings", standings, lambda: sync_standings(d1, standings), "Standings")

    fin_skaters = build_leaderboard(client, season_id)
    _sync(d1, "fin_skaters", (season_id, fin_skaters), lambda: sync_finnish_skaters(d1, fin_skaters, season_id), "Finnish skaters")

    fin_goalies = build_goalie_leaderboard(client, season_id)
    _sync(d1, "fin_goalies", (season_id, fin_goalies), lambda: sync_finnish_goalies(d1, fin_goalies, season_id), "Finnish goalies")

    all_abbrevs = [row.abbrev for division in standings.divisions for row in division.rows]

    rosters = build_all_team_rosters(client, all_abbrevs, season_id)
    _sync(d1, "rosters", rosters, lambda: sync_team_rosters(d1, rosters), "Rosters (skaters, goalies)")

    team_stats = build_all_team_season_stats(client, all_abbrevs, season_id)
    _sync(d1, "team_stats", team_stats, lambda: sync_team_season_stats(d1, team_stats), "Team season stats")


if __name__ == "__main__":
    run()
