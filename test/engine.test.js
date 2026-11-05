'use strict';
// Hand-worked checks for every calculation in backend/Engine.gs.
// Each expected value is worked out by hand in the comment beside it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('../dev/gas-mock');
const E = loadEngine();

// Objects built inside the vm sandbox have their own prototypes, so compare plain copies.
const same = (actual, expected, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected, msg || 'values differ');
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` expected ${b}, got ${a}`);

test('M1 normalisation keeps words, drops case and punctuation, keeps Indic marks', () => {
  assert.equal(E.normalizeEntry('  Dark, STREET!! '), 'dark street');
  assert.equal(E.normalizeEntry('no-street-lights'), 'no street lights');
  const hindi = 'अंधेरी गली';
  assert.equal(E.normalizeEntry(hindi), hindi.normalize('NFKC'));
  assert.ok(E.normalizeEntry(hindi).includes('ं'), 'anusvara (a combining mark) must survive');
  assert.equal(E.normalizeEntry(null), '');
});

test('M1 cleaning: first mention of a code kept, excluded entries removed, uncoded kept in place', () => {
  const codes = { 'dark street': 'light', 'no lights': 'light', 'crowd': 'people', 'my mood': E.EXCLUDE };
  const codeOf = (k) => codes[k] || null;
  const out = E.cleanList(['Dark street', 'my mood', 'unknown thing', 'No lights', 'Crowd'], codeOf);
  same(out.map((e) => e.item), ['code:light', 'raw:unknown thing', 'code:people']);
});

test('M2 Smith\'s S and M3 Sutrop\'s CSI on a three-list example', () => {
  // lists: [A,B,C], [B,A], [C]; N = 3
  // S_A = (1 + 1/2)/3 = 0.5 ; S_B = (2/3 + 1)/3 = 5/9 ; S_C = (1/3 + 1)/3 = 4/9
  // CSI_A = 2/(3*1.5) = 4/9 ; CSI_B = 4/9 ; CSI_C = 2/(3*2) = 1/3
  const mk = (xs) => xs.map((x) => ({ item: 'code:' + x, code: x, key: x }));
  const s = E.salience([mk(['A', 'B', 'C']), mk(['B', 'A']), mk(['C'])]);
  assert.equal(s.N, 3);
  const by = Object.fromEntries(s.rows.map((r) => [r.code, r]));
  close(by.A.smithS, 0.5, 1e-12); close(by.B.smithS, 5 / 9, 1e-12); close(by.C.smithS, 4 / 9, 1e-12);
  close(by.A.sutropCSI, 4 / 9, 1e-12); close(by.B.sutropCSI, 4 / 9, 1e-12); close(by.C.sutropCSI, 1 / 3, 1e-12);
  same(s.rows.map((r) => r.code), ['B', 'A', 'C']);
});

test('M4 elbow: point farthest below the chord of the scaled curve', () => {
  // y scaled = [1,.444,.222,.111,.056,0], x = [0,.2,.4,.6,.8,1]; 1-x-y largest (.378) at index 2
  const e = E.elbow([10, 5, 3, 2, 1.5, 1]);
  assert.equal(e.index, 2); assert.equal(e.rank, 3);
  assert.equal(E.elbow([1, 1, 1]), null);
  assert.equal(E.elbow([2, 1]), null);
});

test('M5 saturation (Guest, Namey & Chen 2020): base 4, run 2, threshold 5%', () => {
  // base = r1..r4 -> {a,b,c,d,e} = 5 codes
  // s=4: run r5,r6 -> new {f} -> 1/5 = 20%
  // s=5: run r6,r7 -> nothing new -> 0% -> saturation "5+2"
  // s=6: run r7,r8 -> new {g} -> 20%
  const sets = [['a', 'b', 'c'], ['b', 'd'], ['a'], ['e'], ['f'], ['a'], ['b'], ['g']];
  const s = E.saturation(sets, 4, 2, 0.05);
  assert.equal(s.baseCodes, 5);
  same(s.steps.map((x) => x.newCount), [1, 0, 1]);
  // Guest et al. report "5+2": saturation reached at respondent 5, confirmed by the run 6-7
  assert.equal(s.reached, true); assert.equal(s.label, '5+2'); assert.equal(s.point, 5); assert.equal(s.confirmedBy, 7);
  same(s.cumulative, [3, 4, 4, 5, 6, 6, 6, 7]);
  assert.equal(E.saturation(sets.slice(0, 5), 4, 2, 0.05).reached, false);
});

