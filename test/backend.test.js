'use strict';
// Runs the real backend (backend/app.js + engine.js) end to end, three times: on the local file
// store, through the Vercel Blob store (backend/store-blob.js) against a stand-in SDK in
// test/blob-fake.js, and through the GitHub store (backend/store-github.js) against a stand-in
// GitHub API in test/github-mock.js. Every action is checked on all three.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../backend/app');
const { fileStore } = require('../backend/store-file');
const { githubStore } = require('../backend/store-github');
const { blobStore } = require('../backend/store-blob');
const { startGithubMock } = require('./github-mock');
const { createBlobFake } = require('./blob-fake');
const noWait = () => Promise.resolve();

const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const mail = (n) => 'woman' + n + '@example.org';
const elig = { consent: 'yes', gender: 'woman', age: '25_34', roads: 'yes', email: mail(0), modes: ['foot'], company: 'both', area: 'residential' };

let mock = null, repoCount = 0;
before(async () => { mock = await startGithubMock(); });
after(async () => { await mock.close(); });

/** A fresh backend with key 'k' on the chosen store, with helpers to look inside the stored data. */
function fresh(kind) {
  let store, repo = null, blob = null;
  if (kind === 'file') store = fileStore(null);
  else if (kind === 'blob') { blob = createBlobFake(); store = blobStore({ sdk: blob.sdk, sleep: noWait }); }
  else {
    repo = mock.createRepo('data' + (++repoCount), repoCount % 2 === 0);   // half start empty, half with a README
    store = githubStore({ token: mock.token, repo: 'o/' + repo.name, apiBase: mock.base, sleep: noWait });
  }
  const app = createApp({ store, researcherKey: 'k', wrongKeyDelay: 0 });
  const blobFiles = (prefix) => Array.from(blob.files.entries()).filter(([p]) => p.startsWith(prefix)).map(([, f]) => JSON.parse(f.body));
  const filesOf = (form) => (kind === 'file' ? Object.values(store.data.responses[form])
    : kind === 'blob' ? blobFiles('responses/' + form + '/')
    : (fs.existsSync(path.join(repo.dir, 'responses', form)) ? fs.readdirSync(path.join(repo.dir, 'responses', form)).map((f) => JSON.parse(fs.readFileSync(path.join(repo.dir, 'responses', form, f), 'utf8'))) : []));
  return {
    kind, store, repo, blob,
    post: (obj) => app.post(JSON.stringify(obj)),
    postRaw: (s) => app.post(s),
    get: (p) => app.get(p),
    count: (form) => filesOf(form).length,
    record: (form, id) => filesOf(form).find((r) => r.id === id),
    stateText: () => (kind === 'file' ? JSON.stringify(store.data.state) : kind === 'blob' ? blob.files.get('state.json').body : fs.readFileSync(path.join(repo.dir, 'state.json'), 'utf8'))
  };
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

async function submitFormA(b, n) {
  const all = codeIds.flatMap((c) => words[c]);
  for (let i = 0; i < n; i++) {
    const list = [all[i % all.length], all[(i * 7 + 3) % all.length], all[(i * 5 + 1) % all.length]];
    const r = await b.post({ action: 'submitA', payload: { respondentId: uuid(i + 1), pageTimes: { p1: 1000 + i }, answers: { ...elig, email: mail(i + 1), changedAny: 'yes', listAny: ['traffic', list[0]], changedSafety: i % 3 ? 'yes' : 'no', listSafety: list } } });
    assert.equal(r.ok, true, JSON.stringify(r));
  }
}

for (const kind of ['file', 'blob', 'github']) {
  const t = (name, fn) => test('[' + kind + ' store] ' + name, fn);

  t('before anything is saved: ping, and Form A open with Form B closed', async () => {
    const b = fresh(kind);
    assert.equal((await b.get({ action: 'ping' })).ok, true);
    const cfg = await b.get({ action: 'config' });
    assert.equal(cfg.configured, true);
    assert.equal(cfg.formAOpen, true);
    assert.equal(cfg.formB.open, false);
    const res = await b.post({ action: 'results', key: 'k' });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.formA.n, 0);
  });

  t('Form A: valid submission stored once; duplicates and ineligible answers rejected', async () => {
    const b = fresh(kind);
    const p = { respondentId: uuid(1), answers: { ...elig, listSafety: ['dark street'] } };
    assert.equal((await b.post({ action: 'submitA', payload: p })).ok, true);
    assert.equal((await b.post({ action: 'submitA', payload: p })).duplicate, true);
    assert.equal((await b.post({ action: 'submitA', payload: { ...p, respondentId: uuid(2), answers: { ...elig, gender: 'man' } } })).ok, false);
    assert.equal((await b.post({ action: 'submitA', payload: { ...p, respondentId: uuid(3), hp: 'bot' } })).ok, true);
    assert.equal(b.count('A'), 1, 'one response stored');
    assert.equal((await b.postRaw('not json')).ok, false);
    assert.equal((await b.postRaw('null')).ok, false);
    // the email is required and must look like an address; it is stored in lower case beside the answers
    assert.match((await b.post({ action: 'submitA', payload: { ...p, respondentId: uuid(4), answers: { ...elig, email: '' } } })).error, /email/);
    assert.match((await b.post({ action: 'submitA', payload: { ...p, respondentId: uuid(5), answers: { ...elig, email: 'not an email' } } })).error, /email/);
    assert.equal((await b.post({ action: 'submitA', payload: { ...p, respondentId: uuid(6), answers: { ...elig, email: '  Asha.K@Example.ORG ', name: '  Asha  ' } } })).ok, true);
    const stored = b.record('A', uuid(6));
    assert.equal(stored.email, 'asha.k@example.org');
    assert.equal(stored.name, 'Asha');
    assert.ok(!('email' in stored.answers));
  });

  t('one response per person: a repeat from the same email is stored but left out, the first is kept', async () => {
    const b = fresh(kind);
    const send = (n, email, list, extra) => b.post({ action: 'submitA', payload: { respondentId: uuid(n), ...extra, answers: { ...elig, email, listSafety: list } } });
    await send(1, 'a@example.org', ['first answer']);
    await send(2, 'b@example.org', ['other woman']);
    await send(3, 'A@EXAMPLE.org', ['second answer']);                 // same person, different case
    await send(4, 'a@example.org', ['her test'], { test: true });       // a test from the same email never hides a real response
    let res = await b.post({ action: 'results', key: 'k' });
    assert.equal(res.formA.n, 2);
    assert.equal(res.formA.nRepeat, 1);
    const keys = res.formA.coding.entries.map((e) => e.key);
    assert.ok(keys.includes('first answer') && !keys.includes('second answer'), 'the first response is the one analysed');
    const status = Object.fromEntries(res.respondents.map((r) => [r.id, r.status]));
    assert.deepEqual(status, { [uuid(1)]: 'kept', [uuid(2)]: 'kept', [uuid(3)]: 'repeat', [uuid(4)]: 'test' });
    assert.equal(res.respondents.find((r) => r.id === uuid(3)).email, 'a@example.org');
    // with tests included, the test is the first test from that email, so it is kept
    res = await b.post({ action: 'results', key: 'k', includeTest: true });
    assert.equal(res.formA.n, 3);
    assert.equal(res.respondents.find((r) => r.id === uuid(4)).status, 'kept');
    assert.equal(b.count('A'), 4, 'nothing is deleted from the data');
  });

  t('researcher actions need the key', async () => {
    const b = fresh(kind);
    assert.equal((await b.post({ action: 'results' })).ok, false);
    assert.equal((await b.post({ action: 'results', key: 'wrong' })).ok, false);
    assert.equal((await b.post({ action: 'results', key: ['k'] })).ok, false);
    assert.equal((await b.post({ action: 'exportData', key: '' })).ok, false);
    assert.equal((await b.post({ action: 'results', key: 'k' })).ok, true);
  });

  t('full flow: code entries, freeze top 12, collect Form B, live ranking', async () => {
    const b = fresh(kind);
    await submitFormA(b, 30);
    let res = await b.post({ action: 'results', key: 'k' });
    assert.equal(res.formA.n, 30);
    assert.ok(res.formA.coding.coverage.safety.entries > 0);
    // freezing before coding is refused
    assert.equal((await b.post({ action: 'freeze', key: 'k', k: 12 })).ok, false);

    const codes = codeIds.map((c) => ({ id: 'c_' + c, label: 'Label ' + c, description: 'Plain description of ' + c, scope: 'safety' }));
    codes.push({ id: 'c_traffic', label: 'Traffic', description: 'Amount of traffic', scope: 'other' });
    const assignments = codeIds.flatMap((c) => words[c].map((w) => ({ key: w, coder: 1, code: 'c_' + c })));
    assignments.push({ key: 'traffic', coder: 1, code: 'c_traffic' });
    assignments.push({ key: 'dark street', coder: 2, code: 'c_light' }, { key: 'crowd', coder: 2, code: 'c_light' });
    const saved = await b.post({ action: 'saveCodes', key: 'k', codes, assignments });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal((await b.post({ action: 'saveCodes', key: 'k', assignments: [{ key: 'Not Normalised', coder: 1, code: 'c_light' }] })).ok, false);

    res = await b.post({ action: 'results', key: 'k' });
    assert.equal(res.formA.coding.coverage.safety.coded, res.formA.coding.coverage.safety.entries);
    assert.equal(res.formA.salience.safety.codedRows.length, 12);
    assert.ok(res.formA.premise.unprimedMentionsSafety.n === 30);
    assert.equal(res.formA.coding.alpha.units, 2);

    // a banned word blocks freezing
    await b.post({ action: 'saveCodes', key: 'k', codes: [{ id: 'c_light', label: 'Danger of darkness', description: 'x', scope: 'safety' }] });
    assert.match((await b.post({ action: 'freeze', key: 'k', k: 12 })).error, /danger/);
    await b.post({ action: 'saveCodes', key: 'k', codes: [{ id: 'c_light', label: 'How safe the lighting is', description: 'x', scope: 'safety' }] });
    assert.match((await b.post({ action: 'freeze', key: 'k', k: 12 })).error, /criterion/);
    await b.post({ action: 'saveCodes', key: 'k', codes: [{ id: 'c_light', label: 'How well lit the road is', description: 'Street lights or other light', scope: 'safety' }] });
    assert.equal((await b.post({ action: 'freeze', key: 'k', k: 13 })).ok, false, 'only 12 eligible codes (traffic is scope other)');
    const fr = await b.post({ action: 'freeze', key: 'k', k: 12 });
    assert.equal(fr.ok, true, JSON.stringify(fr));
    assert.equal(fr.freeze.designVersion, 1);
    assert.equal((await b.post({ action: 'freeze', key: 'k', k: 12 })).ok, false, 'cannot freeze twice');

    const cfg = await b.get({ action: 'config' });
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
      const out = await b.post({ action: 'submitB', payload: { respondentId: uuid(100 + r), designVersion: 1, answers: { ...elig, email: mail(100 + r) }, bws, pageTimes: { s1: 4000 } } });
      assert.equal(out.ok, true, JSON.stringify(out));
    }
    assert.equal((await b.post({ action: 'submitB', payload: { respondentId: uuid(999), designVersion: 2, answers: elig, bws: [] } })).ok, false);
    // a Form A respondent who also answers Form B, and a second Form B response from the same email, are both left out
    const oneSet = cfg.formB.sets.map((set, s) => ({ set: s, shown: set, best: set[3], worst: set[0], ms: 4000 }));
    assert.equal((await b.post({ action: 'submitB', payload: { respondentId: uuid(300), designVersion: 1, answers: { ...elig, email: mail(5) }, bws: oneSet } })).ok, true);
    assert.equal((await b.post({ action: 'submitB', payload: { respondentId: uuid(301), designVersion: 1, answers: { ...elig, email: mail(100) }, bws: oneSet } })).ok, true);
    assert.equal((await b.post({ action: 'submitB', payload: { respondentId: uuid(302), designVersion: 1, test: true, answers: { ...elig, email: mail(6) }, bws: oneSet } })).ok, true);

    res = await b.post({ action: 'results', key: 'k' });
    assert.equal(res.formB.n, 40);
    assert.equal(res.formB.nAnswered, 40);
    assert.equal(res.formB.nFormA, 1);
    assert.equal(res.formB.nRepeat, 1);
    assert.deepEqual(Object.keys(res.formB.sensitivity.byFlag), ['speed']);
    const st = Object.fromEntries(res.respondents.filter((r) => r.form === 'B').map((r) => [r.id, r.status]));
    assert.equal(st[uuid(300)], 'formA'); assert.equal(st[uuid(301)], 'repeat'); assert.equal(st[uuid(302)], 'test'); assert.equal(st[uuid(100)], 'kept');
    // with tests included, a test from a Form A email is left out for the same reason
    assert.equal((await b.post({ action: 'results', key: 'k', includeTest: true })).respondents.find((r) => r.id === uuid(302)).status, 'formA');
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
    assert.equal((await b.post({ action: 'unfreeze', key: 'k' })).ok, false);
    assert.equal((await b.post({ action: 'unfreeze', key: 'k', confirm: 'UNFREEZE' })).ok, true);
    assert.equal((await b.get({ action: 'config' })).formB.open, false);
    assert.equal((await b.post({ action: 'freeze', key: 'k', k: 10 })).freeze.designVersion, 2);
    res = await b.post({ action: 'results', key: 'k' });
    assert.equal(res.formB.n, 0);
    assert.equal(res.formB.nOtherVersions, 42, 'the 40 kept, the Form A respondent and the repeat; the test is counted as a test');

    // the audit trail of what each version showed, exported with the config
    const hist = (await b.post({ action: 'exportData', key: 'k' })).config.history;
    assert.deepEqual(hist.map((v) => v.designVersion), [1, 2]);
    assert.equal(hist[0].items.length, 12);
    assert.equal(hist[1].items.length, 10);
    // many refreezes keep the settings file far below the 1 MB that GitHub returns inline
    for (let v = 0; v < 20; v++) {
      assert.equal((await b.post({ action: 'unfreeze', key: 'k', confirm: 'UNFREEZE' })).ok, true);
      assert.equal((await b.post({ action: 'freeze', key: 'k', k: 12 })).ok, true);
    }
    assert.equal(JSON.parse(b.stateText()).history.length, 22);
    assert.ok(b.stateText().length < 1000000, 'state is ' + b.stateText().length + ' characters');
  });

  t('closing Form A stops new submissions', async () => {
    const b = fresh(kind);
    assert.equal((await b.post({ action: 'setFormA', key: 'k', open: false })).formAOpen, false);
    assert.equal((await b.post({ action: 'submitA', payload: { respondentId: uuid(5), answers: elig } })).ok, false);
    assert.equal((await b.get({ action: 'config' })).formAOpen, false);
  });

  t('test-mode submissions are stored but left out of the analysis', async () => {
    const b = fresh(kind);
    await b.post({ action: 'submitA', payload: { respondentId: uuid(1), test: true, answers: { ...elig, listSafety: ['x'] } } });
    await b.post({ action: 'submitA', payload: { respondentId: uuid(2), answers: { ...elig, listSafety: ['y'] } } });
    const res = await b.post({ action: 'results', key: 'k' });
    assert.equal(res.formA.n, 1);
    assert.equal(res.formA.nTest, 1);
    assert.equal(res.includesTest, false);
    // the researcher can include them to check the forms; the count of tests stays the same
    const withTest = await b.post({ action: 'results', key: 'k', includeTest: true });
    assert.equal(withTest.formA.n, 2);
    assert.equal(withTest.formA.nTest, 1);
    assert.equal(withTest.includesTest, true);
    assert.equal((await b.post({ action: 'results', key: 'k', includeTest: 'yes' })).includesTest, false, 'only a strict true includes them');
  });

  t('the largest possible Form A record is accepted and kept whole', async () => {
    const b = fresh(kind);
    const long = '"'.repeat(2500), short = '"'.repeat(250);     // quotes double in JSON, the worst ordinary case
    const answers = { ...elig, email: '"'.repeat(240) + '@example.org', name: '"'.repeat(100), changedAny: 'yes',
      listAny: Array(12).fill(short), changedSafety: 'yes', storySafety: long, timeSafety: 'dark',
      listSafety: Array(12).fill(short), city: short, modes: ['other'], modesOther: short, unclear: long };
    const pageTimes = Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['page_' + i + '_xxxxxxxxxxxx', 86400000]));
    const body = JSON.stringify({ action: 'submitA', payload: { respondentId: uuid(1), pageTimes, answers } });
    assert.ok(body.length < 200000, 'the request fits the 200,000-character limit: ' + body.length);
    assert.equal((await b.postRaw(body)).ok, true);
    const rec = b.record('A', uuid(1));
    assert.equal(rec.email.length, 252, 'a long but valid address is kept whole');
    assert.equal(rec.answers.listSafety.length, 10, 'at most ten list entries');
    assert.equal(rec.answers.storySafety.length, 2000);
  });

  t('split entries: an entry coded with several codes, and deleting one of them', async () => {
    const b = fresh(kind);
    await b.post({ action: 'submitA', payload: { respondentId: uuid(1), answers: { ...elig, email: mail(1), listSafety: ['Dark and empty', 'shops'] } } });
    await b.post({ action: 'submitA', payload: { respondentId: uuid(2), answers: { ...elig, email: mail(2), listSafety: ['shops', 'dark and empty'] } } });
    const codes = [{ id: 'c_light', label: 'How well lit the road is', description: 'Lights', scope: 'safety' },
      { id: 'c_people', label: 'How many people are around', description: 'People', scope: 'safety' },
      { id: 'c_shops', label: 'How many shops face the road', description: 'Shops', scope: 'safety' }];
    assert.equal((await b.post({ action: 'saveCodes', key: 'k', codes, assignments: [
      { key: 'dark and empty', coder: 1, code: ['c_light', 'c_people'] }, { key: 'shops', coder: 1, code: 'c_shops' }] })).ok, true);
    assert.equal((await b.post({ action: 'saveCodes', key: 'k', assignments: [{ key: 'shops', coder: 1, code: ['c_shops', 'c_shops'] }] })).ok, false, 'same code twice');
    assert.equal((await b.post({ action: 'saveCodes', key: 'k', assignments: [{ key: 'shops', coder: 1, code: ['c_shops', 'c_light', 'c_people', 'c_x'] }] })).ok, false, 'more than 3');
    let res = await b.post({ action: 'results', key: 'k' });
    const by = Object.fromEntries(res.formA.salience.safety.codedRows.map((r) => [r.code, r]));
    // list 1: light(1) people(2) shops(3), L = 3 ; list 2: shops(1) light(2) people(3), L = 3
    // S_light = (3/3 + 2/3)/2 = 5/6 ; S_people = (2/3 + 1/3)/2 = 1/2 ; S_shops = (1/3 + 1)/2 = 2/3
    assert.ok(Math.abs(by.c_light.smithS - 5 / 6) < 1e-12);
    assert.ok(Math.abs(by.c_people.smithS - 1 / 2) < 1e-12);
    assert.ok(Math.abs(by.c_shops.smithS - 2 / 3) < 1e-12);
    assert.equal(res.formA.coding.coverage.split, 1);
    // deleting c_people keeps the entry coded as light
    assert.equal((await b.post({ action: 'saveCodes', key: 'k', deleteCodes: ['c_people'] })).ok, true);
    res = await b.post({ action: 'results', key: 'k' });
    assert.deepEqual(JSON.parse(JSON.stringify(res.formA.coding.entries.find((e) => e.key === 'dark and empty').code1)), ['c_light']);
  });

  t('withdrawal: every response from one email is deleted from the data, in both forms', async () => {
    const b = fresh(kind);
    await b.post({ action: 'submitA', payload: { respondentId: uuid(1), answers: { ...elig, email: 'leave@example.org', listSafety: ['x'] } } });
    await b.post({ action: 'submitA', payload: { respondentId: uuid(2), answers: { ...elig, email: 'Leave@Example.org', listSafety: ['again'] } } });
    await b.post({ action: 'submitA', payload: { respondentId: uuid(3), answers: { ...elig, email: 'stay@example.org', listSafety: ['y'] } } });
    assert.match((await b.post({ action: 'withdraw', key: 'k', email: 'leave@example.org', confirm: 'other@example.org' })).error, /again/, 'needs the address typed twice');
    assert.match((await b.post({ action: 'withdraw', key: 'k', email: 'nobody@example.org', confirm: 'nobody@example.org' })).error, /No response/);
    assert.equal((await b.post({ action: 'withdraw', email: 'leave@example.org', confirm: 'leave@example.org' })).ok, false, 'needs the researcher key');
    const out = await b.post({ action: 'withdraw', key: 'k', email: ' LEAVE@example.org ', confirm: 'leave@example.org' });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.removed, 2);
    assert.equal(b.count('A'), 1);
    const res = await b.post({ action: 'results', key: 'k' });
    assert.deepEqual(res.respondents.map((r) => r.email), ['stay@example.org']);
  });
}

