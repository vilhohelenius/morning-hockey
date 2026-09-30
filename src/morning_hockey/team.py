"""A single team's dashboard: roster, recent/upcoming games, division standing."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from .digest import FINISHED_STATES
from .nhl_api import NHLClient

HELSINKI = ZoneInfo("Europe/Helsinki")

_RECENT_GAMES = 10
_UPCOMING_GAMES = 10
_REGULAR_SEASON = 2


@dataclass(frozen=True)
class RosterSkater:
    player_id: int
    name: str
    position: str
    sweater_number: int
    headshot: str
    games_played: int
    goals: int
    assists: int
    points: int
    plus_minus: int
    avg_toi_seconds: float
    avg_toi: str  # "MM:SS" per game, for display -- avg_toi_seconds is the sortable form


@dataclass(frozen=True)
class RosterGoalie:
    player_id: int
    name: str
    sweater_number: int
    headshot: str
    games_played: int
    wins: int
    losses: int
    ot_losses: int
    goals_against_average: float
    save_pct: float


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
class SeasonStats:
    games_played: int
    goals_for: int
    goals_against: int
    goal_differential: int
    power_play_pct: float
    penalty_kill_pct: float
    faceoff_pct: float
    shots_for_per_game: float
    shots_against_per_game: float
    shutouts: int


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
    season_stats: SeasonStats | None
    skaters: list[RosterSkater]
    goalies: list[RosterGoalie]
    recent_games: list[ScheduleGame]
    upcoming_games: list[ScheduleGame]


def _player_name(player: dict) -> str:
    return f"{player['firstName']['default']} {player['lastName']['default']}"


def _format_toi(seconds: float) -> str:
    minutes, secs = divmod(int(round(seconds)), 60)
    return f"{minutes}:{secs:02d}"


def _build_skaters(client: NHLClient, season_id: int, raw_roster: dict) -> list[RosterSkater]:
    # Unfiltered, like _build_goalies below: merging happens by player id
    # against the roster's own player list, so team-filtering this query
    # would only be an optimization, not something correctness depends on.
    cayenne_exp = f"seasonId={season_id} and gameTypeId=2"
    sort = '[{"property":"points","direction":"DESC"}]'
    stats_by_id = {row["playerId"]: row for row in client.skater_summary(cayenne_exp, sort, limit=-1)}

    skaters = []
    for player in raw_roster.get("forwards", []) + raw_roster.get("defensemen", []):
        stats = stats_by_id.get(player["id"], {})
        skaters.append(
            RosterSkater(
                player_id=player["id"],
                name=_player_name(player),
                position=player["positionCode"],
                sweater_number=player.get("sweaterNumber", 0),
                headshot=player.get("headshot", ""),
                games_played=stats.get("gamesPlayed", 0),
                goals=stats.get("goals", 0),
                assists=stats.get("assists", 0),
                points=stats.get("points", 0),
                plus_minus=stats.get("plusMinus", 0),
                avg_toi_seconds=stats.get("timeOnIcePerGame", 0.0),
                avg_toi=_format_toi(stats.get("timeOnIcePerGame", 0.0)),
            )
        )
    skaters.sort(key=lambda s: (-s.points, -s.goals, s.name))
    return skaters


def _build_goalies(client: NHLClient, season_id: int, raw_roster: dict) -> list[RosterGoalie]:
    cayenne_exp = f"seasonId={season_id} and gameTypeId=2"
    sort = '[{"property":"savePct","direction":"DESC"}]'
    stats_by_id = {row["playerId"]: row for row in client.goalie_summary(cayenne_exp, sort, limit=-1)}

    goalies = []
    for player in raw_roster.get("goalies", []):
        stats = stats_by_id.get(player["id"], {})
        goalies.append(
            RosterGoalie(
                player_id=player["id"],
                name=_player_name(player),
                sweater_number=player.get("sweaterNumber", 0),
                headshot=player.get("headshot", ""),
                games_played=stats.get("gamesPlayed", 0),
                wins=stats.get("wins", 0),
                losses=stats.get("losses", 0),
                ot_losses=stats.get("otLosses", 0),
                goals_against_average=stats.get("goalsAgainstAverage", 0.0),
                save_pct=stats.get("savePct", 0.0),
            )
        )
    goalies.sort(key=lambda g: -g.save_pct)
    return goalies


def game_result(team_score: int, opponent_score: int, final_type: str) -> str:
    if team_score > opponent_score:
        return "W"
    return "OTL" if final_type != "REG" else "L"


def team_display_name(payload: dict) -> str:
    """club-schedule-season and the weekly schedule endpoint both key a
    team's short name as "commonName"; fall back to "name" (the scoreboard
    endpoint's field) or the abbreviation if neither is present, so feeding
    this a slightly different schedule-shaped payload doesn't crash."""
    for key in ("commonName", "name"):
        if key in payload:
            return payload[key]["default"]
    return payload["abbrev"]


