"""CLI entry point for the playoff odds snapshot (winprob/season.py), run once a day
as its own step of the digest workflow after the xG sync."""
from __future__ import annotations

import os

from .d1_sync import D1Client
from .nhl_api import NHLClient
from .winprob.season import sync_season_sim


def run() -> None:
    d1 = D1Client(os.environ["CF_ACCOUNT_ID"], os.environ["CF_D1_DATABASE_ID"], os.environ["CF_API_TOKEN"])
    print(f"Season simulation: {sync_season_sim(d1, NHLClient())} team row(s) written.")


if __name__ == "__main__":
    run()