// ---------------------------------------------------------------- GitHub-specific behaviour

test('[github store] the token never appears in what the browser sees, and errors name the setting to fix', async () => {
  const repo = mock.createRepo('errors', true);
  const bad = createApp({ store: githubStore({ token: 'wrong-token', repo: 'o/' + repo.name, apiBase: mock.base, sleep: () => Promise.resolve() }), researcherKey: 'k', wrongKeyDelay: 0 });
  const r1 = await bad.post(JSON.stringify({ action: 'results', key: 'k' }));
  assert.equal(r1.ok, false);
  assert.match(r1.error, /GITHUB_TOKEN/);
  await assert.rejects(bad.get({ action: 'config' }), /GITHUB_TOKEN/);
  const lost = createApp({ store: githubStore({ token: mock.token, repo: 'o/does-not-exist', apiBase: mock.base, sleep: () => Promise.resolve() }), researcherKey: 'k', wrongKeyDelay: 0 });
  const r2 = await lost.post(JSON.stringify({ action: 'results', key: 'k' }));
  assert.match(r2.error, /data repository o\/does-not-exist was not found/);
  const good = createApp({ store: githubStore({ token: mock.token, repo: 'o/' + repo.name, apiBase: mock.base }), researcherKey: 'k', wrongKeyDelay: 0 });
  const cfg = await good.get({ action: 'config' });
  assert.ok(!JSON.stringify(cfg).includes(mock.token));
});

