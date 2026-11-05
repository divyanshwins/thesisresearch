'use strict';
// Writes simulated best-worst data plus the engine's estimates, for the
// independent Python re-implementation in crosscheck.py to compare against.
const fs = require('fs');
const path = require('path');
const E = require('../../backend/engine');

const K = 12, uTrue = [1.0, 0.8, 0.6, 0.45, 0.3, 0.15, 0, -0.15, -0.3, -0.6, -0.9, -1.35];
const rand = E.rng(99), design = E.cyclicDesign(K, 4), obs = [];
for (let r = 0; r < 60; r++) {
  design.sets.forEach((set) => {
    const shown = set.slice().sort(() => rand() - 0.5);
    const pairs = []; let z = 0;
    shown.forEach((i) => shown.forEach((j) => { if (i !== j) { const w = Math.exp(uTrue[i] - uTrue[j]); pairs.push([i, j, w]); z += w; } }));
    let x = rand() * z, pick = pairs[pairs.length - 1];
    for (const p of pairs) { x -= p[2]; if (x <= 0) { pick = p; break; } }
    obs.push({ resp: 'r' + r, shown, best: pick[0], worst: pick[1] });
  });
}
const fit = E.fitMaxdiff(obs, K);
const seq = E.fitSequential(obs, K);
const pageTimes = Array.from({ length: 25 }, (_, i) => ({ p1: 2000 + 700 * ((i * 7) % 11), p2: i === 3 ? 50 : 9000 + 400 * ((i * 5) % 13), p3: i % 4 === 0 ? 0 : 30000 + 1500 * ((i * 3) % 7) }));
const counts = [[31, 22, 25, 18], [12, 30, 27, 40], [25, 25, 25, 25]];
const rankDraws = Array.from({ length: 2000 }, (_, i) => 1 + ((i * 7919) % 12));
const lists = [['A', 'B', 'C'], ['B', 'A'], ['C'], ['D', 'A', 'B', 'E'], ['E', 'D']].map((l) => l.map((x) => ({ item: 'code:' + x, code: x, key: x })));
const sal = E.salience(lists);
const out = {
  K, obs,
  engine: { utility: fit.utility, se: fit.se, seModel: fit.seModel, ll: fit.ll, weight: fit.weight },
  sequential: { utility: seq.utility, se: seq.se, ll: seq.ll },
  pageTimes, rsi: E.relativeSpeed(pageTimes),
  chi: counts.map((c) => ({ counts: c, ...E.chiSquareUniform(c) })),
  rankDraws, rankQ: [0.025, 0.5, 0.975].map((p) => E.quantileDiscrete(rankDraws, p)),
  freeLists: [['A', 'B', 'C'], ['B', 'A'], ['C'], ['D', 'A', 'B', 'E'], ['E', 'D']],
  salience: sal.rows.map((r) => ({ code: r.code, smithS: r.smithS, sutropCSI: r.sutropCSI })),
  wilson: [[8, 10], [3, 41], [0, 7], [50, 50]].map(([x, n]) => ({ x, n, ...E.wilson(x, n) }))
};
fs.writeFileSync(path.join(__dirname, 'engine_output.json'), JSON.stringify(out));
console.log('wrote engine_output.json:', obs.length, 'choices; status', fit.status);
