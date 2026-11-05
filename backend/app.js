'use strict';
/**
 * app.js: the backend's request handling, shared by the Vercel function (api/index.js), the
 * local preview server (dev/server.js) and the tests. Storage is passed in: the private GitHub
 * data repository in production (store-github.js), a local file otherwise (store-file.js).
 * All maths is in engine.js.
 *
 * Public actions: config (GET), submitA, submitB.
 * Researcher actions (need the researcher key): results, exportData, saveCodes, freeze,
 * unfreeze, setFormA, withdraw.
 */
const crypto = require('crypto');
const Engine = require('./engine');

const MAX_BODY_CHARS = 200000;
const RESEARCHER_ACTIONS = ['results', 'exportData', 'saveCodes', 'freeze', 'unfreeze', 'setFormA', 'withdraw'];
const DEFAULT_CONFIG = { formAOpen: true, freeze: null, lastDesignVersion: 0 };

function withDefaults(state) {
  const s = state || {};
  const config = Object.assign({}, DEFAULT_CONFIG, s.config || {});
  return { config, codes: s.codes || [], assignments: s.assignments || [], history: s.history || [] };
}

/**
 * opts: { store, researcherKey, missing }. missing lists settings that are not set yet; while it
 * is not empty the forms run as a preview and nothing can be saved.
 */