test('[github store] two submissions at the same moment: a clashing commit is retried, nothing is lost', async () => {
  const repo = mock.createRepo('clash', true);
  const store = githubStore({ token: mock.token, repo: 'o/' + repo.name, apiBase: mock.base, sleep: () => Promise.resolve() });
  const app = createApp({ store, researcherKey: 'k', wrongKeyDelay: 0 });
  repo.faults.put409 = 3;
  const outs = await Promise.all([1, 2, 3, 4].map((n) => app.post(JSON.stringify({ action: 'submitA', payload: { respondentId: uuid(n), answers: { ...elig, email: mail(n) } } }))));
  assert.ok(outs.every((o) => o.ok === true), JSON.stringify(outs));
  assert.equal(fs.readdirSync(path.join(repo.dir, 'responses', 'A')).length, 4);
  // a stale settings version is refused rather than overwriting someone else's change
  const { version } = await store.readState();
  await store.writeState({ config: { formAOpen: true } }, version, 'first');
  await assert.rejects(store.writeState({ config: { formAOpen: false } }, version, 'second, from stale data'), /changed somewhere else/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo.dir, 'state.json'), 'utf8')).config.formAOpen, true);
});

test('[github store] every response file and every settings change is its own commit (an audit trail)', async () => {
  const repo = mock.createRepo('audit', false);
  const app = createApp({ store: githubStore({ token: mock.token, repo: 'o/' + repo.name, apiBase: mock.base }), researcherKey: 'k', wrongKeyDelay: 0 });
  await app.post(JSON.stringify({ action: 'submitA', payload: { respondentId: uuid(1), answers: { ...elig } } }));
  await app.post(JSON.stringify({ action: 'setFormA', key: 'k', open: false }));
  const log = require('child_process').execFileSync('git', ['log', '--format=%s'], { cwd: repo.dir }).toString().trim().split('\n');
  assert.deepEqual(log, ['Close Form A', 'Form A response 00000000']);
  assert.ok(!log.join(' ').includes('@'), 'no email in any commit message');
});

