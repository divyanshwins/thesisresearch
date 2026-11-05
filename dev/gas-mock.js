'use strict';
/**
 * A small stand-in for the Google Apps Script services that Code.gs uses
 * (SpreadsheetApp, PropertiesService, LockService, ContentService,
 * Utilities, Logger). It lets the real backend files run in Node for tests
 * and for the local preview server. Only the methods Code.gs calls exist.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

function createStore(file) {
  let data = { sheetId: 'local-sheet', sheets: {}, props: {} };
  if (file && fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const save = () => { if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); } };
  return { data, save };
}

function makeServices(store) {
  const d = store.data;

  function makeSheet(name) {
    const rows = () => d.sheets[name];
    const lastRow = () => {
      const r = rows();
      for (let i = r.length - 1; i >= 0; i--) if (r[i].some((v) => v !== '' && v !== null && v !== undefined)) return i + 1;
      return 0;
    };
    const ensure = (n, c) => {
      const r = rows();
      while (r.length < n) r.push([]);
      for (let i = 0; i < n; i++) while (r[i].length < c) r[i].push('');
    };
    return {
      getName: () => name,
      getLastRow: lastRow,
      setFrozenRows: () => {},
      appendRow: (arr) => {
        const n = lastRow();
        rows().splice(n, rows().length - n);
        rows().push(arr.map((v) => (v === undefined ? '' : v)));
        store.save();
      },
      getRange: (row, col, numRows, numCols) => {
        numRows = numRows || 1; numCols = numCols || 1;
        if (row < 1 || col < 1) throw new Error('Range out of bounds');
        return {
          getValues: () => {
            ensure(row - 1 + numRows, col - 1 + numCols);
            return rows().slice(row - 1, row - 1 + numRows).map((r) => r.slice(col - 1, col - 1 + numCols));
          },
          setValues: (vals) => {
            if (vals.length !== numRows || vals.some((v) => v.length !== numCols)) throw new Error('The number of rows or columns in the data does not match the range.');
            ensure(row - 1 + numRows, col - 1 + numCols);
            vals.forEach((v, i) => v.forEach((x, j) => { rows()[row - 1 + i][col - 1 + j] = x; }));
            store.save();
          },
          clearContent: () => {
            ensure(row - 1 + numRows, col - 1 + numCols);
            for (let i = 0; i < numRows; i++) for (let j = 0; j < numCols; j++) rows()[row - 1 + i][col - 1 + j] = '';
            store.save();
          }
        };
      }
    };
  }

  const spreadsheet = {
    getId: () => d.sheetId,
    getSheetByName: (name) => (d.sheets[name] ? makeSheet(name) : null),
    insertSheet: (name) => { d.sheets[name] = []; store.save(); return makeSheet(name); }
  };

  let locked = false;
  return {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      openById: (id) => { if (id !== d.sheetId) throw new Error('No spreadsheet with id ' + id); return spreadsheet; }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in d.props ? d.props[k] : null),
        setProperty: (k, v) => { d.props[k] = String(v); store.save(); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { if (locked) throw new Error('Lock already held (re-entrant call)'); locked = true; },
        releaseLock: () => { locked = false; }
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => {
        const out = { content, mime: 'text/plain' };
        out.setMimeType = (m) => { out.mime = m; return out; };
        out.getContent = () => out.content;
        return out;
      }
    },
    Utilities: { getUuid: () => crypto.randomUUID() },
    Logger: { log: (...a) => { if (process.env.GAS_LOG) console.log('[Logger]', ...a); } }
  };
}

/** Load Engine.gs and Code.gs into one shared global scope, as Apps Script does. */
function createBackend(storeFile) {
  const store = createStore(storeFile);
  const ctx = makeServices(store);
  ctx.console = console;
  vm.createContext(ctx);
  for (const f of ['backend/Engine.gs', 'backend/Code.gs']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return {
    ctx,
    store,
    get: (params) => JSON.parse(ctx.doGet({ parameter: params || {} }).getContent()),
    post: (obj) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(obj), type: 'text/plain' } }).getContent()),
    postRaw: (body) => JSON.parse(ctx.doPost({ postData: { contents: body, type: 'text/plain' } }).getContent())
  };
}

function loadEngine() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'backend/Engine.gs'), 'utf8'), ctx, { filename: 'Engine.gs' });
  return ctx.Engine;
}

module.exports = { createBackend, loadEngine };
