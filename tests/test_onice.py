import json
import pathlib

from morning_hockey.xg.compute import shot_probabilities
from morning_hockey.xg.onice import onice_game

FIXTURES = pathlib.Path(__file__).parent / "fixtures"
PBP = json.loads((FIXTURES / "pbp_2024020001.json").read_text())
SHIFTS = json.loads((FIXTURES / "shifts_2024020001.json").read_text())
BOX_TOI = {int(k): v for k, v in json.loads((FIXTURES / "boxtoi_2024020001.json").read_text()).items()}
ROWS = onice_game(PBP, SHIFTS)


def _seconds(clock):
    m, s = clock.split(":")
    return int(m) * 60 + int(s)


def test_toi_matches_boxscore_and_goalies_excluded():
    assert {r["player_id"] for r in ROWS} == set(BOX_TOI)
    for r in ROWS:
        assert r["toi_sec"] == _seconds(BOX_TOI[r["player_id"]])
        assert r["toi_5v5_sec"] <= r["toi_sec"]


def test_on_ice_xg_is_about_five_skaters_per_shot():
    shots = shot_probabilities(PBP)
    for team in (PBP["homeTeam"]["id"], PBP["awayTeam"]["id"]):
        rows = [r for r in ROWS if r["team_id"] == team]
        own = shots[shots["teamId"] == team]
        opp = shots[shots["oppId"] == team]
        five = (own["shooterSkaters"] == 5) & (own["defenderSkaters"] == 5) & (own["emptyNet"] == 0)
        # every 5v5 shot has exactly 5 skaters per side on the ice
        assert abs(sum(r["xgf_5v5"] for r in rows) - 5 * own[five]["xg_skater"].sum()) < 1e-6
        opp_five = (opp["shooterSkaters"] == 5) & (opp["defenderSkaters"] == 5) & (opp["emptyNet"] == 0)
        assert abs(sum(r["xga_5v5"] for r in rows) - 5 * opp[opp_five]["xg_skater"].sum()) < 1e-6
        # all situations: 3-6 skaters, so roughly (not exactly) 5x
        ratio = sum(r["xgf"] for r in rows) / own["xg_skater"].sum()
        assert 4.5 < ratio < 5.5


def test_xga_of_one_team_is_xgf_of_the_other():
    home, away = PBP["homeTeam"]["id"], PBP["awayTeam"]["id"]
    # skater-seconds on ice are symmetric, so xGF*(share) cannot be compared directly;
    # but a player's xGF + xGA covers every shot while he is on ice
    for r in ROWS:
        assert r["team_id"] in (home, away)
        assert r["xgf"] >= r["xgf_5v5"] and r["xga"] >= r["xga_5v5"]


def test_shot_belongs_to_player_leaving_at_that_second():
    shift = lambda pid, start, end: {"playerId": pid, "teamId": 1, "period": 1, "startTime": start, "endTime": end, "typeCode": 517}
    pbp = {
        "id": 1, "season": 20242025, "gameDate": "2024-10-04",
        "rosterSpots": [], "plays": [],
    }
    # one 5v5 shot by team 1 at 00:10: a player leaving at 00:10 counts, one arriving at 00:10 does not
    import morning_hockey.xg.onice as onice
    shots = __import__("pandas").DataFrame([{
        "teamId": 1, "oppId": 2, "period": 1, "secInPeriod": 10, "shooterSkaters": 5, "defenderSkaters": 5,
        "emptyNet": 0, "xg_skater": 0.25,
    }])
    original = onice.shot_probabilities
    onice.shot_probabilities = lambda _: shots
    try:
        rows = {r["player_id"]: r for r in onice.onice_game(pbp, [shift(1, "00:00", "00:10"), shift(2, "00:10", "00:30"), shift(3, "00:05", "00:15")])}
    finally:
        onice.shot_probabilities = original
    assert rows[1]["xgf"] == 0.25 and rows[3]["xgf"] == 0.25 and rows[2]["xgf"] == 0
    assert rows[1]["toi_sec"] == 10