// ---------------------------------------------------------------- Vercel Blob-specific behaviour

test('[blob store] the free allowance: one listing per analysis, each response read once, public settings from the cache', async () => {
  const fake = createBlobFake();
  let clock = 0;
  const app = createApp({ store: blobStore({ sdk: fake.sdk, sleep: noWait, now: () => clock }), researcherKey: 'k', wrongKeyDelay: 0 });
  const b = { post: (obj) => app.post(JSON.stringify(obj)) };
  await submitFormA(b, 30);
  // a submission is one upload, plus one read of the settings to check that the form is still open
  assert.deepEqual({ advanced: fake.ops.advanced, simple: fake.ops.simple }, { advanced: 30, simple: 30 });
  const results = async () => assert.equal((await b.post({ action: 'results', key: 'k' })).formA.n, 30);
  await results();
  assert.deepEqual({ advanced: fake.ops.advanced, simple: fake.ops.simple }, { advanced: 31, simple: 60 }, 'one listing, and each response downloaded once');
  for (let i = 0; i < 9; i++) await results();
  assert.deepEqual({ advanced: fake.ops.advanced, simple: fake.ops.simple }, { advanced: 31, simple: 60 }, 'refreshes within 20 s reuse the listing');
  for (let i = 0; i < 10; i++) { clock += 60000; await results(); }
  assert.deepEqual({ advanced: fake.ops.advanced, simple: fake.ops.simple }, { advanced: 41, simple: 60 }, 'later refreshes list again but never download a response twice');
  const before = fake.ops.simple;
  for (let i = 0; i < 20; i++) await app.get({ action: 'config' });
  assert.ok(fake.ops.simple - before <= 1, 'with no settings saved yet, twenty form openings cost at most one read: ' + (fake.ops.simple - before));
  await app.post(JSON.stringify({ action: 'setFormA', key: 'k', open: true }));
  const mid = fake.ops.simple;
  for (let i = 0; i < 20; i++) await app.get({ action: 'config' });
  assert.ok(fake.ops.simple - mid <= 1, 'twenty form openings cost at most one uncached read: ' + (fake.ops.simple - mid));
});

