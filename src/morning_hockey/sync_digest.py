"""CLI entry point for the Cloudflare migration's digest sync: last night's
league-wide finished games, plus Finnish players' per-game scorer/goalie
lines, once a day. Reuses digest.py's build_digest() completely unchanged.
See d1/schema.sql and morning_hockey.d1_sync.sync_digest for why this runs
on its own daily cadence rather than folding into the fast or slow tier.
"""
from __future__ import annotations

import os

from .d1_sync import D1Client, sync_digest
from .digest import build_digest
from .nhl_api import NHLClient


def run() -> None:
    account_id = os.environ["CF_ACCOUNT_ID"]
    database_id = os.environ["CF_D1_DATABASE_ID"]
    api_token = os.environ["CF_API_TOKEN"]

    client = NHLClient()
    d1 = D1Client(account_id, database_id, api_token)

    digest = build_digest(client)
    count = sync_digest(d1, digest)
    print(f"Synced digest for {digest.date}: {count} game(s) to D1.")


if __name__ == "__main__":
    run()
