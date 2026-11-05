'use strict';
/**
 * End-to-end dry run with SIMULATED respondents (not real data).
 * Sends Form A responses to a running local server, codes them the way a
 * researcher would, freezes the top 12, sends Form B responses generated
 * from known "true" utilities, and checks the live ranking recovers them.
 *
 *   STORE=dev/data/sim.json npm run dev      (terminal 1)
 *   npm run simulate                          (terminal 2)
 */
const BASE = process.env.BASE || 'http://localhost:8787';
const KEY = process.env.KEY || 'dev-key';
const NA = Number(process.env.NA || 40), NB = Number(process.env.NB || 60);

// latent parameters: [code id, label, description, scope, how often women list it, synonyms people write]
const P = [
  ['light', 'How well lit the road is', 'Street lights or other light on the road', 'safety', 0.85, ['dark street', 'no street lights', 'Poor lighting', 'andhera', 'lights not working']],
  ['people', 'How many other people are on the road', 'Walkers, riders and people waiting', 'safety', 0.7, ['empty road', 'no one around', 'crowd', 'Deserted']],
  ['groups', 'Whether groups of people are standing around', 'Groups standing or sitting along the road', 'safety', 0.55, ['groups of men', 'men standing', 'loitering boys']],
  ['shops', 'How many shops or homes face the road', 'Whether buildings face the road or it runs along empty land', 'safety', 0.5, ['shops open', 'no shops', 'houses nearby']],
  ['police', 'Whether police or security staff are visible', 'Uniformed staff or a police post nearby', 'safety', 0.45, ['police', 'no police', 'security guard']],
  ['known', 'How well you know the road', 'Whether you have used it before', 'safety', 0.4, ['familiar road', 'new road', 'I know the road']],
  ['view', 'How clearly you can see ahead and around', 'Open view, or blind corners and walls', 'safety', 0.35, ['blind corner', 'can see far', 'narrow lane']],
  ['exit', 'How easily you could leave the road', 'Side lanes, shops or exits you could step into', 'safety', 0.3, ['no way out', 'side lanes']],
  ['mix', 'The mix of men and women on the road', 'Whether the people nearby are mostly women, mostly men or mixed', 'safety', 0.3, ['other women around', 'only men']],
  ['heard', 'What you have heard about the road', 'From family, friends, news or social media', 'safety', 0.25, ['heard bad things', 'news about it']],
  ['transport', 'How close public transport is', 'Bus stops, autos or a metro station nearby', 'safety', 0.2, ['auto available', 'bus stop near']],
  ['cctv', 'Whether there are cameras', 'CCTV cameras on the road or shops', 'safety', 0.18, ['cctv', 'cameras']],
  ['water', 'Whether the road is flooded or blocked', 'Water, digging, parked vehicles or construction', 'safety', 0.12, ['waterlogging', 'construction']],
  ['network', 'Whether your phone has signal', 'Mobile network for calls and maps', 'safety', 0.1, ['no network']],
  ['traffic', 'How much traffic there is', 'Cars, bikes and trucks', 'other', 0.3, ['traffic', 'too many trucks']]
];
// "true" utilities for every safety parameter that could reach Form B
const TRUE_U = { light: 1.1, people: 0.9, groups: 0.7, mix: 0.45, police: 0.35, shops: 0.2, view: 0.05, exit: 0.0, known: -0.1,
  transport: -0.3, heard: -0.6, cctv: -0.8, water: -0.9, network: -1.0 };

let seed = 20261105;
const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];
// Fisher-Yates, as the form does (sorting by a random key is a biased shuffle)
const shuffle = (a) => { const b = a.slice(); for (let j = b.length - 1; j > 0; j--) { const k = Math.floor(rand() * (j + 1)); [b[j], b[k]] = [b[k], b[j]]; } return b; };
const uuid = () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(rand() * 16).toString(16));
const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