test('[blob store] a listing older than 20 seconds is refreshed, so other instances’ responses appear', async () => {
  const fake = createBlobFake();
  let clock = 1000;
  const store = blobStore({ sdk: fake.sdk, sleep: noWait, now: () => clock });
  const app = createApp({ store, researcherKey: 'k', wrongKeyDelay: 0 });
  await app.post(JSON.stringify({ action: 'submitA', payload: { respondentId: uuid(1), answers: { ...elig, email: mail(1) } } }));
  assert.equal((await app.post(JSON.stringify({ action: 'results', key: 'k' }))).formA.n, 1);
  // another server instance saves a response directly
  await fake.sdk.put('responses/A/' + uuid(2) + '.json', JSON.stringify({ form: 'A', id: uuid(2), email: mail(2), receivedAt: new Date().toISOString(), answers: { ...elig, listAny: [], listSafety: [] }, pageTimes: {} }), { access: 'private' });
  assert.equal((await app.post(JSON.stringify({ action: 'results', key: 'k' }))).formA.n, 1, 'within 20 s the earlier listing is reused');
  clock += 21000;
  assert.equal((await app.post(JSON.stringify({ action: 'results', key: 'k' }))).formA.n, 2);
});

test('[blob store] duplicates, a busy service, and settings changed elsewhere', async () => {
  const fake = createBlobFake();
  const store = blobStore({ sdk: fake.sdk, sleep: noWait });
  const app = createApp({ store, researcherKey: 'k', wrongKeyDelay: 0 });
  const p = { respondentId: uuid(1), answers: { ...elig } };
  fake.faults.rateLimitNextPut = 1;
  assert.equal((await app.post(JSON.stringify({ action: 'submitA', payload: p }))).ok, true, 'one retry after a rate limit');
  assert.equal((await app.post(JSON.stringify({ action: 'submitA', payload: p }))).duplicate, true);
  assert.equal(Array.from(fake.files.keys()).filter((k) => k.startsWith('responses/')).length, 1);
  const { version } = await store.readState();
  await store.writeState({ config: { formAOpen: true } }, version, 'first');
  await assert.rejects(store.writeState({ config: { formAOpen: false } }, version, 'from stale settings'), /changed somewhere else/);
  const now = await store.readState();
  await store.writeState({ config: { formAOpen: false } }, now.version, 'from fresh settings');
  assert.equal(JSON.parse(fake.files.get('state.json').body).config.formAOpen, false);
  for (const [p2, f] of fake.files) assert.ok(!p2.startsWith('responses/') || f.contentType === 'application/json');
});

