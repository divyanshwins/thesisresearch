'use strict';
// Runs the real backend/Code.gs + Engine.gs against the Apps Script stand-in
// in dev/gas-mock.js and checks every action end to end.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBackend } = require('../dev/gas-mock');

const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const elig = { consent: 'yes', gender: 'woman', age: '25_34', roads: 'yes', modes: ['foot'], frequency: 'daily', company: 'both', area: 'residential' };

function fresh() {
  const b = createBackend(null);
  b.ctx.PropertiesService.getScriptProperties().setProperty('RESEARCHER_KEY', 'k');
  b.ctx.setup();
  return b;
}

const words = {
  light: ['dark street', 'no street lights', 'poor lighting'],
  people: ['empty road', 'no people around', 'crowd'],
  shops: ['shops open', 'closed shops'],
  police: ['police', 'no police'],
  men: ['groups of men', 'men staring'],
  known: ['familiar road', 'road i know'],
  water: ['waterlogging'],
  cctv: ['cctv'],
  view: ['blind corner', 'can see far'],
  exit: ['no way out', 'side lanes'],
  news: ['heard bad things'],
  network: ['no network']
};
const codeIds = Object.keys(words);

function submitFormA(b, n) {
  const all = codeIds.flatMap((c) => words[c]);
  for (let i = 0; i < n; i++) {
    const list = [all[i % all.length], all[(i * 7 + 3) % all.length], all[(i * 5 + 1) % all.length]];
    const r = b.post({ action: 'submitA', payload: { respondentId: uuid(i + 1), pageTimes: { p1: 1000 + i }, answers: { ...elig, changedAny: 'yes', listAny: ['traffic', list[0]], changedSafety: i % 3 ? 'yes' : 'no', listSafety: list } } });
    assert.equal(r.ok, true, JSON.stringify(r));
  }
}

test('setup creates the sheets and a researcher key', () => {
  const b = createBackend(null);
  const key = b.ctx.setup();
  assert.match(key, /^[0-9a-f-]{36}$/);
  for (const s of ['FormA', 'FormB', 'Codes', 'Assignments', 'Config', 'FreezeHistory']) assert.ok(b.store.data.sheets[s], s);
  assert.equal(b.get({ action: 'ping' }).ok, true);
  assert.equal(b.get({ action: 'config' }).formB.open, false);
});

test('Form A: valid submission stored once; duplicates and ineligible answers rejected', () => {
  const b = fresh();
  const p = { respondentId: uuid(1), answers: { ...elig, listSafety: ['dark street'] } };
  assert.equal(b.post({ action: 'submitA', payload: p }).ok, true);
  assert.equal(b.post({ action: 'submitA', payload: p }).duplicate, true);
  assert.equal(b.post({ action: 'submitA', payload: { ...p, respondentId: uuid(2), answers: { ...elig, gender: 'man' } } }).ok, false);
  assert.equal(b.post({ action: 'submitA', payload: { ...p, respondentId: uuid(3), hp: 'bot' } }).ok, true);
  assert.equal(b.store.data.sheets.FormA.length, 2, 'header + one response');
  assert.equal(b.postRaw('not json').ok, false);
});

test('researcher actions need the key', () => {
  const b = fresh();
  assert.equal(b.post({ action: 'results' }).ok, false);
  assert.equal(b.post({ action: 'results', key: 'wrong' }).ok, false);
  assert.equal(b.post({ action: 'results', key: 'k' }).ok, true);
});

