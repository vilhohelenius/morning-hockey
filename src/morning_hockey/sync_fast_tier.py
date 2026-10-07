"""CLI entry point for the Cloudflare migration's fast-tier sync job: fetch
the rolling 7(+1)-day schedule and upsert it into D1's `games` table.

Meant to run every ~30 minutes via its own GitHub Actions workflow, separate
from (and much cheaper than) the nightly digest build -- see
d1/schema.sql and morning_hockey.d1_sync for why this alone is enough to
also keep a permanent game-results archive, with no separate archive table.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os

from .d1_sync import D1Client, sync_schedule, unprocessed_xg_game_ids
from .nhl_api import NHLClient
from .schedule import build_schedule


def run(date: str = "now", weeks: int = 1) -> None:
    account_id = os.environ["CF_ACCOUNT_ID"]
    database_id = os.environ["CF_D1_DATABASE_ID"]
    api_token = os.environ["CF_API_TOKEN"]

    client = NHLClient()
    d1 = D1Client(account_id, database_id, api_token)

    current_date = date
    total = 0
    for week in range(weeks):
        page = build_schedule(client, current_date)
        count = sync_schedule(d1, page)
        total += count
        print(f"Synced {count} games across {len(page.days)} days to D1 (week {week + 1}/{weeks}, as_of {page.as_of_date}).")
        if not page.days:
            break
        current_date = (dt.date.fromisoformat(page.as_of_date) + dt.timedelta(days=7)).isoformat()

    if weeks > 1:
        print(f"Done: synced {total} games total across {weeks} week(s).")

    # Tell the workflow whether finished games still lack xG, so it only then
    # installs the heavy xG deps and scores them. The 2-day window stops a game
    # whose play-by-play never turns up from triggering this forever.
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=2)).isoformat(timespec="seconds")
    pending = bool(unprocessed_xg_game_ids(d1, 1, since))
    print(f"pending_xg={str(pending).lower()}")
    if "GITHUB_OUTPUT" in os.environ:
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"pending_xg={str(pending).lower()}\n")


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
    parser.add_argument(
        "--weeks",
        type=int,
        default=1,
        help="How many consecutive weeks to sync starting from --date, advancing 7 "
        "days each time. Used for a one-time full-season backfill (e.g. "
        "--date 2026-09-24 --weeks 30) so every future date already has rows in D1 "
        "and the normal rolling sync just needs to update scores/states as each "
        "date resolves -- the scheduled workflow never passes this.",
    )
    args = parser.parse_args()
    run(args.date, args.weeks)


if __name__ == "__main__":
    main()
