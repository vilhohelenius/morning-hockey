"""CLI entry point for the Cloudflare migration's fast-tier sync job: fetch
the rolling 7(+1)-day schedule and upsert it into D1's `games` table.

Meant to run every ~30 minutes via its own GitHub Actions workflow, separate
from (and much cheaper than) the nightly digest build -- see
d1/schema.sql and morning_hockey.d1_sync for why this alone is enough to
also keep a permanent game-results archive, with no separate archive table.
"""
from __future__ import annotations

import argparse
import os

from .d1_sync import D1Client, sync_schedule
from .nhl_api import NHLClient
from .schedule import build_schedule


def run(date: str = "now") -> None:
    account_id = os.environ["CF_ACCOUNT_ID"]
    database_id = os.environ["CF_D1_DATABASE_ID"]
    api_token = os.environ["CF_API_TOKEN"]

    client = NHLClient()
    page = build_schedule(client, date)

    d1 = D1Client(account_id, database_id, api_token)
    count = sync_schedule(d1, page)
    print(f"Synced {count} games across {len(page.days)} days to D1.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync the rolling schedule to D1.")
    parser.add_argument(
        "--date",
        default="now",
        help="YYYY-MM-DD to sync that week from, instead of the current one. "
        "One-off backfill for games older than the rolling window this normally "
        "runs against (e.g. the season's opening night, if fast-tier syncing "
        "only started after it) -- the scheduled workflow never passes this.",
    )
    args = parser.parse_args()
    run(args.date)


if __name__ == "__main__":
    main()