test('[blob store] errors from Vercel are explained', async () => {
  const sdk = { list: async () => { const e = new Error('x'); e.name = 'BlobStoreSuspendedError'; throw e; } };
  const app = createApp({ store: blobStore({ sdk, sleep: noWait }), researcherKey: 'k', wrongKeyDelay: 0 });
  assert.match((await app.post(JSON.stringify({ action: 'results', key: 'k' }))).error, /suspended.*allowance/);
});

// ---------------------------------------------------------------- the Vercel entry point

function vercelRequest(method, url, body, headers) {
  const { Readable } = require('stream');
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method; req.url = url; req.headers = Object.assign({ host: 'thesisresearch.vercel.app' }, headers || {});
  if (method === 'GET') req.query = Object.fromEntries(new URL(url, 'http://x').searchParams);
  if (body !== undefined) req.body = body;           // Vercel hands text/plain bodies over as a string
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(s) { this.body = s; } };
  return { req, res };
}
async function callVercel(handler, method, url, body, headers) {
  const { req, res } = vercelRequest(method, url, body, headers);
  await handler(req, res);
  return { status: res.statusCode, headers: res.headers, json: JSON.parse(res.body) };
}
const ENV_KEYS = ['GITHUB_TOKEN', 'RESEARCHER_KEY', 'DATA_REPO', 'BLOB_STORE_ID', 'BLOB_READ_WRITE_TOKEN', 'VERCEL_BRANCH_URL', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL'];
function freshHandler(env, blobSdk) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; });
  const sdkPath = require.resolve('@vercel/blob');
  const savedSdk = require.cache[sdkPath];
  if (blobSdk) require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: blobSdk };
  delete require.cache[require.resolve('../api/index.js')];
  const handler = require('../api/index.js');
  return { handler, restore: () => {
    ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
    if (savedSdk) require.cache[sdkPath] = savedSdk; else delete require.cache[sdkPath];
  } };
}

