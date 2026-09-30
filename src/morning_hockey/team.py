"""A single team's dashboard: roster, recent/upcoming games, division standing."""
from __future__ import annotations

from dataclasses import dataclass

from .digest import FINISHED_STATES
from .nhl_api import NHLClient

_RECENT_GAMES = 10
_UPCOMING_GAMES = 10
_REGULAR_SEASON = 2


@dataclass(frozen=True)
class RosterPlayer:
    player_id: int
    name: str
    position: str
    sweater_number: int
    headshot: str


@dataclass(frozen=True)
class ScheduleGame:
    game_id: int
    date: str
    is_home: bool
    opponent_abbrev: str
    opponent_name: str
    opponent_logo: str
    team_score: int | None
    opponent_score: int | None
    final_type: str | None  # "REG" | "OT" | "SO", only for played games
    result: str | None  # "W" | "L" | "OTL", only for played games


@dataclass(frozen=True)
class DivisionRow:
    abbrev: str
    name: str
    logo: str
    rank: int
    games_played: int
    wins: int
    losses: int
    ot_losses: int
    points: int
    is_team: bool


@dataclass(frozen=True)
class TeamPage:
    abbrev: str
    name: str
    logo: str
    division_name: str
    division_rank: int
    streak: str
    division_table: list[DivisionRow]
    roster: dict[str, list[RosterPlayer]]
    recent_games: list[ScheduleGame]
    upcoming_games: list[ScheduleGame]


def _roster_group(players: list[dict]) -> list[RosterPlayer]:
    group = [
        RosterPlayer(
            player_id=player["id"],
            name=f"{player['firstName']['default']} {player['lastName']['default']}",
            position=player["positionCode"],
            sweater_number=player.get("sweaterNumber", 0),
            headshot=player.get("headshot", ""),
        )
        for player in players
    ]
    group.sort(key=lambda p: p.sweater_number)
    return group


def _build_roster(raw_roster: dict) -> dict[str, list[RosterPlayer]]:
    return {
        "forwards": _roster_group(raw_roster.get("forwards", [])),
        "defensemen": _roster_group(raw_roster.get("defensemen", [])),
        "goalies": _roster_group(raw_roster.get("goalies", [])),
    }


def game_result(team_score: int, opponent_score: int, final_type: str) -> str:
    if team_score > opponent_score:
        return "W"
    return "OTL" if final_type != "REG" else "L"


def _split_schedule(team_abbrev: str, games: list[dict]) -> tuple[list[ScheduleGame], list[ScheduleGame]]:
    recent: list[ScheduleGame] = []
    upcoming: list[ScheduleGame] = []

    for game in games:
        if game.get("gameType") != _REGULAR_SEASON:
            continue

        is_home = game["homeTeam"]["abbrev"] == team_abbrev
        team = game["homeTeam"] if is_home else game["awayTeam"]
        opponent = game["awayTeam"] if is_home else game["homeTeam"]

        base = dict(
            game_id=game["id"],
            date=game["gameDate"],
            is_home=is_home,
            opponent_abbrev=opponent["abbrev"],
            opponent_name=opponent["commonName"]["default"],
            opponent_logo=opponent["logo"],
        )

        if game.get("gameState") in FINISHED_STATES:
            team_score = team.get("score")
            opponent_score = opponent.get("score")
            if team_score is None or opponent_score is None:
                continue
            final_type = game.get("gameOutcome", {}).get("lastPeriodType", "REG")
            recent.append(
                ScheduleGame(
                    **base,
                    team_score=team_score,
                    opponent_score=opponent_score,
                    final_type=final_type,
                    result=game_result(team_score, opponent_score, final_type),
                )
            )
        else:
            upcoming.append(
                ScheduleGame(
                    **base,
                    team_score=None,
                    opponent_score=None,
                    final_type=None,
                    result=None,
                )
            )

    recent = recent[-_RECENT_GAMES:]
    recent.reverse()
    upcoming = upcoming[:_UPCOMING_GAMES]
    return recent, upcoming


def _division_table(standings: dict, division_abbrev: str, team_abbrev: str) -> list[DivisionRow]:
    division_teams = sorted(
        (row for row in standings["standings"] if row["divisionAbbrev"] == division_abbrev),
        key=lambda row: row["divisionSequence"],
    )
    return [
        DivisionRow(
            abbrev=row["teamAbbrev"]["default"],
            name=row["teamCommonName"]["default"],
            logo=row["teamLogo"],
            rank=row["divisionSequence"],
            games_played=row["gamesPlayed"],
            wins=row["wins"],
            losses=row["losses"],
            ot_losses=row["otLosses"],
            points=row["points"],
            is_team=row["teamAbbrev"]["default"] == team_abbrev,
        )
        for row in division_teams
    ]


def build_team_page(client: NHLClient, team_abbrev: str) -> TeamPage:
    standings = client.standings()
    team_row = next(
        row for row in standings["standings"] if row["teamAbbrev"]["default"] == team_abbrev
    )
    division_table = _division_table(standings, team_row["divisionAbbrev"], team_abbrev)

    schedule = client.club_schedule_season(team_abbrev)
    recent_games, upcoming_games = _split_schedule(team_abbrev, schedule["games"])

    roster = _build_roster(client.roster(team_abbrev))

    return TeamPage(
        abbrev=team_abbrev,
        name=team_row["teamName"]["default"],
        logo=team_row["teamLogo"],
        division_name=team_row["divisionName"],
        division_rank=team_row["divisionSequence"],
        streak=f"{team_row['streakCode']}{team_row['streakCount']}",
        division_table=division_table,
        roster=roster,
        recent_games=recent_games,
        upcoming_games=upcoming_games,
    )