test('full flow: code entries, freeze top 12, collect Form B, live ranking', () => {
  const b = fresh();
  submitFormA(b, 30);
  let res = b.post({ action: 'results', key: 'k' });
  assert.equal(res.formA.n, 30);
  assert.ok(res.formA.coding.coverage.safety.entries > 0);
  // freezing before coding is refused
  assert.equal(b.post({ action: 'freeze', key: 'k', k: 12 }).ok, false);

  const codes = codeIds.map((c) => ({ id: 'c_' + c, label: 'Label ' + c, description: 'Plain description of ' + c, scope: 'safety' }));
  codes.push({ id: 'c_traffic', label: 'Traffic', description: 'Amount of traffic', scope: 'other' });
  const assignments = codeIds.flatMap((c) => words[c].map((w) => ({ key: w, coder: 1, code: 'c_' + c })));
  assignments.push({ key: 'traffic', coder: 1, code: 'c_traffic' });
  assignments.push({ key: 'dark street', coder: 2, code: 'c_light' }, { key: 'crowd', coder: 2, code: 'c_light' });
  const saved = b.post({ action: 'saveCodes', key: 'k', codes, assignments });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(b.post({ action: 'saveCodes', key: 'k', assignments: [{ key: 'Not Normalised', coder: 1, code: 'c_light' }] }).ok, false);

  res = b.post({ action: 'results', key: 'k' });
  assert.equal(res.formA.coding.coverage.safety.coded, res.formA.coding.coverage.safety.entries);
  assert.equal(res.formA.salience.safety.codedRows.length, 12);
  assert.ok(res.formA.premise.unprimedMentionsSafety.n === 30);
  assert.equal(res.formA.coding.alpha.units, 2);

  // a banned word blocks freezing
  b.post({ action: 'saveCodes', key: 'k', codes: [{ id: 'c_light', label: 'Danger of darkness', description: 'x', scope: 'safety' }] });
  assert.match(b.post({ action: 'freeze', key: 'k', k: 12 }).error, /danger/);
  b.post({ action: 'saveCodes', key: 'k', codes: [{ id: 'c_light', label: 'How safe the lighting is', description: 'x', scope: 'safety' }] });
  assert.match(b.post({ action: 'freeze', key: 'k', k: 12 }).error, /criterion/);
  b.post({ action: 'saveCodes', key: 'k', codes: [{ id: 'c_light', label: 'How well lit the road is', description: 'Street lights or other light', scope: 'safety' }] });
  assert.equal(b.post({ action: 'freeze', key: 'k', k: 13 }).ok, false, 'only 12 eligible codes (traffic is scope other)');
  const fr = b.post({ action: 'freeze', key: 'k', k: 12 });
  assert.equal(fr.ok, true, JSON.stringify(fr));
  assert.equal(fr.freeze.designVersion, 1);
  assert.equal(b.post({ action: 'freeze', key: 'k', k: 12 }).ok, false, 'cannot freeze twice');

  const cfg = b.get({ action: 'config' });
  assert.equal(cfg.formB.open, true);
  assert.equal(cfg.formB.items.length, 12);
  assert.equal(cfg.formB.items[0].codeId, undefined, 'public config exposes only wording');

  // Form B respondents choose by a known order: lower item index = more important
  for (let r = 0; r < 40; r++) {
    const bws = cfg.formB.sets.map((set, s) => {
      const shown = set.slice().reverse();
      const sorted = set.slice().sort((x, y) => x - y);
      const noisy = r % 5 === 0;
      return { set: s, shown, best: noisy ? sorted[1] : sorted[0], worst: sorted[3], ms: 4000 };
    });
    const out = b.post({ action: 'submitB', payload: { respondentId: uuid(100 + r), designVersion: 1, answers: { ...elig, tookPartBefore: r === 3 ? 'yes' : 'no' }, bws, pageTimes: { s1: 4000 } } });
    assert.equal(out.ok, true, JSON.stringify(out));
  }
  assert.equal(b.post({ action: 'submitB', payload: { respondentId: uuid(999), designVersion: 2, answers: elig, bws: [] } }).ok, false);

  res = b.post({ action: 'results', key: 'k' });
  assert.equal(res.formB.n, 40);
  assert.equal(res.formB.nAnswered, 40);
  assert.equal(res.formB.sensitivity.byFlag.tookPartBefore, 1);
  // these respondents choose deterministically, so the model is not estimable and the robustness model is not run
  assert.equal(res.formB.rankingBasis, 'counts');
  assert.equal(res.formB.sequential, null);
  assert.ok(res.formB.positionTest.best.p >= 0 && res.formB.positionTest.best.p <= 1);
  assert.equal(res.formB.ranking.length, 12);
  assert.equal(res.formB.ranking[0].item, 0);
  assert.equal(res.formB.ranking[11].item, 11);
  const wsum = res.formB.ranking.reduce((s, r) => s + (r.weight || 0), 0);
  assert.ok(res.formB.rankingBasis === 'counts' || Math.abs(wsum - 1) < 1e-9);

  // unfreezing needs confirmation, then opens a new version
  assert.equal(b.post({ action: 'unfreeze', key: 'k' }).ok, false);
  assert.equal(b.post({ action: 'unfreeze', key: 'k', confirm: 'UNFREEZE' }).ok, true);
  assert.equal(b.get({ action: 'config' }).formB.open, false);
  assert.equal(b.post({ action: 'freeze', key: 'k', k: 10 }).freeze.designVersion, 2);
  res = b.post({ action: 'results', key: 'k' });
  assert.equal(res.formB.n, 0);
  assert.equal(res.formB.nOtherVersions, 40);

  // the audit trail of what each version showed: one row per version, exported with the config
  const hist = b.post({ action: 'exportData', key: 'k' }).config.history;
  assert.deepEqual(hist.map((v) => v.designVersion), [1, 2]);
  assert.equal(hist[0].items.length, 12);
  assert.equal(hist[1].items.length, 10);
  // many refreezes never push the Config cell towards the 50,000-character limit of a Sheets cell
  for (let v = 0; v < 20; v++) {
    b.post({ action: 'unfreeze', key: 'k', confirm: 'UNFREEZE' });
    assert.equal(b.post({ action: 'freeze', key: 'k', k: 12 }).ok, true);
  }
  const cells = Object.values(b.store.data.sheets).flat().map((row) => String(row[0]));
  assert.ok(Math.max(...cells.map((c) => c.length)) < 50000, 'every stored cell is under the Sheets limit');
  assert.ok(b.store.data.sheets.Config[1][0].length < 10000, 'the Config cell does not grow with the history');
});

