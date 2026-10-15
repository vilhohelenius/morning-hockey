from morning_hockey.sync_streaks import compute_streaks


def g(pid, day, points, game_id=None):
    return {"playerId": pid, "gameDate": f"2026-10-{day:02d}", "gameId": game_id or day, "points": points,
            "goals": points, "assists": 0, "skaterFullName": f"P{pid}", "teamAbbrev": "BOS"}


def test_active_and_best():
    games = [g(1, d, p) for d, p in enumerate([1, 1, 1, 1, 0, 2, 1, 1], 1)]  # best 4, active 3
    games += [g(2, d, p) for d, p in enumerate([1, 1, 0], 1)]  # too short
    rows = {(r["player_id"], r["kind"]): r for r in compute_streaks(games, 20262027)}
    assert set(rows) == {(1, "best"), (1, "active")}
    assert rows[(1, "best")]["games"] == 4 and rows[(1, "active")]["games"] == 3
    assert rows[(1, "active")]["points"] == 4 and rows[(1, "active")]["start_date"] == "2026-10-06"