test('M6 Krippendorff alpha (nominal) reproduces Krippendorff\'s published two-coder example', () => {
  // Krippendorff (2011) "Computing Krippendorff's alpha-reliability", binary example: alpha = 0.095
  const A = [0, 1, 0, 0, 0, 0, 0, 0, 1, 0];
  const B = [1, 1, 1, 0, 0, 1, 0, 0, 0, 0];
  const r = E.krippendorffAlphaNominal(A.map((a, i) => [a, B[i]]));
  close(r.alpha, 1 - (19 * 8) / (2 * 14 * 6), 1e-12);
  close(r.alpha, 0.095, 0.0005);
  // hand example: units (a,a)(a,b)(b,b)(b,b)(c,c): n=10, n_a=3, n_b=5, n_c=2 -> 1 - 9*2/62
  const r2 = E.krippendorffAlphaNominal([['a', 'a'], ['a', 'b'], ['b', 'b'], ['b', 'b'], ['c', 'c']]);
  close(r2.alpha, 1 - 18 / 62, 1e-12);
  assert.equal(E.krippendorffAlphaNominal([['a', 'a'], ['b', 'b']]).alpha, 1);
  assert.equal(E.krippendorffAlphaNominal([['a', 'a'], ['a', 'a']]).alpha, null);
  assert.equal(E.krippendorffAlphaNominal([['a', null]]).units, 0);
});

test('M7 cyclic designs: equal appearances and best possible pair balance', () => {
  const d12 = E.cyclicDesign(12, 4);
  same(d12.stats.appearancesPerItem, Array(12).fill(4));
  assert.equal(d12.stats.pairsCovered, 66);
  same(d12.stats.pairCountDistribution, { 1: 60, 2: 6 });
  d12.sets.forEach((s) => assert.equal(new Set(s).size, 4));
  // 13 items: the (13,4,1) difference set {0,1,3,9} gives every pair exactly once
  same(E.cyclicDesign(13, 4).stats.pairCountDistribution, { 1: 78 });
  // 7 items: (7,4,2) balanced design, every pair exactly twice
  same(E.cyclicDesign(7, 4).stats.pairCountDistribution, { 2: 21 });
  for (let K = 6; K <= 16; K++) {
    const d = E.cyclicDesign(K, 4);
    assert.equal(d.sets.length, K);
    same(d.stats.appearancesPerItem, Array(K).fill(4));
  }
});

test('M8 best-worst counts and standardised scores', () => {
  const obs = [
    { resp: 'r1', shown: [0, 1, 2, 3], best: 0, worst: 3 },
    { resp: 'r1', shown: [0, 1, 2, 4], best: 1, worst: 0 },
    { resp: 'r2', shown: [1, 2, 3, 4], best: 1, worst: 4 }
  ];
  const c = E.bwCounts(obs, 5);
  // item 0: shown 2, B 1, W 1 -> 0 ; item 1: shown 3, B 2 -> 2/3 ; item 3: shown 2, W 1 -> -1/2
  same([c[0].shown, c[0].bw, c[0].std], [2, 0, 0]);
  close(c[1].std, 2 / 3, 1e-12); close(c[3].std, -0.5, 1e-12); close(c[4].std, -0.5, 1e-12);
});

test('M9 Wilson interval for 8/10 = [0.490, 0.943]', () => {
  const w = E.wilson(8, 10);
  close(w.lo, 0.4902, 1e-4); close(w.hi, 0.9433, 1e-4);
  assert.equal(E.wilson(0, 0), null);
  close(E.wilson(0, 10).lo, 0, 1e-12);
});

test('M10 Spearman with ties', () => {
  // ranks a = [5,4,3,2,1], b = [5,4,2.5,1,2.5] -> rho = 8 / sqrt(10 * 9.5)
  close(E.spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7]), 8 / Math.sqrt(95), 1e-12);
  close(E.spearman([1, 2, 3], [3, 2, 1]), -1, 1e-12);
});

