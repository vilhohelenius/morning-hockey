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


def series_win(ph, pa):
    """Best-of-7 win probability for the team with home ice (games 1, 2, 5, 7 at home).
    ph/pa: its single-game win probability at home / away (arrays)."""
    ph, pa = np.asarray(ph, float), np.asarray(pa, float)
    cur, win = {(0, 0): np.ones_like(ph)}, np.zeros_like(ph)
    for g in range(7):
        p = ph if g in (0, 1, 4, 6) else pa
        nxt = {}
        for (a, b), q in cur.items():
            for na, nb, pr in ((a + 1, b, p), (a, b + 1, 1 - p)):
                if na == 4:
                    win = win + q * pr
                elif nb < 4:
                    nxt[(na, nb)] = nxt.get((na, nb), 0) + q * pr
        cur = nxt
    return win


def _series(key, a, b, sw, rng, seeded=False):
    """Winners of series a v b (team index arrays, one per sim). Round 1 (seeded): a has home ice, as a division
    winner does against a wild card even with fewer points. Later rounds: the better regular season."""
    r = np.arange(len(a))
    hi = a if seeded else np.where(key[r, a] >= key[r, b], a, b)
    lo = a + b - hi
    return np.where(rng.random(len(a)) < sw[hi, lo], hi, lo)


def simulate(base, home_idx, away_idx, cum, divs, confs, sims, rng, chunk=5000, sw=None):
    """base: (4, N) current points, RW, ROW, wins. divs/confs: name -> team indexes.
    sw: optional (N, N) series win matrix (sw[i, j] = i wins a series against j with home ice) -> also plays the playoffs.
    Returns playoffs/division/presidents/cup shares, advance (3, N: won round 1 / round 2 / conference final) and pts (sims, N)."""
    N, G = base.shape[1], len(home_idx)
    Hm, Am = np.zeros((G, N), np.float32), np.zeros((G, N), np.float32)
    Hm[np.arange(G), home_idx] = 1; Am[np.arange(G), away_idx] = 1
    cum32 = cum[None].astype(np.float32)
    playoffs, divwin, presidents, cup = np.zeros(N), np.zeros(N), np.zeros(N), np.zeros(N)
    adv = np.zeros((3, N))  # teams that won round 1 / round 2 / the conference final
    pts_all = np.zeros((sims, N), np.float32)
    done = 0
    while done < sims:
        S = min(chunk, sims - done)
        o = (rng.random((S, G), dtype=np.float32)[:, :, None] > cum32).sum(2) if G else np.zeros((S, 0), int)
        tot = [b + h[o].astype(np.float32) @ Hm + a[o].astype(np.float32) @ Am
               for b, (h, a) in zip(base, ((HP, AP), (HRW, ARW), (HROW, AROW), (HW, AW)))]
        key = tot[0] * 1e6 + tot[1] * 1e4 + tot[2] * 1e2 + tot[3] + rng.random((S, N))  # points, RW, ROW, wins, coin flip
        q_ = np.zeros((S, N), bool)
        top, wild = {}, {}
        for name, m in divs.items():
            m = np.array(m); rk = np.argsort(-key[:, m], 1)
            top[name] = m[rk[:, :3]]
            np.put_along_axis(q_, m[rk[:, :3]], True, 1)
            divwin[m] += np.bincount(m[rk[:, 0]].ravel(), minlength=N)[m]
        for name, m in confs.items():
            m = np.array(m); sub = np.where(q_[:, m], -np.inf, key[:, m]); rk = np.argsort(-sub, 1)
            np.put_along_axis(q_, m[rk[:, :2]], True, 1)
            wild[name] = m[rk[:, :2]]
        playoffs += q_.sum(0)
        if sw is not None:
            champs = []
            for cname, cm in confs.items():
                x, y = [top[d] for d, dm in divs.items() if set(dm) <= set(cm)]
                r = np.arange(S)
                x_strong = key[r, x[:, 0]] >= key[r, y[:, 0]]
                s, w = np.where(x_strong[:, None], x, y), np.where(x_strong[:, None], y, x)
                wc = wild[cname]
                a, b = _series(key, s[:, 0], wc[:, 1], sw, rng, True), _series(key, s[:, 1], s[:, 2], sw, rng, True)
                c, d = _series(key, w[:, 0], wc[:, 0], sw, rng, True), _series(key, w[:, 1], w[:, 2], sw, rng, True)
                e, f = _series(key, a, b, sw, rng), _series(key, c, d, sw, rng)
                champs.append(_series(key, e, f, sw, rng))
                for k, won in enumerate((np.concatenate([a, b, c, d]), np.concatenate([e, f]), champs[-1])):
                    adv[k] += np.bincount(won, minlength=N)
            cup += np.bincount(_series(key, champs[0], champs[1], sw, rng), minlength=N)
        presidents += np.bincount(key.argmax(1), minlength=N)
        pts_all[done:done + S] = tot[0]
        done += S
    return {"playoffs": playoffs / sims, "division": divwin / sims, "presidents": presidents / sims, "cup": cup / sims, "advance": adv / sims, "pts": pts_all}
