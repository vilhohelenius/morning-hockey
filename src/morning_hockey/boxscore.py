"""Full per-game box score: a chronological goal timeline and a team-vs-team
stat comparison, built from the /landing and /right-rail endpoints.

Unlike the Finnish-only scorer/goalie lines built elsewhere from the /score
endpoint's goal list, /landing's scoring summary already carries full names
for both the scorer and every assister, so there's no need to cross-
reference a roster to resolve them.
"""
from __future__ import annotations

from .models import GameBoxScore, GoalEvent, TeamStatRow
from .nhl_api import NHLClient

_PERIOD_NUMBER_LABELS = {1: "1. erä", 2: "2. erä", 3: "3. erä"}
_STRENGTH_LABELS = {"pp": "YV", "sh": "AV"}


def _period_label(descriptor: dict) -> str:
    period_type = descriptor.get("periodType", "REG")
    if period_type == "OT":
        return "Jatkoaika"
    if period_type == "SO":
        return "Voittolaukaukset"
    return _PERIOD_NUMBER_LABELS.get(descriptor.get("number", 0), f"{descriptor.get('number', 0)}. erä")


def _player_name(person: dict) -> str:
    return f"{person['firstName']['default']} {person['lastName']['default']}"


def build_goal_events(scoring_by_period: list[dict]) -> list[GoalEvent]:
    events = []
    for period in scoring_by_period:
        label = _period_label(period.get("periodDescriptor", {}))
        for goal in period.get("goals", []):
            events.append(
                GoalEvent(
                    period_label=label,
                    time_in_period=goal["timeInPeriod"],
                    team_abbrev=goal["teamAbbrev"]["default"],
                    scorer=_player_name(goal),
                    assists=[_player_name(a) for a in goal.get("assists", [])],
                    strength=_STRENGTH_LABELS.get(goal.get("strength"), ""),
                )
            )
    return events


def _percent(value: float) -> str:
    return f"{value * 100:.1f} %"


def _power_play_display(attempts: str, pct: float) -> str:
    if attempts.endswith("/0"):
        return "–"
    return f"{attempts} ({_percent(pct)})"


def build_team_stats(team_game_stats: list[dict], away_score: int, home_score: int) -> list[TeamStatRow]:
    by_category = {row["category"]: row for row in team_game_stats}

    def raw(category: str) -> tuple[object, object]:
        row = by_category.get(category)
        if row is None:
            return None, None
        return row["awayValue"], row["homeValue"]

    away_sog, home_sog = raw("sog")
    away_pp_pct, home_pp_pct = raw("powerPlayPctg")
    away_pp, home_pp = raw("powerPlay")
    away_faceoff, home_faceoff = raw("faceoffWinningPctg")
    away_pim, home_pim = raw("pim")

    away_save_pct = 1 - (home_score / home_sog) if home_sog else None
    home_save_pct = 1 - (away_score / away_sog) if away_sog else None

    return [
        TeamStatRow(
            "Laukaukset",
            str(away_sog) if away_sog is not None else "–",
            str(home_sog) if home_sog is not None else "–",
        ),
        TeamStatRow(
            "Torjuntaprosentti",
            _percent(away_save_pct) if away_save_pct is not None else "–",
            _percent(home_save_pct) if home_save_pct is not None else "–",
        ),
        TeamStatRow(
            "Ylivoima (YV%)",
            _power_play_display(away_pp, away_pp_pct) if away_pp is not None else "–",
            _power_play_display(home_pp, home_pp_pct) if home_pp is not None else "–",
        ),
        TeamStatRow(
            "Alivoima (AV%)",
            _percent(1 - home_pp_pct) if home_pp_pct is not None else "–",
            _percent(1 - away_pp_pct) if away_pp_pct is not None else "–",
        ),
        TeamStatRow(
            "Aloitusprosentti",
            _percent(away_faceoff) if away_faceoff is not None else "–",
            _percent(home_faceoff) if home_faceoff is not None else "–",
        ),
        TeamStatRow(
            "Jäähyt (min)",
            str(away_pim) if away_pim is not None else "–",
            str(home_pim) if home_pim is not None else "–",
        ),
    ]


def build_box_score(client: NHLClient, game_id: int, away_score: int, home_score: int) -> GameBoxScore:
    landing = client.landing(game_id)
    right_rail = client.right_rail(game_id)

    goals = build_goal_events(landing.get("summary", {}).get("scoring", []))
    team_stats = build_team_stats(right_rail.get("teamGameStats", []), away_score, home_score)

    return GameBoxScore(goals=goals, team_stats=team_stats)
