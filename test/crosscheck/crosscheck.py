"""Independent re-implementation (numpy/scipy) of the engine's maxdiff model,
sequential model, salience indices, Wilson interval, speed index, chi-square
test and rank quantile. Reads engine_output.json written by
dump.js and reports the largest difference for each quantity.

Run:  node test/crosscheck/dump.js && python3 test/crosscheck/crosscheck.py
"""
import json
import os
import sys

import numpy as np
from scipy.optimize import minimize
from scipy.stats import norm

here = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(here, "engine_output.json")))
K, obs = d["K"], d["obs"]

# ---- maxdiff model: P(b,w|S) = exp(u_b - u_w) / sum_{i != j in S} exp(u_i - u_j)
def negll(beta):
    u = np.append(beta, 0.0)
    total = 0.0
    for o in obs:
        S = o["shown"]
        v = np.array([u[i] - u[j] for i in S for j in S if i != j])
        m = v.max()
        total += (u[o["best"]] - u[o["worst"]]) - (m + np.log(np.exp(v - m).sum()))
    return -total

res = minimize(negll, np.zeros(K - 1), method="BFGS", options={"gtol": 1e-10, "maxiter": 10000})
beta = res.x

def num_hess(f, x, h=1e-4):
    n = len(x); H = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            ei = np.zeros(n); ej = np.zeros(n); ei[i] = h; ej[j] = h
            H[i, j] = (f(x + ei + ej) - f(x + ei - ej) - f(x - ei + ej) + f(x - ei - ej)) / (4 * h * h)
    return H

def obs_grad(beta, o, h=1e-6):
    def ll1(b):
        u = np.append(b, 0.0); S = o["shown"]
        v = np.array([u[i] - u[j] for i in S for j in S if i != j]); m = v.max()
        return (u[o["best"]] - u[o["worst"]]) - (m + np.log(np.exp(v - m).sum()))
    g = np.zeros(len(beta))
    for k in range(len(beta)):
        e = np.zeros(len(beta)); e[k] = h
        g[k] = (ll1(beta + e) - ll1(beta - e)) / (2 * h)
    return g

Hinv = np.linalg.inv(num_hess(negll, beta))              # model-based covariance of beta
clusters = {}
for o in obs:
    clusters.setdefault(o["resp"], np.zeros(K - 1))
    clusters[o["resp"]] += obs_grad(beta, o)
meat = sum(np.outer(g, g) for g in clusters.values())
G = len(clusters)
Vrob = Hinv @ meat @ Hinv * G / (G - 1)
M = np.vstack([np.eye(K - 1), np.zeros((1, K - 1))]) - 1.0 / K
u_c = M @ beta
with np.errstate(all="ignore"):   # numpy 2.0 + macOS Accelerate emits spurious matmul warnings
    se_rob = np.sqrt(np.diag(M @ Vrob @ M.T))
    se_mod = np.sqrt(np.diag(M @ Hinv @ M.T))
w = np.exp(u_c) / np.exp(u_c).sum()

eng = d["engine"]
report = {
    "utility": np.max(np.abs(u_c - np.array(eng["utility"]))),
    "se (cluster-robust)": np.max(np.abs(se_rob - np.array(eng["se"]))),
    "se (model)": np.max(np.abs(se_mod - np.array(eng["seModel"]))),
    "weight": np.max(np.abs(w - np.array(eng["weight"]))),
    "log-likelihood": abs(-res.fun - eng["ll"]),
}

# ---- Smith's S and Sutrop's CSI
lists = d["freeLists"]; N = len(lists)
S, F, P = {}, {}, {}
for L in lists:
    for r, x in enumerate(L, start=1):
        S[x] = S.get(x, 0) + (len(L) - r + 1) / len(L); F[x] = F.get(x, 0) + 1; P[x] = P.get(x, 0) + r
smith = {x: S[x] / N for x in S}
csi = {x: F[x] / (N * (P[x] / F[x])) for x in S}
report["Smith's S"] = max(abs(smith[r["code"]] - r["smithS"]) for r in d["salience"])
report["Sutrop's CSI"] = max(abs(csi[r["code"]] - r["sutropCSI"]) for r in d["salience"])

# ---- Wilson interval
z = norm.ppf(0.975); diffs = []
for wv in d["wilson"]:
    x, n = wv["x"], wv["n"]; p = x / n
    c = (p + z * z / (2 * n)) / (1 + z * z / n)
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    diffs += [abs(max(0, c - h) - wv["lo"]), abs(min(1, c + h) - wv["hi"])]
report["Wilson interval"] = max(diffs)

# ---- sequential best-then-worst model (robustness model)
def negll_seq(beta):
    u = np.append(beta, 0.0)
    total = 0.0
    for o in obs:
        S = o["shown"]; b = o["best"]; w = o["worst"]
        vb = np.array([u[i] for i in S]); total += u[b] - (vb.max() + np.log(np.exp(vb - vb.max()).sum()))
        R = [i for i in S if i != b]
        vw = np.array([-u[i] for i in R]); total += -u[w] - (vw.max() + np.log(np.exp(vw - vw.max()).sum()))
    return -total

res_s = minimize(negll_seq, np.zeros(K - 1), method="BFGS", options={"gtol": 1e-10, "maxiter": 10000})
u_s = M @ res_s.x
report["sequential utility"] = np.max(np.abs(u_s - np.array(d["sequential"]["utility"])))
report["sequential log-lik"] = abs(-res_s.fun - d["sequential"]["ll"])

# ---- relative speed index (Leiner 2019): median / own time per page, clipped at 3, averaged
pts = d["pageTimes"]; pages = sorted({k for pt in pts for k in pt})
med = {p: np.median([pt[p] for pt in pts if pt.get(p, 0) > 0]) for p in pages}
rsi = [np.mean([min(3.0, med[p] / pt[p]) for p in pt if pt[p] > 0]) for pt in pts]
report["speed index"] = max(abs(a - b) for a, b in zip(rsi, d["rsi"]))

# ---- chi-square test of equal spread over screen positions
from scipy.stats import chisquare
report["chi-square p"] = max(abs(chisquare(c["counts"]).pvalue - c["p"]) for c in d["chi"])

# ---- discrete (type 1) quantile used for rank intervals
qs = np.quantile(np.array(d["rankDraws"]), [0.025, 0.5, 0.975], method="inverted_cdf")
report["rank quantile"] = float(np.max(np.abs(qs - np.array(d["rankQ"]))))

tol = {"utility": 1e-4, "se (cluster-robust)": 1e-3, "se (model)": 1e-3, "weight": 1e-5, "log-likelihood": 1e-6,
       "Smith's S": 1e-12, "Sutrop's CSI": 1e-12, "Wilson interval": 1e-12,
       "sequential utility": 1e-4, "sequential log-lik": 1e-6, "speed index": 1e-12, "chi-square p": 1e-10, "rank quantile": 0}
ok = True
for k, v in report.items():
    flag = "OK " if v <= tol[k] else "BAD"
    ok = ok and v <= tol[k]
    print(f"{flag} {k:22s} max |python - engine| = {v:.2e}  (tolerance {tol[k]:.0e})")
sys.exit(0 if ok else 1)
