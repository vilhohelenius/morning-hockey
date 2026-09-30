"""Rookie points leaderboard.

The bulk skater/bios stats report has no rookie flag, so the NHL's own
eligibility rule is applied per candidate: a player is a rookie if, before
this season, they never played more than 25 NHL regular-season games in a
single season, never played 6+ games in each of two separate seasons, and
are under 26 years old as of September 15 of this season.

Checking every league skater against this would mean one player_landing()
call per player (~800), so a cheap prefilter narrows the field first: only
players whose first NHL season (already present in the bios report) is this
season or one of the two before it are even considered as candidates —
anyone who debuted earlier would already have blown past the game/season
limits in virtually every real case.
"""
from __future__ import annotations

import datetime as dt

from .league_stats import SkaterStatRow, cap_per_position, skater_row
from .nhl_api import NHLClient

_CANDIDATE_SEASON_WINDOW = 2  # seasons back from the current one to consider
_SEASON_ID_STEP = 10001  # difference between two consecutive season ids, e.g. 20262027 - 20252026

_SORT = (
    '[{"property":"points","direction":"DESC"},'
    '{"property":"goals","direction":"DESC"},'
    '{"property":"skaterFullName","direction":"ASC"}]'
)


def _season_start_year(season_id: int) -> int:
    return int(str(season_id)[:4])


def _is_candidate(row: dict, season_id: int) -> bool:
    first_season = row.get("firstSeasonForGameType")
    if not first_season:
        return False
    return first_season >= season_id - _CANDIDATE_SEASON_WINDOW * _SEASON_ID_STEP


def _age_on_cutoff(birth_date: str, season_id: int) -> int:
    born = dt.date.fromisoformat(birth_date)
    cutoff = dt.date(_season_start_year(season_id), 9, 15)
    return cutoff.year - born.year - ((cutoff.month, cutoff.day) < (born.month, born.day))


def _is_rookie(landing: dict, season_id: int) -> bool:
    if _age_on_cutoff(landing["birthDate"], season_id) >= 26:
        return False

    prior_nhl_games = [
        season["gamesPlayed"]
        for season in landing.get("seasonTotals", [])
        if season.get("leagueAbbrev") == "NHL" and season.get("gameTypeId") == 2 and season["season"] < season_id
    ]
    if any(gp > 25 for gp in prior_nhl_games):
        return False
    if sum(1 for gp in prior_nhl_games if gp >= 6) >= 2:
        return False
    return True


def build_rookie_top(client: NHLClient, season_id: int, limit: int = 100) -> list[SkaterStatRow]:
    cayenne_exp = f"seasonId={season_id} and gameTypeId=2"
    all_skaters = client.skater_bios(cayenne_exp, _SORT, limit=-1)

    rookies = []
    for row in all_skaters:
        if not _is_candidate(row, season_id):
            continue
        landing = client.player_landing(row["playerId"])
        if _is_rookie(landing, season_id):
            rookies.append(row)

    return [skater_row(row, season_id) for row in cap_per_position(rookies, limit)]
