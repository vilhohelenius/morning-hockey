"""CLI entry point for the Cloudflare migration's slow-tier sync job:
skater/goalie/rookie season stats and standings, a few times a day.

Reuses league_stats.py, rookies.py and standings.py's existing build_*
functions completely unchanged -- this script is only the new D1 write
adapter on top. See d1/schema.sql and morning_hockey.d1_sync.
"""
from __future__ import annotations

import os

from .d1_sync import D1Client, sync_goalie_stats, sync_rookie_stats, sync_skater_stats, sync_standings
from .league_stats import build_goalie_top, build_skater_top
from .nhl_api import NHLClient
from .rookies import build_rookie_top
from .standings import build_standings
from .suomiporssi import current_season_id


def run() -> None:
    account_id = os.environ["CF_ACCOUNT_ID"]
    database_id = os.environ["CF_D1_DATABASE_ID"]
    api_token = os.environ["CF_API_TOKEN"]

    client = NHLClient()
    d1 = D1Client(account_id, database_id, api_token)

    season_id = current_season_id(client)

    skaters = build_skater_top(client, season_id)
    skater_count = sync_skater_stats(d1, skaters, season_id)
    print(f"Synced {skater_count} skaters to D1.")

    goalies = build_goalie_top(client, season_id)
    goalie_count = sync_goalie_stats(d1, goalies, season_id)
    print(f"Synced {goalie_count} goalies to D1.")

    rookies = build_rookie_top(client, season_id)
    rookie_count = sync_rookie_stats(d1, rookies, season_id)
    print(f"Synced {rookie_count} rookies to D1.")

    standings = build_standings(client)
    standings_count = sync_standings(d1, standings)
    print(f"Synced {standings_count} standings rows to D1.")


if __name__ == "__main__":
    run()
