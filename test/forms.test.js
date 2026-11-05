'use strict';
// Checks that the wording file (docs/assets/questions.js) and the server
// validation (backend/Engine.gs) agree on every answer value and field, and
// that the question order keeps the methodological rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadEngine } = require('../dev/gas-mock');

const E = loadEngine();
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/assets/questions.js'), 'utf8'), ctx);
const Q = ctx.window.QUESTIONS;

const groupOf = {
  consent: null, gender: 'gender', age: 'age', roads: 'yesNo', modes: 'modes', frequency: 'frequency', company: 'company', area: 'area',
  changedAny: 'yesNoUnsure', actionsAny: 'actions', changedSafety: 'yesNoUnsure', actionsSafety: 'actions', timeSafety: 'timeOfDay', tookPartBefore: 'yesNoUnsure'
};
const textFields = ['city', 'storyAny', 'storySafety', 'afterDark', 'anythingElse', 'unclear', 'unclearItems', 'missingItems'];
const listFields = ['listAny', 'listSafety'];

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
  // and the server keeps each Form A field
  const rec = E.validateA({ respondentId: '00000000-0000-4000-8000-000000000001', answers: { consent: 'yes', gender: 'woman', age: '18_24', roads: 'yes' } }, 0).record.answers;
  for (const { q } of questionsOf(pagesA)) if (q.id) assert.ok(q.id in rec, 'Form A field not stored: ' + q.id);
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

test('follow-up actions only describe a change, matching the filter questions', () => {
  const labels = plain(Q.options.actions.map((o) => o.label.toLowerCase()));
  assert.ok(!labels.some((l) => /anyway/.test(l)), '"used the road anyway" contradicts "changed your choice"');
  assert.deepEqual(plain(Q.options.timeOfDay.map((o) => o.v)), ['day', 'dawn_dusk', 'dark', 'dont_remember'], 'times in the order of the day');
});

test('Form B uses one identical criterion in every set, and its practice items are unrelated', () => {
  assert.ok(/safe enough/.test(Q.formB.stem));
  const practice = plain(Q.formB.practice.items.map((i) => i.label.toLowerCase())).join(' ');
  assert.ok(!/safe|light|people|police|shop/.test(practice));
  assert.ok(!/first to mind/.test(Q.formB.instructions.join(' ')), 'no tie-break cue that could read as "the first one on screen"');
});