async function post(body) {
  const r = await fetch(BASE + '/api', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(body.action + ': ' + j.error);
  return j;
}
async function get(action) { return (await fetch(BASE + '/api?action=' + action)).json(); }

function profile() {
  return { consent: 'yes', gender: 'woman', age: pick(['18_24', '18_24', '25_34', '35_44']), roads: 'yes',
    modes: [pick(['foot', 'bus', 'auto_taxi', 'train_metro', 'twowheeler'])], frequency: pick(['daily', 'few_week']), company: pick(['alone', 'both', 'others']), area: pick(['dense_city', 'residential', 'campus']) };
}
function freeList(safetyOnly) {
  const out = [];
  P.forEach((p) => { if ((!safetyOnly || p[3] === 'safety') && rand() < p[4]) out.push({ p, w: rand() / p[4] }); });
  out.sort((a, b) => a.w - b.w);
  const words = out.slice(0, 7).map((x) => pick(x.p[5]));
  // some women write two things in one box; the researcher splits these into two codes
  const iL = out.findIndex((x) => x.p[0] === 'light'), iP = out.findIndex((x) => x.p[0] === 'people');
  if (iL >= 0 && iP === iL + 1 && iP < 7 && rand() < 0.5) words.splice(iL, 2, 'dark and empty');
  return words;
}

(async () => {
  console.log('SIMULATION ONLY: synthetic respondents, not real data.');
  for (let i = 0; i < NA; i++) {
    const changedAny = rand() < 0.7 ? 'yes' : pick(['no', 'not_sure']);
    const changedSafety = rand() < 0.75 ? 'yes' : pick(['no', 'not_sure']);
    const fast = i % 13 === 5;   // a few respondents who rush every page
    const t = (ms) => Math.round((fast ? 0.25 : 1) * ms * (0.7 + 0.6 * rand()));
    await post({ action: 'submitA', payload: { formVersion: 'A-2.0', respondentId: uuid(), startedAt: new Date().toISOString(),
      pageTimes: { consent: t(12000), elig: t(9000), change: t(6000), list: t(55000), safety: t(7000), safetyList: t(65000), more: t(8000), travel: t(15000), debrief: t(6000) },
      answers: { ...profile(), changedAny, storyAny: changedAny === 'yes' ? 'The lane was narrow and there was nobody else walking.' : '', actionsAny: changedAny === 'yes' ? ['other_road'] : [],
        listAny: freeList(false), changedSafety, actionsSafety: changedSafety === 'yes' ? [pick(['other_road', 'with_someone', 'other_transport'])] : [],
        timeSafety: changedSafety === 'yes' ? pick(['dark', 'day', 'dawn_dusk']) : null,
        listSafety: freeList(true), afterDark: rand() < 0.3 ? 'Lighting matters more after dark' : '' } } });
  }
  console.log('Form A: sent', NA);

  // researcher coding (here: the known mapping from synonyms to parameters)
  const codes = P.map((p) => ({ id: 'c_' + p[0], label: p[1], description: p[2], scope: p[3] }));
  const assignments = [];
  P.forEach((p) => p[5].forEach((w) => {
    assignments.push({ key: norm(w), coder: 1, code: 'c_' + p[0] });
    if (rand() < 0.9) assignments.push({ key: norm(w), coder: 2, code: 'c_' + p[0] });
  }));
  assignments.push({ key: 'dark and empty', coder: 1, code: ['c_light', 'c_people'] }, { key: 'dark and empty', coder: 2, code: ['c_people', 'c_light'] });
  await post({ action: 'saveCodes', key: KEY, codes, assignments });
  const fr = await post({ action: 'freeze', key: KEY, k: 12 });
  console.log('Frozen items:', fr.freeze.items.map((x) => x.label).join(' | '));

  const cfg = await get('config');
  const items = cfg.formB.items.map((it) => P.find((p) => p[1] === it.label)[0]);
  items.forEach((c) => { if (!(c in TRUE_U)) throw new Error('No true utility for ' + c); });
  for (let r = 0; r < NB; r++) {
    const bws = cfg.formB.sets.map((set, s) => {
      const shown = shuffle(set);
      const pairs = []; let z = 0;
      shown.forEach((i) => shown.forEach((j) => { if (i !== j) { const w = Math.exp(TRUE_U[items[i]] - TRUE_U[items[j]]); pairs.push([i, j, w]); z += w; } }));
      let x = rand() * z, ch = pairs[pairs.length - 1];
      for (const p of pairs) { x -= p[2]; if (x <= 0) { ch = p; break; } }
      return { set: s, shown, best: ch[0], worst: ch[1], ms: 4000 + Math.round(rand() * 8000) };
    });
    const pt = { consent: 7000, elig: 8000, practice: 15000, travel: 14000, debrief: 6000 };
    bws.forEach((b) => { pt['set' + b.set] = b.ms; });
    await post({ action: 'submitB', payload: { formVersion: 'B-2.0', respondentId: uuid(), designVersion: cfg.formB.designVersion, startedAt: new Date().toISOString(),
      pageTimes: pt, answers: { ...profile(), tookPartBefore: pick(['no', 'no', 'no', 'not_sure']) }, bws } });
  }
  console.log('Form B: sent', NB);

  const res = await post({ action: 'results', key: KEY });
  const truthOrder = items.map((c, i) => ({ i, u: TRUE_U[c] })).sort((a, b) => b.u - a.u).map((x) => x.i);
  console.log('\nRank  estimated (weight, 95% interval)                        true rank');
  res.formB.ranking.forEach((row) => {
    const tr = truthOrder.indexOf(row.item) + 1;
    console.log(String(row.rank).padStart(4), ' ', (row.label + ' ').padEnd(50, '.'), (100 * row.weight).toFixed(1).padStart(5) + '%',
      '[' + (100 * row.weightLo).toFixed(1) + ', ' + (100 * row.weightHi).toFixed(1) + ']', '  ', tr);
  });
  const est = res.formB.ranking.slice().sort((a, b) => a.item - b.item).map((r) => r.utility);
  const tru = items.map((c) => TRUE_U[c]);
  const ra = (v) => { const o = v.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]); const r = []; o.forEach((p, k) => { r[p[1]] = k + 1; }); return r; };
  const r1 = ra(est), r2 = ra(tru), n = r1.length;
  const rho = 1 - 6 * r1.reduce((s, x, i) => s + (x - r2[i]) ** 2, 0) / (n * (n * n - 1));
  console.log('\nSpearman rho, estimated vs true utilities:', rho.toFixed(3));
  console.log('Krippendorff alpha (simulated coder 2):', res.formA.coding.alpha.alpha, 'on', res.formA.coding.alpha.units, 'entries');
  console.log('Saturation:', res.formA.saturation.primary.label || 'not reached');
})().catch((e) => { console.error(e); process.exit(1); });
