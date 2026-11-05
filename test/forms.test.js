'use strict';
// Checks that the wording file (docs/assets/questions.js) and the server
// validation (backend/Engine.gs) agree on every answer value and field, and
// that the question order keeps the methodological rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const E = require('../backend/engine');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/assets/questions.js'), 'utf8'), ctx);
const Q = ctx.window.QUESTIONS;

const groupOf = {
  consent: null, gender: 'gender', age: 'age', roads: 'yesNo', modes: 'modes', company: 'company', area: 'area',
  changedAny: 'yesNoUnsure', changedSafety: 'yesNoUnsure', timeSafety: 'timeOfDay'
};
const textFields = ['email', 'name', 'city', 'storySafety', 'unclear', 'unclearItems', 'missingItems'];
const listFields = ['listAny', 'listSafety'];
const identity = { email: 'someone@example.org' };

// arrays created inside the vm sandbox have another prototype; compare plain copies
const plain = (x) => JSON.parse(JSON.stringify(x));
function questionsOf(pages) { return pages.flatMap((p) => p.questions.map((q) => ({ page: p.id, q }))); }
const pagesA = Q.formA.pages;
const pagesB = [Q.formB.consent, Q.formB.eligibility, Q.formB.travel, Q.formB.debrief];
const textOf = (pages) => JSON.stringify(pages.map((p) => [p.title, p.intro, p.note, p.questions.map((q) => [q.prompt, q.help, q.paragraphs, q.nothingLabel, (q.options || []).map((o) => o.label)])])).toLowerCase();

test('every choice question uses exactly the values the server accepts', () => {
  for (const { q } of questionsOf(pagesA.concat(pagesB))) {
    if (q.type !== 'single' && q.type !== 'multi') continue;
    assert.ok(q.id in groupOf, 'unknown field ' + q.id);
    const values = plain(q.options.map((o) => o.v));
    if (groupOf[q.id] === null) { assert.deepEqual(values, ['yes', 'no']); continue; }
    assert.deepEqual(values.slice().sort(), plain(E.OPTIONS[groupOf[q.id]]).sort(), q.id);
  }
});

test('every field the server stores is asked somewhere, and nothing else is asked', () => {
  const asked = new Set(questionsOf(pagesA.concat(pagesB)).map(({ q }) => q.id).filter(Boolean));
  const expected = Object.keys(groupOf).concat(textFields, listFields);
  for (const f of expected) assert.ok(asked.has(f), 'not asked: ' + f);
  for (const f of asked) assert.ok(expected.includes(f), 'asked but not stored: ' + f);
  // and the server keeps each Form A field: the email and name beside the answers, everything else in them
  const rec = E.validateA({ respondentId: '00000000-0000-4000-8000-000000000001', answers: { consent: 'yes', gender: 'woman', age: '18_24', roads: 'yes', ...identity } }, 0).record;
  for (const { q } of questionsOf(pagesA)) if (q.id) assert.ok(q.id in (q.id in identity || q.id === 'name' ? rec : rec.answers), 'Form A field not stored: ' + q.id);
  assert.ok(!('email' in rec.answers) && !('name' in rec.answers), 'the email and name are kept out of the answers');
});

test('email: required on the same page as the screening questions, after them, and checked the same way in the form and on the server', () => {
  for (const pages of [pagesA, pagesB]) {
    const elig = pages.find((p) => p.id === 'elig');
    const ids = elig.questions.map((q) => q.id);
    assert.deepEqual(plain(ids), ['gender', 'age', 'roads', 'email', 'name'], 'screened-out women are never asked for an email');
    const email = elig.questions.find((q) => q.id === 'email'), name = elig.questions.find((q) => q.id === 'name');
    assert.equal(email.type, 'email'); assert.equal(email.required, true);
    assert.ok(!name.required && name.optionalLabel, 'the name is optional');
  }
  const sctx = { window: {} };
  vm.createContext(sctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/assets/survey.js'), 'utf8'), sctx);
  assert.equal(sctx.window.Survey.EMAIL_RE.source, E.EMAIL_RE.source, 'the form and the server use one email pattern');
  for (const ok of ['a@b.co', 'first.last+tag@mail.example.ac.in', 'Name@Example.COM']) assert.ok(E.EMAIL_RE.test(ok), ok);
  for (const bad of ['', 'a', 'a@b', 'a@b.', 'a@.com', 'a b@c.com', 'a@b..com', '@b.com', 'a@@b.com']) assert.ok(!E.EMAIL_RE.test(bad), bad);
});

test('the consent page names the email, who sees it, its deletion and how to withdraw', () => {
  for (const page of [Q.formA.pages[0], Q.formB.consent]) {
    assert.match(page.title, /consent/i);
    const text = page.questions[0].paragraphs.join(' ').toLowerCase();
    for (const must of ['voluntary', 'email address', 'name is optional', 'only the researcher', 'never shared', 'deleted', 'removed', 'group results']) {
      assert.ok(text.includes(must), 'consent says "' + must + '"');
    }
    assert.ok(!/do not ask for your name/.test(text), 'no leftover promise of anonymity');
  }
});

test('page ids are valid timing keys and unique', () => {
  const ids = pagesA.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids.concat(pagesB.map((p) => p.id), ['practice', 'set0', 'set15'])) assert.match(id, /^[A-Za-z0-9_]{1,24}$/);
});

