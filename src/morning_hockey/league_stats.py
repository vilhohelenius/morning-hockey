"""League-wide (all nationalities) skater and goalie stat leaderboards.

Unlike leaderboard.py's Finnish-only Pistepörssi, these cover every NHL
player and use the "bios" skater report (rather than "summary") because
it's the one that includes nationalityCode and the player's current team
directly, with no need to resolve a traded player's most recent team.
"""
from __future__ import annotations

from dataclasses import dataclass

from .suomiporssi import HEADSHOT_URL, TEAM_LOGO_URL, current_team
from .nhl_api import NHLClient

_SKATER_SORT = (
    '[{"property":"points","direction":"DESC"},'
    '{"property":"goals","direction":"DESC"},'
    '{"property":"skaterFullName","direction":"ASC"}]'
)
_GOALIE_SORT = (
    '[{"property":"savePct","direction":"DESC"},'
    '{"property":"wins","direction":"DESC"},'
    '{"property":"goalieFullName","direction":"ASC"}]'
)


@dataclass(frozen=True)
class SkaterStatRow:
    player_id: int
    name: str
    team: str
    logo: str
    headshot: str
    nationality: str
    position: str
    games_played: int
    goals: int
    assists: int
    points: int


@dataclass(frozen=True)
class GoalieStatRow:
    player_id: int
    name: str
    team: str
    logo: str
    headshot: str
    nationality: str
    games_played: int
    wins: int
    losses: int
    ot_losses: int
    goals_against_average: float
    save_pct: float
    shutouts: int


def skater_row(row: dict, season_id: int) -> SkaterStatRow:
    """Maps one skater/bios report row to a SkaterStatRow. Shared with
    rookies.py, which starts from the same report but a different (rookie-
    filtered) set of rows."""
    return SkaterStatRow(
        player_id=row["playerId"],
        name=row["skaterFullName"],
        team=row["currentTeamAbbrev"],
        logo=TEAM_LOGO_URL.format(abbrev=row["currentTeamAbbrev"]),
        headshot=HEADSHOT_URL.format(
            season=season_id, abbrev=row["currentTeamAbbrev"], player_id=row["playerId"]
        ),
        nationality=row["nationalityCode"],
        position=row["positionCode"],
        games_played=row["gamesPlayed"],
        goals=row["goals"],
        assists=row["assists"],
        points=row["points"],
    )


def cap_per_position(rows: list[dict], limit: int) -> list[dict]:
    """Independently caps forwards and defensemen at `limit` each, instead
    of one flat overall cut, then re-merges them into a single points-sorted
    list. Otherwise filtering the resulting table down to just one position
    on the site would show whatever handful of that position happened to
    land in an overall top-N cut, rather than a genuinely complete top-N for
    that position. Shared with rookies.py, which builds its list the same
    way starting from a different (rookie-filtered) set of rows."""
    forwards = [r for r in rows if r["positionCode"] != "D"][:limit]
    defensemen = [r for r in rows if r["positionCode"] == "D"][:limit]
    return sorted(forwards + defensemen, key=lambda r: (-r["points"], -r["goals"], r["skaterFullName"]))


def build_skater_top(client: NHLClient, season_id: int, limit: int = 1000) -> list[SkaterStatRow]:
    """Default limit is effectively "no cap" (there are nowhere near 1000
    NHL forwards or defensemen in a season) -- Pistepörssi shows every
    synced player, paged 25 at a time client-side, rather than being
    pre-truncated at the source the way it used to be."""
    cayenne_exp = f"seasonId={season_id} and gameTypeId=2"
    rows = client.skater_bios(cayenne_exp, _SKATER_SORT, limit=-1)
    return [skater_row(row, season_id) for row in cap_per_position(rows, limit)]


def _goalie_nationalities(client: NHLClient, season_id: int) -> dict[int, str]:
    """goalie/summary has no nationalityCode; goalie/bios does but lacks GAA/SV%.
    Fetch the bios report once and index it by playerId to merge the two."""
    cayenne_exp = f"seasonId={season_id} and gameTypeId=2"
    sort = '[{"property":"goalieFullName","direction":"ASC"}]'
    bios = client.goalie_bios(cayenne_exp, sort, limit=-1)
    return {row["playerId"]: row["nationalityCode"] for row in bios}


def build_goalie_top(client: NHLClient, season_id: int, limit: int = -1) -> list[GoalieStatRow]:
    cayenne_exp = f"seasonId={season_id} and gameTypeId=2"
    rows = client.goalie_summary(cayenne_exp, _GOALIE_SORT, limit)
    nationalities = _goalie_nationalities(client, season_id)

    goalies = []
    for row in rows:
        team = current_team(row["teamAbbrevs"])
        goalies.append(
            GoalieStatRow(
                player_id=row["playerId"],
                name=row["goalieFullName"],
                team=team,
                logo=TEAM_LOGO_URL.format(abbrev=team),
                headshot=HEADSHOT_URL.format(season=season_id, abbrev=team, player_id=row["playerId"]),
                nationality=nationalities.get(row["playerId"], ""),
                games_played=row["gamesPlayed"],
                wins=row["wins"],
                losses=row["losses"],
                ot_losses=row["otLosses"],
                goals_against_average=row["goalsAgainstAverage"],
                save_pct=row["savePct"],
                shutouts=row["shutouts"],
            )
        )
    return goalies
