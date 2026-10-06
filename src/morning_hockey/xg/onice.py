"""Per-skater on-ice xG for/against from one play-by-play JSON plus the NHL
shift chart rows (api.nhle.com/stats/rest/en/shiftcharts).

Conventions (validated on real games: skater TOI equals the boxscore TOI to
the second, and every 5v5 shot sees exactly 5 skaters per side):
- Only typeCode 517 rows are shifts; 505 rows are goal events and are skipped.
- A shift covers the seconds start <= s < end (TOI), and a shot at second t
  belongs to the players with start < t <= end: the event is stamped with the
  second that just ended, so a player leaving at t was still on the ice for it.
- Goalies (pbp rosterSpots positionCode G) are excluded; only skaters count.
- 5v5 = the shot's own situationCode (shooterSkaters == defenderSkaters == 5,
  no empty net). 5v5 TOI uses the play-by-play situationCode in force at each
  second (last play with time <= second equals 1551).
"""
from __future__ import annotations

from collections import defaultdict

from .compute import shot_probabilities

_SHIFT = 517
_EVEN_STRENGTH = "1551"  # away goalie, 5, 5, home goalie


def _sec(clock: str) -> int:
    minutes, seconds = clock.split(":")
    return int(minutes) * 60 + int(seconds)


def _strength_by_second(plays: list[dict], period: int, length: int) -> list[bool]:
    """True for every second of the period played 5v5 with both goalies in."""
    events = sorted(
        (_sec(p["timeInPeriod"]), p["sortOrder"], p["situationCode"])
        for p in plays
        if p["periodDescriptor"]["number"] == period and "situationCode" in p
    )
    even, code, i = [], _EVEN_STRENGTH, 0
    for second in range(length):
        while i < len(events) and events[i][0] <= second:
            code = events[i][2]
            i += 1
        even.append(code == _EVEN_STRENGTH)
    return even


def onice_game(play_by_play: dict, shifts: list[dict]) -> list[dict]:
    """One row per skater who has a shift, shaped like skater_game_onice_xg."""
    goalies = {s["playerId"] for s in play_by_play.get("rosterSpots", []) if s["positionCode"] == "G"}
    # (player, team) -> period -> set of seconds on ice [start, end)
    seconds: dict[tuple[int, int], dict[int, set[int]]] = defaultdict(lambda: defaultdict(set))
    for row in shifts:
        if row.get("typeCode") != _SHIFT or row["playerId"] in goalies:
            continue
        if not row.get("startTime") or not row.get("endTime"):
            continue
        start, end = _sec(row["startTime"]), _sec(row["endTime"])
        if end > start:
            seconds[(row["playerId"], row["teamId"])][row["period"]].update(range(start, end))
    if not seconds:
        return []

    period_length: dict[int, int] = defaultdict(int)
    for per in seconds.values():
        for period, secs in per.items():
            period_length[period] = max(period_length[period], max(secs) + 1)
    even = {p: _strength_by_second(play_by_play["plays"], p, n) for p, n in period_length.items()}

    stats = {
        key: {"toi_sec": 0, "toi_5v5_sec": 0, "xgf": 0.0, "xga": 0.0, "xgf_5v5": 0.0, "xga_5v5": 0.0}
        for key in seconds
    }
    for key, per in seconds.items():
        for period, secs in per.items():
            stats[key]["toi_sec"] += len(secs)
            stats[key]["toi_5v5_sec"] += sum(1 for s in secs if even[period][s])

    # shots: game_shots already skips shootouts; period index -> teams' on-ice players
    shots = shot_probabilities(play_by_play)
    if not shots.empty:
        for shot in shots.itertuples():
            t = int(shot.secInPeriod)
            is_5v5 = shot.shooterSkaters == 5 and shot.defenderSkaters == 5 and shot.emptyNet == 0
            for (player, team), per in seconds.items():
                if team not in (shot.teamId, shot.oppId) or t - 1 not in per.get(int(shot.period), ()):
                    continue
                own = team == shot.teamId
                row = stats[(player, team)]
                row["xgf" if own else "xga"] += float(shot.xg_skater)
                if is_5v5:
                    row["xgf_5v5" if own else "xga_5v5"] += float(shot.xg_skater)

    season = int(play_by_play["season"])
    return [
        {"game_id": int(play_by_play["id"]), "player_id": player, "team_id": team, "season": season,
         "game_date": play_by_play["gameDate"], **values}
        for (player, team), values in sorted(stats.items())
    ]
