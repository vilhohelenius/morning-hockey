"""Full NHL standings by division, with playoff qualification highlighted.

The NHL standings API already ranks each team within its division
(`divisionSequence`) and, separately, ranks the teams *not* holding one of
the top-3 automatic division spots against the rest of their conference for
the two wild-card berths (`wildcardSequence`, 0 for automatic qualifiers).
A team is therefore in a playoff spot today if it sits in the top 3 of its
division, or in the top 2 of its conference's wild-card race.
"""
from __future__ import annotations

from dataclasses import dataclass

from .nhl_api import NHLClient

_AUTO_QUALIFY_RANK = 3
_WILDCARD_SPOTS = 2


@dataclass(frozen=True)
class StandingsRow:
    division_rank: int
    wildcard_rank: int  # 0 for teams holding an automatic division spot
    abbrev: str
    name: str
    logo: str
    games_played: int
    wins: int
    losses: int
    ot_losses: int
    points: int
    goal_differential: int
    qualified: bool


@dataclass(frozen=True)
class Division:
    name: str
    conference: str
    rows: list[StandingsRow]


@dataclass(frozen=True)
class Conference:
    name: str
    wildcard_race: list[StandingsRow]


@dataclass(frozen=True)
class StandingsPage:
    as_of_date: str
    divisions: list[Division]
    conferences: list[Conference]


def is_qualified(division_rank: int, wildcard_rank: int) -> bool:
    return division_rank <= _AUTO_QUALIFY_RANK or 1 <= wildcard_rank <= _WILDCARD_SPOTS


def _row(raw: dict) -> StandingsRow:
    division_rank = raw["divisionSequence"]
    wildcard_rank = raw["wildcardSequence"]
    return StandingsRow(
        division_rank=division_rank,
        wildcard_rank=wildcard_rank,
        abbrev=raw["teamAbbrev"]["default"],
        name=raw["teamCommonName"]["default"],
        logo=raw["teamLogo"],
        games_played=raw["gamesPlayed"],
        wins=raw["wins"],
        losses=raw["losses"],
        ot_losses=raw["otLosses"],
        points=raw["points"],
        goal_differential=raw["goalDifferential"],
        qualified=is_qualified(division_rank, wildcard_rank),
    )


def build_standings(client: NHLClient) -> StandingsPage:
    raw_rows = client.standings()["standings"]

    by_division: dict[tuple[str, str], list[dict]] = {}
    by_conference: dict[str, list[dict]] = {}
    for raw in raw_rows:
        by_division.setdefault((raw["conferenceName"], raw["divisionName"]), []).append(raw)
        by_conference.setdefault(raw["conferenceName"], []).append(raw)

    divisions = []
    for (conference_name, division_name), members in sorted(by_division.items()):
        members.sort(key=lambda raw: raw["divisionSequence"])
        divisions.append(
            Division(name=division_name, conference=conference_name, rows=[_row(r) for r in members])
        )
    divisions.sort(key=lambda d: (d.conference, d.name))

    conferences = []
    for conference_name, members in sorted(by_conference.items()):
        wildcard_candidates = sorted(
            (r for r in members if r["wildcardSequence"] > 0),
            key=lambda raw: raw["wildcardSequence"],
        )
        conferences.append(
            Conference(name=conference_name, wildcard_race=[_row(r) for r in wildcard_candidates])
        )
    conferences.sort(key=lambda c: c.name)

    return StandingsPage(
        as_of_date=raw_rows[0]["date"],
        divisions=divisions,
        conferences=conferences,
    )