test('M11 maxdiff model: two-item case matches the closed-form logit answer', () => {
  // With 2 items, P(best=0) = 1/(1+exp(-2D)), D = u0 - u1. 75 of 100 -> D = ln(3)/2.
  // Centred u0 = D/2. Model SE of u0 = sqrt(1/(4*75)); cluster-robust SE adds G/(G-1) = 100/99.
  const obs = [];
  for (let i = 0; i < 100; i++) obs.push({ resp: 'r' + i, shown: [0, 1], best: i < 75 ? 0 : 1, worst: i < 75 ? 1 : 0 });
  const f = E.fitMaxdiff(obs, 2);
  assert.equal(f.status, 'ok');
  close(f.utility[0], Math.log(3) / 4, 1e-9);
  close(f.utility[1], -Math.log(3) / 4, 1e-9);
  close(f.seModel[0], Math.sqrt(1 / 300), 1e-9);
  close(f.se[0], Math.sqrt((1 / 300) * (100 / 99)), 1e-9);
  close(f.weight[0], Math.exp(Math.log(3) / 4) / (Math.exp(Math.log(3) / 4) + Math.exp(-Math.log(3) / 4)), 1e-9);
  close(f.ll0, -100 * Math.log(2), 1e-9);
});

function simulate(E, uTrue, nResp, seed) {
  const K = uTrue.length, rand = E.rng(seed), design = E.cyclicDesign(K, 4), obs = [];
  for (let r = 0; r < nResp; r++) {
    design.sets.forEach((set) => {
      const shown = set.slice().sort(() => rand() - 0.5);
      const pairs = [];
      let z = 0;
      shown.forEach((i) => shown.forEach((j) => { if (i !== j) { const w = Math.exp(uTrue[i] - uTrue[j]); pairs.push([i, j, w]); z += w; } }));
      let x = rand() * z, pick = pairs[pairs.length - 1];
      for (const p of pairs) { x -= p[2]; if (x <= 0) { pick = p; break; } }
      obs.push({ resp: 'r' + r, shown, best: pick[0], worst: pick[1] });
    });
  }
  return obs;
}

test('M11 analytic gradient and Hessian agree with finite differences', () => {
  const obs = simulate(E, [0.8, 0.2, -0.1, 0.5, -0.6, 0.1, 0, -0.3], 6, 7);
  const u = [0.3, -0.2, 0.1, 0.4, -0.5, 0.2, 0.05, 0];
  const d = E.maxdiffLoglik(obs, u, true), h = 1e-6;
  for (let k = 0; k < u.length; k++) {
    const up = u.slice(), dn = u.slice(); up[k] += h; dn[k] -= h;
    const num = (E.maxdiffLoglik(obs, up, false).ll - E.maxdiffLoglik(obs, dn, false).ll) / (2 * h);
    close(d.g[k], num, 1e-5, 'gradient ' + k);
    const gu = E.maxdiffLoglik(obs, up, true).g, gd = E.maxdiffLoglik(obs, dn, true).g;
    for (let j = 0; j < u.length; j++) close(d.H[k][j], (gu[j] - gd[j]) / (2 * h), 1e-4, `hessian ${k},${j}`);
  }
});

test('M11 parameter recovery from simulated respondents (K = 12)', () => {
  const uTrue = [1.2, 0.9, 0.7, 0.5, 0.3, 0.1, -0.1, -0.3, -0.5, -0.7, -0.9, -1.2];
  const obs = simulate(E, uTrue, 500, 11);
  const f = E.fitMaxdiff(obs, 12);
  assert.equal(f.status, 'ok');
  assert.ok(f.maxAbsGradient < 1e-6);
  const m = uTrue.reduce((a, b) => a + b) / 12;
  f.utility.forEach((u, i) => assert.ok(Math.abs(u - (uTrue[i] - m)) < 4 * f.se[i], `item ${i}: ${u} vs ${uTrue[i] - m} (se ${f.se[i]})`));
  close(E.spearman(f.utility, uTrue), 1, 1e-12);
  const counts = E.bwCounts(obs, 12).map((c) => c.std);
  assert.ok(E.spearman(counts, uTrue) > 0.98);
  close(f.weight.reduce((a, b) => a + b), 1, 1e-12);
});

test('M11 too few responses is reported, not estimated', () => {
  const obs = [{ resp: 'r1', shown: [0, 1, 2, 3], best: 0, worst: 3 }];
  const f = E.fitMaxdiff(obs, 4);
  assert.notEqual(f.status, 'ok');
  assert.equal(E.fitMaxdiff([], 4).status, 'no data');
});

