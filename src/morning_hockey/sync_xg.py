"""CLI entry point for the xG/GSAx sync: fetches play-by-play for finished
regular-season games that have no xG rows yet, scores every shot with the
shipped models (xg/), and writes per-game skater/goalie rows to D1.

  python -m morning_hockey.sync_xg                      # incremental (digest workflow)
  python -m morning_hockey.sync_xg --backfill 20242025  # every game of one season
"""
from __future__ import annotations

import argparse
import os

import requests

from .d1_sync import D1Client, query_game_ids, sync_xg_games
from .nhl_api import NHLClient
from .xg.compute import compute_game

_FINISHED_STATES = {"OFF", "FINAL"}
_REGULAR_SEASON_GAMES = 1312  # 32 teams x 82 games / 2
_WRITE_EVERY = 25  # games per D1 write during a backfill
_MAX_PER_RUN = 150  # incremental safety cap; the next digest run picks up the rest


def _process(client: NHLClient, d1: D1Client, game_ids: list[int]) -> int:
    """Returns how many games had xG rows written."""
    skaters: list[dict] = []
    goalies: list[dict] = []
    done = 0
    for index, game_id in enumerate(game_ids, 1):
        try:
            play_by_play = client.play_by_play(game_id)
        except requests.HTTPError as error:
            print(f"Skipping {game_id}: {error}")
            continue
        if play_by_play.get("gameState") not in _FINISHED_STATES:
            continue
        game_skaters, game_goalies = compute_game(play_by_play)
        skaters += game_skaters
        goalies += game_goalies
        done += 1
        if done % _WRITE_EVERY == 0 or index == len(game_ids):
            sync_xg_games(d1, skaters, goalies)
            skaters, goalies = [], []
            print(f"{index}/{len(game_ids)} games processed")
    if skaters or goalies:
        sync_xg_games(d1, skaters, goalies)
    return done


def unprocessed_games(d1: D1Client) -> list[int]:
    return query_game_ids(
        d1,
        "SELECT game_id FROM games WHERE is_finished = 1 AND substr(game_id, 5, 2) = '02' "
        "AND game_id NOT IN (SELECT game_id FROM skater_game_xg) ORDER BY game_id LIMIT ?",
        [_MAX_PER_RUN],
    )


def backfill_games(d1: D1Client, season: int) -> list[int]:
    start_year = season // 10_000
    ids = [start_year * 1_000_000 + 20_000 + n for n in range(1, _REGULAR_SEASON_GAMES + 1)]
    have = set(query_game_ids(d1, "SELECT DISTINCT game_id FROM skater_game_xg WHERE season = ?", [season]))
    return [game_id for game_id in ids if game_id not in have]


def run() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backfill", type=int, metavar="SEASON", help="e.g. 20242025")
    args = parser.parse_args()

    d1 = D1Client(os.environ["CF_ACCOUNT_ID"], os.environ["CF_D1_DATABASE_ID"], os.environ["CF_API_TOKEN"])
    game_ids = backfill_games(d1, args.backfill) if args.backfill else unprocessed_games(d1)
    done = _process(NHLClient(), d1, game_ids)
    print(f"Synced xG for {done} game(s) to D1.")


if __name__ == "__main__":
    run()