test('[vercel] with no storage connected the function says so, and refuses to save', async () => {
  const { handler, restore } = freshHandler({ RESEARCHER_KEY: 'short' });
  try {
    const cfg = await callVercel(handler, 'GET', '/api?action=config');
    assert.equal(cfg.json.ok, true);
    assert.equal(cfg.json.configured, false);
    assert.deepEqual(cfg.json.missing, ['a private Vercel Blob store connected to the project']);
    assert.equal(cfg.headers['cache-control'], 'no-store');
    const sub = await callVercel(handler, 'POST', '/api', JSON.stringify({ action: 'submitA', payload: {} }));
    assert.equal(sub.json.ok, false);
    assert.match(sub.json.error, /not connected/);
    assert.equal((await callVercel(handler, 'PUT', '/api')).status, 405);
  } finally { restore(); }
});

const PROD = 'thesisresearch.vercel.app', BRANCH = 'thesisresearch-git-main-owner.vercel.app', DEPLOY = 'thesisresearch-abc123-owner.vercel.app';
const blobEnv = { BLOB_STORE_ID: 'store_test', VERCEL_BRANCH_URL: BRANCH, VERCEL_URL: DEPLOY, VERCEL_PROJECT_PRODUCTION_URL: PROD };
/** Stands in for the function asking its own private address whether Vercel's sign-in protects it. */
function withProtection(answer, fn) {
  const real = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).startsWith('https://' + BRANCH + '/api?action=ping')) {
      if (answer === 'error') throw new Error('network down');
      return answer === 'on' ? new Response('', { status: 302, headers: { location: 'https://vercel.com/sso-api?url=x' } }) : new Response('{"ok":true}', { status: 200 });
    }
    return real(url, init);
  };
  return fn().finally(() => { global.fetch = real; });
}

