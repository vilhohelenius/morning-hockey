"""Build a nightly Digest from raw NHL API payloads."""
from __future__ import annotations

import datetime as dt

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


def scorer_lines(game: dict, finnish_index: dict[int, dict]) -> list[ScorerLine]:
    """Finnish goals + assists for a game, from the /score endpoint's goal list."""
    tally: dict[int, dict] = {}
    for goal in game.get("goals", []):
        scorer_id = goal["playerId"]
        if scorer_id in finnish_index:
            entry = tally.setdefault(scorer_id, {"goals": 0, "assists": 0})
            entry["goals"] += 1
        for assist in goal.get("assists", []):
            assist_id = assist["playerId"]
            if assist_id in finnish_index:
                entry = tally.setdefault(assist_id, {"goals": 0, "assists": 0})
                entry["assists"] += 1

    lines = [
        ScorerLine(
            name=finnish_index[player_id]["name"],
            team=finnish_index[player_id]["team"],
            goals=stats["goals"],
            assists=stats["assists"],
        )
        for player_id, stats in tally.items()
    ]
    lines.sort(key=lambda s: (-s.points, -s.goals, s.name))
    return lines


def goalie_lines(boxscore: dict, finnish_index: dict[int, dict]) -> list[GoalieLine]:
    """Finnish goalies who saw ice time, from the /boxscore endpoint."""
    lines: list[GoalieLine] = []
    stats = boxscore.get("playerByGameStats", {})
    for side in ("awayTeam", "homeTeam"):
        for goalie in stats.get(side, {}).get("goalies", []):
            player_id = goalie["playerId"]
            if player_id not in finnish_index:
                continue
            if goalie.get("toi", "0:00") in ("0:00", "00:00"):
                continue
            lines.append(
                GoalieLine(
                    name=finnish_index[player_id]["name"],
                    team=finnish_index[player_id]["team"],
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

        results.append(
            GameResult(
                game_id=game["id"],
                away=team_info(game["awayTeam"]),
                home=team_info(game["homeTeam"]),
                final_type=final_type(game),
                scorers=scorers,
                goalies=goalies,
            )
        )

    return Digest(
        date=target_date,
        generated_at=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        games=results,
    )
