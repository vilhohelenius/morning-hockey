"""Season simulation (playoff odds): plays the rest of the regular season 100 000
times with the pre-game win probability model and writes one snapshot per day to
season_sim. Mirrors xGoalBoost/winprob/simulate_season.py; team states come from
D1 history (load_history) and the schedule from the NHL API, so nothing is local."""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import numpy as np

from ..d1_sync import D1Client, _insert_rows
from ..nhl_api import NHLClient
from .model import MODEL, WinProbState
from .simcore import outcome_cum, series_win, shrink, simulate
from .sync import _TEAM_IDS, _rows, load_history

HORIZON_DAYS = 80  # winprob/backtest_horizon.py: shrink factor 1 / (1 + days ahead / horizon)
SIMS = 100_000
_FINISHED = {"FINAL", "OFF"}
_COLUMNS = [
    "season", "as_of", "abbrev", "games_played", "points", "exp_points", "points_p10", "points_p90",
    "p_playoffs", "p_division", "p_presidents", "p_cup",
]


def fetch_schedule(client: NHLClient, abbrevs: list[str]) -> list[dict]:
    """Regular-season games of the running season, deduplicated over the 32 club schedules."""
    games: dict[int, dict] = {}
    for abbrev in abbrevs:
        for g in client.club_schedule_season(abbrev)["games"]:
            if g["gameType"] == 2:
                games[g["id"]] = {
                    "id": g["id"], "season": g["season"], "date": g["gameDate"],
                    "home": g["homeTeam"]["abbrev"], "away": g["awayTeam"]["abbrev"],
                    "home_score": g["homeTeam"].get("score", 0), "away_score": g["awayTeam"].get("score", 0),
                    "finished": g["gameState"] in _FINISHED,
                    "final_type": (g.get("gameOutcome") or {}).get("lastPeriodType", "REG"),
                }
    return sorted(games.values(), key=lambda g: (g["date"], g["id"]))


def series_matrix(state: WinProbState, abbrevs: list[str], season: int, day: dt.date, days_ahead: int,
                  horizon: float) -> np.ndarray:
    """sw[i, j]: team i (home ice) wins a best-of-7 against j, from today's team states shrunk to the playoff date."""
    n = len(abbrevs)
    lin = np.zeros((n, n))
    for i, h in enumerate(abbrevs):
        for j, a in enumerate(abbrevs):
            if i != j:
                f = state.features(_TEAM_IDS[h], _TEAM_IDS[a], season, day, {})
                lin[i, j] = sum(MODEL["coef"][c] * f[c] for cols in MODEL["groups"].values() for c in cols)
    p = shrink(lin, days_ahead, MODEL["intercept"], horizon)  # p[i, j]: home i beats away j
    return series_win(p, 1 - p.T)


def simulate_season(history: list[dict], schedule: list[dict], divisions: dict[str, tuple[str, str]], today: dt.date,
                    sims: int = SIMS, horizon: float = HORIZON_DAYS, seed: int = 1) -> list[dict]:
    """season_sim rows. divisions: abbrev -> (conference, division)."""
    abbrevs = sorted(divisions)
    idx = {a: i for i, a in enumerate(abbrevs)}
    season = schedule[0]["season"]
    state = WinProbState()
    for g in history:
        state.update(g)

    base, gp = np.zeros((4, len(abbrevs))), np.zeros(len(abbrevs))
    for g in schedule:
        if not g["finished"]:
            continue
        for a, own, opp in ((g["home"], g["home_score"], g["away_score"]), (g["away"], g["away_score"], g["home_score"])):
            i, won, per = idx[a], own > opp, g["final_type"]
            gp[i] += 1
            base[0, i] += 2 if won else (1 if per != "REG" else 0)
            base[1, i] += won and per == "REG"
            base[2, i] += won and per != "SO"
            base[3, i] += won

    rem = [g for g in schedule if not g["finished"]]
    last = dict(state.last_date)  # a team's later games count the earlier ones for back-to-backs
    lin, ahead = [], []
    for g in rem:
        home, away, day = _TEAM_IDS[g["home"]], _TEAM_IDS[g["away"]], dt.date.fromisoformat(g["date"])
        f = state.features(home, away, season, day, last)
        last[home] = last[away] = day
        lin.append(sum(MODEL["coef"][c] * f[c] for cols in MODEL["groups"].values() for c in cols))
        ahead.append(max((day - today).days, 0))
    p = shrink(lin, ahead, MODEL["intercept"], horizon)

    prior = [g for g in history if g["season"] < season] or history  # OT/SO shares from earlier seasons
    ot = [g for g in prior if g["final_type"] != "REG"]
    ot_rate = len(ot) / max(len(prior), 1)
    so_share = sum(g["final_type"] == "SO" for g in ot) / max(len(ot), 1)

    divs: dict[str, list[int]] = {}
    confs: dict[str, list[int]] = {}
    for a, (conf, div) in divisions.items():
        divs.setdefault(div, []).append(idx[a])
        confs.setdefault(conf, []).append(idx[a])
    playoffs_start = dt.date.fromisoformat(schedule[-1]["date"]) + dt.timedelta(days=14)  # ponytail: rough playoff date
    sw = series_matrix(state, abbrevs, season, today, max((playoffs_start - today).days, 0), horizon)
    sim = simulate(base, np.array([idx[g["home"]] for g in rem]), np.array([idx[g["away"]] for g in rem]),
                   outcome_cum(p, ot_rate, so_share), divs, confs, sims, np.random.default_rng(seed), sw=sw)
    pts = sim["pts"]
    return [
        {"season": season, "as_of": today.isoformat(), "abbrev": a, "games_played": int(gp[i]), "points": int(base[0, i]),
         "exp_points": round(float(pts[:, i].mean()), 1), "points_p10": float(np.percentile(pts[:, i], 10)),
         "points_p90": float(np.percentile(pts[:, i], 90)), "p_playoffs": round(float(sim["playoffs"][i]), 4),
         "p_division": round(float(sim["division"][i]), 4), "p_presidents": round(float(sim["presidents"][i]), 4),
         "p_cup": round(float(sim["cup"][i]), 4)}
        for a, i in idx.items()
    ]


def sync_season_sim(d1: D1Client, client: NHLClient) -> int:
    """Simulates the rest of the season and stores today's (ET) snapshot. Returns the row count."""
    divisions = {r["abbrev"]: (r["conference"], r["division"])
                 for r in _rows(d1, "SELECT abbrev, conference, division FROM standings_rows", [])}
    if len(divisions) != 32:
        return 0
    schedule = fetch_schedule(client, sorted(divisions))
    if not schedule:
        return 0
    history = load_history(d1, schedule[0]["season"] // 10_000)
    if not history:
        return 0
    today = dt.datetime.now(ZoneInfo("America/New_York")).date()
    rows = simulate_season(history, schedule, divisions, today)
    _insert_rows(d1, "season_sim", _COLUMNS, rows)
    return len(rows)