test('ineligible answers end the survey, matching the server rule', () => {
  const ends = (field) => plain(Q.options[field].filter((o) => o.end).map((o) => o.v)).sort();
  assert.deepEqual(ends('gender'), ['man', 'nonbinary', 'prefer_not']);
  assert.deepEqual(ends('age'), ['under18']);
  assert.deepEqual(ends('roads'), ['no']);
  assert.deepEqual(ends('consent'), ['no']);
});

test('funnel order: nothing before the safety block mentions safety or a threat, consent included', () => {
  const iList = pagesA.findIndex((p) => p.id === 'list'), iSafety = pagesA.findIndex((p) => p.id === 'safety');
  assert.ok(iList >= 0 && iList < iSafety);
  assert.equal(pagesA[iSafety].lockBack, true, 'the safety block cannot go back to Block 1');
  const before = textOf(pagesA.slice(0, iSafety));
  for (const w of E.THREAT_WORDS.concat(E.CRITERION_WORDS, ['frighten', 'harm', 'incident', 'secur'])) {
    assert.ok(!new RegExp('(^|[^a-z])' + w).test(before), 'Block 1 or the consent contains "' + w + '"');
  }
  assert.ok(textOf([pagesA[iSafety]]).includes('safe'), 'the safety block discloses its topic');
  assert.ok(/safety/.test(Q.formA.debrief), 'the debrief explains the order');
});

test('no secret is in the repository: no GitHub token, and the researcher key only as the local dev key', () => {
  const files = require('child_process').execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: path.join(__dirname, '..') }).toString().trim().split('\n');
  for (const f of files) {
    const p = path.join(__dirname, '..', f);
    if (!fs.existsSync(p) || fs.statSync(p).size > 2e6) continue;
    const text = fs.readFileSync(p, 'utf8');
    assert.ok(!/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/.test(text), f + ' contains something that looks like a GitHub token');
    // the tests set made-up keys for the code they test; nothing else may set one
    if (!f.startsWith('test/')) assert.ok(!/RESEARCHER_KEY\s*[:=]\s*['"][^'"]{16,}/.test(text), f + ' sets a researcher key');
  }
});

test('the home page, where Back on the first page can lead, says nothing about safety either', () => {
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  const text = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  for (const w of E.THREAT_WORDS.concat(E.CRITERION_WORDS, ['frighten', 'harm', 'incident', 'secur'])) {
    assert.ok(!new RegExp('(^|[^a-z])' + w).test(text), 'index.html contains "' + w + '"');
  }
});

test('the preview copy of Form B uses the backend\'s own design and items that pass the wording check', () => {
  const pctx = { window: {} };
  vm.createContext(pctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/assets/preview.js'), 'utf8'), pctx);
  const fb = plain(pctx.window.PREVIEW_CONFIG.formB);
  assert.equal(fb.items.length, 12);
  assert.equal(new Set(fb.items.map((i) => i.label)).size, 12, 'labels are unique');
  assert.deepEqual(fb.sets, plain(E.cyclicDesign(12, 4).sets));
  for (const it of fb.items) {
    assert.ok(it.description, it.label + ' has a description');
    assert.deepEqual(plain(E.wordingProblems(it.label + ' ' + it.description)), [], it.label);
  }
});

test('the travel profile (alone or with others) is asked after both blocks', () => {
  const iTravel = pagesA.findIndex((p) => p.id === 'travel'), iSafetyList = pagesA.findIndex((p) => p.id === 'safetyList');
  assert.ok(iTravel > iSafetyList);
  assert.equal(pagesA[pagesA.length - 1].id, 'debrief');
});

test('the two episode questions ask the same thing, with any reason and with safety as the reason', () => {
  const qs = questionsOf(pagesA).map(({ q }) => q);
  const any = qs.find((q) => q.id === 'changedAny').prompt, safety = qs.find((q) => q.id === 'changedSafety').prompt;
  for (const p of [any, safety]) assert.match(p, /In the last 12 months, was there a time when .* (chose|choose) a different road.* or decided? not to use a road/);
  assert.match(safety, /safe or unsafe/, 'both directions (R4)');
  assert.deepEqual(plain(Q.options.timeOfDay.map((o) => o.v)), ['day', 'dawn_dusk', 'dark', 'dont_remember'], 'times in the order of the day');
});

test('no question asks what she did or what would fix the road: the study is about what changes the choice', () => {
  const all = textOf(pagesA.concat(pagesB));
  for (const w of ['what did you do', 'what would', 'improve', 'make it better', 'should be done', 'anything else']) assert.ok(!all.includes(w), 'asks "' + w + '"');
  const ids = questionsOf(pagesA.concat(pagesB)).map(({ q }) => q.id);
  for (const gone of ['actionsAny', 'actionsSafety', 'storyAny', 'afterDark', 'anythingElse', 'frequency', 'tookPartBefore']) assert.ok(!ids.includes(gone), gone + ' was removed');
});

test('Form B uses one identical criterion in every set, and its practice items are unrelated', () => {
  assert.ok(/safe enough/.test(Q.formB.stem));
  const practice = plain(Q.formB.practice.items.map((i) => i.label.toLowerCase())).join(' ');
  assert.ok(!/safe|light|people|police|shop/.test(practice));
  assert.ok(!/first to mind/.test(Q.formB.instructions.join(' ')), 'no tie-break cue that could read as "the first one on screen"');
});
