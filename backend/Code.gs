/**
 * Code.gs: the web-app backend (Google Apps Script + Google Sheets).
 *
 * Storage: one Google Sheet with six tabs. Each data row holds one JSON
 * object in column A, so Sheets never reformats an answer (dates, numbers,
 * formulas). All maths is in Engine.gs.
 *
 * Public actions: config (GET), submitA, submitB.
 * Researcher actions (need the researcher key): results, exportData,
 * saveCodes, freeze, unfreeze, setFormA.
 */

var SHEET_NAMES = { A: 'FormA', B: 'FormB', CODES: 'Codes', ASSIGN: 'Assignments', CONFIG: 'Config', HISTORY: 'FreezeHistory' };
var MAX_BODY_CHARS = 200000;
var DEFAULT_CONFIG = { formAOpen: true, freeze: null, lastDesignVersion: 0 };

/** Run once from the Apps Script editor. Prints the researcher key in the execution log. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the Google Sheet (Extensions > Apps Script), then run setup again.');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  Object.keys(SHEET_NAMES).forEach(function (k) { sheet_(ss, SHEET_NAMES[k]); });
  if (readJson_(ss, SHEET_NAMES.CONFIG).length === 0) writeConfig_(ss, DEFAULT_CONFIG);
  var key = props.getProperty('RESEARCHER_KEY');
  if (!key) { key = Utilities.getUuid(); props.setProperty('RESEARCHER_KEY', key); }
  Logger.log('Setup complete. Researcher key (keep it private): ' + key);
  return key;
}

function doGet(e) {
  return respond_(function () {
    var action = (e && e.parameter && e.parameter.action) || 'ping';
    if (action === 'ping') return { ok: true, service: 'thesis-research' };
    if (action === 'config') return publicConfig_(readConfig_(ss_()));
    return { ok: false, error: 'Unknown action.' };
  });
}

function doPost(e) {
  return respond_(function () {
    var body = e && e.postData && e.postData.contents;
    if (!body) return { ok: false, error: 'Empty request.' };
    if (body.length > MAX_BODY_CHARS) return { ok: false, error: 'Request too large.' };
    var req;
    try { req = JSON.parse(body); } catch (err) { return { ok: false, error: 'Request is not valid JSON.' }; }
    var action = req.action;
    if (action === 'submitA') return submitA_(req.payload);
    if (action === 'submitB') return submitB_(req.payload);
    if (['results', 'exportData', 'saveCodes', 'freeze', 'unfreeze', 'setFormA'].indexOf(action) < 0) return { ok: false, error: 'Unknown action.' };
    var key = PropertiesService.getScriptProperties().getProperty('RESEARCHER_KEY');
    if (!key || req.key !== key) return { ok: false, error: 'Wrong researcher key.' };
    if (action === 'results') return results_(req);
    if (action === 'exportData') return exportData_();
    if (action === 'saveCodes') return withLock_(function () { return saveCodes_(req); });
    if (action === 'freeze') return withLock_(function () { return freeze_(req); });
    if (action === 'unfreeze') return withLock_(function () { return unfreeze_(req); });
    if (action === 'setFormA') return withLock_(function () { return setFormA_(req); });
  });
}

// ---------------------------------------------------------------- actions

function submitA_(payload) {
  return withLock_(function () {
    var ss = ss_();
    var cfg = readConfig_(ss);
    if (!cfg.formAOpen) return { ok: false, error: 'This survey is closed. Thank you for your interest.' };
    if (payload && payload.hp) return { ok: true };            // honeypot field filled: silently ignore
    var v = Engine.validateA(payload, Date.now());
    if (!v.ok) return v;
    var existing = readJson_(ss, SHEET_NAMES.A);
    for (var i = 0; i < existing.length; i++) if (existing[i].id === v.record.id) return { ok: true, duplicate: true };
    appendJson_(ss, SHEET_NAMES.A, v.record);
    return { ok: true };
  });
}

function submitB_(payload) {
  return withLock_(function () {
    var ss = ss_();
    var cfg = readConfig_(ss);
    if (payload && payload.hp) return { ok: true };
    var v = Engine.validateB(payload, Date.now(), cfg.freeze);
    if (!v.ok) return v;
    var existing = readJson_(ss, SHEET_NAMES.B);
    for (var i = 0; i < existing.length; i++) if (existing[i].id === v.record.id) return { ok: true, duplicate: true };
    appendJson_(ss, SHEET_NAMES.B, v.record);
    return { ok: true };
  });
}

function loadAll_(ss) {
  return {
    formA: readJson_(ss, SHEET_NAMES.A),
    formB: readJson_(ss, SHEET_NAMES.B),
    codes: readJson_(ss, SHEET_NAMES.CODES),
    assignments: readJson_(ss, SHEET_NAMES.ASSIGN),
    config: readConfig_(ss)
  };
}

function results_(req) {
  return Engine.buildResults(loadAll_(ss_()), { includeTest: req.includeTest === true });
}

function exportData_() {
  var ss = ss_(), d = loadAll_(ss);
  d.config.history = (d.config.history || []).concat(readJson_(ss, SHEET_NAMES.HISTORY));
  d.ok = true;
  return d;
}

function saveCodes_(req) {
  var ss = ss_();
  var codes = readJson_(ss, SHEET_NAMES.CODES), byId = {};
  codes.forEach(function (c) { byId[c.id] = c; });
  var now = new Date().toISOString();
  (req.codes || []).forEach(function (c) {
    if (!c || !/^c_[a-z0-9_]{1,32}$/.test(c.id)) throw new Error('Invalid code id.');
    var label = String(c.label || '').trim().slice(0, 80);
    if (!label) throw new Error('Every code needs a label.');
    var scope = c.scope === 'other' ? 'other' : 'safety';
    var prev = byId[c.id];
    byId[c.id] = { id: c.id, label: label, description: String(c.description || '').trim().slice(0, 200), scope: scope,
                   createdAt: prev ? prev.createdAt : now, updatedAt: now };
  });
  var deleted = {};
  (req.deleteCodes || []).forEach(function (id) { if (byId[id]) { delete byId[id]; deleted[id] = true; } });

  var assigns = readJson_(ss, SHEET_NAMES.ASSIGN), map = {};
  assigns.forEach(function (a) {
    // deleting a code removes it from every entry; a split entry keeps its other codes
    var list = Array.isArray(a.code) ? a.code.filter(function (c) { return !deleted[c]; }) : (deleted[a.code] ? [] : [a.code]);
    if (!list.length) return;
    a.code = list.length === 1 ? list[0] : list;
    map[a.coder + '|' + a.key] = a;
  });
  (req.assignments || []).forEach(function (a) {
    if (!a || typeof a.key !== 'string') throw new Error('Invalid assignment.');
    var key = Engine.normalizeEntry(a.key);
    if (!key || key !== a.key || key.length > 200) throw new Error('Invalid entry key.');
    var coder = a.coder === 2 ? 2 : 1;
    var code = a.code;
    if (Array.isArray(code)) code = code.filter(function (c) { return c; });
    if (code === null || code === '' || (Array.isArray(code) && code.length === 0)) { delete map[coder + '|' + key]; return; }
    if (code !== Engine.EXCLUDE) {
      // one code, or an entry split into 2-3 different codes in the order they were written
      var list = Array.isArray(code) ? code : [code];
      if (list.length > Engine.MAX_CODES_PER_ENTRY) throw new Error('At most ' + Engine.MAX_CODES_PER_ENTRY + ' codes per entry.');
      list.forEach(function (c) { if (typeof c !== 'string' || !byId[c]) throw new Error('Unknown code for entry "' + key + '".'); });
      if (list.some(function (c, i) { return list.indexOf(c) !== i; })) throw new Error('The same code twice on entry "' + key + '".');
      code = list.length === 1 ? list[0] : list;
    }
    map[coder + '|' + key] = { key: key, coder: coder, code: code, updatedAt: now };
  });
  rewriteJson_(ss, SHEET_NAMES.CODES, Object.keys(byId).map(function (id) { return byId[id]; }));
  rewriteJson_(ss, SHEET_NAMES.ASSIGN, Object.keys(map).map(function (k) { return map[k]; }));
  return { ok: true };
}

function freeze_(req) {
  var ss = ss_();
  var cfg = readConfig_(ss);
  if (cfg.freeze) return { ok: false, error: 'Form B is already open. Unfreeze it first.' };
  var res = Engine.buildResults(loadAll_(ss));                 // real responses only, never tests
  var f = Engine.buildFreeze(res, Number(req.k), cfg.lastDesignVersion || 0, Date.now());
  if (!f.ok) return f;
  cfg.freeze = f.freeze;
  cfg.lastDesignVersion = f.freeze.designVersion;
  writeConfig_(ss, cfg);
  // audit trail: what respondents of each version saw, one row per version, so the Config cell
  // stays far below the 50,000-character limit of a Sheets cell however often the list is refrozen
  appendJson_(ss, SHEET_NAMES.HISTORY, { designVersion: f.freeze.designVersion, frozenAt: f.freeze.frozenAt, rule: f.freeze.rule,
    items: f.freeze.items.map(function (it) { return { codeId: it.codeId, label: it.label, description: it.description }; }), sets: f.freeze.sets });
  return { ok: true, freeze: f.freeze };
}

function unfreeze_(req) {
  if (req.confirm !== 'UNFREEZE') return { ok: false, error: 'Type UNFREEZE to confirm.' };
  var ss = ss_();
  var cfg = readConfig_(ss);
  cfg.freeze = null;
  writeConfig_(ss, cfg);
  return { ok: true };
}

function setFormA_(req) {
  var ss = ss_();
  var cfg = readConfig_(ss);
  cfg.formAOpen = req.open === true;
  writeConfig_(ss, cfg);
  return { ok: true, formAOpen: cfg.formAOpen };
}

function publicConfig_(cfg) {
  var f = cfg.freeze;
  return {
    ok: true,
    formAOpen: cfg.formAOpen !== false,
    formB: f ? { open: true, designVersion: f.designVersion,
                 items: f.items.map(function (it) { return { label: it.label, description: it.description }; }),
                 sets: f.sets } : { open: false }
  };
}

// ---------------------------------------------------------------- storage helpers

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Backend not set up. Run setup() in the Apps Script editor.');
  return SpreadsheetApp.openById(id);
}

function sheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.appendRow(['json']); sh.setFrozenRows(1); }
  return sh;
}

function readJson_(ss, name) {
  var sh = sheet_(ss, name), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 1).getValues()
    .map(function (row) { return row[0]; })
    .filter(function (v) { return typeof v === 'string' && v.charAt(0) === '{'; })
    .map(function (v) { return JSON.parse(v); });
}

function appendJson_(ss, name, obj) {
  sheet_(ss, name).appendRow([JSON.stringify(obj)]);
}

function rewriteJson_(ss, name, objs) {
  var sh = sheet_(ss, name), last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).clearContent();
  if (objs.length) sh.getRange(2, 1, objs.length, 1).setValues(objs.map(function (o) { return [JSON.stringify(o)]; }));
}

function readConfig_(ss) {
  var rows = readJson_(ss, SHEET_NAMES.CONFIG);
  var cfg = rows.length ? rows[0] : {};
  Object.keys(DEFAULT_CONFIG).forEach(function (k) { if (!(k in cfg)) cfg[k] = DEFAULT_CONFIG[k]; });
  return cfg;
}

function writeConfig_(ss, cfg) {
  rewriteJson_(ss, SHEET_NAMES.CONFIG, [cfg]);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function respond_(fn) {
  var out;
  try { out = fn(); } catch (err) { out = { ok: false, error: String(err && err.message ? err.message : err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
