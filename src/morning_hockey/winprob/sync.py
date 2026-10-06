"""D1 side of the win-probability model: reads the last three seasons of finished
games, walks them chronologically and writes game_win_prob for every upcoming
regular-season game. Also the team_game_wp_inputs writer used by sync_xg."""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from ..d1_sync import D1Client, _insert_rows
from .model import MODEL, WinProbState, predict

_SEASONS = 3
_WP_INPUT_COLUMNS = ["game_id", "team_id", "season", "game_date", "sog_f", "sog_a", "dz_giveaways"]
_WIN_PROB_COLUMNS = ["game_id", "home_win_prob", "computed_at", "model_version", "ability", "chances", "goalie", "context"]
_TEAM_IDS = {
    "ANA": 24, "ARI": 53, "BOS": 6, "BUF": 7, "CAR": 12, "CBJ": 29, "CGY": 20, "CHI": 16, "COL": 21, "DAL": 25, "DET": 17,
    "EDM": 22, "FLA": 13, "LAK": 26, "MIN": 30, "MTL": 8, "NJD": 1, "NSH": 18, "NYI": 2, "NYR": 3, "OTT": 9, "PHI": 4,
    "PIT": 5, "SEA": 55, "SJS": 28, "STL": 19, "TBL": 14, "TOR": 10, "UTA": 68, "VAN": 23, "VGK": 54, "WPG": 52, "WSH": 15,
}


def sync_wp_inputs(client: D1Client, rows: list[dict]) -> None:
    _insert_rows(client, "team_game_wp_inputs", _WP_INPUT_COLUMNS, rows)


def _rows(client: D1Client, sql: str, params: list) -> list[dict]:
    return client.execute(sql, params)["result"][0]["results"]


def _season_of(game_id: int) -> int:
    year = game_id // 1_000_000
    return year * 10_000 + year + 1


def _et_date(start_time_utc: str) -> dt.date:
    return dt.datetime.fromisoformat(start_time_utc.replace("Z", "+00:00")).astimezone(ZoneInfo("America/New_York")).date()


def load_history(client: D1Client, last_year: int) -> list[dict]:
    """Finished regular-season games of the last _SEASONS seasons (start years
    last_year-2 .. last_year) that have every input, oldest first."""
    games: list[dict] = []
    for year in range(last_year - _SEASONS + 1, last_year + 1):
        lo, hi = year * 1_000_000 + 20_001, year * 1_000_000 + 29_999
        params = [lo, hi]
        by_id = {
            g["game_id"]: g
            for g in _rows(
                client,
                "SELECT game_id, start_time_utc, home_abbrev, away_abbrev, home_score, away_score, final_type "
                "FROM games WHERE is_finished = 1 AND game_id BETWEEN ? AND ?",
                params,
            )
        }
        teams: dict[int, dict] = {}
        for r in _rows(
            client,
            "SELECT x.game_id, x.team_id, x.game_date, x.xgf, x.xga, x.xgf_5v5, x.xga_5v5, w.sog_f, w.sog_a, w.dz_giveaways "
            "FROM team_game_xg x JOIN team_game_wp_inputs w ON w.game_id = x.game_id AND w.team_id = x.team_id "
            "WHERE x.game_id BETWEEN ? AND ?",
            params,
        ):
            teams.setdefault(r["game_id"], {})[r["team_id"]] = r
        goalies: dict[int, list] = {}
        for r in _rows(
            client,
            "SELECT game_id, player_id, opp_team_id, shots_against, goals_against, xga FROM goalie_game_xg WHERE game_id BETWEEN ? AND ?",
            params,
        ):
            goalies.setdefault(r["game_id"], []).append(r)
        for gid, g in by_id.items():
            home, away = _TEAM_IDS.get(g["home_abbrev"]), _TEAM_IDS.get(g["away_abbrev"])
            t = teams.get(gid, {})
            if home is None or away is None or home not in t or away not in t:
                continue
            score = {home: (g["home_score"], g["away_score"]), away: (g["away_score"], g["home_score"])}
            games.append({
                "game_id": gid, "season": _season_of(gid), "start": g["start_time_utc"], "date": t[home]["game_date"],
                "home_id": home, "away_id": away, "final_type": g["final_type"],
                "teams": {
                    k: {
                        "gf": score[k][0], "ga": score[k][1], "xgf": t[k]["xgf"], "xga": t[k]["xga"],
                        "xgf5": t[k]["xgf_5v5"], "xga5": t[k]["xga_5v5"],
                        "sog_f": t[k]["sog_f"], "sog_a": t[k]["sog_a"], "dz": t[k]["dz_giveaways"],
                    }
                    for k in (home, away)
                },
                # the shots were taken by opp_team_id, so the goalie's team is the other one
                "goalies": [
                    {"player_id": x["player_id"], "team_id": away if x["opp_team_id"] == home else home,
                     "shots": x["shots_against"], "gsax": x["xga"] - x["goals_against"]}
                    for x in goalies.get(gid, [])
                ],
            })
    return sorted(games, key=lambda g: (g["start"], g["game_id"]))


def predict_upcoming(history: list[dict], upcoming: list[dict], computed_at: str) -> list[dict]:
    """game_win_prob rows. upcoming: games rows (game_id, start_time_utc, home_abbrev, away_abbrev)."""
    state = WinProbState()
    for g in history:
        state.update(g)
    last = dict(state.last_date)  # a team's later upcoming games count the earlier ones for back-to-backs
    rows = []
    for g in sorted(upcoming, key=lambda g: (g["start_time_utc"], g["game_id"])):
        home, away = _TEAM_IDS.get(g["home_abbrev"]), _TEAM_IDS.get(g["away_abbrev"])
        if home is None or away is None:
            continue
        day = _et_date(g["start_time_utc"])
        p = predict(state.features(home, away, _season_of(g["game_id"]), day, last))
        last[home] = last[away] = day
        rows.append({"game_id": g["game_id"], "computed_at": computed_at, "model_version": MODEL["model_version"], **p})
    return rows


def sync_win_probabilities(client: D1Client) -> int:
    """Recomputes game_win_prob for all unplayed regular-season games. No-op without data."""
    latest = _rows(client, "SELECT MAX(game_id) AS g FROM games WHERE game_id % 1000000 BETWEEN 20001 AND 29999", [])
    if not latest or latest[0]["g"] is None:
        return 0
    last_year = latest[0]["g"] // 1_000_000
    upcoming = _rows(
        client,
        "SELECT game_id, start_time_utc, home_abbrev, away_abbrev FROM games "
        "WHERE is_finished = 0 AND game_id BETWEEN ? AND ?",
        [last_year * 1_000_000 + 20_001, last_year * 1_000_000 + 29_999],
    )
    if not upcoming:
        return 0
    history = load_history(client, last_year)
    if not history:
        return 0
    rows = predict_upcoming(history, upcoming, dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    client.execute("DELETE FROM game_win_prob WHERE game_id IN (SELECT game_id FROM games WHERE is_finished = 0)")
    _insert_rows(client, "game_win_prob", _WIN_PROB_COLUMNS, rows)
    return len(rows)