test('M12 Krinsky-Robb intervals contain the point estimates and are reproducible', () => {
  const uTrue = [0.9, 0.6, 0.3, 0, -0.3, -0.6, -0.9, 0.1];
  const f = E.fitMaxdiff(simulate(E, uTrue, 120, 3), 8);
  const a = E.krinskyRobb(f, 8, 1000, 42), b = E.krinskyRobb(f, 8, 1000, 42);
  same(a, JSON.parse(JSON.stringify(b)));
  a.forEach((x, i) => {
    assert.ok(x.weightLo <= f.weight[i] && f.weight[i] <= x.weightHi); assert.ok(x.rankLo <= x.rankHi);
    assert.ok(Number.isInteger(x.rankLo) && Number.isInteger(x.rankHi), 'rank intervals are whole ranks');
  });
  close(a.reduce((s, x) => s + x.pTop, 0), 1, 1e-9);
});

test('M13 relative speed index: median page time over own page time, averaged', () => {
  // medians p1 = 20, p2 = 40 -> r1 (2+2)/2 = 2 ; r2 = 1 ; r3 = 2/3
  const r = E.relativeSpeed([{ p1: 10, p2: 20 }, { p1: 20, p2: 40 }, { p1: 30, p2: 60 }]);
  close(r[0], 2, 1e-12); close(r[1], 1, 1e-12); close(r[2], 2 / 3, 1e-12);
});

test('M13 Leiner (2019) clips each page factor at 3 before averaging', () => {
  // medians p1 = 20, p2 = 40. r1 skipped p1 in 1 ms: factor 20 -> clipped to 3; p2 factor 1 -> (3 + 1)/2 = 2
  const r = E.relativeSpeed([{ p1: 1, p2: 40 }, { p1: 20, p2: 40 }, { p1: 30, p2: 40 }]);
  close(r[0], 2, 1e-12);
  assert.equal(E.RSI_CLIP, 3); assert.equal(E.RSI_FLAG, 2);
});

test('quantile type 7 (Hyndman & Fan) gives the R / NumPy default values', () => {
  // type 7, as R quantile(c(1,2,3,4), c(.025,.5,.975)) and NumPy's default: 1.075 2.5 3.925
  close(E.quantile([4, 1, 3, 2], 0.025), 1.075, 1e-12);
  close(E.quantile([4, 1, 3, 2], 0.5), 2.5, 1e-12);
  close(E.quantile([4, 1, 3, 2], 0.975), 3.925, 1e-12);
});

const baseAnswers = { consent: 'yes', gender: 'woman', age: '18_24', roads: 'yes', modes: ['foot', 'bus'], frequency: 'daily', company: 'alone', area: 'campus' };
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

test('validation of Form A: eligibility, branching and limits are enforced on the server', () => {
  assert.equal(E.validateA({ respondentId: uuid(1), answers: { ...baseAnswers, gender: 'man' } }, 0).ok, false);
  assert.equal(E.validateA({ respondentId: uuid(1), answers: { ...baseAnswers, age: 'under18' } }, 0).ok, false);
  assert.equal(E.validateA({ respondentId: uuid(1), answers: { ...baseAnswers, consent: 'no' } }, 0).ok, false);
  assert.equal(E.validateA({ respondentId: 'not-a-uuid', answers: baseAnswers }, 0).ok, false);
  const v = E.validateA({ respondentId: uuid(1), answers: { ...baseAnswers, changedAny: 'no', storyAny: 'should be dropped', actionsAny: ['other_road'],
    listAny: [' lights ', '', 'x'.repeat(500)], listAnyNothing: true, changedSafety: 'yes', actionsSafety: ['no_trip', 'bogus', 'used_anyway'], timeSafety: 'dark',
    listSafety: ['a', 'b'], unclear: 'no' } }, 0);
  assert.equal(v.ok, true);
  const x = v.record.answers;
  assert.equal(x.storyAny, ''); same(x.actionsAny, []);
  same(x.listAny, ['lights', 'x'.repeat(200)]); assert.equal(x.listAnyNothing, false);
  same(x.actionsSafety, ['no_trip'], 'used_anyway is no longer an option: the filter asked about a change');
  assert.equal(x.timeSafety, 'dark'); same(x.listSafety, ['a', 'b']); assert.equal(x.unclear, 'no');
  same(x.modes, ['foot', 'bus']);
  // follow-ups are dropped when the filter answer is not yes
  const n = E.validateA({ respondentId: uuid(2), answers: { ...baseAnswers, changedSafety: 'not_sure', timeSafety: 'dark', storySafety: 'x' } }, 0).record.answers;
  assert.equal(n.timeSafety, null); assert.equal(n.storySafety, '');
});

