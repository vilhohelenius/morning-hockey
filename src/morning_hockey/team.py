"""Per-team roster and season stats, for every team -- feeds the slow-tier
D1 sync (sync_slow_tier.py), which syncs all 32 teams' rosters/season stats
at once via build_all_team_rosters/build_all_team_season_stats below."""
from __future__ import annotations

from dataclasses import dataclass

from .nhl_api import NHLClient


@dataclass(frozen=True)
class RosterSkater:
    player_id: int
    name: str
    position: str
    nationality: str
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
    nationality: str
    sweater_number: int
    headshot: str
    games_played: int
    wins: int
    losses: int
    ot_losses: int
    goals_against_average: float
    save_pct: float
    shutouts: int


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
                nationality=player.get("birthCountry", ""),
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
                nationality=player.get("birthCountry", ""),
                sweater_number=player.get("sweaterNumber", 0),
                headshot=player.get("headshot", ""),
                games_played=stats.get("gamesPlayed", 0),
                wins=stats.get("wins", 0),
                losses=stats.get("losses", 0),
                ot_losses=stats.get("otLosses", 0),
                goals_against_average=stats.get("goalsAgainstAverage", 0.0),
                save_pct=stats.get("savePct", 0.0),
                shutouts=stats.get("shutouts", 0),
            )
        )
    goalies.sort(key=lambda g: -g.save_pct)
    return goalies


def team_display_name(payload: dict) -> str:
    """club-schedule-season and the weekly schedule endpoint both key a
    team's short name as "commonName"; fall back to "name" (the scoreboard
    endpoint's field) or the abbreviation if neither is present, so feeding
    this a slightly different schedule-shaped payload doesn't crash."""
    for key in ("commonName", "name"):
        if key in payload:
            return payload[key]["default"]
    return payload["abbrev"]


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