def split_schedule(team_abbrev: str, games: list[dict]) -> tuple[list[ScheduleGame], list[ScheduleGame]]:
    """Split a team's games into played (most recent last-N, newest first)
    and upcoming (next-N). Assumes `games` is already in chronological
    order, as club-schedule-season returns it; a caller merging several
    weeks of the league-wide schedule must sort by date first."""
    recent: list[ScheduleGame] = []
    upcoming: list[ScheduleGame] = []

    for game in games:
        if game.get("gameType") != _REGULAR_SEASON:
            continue

        is_home = game["homeTeam"]["abbrev"] == team_abbrev
        away_is_this_team = game["awayTeam"]["abbrev"] == team_abbrev
        if not is_home and not away_is_this_team:
            continue

        team = game["homeTeam"] if is_home else game["awayTeam"]
        opponent = game["awayTeam"] if is_home else game["homeTeam"]

        # "gameDate" is the NHL's own nominal (US-schedule) date, not the
        # calendar date the game actually falls on in Finland -- a game
        # starting late enough in the US evening is already past midnight
        # in Helsinki. Derive the displayed date from the real start time
        # instead, same fix as schedule.py's Otteluohjelma page.
        start_utc = dt.datetime.fromisoformat(game["startTimeUTC"].replace("Z", "+00:00"))
        local_date = start_utc.astimezone(HELSINKI).date().isoformat()

        base = dict(
            game_id=game["id"],
            date=local_date,
            is_home=is_home,
            opponent_abbrev=opponent["abbrev"],
            opponent_name=team_display_name(opponent),
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


def _build_season_stats(client: NHLClient, team_full_name: str, season_id: int) -> SeasonStats | None:
    cayenne_exp = f"seasonId={season_id} and gameTypeId=2"
    rows = client.team_summary(cayenne_exp, "[]", limit=-1)
    row = next((r for r in rows if r["teamFullName"] == team_full_name), None)
    if row is None:
        return None
    return SeasonStats(
        games_played=row["gamesPlayed"],
        goals_for=row["goalsFor"],
        goals_against=row["goalsAgainst"],
        goal_differential=row["goalsFor"] - row["goalsAgainst"],
        power_play_pct=row["powerPlayPct"],
        penalty_kill_pct=row["penaltyKillPct"],
        faceoff_pct=row["faceoffWinPct"],
        shots_for_per_game=row["shotsForPerGame"],
        shots_against_per_game=row["shotsAgainstPerGame"],
        shutouts=row["teamShutouts"],
    )


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


def build_team_page(client: NHLClient, team_abbrev: str, season_id: int) -> TeamPage:
    standings = client.standings()
    team_row = next(
        row for row in standings["standings"] if row["teamAbbrev"]["default"] == team_abbrev
    )
    division_table = _division_table(standings, team_row["divisionAbbrev"], team_abbrev)
    season_stats = _build_season_stats(client, team_row["teamName"]["default"], season_id)

    schedule = client.club_schedule_season(team_abbrev)
    recent_games, upcoming_games = split_schedule(team_abbrev, schedule["games"])

    raw_roster = client.roster(team_abbrev)
    skaters = _build_skaters(client, season_id, raw_roster)
    goalies = _build_goalies(client, season_id, raw_roster)

    return TeamPage(
        abbrev=team_abbrev,
        name=team_row["teamName"]["default"],
        logo=team_row["teamLogo"],
        division_name=team_row["divisionName"],
        division_rank=team_row["divisionSequence"],
        streak=f"{team_row['streakCode']}{team_row['streakCount']}",
        division_table=division_table,
        season_stats=season_stats,
        skaters=skaters,
        goalies=goalies,
        recent_games=recent_games,
        upcoming_games=upcoming_games,
    )


def build_all_team_rosters(
    client: NHLClient, team_abbrevs: list[str], season_id: int
) -> dict[str, tuple[list[RosterSkater], list[RosterGoalie]]]:
    """Roster + season stats for every given team, reusing _build_skaters/
    _build_goalies unchanged. One roster() call per team is unavoidable (no
    league-wide roster endpoint exists), but the skater_summary/goalie_summary
    calls those helpers make are identical across every call, so NHLClient's
    per-instance cache means they're only actually fetched once, not once
    per team."""
    rosters = {}
    for abbrev in team_abbrevs:
        raw_roster = client.roster(abbrev)
        rosters[abbrev] = (_build_skaters(client, season_id, raw_roster), _build_goalies(client, season_id, raw_roster))
    return rosters


def build_all_team_season_stats(
    client: NHLClient, team_abbrevs: list[str], season_id: int
) -> dict[str, SeasonStats | None]:
    """Team-level season stats (PP%/PK%/faceoff%/shots) for every given
    team, reusing _build_season_stats unchanged -- its own team_summary
    call is cached the same way across every team."""
    standings = client.standings()
    name_by_abbrev = {row["teamAbbrev"]["default"]: row["teamName"]["default"] for row in standings["standings"]}
    return {
        abbrev: _build_season_stats(client, name_by_abbrev[abbrev], season_id)
        for abbrev in team_abbrevs
        if abbrev in name_by_abbrev
    }
