'use strict';
/**
 * Sample-size simulation for Form B (simulated data, not results).
 * For each sample size, draws many synthetic samples of respondents who answer
 * the real 12-item cyclic design by the maxdiff model with assumed "true"
 * utilities, fits the engine's model, and reports how well the order is
 * recovered. This is the simulation approach to sample size for choice
 * experiments (de Bekker-Grob, Donkers, Jonker & Stolk 2015): it needs prior
 * utilities, so the answer is only as good as those assumptions.
 *
 *   node dev/power.js            (about a minute)
 */
const E = require('../backend/engine');

// assumed utilities: the same spread as dev/simulate.js (a moderate range of about 2 logits)
const U = [1.1, 0.9, 0.7, 0.45, 0.35, 0.2, 0.05, 0.0, -0.1, -0.3, -0.6, -0.8];
const K = U.length, design = E.cyclicDesign(K, 4), SIZES = [30, 50, 80, 120], REPS = Number(process.env.REPS || 200);
const trueRank = E.ranksDesc(U), trueW = E.softmax(U);

function sample(n, rand) {
  const obs = [];
  for (let r = 0; r < n; r++) {
    design.sets.forEach((set) => {
      const pairs = []; let z = 0;
      set.forEach((i) => set.forEach((j) => { if (i !== j) { const w = Math.exp(U[i] - U[j]); pairs.push([i, j, w]); z += w; } }));
      let x = rand() * z, pick = pairs[pairs.length - 1];
      for (const p of pairs) { x -= p[2]; if (x <= 0) { pick = p; break; } }
      obs.push({ resp: 'r' + r, shown: set, best: pick[0], worst: pick[1] });
    });
  }
  return obs;
}

console.log('SIMULATION ONLY. ' + REPS + ' samples per size; 12 items, 12 sets of 4; assumed utilities ' + JSON.stringify(U));
console.log('n     ρ(est, true) median [5th pct]   top item 1st   true top 3 = top 3   95% weight interval holds the true weight   95% rank interval holds the true rank   median rank-interval width');
const rand = E.rng(20261105);
for (const n of SIZES) {
  const rho = [], top1 = [], top3 = [], cover = [], coverW = [], width = [];
  for (let rep = 0; rep < REPS; rep++) {
    const f = E.fitMaxdiff(sample(n, rand), K);
    if (f.status !== 'ok') continue;
    const rk = E.ranksDesc(f.utility);
    rho.push(E.spearman(f.utility, U));
    top1.push(rk[0] === 1 ? 1 : 0);
    top3.push([0, 1, 2].every((i) => rk[i] <= 3) ? 1 : 0);
    const kr = E.krinskyRobb(f, K, 500, 1000 + rep);
    kr.forEach((x, i) => {
      cover.push(x.rankLo <= trueRank[i] && trueRank[i] <= x.rankHi ? 1 : 0); width.push(x.rankHi - x.rankLo);
      coverW.push(x.weightLo <= trueW[i] && trueW[i] <= x.weightHi ? 1 : 0);
    });
  }
  const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  console.log(String(n).padEnd(6), (E.median(rho).toFixed(3) + ' [' + E.quantile(rho, 0.05).toFixed(3) + ']').padEnd(28),
    (100 * m(top1)).toFixed(0).padStart(5) + '%', (100 * m(top3)).toFixed(0).padStart(16) + '%', (100 * m(coverW)).toFixed(1).padStart(30) + '%',
    (100 * m(cover)).toFixed(1).padStart(36) + '%', String(E.median(width)).padStart(26), rho.length < REPS ? '  (' + (REPS - rho.length) + ' not estimable)' : '');
}