test('validation of Form B: version, design and choices are checked', () => {
  const freeze = { designVersion: 2, sets: [[0, 1, 2, 3], [1, 2, 3, 4]], items: [] };
  const good = { respondentId: uuid(2), designVersion: 2, answers: { ...baseAnswers, tookPartBefore: 'no', unclearItems: 'all clear' },
    bws: [{ set: 1, shown: [4, 2, 1, 3], best: 4, worst: 1, ms: 5000 }, { set: 0, shown: [0, 3, 2, 1], best: 2, worst: 2 }] };
  const v = E.validateB(good, 0, freeze);
  assert.equal(v.ok, true);
  assert.equal(v.record.bws[1].best, null, 'best = worst is treated as a skipped set');
  assert.equal(v.record.answers.tookPartBefore, 'no'); assert.equal(v.record.answers.unclearItems, 'all clear');
  assert.equal(E.validateB({ ...good, designVersion: 1 }, 0, freeze).ok, false);
  assert.equal(E.validateB({ ...good, bws: [good.bws[0], { set: 1, shown: [4, 2, 1, 3], best: 4, worst: 1 }] }, 0, freeze).ok, false);
  assert.equal(E.validateB({ ...good, bws: [{ set: 1, shown: [4, 2, 1, 0], best: 4, worst: 1 }, good.bws[1]] }, 0, freeze).ok, false);
  assert.equal(E.validateB(good, 0, null).ok, false);
});

test('wording check: threat words and the criterion word, matched at the start of a word', () => {
  same(E.wordingCheck('Feeling unsafe near danger'), { threat: ['danger', 'unsafe'], criterion: [] }, '"unsafe" is not read as "safe"');
  same(E.wordingCheck('How safe the footpath is'), { threat: [], criterion: ['safe'] });
  same(E.wordingCheck('Road safety signs'), { threat: [], criterion: ['safe'] });
  same(E.wordingCheck('Risky crossings and harassment'), { threat: ['harass', 'risk'], criterion: [] });
  same(E.wordingProblems('How well lit the road is'), []);
  same(E.wordingProblems('Whether police or security staff are visible'), [], 'security staff is a road feature');
});

test('M1 split entries: one entry coded with several codes becomes consecutive items', () => {
  const codes = { 'dark and empty': ['light', 'people'], 'no lights': 'light', 'shops': ['shops'], 'junk': E.EXCLUDE };
  const codeOf = (k) => (codes[k] === undefined ? null : codes[k]);
  // "no lights" (light), "dark and empty" (light already seen -> only people), "shops"
  same(E.cleanList(['No lights', 'junk', 'Dark and empty', 'Shops'], codeOf).map((e) => e.item), ['code:light', 'code:people', 'code:shops']);
  same(E.cleanList(['Dark and empty', 'no lights'], codeOf).map((e) => e.item), ['code:light', 'code:people']);
  assert.equal(E.codeValue(['people', 'light']), E.codeValue(['light', 'people']), 'agreement ignores the order of a split');
  assert.equal(E.codeValue('light'), 'light');
  assert.equal(E.codeValue(E.EXCLUDE), E.EXCLUDE);
  assert.equal(E.codeList(['a', 'b', 'c', 'd']).length, 3);
});

test('discrete quantile (type 1) for rank intervals', () => {
  // type 1 (R type = 1, NumPy inverted_cdf): 1:10 at .025/.5/.975 -> 1 5 10 ; c(2,2,3,3,3,4) at .5 -> 3
  assert.equal(E.quantileDiscrete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.025), 1);
  assert.equal(E.quantileDiscrete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
  assert.equal(E.quantileDiscrete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.975), 10);
  assert.equal(E.quantileDiscrete([3, 2, 4, 3, 2, 3], 0.5), 3);
});

test('chi-square upper tail matches tables, and the position test', () => {
  // critical values: chi2(0.95; 1) = 3.841459, chi2(0.95; 3) = 7.814728; SciPy chi2.sf(20, 3) = 1.697424e-04
  close(E.chiSquareP(3.841458820694124, 1), 0.05, 1e-9);
  close(E.chiSquareP(7.814727903251178, 3), 0.05, 1e-9);
  close(E.chiSquareP(20, 3), 1.697424e-4, 1e-9);
  close(E.lnGamma(5), Math.log(24), 1e-12);
  // counts 30, 20, 25, 25: E = 25, X2 = (25 + 25 + 0 + 0)/25 = 2
  const t = E.chiSquareUniform([30, 20, 25, 25]);
  close(t.stat, 2, 1e-12); assert.equal(t.df, 3); close(t.p, E.chiSquareP(2, 3), 1e-15);
  assert.equal(E.chiSquareUniform([0, 0, 0, 0]), null);
});

