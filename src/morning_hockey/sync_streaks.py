"""CLI entry point for the point-streak table (Analytiikka > Pisteputket), run
once a day as its own step of the digest workflow. Reads every skater game row
of the current regular season from the NHL stats API (isGame=true, 10000 rows
per page) and stores each skater's active streak and season-longest streak of
consecutive games with at least one point (min 3 games)."""
from __future__ import annotations

import datetime as dt
import os

from .d1_sync import D1Client, _insert_rows
from .nhl_api import NHLClient
from .suomiporssi import current_season_id

MIN_GAMES = 3
_COLUMNS = [
    "player_id", "kind", "season_id", "name", "team_abbrev",
    "games", "goals", "assists", "points", "start_date", "end_date",
]


def _fetch_games(client: NHLClient, season_id: int) -> list[dict]:
    """The API caps a query at 10000 rows, so fetch in 7-day windows (~4000 rows each)."""
    rows: list[dict] = []
    day = dt.date(season_id // 10_000, 9, 15)
    today = dt.date.today()
    while day <= today:
        end = day + dt.timedelta(days=7)
        rows += client.skater_game_rows(
            f"seasonId={season_id} and gameTypeId=2 and gameDate>='{day}' and gameDate<'{end}'"
        )
        day = end
    return rows


def compute_streaks(games: list[dict], season_id: int) -> list[dict]:
    """games: per-game skater rows. Returns one 'active' and/or one 'best' row per skater."""
    by_player: dict[int, list[dict]] = {}
    for g in sorted(games, key=lambda g: (g["gameDate"], g["gameId"])):
        by_player.setdefault(g["playerId"], []).append(g)

    def row(kind: str, run: list[dict]) -> dict:
        last = run[-1]
        return {
            "player_id": last["playerId"], "kind": kind, "season_id": season_id,
            "name": last["skaterFullName"], "team_abbrev": last["teamAbbrev"].split(",")[-1].strip(),
            "games": len(run), "goals": sum(g["goals"] for g in run), "assists": sum(g["assists"] for g in run),
            "points": sum(g["points"] for g in run), "start_date": run[0]["gameDate"], "end_date": last["gameDate"],
        }

    out: list[dict] = []
    for log in by_player.values():
        runs: list[list[dict]] = []
        current: list[dict] = []
        for g in log:
            if g["points"] > 0:
                current.append(g)
            else:
                if current:
                    runs.append(current)
                current = []
        if current:
            runs.append(current)
        best = max(runs, key=lambda r: (len(r), sum(g["points"] for g in r)), default=None)
        if best and len(best) >= MIN_GAMES:
            out.append(row("best", best))
        if current and len(current) >= MIN_GAMES:  # the loop ended on a scoring game
            out.append(row("active", current))
    return out


def run() -> None:
    d1 = D1Client(os.environ["CF_ACCOUNT_ID"], os.environ["CF_D1_DATABASE_ID"], os.environ["CF_API_TOKEN"])
    client = NHLClient()
    season_id = current_season_id(client)
    rows = compute_streaks(_fetch_games(client, season_id), season_id)
    d1.execute("DELETE FROM skater_point_streaks")
    _insert_rows(d1, "skater_point_streaks", _COLUMNS, rows)
    print(f"Point streaks: {len(rows)} row(s) written.")


if __name__ == "__main__":
    run()
