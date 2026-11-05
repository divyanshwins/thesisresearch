/*
 * analytics.js: researcher dashboard. Every number shown is computed by
 * backend/engine.js; this page only displays it, collects coding decisions
 * and builds CSV exports.
 */
(function () {
  'use strict';
  var h = window.Survey.h, API = window.API, QS = window.QUESTIONS, O = QS.options;
  var app = document.getElementById('app');
  var EXCLUDE = '__exclude__', MAX_CODES = 3, K_MIN = 8, K_MAX = 16, MIN_MENTIONS = 2;
  var PLANNED_B = (window.APP_CONFIG && window.APP_CONFIG.plannedSampleB) || 50;
  var S = { key: null, res: null, tab: 'ranking', coder: 1, pending: { 1: {}, 2: {} }, codeEdits: {}, deleted: {},
            filter: 'uncoded', list: 'all', search: '', k: 12, busy: false, error: null, includeTest: false,
            who: '', raw: null };

  // ---------------------------------------------------------------- helpers
  function session(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }
  // a true minus sign for negative numbers, so columns of signed figures read cleanly
  function num(x, d) { return x === null || x === undefined || !isFinite(x) ? '–' : Number(x).toFixed(d === undefined ? 2 : d).replace(/^-/, '\u2212'); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function testWord() { return S.res && S.res.includesTest ? 'included' : 'left out'; }
  function pct(p, d) { return p === null || p === undefined || !isFinite(p) ? '–' : (100 * p).toFixed(d === undefined ? 1 : d) + '%'; }
  function ci(w) { return w ? pct(w.p, 0) + ' (95% CI ' + pct(w.lo, 0) + '–' + pct(w.hi, 0) + ')' : '–'; }
  function pval(p) { return p === null || p === undefined ? '–' : p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3); }
  function pendingCount() { return Object.keys(S.pending[1]).length + Object.keys(S.pending[2]).length + Object.keys(S.codeEdits).length + Object.keys(S.deleted).length; }
  function same(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
  function asList(c) { return c === null || c === undefined ? null : c === EXCLUDE ? EXCLUDE : Array.isArray(c) ? c.slice() : [c]; }

  function table(headers, rows, opts) {
    opts = opts || {};
    var t = h('table');
    var thead = h('thead', {}, [h('tr', {}, headers.map(function (c) { return h('th', { class: c.num ? 'num' : null, text: c.text !== undefined ? c.text : c, scope: 'col' }); }))]);
    var tbody = h('tbody');
    rows.forEach(function (r, i) {
      var tr = h('tr', { class: opts.cutAfter !== undefined && opts.cutAfter !== null && i === opts.cutAfter ? 'cut' : null });
      r.forEach(function (cell, j) {
        var td = h('td', { class: headers[j] && headers[j].num ? 'num' : null });
        if (cell instanceof Node) td.appendChild(cell); else td.textContent = cell === null || cell === undefined ? '' : String(cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    t.appendChild(thead); t.appendChild(tbody);
    return t;
  }
  function panel(title, kids, note) {
    return h('section', { class: 'panel' }, [title ? h('h2', { text: title }) : null, note ? h('p', { class: 'note', text: note }) : null].concat(kids));
  }
  function kpis(cells) {
    return h('div', { class: 'kpis' }, cells.map(function (c) {
      return h('div', { class: 'kpi' }, [h('div', { class: 'label', text: c[0] }), h('div', { class: 'value' }, [c[1], c[3] ? h('span', { class: 'unit', text: c[3] }) : null]), c[2] ? h('div', { class: 'sub', text: c[2] }) : null]);
    }));
  }
  function titleRow(title, finding, muted) {
    return h('div', { class: 'title-row' }, [h('h1', { text: title }), finding ? h('p', { class: 'finding' + (muted ? ' muted' : ''), text: finding }) : null]);
  }
  function textList(items) {
    if (!items || !items.length) return h('p', { class: 'muted small', text: 'None yet.' });
    return h('ul', { class: 'textlist' }, items.map(function (t) { return h('li', { text: t }); }));
  }
  function checkList(items, block) { return h('ul', { class: 'checks' + (block ? ' block' : '') }, items.map(function (t) { return h('li', { text: t }); })); }
  function details(summary, kids) { return h('details', {}, [h('summary', { text: summary })].concat(kids)); }
  function tallyTable(t, group, multi) {
    var rows = (O[group] || []).map(function (o) { var c = t.counts[o.v] || 0; return [o.label, String(c), t.n ? pct(c / t.n, 0) : '–']; });
    return h('div', {}, [table(['Answer', { text: 'n', num: true }, { text: multi ? '% of those answering (several allowed)' : '% of those answering', num: true }], rows),
      h('p', { class: 'muted small', style: 'margin-top:6px', text: 'Answered by ' + t.n + '.' })]);
  }

  // ---------------------------------------------------------------- data
  function load() {
    if (S.busy) return;
    S.busy = true;
    var main = document.getElementById('dash');
    if (main) main.style.opacity = '0.6';
    API.post({ action: 'results', key: S.key, includeTest: S.includeTest }).then(function (res) {
      S.res = res; S.error = null; S.busy = false;
      if (S.key) session('researcherKey', S.key);
      render();
    }).catch(function (err) {
      S.busy = false;
      if (/researcher key|private address/i.test(err.message)) { S.key = null; session('researcherKey', null); login(err.message); return; }
      S.error = err.message;
      if (S.res) render(); else login(err.message);
    });
  }
  // No automatic refresh: on the free storage plan every refresh counts against a monthly allowance.
  function act(body, okMsg) {
    body.key = S.key;
    S.busy = true;
    return API.post(body).then(function (r) { S.busy = false; if (okMsg) S.flash = okMsg; return r; })
      .catch(function (err) { S.busy = false; window.alert(err.message); throw err; });
  }

  // ---------------------------------------------------------------- shell
  function bar(tools) {
    return h('header', { class: 'abar' }, [h('div', { class: 'abar-in' }, [
      h('span', { class: 'mark', 'aria-hidden': 'true' }),
      h('span', { class: 'crumb' }, ['Road choice study / ', h('b', { text: 'Analytics' })]),
      tools ? h('div', { class: 'tools' }, tools) : null
    ])]);
  }

  function login(error) {
    app.textContent = '';
    app.appendChild(bar());
    if (!API.connected) {
      var missing = API.missing && API.missing.length ? API.missing.join(' and ') : 'storage';
      app.appendChild(h('div', { class: 'panel login' }, [
        h('h1', { text: 'Analytics' }),
        h('p', { class: 'muted', text: 'The study is not connected to its storage yet (missing: ' + missing + '), so nothing is being saved and there are no results to show. Until then the forms run as a labelled preview.' })
      ]));
      return;
    }
    // no researcher key is set: analytics opens only at the private address, behind Vercel's own sign-in
    if (API.researcher === 'private-address') {
      app.appendChild(h('div', { class: 'panel login' }, [
        h('h1', { text: 'Analytics' }),
        h('p', { class: 'muted', text: 'Analytics is not open at this public address. Open the study’s private address; Vercel asks you to sign in with the account that owns the project, and analytics opens with no password.' }),
        API.researcherUrl ? h('p', {}, [h('a', { href: API.researcherUrl, text: API.researcherUrl })]) : null,
        error && !/private address/i.test(error) ? h('p', { class: 'notice error', text: error }) : null
      ]));
      return;
    }
    if (API.researcher === 'signed-in') {
      app.appendChild(h('div', { class: 'panel login' }, [h('h1', { text: 'Analytics' }), h('p', { class: 'notice error', text: error || 'The results could not be loaded.' }),
        h('div', { class: 'nav' }, [h('button', { class: 'btn primary', type: 'button', text: 'Try again', onclick: function () { load(); } })])]));
      return;
    }
    var input = h('input', { type: 'password', id: 'key', autocomplete: 'current-password' });
    var form = h('form', { class: 'panel login' }, [
      h('h1', { text: 'Analytics' }),
      h('p', { class: 'muted', text: 'Enter the researcher key (RESEARCHER_KEY in Vercel). It is kept only for this browser tab.' }),
      h('label', { for: 'key', class: 'small', text: 'Researcher key' }), input,
      error ? h('p', { class: 'notice error', text: error }) : null,
      h('div', { class: 'nav' }, [h('button', { class: 'btn primary', type: 'submit', text: 'Open' })])
    ]);
    form.addEventListener('submit', function (e) { e.preventDefault(); if (!input.value.trim()) return; S.key = input.value.trim(); form.querySelector('button').disabled = true; load(); });
    app.appendChild(form);
    input.focus();
  }

  var TABS = [['ranking', 'Final ranking'], ['formA', 'Form A'], ['coding', 'Coding'], ['setup', 'Form B setup'], ['quality', 'Quality'], ['respondents', 'Respondents'], ['export', 'Export']];

  function render() {
    var res = S.res;
    app.textContent = '';
    var withTest = h('input', { type: 'checkbox', checked: S.includeTest, id: 'withtest' });
    withTest.addEventListener('change', function () { S.includeTest = withTest.checked; load(); });
    var stamp = new Date(res.generatedAt);
    app.appendChild(bar([
      h('span', { class: 'num', text: 'Updated ' + stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }),
      h('label', { class: 'row', for: 'withtest' }, [withTest, 'Include tests']),
      h('button', { class: 'btn small secondary', type: 'button', text: 'Refresh', onclick: function () { load(); } }),
      // signed in through Vercel there is no key to forget; Vercel's own sign-in covers the tab
      S.key ? h('button', { class: 'btn small secondary', type: 'button', text: 'Sign out', onclick: function () { session('researcherKey', null); S.key = null; login(); } }) : null
    ]));
    var canvas = h('div', { class: 'canvas' });
    app.appendChild(canvas);
    var tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(function (t) {
      return h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(S.tab === t[0]), text: t[1] + (t[0] === 'coding' && pendingCount() ? ' (unsaved)' : ''),
        onclick: function () { S.tab = t[0]; render(); } });
    }));
    canvas.appendChild(tabs);
    if (S.error) canvas.appendChild(h('div', { class: 'notice-panel', text: 'The last refresh failed (' + S.error + '). The figures below are from ' + stamp.toLocaleString() + '.' }));
    if (S.flash) { canvas.appendChild(h('div', { class: 'notice-panel', text: S.flash })); S.flash = null; }
    if (res.includesTest) {
      var nTestB = res.formB && res.formB.nTest ? res.formB.nTest : 0;
      canvas.appendChild(h('div', { class: 'notice-panel', text: 'Test responses are included (' + res.formA.nTest + ' in Form A, ' + nTestB + ' in Form B' +
        '). Use this view only to check that the forms reach the analysis. Switch it off before reading or reporting any result. Freezing always uses real responses only.' }));
    }
    var main = h('div', { id: 'dash' });
    canvas.appendChild(main);
    ({ ranking: renderRanking, formA: renderFormA, coding: renderCoding, setup: renderSetup, quality: renderQuality, respondents: renderRespondents, export: renderExport })[S.tab](main, res);
  }

  // ---------------------------------------------------------------- final ranking
  function renderRanking(main, res) {
    var fb = res.formB, A = res.formA;
    if (!fb.open) {
      main.appendChild(titleRow('Final ranking', 'Form B is not open yet. The final ranking comes from Form B; until the list is frozen, this shows the Form A salience order of the eligible parameters, which is not the ranking.', true));
      main.appendChild(panel('Form A salience order (provisional)', [salienceTable(A.salience.safety.codedRows, null, true)]));
      return;
    }
    var model = fb.rankingBasis === 'model', top = fb.ranking[0];
    var finding;
    if (!fb.nAnswered) finding = 'No Form B responses yet. The ranking appears with the first response and updates with every new one.';
    else if (model) finding = '“' + top.label + '” ranks first with ' + pct(top.weight) + ' of the weight (95% interval ' + pct(top.weightLo) + '–' + pct(top.weightHi) +
      (top.pTop !== undefined ? '; ranked first in ' + pct(top.pTop, 0) + ' of simulation draws' : '') + '), from ' + fb.nAnswered + ' respondents.' +
      (fb.nAnswered < PLANNED_B ? ' Provisional: ' + fb.nAnswered + ' of the ' + PLANNED_B + ' respondents planned.' : '');
    else finding = 'The model cannot be estimated yet (' + fb.model.status + '), so items are ordered by best-minus-worst score.';
    main.appendChild(titleRow('Final ranking', finding, !fb.nAnswered));
    main.appendChild(kpis([
      ['Respondents', String(fb.nAnswered), (fb.n - fb.nAnswered ? plural(fb.n - fb.nAnswered, 'respondent', 'respondents') + ' skipped every set; ' : '') + (fb.nTest ? plural(fb.nTest, 'test response', 'test responses') + ' ' + testWord() : PLANNED_B + ' planned'), null],
      ['Best-worst choices', String(fb.nChoices), plural(fb.nSkippedSets, 'set', 'sets') + ' skipped'],
      ['Parameters', String(fb.freeze.items.length), 'design version ' + fb.freeze.designVersion],
      ['Model fit', model ? num(fb.model.rho2, 3) : '–', model ? 'McFadden ρ², maxdiff model' : 'not estimable yet']
    ]));
    if (!fb.nAnswered) return;
    var rows = fb.ranking.map(function (r) {
      return model
        ? { rank: r.rank, label: r.label, value: 100 * r.weight, lo: r.weightLo === undefined ? null : 100 * r.weightLo, hi: r.weightHi === undefined ? null : 100 * r.weightHi,
            valueShort: pct(r.weight), valueText: pct(r.weight) + ' of the weight', rangeText: r.weightLo === undefined ? '' : '95% interval ' + pct(r.weightLo) + '–' + pct(r.weightHi) }
        : { rank: r.rank, label: r.label, value: r.std, lo: null, hi: null, valueShort: num(r.std), valueText: 'B−W score ' + num(r.std), rangeText: '' };
    });
    var domain = model ? [0, Math.max.apply(null, rows.map(function (r) { return r.hi !== null ? r.hi : r.value; })) * 1.06] : [-1, 1];
    var chart = window.Charts.dotInterval(rows, domain, model ? function (v) { return v.toFixed(0) + '%'; } : function (v) { return v.toFixed(1); });
    main.appendChild(panel(model ? 'Importance weights with 95% intervals' : 'Best-minus-worst scores (provisional)', [chart],
      model ? 'Weight = exp(u) / Σ exp(u) from the maxdiff model; weights sum to 100%. Dots are estimates; lines are 95% Krinsky–Robb intervals. Items whose intervals overlap should not be called different.'
            : 'Standardised best-minus-worst score, (B − W) / times shown, from −1 to 1.'));
    main.appendChild(panel('Ranking table', [table(['Rank', 'Parameter', { text: 'Weight', num: true }, { text: '95% interval', num: true }, { text: 'Rank range (95%)', num: true }, { text: 'Ranked first', num: true },
      { text: 'Utility (SE)', num: true }, { text: 'B−W score', num: true }, { text: 'Best / worst / shown', num: true }],
      fb.ranking.map(function (r) {
        return [String(r.rank), r.label, model ? pct(r.weight) : '–', model && r.weightLo !== undefined ? pct(r.weightLo) + '–' + pct(r.weightHi) : '–',
          model && r.rankLo !== undefined ? (r.rankLo === r.rankHi ? String(r.rankLo) : r.rankLo + '–' + r.rankHi) : '–', model && r.pTop !== undefined ? pct(r.pTop, 0) : '–',
          model ? num(r.utility) + ' (' + num(r.se) + ')' : '–', num(r.std), r.best + ' / ' + r.worst + ' / ' + r.shown];
      }))], 'Rank range: the 2.5th to 97.5th percentile of each item’s rank over 2,000 draws. Ranked first: the share of draws in which the item came first.'));
    var seq = fb.sequential, sens = fb.sensitivity;
    var checks = [
      ['Model-free count scores', fb.agreementCountsVsModel !== null && fb.agreementCountsVsModel !== undefined ? 'Spearman ρ = ' + num(fb.agreementCountsVsModel, 3) : '–', 'Standardised best-minus-worst scores need no model (Louviere, Flynn & Marley 2015).'],
      ['Sequential best-then-worst model', seq && seq.spearman !== null ? 'Spearman ρ = ' + num(seq.spearman, 3) : seq ? seq.status : '–', 'Best chosen first, then worst from the rest (Marley & Louviere 2005; Dyachenko, Reczek & Allenby 2014).'],
      ['Without flagged respondents', sens.nExcluded === 0 ? 'No one flagged' : sens.spearman !== undefined ? 'Spearman ρ = ' + num(sens.spearman, 3) + ' (' + sens.nKept + ' kept)' : 'Not estimable', 'Leaves out respondents who answered about twice as fast as the median (speed index above 2); see Quality.']
    ];
    main.appendChild(panel('Does the order hold?', [table(['Check against the main model', { text: 'Agreement of the orders', num: true }, 'What it tests'], checks)],
      'Each line re-estimates the order another way. Values near 1 mean the ranking does not depend on that choice of method or sample.'));
    main.appendChild(panel('Method', [h('ul', { class: 'textlist muted' }, [
      'Best-worst scaling, object case (Case 1). Utilities from the maxdiff model by maximum likelihood (Marley & Louviere 2005), centred at 0.',
      'Standard errors are cluster-robust by respondent. Intervals come from 2,000 Krinsky–Robb draws from that covariance, with a fixed seed, so the same data always give the same numbers.', // taste-skill-ignore: cluster-robust is the statistical term
      model ? 'Fit: log-likelihood ' + num(fb.model.ll, 1) + ' against ' + num(fb.model.ll0, 1) + ' for random choice; converged in ' + fb.model.iterations + ' iterations.' : null
    ].filter(Boolean).map(function (n) { return h('li', { text: n }); }))]));
  }

  /** Salience table of coded rows. The cut-off line falls after the Kth eligible (safety-scope) row. */
  function salienceTable(rows, k, eligibleOnly) {
    var shown = eligibleOnly ? rows.filter(function (r) { return r.scope !== 'other'; }).slice(0, 16) : rows;
    var cutAt = null, seen = 0;
    if (k) shown.forEach(function (r, i) { if (r.scope !== 'other') { seen++; if (seen === k) cutAt = i; } });
    var rank = 0;
    return table(['Rank', 'Parameter', { text: "Smith's S", num: true }, { text: "Sutrop's CSI", num: true }, { text: 'Listed by', num: true }, { text: 'Mean position', num: true }],
      shown.map(function (r) {
        var eligible = r.scope !== 'other';
        if (eligible) rank++;
        return [eligible ? String(rank) : '–', eligible ? r.label : h('span', {}, [r.label, ' ', h('span', { class: 'pill', text: 'not safety' })]),
          num(r.smithS, 3), num(r.sutropCSI, 3), r.freq + ' (' + pct(r.pct, 0) + ')', num(r.meanPos, 2)];
      }), { cutAfter: cutAt });
  }

  // ---------------------------------------------------------------- Form A
  function renderFormA(main, res) {
    var A = res.formA, pr = A.premise, sat = A.saturation.primary, cons = A.saturation.conservative, sal = A.salience.safety;
    var eligible = sal.codedRows.filter(function (r) { return r.scope !== 'other'; });
    main.appendChild(titleRow('Form A', A.n + ' respondents, ' + sal.N + ' safety lists. ' +
      (sat.reached ? 'Saturation reached at respondent ' + sat.point + ' (' + sat.label + ', Guest, Namey & Chen 2020).' : 'Saturation not reached yet.')));
    var y = function (p) { return p.yes ? pct(p.yes.p, 0) : '–'; };
    main.appendChild(kpis([
      ['Respondents', String(A.n), [A.nTest ? plural(A.nTest, 'test response', 'test responses') + ' ' + testWord() : null,
        A.nRepeat ? plural(A.nRepeat, 'repeat', 'repeats') + ' from the same email left out' : null].filter(Boolean).join('; ') || null],
      ['Changed road, non-distance reason', y(pr.changedRoadAnyReason), pr.changedRoadAnyReason.yes ? '95% CI ' + pct(pr.changedRoadAnyReason.yes.lo, 0) + '–' + pct(pr.changedRoadAnyReason.yes.hi, 0) + ', n = ' + pr.changedRoadAnyReason.n : 'A2.1'],
      ['Changed road because of safety', y(pr.changedRoadSafety), pr.changedRoadSafety.yes ? '95% CI ' + pct(pr.changedRoadSafety.yes.lo, 0) + '–' + pct(pr.changedRoadSafety.yes.hi, 0) + ', n = ' + pr.changedRoadSafety.n : 'A3.1'],
      ['Unprimed lists naming safety', pr.unprimedMentionsSafety.ci ? pct(pr.unprimedMentionsSafety.ci.p, 0) : '–', 'before safety was mentioned, n = ' + pr.unprimedMentionsSafety.n]
    ]));
    var cov = A.coding.coverage.safety;
    var codedNote = cov.coded < cov.entries ? (cov.entries - cov.coded) + ' of ' + cov.entries + ' distinct entries are not coded yet, so this is provisional.' : 'All ' + cov.entries + ' distinct entries are coded.';
    var kids = [];
    if (eligible.length) kids.push(window.Charts.salienceCurve(eligible, sal.elbow ? sal.elbow.index : null, S.k));
    kids.push(salienceTable(sal.codedRows, S.k, false));
    main.appendChild(panel('Salience of safety parameters (A3.4)', kids,
      "Smith's S = mean over the " + sal.N + ' non-empty lists of (L − R + 1) / L. ' + codedNote + (sal.elbow ? ' Elbow of the curve (Kneedle) at rank ' + sal.elbow.rank + '.' : '') +
      ' The rule under row ' + S.k + ' marks the Form B cut-off. Codes marked “not safety” are listed but not ranked.'));

    var satKids = [];
    if (sat.cumulative.length) satKids.push(window.Charts.saturationCurve(sat.cumulative, sat));
    satKids.push(table(['Criterion', 'Result'], [
      ['Base 4 respondents, run of 2, new codes ≤ 5% of the base', sat.baseCodes === null ? 'Needs at least 6 lists' : sat.reached ? 'Reached at ' + sat.point + ', confirmed by ' + sat.confirmedBy + ' (' + sat.label + ')' : 'Not yet (' + sat.n + ' lists)'],
      ['Stricter: run of 3, no new codes', cons.baseCodes === null ? 'Needs at least 7 lists' : cons.reached ? 'Reached at ' + cons.point + ', confirmed by ' + cons.confirmedBy + ' (' + cons.label + ')' : 'Not yet'],
      ['Codes in the base (denominator)', sat.baseCodes === null ? '–' : String(sat.baseCodes)]
    ]));
    main.appendChild(panel('Saturation of the safety list', satKids,
      'Guest, Namey & Chen (2020): new codes in a run of respondents, divided by the codes found in the first 4. The run moves forward one respondent at a time. Only coded entries count.'));

    main.appendChild(panel('Hypothesis checks', [table(['Check', 'Result', { text: 'n', num: true }], [
      ['Chose a different road for a reason other than time or distance (A2.1, yes)', ci(pr.changedRoadAnyReason.yes), String(pr.changedRoadAnyReason.n)],
      ['How safe a road felt made her choose a different road (A3.1, yes)', ci(pr.changedRoadSafety.yes), String(pr.changedRoadSafety.n)],
      ['The unprimed list (A2.2) already names a safety parameter' + (pr.unprimedMentionsSafety.fullyCoded ? '' : ' (provisional: unprimed list not fully coded)'), ci(pr.unprimedMentionsSafety.ci), String(pr.unprimedMentionsSafety.n)],
      ['Ticked “Nothing about a road changes my choice” (A2.2)', String(pr.saidNothingUnprimed), ''],
      ['Ticked “Nothing about a road changes how safe it feels” (A3.4)', String(pr.saidNothingSafety), '']
    ])], 'Wilson score intervals. A2.1 and A3.1 ask the same question, with any reason and with safety as the reason. A “safety parameter” is a code marked Safety in the codebook; the third row counts unprimed lists with at least one coded entry.'));

    var un = A.salience.unprimed;
    main.appendChild(panel('Salience in the unprimed list (A2.2)', [salienceTable(un.codedRows, null, false)], un.N + ' non-empty lists. For comparison only; Form B items come from A3.4.'));
    main.appendChild(h('div', { class: 'grid2 stack' }, [
      panel('Time of the most recent safety change (A3.3)', [tallyTable(A.timeSafety, 'timeOfDay')], 'Asked only after a yes to A3.1.'),
      panel('Most recent time, in her words (A3.2)', [details('Read the ' + A.texts.storySafety.length + ' answers', [textList(A.texts.storySafety)])],
        'Read these against the codebook: a road feature that appears here but in no list is a missing parameter to report. Short quotations can illustrate the parameters, without anything that identifies the woman.')
    ]));
    main.appendChild(panel('Sample profile (A4)', profile(A.sample)));
  }
  function profile(sample) {
    return [h('div', { class: 'grid2' }, [
      h('div', {}, [h('h3', { text: 'Age' }), tallyTable(sample.age, 'age'), h('h3', { text: 'Alone or with others' }), tallyTable(sample.company, 'company')]),
      h('div', {}, [h('h3', { text: 'How they travel' }), tallyTable(sample.modes, 'modes', true), h('h3', { text: 'Area' }), tallyTable(sample.area, 'area')])
    ])];
  }

  // ---------------------------------------------------------------- coding
  function allCodes() {
    var byId = {};
    (S.res.codes || []).forEach(function (c) { if (!S.deleted[c.id]) byId[c.id] = c; });
    Object.keys(S.codeEdits).forEach(function (id) { byId[id] = S.codeEdits[id]; });
    return Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) { return a.label.localeCompare(b.label); });
  }
  function newId() { return 'c_' + Math.random().toString(36).slice(2, 10); }

  function renderCoding(main, res) {
    var A = res.formA, cov = A.coding.coverage, alpha = A.coding.alpha;
    main.appendChild(titleRow('Coding', cov.safety.coded + ' of ' + cov.safety.entries + ' distinct safety-list entries coded. Every one must be coded before freezing.'));
    main.appendChild(kpis([
      ['Safety list (A3.4) coded', String(cov.safety.coded), 'of ' + cov.safety.entries + ' distinct entries'],
      ['Unprimed list (A2.2) coded', String(cov.unprimed.coded), 'of ' + cov.unprimed.entries + '; needed for the hypothesis check'],
      ['Entries split into several codes', String(cov.split), 'e.g. “dark and empty”'],
      ["Krippendorff's α", alpha.alpha === null ? '–' : num(alpha.alpha, 3), alpha.units + ' entries coded by both coders; ≥ 0.80 reliable, 0.667–0.80 tentative']
    ]));

    var codes = allCodes();
    var codeRows = codes.map(function (c) {
      var label = h('input', { type: 'text', class: 'inline', value: c.label, maxlength: 80, 'aria-label': 'Label', style: 'width:100%' });
      var desc = h('input', { type: 'text', class: 'inline', value: c.description || '', maxlength: 200, 'aria-label': 'Description', style: 'width:100%' });
      var scope = h('select', { class: 'inline', 'aria-label': 'Scope' }, [h('option', { value: 'safety', text: 'Safety' }), h('option', { value: 'other', text: 'Not safety' })]);
      scope.value = c.scope || 'safety';
      function edit() { S.codeEdits[c.id] = { id: c.id, label: label.value.trim() || c.label, description: desc.value.trim(), scope: scope.value }; refreshSaveBar(); }
      label.addEventListener('change', edit); desc.addEventListener('change', edit); scope.addEventListener('change', edit);
      var del = h('button', { class: 'btn small secondary', type: 'button', text: 'Delete', onclick: function () {
        if (!window.confirm('Delete the code "' + c.label + '"? Entries coded only with it become uncoded.')) return;
        if (S.codeEdits[c.id]) delete S.codeEdits[c.id];
        if ((S.res.codes || []).some(function (x) { return x.id === c.id; })) S.deleted[c.id] = true;
        render();
      } });
      return [label, desc, scope, del];
    });
    var newLabel = h('input', { type: 'text', class: 'inline', placeholder: 'How well lit the road is', maxlength: 80, 'aria-label': 'New label', style: 'width:100%' });
    var newDesc = h('input', { type: 'text', class: 'inline', placeholder: 'Street lights or other light on the road', maxlength: 200, 'aria-label': 'New description', style: 'width:100%' });
    var newScope = h('select', { class: 'inline', 'aria-label': 'New scope' }, [h('option', { value: 'safety', text: 'Safety' }), h('option', { value: 'other', text: 'Not safety' })]);
    codeRows.push([newLabel, newDesc, newScope, h('button', { class: 'btn small primary', type: 'button', text: 'Add', onclick: function () {
      if (!newLabel.value.trim()) return;
      var id = newId();
      S.codeEdits[id] = { id: id, label: newLabel.value.trim(), description: newDesc.value.trim(), scope: newScope.value };
      render();
    } })]);
    main.appendChild(panel('Codebook', [table(['Label (shown in Form B)', 'One-line description (shown in Form B)', 'Scope', ''], codeRows)],
      'Codes are built from the women’s own words (inductive coding). Write each label as a neutral dimension of the road, for example “How well lit the road is”, not “Poor lighting”. Before freezing, labels are refused if they use words that presuppose a threat (fear, danger, unsafe…) or repeat the question’s criterion (safe, safety).'));

    var coder = h('select', { class: 'inline', 'aria-label': 'Coder' }, [h('option', { value: '1', text: 'Coder 1 (all entries)' }), h('option', { value: '2', text: 'Coder 2 (blind 30% sample)' })]);
    coder.value = String(S.coder);
    coder.addEventListener('change', function () { S.coder = Number(coder.value); render(); });
    var filter = h('select', { class: 'inline', 'aria-label': 'Filter' }, [h('option', { value: 'uncoded', text: 'Not coded yet' }), h('option', { value: 'all', text: 'All entries' })]);
    filter.value = S.filter;
    filter.addEventListener('change', function () { S.filter = filter.value; render(); });
    var list = h('select', { class: 'inline', 'aria-label': 'List' }, [h('option', { value: 'all', text: 'Both lists' }), h('option', { value: 'safety', text: 'Safety list (A3.4)' }), h('option', { value: 'unprimed', text: 'Unprimed list (A2.2)' })]);
    list.value = S.list;
    list.addEventListener('change', function () { S.list = list.value; render(); });
    var search = h('input', { type: 'text', class: 'inline grow', placeholder: 'Search entries', value: S.search, 'aria-label': 'Search entries' });
    search.addEventListener('change', function () { S.search = search.value; render(); });

    var cField = S.coder === 2 ? 'code2' : 'code1';
    function current(e) { return e.key in S.pending[S.coder] ? S.pending[S.coder][e.key] : asList(e[cField]); }
    var entries = A.coding.entries.filter(function (e) {
      if (S.coder === 2 && !e.coder2Sample) return false;
      if (S.list === 'safety' && !e.safety) return false;
      if (S.list === 'unprimed' && !e.unprimed) return false;
      if (S.filter === 'uncoded' && current(e)) return false;
      var q = S.search.toLowerCase();
      if (q && e.key.indexOf(q) < 0 && e.example.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var shown = entries.slice(0, 300);
    var rows = shown.map(function (e) {
      var cell = h('div', { class: 'codes-cell' });
      function setValue(v) {
        var orig = asList(e[cField]);
        if (same(v, orig)) delete S.pending[S.coder][e.key]; else S.pending[S.coder][e.key] = v;
        refreshSaveBar();
      }
      function paintCell() {
        cell.textContent = '';
        var v = current(e), parts = v === EXCLUDE ? [EXCLUDE] : v || [null];
        parts.forEach(function (val, i) {
          var sel = h('select', { class: 'code', 'aria-label': (i ? 'Further code ' : 'Code ') + 'for ' + e.example });
          sel.appendChild(h('option', { value: '', text: i ? 'Remove this code' : 'Not coded' }));
          codes.forEach(function (c) { if (i === 0 || parts.indexOf(c.id) < 0 || parts[i] === c.id) sel.appendChild(h('option', { value: c.id, text: c.label })); });
          if (i === 0) sel.appendChild(h('option', { value: EXCLUDE, text: 'Not about a road (exclude)' }));
          sel.value = val || '';
          sel.addEventListener('change', function () {
            var cur = current(e), arr = cur === EXCLUDE || !cur ? [] : cur.slice();
            if (i === 0 && (sel.value === EXCLUDE || sel.value === '')) { setValue(sel.value === EXCLUDE ? EXCLUDE : null); paintCell(); return; }
            if (sel.value === '') arr.splice(i, 1); else arr[i] = sel.value;
            arr = arr.filter(function (x, j) { return x && arr.indexOf(x) === j; });
            setValue(arr.length ? arr : null);
            paintCell();
          });
          cell.appendChild(sel);
        });
        if (Array.isArray(v) && v.length < MAX_CODES) {
          cell.appendChild(h('button', { class: 'btn small secondary', type: 'button', text: 'Split', title: 'This entry names more than one thing: add a further code, in the order written', onclick: function () {
            var cur = current(e), first = codes.filter(function (c) { return cur.indexOf(c.id) < 0; })[0];
            if (!first) return;
            setValue(cur.concat([first.id])); paintCell();
          } }));
        }
      }
      paintCell();
      return [e.example, String(e.safety), String(e.unprimed), cell];
    });
    main.appendChild(panel('Entries', [
      h('div', { class: 'row', style: 'margin-bottom:12px' }, [coder, filter, list, search]),
      S.coder === 2 ? h('p', { class: 'muted small', text: 'Coder 2 sees a fixed 30% sample of entries and not Coder 1’s codes. Use the same codebook. Agreement is Krippendorff’s α; a split entry agrees only if both coders give it the same set of codes.' }) : null,
      table(['Entry, as first written', { text: 'Safety list', num: true }, { text: 'Unprimed list', num: true }, 'Code'], rows),
      entries.length > shown.length ? h('p', { class: 'muted small', text: 'Showing 300 of ' + entries.length + '. Save, then the next ones appear.' }) : null,
      shown.length === 0 ? h('p', { class: 'muted', text: 'Nothing to code with these filters.' }) : null
    ], 'Identical answers (same words, ignoring case and punctuation) are grouped and coded once. Counts are respondents. If an entry names two or three things (“dark and empty”), press Split and code each, in the order written; each becomes its own item at the next list positions.'));
    main.appendChild(saveBar());
  }

  var saveBarEl = null;
  function saveBar() {
    saveBarEl = h('div', { class: 'panel savebar' });
    refreshSaveBar();
    return saveBarEl;
  }
  function refreshSaveBar() {
    if (!saveBarEl) return;
    var n = pendingCount();
    saveBarEl.textContent = '';
    saveBarEl.appendChild(h('span', { class: n ? '' : 'muted', text: n ? n + ' unsaved change' + (n > 1 ? 's' : '') : 'No unsaved changes' }));
    saveBarEl.appendChild(h('div', { class: 'row' }, [
      n ? h('button', { class: 'btn small secondary', type: 'button', text: 'Discard', onclick: function () { S.pending = { 1: {}, 2: {} }; S.codeEdits = {}; S.deleted = {}; render(); } }) : null,
      h('button', { class: 'btn small primary', type: 'button', text: 'Save', disabled: !n, onclick: saveCoding })
    ]));
  }
  function saveCoding() {
    var assignments = [];
    [1, 2].forEach(function (c) {
      Object.keys(S.pending[c]).forEach(function (k) {
        var v = S.pending[c][k];
        assignments.push({ key: k, coder: c, code: Array.isArray(v) && v.length === 1 ? v[0] : v });
      });
    });
    var codes = Object.keys(S.codeEdits).map(function (id) { return S.codeEdits[id]; });
    act({ action: 'saveCodes', codes: codes, deleteCodes: Object.keys(S.deleted), assignments: assignments }, 'Coding saved.').then(function () {
      S.pending = { 1: {}, 2: {} }; S.codeEdits = {}; S.deleted = {};
      load();
    }).catch(function () {});
  }

  // ---------------------------------------------------------------- Form B setup
  function renderSetup(main, res) {
    var cfg = res.config, f = cfg.freeze, A = res.formA;
    main.appendChild(titleRow('Form B setup', f ? 'Form B is open with ' + f.items.length + ' parameters (design version ' + f.designVersion + '), frozen ' + new Date(f.frozenAt).toLocaleDateString() + '.'
      : 'Not frozen yet. Freezing fixes the Form B wording and opens Form B.'));
    var toggle = h('button', { class: 'btn small secondary', type: 'button', text: cfg.formAOpen ? 'Close Form A' : 'Reopen Form A', onclick: function () {
      act({ action: 'setFormA', open: !cfg.formAOpen }, cfg.formAOpen ? 'Form A closed.' : 'Form A reopened.').then(function () { load(); }).catch(function () {});
    } });
    main.appendChild(panel('Form A', [h('div', { class: 'row', style: 'justify-content:space-between' }, [h('span', { text: cfg.formAOpen ? 'Form A is open and accepting responses.' : 'Form A is closed.' }), toggle])]));

    if (f) {
      var ds = f.designStats;
      main.appendChild(panel('The frozen list', [
        table(['#', 'Label', 'Description', { text: "Smith's S", num: true }, { text: 'Listed by', num: true }], f.items.map(function (it, i) { return [String(i + 1), it.label, it.description, num(it.smithS, 3), String(it.freq)]; })),
        h('p', { class: 'small muted', style: 'margin-top:12px', text: 'Design: ' + f.sets.length + ' sets of 4, cyclic incomplete block design from initial block {' + f.initialBlock.join(', ') + '}. Each item appears ' + ds.appearancesPerItem[0] + ' times; ' + ds.pairsCovered + ' of ' + ds.pairsTotal + ' item pairs appear together, each ' + (ds.pairCountMin === ds.pairCountMax ? ds.pairCountMin + ' time(s)' : ds.pairCountMin + '–' + ds.pairCountMax + ' times') + '. Set order and item order are randomised for every respondent.' })
      ], 'Frozen from ' + f.nFormA + ' Form A respondents. Rule: ' + f.rule + (f.saturation ? ' Saturation at freezing: ' + f.saturation + '.' : ' Saturation was not reached at freezing.') + (f.tieAtCutoff ? ' The next parameter had the same Smith’s S as the last one kept (a tie at the cut-off); report it.' : '')));
      var confirmInput = h('input', { type: 'text', class: 'inline', placeholder: 'Type UNFREEZE', 'aria-label': 'Type UNFREEZE to confirm' });
      main.appendChild(panel('Change the list', [
        h('p', { class: 'small', text: 'Unfreezing closes Form B. Responses already collected stay stored under version ' + f.designVersion + ' but are left out of the next version’s ranking, because their respondents saw different items.' }),
        h('div', { class: 'row' }, [confirmInput, h('button', { class: 'btn small danger', type: 'button', text: 'Unfreeze', onclick: function () {
          act({ action: 'unfreeze', confirm: confirmInput.value.trim() }, 'Form B closed. You can freeze a new list.').then(function () { load(); }).catch(function () {});
        } })])
      ]));
      return;
    }

    var kInput = h('input', { type: 'number', class: 'inline', min: K_MIN, max: K_MAX, step: 1, value: S.k, style: 'width:90px', id: 'kval' });
    kInput.addEventListener('change', function () { var v = Math.round(Number(kInput.value)); if (v >= K_MIN && v <= K_MAX) { S.k = v; render(); } });
    var cands = A.candidates, k = S.k, top = cands.slice(0, k), cov = A.coding.coverage.safety;
    var blockers = [], warnings = [];
    if (cov.entries === 0) blockers.push('There are no Form A safety-list entries yet.');
    else if (cov.coded < cov.entries) blockers.push((cov.entries - cov.coded) + ' safety-list entries are not coded yet (Coding tab).');
    if (cands.length < k) blockers.push('Only ' + cands.length + ' eligible parameters; lower K or keep collecting Form A.');
    top.forEach(function (c) {
      if (!c.description) blockers.push('“' + c.label + '” needs a one-line description.');
      if (c.wordingThreat.length) blockers.push('“' + c.label + '” uses ' + c.wordingThreat.join(', ') + ', which presupposes a threat.');
      if (c.wordingCriterion.length) blockers.push('“' + c.label + '” repeats the question’s criterion (' + c.wordingCriterion.join(', ') + '); name the road feature instead.');
      if (c.freq < MIN_MENTIONS) blockers.push('“' + c.label + '” was listed by only ' + c.freq + ' respondent (single mentions are idiosyncratic, Sutrop 2001).');
    });
    if (pendingCount()) blockers.push('Save or discard the unsaved coding changes first.');
    if (res.includesTest) blockers.push('Switch off “Include tests” first. The list is frozen from real responses only, so the list above may not be the one that would be frozen.');
    if (!A.saturation.primary.reached) warnings.push('Saturation is not reached yet (Guest, Namey & Chen 2020). Freezing now risks missing parameters.');
    if (cands.length > k && Math.abs(cands[k].smithS - cands[k - 1].smithS) < 1e-12) warnings.push('Parameters ' + k + ' and ' + (k + 1) + ' have the same Smith’s S. The tie is broken by frequency, then mean position; report it.');
    var el = A.salience.safety.elbow;
    if (el && el.rank !== k) warnings.push('The elbow of the salience curve is at rank ' + el.rank + '; you are keeping ' + k + '. K was fixed in advance for a balanced design; report both.');
    if (A.texts.unclear.length) warnings.push(A.texts.unclear.length + ' Form A respondents said a question was unclear (Quality tab). Read them before freezing.');

    var listT = table(['Rank', 'Label (as respondents will see it)', 'Description', { text: "Smith's S", num: true }, { text: 'Listed by', num: true }, 'Wording'],
      cands.slice(0, Math.min(cands.length, k + 4)).map(function (c) {
        var bad = c.wordingProblems.length;
        return [String(c.rank), c.label, c.description || 'Missing', num(c.smithS, 3), String(c.freq),
          bad ? h('span', { class: 'pill warn', text: c.wordingProblems.join(', ') }) : h('span', { class: 'pill ok', text: 'ok' })];
      }), { cutAfter: k - 1 });
    main.appendChild(panel('Freeze the Form B list', [
      h('div', { class: 'row', style: 'margin-bottom:12px' }, [h('label', { class: 'small', for: 'kval', text: 'Number of parameters K (' + K_MIN + '–' + K_MAX + ')' }), kInput]),
      listT,
      blockers.length ? h('div', { style: 'margin-top:16px' }, [h('h3', { text: 'Before you can freeze' }), checkList(blockers, true)]) : null,
      warnings.length ? h('div', { style: 'margin-top:16px' }, [h('h3', { text: 'Check and report' }), checkList(warnings)]) : null,
      h('div', { class: 'nav' }, [h('button', { class: 'btn primary', type: 'button', text: 'Freeze top ' + k + ' and open Form B', disabled: blockers.length > 0, onclick: function () {
        if (!window.confirm('Freeze these ' + k + ' parameters and open Form B? The wording respondents see cannot be changed without starting a new version.')) return;
        act({ action: 'freeze', k: k }, 'Form B is open.').then(function () { load(); }).catch(function () {});
      } })])
    ], 'Rule: the top K parameters by Smith’s salience on the safety list (A3.4), leaving out codes marked “not safety” and codes listed by only one respondent. K = 12 gives 12 sets of 4 in which every item appears 4 times. Edit wording in the Coding tab. The rule under row ' + k + ' is the cut-off.'));
  }

  // ---------------------------------------------------------------- quality
  function renderQuality(main, res) {
    var A = res.formA, fb = res.formB, s = fb.open ? fb.sensitivity : null;
    var finding = fb.open && fb.n ? s.nExcluded + ' of ' + fb.n + ' Form B respondents are flagged' + (s.nExcluded ? '; leaving them out ' + (s.spearman !== undefined ? 'gives Spearman ρ = ' + num(s.spearman, 3) + ' with the main ranking.' : 'leaves too few to estimate.') : '.') + ' Flagged respondents stay in the main ranking.'
      : 'Form B is not open yet, so only the Form A checks are shown.';
    main.appendChild(titleRow('Quality', finding, !(fb.open && fb.n)));
    main.appendChild(panel('Form A', [table(['Check', { text: 'Result', num: true }], [
      ['Test responses (' + testWord() + ')', String(A.nTest)],
      ['Repeat responses from the same email (left out; her first response is kept)', String(A.nRepeat)],
      ['Relative speed index above 2, about twice the median pace (Leiner 2019)', String(A.speedFlagged)]
    ])], 'A woman’s first response is the one given before she had seen the safety questions, so a later one cannot count as unprimed. Speed index: per page, the sample median time ÷ the respondent’s time, each capped at 3, then averaged over the pages she saw. Reported only; Form A answers are free lists, so speed is not used to drop anyone.'));
    if (fb.open) {
      main.appendChild(panel('Form B', [table(['Check', { text: 'Result', num: true }], [
        ['Test responses (' + testWord() + ')', String(fb.nTest)],
        ['Responses from earlier design versions (left out)', String(fb.nOtherVersions)],
        ['Repeat responses from the same email (left out; her first response is kept)', String(fb.nRepeat)],
        ['Same email as a Form A respondent (left out: Form B needs different women)', String(fb.nFormA)],
        ['Respondents who skipped every set', String(fb.n - fb.nAnswered)],
        ['Sets skipped', String(fb.nSkippedSets)],
        ['Flagged: relative speed index above 2 (Leiner 2019)', String(s.byFlag.speed)],
        ['Ranking without flagged respondents', s.nExcluded === 0 ? 'No one flagged' : s.spearman !== undefined ? 'Spearman ρ = ' + num(s.spearman, 3) + ' (' + s.nKept + ' kept)' : 'Not estimable (' + (s.status || 'model not estimated') + ')']
      ])], 'Earlier participation is found by matching emails, so it no longer depends on what a respondent remembers or on which phone she used. Flagged respondents stay in the main ranking; the last line shows whether leaving them out would change the order.'));
      var pt = fb.positionTest, totalB = fb.positions.reduce(function (m, p) { return m + p.best; }, 0);
      main.appendChild(panel('Choices by screen position', [table(['Position in the set', { text: 'Chosen most', num: true }, { text: 'Chosen least', num: true }, { text: 'Expected if position has no effect', num: true }],
        fb.positions.map(function (p) { return ['Row ' + p.position, String(p.best), String(p.worst), num(totalB / 4, 1)]; }).concat([
          ['Chi-square test of equal spread (3 df)', pt.best ? 'χ² = ' + num(pt.best.stat, 2) + ', ' + pval(pt.best.p) : '–', pt.worst ? 'χ² = ' + num(pt.worst.stat, 2) + ', ' + pval(pt.worst.p) : '–', '']
        ]))],
        'Item order is randomised for every respondent, so each position should be chosen about equally often; a clear imbalance suggests choosing by position. The test treats choices as independent, which they are not within a respondent, so read a small p-value as a prompt to look, not as proof.'));
    }
    main.appendChild(panel('Respondent debriefing', [
      details('A5.1 Unclear questions in Form A (' + A.texts.unclear.length + ')', [textList(A.texts.unclear)]),
      fb.open ? details('B5.1 Unclear items in Form B (' + fb.texts.unclearItems.length + ')', [textList(fb.texts.unclearItems)]) : null,
      fb.open ? details('B5.2 Missing items (' + fb.texts.missingItems.length + ')', [textList(fb.texts.missingItems)]) : null
    ], 'Respondent debriefing questions replace a separate pre-test (Presser et al. 2004). Read them before freezing and before reporting.'));
  }

  // ---------------------------------------------------------------- respondents
  var STATUS = {
    kept: 'In the analysis',
    test: 'Test, left out',
    repeat: 'Repeat of an earlier response from this email, left out',
    formA: 'Also answered Form A, left out (Form B needs different women)',
    otherVersion: 'Earlier Form B version, left out',
    closed: 'Form B is closed, so not in a ranking'
  };
  function statusText(r) {
    var t = r.status === 'kept' && r.test ? 'Test, included for checking' : STATUS[r.status] || r.status;
    return t + (r.flags && r.flags.indexOf('speed') >= 0 ? '; flagged: fast (speed index above 2)' : '');
  }
  /** Field id -> "code wording" for one form, from the questions file (both forms share field ids, not codes). */
  function fieldNames(form) {
    var names = {};
    (form === 'A' ? QS.formA.pages : [QS.formB.consent, QS.formB.eligibility, QS.formB.travel, QS.formB.debrief]).forEach(function (p) {
      p.questions.forEach(function (q) {
        if (!q.id) return;
        names[q.id] = (q.code ? q.code + ' ' : '') + q.prompt.replace(/\*\*/g, '');
        if (q.nothingId) names[q.nothingId] = (q.code ? q.code + ' ' : '') + q.nothingLabel;
        (q.options || []).forEach(function (o) { if (o.other) names[o.other] = (q.code ? q.code + ' ' : '') + o.label + ': described'; });
      });
    });
    return names;
  }
  function labelOf(field, v) {
    var group = { gender: 'gender', age: 'age', roads: 'roads', modes: 'modes', company: 'company', area: 'area', changedAny: 'yesNoUnsure', changedSafety: 'yesNoUnsure', timeSafety: 'timeOfDay' }[field];
    var opts = group ? O[group] : null;
    function one(x) { var o = opts && opts.filter(function (y) { return y.v === x; })[0]; return o ? o.label : String(x); }
    if (Array.isArray(v)) return field === 'listAny' || field === 'listSafety' ? v.map(function (x, i) { return (i + 1) + '. ' + x; }).join('   ') : v.map(one).join('; ');
    if (v === true) return 'Yes';
    return one(v);
  }
  /** One person's answers, in question order; Form B adds her choice in each set. */
  function answerLines(rec, versions) {
    var names = fieldNames(rec.form), lines = [];
    Object.keys(names).forEach(function (f) {
      var v = rec.answers[f];
      if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length) || f === 'consent') return;
      lines.push(names[f] + ': ' + labelOf(f, v));
    });
    if (rec.form === 'B') {
      var items = versions[rec.designVersion] ? versions[rec.designVersion].items : null;
      var lab = function (i) { return items && items[i] ? items[i].label : 'item ' + (i + 1); };
      rec.bws.forEach(function (s) {
        lines.push('Set ' + (s.order + 1) + ': ' + (s.best === null ? 'skipped' : 'most “' + lab(s.best) + '”, least “' + lab(s.worst) + '”'));
      });
    }
    return lines;
  }

  function renderRespondents(main, res) {
    var all = res.respondents || [];
    var nA = all.filter(function (r) { return r.form === 'A'; }).length, nB = all.length - nA;
    main.appendChild(titleRow('Respondents', nA + ' Form A and ' + nB + ' Form B responses stored, by email. Emails and names are confidential: they stay on this page and in respondents_by_email.csv, and never go into a report or a shared file.'));
    var search = h('input', { type: 'text', class: 'inline grow', placeholder: 'Find an email or name', value: S.who, 'aria-label': 'Find an email or name' });
    search.addEventListener('change', function () { S.who = search.value; render(); });
    var q = S.who.trim().toLowerCase();
    var shown = all.filter(function (r) { return !q || r.email.indexOf(q) >= 0 || r.name.toLowerCase().indexOf(q) >= 0; });
    var loadBtn = h('button', { class: 'btn small secondary', type: 'button', text: S.raw ? 'Reload answers' : 'Show every answer', onclick: function () {
      act({ action: 'exportData' }).then(function (d) {
        var versions = {}, byId = {};
        (d.config.history || []).forEach(function (v) { versions[v.designVersion] = v; });
        d.formA.concat(d.formB).forEach(function (r) { byId[r.form + '|' + r.id] = r; });
        S.raw = { byId: byId, versions: versions, at: new Date() };
        render();
      }).catch(function () {});
    } });
    var rows = shown.map(function (r) {
      var rec = S.raw && S.raw.byId[r.form + '|' + r.id];
      var answers = rec ? details('Answers', [h('ul', { class: 'textlist' }, answerLines(rec, S.raw.versions).map(function (t) { return h('li', { text: t }); }))])
        : h('span', { class: 'muted small', text: S.raw ? 'Press Reload answers' : '–' });
      return ['Form ' + r.form, new Date(r.receivedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), r.email || '(none)', r.name || '–', statusText(r), answers];
    });
    main.appendChild(panel('Every response', [
      h('div', { class: 'row', style: 'margin-bottom:12px' }, [search, loadBtn]),
      S.raw ? h('p', { class: 'muted small', text: 'Answers as loaded at ' + S.raw.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.' }) : null,
      shown.length ? table(['Form', 'Received', 'Email', 'Name', 'In the analysis?', 'Answers'], rows) : h('p', { class: 'muted', text: all.length ? 'No response matches.' : 'No responses yet.' })
    ], 'Oldest first. Each woman counts once in each form: a later response from the same email is kept in the data but left out of the analysis.'));

    // withdrawal on request, as the consent page promises
    var wEmail = h('input', { type: 'email', class: 'inline grow', placeholder: 'Her email address', 'aria-label': 'Email address to remove', autocomplete: 'off' });
    var wAgain = h('input', { type: 'email', class: 'inline grow', placeholder: 'The same address again', 'aria-label': 'Type the email address again to confirm', autocomplete: 'off' });
    main.appendChild(panel('Remove someone’s answers', [
      h('div', { class: 'row' }, [wEmail, wAgain, h('button', { class: 'btn small danger', type: 'button', text: 'Remove', onclick: function () {
        var e = wEmail.value.trim().toLowerCase();
        if (!e) return;
        var n = all.filter(function (r) { return r.email === e; }).length;
        if (!window.confirm('Delete ' + plural(n, 'response', 'responses') + ' from ' + e + ' from the data? This cannot be undone.')) return;
        act({ action: 'withdraw', email: e, confirm: wAgain.value.trim().toLowerCase() }).then(function (r) {
          S.flash = plural(r.removed, 'response', 'responses') + ' from ' + e + ' deleted.';
          S.raw = null; load();
        }).catch(function () {});
      } })])
    ], 'For a withdrawal request. Every response from that email, in both forms, is deleted from the data repository and leaves the analysis at once. Git keeps a copy in the repository’s history until the repository is deleted at the end of the study (see README). If Form B was already frozen from her Form A list, say so in the report.'));
  }

  // ---------------------------------------------------------------- export
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = Array.isArray(v) ? v.join('; ') : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                 // stop spreadsheets running a cell as a formula
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(headers, rows) { return '﻿' + [headers].concat(rows).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'; }
  function download(name, content, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function duration(r) { var t = 0; Object.keys(r.pageTimes || {}).forEach(function (k) { t += r.pageTimes[k]; }); return Math.round(t / 1000); }
  var TRAVEL = ['modes', 'modesOther', 'company', 'area', 'city'];
  var IDENTITY = { email: true, name: true };
  function pad(arr, n) { var a = (arr || []).slice(0, n); while (a.length < n) a.push(''); return a; }
  function boxes(prefix) { return pad([], 10).map(function (_, i) { return prefix + '_' + (i + 1); }); }

  /** One row per field: form, question code, field, wording and allowed values, built from questions.js. */
  function dataDictionary() {
    var rows = [];
    function add(form, pages) {
      pages.forEach(function (p) {
        p.questions.forEach(function (q) {
          if (!q.id) return;
          var vals = IDENTITY[q.id] ? 'kept apart, in respondents_by_email.csv only' : (q.options || []).map(function (o) { return o.v + ' = ' + o.label; }).join('; ');
          rows.push([form, q.code || '', q.id, q.type, p.id, q.prompt.replace(/\*\*/g, ''), vals]);
          if (q.nothingId) rows.push([form, q.code || '', q.nothingId, 'checkbox', p.id, q.nothingLabel, 'true / false']);
          (q.options || []).forEach(function (o) { if (o.other) rows.push([form, q.code || '', o.other, 'text', p.id, o.label + ': description', '']); });
        });
      });
    }
    add('A', QS.formA.pages);
    add('B', [QS.formB.consent, QS.formB.eligibility, QS.formB.travel, QS.formB.debrief]);
    rows.push(['B', 'B3', 'bws', 'best-worst', 'set0…', QS.formB.stem.replace(/\*\*/g, ''), 'see formB_choices_long.csv']);
    return { headers: ['form', 'code', 'field', 'type', 'page', 'wording', 'values'], rows: rows };
  }

  /** Every export table, by file name: { sheet (Excel sheet name), headers, rows }. CSV files and the Excel workbook are both built from these. */
  function buildTables(d) {
    var codeLabel = {};
    d.codes.forEach(function (c) { codeLabel[c.id] = c.label; });
    codeLabel[EXCLUDE] = 'Not about a road (excluded)';
    var assign = { 1: {}, 2: {} };
    d.assignments.forEach(function (a) { assign[a.coder][a.key] = asList(a.code); });
    function ids(v) { return v === null || v === undefined ? '' : v === EXCLUDE ? EXCLUDE : v.join('+'); }
    function labels(v) { return v === null || v === undefined ? '' : v === EXCLUDE ? codeLabel[EXCLUDE] : v.map(function (c) { return codeLabel[c] || c; }).join(' + '); }
    var norm = function (s) { return String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim(); };
    var versions = {};
    (d.config.history || []).forEach(function (v) { versions[v.designVersion] = v; });
    var tables = {};
    function add(file, sheet, headers, rows) { tables[file] = { sheet: sheet, headers: headers, rows: rows }; }
    // the analysis status shown in the dashboard (kept, test, repeat, formA, otherVersion, closed), by record
    var status = {};
    (S.res.respondents || []).forEach(function (p) { status[p.form + '|' + p.id] = p; });
    function st(r) { var p = status[r.form + '|' + r.id]; return p ? p.status : ''; }
    var byTime = function (x, y) { return x.receivedAt < y.receivedAt ? -1 : x.receivedAt > y.receivedAt ? 1 : 0; };
    d.formA.sort(byTime); d.formB.sort(byTime);
    // Pseudonymised files: answers are linked to a person only through respondentId, and the emails and
    // names sit in one separate file, so every other file can be shared without identifying anyone.
    add('respondents_by_email', 'Respondents by email (private)', ['form', 'respondentId', 'email', 'name', 'receivedAt', 'test', 'designVersion', 'analysisStatus', 'flags'],
      d.formA.concat(d.formB).map(function (r) {
        var p = status[r.form + '|' + r.id];
        return [r.form, r.id, r.email, r.name, r.receivedAt, r.test, r.designVersion, p ? p.status : '', p ? p.flags : ''];
      }));
    var aHead = ['respondentId', 'receivedAt', 'formVersion', 'test', 'analysisStatus', 'sameDeviceRepeat', 'durationSec', 'age',
      'changedAny'].concat(boxes('listAny'), ['listAnyNothing', 'changedSafety', 'storySafety', 'timeSafety'], boxes('listSafety'), ['listSafetyNothing'], TRAVEL, ['unclear']);
    add('formA_respondents', 'Form A responses', aHead, d.formA.map(function (r) {
      var x = r.answers;
      return [r.id, r.receivedAt, r.formVersion, r.test, st(r), r.sameDeviceRepeat, duration(r), x.age, x.changedAny]
        .concat(pad(x.listAny, 10), [x.listAnyNothing, x.changedSafety, x.storySafety, x.timeSafety], pad(x.listSafety, 10),
          [x.listSafetyNothing], TRAVEL.map(function (k) { return x[k]; }), [x.unclear]);
    }));
    var long = [];
    d.formA.forEach(function (r) {
      [['A2.2', 'listAny'], ['A3.4', 'listSafety']].forEach(function (l) {
        (r.answers[l[1]] || []).forEach(function (e, i) {
          var k = norm(e), c1 = assign[1][k] || null, c2 = assign[2][k] || null;
          long.push([r.id, r.test, st(r), l[0], i + 1, e, k, ids(c1), labels(c1), ids(c2), labels(c2)]);
        });
      });
    });
    add('formA_freelists_long', 'Form A list entries', ['respondentId', 'test', 'analysisStatus', 'list', 'positionAsWritten', 'entry', 'normalisedKey', 'code1', 'code1Label', 'code2', 'code2Label'], long);
    add('formB_respondents', 'Form B responses', ['respondentId', 'receivedAt', 'formVersion', 'test', 'designVersion', 'analysisStatus', 'sameDeviceRepeat', 'sameDeviceFormA', 'durationSec', 'age'].concat(TRAVEL, ['unclearItems', 'missingItems', 'setsSkipped']),
      d.formB.map(function (r) {
        var x = r.answers;
        return [r.id, r.receivedAt, r.formVersion, r.test, r.designVersion, st(r), r.sameDeviceRepeat, r.sameDeviceFormA, duration(r), x.age].concat(TRAVEL.map(function (k) { return x[k]; }),
          [x.unclearItems, x.missingItems, r.bws.filter(function (s) { return s.best === null; }).length]);
      }));
    var choices = [];
    d.formB.forEach(function (r) {
      var v = versions[r.designVersion];
      r.bws.forEach(function (s) {
        s.shown.forEach(function (item, pos) {
          choices.push([r.id, r.test, r.designVersion, st(r), s.order + 1, s.set + 1, pos + 1, item + 1, v ? v.items[item].label : '',
            s.best === null ? '' : (s.best === item ? 1 : 0), s.worst === null ? '' : (s.worst === item ? 1 : 0), s.best === null ? 1 : 0, s.ms]);
        });
      });
    });
    add('formB_choices_long', 'Form B choices', ['respondentId', 'test', 'designVersion', 'analysisStatus', 'setOrder', 'designSet', 'position', 'item', 'itemLabel', 'best', 'worst', 'setSkipped', 'msOnSet'], choices);
    var used = {};
    d.assignments.forEach(function (a) { if (a.coder === 1) (asList(a.code) === EXCLUDE ? [EXCLUDE] : asList(a.code)).forEach(function (c) { used[c] = (used[c] || 0) + 1; }); });
    add('codebook', 'Codebook', ['codeId', 'label', 'description', 'scope', 'entriesCodedByCoder1'], d.codes.map(function (c) { return [c.id, c.label, c.description, c.scope, used[c.id] || 0]; }));
    var res = S.res;
    if (res.formB.open && res.formB.ranking) {
      var seqRanks = res.formB.sequential && res.formB.sequential.ranks;
      add('results_ranking', 'Final ranking', ['rank', 'item', 'label', 'weight', 'weightLo95', 'weightHi95', 'utility', 'se', 'bwStd', 'best', 'worst', 'shown', 'rankLo95', 'rankHi95', 'pRankedFirst', 'rankSequentialModel', 'basis'],
        res.formB.ranking.map(function (r) { return [r.rank, r.item + 1, r.label, r.weight, r.weightLo, r.weightHi, r.utility, r.se, r.std, r.best, r.worst, r.shown, r.rankLo, r.rankHi, r.pTop, seqRanks ? seqRanks[r.item] : '', res.formB.rankingBasis]; }));
    }
    add('results_salience_A34', 'Salience A3.4', ['rank', 'codeId', 'label', 'scope', 'smithS', 'sutropCSI', 'freq', 'pct', 'meanPos'],
      res.formA.salience.safety.codedRows.map(function (r, i) { return [i + 1, r.code, r.label, r.scope, r.smithS, r.sutropCSI, r.freq, r.pct, r.meanPos]; }));
    var dict = dataDictionary();
    add('data_dictionary', 'Data dictionary', dict.headers, dict.rows);
    return tables;
  }

  /** The first sheet of each workbook: what it is and how to read it. */
  function aboutSheet(withEmails, generatedAt) {
    var rows = [
      ['Study', 'Road choice study (Form A elicitation, Form B best-worst ranking)'],
      ['Downloaded', new Date().toLocaleString()],
      ['Results computed', new Date(generatedAt).toLocaleString()],
      ['This copy', withEmails ? 'PRIVATE: contains email addresses and names (sheet "Respondents by email"). Never share or upload it, and delete it when the study ends.' : 'Shareable: no emails or names. Answers are linked only by a random respondentId.'],
      ['analysisStatus', 'kept = in the analysis; test = a ?test=1 response; repeat = a later response from the same email; formA = a Form B response from someone who answered Form A; otherVersion = an earlier Form B list; closed = Form B not open'],
      ['Codes', 'Question codes (A2.1, A3.4 …) and field names are listed in "Data dictionary".']
    ];
    return { name: 'About', headers: ['Item', 'Detail'], rows: rows };
  }

  function renderExport(main) {
    main.appendChild(titleRow('Export', 'Everything in one Excel workbook, or each table as a CSV file for R, Stata or SPSS.'));
    var status = h('p', { class: 'muted small' });
    var listEl = h('div');
    var btn = h('button', { class: 'btn primary', type: 'button', text: 'Prepare the files', onclick: function () {
      status.textContent = 'Preparing…';
      act({ action: 'exportData' }).then(function (d) {
        var tables = buildTables(d), names = Object.keys(tables), stamp = new Date().toISOString().slice(0, 10);
        function sheets(withEmails) {
          return [aboutSheet(withEmails, S.res.generatedAt)].concat(names.filter(function (n) { return withEmails || n !== 'respondents_by_email'; })
            .map(function (n) { return { name: tables[n].sheet, headers: tables[n].headers, rows: tables[n].rows }; }));
        }
        var files = {};
        files['road_choice_study_' + stamp + '_PRIVATE_with_emails.xlsx'] = function () { return window.XLSX_WRITER.workbook(sheets(true)); };
        files['road_choice_study_' + stamp + '_shareable.xlsx'] = function () { return window.XLSX_WRITER.workbook(sheets(false)); };
        names.forEach(function (n) { files[n + '.csv'] = function () { return csv(tables[n].headers, tables[n].rows); }; });
        // the results without the list of emails, so this file can be shared
        files['results.json'] = function () {
          var shareable = {};
          Object.keys(S.res).forEach(function (k) { if (k !== 'respondents') shareable[k] = S.res[k]; });
          return new Blob([JSON.stringify(shareable, null, 2)], { type: 'application/json' });
        };
        status.textContent = 'Ready. The Excel workbooks open in Excel, Numbers and Google Sheets; each CSV is UTF-8.';
        listEl.textContent = '';
        listEl.appendChild(table(['File', ''], Object.keys(files).map(function (name) {
          return [name, h('button', { class: 'btn small secondary', type: 'button', text: 'Download', onclick: function () { download(name, files[name]()); } })];
        })));
      }).catch(function () { status.textContent = 'Export failed.'; });
    } });
    main.appendChild(panel('Files', [h('div', { class: 'row', style: 'margin-bottom:8px' }, [btn, status]), listEl],
      'The PRIVATE workbook has every sheet, including emails and names. The shareable workbook and every CSV except respondents_by_email.csv link answers to a person through respondentId alone, so they can be shared. Test responses are included and marked in a “test” column, and analysisStatus says whether each response is in the analysis shown on this page (kept) or why not. In the free-list table, a split entry lists its codes joined by “+”, in the order coded.'));
  }

  // ---------------------------------------------------------------- start
  window.addEventListener('beforeunload', function (e) { if (pendingCount()) { e.preventDefault(); e.returnValue = ''; } });
  app.appendChild(bar());
  app.appendChild(h('p', { class: 'canvas muted', text: 'Loading…' }));
  // the config call says whether the storage is set up and how the researcher gets in
  API.get('config').then(function () {
    if (!API.connected) { login(); return; }
    if (API.researcher === 'signed-in') { S.key = null; load(); return; }
    var saved = session('researcherKey');
    if (API.researcher !== 'key' || !saved) { login(); return; }
    S.key = saved; load();
  }).catch(function (err) { login('The backend could not be reached: ' + err.message); });
})();
