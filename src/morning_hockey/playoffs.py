"""'If the playoffs started today' bracket, built live from the standings.

NHL first-round seeding (fixed bracket, no reseeding between rounds):
  - the conference's two division leaders are ranked by points; the one with
    MORE points plays the WEAKER wild card (WC2), and the one with FEWER
    points plays the STRONGER wild card (WC1) — this rewards the better
    division winner with the easier of the two wild-card opponents.
  - each division's 2nd- and 3rd-place teams play each other.
Rounds 2 onward can't be filled with real teams yet since they depend on
unplayed round-1 series, so the bracket only resolves round 1 and leaves
later rounds as seed-shaped placeholders.
"""
from __future__ import annotations

from dataclasses import dataclass

from .standings import Division, StandingsPage, StandingsRow


@dataclass(frozen=True)
class Matchup:
    higher_seed_label: str
    higher_seed: StandingsRow
    lower_seed_label: str
    lower_seed: StandingsRow


@dataclass(frozen=True)
class ConferenceBracket:
    name: str
    round1: list[Matchup]  # fixed order: [strong-div-1 vs WC2, strong-div 2 vs 3, weak-div-1 vs WC1, weak-div 2 vs 3]
    wildcard_race: list[StandingsRow]


@dataclass(frozen=True)
class PlayoffBracket:
    as_of_date: str
    conferences: list[ConferenceBracket]


def _top_three(division: Division) -> list[StandingsRow]:
    return sorted(division.rows, key=lambda row: row.division_rank)[:3]


def _conference_bracket(conference_name: str, conf_divisions: list[Division], wildcard_race: list[StandingsRow]) -> ConferenceBracket:
    div_x, div_y = conf_divisions
    top_x, top_y = _top_three(div_x), _top_three(div_y)

    if top_x[0].points >= top_y[0].points:
        strong_div, strong_top3 = div_x, top_x
        weak_div, weak_top3 = div_y, top_y
    else:
        strong_div, strong_top3 = div_y, top_y
        weak_div, weak_top3 = div_x, top_x

    wc1, wc2 = wildcard_race[0], wildcard_race[1]

    round1 = [
        Matchup(f"{strong_div.name} 1", strong_top3[0], "Villikortti 2", wc2),
        Matchup(f"{strong_div.name} 2", strong_top3[1], f"{strong_div.name} 3", strong_top3[2]),
        Matchup(f"{weak_div.name} 1", weak_top3[0], "Villikortti 1", wc1),
        Matchup(f"{weak_div.name} 2", weak_top3[1], f"{weak_div.name} 3", weak_top3[2]),
    ]

    return ConferenceBracket(name=conference_name, round1=round1, wildcard_race=wildcard_race)


def build_bracket(page: StandingsPage) -> PlayoffBracket:
    conferences = []
    for conference in page.conferences:
        conf_divisions = [d for d in page.divisions if d.conference == conference.name]
        conferences.append(
            _conference_bracket(conference.name, conf_divisions, conference.wildcard_race)
        )

    return PlayoffBracket(as_of_date=page.as_of_date, conferences=conferences)
