"""Build a nightly Digest from raw NHL API payloads."""
from __future__ import annotations

import datetime as dt

import requests

from .boxscore import build_box_score
from .finnish import finnish_players_for_teams
from .models import Digest, GameResult, GoalieLine, ScorerLine, TeamInfo
from .nhl_api import NHLClient

FINISHED_STATES = {"OFF", "FINAL"}


def team_info(payload: dict) -> TeamInfo:
    return TeamInfo(
        abbrev=payload["abbrev"],
        name=payload["name"]["default"],
        logo=payload["logo"],
        score=payload.get("score", 0),
    )


def final_type(game: dict) -> str:
    return game.get("gameOutcome", {}).get("lastPeriodType", "REG")


def scorer_lines(game: dict, player_index: dict[int, dict]) -> list[ScorerLine]:
    """Goals + assists for a game, from the /score endpoint's goal list, for
    whichever players are keyed in player_index (e.g. Finnish players across
    both teams, or one team's own roster)."""
    tally: dict[int, dict] = {}
    for goal in game.get("goals", []):
        scorer_id = goal["playerId"]
        if scorer_id in player_index:
            entry = tally.setdefault(scorer_id, {"goals": 0, "assists": 0})
            entry["goals"] += 1
        for assist in goal.get("assists", []):
            assist_id = assist["playerId"]
            if assist_id in player_index:
                entry = tally.setdefault(assist_id, {"goals": 0, "assists": 0})
                entry["assists"] += 1

    lines = [
        ScorerLine(
            name=player_index[player_id]["name"],
            team=player_index[player_id]["team"],
            goals=stats["goals"],
            assists=stats["assists"],
        )
        for player_id, stats in tally.items()
    ]
    lines.sort(key=lambda s: (-s.points, -s.goals, s.name))
    return lines


def goalie_lines(boxscore: dict, player_index: dict[int, dict]) -> list[GoalieLine]:
    """Goalies who saw ice time, from the /boxscore endpoint, filtered to
    whichever players are keyed in player_index."""
    lines: list[GoalieLine] = []
    stats = boxscore.get("playerByGameStats", {})
    for side in ("awayTeam", "homeTeam"):
        for goalie in stats.get(side, {}).get("goalies", []):
            player_id = goalie["playerId"]
            if player_id not in player_index:
                continue
            if goalie.get("toi", "0:00") in ("0:00", "00:00"):
                continue
            lines.append(
                GoalieLine(
                    name=player_index[player_id]["name"],
                    team=player_index[player_id]["team"],
                    decision=goalie.get("decision"),
                    saves=goalie.get("saves", 0),
                    shots_against=goalie.get("shotsAgainst", 0),
                    save_pct=goalie.get("savePctg"),
                    toi=goalie.get("toi", "0:00"),
                )
            )
    lines.sort(key=lambda g: -g.saves)
    return lines


def build_digest(client: NHLClient, date: str = "now") -> Digest:
    scoreboard = client.scoreboard(date)
    target_date = scoreboard.get("currentDate", date)
    games = [g for g in scoreboard.get("games", []) if g.get("gameState") in FINISHED_STATES]

    results: list[GameResult] = []
    for game in games:
        away_abbrev = game["awayTeam"]["abbrev"]
        home_abbrev = game["homeTeam"]["abbrev"]
        finnish_index = finnish_players_for_teams(client, {away_abbrev, home_abbrev})

        scorers = scorer_lines(game, finnish_index)
        goalies: list[GoalieLine] = []
        if finnish_index:
            boxscore = client.boxscore(game["id"])
            goalies = goalie_lines(boxscore, finnish_index)

        away = team_info(game["awayTeam"])
        home = team_info(game["homeTeam"])
        box_score = None
        try:
            box_score = build_box_score(client, game["id"], away.score, home.score)
        except (requests.exceptions.RequestException, KeyError, TypeError) as error:
            # Enrichment, not core data: a hiccup on one game's box score
            # shouldn't take down the whole night's digest.
            print(f"  huom: ottelun {game['id']} tapahtumatietoja ei saatu ({error}).")

        results.append(
            GameResult(
                game_id=game["id"],
                away=away,
                home=home,
                final_type=final_type(game),
                scorers=scorers,
                goalies=goalies,
                box_score=box_score,
            )
        )

    return Digest(
        date=target_date,
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        games=results,
    )