test('robustness model (sequential best then worst): two-item case and analytic derivatives', () => {
  // With 2 items the worst is forced, so P(best = 0) = 1/(1 + exp(-D)): 75 of 100 -> D = ln 3, centred u0 = ln(3)/2
  const obs = [];
  for (let i = 0; i < 100; i++) obs.push({ resp: 'r' + i, shown: [0, 1], best: i < 75 ? 0 : 1, worst: i < 75 ? 1 : 0 });
  const f = E.fitSequential(obs, 2);
  assert.equal(f.status, 'ok');
  close(f.utility[0], Math.log(3) / 2, 1e-9);
  const sim = simulate(E, [0.8, 0.2, -0.1, 0.5, -0.6, 0.1, 0, -0.3], 6, 7);
  const u = [0.3, -0.2, 0.1, 0.4, -0.5, 0.2, 0.05, 0];
  const d = E.sequentialLoglik(sim, u, true), hh = 1e-6;
  for (let k = 0; k < u.length; k++) {
    const up = u.slice(), dn = u.slice(); up[k] += hh; dn[k] -= hh;
    close(d.g[k], (E.sequentialLoglik(sim, up, false).ll - E.sequentialLoglik(sim, dn, false).ll) / (2 * hh), 1e-5, 'gradient ' + k);
    const gu = E.sequentialLoglik(sim, up, true).g, gd = E.sequentialLoglik(sim, dn, true).g;
    for (let j = 0; j < u.length; j++) close(d.H[k][j], (gu[j] - gd[j]) / (2 * hh), 1e-4, `hessian ${k},${j}`);
  }
});

test('robustness model recovers the same order as the maxdiff model on maxdiff data', () => {
  const uTrue = [1.2, 0.9, 0.7, 0.5, 0.3, 0.1, -0.1, -0.3, -0.5, -0.7, -0.9, -1.2];
  const obs = simulate(E, uTrue, 300, 5);
  const a = E.fitMaxdiff(obs, 12), b = E.fitSequential(obs, 12);
  assert.equal(b.status, 'ok');
  assert.ok(E.spearman(a.utility, b.utility) > 0.98);
});

test('buildFreeze: K range, single mentions and criterion words are refused', () => {
  const cand = (i, extra) => ({ rank: i + 1, codeId: 'c' + i, label: 'Label number ' + i, description: 'Plain description', smithS: 1 - i / 20, freq: 5,
    wordingThreat: [], wordingCriterion: [], wordingProblems: [], ...extra });
  const results = (cands) => ({ formA: { n: 30, coding: { coverage: { safety: { entries: 40, coded: 40 } } }, candidates: cands,
    saturation: { primary: { label: '9+2' } }, salience: { safety: { elbow: { rank: 10 } } } } });
  const twelve = Array.from({ length: 14 }, (_, i) => cand(i));
  assert.equal(E.buildFreeze(results(twelve), 7, 0, 0).ok, false, 'K below 8 shows more than half of the items in a set of 4');
  assert.equal(E.buildFreeze(results(twelve), 17, 0, 0).ok, false);
  const ok = E.buildFreeze(results(twelve), 12, 0, 0);
  assert.equal(ok.ok, true); assert.equal(ok.freeze.sets.length, 12); assert.equal(ok.freeze.tieAtCutoff, false);
  const single = twelve.slice(); single[11] = cand(11, { freq: 1 });
  assert.match(E.buildFreeze(results(single), 12, 0, 0).error, /only 1 respondent/);
  const circ = twelve.slice(); circ[3] = cand(3, { wordingCriterion: ['safe'], wordingProblems: ['safe'] });
  assert.match(E.buildFreeze(results(circ), 12, 0, 0).error, /criterion/);
  // a tie at the cut-off within floating-point noise is reported
  const tie = twelve.slice(); tie[12] = cand(12, { smithS: tie[11].smithS + 1e-15 });
  assert.equal(E.buildFreeze(results(tie), 12, 0, 0).freeze.tieAtCutoff, true);
});