function createApp(opts) {
  const store = opts.store, missing = opts.missing || [];
  const keyHash = opts.researcherKey ? crypto.createHash('sha256').update(String(opts.researcherKey)).digest() : null;
  const wrongKeyDelay = opts.wrongKeyDelay === undefined ? 400 : opts.wrongKeyDelay;

  /** Constant-time comparison of hashes, so the time taken says nothing about how much of the key was right. */
  function keyOk(given) {
    if (!keyHash || typeof given !== 'string' || !given) return false;
    return crypto.timingSafeEqual(crypto.createHash('sha256').update(given).digest(), keyHash);
  }

  async function readState() {
    const r = await store.readState();
    return { state: withDefaults(r.state), version: r.version };
  }
  async function loadAll() {
    const all = await store.readAll();
    return { all, state: withDefaults(all.state) };
  }
  function engineData(all, state) {
    return { formA: all.formA, formB: all.formB, codes: state.codes, assignments: state.assignments, config: state.config };
  }

  async function get(params) {
    params = params || {};
    const action = params.action || 'ping';
    if (action === 'ping') return { ok: true, service: 'thesis-research' };
    if (action !== 'config') return { ok: false, error: 'Unknown action.' };
    if (missing.length) return { ok: true, configured: false, missing };
    return publicConfig((await readState()).state.config);
  }

  async function post(body) {
    if (!body) return { ok: false, error: 'Empty request.' };
    if (body.length > MAX_BODY_CHARS) return { ok: false, error: 'Request too large.' };
    let req;
    try { req = JSON.parse(body); } catch (err) { return { ok: false, error: 'Request is not valid JSON.' }; }
    if (!req || typeof req !== 'object') return { ok: false, error: 'Request is not valid JSON.' };
    const action = req.action;
    if (missing.length) return { ok: false, error: 'The study is not connected to its storage yet. Set ' + missing.join(' and ') + ' in Vercel.' };
    if (action === 'submitA') return submitA(req.payload);
    if (action === 'submitB') return submitB(req.payload);
    if (RESEARCHER_ACTIONS.indexOf(action) < 0) return { ok: false, error: 'Unknown action.' };
    if (!keyOk(req.key)) {
      if (wrongKeyDelay) await new Promise((r) => setTimeout(r, wrongKeyDelay));   // slows guessing
      return { ok: false, error: 'Wrong researcher key.' };
    }
    try {
      if (action === 'results') return await results(req);
      if (action === 'exportData') return await exportData();
      if (action === 'saveCodes') return await saveCodes(req);
      if (action === 'freeze') return await freeze(req);
      if (action === 'unfreeze') return await unfreeze(req);
      if (action === 'setFormA') return await setFormA(req);
      if (action === 'withdraw') return await withdraw(req);
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  // ---------------------------------------------------------------- respondent actions

  async function submitA(payload) {
    const { state } = await readState();
    if (!state.config.formAOpen) return { ok: false, error: 'This survey is closed. Thank you for your interest.' };
    if (payload && payload.hp) return { ok: true };            // honeypot field filled: silently ignore
    const v = Engine.validateA(payload, Date.now());
    if (!v.ok) return v;
    return (await store.addResponse('A', v.record)) === 'duplicate' ? { ok: true, duplicate: true } : { ok: true };
  }

  async function submitB(payload) {
    const { state } = await readState();
    if (payload && payload.hp) return { ok: true };
    const v = Engine.validateB(payload, Date.now(), state.config.freeze);
    if (!v.ok) return v;
    return (await store.addResponse('B', v.record)) === 'duplicate' ? { ok: true, duplicate: true } : { ok: true };
  }

  // ---------------------------------------------------------------- researcher actions

  async function results(req) {
    const { all, state } = await loadAll();
    return Engine.buildResults(engineData(all, state), { includeTest: req.includeTest === true });
  }

  async function exportData() {
    const { all, state } = await loadAll();
    const config = Object.assign({}, state.config, { history: state.history });
    return { ok: true, formA: all.formA, formB: all.formB, codes: state.codes, assignments: state.assignments, config };
  }

  async function saveCodes(req) {
    const { state, version } = await readState();
    const byId = {};
    state.codes.forEach((c) => { byId[c.id] = c; });
    const now = new Date().toISOString();
    (req.codes || []).forEach((c) => {
      if (!c || !/^c_[a-z0-9_]{1,32}$/.test(c.id)) throw new Error('Invalid code id.');
      const label = String(c.label || '').trim().slice(0, 80);
      if (!label) throw new Error('Every code needs a label.');
      const prev = byId[c.id];
      byId[c.id] = { id: c.id, label, description: String(c.description || '').trim().slice(0, 200), scope: c.scope === 'other' ? 'other' : 'safety',
                     createdAt: prev ? prev.createdAt : now, updatedAt: now };
    });
    const deleted = {};
    (req.deleteCodes || []).forEach((id) => { if (byId[id]) { delete byId[id]; deleted[id] = true; } });

    const map = {};
    state.assignments.forEach((a) => {
      // deleting a code removes it from every entry; a split entry keeps its other codes
      const list = Array.isArray(a.code) ? a.code.filter((c) => !deleted[c]) : (deleted[a.code] ? [] : [a.code]);
      if (!list.length) return;
      map[a.coder + '|' + a.key] = Object.assign({}, a, { code: list.length === 1 ? list[0] : list });
    });
    (req.assignments || []).forEach((a) => {
      if (!a || typeof a.key !== 'string') throw new Error('Invalid assignment.');
      const key = Engine.normalizeEntry(a.key);
      if (!key || key !== a.key || key.length > 200) throw new Error('Invalid entry key.');
      const coder = a.coder === 2 ? 2 : 1;
      let code = a.code;
      if (Array.isArray(code)) code = code.filter((c) => c);
      if (code === null || code === undefined || code === '' || (Array.isArray(code) && code.length === 0)) { delete map[coder + '|' + key]; return; }
      if (code !== Engine.EXCLUDE) {
        // one code, or an entry split into 2-3 different codes in the order they were written
        const list = Array.isArray(code) ? code : [code];
        if (list.length > Engine.MAX_CODES_PER_ENTRY) throw new Error('At most ' + Engine.MAX_CODES_PER_ENTRY + ' codes per entry.');
        list.forEach((c) => { if (typeof c !== 'string' || !byId[c]) throw new Error('Unknown code for entry "' + key + '".'); });
        if (list.some((c, i) => list.indexOf(c) !== i)) throw new Error('The same code twice on entry "' + key + '".');
        code = list.length === 1 ? list[0] : list;
      }
      map[coder + '|' + key] = { key, coder, code, updatedAt: now };
    });
    state.codes = Object.keys(byId).map((id) => byId[id]);
    state.assignments = Object.keys(map).map((k) => map[k]);
    await store.writeState(state, version, 'Save coding');
    return { ok: true };
  }

  async function freeze(req) {
    const [{ state, version }, all] = await Promise.all([readState(), store.readAll()]);
    if (state.config.freeze) return { ok: false, error: 'Form B is already open. Unfreeze it first.' };
    const res = Engine.buildResults(engineData(all, state));            // real responses only, never tests
    const f = Engine.buildFreeze(res, Number(req.k), state.config.lastDesignVersion || 0, Date.now());
    if (!f.ok) return f;
    state.config.freeze = f.freeze;
    state.config.lastDesignVersion = f.freeze.designVersion;
    // audit trail: what respondents of each version saw
    state.history.push({ designVersion: f.freeze.designVersion, frozenAt: f.freeze.frozenAt, rule: f.freeze.rule,
      items: f.freeze.items.map((it) => ({ codeId: it.codeId, label: it.label, description: it.description })), sets: f.freeze.sets });
    await store.writeState(state, version, 'Freeze the Form B list, version ' + f.freeze.designVersion);
    return { ok: true, freeze: f.freeze };
  }

  async function unfreeze(req) {
    if (req.confirm !== 'UNFREEZE') return { ok: false, error: 'Type UNFREEZE to confirm.' };
    const { state, version } = await readState();
    state.config.freeze = null;
    await store.writeState(state, version, 'Close Form B');
    return { ok: true };
  }

  async function setFormA(req) {
    const { state, version } = await readState();
    state.config.formAOpen = req.open === true;
    await store.writeState(state, version, state.config.formAOpen ? 'Reopen Form A' : 'Close Form A');
    return { ok: true, formAOpen: state.config.formAOpen };
  }

  /** Deletes every response from one email, in both forms (a withdrawal request). */
  async function withdraw(req) {
    const email = String(req.email || '').trim().toLowerCase();
    if (!email) return { ok: false, error: 'Enter the email address.' };
    if (req.confirm !== email) return { ok: false, error: 'Type the same email address again to confirm.' };
    const { all } = await loadAll();
    const list = all.formA.concat(all.formB).filter((r) => r.email === email).map((r) => ({ form: r.form, id: r.id }));
    if (!list.length) return { ok: false, error: 'No response uses that email address.' };
    const removed = await store.removeResponses(list);
    return { ok: true, removed };
  }

  function publicConfig(cfg) {
    const f = cfg.freeze;
    return {
      ok: true,
      configured: true,
      formAOpen: cfg.formAOpen !== false,
      formB: f ? { open: true, designVersion: f.designVersion,
                   items: f.items.map((it) => ({ label: it.label, description: it.description })),
                   sets: f.sets } : { open: false }
    };
  }

  return { get, post };
}

module.exports = { createApp, withDefaults };
