/**
 * engine.js: every calculation used by the study, as pure functions.
 *
 * The same file runs unchanged on the server (the Vercel function, the
 * local preview server and the tests) and in a browser. It does no input or
 * output of its own. Each method is documented with its source in METHODS.md;
 * the section numbers below (M1, M2, ...) refer to that file.
 */
var Engine = (function () {
  'use strict';

  var Z95 = 1.959963984540054;          // standard normal 0.975 quantile
  var EXCLUDE = '__exclude__';          // code given to entries that are not about a road
  var MAX_CODES_PER_ENTRY = 3;          // an entry naming two or three things is split into them
  // Item-label checks before freezing (rule R2 in the questionnaire). Matched at the start of a word.
  // THREAT_WORDS presuppose a threat; CRITERION_WORDS repeat the Form B question's own criterion.
  var THREAT_WORDS = ['fear', 'afraid', 'scared', 'scary', 'danger', 'threat', 'harass', 'attack', 'assault', 'risk', 'unsafe', 'crime', 'criminal'];
  var CRITERION_WORDS = ['safe'];       // matches safe, safety, safer, safely at the start of a word
  // K from 8: a set of 4 then never shows more than half of the items (Sawtooth Software MaxDiff guidance).
  var K_MIN = 8, K_MAX = 16, SET_SIZE = 4;
  var MIN_MENTIONS = 2;                 // single mentions are treated as idiosyncratic (Sutrop 2001)
  var RSI_CLIP = 3, RSI_FLAG = 2;       // Leiner (2019): page speed factors clipped at 3; index above 2 flagged

  // ------------------------------------------------------------------
  // Allowed answer values (the forms in docs/assets use the same values;
  // test/forms.test.js checks that they match).
  // ------------------------------------------------------------------
  var OPTIONS = {
    gender: ['woman', 'man', 'nonbinary', 'prefer_not'],
    age: ['under18', '18_24', '25_34', '35_44', '45_54', '55_plus'],
    yesNo: ['yes', 'no'],
    yesNoUnsure: ['yes', 'no', 'not_sure'],
    modes: ['foot', 'bicycle', 'twowheeler', 'car', 'auto_taxi', 'bus', 'train_metro', 'other'],
    company: ['alone', 'others', 'both'],
    area: ['dense_city', 'residential', 'campus', 'commercial', 'periurban', 'rural', 'varies'],
    timeOfDay: ['day', 'dawn_dusk', 'dark', 'dont_remember']
  };
  var LIMITS = { short: 200, long: 2000, listItems: 10, pages: 40, email: 254, name: 100 };
  // Something@domain.tld with no spaces and no empty domain part. 254 characters is the longest address
  // that can be delivered (RFC 5321). The forms check the same pattern (docs/assets/survey.js).
  var EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

  // ------------------------------------------------------------------
  // Small numeric helpers
  // ------------------------------------------------------------------
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : null; }

  /** Sample quantile, Hyndman & Fan (1996) type 7 (the R default). */
  function quantile(values, p) {
    if (!values.length) return null;
    var x = values.slice().sort(function (a, b) { return a - b; });
    var h = (x.length - 1) * p, lo = Math.floor(h), hi = Math.min(lo + 1, x.length - 1);
    return x[lo] + (h - lo) * (x[hi] - x[lo]);
  }
  function median(values) { return quantile(values, 0.5); }
  /** Hyndman & Fan (1996) type 1, the inverse of the empirical distribution: always one of the observed values. Used for ranks. */
  function quantileDiscrete(values, p) {
    if (!values.length) return null;
    var x = values.slice().sort(function (a, b) { return a - b; });
    var j = Math.ceil(x.length * p - 1e-9);
    return x[Math.min(x.length, Math.max(1, j)) - 1];
  }

  /** log Gamma by the Lanczos approximation (g = 7, n = 9), accurate to about 1e-15. */
  function lnGamma(z) {
    var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
             12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1;
    var x = c[0];
    for (var i = 1; i < 9; i++) x += c[i] / (z + i);
    var t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  /** Upper regularised incomplete gamma Q(a, x): series for x < a + 1, continued fraction otherwise (Press et al., Numerical Recipes, 6.2). */
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    var gln = lnGamma(a), n;
    if (x < a + 1) {
      var ap = a, del = 1 / a, s = del;
      for (n = 0; n < 1000; n++) { ap += 1; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-15) break; }
      return 1 - s * Math.exp(-x + a * Math.log(x) - gln);
    }
    var b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, hh = d;
    for (n = 1; n < 1000; n++) {
      var an = -n * (n - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      var dl = d * c; hh *= dl;
      if (Math.abs(dl - 1) < 1e-15) break;
    }
    return Math.exp(-x + a * Math.log(x) - gln) * hh;
  }
  /** Upper tail of the chi-square distribution with df degrees of freedom. */
  function chiSquareP(x, df) { return gammaQ(df / 2, x / 2); }
  /** Pearson chi-square test that counts are spread evenly over their categories. */
  function chiSquareUniform(counts) {
    var n = sum(counts), k = counts.length;
    if (!n || k < 2) return null;
    var e = n / k, stat = 0;
    counts.forEach(function (o) { stat += (o - e) * (o - e) / e; });
    return { stat: stat, df: k - 1, p: chiSquareP(stat, k - 1), n: n };
  }

  /** M9. Wilson (1927) score interval for a binomial proportion. */
  function wilson(x, n, z) {
    if (!n) return null;
    z = z || Z95;
    var p = x / n, z2 = z * z, denom = 1 + z2 / n;
    var centre = (p + z2 / (2 * n)) / denom;
    var half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denom;
    return { p: p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
  }

  /** Deterministic PRNG (mulberry32) so that every refresh gives identical intervals. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normalSampler(rand) {
    var spare = null;
    return function () {
      if (spare !== null) { var s = spare; spare = null; return s; }
      var u = 0, v = 0;
      while (u === 0) u = rand();
      v = rand();
      var r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
      spare = r * Math.sin(th);
      return r * Math.cos(th);
    };
  }

  /** FNV-1a 32-bit hash, used only to pick the second-coder sample deterministically. */
  function hash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  /** Cholesky factor of a symmetric positive-definite matrix; null if not positive definite. */
  function cholesky(A) {
    var n = A.length, L = [], i, j, k;
    for (i = 0; i < n; i++) { L.push(new Array(n).fill(0)); }
    for (i = 0; i < n; i++) {
      for (j = 0; j <= i; j++) {
        var s = A[i][j];
        for (k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (!(s > 1e-12 * Math.max(1, Math.abs(A[i][i])))) return null;
          L[i][i] = Math.sqrt(s);
        } else {
          L[i][j] = s / L[j][j];
        }
      }
    }
    return L;
  }
  function cholSolve(L, b) {
    var n = L.length, y = new Array(n), x = new Array(n), i, k, s;
    for (i = 0; i < n; i++) { s = b[i]; for (k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
    for (i = n - 1; i >= 0; i--) { s = y[i]; for (k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }
  function cholInverse(L) {
    var n = L.length, inv = [], cols = [], i, j;
    for (j = 0; j < n; j++) {
      var e = new Array(n).fill(0); e[j] = 1;
      cols.push(cholSolve(L, e));
    }
    for (i = 0; i < n; i++) { inv.push([]); for (j = 0; j < n; j++) inv[i].push(cols[j][i]); }
    return inv;
  }
  function matMul(A, B) {
    var n = A.length, m = B[0].length, p = B.length, C = [], i, j, k;
    for (i = 0; i < n; i++) {
      C.push(new Array(m).fill(0));
      for (k = 0; k < p; k++) { var a = A[i][k]; if (a === 0) continue; for (j = 0; j < m; j++) C[i][j] += a * B[k][j]; }
    }
    return C;
  }
  function transpose(A) { return A[0].map(function (_, j) { return A.map(function (r) { return r[j]; }); }); }

  /** Ranks with ties given their average rank (rank 1 = largest value). */
  function ranksDesc(values) {
    var idx = values.map(function (v, i) { return i; });
    idx.sort(function (a, b) { return values[b] - values[a]; });
    var r = new Array(values.length), i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[i]]) j++;
      var avg = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) r[idx[k]] = avg;
      i = j + 1;
    }
    return r;
  }

  /** M10. Spearman's rank correlation (Pearson correlation of average ranks). */
  function spearman(a, b) {
    if (a.length !== b.length || a.length < 3) return null;
    var ra = ranksDesc(a), rb = ranksDesc(b), ma = mean(ra), mb = mean(rb), sab = 0, saa = 0, sbb = 0;
    for (var i = 0; i < ra.length; i++) {
      sab += (ra[i] - ma) * (rb[i] - mb); saa += (ra[i] - ma) * (ra[i] - ma); sbb += (rb[i] - mb) * (rb[i] - mb);
    }
    if (saa === 0 || sbb === 0) return null;
    return sab / Math.sqrt(saa * sbb);
  }

  // ------------------------------------------------------------------
  // M1. Free-list cleaning
  // ------------------------------------------------------------------
  /** Same words give the same key: Unicode NFKC, lower case, punctuation removed. Marks (\p{M}) are kept for Indic scripts. */
  function normalizeEntry(s) {
    if (s === null || s === undefined) return '';
    return String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
  }

  /** An assignment as stored: EXCLUDE, a code id, or an ordered list of 1-3 code ids. Returns EXCLUDE, an array, or null. */
  function codeList(c) {
    if (c === EXCLUDE) return EXCLUDE;
    if (typeof c === 'string' && c) return [c];
    if (Array.isArray(c) && c.length) return c.slice(0, MAX_CODES_PER_ENTRY);
    return null;
  }
  /** One nominal value per coded entry, for agreement: EXCLUDE, or its set of codes (order ignored). */
  function codeValue(c) {
    var l = codeList(c);
    if (l === null) return null;
    if (l === EXCLUDE) return EXCLUDE;
    return l.slice().sort().join('+');
  }

  /**
   * Turn one respondent's raw list into a cleaned list.
   * codeOf(key) returns EXCLUDE, an ordered array of code ids, or null (not yet coded).
   * Excluded entries are removed. An entry coded with two or three codes (for
   * example "dark and empty") becomes that many items, in the order coded, at
   * consecutive positions. A code mentioned twice keeps its first position only.
   * An uncoded entry keeps its place as its own item.
   */
  function cleanList(rawList, codeOf) {
    var out = [], seen = {};
    (rawList || []).forEach(function (raw) {
      var key = normalizeEntry(raw);
      if (!key) return;
      var codes = codeList(codeOf(key));
      if (codes === EXCLUDE) return;
      if (codes === null) {
        if (seen['raw:' + key]) return;
        seen['raw:' + key] = true;
        out.push({ item: 'raw:' + key, code: null, key: key });
        return;
      }
      codes.forEach(function (code) {
        var item = 'code:' + code;
        if (seen[item]) return;
        seen[item] = true;
        out.push({ item: item, code: code, key: key });
      });
    });
    return out;
  }

  // ------------------------------------------------------------------
  // M2. Smith's salience index (Smith 1993) and M3. Sutrop's CSI (Sutrop 2001)
  // ------------------------------------------------------------------
  /**
   * lists: array of cleaned lists (each non-empty). N = number of lists.
   * Smith's S = (sum over lists of (L - R + 1) / L) / N
   * Sutrop's CSI = F / (N * mP)
   */
  function salience(lists) {
    var N = lists.length, acc = {};
    lists.forEach(function (list) {
      var L = list.length;
      list.forEach(function (entry, i) {
        var R = i + 1;
        var a = acc[entry.item] || (acc[entry.item] = { item: entry.item, code: entry.code, key: entry.key, freq: 0, sumS: 0, sumPos: 0 });
        a.freq += 1; a.sumS += (L - R + 1) / L; a.sumPos += R;
      });
    });
    var rows = Object.keys(acc).map(function (k) {
      var a = acc[k], mP = a.sumPos / a.freq;
      return { item: a.item, code: a.code, key: a.key, coded: !!a.code, freq: a.freq, pct: a.freq / N,
               meanPos: mP, smithS: a.sumS / N, sutropCSI: a.freq / (N * mP) };
    });
    rows.sort(compareSalience);
    return { N: N, rows: rows };
  }
  /** Order: Smith's S, then frequency, then mean position (earlier first), then name. */
  function compareSalience(a, b) {
    if (b.smithS !== a.smithS) return b.smithS - a.smithS;
    if (b.freq !== a.freq) return b.freq - a.freq;
    if (a.meanPos !== b.meanPos) return a.meanPos - b.meanPos;
    return a.item < b.item ? -1 : a.item > b.item ? 1 : 0;
  }

  // ------------------------------------------------------------------
  // M4. Elbow of the salience curve (Kneedle, Satopaa et al. 2011)
  // ------------------------------------------------------------------
  /**
   * For a decreasing curve, after scaling x and y to [0, 1], Kneedle's
   * difference curve is 1 - x - y; the elbow is where it is largest (the
   * point farthest below the straight line joining the first and last points).
   */
  function elbow(valuesDesc) {
    var n = valuesDesc.length;
    if (n < 3) return null;
    var max = valuesDesc[0], min = valuesDesc[n - 1];
    if (max === min) return null;
    var best = -Infinity, at = null;
    for (var i = 0; i < n; i++) {
      var x = i / (n - 1), y = (valuesDesc[i] - min) / (max - min), d = 1 - x - y;
      if (d > best + 1e-12) { best = d; at = i; }
    }
    return { index: at, rank: at + 1, difference: best };
  }

  // ------------------------------------------------------------------
  // M5. Saturation (Guest, Namey & Chen 2020)
  // ------------------------------------------------------------------
  /**
   * codeSets: array (in order received) of arrays of code ids per respondent.
   * New information in a run = codes in the run not seen in any earlier
   * respondent, divided by the number of unique codes in the base. Runs roll
   * forward one respondent at a time; the base and its denominator stay fixed.
   * Reported in the authors' notation "s+run": saturation is reached at
   * respondent s (point), confirmed by the run of respondents s+1 .. s+run (confirmedBy).
   */
  function saturation(codeSets, base, run, threshold) {
    var n = codeSets.length;
    var out = { base: base, run: run, threshold: threshold, n: n, baseCodes: null, reached: false, point: null, confirmedBy: null, label: null, steps: [], cumulative: [] };
    var seenAll = {}, cum = 0;
    codeSets.forEach(function (s) { s.forEach(function (c) { if (!seenAll[c]) { seenAll[c] = true; cum++; } }); out.cumulative.push(cum); });
    if (n < base + run) return out;
    var baseSeen = {};
    for (var i = 0; i < base; i++) codeSets[i].forEach(function (c) { baseSeen[c] = true; });
    var denom = Object.keys(baseSeen).length;
    out.baseCodes = denom;
    if (denom === 0) return out;
    var prior = {};
    Object.keys(baseSeen).forEach(function (c) { prior[c] = true; });
    for (var s = base; s + run <= n; s++) {
      var runNew = {};
      for (var j = s; j < s + run; j++) codeSets[j].forEach(function (c) { if (!prior[c]) runNew[c] = true; });
      var newCount = Object.keys(runNew).length, ratio = newCount / denom;
      out.steps.push({ start: s, newCount: newCount, ratio: ratio });
      if (!out.reached && ratio <= threshold + 1e-12) { out.reached = true; out.point = s; out.confirmedBy = s + run; out.label = s + '+' + run; }
      codeSets[s].forEach(function (c) { prior[c] = true; });
    }
    return out;
  }

  // ------------------------------------------------------------------
  // M6. Krippendorff's alpha, nominal data (Krippendorff 2004; Hayes & Krippendorff 2007)
  // ------------------------------------------------------------------
  /** units: array of arrays of the values each coder gave (null = not coded). */
  function krippendorffAlphaNominal(units) {
    var o = {}, nc = {}, n = 0, pairable = 0;
    units.forEach(function (vals) {
      var v = vals.filter(function (x) { return x !== null && x !== undefined; });
      var m = v.length;
      if (m < 2) return;
      pairable++;
      for (var i = 0; i < m; i++) for (var j = 0; j < m; j++) {
        if (i === j) continue;
        var key = JSON.stringify([v[i], v[j]]);
        o[key] = (o[key] || 0) + 1 / (m - 1);
      }
    });
    var disagree = 0;
    Object.keys(o).forEach(function (key) {
      var cv = JSON.parse(key);
      nc[cv[0]] = (nc[cv[0]] || 0) + o[key];
      n += o[key];
      if (cv[0] !== cv[1]) disagree += o[key];
    });
    var sumSq = 0;
    Object.keys(nc).forEach(function (c) { sumSq += nc[c] * nc[c]; });
    var expected = n * n - sumSq;
    if (pairable === 0 || expected <= 0) return { alpha: null, units: pairable, values: n };
    return { alpha: 1 - (n - 1) * disagree / expected, units: pairable, values: n };
  }

  // ------------------------------------------------------------------
  // M7. Best-worst design: cyclic incomplete block design (John & Williams 1995)
  // ------------------------------------------------------------------
  /**
   * K items, K sets of size m. Set s = initial block + s (mod K). Every item
   * appears exactly m times. All initial blocks {0,a,b,c} are searched; the
   * chosen one covers the most item pairs, then has the most even pair counts.
   */
  function cyclicDesign(K, m) {
    m = m || SET_SIZE;
    if (K < m + 1) throw new Error('Need at least ' + (m + 1) + ' items.');
    var best = null;
    function evaluate(block) {
      var sets = [], pc = {}, s, i, j;
      for (s = 0; s < K; s++) sets.push(block.map(function (b) { return (b + s) % K; }));
      sets.forEach(function (set) {
        for (i = 0; i < set.length; i++) for (j = i + 1; j < set.length; j++) {
          var a = Math.min(set[i], set[j]), b = Math.max(set[i], set[j]), key = a + ',' + b;
          pc[key] = (pc[key] || 0) + 1;
        }
      });
      var counts = Object.keys(pc).map(function (k) { return pc[k]; });
      var cover = counts.length, sq = 0;
      counts.forEach(function (c) { sq += c * c; });
      return { block: block, sets: sets, cover: cover, sumSq: sq, pairCounts: pc };
    }
    function search(start, chosen) {
      if (chosen.length === m) {
        var ev = evaluate(chosen.slice());
        if (!best || ev.cover > best.cover || (ev.cover === best.cover && ev.sumSq < best.sumSq)) best = ev;
        return;
      }
      for (var x = start; x < K; x++) { chosen.push(x); search(x + 1, chosen); chosen.pop(); }
    }
    search(1, [0]);
    var totalPairs = K * (K - 1) / 2, dist = {}, appear = new Array(K).fill(0);
    best.sets.forEach(function (set) { set.forEach(function (x) { appear[x]++; }); });
    var pcs = [];
    for (var a = 0; a < K; a++) for (var b = a + 1; b < K; b++) { var c = best.pairCounts[a + ',' + b] || 0; pcs.push(c); dist[c] = (dist[c] || 0) + 1; }
    return {
      K: K, setSize: m, initialBlock: best.block, sets: best.sets,
      stats: { appearancesPerItem: appear, pairsCovered: best.cover, pairsTotal: totalPairs,
               pairCountMin: Math.min.apply(null, pcs), pairCountMax: Math.max.apply(null, pcs), pairCountDistribution: dist }
    };
  }

  // ------------------------------------------------------------------
  // M8. Best-worst counts (Finn & Louviere 1992; Louviere, Flynn & Marley 2015)
  // ------------------------------------------------------------------
  /** obs: [{resp, shown:[item indices], best, worst}]. Standardised score = (B - W) / times shown. */
  function bwCounts(obs, K) {
    var B = new Array(K).fill(0), W = new Array(K).fill(0), A = new Array(K).fill(0);
    obs.forEach(function (o) { o.shown.forEach(function (i) { A[i]++; }); B[o.best]++; W[o.worst]++; });
    return B.map(function (_, i) {
      return { item: i, best: B[i], worst: W[i], shown: A[i], bw: B[i] - W[i], std: A[i] ? (B[i] - W[i]) / A[i] : null };
    });
  }

  // ------------------------------------------------------------------
  // M11. Maxdiff model by maximum likelihood (Marley & Louviere 2005)
  //   P(best = b, worst = w | S) = exp(u_b - u_w) / sum_{i != j in S} exp(u_i - u_j)
  // Identification: last item fixed at 0; reported utilities are centred to mean 0.
  // Standard errors: cluster-robust sandwich by respondent (Huber 1967; White 1980; Cameron & Miller 2015).
  // ------------------------------------------------------------------
  function maxdiffLoglik(obs, u, wantDerivs) {
    var K = u.length, ll = 0, g = wantDerivs ? new Array(K).fill(0) : null, H = null, byResp = wantDerivs ? {} : null;
    if (wantDerivs) { H = []; for (var r = 0; r < K; r++) H.push(new Array(K).fill(0)); }
    obs.forEach(function (o) {
      var S = o.shown, m = S.length, pairs = [], maxv = -Infinity, a, b;
      for (a = 0; a < m; a++) for (b = 0; b < m; b++) {
        if (a === b) continue;
        var v = u[S[a]] - u[S[b]];
        pairs.push([S[a], S[b], v]);
        if (v > maxv) maxv = v;
      }
      var z = 0;
      pairs.forEach(function (p) { p.push(Math.exp(p[2] - maxv)); z += p[3]; });
      var lse = maxv + Math.log(z);
      ll += (u[o.best] - u[o.worst]) - lse;
      if (!wantDerivs) return;
      // score = x_bw - xbar, with x_ij = e_i - e_j and xbar = sum p_ij x_ij
      var xbar = {}, gi = {};
      pairs.forEach(function (p) {
        var pr = p[3] / z;
        p.push(pr);
        xbar[p[0]] = (xbar[p[0]] || 0) + pr;
        xbar[p[1]] = (xbar[p[1]] || 0) - pr;
      });
      S.forEach(function (i) { gi[i] = -(xbar[i] || 0); });
      gi[o.best] += 1; gi[o.worst] -= 1;
      var rk = String(o.resp), rg = byResp[rk] || (byResp[rk] = new Array(K).fill(0));
      S.forEach(function (i) { g[i] += gi[i]; rg[i] += gi[i]; });
      // Hessian = -(sum p_ij x_ij x_ij' - xbar xbar')
      pairs.forEach(function (p) {
        var i = p[0], j = p[1], pr = p[4];
        H[i][i] -= pr; H[j][j] -= pr; H[i][j] += pr; H[j][i] += pr;
      });
      S.forEach(function (i) { S.forEach(function (j) { H[i][j] += (xbar[i] || 0) * (xbar[j] || 0); }); });
    });
    return { ll: ll, g: g, H: H, byResp: byResp };
  }

  /**
   * Robustness model: sequential best-worst (Marley & Louviere 2005, sequential case).
   * Best is a logit choice from S; worst is then a logit choice, with utilities
   * reversed, from the items left: P = exp(u_b)/sum_S exp(u_i) * exp(-u_w)/sum_{S\b} exp(-u_j).
   * Dyachenko, Reczek & Allenby (2014) show respondents often answer in two steps like this.
   */
  function sequentialLoglik(obs, u, wantDerivs) {
    var K = u.length, ll = 0, g = wantDerivs ? new Array(K).fill(0) : null, H = null, byResp = wantDerivs ? {} : null;
    if (wantDerivs) { H = []; for (var r = 0; r < K; r++) H.push(new Array(K).fill(0)); }
    function step(items, sign, chosen, rg) {
      var v = items.map(function (i) { return sign * u[i]; }), mx = Math.max.apply(null, v), z = 0;
      var e = v.map(function (x) { var t = Math.exp(x - mx); z += t; return t; });
      ll += sign * u[chosen] - (mx + Math.log(z));
      if (!wantDerivs) return;
      var p = e.map(function (t) { return t / z; });
      items.forEach(function (i, a) {
        var gi = sign * ((i === chosen ? 1 : 0) - p[a]);
        g[i] += gi; rg[i] += gi;
        items.forEach(function (j, b) { H[i][j] -= p[a] * ((a === b ? 1 : 0) - p[b]); });
      });
    }
    obs.forEach(function (o) {
      var rg = null;
      if (wantDerivs) { var rk = String(o.resp); rg = byResp[rk] || (byResp[rk] = new Array(K).fill(0)); }
      step(o.shown, 1, o.best, rg);
      step(o.shown.filter(function (i) { return i !== o.best; }), -1, o.worst, rg);
    });
    return { ll: ll, g: g, H: H, byResp: byResp };
  }

  function fitMaxdiff(obs, K, opts) { return fitModel(obs, K, maxdiffLoglik, opts); }
  function fitSequential(obs, K, opts) { return fitModel(obs, K, sequentialLoglik, opts); }

  function fitModel(obs, K, loglik, opts) {
    opts = opts || {};
    var maxIter = opts.maxIter || 100, P = K - 1;
    var res = { status: 'ok', converged: false, iterations: 0, nObs: obs.length };
    if (!obs.length) { res.status = 'no data'; return res; }
    var nResp = Object.keys(obs.reduce(function (m, o) { m[o.resp] = 1; return m; }, {})).length;
    res.nResp = nResp;
    var beta = new Array(P).fill(0);
    function full(bv) { return bv.concat([0]); }
    function reduce(d) {
      var g = d.g.slice(0, P), H = [];
      for (var i = 0; i < P; i++) H.push(d.H[i].slice(0, P));
      return { g: g, H: H };
    }
    var cur = loglik(obs, full(beta), true);
    for (var it = 1; it <= maxIter; it++) {
      res.iterations = it;
      var red = reduce(cur);
      var negH = red.H.map(function (row) { return row.map(function (x) { return -x; }); });
      var L = cholesky(negH);
      if (!L) { res.status = 'not estimable (information matrix singular: too few responses)'; return res; }
      var step = cholSolve(L, red.g), t = 1, next = null, nb = null;
      for (var h = 0; h < 40; h++) {
        nb = beta.map(function (b, i) { return b + t * step[i]; });
        next = loglik(obs, full(nb), true);
        if (next.ll >= cur.ll - 1e-12) break;
        t /= 2;
      }
      var change = Math.max.apply(null, step.map(function (s) { return Math.abs(t * s); }));
      var llChange = next.ll - cur.ll;
      beta = nb; cur = next;
      if (change < 1e-9 || Math.abs(llChange) < 1e-13) { res.converged = true; break; }
    }
    if (!res.converged) { res.status = 'not estimable (did not converge: too few responses)'; return res; }
    if (Math.max.apply(null, beta.map(Math.abs)) > 20) {
      res.status = 'not estimable (an item is always or never chosen: too few responses)'; return res;
    }
    var red2 = reduce(cur);
    var negH2 = red2.H.map(function (row) { return row.map(function (x) { return -x; }); });
    var L2 = cholesky(negH2);
    if (!L2) { res.status = 'not estimable (information matrix singular: too few responses)'; return res; }
    var Vmodel = cholInverse(L2);
    // cluster-robust "meat"
    var Bm = []; for (var i = 0; i < P; i++) Bm.push(new Array(P).fill(0));
    var G = 0;
    Object.keys(cur.byResp).forEach(function (rk) {
      G++;
      var gr = cur.byResp[rk];
      for (var a = 0; a < P; a++) for (var b = 0; b < P; b++) Bm[a][b] += gr[a] * gr[b];
    });
    var Vrob = matMul(matMul(Vmodel, Bm), Vmodel);
    var corr = G > 1 ? G / (G - 1) : 1;
    Vrob = Vrob.map(function (row) { return row.map(function (x) { return x * corr; }); });
    // centre: u_c = M beta, M = [I; 0] - (1/K) 1 1'
    var M = [];
    for (var r = 0; r < K; r++) { M.push([]); for (var c = 0; c < P; c++) M[r].push((r === c ? 1 : 0) - 1 / K); }
    var uFull = full(beta), uMean = mean(uFull);
    var uc = uFull.map(function (x) { return x - uMean; });
    var Vc = matMul(matMul(M, Vrob), transpose(M));
    var VcModel = matMul(matMul(M, Vmodel), transpose(M));
    var ll0 = 0;
    obs.forEach(function (o) { ll0 -= Math.log(o.shown.length * (o.shown.length - 1)); });
    res.beta = beta;
    res.utility = uc;
    res.se = Vc.map(function (row, k) { return Math.sqrt(Math.max(0, row[k])); });
    res.seModel = VcModel.map(function (row, k) { return Math.sqrt(Math.max(0, row[k])); });
    res.covBeta = Vrob;
    res.weight = softmax(uc);
    res.ll = cur.ll; res.ll0 = ll0; res.rho2 = 1 - cur.ll / ll0;
    res.maxAbsGradient = Math.max.apply(null, red2.g.map(Math.abs));
    return res;
  }

  function softmax(u) {
    var mx = Math.max.apply(null, u), e = u.map(function (x) { return Math.exp(x - mx); }), s = sum(e);
    return e.map(function (x) { return x / s; });
  }

  /**
   * M12. Krinsky & Robb (1986) simulation: draw utilities from N(beta, V_robust),
   * then read off 95% intervals for each item's weight and rank.
   */
  function krinskyRobb(fit, K, draws, seed) {
    draws = draws || 2000;
    var L = cholesky(fit.covBeta);
    if (!L) return null;
    var nrm = normalSampler(rng(seed || 20261105)), P = K - 1;
    var w = [], rk = [], i, d;
    for (i = 0; i < K; i++) { w.push([]); rk.push([]); }
    for (d = 0; d < draws; d++) {
      var z = [];
      for (i = 0; i < P; i++) z.push(nrm());
      var b = fit.beta.map(function (bb, r) { var s = bb; for (var c = 0; c <= r; c++) s += L[r][c] * z[c]; return s; });
      var u = b.concat([0]);
      var wt = softmax(u), ranks = ranksDesc(u);
      for (i = 0; i < K; i++) { w[i].push(wt[i]); rk[i].push(ranks[i]); }
    }
    return w.map(function (_, k) {
      var top = rk[k].filter(function (r) { return r === 1; }).length / draws;
      // ranks are whole numbers, so their interval uses the discrete (type 1) quantile
      return { weightLo: quantile(w[k], 0.025), weightHi: quantile(w[k], 0.975),
               rankLo: quantileDiscrete(rk[k], 0.025), rankHi: quantileDiscrete(rk[k], 0.975), pTop: top };
    });
  }

  // ------------------------------------------------------------------
  // M13. Speeding flag: relative speed index (Leiner 2019, p. 237)
  //   per page: speed factor = sample median page time / respondent's page time,
  //   clipped at 3, so that skipping a single page by accident does not disqualify anyone;
  //   index = mean of the clipped factors over the pages she saw.
  // ------------------------------------------------------------------
  function relativeSpeed(pageTimesList) {
    var byPage = {};
    pageTimesList.forEach(function (pt) {
      Object.keys(pt || {}).forEach(function (p) { if (pt[p] > 0) (byPage[p] = byPage[p] || []).push(pt[p]); });
    });
    var med = {};
    Object.keys(byPage).forEach(function (p) { med[p] = median(byPage[p]); });
    return pageTimesList.map(function (pt) {
      var f = [];
      Object.keys(pt || {}).forEach(function (p) { if (pt[p] > 0 && med[p]) f.push(Math.min(RSI_CLIP, med[p] / pt[p])); });
      return f.length ? mean(f) : null;
    });
  }

  // ------------------------------------------------------------------
  // Validation of submissions (server side; never trusts the browser)
  // ------------------------------------------------------------------
  function str(v, max) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
  }
  function one(v, allowed) { return allowed.indexOf(v) >= 0 ? v : null; }
  function many(v, allowed) {
    if (!Array.isArray(v)) return [];
    var out = [];
    v.forEach(function (x) { if (allowed.indexOf(x) >= 0 && out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  function list(v) {
    if (!Array.isArray(v)) return [];
    return v.slice(0, LIMITS.listItems).map(function (x) { return str(x, LIMITS.short); }).filter(function (x) { return x.length > 0; });
  }
  function pageTimes(v) {
    var out = {};
    if (!v || typeof v !== 'object') return out;
    Object.keys(v).slice(0, LIMITS.pages).forEach(function (k) {
      var t = Number(v[k]);
      if (/^[A-Za-z0-9_]{1,24}$/.test(k) && isFinite(t) && t >= 0 && t <= 86400000) out[k] = Math.round(t);
    });
    return out;
  }
  function uuidOk(id) { return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id); }

  function validateEligibility(a) {
    if (a.consent !== 'yes') return 'Consent is required.';
    if (a.gender !== 'woman') return 'Not eligible.';
    if (one(a.age, OPTIONS.age) === null || a.age === 'under18') return 'Not eligible.';
    if (a.roads !== 'yes') return 'Not eligible.';
    return null;
  }
  /** The email, trimmed and in lower case so that the same address always matches; '' if it is not a valid address. */
  function emailOf(v) {
    var e = str(v, 1000).toLowerCase();
    return e.length <= LIMITS.email && EMAIL_RE.test(e) ? e : '';
  }
  function travelAnswers(a, out) {
    out.modes = many(a.modes, OPTIONS.modes);
    out.modesOther = out.modes.indexOf('other') >= 0 ? str(a.modesOther, LIMITS.short) : '';
    out.company = one(a.company, OPTIONS.company);
    out.area = one(a.area, OPTIONS.area);
    out.city = str(a.city, LIMITS.short);
  }
  /** The fields every record has. The email and name are kept beside the answers, not in them, so they can be left out of any shared file. */
  function common(p, now, form) {
    var a = p.answers || {};
    return {
      form: form,
      id: uuidOk(p.respondentId) ? p.respondentId : null,
      email: emailOf(a.email),
      name: str(a.name, LIMITS.name),
      receivedAt: new Date(now).toISOString(),
      startedAt: str(p.startedAt, 40),
      test: p.test === true,
      sameDeviceRepeat: p.sameDeviceRepeat === true,
      pageTimes: pageTimes(p.pageTimes),
      formVersion: str(p.formVersion, 20)
    };
  }
  function identityError(r) {
    if (!r.id) return 'Missing respondent id.';
    if (!r.email) return 'A valid email address is required.';
    return null;
  }

  function validateA(p, now) {
    if (!p || typeof p !== 'object') return { ok: false, error: 'Empty submission.' };
    var a = p.answers || {};
    var e = validateEligibility(a);
    if (e) return { ok: false, error: e };
    var r = common(p, now, 'A');
    var ie = identityError(r);
    if (ie) return { ok: false, error: ie };
    var x = { consent: 'yes', gender: 'woman', age: a.age, roads: 'yes' };
    // Block 1 (A2): no mention of safety
    x.changedAny = one(a.changedAny, OPTIONS.yesNoUnsure);
    x.listAny = list(a.listAny);
    x.listAnyNothing = a.listAnyNothing === true && x.listAny.length === 0;
    // Block 2 (A3): safety; the episode follow-ups are kept only after a yes
    x.changedSafety = one(a.changedSafety, OPTIONS.yesNoUnsure);
    var yesSafety = x.changedSafety === 'yes';
    x.storySafety = yesSafety ? str(a.storySafety, LIMITS.long) : '';
    x.timeSafety = yesSafety ? one(a.timeSafety, OPTIONS.timeOfDay) : null;
    x.listSafety = list(a.listSafety);
    x.listSafetyNothing = a.listSafetyNothing === true && x.listSafety.length === 0;
    // A4 travel profile, asked after both blocks; A5 debriefing
    travelAnswers(a, x);
    x.unclear = str(a.unclear, LIMITS.long);
    r.answers = x;
    return { ok: true, record: r };
  }

  function validateB(p, now, freeze) {
    if (!freeze) return { ok: false, error: 'This survey is not open yet.' };
    if (!p || typeof p !== 'object') return { ok: false, error: 'Empty submission.' };
    if (Number(p.designVersion) !== freeze.designVersion) return { ok: false, error: 'The survey was updated. Please reload the page and start again.' };
    var a = p.answers || {};
    var e = validateEligibility(a);
    if (e) return { ok: false, error: e };
    var r = common(p, now, 'B');
    var ie = identityError(r);
    if (ie) return { ok: false, error: ie };
    r.designVersion = freeze.designVersion;
    r.sameDeviceFormA = p.sameDeviceFormA === true;
    var x = { consent: 'yes', gender: 'woman', age: a.age, roads: 'yes' };
    travelAnswers(a, x);
    x.unclearItems = str(a.unclearItems, LIMITS.long);
    x.missingItems = str(a.missingItems, LIMITS.long);
    r.answers = x;
    var sets = freeze.sets, given = Array.isArray(p.bws) ? p.bws : [];
    if (given.length !== sets.length) return { ok: false, error: 'Incomplete best-worst data.' };
    var seen = {}, bws = [];
    for (var i = 0; i < given.length; i++) {
      var g = given[i] || {}, s = Number(g.set);
      if (!(s >= 0 && s < sets.length) || seen[s] || Math.floor(s) !== s) return { ok: false, error: 'Invalid set index.' };
      seen[s] = true;
      var shown = Array.isArray(g.shown) ? g.shown.map(Number) : [];
      var expect = sets[s].slice().sort(function (u, v) { return u - v; });
      var got = shown.slice().sort(function (u, v) { return u - v; });
      if (JSON.stringify(expect) !== JSON.stringify(got)) return { ok: false, error: 'Items shown do not match the design.' };
      var best = g.best === null || g.best === undefined ? null : Number(g.best);
      var worst = g.worst === null || g.worst === undefined ? null : Number(g.worst);
      var answered = best !== null && worst !== null && best !== worst && shown.indexOf(best) >= 0 && shown.indexOf(worst) >= 0;
      var ms = g.ms === null || g.ms === undefined ? NaN : Number(g.ms);
      bws.push({ order: i, set: s, shown: shown, best: answered ? best : null, worst: answered ? worst : null,
                 ms: isFinite(ms) && ms >= 0 && ms <= 86400000 ? Math.round(ms) : null });
    }
    r.bws = bws;
    return { ok: true, record: r };
  }

  /**
   * Item wording check used before freezing (rule R2 in the questionnaire).
   * Returns { threat: [...], criterion: [...] }: words that presuppose a threat,
   * and words that repeat the Form B question's criterion ("safe"), each
   * matched at the start of a word ("unsafe" is not read as "safe").
   */
  function wordingCheck(text) {
    var t = String(text || '').toLowerCase();
    function hits(words) {
      return words.filter(function (w) { return new RegExp('(^|[^\\p{L}\\p{N}])' + w, 'u').test(t); });
    }
    return { threat: hits(THREAT_WORDS), criterion: hits(CRITERION_WORDS) };
  }
  function wordingProblems(text) { var c = wordingCheck(text); return c.threat.concat(c.criterion); }

  // ------------------------------------------------------------------
  // Full analysis
  // ------------------------------------------------------------------
  function tally(records, field, allowed, isMulti) {
    var counts = {}, n = 0;
    allowed.forEach(function (v) { counts[v] = 0; });
    records.forEach(function (r) {
      var v = r.answers[field];
      if (isMulti) { if (v && v.length) { n++; v.forEach(function (x) { counts[x]++; }); } }
      else if (v !== null && v !== undefined && v !== '') { n++; counts[v]++; }
    });
    return { n: n, counts: counts };
  }
  function proportionYes(records, field) {
    var t = tally(records, field, OPTIONS.yesNoUnsure, false);
    return { n: t.n, counts: t.counts, yes: wilson(t.counts.yes, t.n) };
  }
  function sampleProfile(records) {
    return {
      age: tally(records, 'age', OPTIONS.age, false),
      modes: tally(records, 'modes', OPTIONS.modes, true),
      company: tally(records, 'company', OPTIONS.company, false),
      area: tally(records, 'area', OPTIONS.area, false)
    };
  }
  function byTime(x, y) { return x.receivedAt < y.receivedAt ? -1 : x.receivedAt > y.receivedAt ? 1 : 0; }

  /**
   * One response per person: in time order, a later record with the same email is a repeat and is
   * left out, so each woman counts once, with the answer she gave before she had seen the form.
   * Tests are matched among tests only, so a test run never hides a real response.
   * Returns { first: {id: true}, repeat: {id: true} }.
   */
  function firstPerPerson(recordsInTimeOrder) {
    var seen = {}, out = { first: {}, repeat: {} };
    recordsInTimeOrder.forEach(function (r) {
      var k = r.email ? (r.test ? 'test|' : 'real|') + r.email : null;
      if (k && seen[k]) { out.repeat[r.id] = true; return; }
      if (k) seen[k] = true;
      out.first[r.id] = true;
    });
    return out;
  }

  /**
   * data = { formA: [records], formB: [records], codes: [{id,label,description,scope}],
   *          assignments: [{key, coder, code}], config: {...} }
   * An assignment's code is EXCLUDE, one code id, or an ordered list of up to 3 code ids.
   */
  function buildResults(data, opts) {
    opts = opts || {};
    var cfg = data.config || {};
    var codes = data.codes || [];
    var codeById = {};
    codes.forEach(function (c) { codeById[c.id] = c; });
    var assign = { 1: {}, 2: {} };
    (data.assignments || []).forEach(function (a) {
      var l = codeList(a.code);
      if (l === null) return;
      if (l !== EXCLUDE) { l = l.filter(function (id) { return codeById[id]; }); if (!l.length) return; }
      assign[a.coder === 2 ? 2 : 1][a.key] = l;
    });
    function codeOf1(key) { return assign[1][key] || null; }

    // Test responses (?test=1) are left out, unless the researcher asks to see them to check the forms.
    // The freeze always runs without them. A repeat from the same email is left out (first one kept).
    var withTest = opts.includeTest === true;
    var allA = (data.formA || []).slice().sort(byTime);
    var onceA = firstPerPerson(allA);
    var statusA = {};
    allA.forEach(function (r) { statusA[r.id] = r.test && !withTest ? 'test' : onceA.repeat[r.id] ? 'repeat' : 'kept'; });
    var A = allA.filter(function (r) { return statusA[r.id] === 'kept'; });

    // --- coding table: distinct entries across both lists ---
    var entries = {};
    function addEntries(rec, field, listName) {
      var seenHere = {};
      rec.answers[field].forEach(function (raw) {
        var key = normalizeEntry(raw);
        if (!key || seenHere[key]) return;
        seenHere[key] = true;
        var e = entries[key] || (entries[key] = { key: key, example: raw, safety: 0, unprimed: 0 });
        e[listName]++;
      });
    }
    A.forEach(function (r) { addEntries(r, 'listSafety', 'safety'); addEntries(r, 'listAny', 'unprimed'); });
    var entryList = Object.keys(entries).map(function (k) {
      var e = entries[k];
      e.code1 = assign[1][k] || null;
      e.code2 = assign[2][k] || null;
      e.coder2Sample = hash32(k) % 100 < 30;
      return e;
    });
    entryList.sort(function (x, y) { return (y.safety + y.unprimed) - (x.safety + x.unprimed) || (x.key < y.key ? -1 : 1); });
    var safetyEntries = entryList.filter(function (e) { return e.safety > 0; });
    var unprimedEntries = entryList.filter(function (e) { return e.unprimed > 0; });
    var coverage = {
      safety: { entries: safetyEntries.length, coded: safetyEntries.filter(function (e) { return e.code1; }).length },
      unprimed: { entries: unprimedEntries.length, coded: unprimedEntries.filter(function (e) { return e.code1; }).length },
      split: entryList.filter(function (e) { return Array.isArray(e.code1) && e.code1.length > 1; }).length
    };

    // --- salience ---
    function listsFor(field) {
      return A.map(function (r) { return { rec: r, list: cleanList(r.answers[field], codeOf1) }; })
              .filter(function (x) { return x.list.length > 0; });
    }
    var safetyLists = listsFor('listSafety'), unprimedLists = listsFor('listAny');
    function decorate(sal) {
      sal.rows.forEach(function (row) {
        if (row.code) { var c = codeById[row.code]; row.label = c ? c.label : row.code; row.scope = c ? c.scope : null; }
        else { row.label = row.key; row.scope = null; }
      });
      var coded = sal.rows.filter(function (r) { return r.coded; });
      sal.codedRows = coded;
      sal.uncodedItems = sal.rows.length - coded.length;
      delete sal.rows;
      return sal;
    }
    var salSafety = decorate(salience(safetyLists.map(function (x) { return x.list; })));
    var salUnprimed = decorate(salience(unprimedLists.map(function (x) { return x.list; })));
    // the elbow and the Form B cut-off are both read on the eligible (safety-scope) parameters only
    var eligible = salSafety.codedRows.filter(function (r) { return r.scope !== 'other'; });
    salSafety.elbow = elbow(eligible.map(function (r) { return r.smithS; }));

    // --- saturation on the safety list (codes only) ---
    var codeSets = safetyLists.map(function (x) {
      return x.list.filter(function (e) { return e.code; }).map(function (e) { return e.code; });
    });
    var sat = {
      primary: saturation(codeSets, 4, 2, 0.05),
      conservative: saturation(codeSets, 4, 3, 0)
    };

    // --- premise checks ---
    var unprimedWithCodes = unprimedLists.filter(function (x) { return x.list.some(function (e) { return e.code; }); });
    var withSafetyCode = unprimedWithCodes.filter(function (x) {
      return x.list.some(function (e) { return e.code && codeById[e.code] && codeById[e.code].scope === 'safety'; });
    }).length;
    var premise = {
      changedRoadAnyReason: proportionYes(A, 'changedAny'),
      changedRoadSafety: proportionYes(A, 'changedSafety'),
      unprimedMentionsSafety: { n: unprimedWithCodes.length, x: withSafetyCode, ci: wilson(withSafetyCode, unprimedWithCodes.length),
                                fullyCoded: coverage.unprimed.coded === coverage.unprimed.entries },
      saidNothingUnprimed: A.filter(function (r) { return r.answers.listAnyNothing; }).length,
      saidNothingSafety: A.filter(function (r) { return r.answers.listSafetyNothing; }).length
    };

    // --- inter-coder agreement (coder 2 optional); a split entry's value is its set of codes ---
    var units = entryList.filter(function (e) { return e.code1 && e.code2; }).map(function (e) { return [codeValue(e.code1), codeValue(e.code2)]; });
    var alpha = krippendorffAlphaNominal(units);

    var speedA = relativeSpeed(A.map(function (r) { return r.pageTimes; }));
    function texts(field) { return A.map(function (r) { return r.answers[field]; }).filter(Boolean); }

    var formA = {
      n: A.length, nTest: allA.filter(function (r) { return r.test; }).length,
      nRepeat: allA.filter(function (r) { return statusA[r.id] === 'repeat'; }).length,
      sample: sampleProfile(A),
      premise: premise,
      timeSafety: tally(A, 'timeSafety', OPTIONS.timeOfDay, false),
      coding: { entries: entryList, coverage: coverage, alpha: alpha },
      salience: { safety: salSafety, unprimed: salUnprimed },
      saturation: sat,
      speedFlagged: speedA.filter(function (s) { return s !== null && s > RSI_FLAG; }).length,
      texts: { storySafety: texts('storySafety'), unclear: texts('unclear') }
    };

    // --- candidate list for Form B (eligible codes in salience order) ---
    formA.candidates = eligible.map(function (r, i) {
      var c = codeById[r.code] || {};
      var w = wordingCheck((c.label || '') + ' ' + (c.description || ''));
      return { rank: i + 1, codeId: r.code, label: c.label || '', description: c.description || '', smithS: r.smithS, freq: r.freq,
               wordingThreat: w.threat, wordingCriterion: w.criterion, wordingProblems: w.threat.concat(w.criterion) };
    });

    var out = { ok: true, generatedAt: new Date(opts.now || Date.now()).toISOString(), includesTest: withTest, formA: formA, formB: null, config: cfg, codes: codes };
    // Form B must come from women who did not answer Form A: matched by email against real Form A responses only
    var emailsA = {};
    allA.forEach(function (r) { if (r.email && !r.test) emailsA[r.email] = true; });
    var who = {};
    out.formB = analyseFormB(data.formB || [], cfg.freeze || null, opts, emailsA, who);
    // the researcher's list of every stored response, by email, with the reason it is in or out of the analysis
    out.respondents = allA.map(function (r) { return person(r, statusA[r.id], []); })
      .concat((data.formB || []).slice().sort(byTime).map(function (r) { return person(r, who[r.id].status, who[r.id].flags); }));
    return out;
  }
  function person(r, status, flags) {
    return { form: r.form, id: r.id, receivedAt: r.receivedAt, email: r.email || '', name: r.name || '', test: r.test === true,
             designVersion: r.designVersion === undefined ? null : r.designVersion, status: status, flags: flags };
  }

  /**
   * who (filled in): record id -> { status, flags }. Status is why a response is in or out of the ranking:
   * 'kept'; 'test' (left out unless tests are included); 'closed' (Form B not open) or 'otherVersion'
   * (another design version); 'repeat' (the same email answered Form B before, in any version);
   * 'formA' (the same email answered Form A: Form B needs different women).
   */
  function analyseFormB(allBunsorted, freeze, opts, emailsA, who) {
    var withTest = opts.includeTest === true;
    var allB = allBunsorted.slice().sort(byTime);
    var once = firstPerPerson(allB);
    allB.forEach(function (r) {
      var s;
      if (r.test && !withTest) s = 'test';
      else if (!freeze) s = 'closed';
      else if (r.designVersion !== freeze.designVersion) s = 'otherVersion';
      else if (once.repeat[r.id]) s = 'repeat';
      else if (r.email && emailsA[r.email]) s = 'formA';
      else s = 'kept';
      who[r.id] = { status: s, flags: [] };
    });
    var fb = { open: !!freeze, freeze: freeze, nAll: allB.length };
    if (!freeze) return fb;
    var K = freeze.items.length;
    function count(s) { return allB.filter(function (r) { return who[r.id].status === s; }).length; }
    var B = allB.filter(function (r) { return who[r.id].status === 'kept'; });
    fb.nTest = allB.filter(function (r) { return r.test; }).length;
    fb.nOtherVersions = count('otherVersion');
    fb.nRepeat = count('repeat');
    fb.nFormA = count('formA');
    fb.n = B.length;
    fb.nAnswered = B.filter(function (r) { return r.bws.some(function (s) { return s.best !== null; }); }).length;
    fb.sample = sampleProfile(B);
    // Earlier participation is settled by the email rules above. The device marks are kept in the data but not
    // used: a phone is often shared, and the email tells people apart. The one sensitivity flag left is speed.
    var speed = relativeSpeed(B.map(function (r) { return r.pageTimes; }));
    var FLAGS = ['speed'];
    B.forEach(function (r, i) {
      r._flags = [];
      if (speed[i] !== null && speed[i] > RSI_FLAG) r._flags.push('speed');
      who[r.id].flags = r._flags.slice();
    });
    function obsOf(recs) {
      var obs = [];
      recs.forEach(function (r) { r.bws.forEach(function (s) { if (s.best !== null) obs.push({ resp: r.id, shown: s.shown, best: s.best, worst: s.worst }); }); });
      return obs;
    }
    var obs = obsOf(B);
    fb.nChoices = obs.length;
    fb.nSkippedSets = B.reduce(function (m, r) { return m + r.bws.filter(function (s) { return s.best === null; }).length; }, 0);
    var counts = bwCounts(obs, K);
    var fit = fitMaxdiff(obs, K);
    var kr = fit.status === 'ok' ? krinskyRobb(fit, K, opts.draws || 2000, 20261105) : null;
    var stdScores = counts.map(function (c) { return c.std === null ? 0 : c.std; });
    var ranking = freeze.items.map(function (it, i) {
      var row = { item: i, label: it.label, description: it.description, best: counts[i].best, worst: counts[i].worst,
                  shown: counts[i].shown, bw: counts[i].bw, std: counts[i].std };
      if (fit.status === 'ok') {
        row.utility = fit.utility[i]; row.se = fit.se[i]; row.weight = fit.weight[i];
        if (kr) { row.weightLo = kr[i].weightLo; row.weightHi = kr[i].weightHi; row.rankLo = kr[i].rankLo; row.rankHi = kr[i].rankHi; row.pTop = kr[i].pTop; }
      }
      return row;
    });
    var basis = fit.status === 'ok' ? fit.utility : stdScores;
    var r1 = ranksDesc(basis), rc = ranksDesc(stdScores);
    ranking.forEach(function (row, i) { row.rank = r1[i]; row.rankCounts = rc[i]; });
    ranking.sort(function (a, b) { return a.rank - b.rank || a.item - b.item; });
    fb.ranking = ranking;
    fb.rankingBasis = fit.status === 'ok' ? 'model' : 'counts';
    fb.model = { status: fit.status, converged: fit.converged, iterations: fit.iterations, nObs: fit.nObs, nResp: fit.nResp,
                 ll: fit.ll, ll0: fit.ll0, rho2: fit.rho2, maxAbsGradient: fit.maxAbsGradient };
    fb.agreementCountsVsModel = fit.status === 'ok' ? spearman(fit.utility, stdScores) : null;

    // robustness: the sequential best-then-worst model on the same choices
    var seq = fit.status === 'ok' ? fitSequential(obs, K) : null;
    fb.sequential = seq ? { status: seq.status, rho2: seq.rho2,
      spearman: seq.status === 'ok' ? spearman(fit.utility, seq.utility) : null,
      ranks: seq.status === 'ok' ? ranksDesc(seq.utility) : null } : null;

    // sensitivity: drop flagged respondents
    var kept = B.filter(function (r) { return r._flags.length === 0; });
    var byFlag = {};
    FLAGS.forEach(function (f) { byFlag[f] = B.filter(function (r) { return r._flags.indexOf(f) >= 0; }).length; });
    var sens = { nExcluded: B.length - kept.length, nKept: kept.length, byFlag: byFlag };
    if (sens.nExcluded > 0 && fit.status === 'ok') {
      var fit2 = fitMaxdiff(obsOf(kept), K);
      sens.status = fit2.status;
      if (fit2.status === 'ok') {
        var rk2 = ranksDesc(fit2.utility);
        sens.spearman = spearman(fit.utility, fit2.utility);
        sens.ranks = freeze.items.map(function (it, i) { return { item: i, rank: rk2[i], weight: fit2.weight[i] }; });
      }
    }
    fb.sensitivity = sens;

    // position check: with randomised order each screen position should be chosen about equally often
    var pos = [];
    for (var p = 0; p < SET_SIZE; p++) pos.push({ position: p + 1, best: 0, worst: 0 });
    B.forEach(function (r) { r.bws.forEach(function (s) {
      if (s.best === null) return;
      var bi = s.shown.indexOf(s.best), wi = s.shown.indexOf(s.worst);
      if (pos[bi]) pos[bi].best++;
      if (pos[wi]) pos[wi].worst++;
    }); });
    fb.positions = pos;
    fb.positionTest = {
      best: chiSquareUniform(pos.map(function (x) { return x.best; })),
      worst: chiSquareUniform(pos.map(function (x) { return x.worst; }))
    };
    fb.texts = {
      unclearItems: B.map(function (r) { return r.answers.unclearItems; }).filter(Boolean),
      missingItems: B.map(function (r) { return r.answers.missingItems; }).filter(Boolean)
    };
    B.forEach(function (r) { delete r._flags; });
    return fb;
  }

  /** Build the frozen Form B configuration from the current Form A results. */
  function buildFreeze(results, k, prevVersion, now) {
    var A = results.formA;
    if (!(k >= K_MIN && k <= K_MAX) || Math.floor(k) !== k) return { ok: false, error: 'K must be a whole number from ' + K_MIN + ' to ' + K_MAX + '.' };
    var cov = A.coding.coverage.safety;
    if (cov.entries === 0) return { ok: false, error: 'There are no Form A safety-list entries yet.' };
    if (cov.coded < cov.entries) return { ok: false, error: 'Code every safety-list entry first (' + (cov.entries - cov.coded) + ' left).' };
    var cands = A.candidates;
    if (cands.length < k) return { ok: false, error: 'Only ' + cands.length + ' eligible parameters; choose a smaller K or keep collecting Form A.' };
    var chosen = cands.slice(0, k), problems = [];
    chosen.forEach(function (c) {
      if (!c.label || c.label.length < 3) problems.push('"' + c.codeId + '" needs a label.');
      if (!c.description) problems.push('"' + c.label + '" needs a one-line description.');
      if (c.wordingThreat.length) problems.push('"' + c.label + '" uses ' + c.wordingThreat.join(', ') + ', which presupposes a threat.');
      if (c.wordingCriterion.length) problems.push('"' + c.label + '" repeats the question\'s criterion (' + c.wordingCriterion.join(', ') + '); name the road feature instead.');
      if (c.freq < MIN_MENTIONS) problems.push('"' + c.label + '" was listed by only ' + c.freq + ' respondent; single mentions are treated as idiosyncratic (Sutrop 2001).');
    });
    if (problems.length) return { ok: false, error: problems.join(' ') };
    var tie = cands.length > k && Math.abs(cands[k].smithS - cands[k - 1].smithS) < 1e-12;
    var design = cyclicDesign(k, SET_SIZE);
    return { ok: true, freeze: {
      designVersion: (prevVersion || 0) + 1,
      frozenAt: new Date(now || Date.now()).toISOString(),
      k: k,
      rule: 'Top ' + k + ' parameters by Smith\'s salience index on the Form A safety list (A3.4), excluding codes marked "not safety" and codes listed by fewer than ' + MIN_MENTIONS + ' respondents; ties broken by frequency, then mean position.',
      tieAtCutoff: tie,
      nFormA: A.n,
      saturation: A.saturation.primary.label,
      elbowRank: A.salience.safety.elbow ? A.salience.safety.elbow.rank : null,
      items: chosen.map(function (c) { return { codeId: c.codeId, label: c.label, description: c.description, smithS: c.smithS, freq: c.freq }; }),
      sets: design.sets,
      designStats: design.stats,
      initialBlock: design.initialBlock
    } };
  }

  return {
    EXCLUDE: EXCLUDE, OPTIONS: OPTIONS, LIMITS: LIMITS, EMAIL_RE: EMAIL_RE, THREAT_WORDS: THREAT_WORDS, CRITERION_WORDS: CRITERION_WORDS,
    K_MIN: K_MIN, K_MAX: K_MAX, SET_SIZE: SET_SIZE, MIN_MENTIONS: MIN_MENTIONS, MAX_CODES_PER_ENTRY: MAX_CODES_PER_ENTRY,
    RSI_CLIP: RSI_CLIP, RSI_FLAG: RSI_FLAG,
    quantile: quantile, quantileDiscrete: quantileDiscrete, median: median, wilson: wilson, rng: rng, spearman: spearman, ranksDesc: ranksDesc,
    lnGamma: lnGamma, chiSquareP: chiSquareP, chiSquareUniform: chiSquareUniform,
    normalizeEntry: normalizeEntry, codeList: codeList, codeValue: codeValue, cleanList: cleanList, salience: salience, elbow: elbow, saturation: saturation,
    krippendorffAlphaNominal: krippendorffAlphaNominal, cyclicDesign: cyclicDesign, bwCounts: bwCounts,
    maxdiffLoglik: maxdiffLoglik, sequentialLoglik: sequentialLoglik, fitMaxdiff: fitMaxdiff, fitSequential: fitSequential,
    softmax: softmax, krinskyRobb: krinskyRobb,
    relativeSpeed: relativeSpeed, validateA: validateA, validateB: validateB, wordingCheck: wordingCheck, wordingProblems: wordingProblems,
    buildResults: buildResults, buildFreeze: buildFreeze, hash32: hash32, firstPerPerson: firstPerPerson
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = Engine; }