test('[vercel] Blob storage: the public address saves answers but never opens analytics; the signed-in private address does', async () => {
  const fake = createBlobFake();
  const { handler, restore } = freshHandler(blobEnv, fake.sdk);
  try {
    await withProtection('on', async () => {
      const pub = await callVercel(handler, 'GET', '/api?action=config');
      assert.equal(pub.json.configured, true);
      assert.equal(pub.json.researcher, 'private-address');
      assert.equal(pub.json.researcherUrl, 'https://' + BRANCH + '/analytics.html');
      const sub = await callVercel(handler, 'POST', '/api', JSON.stringify({ action: 'submitA', payload: { respondentId: uuid(1), answers: { ...elig } } }), { origin: 'https://' + PROD });
      assert.equal(sub.json.ok, true, JSON.stringify(sub.json));
      assert.ok(fake.files.has('responses/A/' + uuid(1) + '.json'));
      const results = (headers) => callVercel(handler, 'POST', '/api', JSON.stringify({ action: 'results' }), headers);
      assert.match((await results({ origin: 'https://' + PROD })).json.error, /private address/, 'never from the public address');
      assert.equal((await results({ host: PROD, 'x-forwarded-host': BRANCH, origin: 'https://' + BRANCH })).json.ok, false, 'a forwarded-host header does not count');
      assert.equal((await results({ host: BRANCH })).json.ok, false, 'no Origin header: refused (another site could have sent it)');
      assert.equal((await results({ host: BRANCH, origin: 'https://evil.example' })).json.ok, false, 'from another site: refused');
      const ok = await results({ host: BRANCH, origin: 'https://' + BRANCH });
      assert.equal(ok.json.ok, true, JSON.stringify(ok.json));
      assert.equal(ok.json.formA.n, 1);
      assert.equal(ok.json.respondents[0].email, mail(0));
      assert.equal((await results({ host: DEPLOY, origin: 'https://' + DEPLOY })).json.ok, true, 'the deployment’s own address is protected too');
      assert.equal((await callVercel(handler, 'GET', '/api?action=config', undefined, { host: BRANCH })).json.researcher, 'signed-in');
    });
  } finally { restore(); }
});

test('[vercel] if Vercel’s sign-in protection is off, or cannot be checked, the private address is not trusted', async () => {
  for (const answer of ['off', 'error']) {
    const { handler, restore } = freshHandler(blobEnv, createBlobFake().sdk);
    try {
      await withProtection(answer, async () => {
        const r = await callVercel(handler, 'POST', '/api', JSON.stringify({ action: 'results' }), { host: BRANCH, origin: 'https://' + BRANCH });
        assert.equal(r.json.ok, false, answer);
      });
    } finally { restore(); }
  }
});

test('[vercel] a researcher key, if set, works from the public address too', async () => {
  const { handler, restore } = freshHandler({ ...blobEnv, RESEARCHER_KEY: 'a-long-researcher-key' }, createBlobFake().sdk);
  try {
    assert.equal((await callVercel(handler, 'GET', '/api?action=config')).json.researcher, 'key');
    assert.equal((await callVercel(handler, 'POST', '/api', JSON.stringify({ action: 'results', key: 'wrong' }))).json.ok, false);
    assert.equal((await callVercel(handler, 'POST', '/api', JSON.stringify({ action: 'results', key: 'a-long-researcher-key' }))).json.ok, true);
  } finally { restore(); }
});

test('[vercel] GitHub storage instead, when a GitHub token is set', async () => {
  const repo = mock.createRepo('vercel', true);
  const realFetch = global.fetch;
  // send the function's calls to api.github.com to the stand-in instead
  global.fetch = (url, init) => realFetch(String(url).replace('https://api.github.com', mock.base), init);
  const { handler, restore } = freshHandler({ GITHUB_TOKEN: mock.token, RESEARCHER_KEY: 'a-long-researcher-key', DATA_REPO: 'o/' + repo.name });
  try {
    assert.equal((await callVercel(handler, 'GET', '/api?action=config')).json.configured, true);
    const sub = await callVercel(handler, 'POST', '/api', JSON.stringify({ action: 'submitA', payload: { respondentId: uuid(1), answers: { ...elig } } }));
    assert.equal(sub.json.ok, true, JSON.stringify(sub.json));
    assert.ok(fs.existsSync(path.join(repo.dir, 'responses', 'A', uuid(1) + '.json')));
    assert.equal((await callVercel(handler, 'POST', '/api', JSON.stringify({ action: 'results', key: 'wrong' }))).json.ok, false);
    const res = await callVercel(handler, 'POST', '/api', JSON.stringify({ action: 'results', key: 'a-long-researcher-key' }));
    assert.equal(res.json.formA.n, 1);
    assert.equal(res.json.respondents[0].email, mail(0));
  } finally { restore(); global.fetch = realFetch; }
});
