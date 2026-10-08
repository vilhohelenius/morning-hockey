"""Season simulation core, ported from xGoalBoost/winprob/simcore.py (outcome_cum,
shrink, simulate; the team_sigma branch and the parquet-based Ratings are left out --
team states come from WinProbState). Keep in sync with the original.

Each game ends REG / OT / SO, so points and the tiebreakers (RW, ROW, wins) come out right."""
from __future__ import annotations

import numpy as np

# outcomes: home reg win, home OT win, home SO win, away SO win, away OT win, away reg win
HP = np.array([2, 2, 2, 1, 1, 0]); AP = np.array([0, 1, 1, 2, 2, 2])
HRW = np.array([1, 0, 0, 0, 0, 0]); ARW = np.array([0, 0, 0, 0, 0, 1])
HROW = np.array([1, 1, 0, 0, 0, 0]); AROW = np.array([0, 0, 0, 0, 1, 1])
HW = np.array([1, 1, 1, 0, 0, 0]); AW = np.array([0, 0, 0, 1, 1, 1])


def shrink(lin, days_ahead, intercept, horizon):
    """Home win probability with the feature part shrunk: lin / (1 + days / horizon)."""
    return 1 / (1 + np.exp(-(intercept + np.asarray(lin, float) / (1 + np.asarray(days_ahead, float) / horizon))))


def outcome_cum(p, ot_rate, so_share):
    """Home win probability -> cumulative probabilities of the first 5 outcomes."""
    q = 0.5 + 0.5 * (p - 0.5)  # home share of OT/SO decisions
    pr = np.stack([p - ot_rate * q, ot_rate * q * (1 - so_share), ot_rate * q * so_share,
                   ot_rate * (1 - q) * so_share, ot_rate * (1 - q) * (1 - so_share), 1 - p - ot_rate * (1 - q)], -1)
    return np.cumsum(pr, -1)[..., :5]


def simulate(base, home_idx, away_idx, cum, divs, confs, sims, rng, chunk=5000):
    """base: (4, N) current points, RW, ROW, wins. divs/confs: name -> team indexes.
    Returns playoffs/division/presidents shares and pts (sims, N)."""
    N, G = base.shape[1], len(home_idx)
    Hm, Am = np.zeros((G, N), np.float32), np.zeros((G, N), np.float32)
    Hm[np.arange(G), home_idx] = 1; Am[np.arange(G), away_idx] = 1
    cum32 = cum[None].astype(np.float32)
    playoffs, divwin, presidents = np.zeros(N), np.zeros(N), np.zeros(N)
    pts_all = np.zeros((sims, N), np.float32)
    done = 0
    while done < sims:
        S = min(chunk, sims - done)
        o = (rng.random((S, G), dtype=np.float32)[:, :, None] > cum32).sum(2) if G else np.zeros((S, 0), int)
        tot = [b + h[o].astype(np.float32) @ Hm + a[o].astype(np.float32) @ Am
               for b, (h, a) in zip(base, ((HP, AP), (HRW, ARW), (HROW, AROW), (HW, AW)))]
        key = tot[0] * 1e6 + tot[1] * 1e4 + tot[2] * 1e2 + tot[3] + rng.random((S, N))  # points, RW, ROW, wins, coin flip
        q_ = np.zeros((S, N), bool)
        for m in divs.values():
            m = np.array(m); rk = np.argsort(-key[:, m], 1)
            np.put_along_axis(q_, m[rk[:, :3]], True, 1)
            divwin[m] += np.bincount(m[rk[:, 0]].ravel(), minlength=N)[m]
        for m in confs.values():
            m = np.array(m); sub = np.where(q_[:, m], -np.inf, key[:, m]); rk = np.argsort(-sub, 1)
            np.put_along_axis(q_, m[rk[:, :2]], True, 1)
        playoffs += q_.sum(0)
        presidents += np.bincount(key.argmax(1), minlength=N)
        pts_all[done:done + S] = tot[0]
        done += S
    return {"playoffs": playoffs / sims, "division": divwin / sims, "presidents": presidents / sims, "pts": pts_all}