test('closing Form A stops new submissions', () => {
  const b = fresh();
  assert.equal(b.post({ action: 'setFormA', key: 'k', open: false }).formAOpen, false);
  assert.equal(b.post({ action: 'submitA', payload: { respondentId: uuid(5), answers: elig } }).ok, false);
  assert.equal(b.get({ action: 'config' }).formAOpen, false);
});

test('test-mode submissions are stored but left out of the analysis', () => {
  const b = fresh();
  b.post({ action: 'submitA', payload: { respondentId: uuid(1), test: true, answers: { ...elig, listSafety: ['x'] } } });
  b.post({ action: 'submitA', payload: { respondentId: uuid(2), answers: { ...elig, listSafety: ['y'] } } });
  const res = b.post({ action: 'results', key: 'k' });
  assert.equal(res.formA.n, 1);
  assert.equal(res.formA.nTest, 1);
  assert.equal(res.includesTest, false);
  // the researcher can include them to check the forms; the count of tests stays the same
  const withTest = b.post({ action: 'results', key: 'k', includeTest: true });
  assert.equal(withTest.formA.n, 2);
  assert.equal(withTest.formA.nTest, 1);
  assert.equal(withTest.includesTest, true);
  assert.equal(b.post({ action: 'results', key: 'k', includeTest: 'yes' }).includesTest, false, 'only a strict true includes them');
});

test('the largest possible Form A record fits in one Sheets cell', () => {
  const b = fresh();
  const long = '"'.repeat(2500), short = '"'.repeat(250);     // quotes double in JSON, the worst ordinary case
  const answers = { ...elig, changedAny: 'yes', storyAny: long, actionsAny: ['other'], actionsAnyOther: short,
    listAny: Array(12).fill(short), changedSafety: 'yes', storySafety: long, actionsSafety: ['other'], actionsSafetyOther: short, timeSafety: 'dark',
    listSafety: Array(12).fill(short), afterDark: long, anythingElse: long, city: short, modesOther: short, unclear: long };
  const pageTimes = Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['page_' + i + '_xxxxxxxxxxxx', 86400000]));
  assert.equal(b.post({ action: 'submitA', payload: { respondentId: uuid(1), pageTimes, answers } }).ok, true);
  const cell = String(b.store.data.sheets.FormA[1][0]);
  assert.ok(cell.length < 50000, 'record is ' + cell.length + ' characters');
});

test('split entries: an entry coded with several codes, and deleting one of them', () => {
  const b = fresh();
  b.post({ action: 'submitA', payload: { respondentId: uuid(1), answers: { ...elig, listSafety: ['Dark and empty', 'shops'] } } });
  b.post({ action: 'submitA', payload: { respondentId: uuid(2), answers: { ...elig, listSafety: ['shops', 'dark and empty'] } } });
  const codes = [{ id: 'c_light', label: 'How well lit the road is', description: 'Lights', scope: 'safety' },
    { id: 'c_people', label: 'How many people are around', description: 'People', scope: 'safety' },
    { id: 'c_shops', label: 'How many shops face the road', description: 'Shops', scope: 'safety' }];
  assert.equal(b.post({ action: 'saveCodes', key: 'k', codes, assignments: [
    { key: 'dark and empty', coder: 1, code: ['c_light', 'c_people'] }, { key: 'shops', coder: 1, code: 'c_shops' }] }).ok, true);
  assert.equal(b.post({ action: 'saveCodes', key: 'k', assignments: [{ key: 'shops', coder: 1, code: ['c_shops', 'c_shops'] }] }).ok, false, 'same code twice');
  assert.equal(b.post({ action: 'saveCodes', key: 'k', assignments: [{ key: 'shops', coder: 1, code: ['c_shops', 'c_light', 'c_people', 'c_x'] }] }).ok, false, 'more than 3');
  let res = b.post({ action: 'results', key: 'k' });
  const by = Object.fromEntries(res.formA.salience.safety.codedRows.map((r) => [r.code, r]));
  // list 1: light(1) people(2) shops(3), L = 3 ; list 2: shops(1) light(2) people(3), L = 3
  // S_light = (3/3 + 2/3)/2 = 5/6 ; S_people = (2/3 + 1/3)/2 = 1/2 ; S_shops = (1/3 + 1)/2 = 2/3
  assert.ok(Math.abs(by.c_light.smithS - 5 / 6) < 1e-12);
  assert.ok(Math.abs(by.c_people.smithS - 1 / 2) < 1e-12);
  assert.ok(Math.abs(by.c_shops.smithS - 2 / 3) < 1e-12);
  assert.equal(res.formA.coding.coverage.split, 1);
  // deleting c_people keeps the entry coded as light
  assert.equal(b.post({ action: 'saveCodes', key: 'k', deleteCodes: ['c_people'] }).ok, true);
  res = b.post({ action: 'results', key: 'k' });
  assert.deepEqual(JSON.parse(JSON.stringify(res.formA.coding.entries.find((e) => e.key === 'dark and empty').code1)), ['c_light']);
});
