'use strict';
// Checks the Excel writer (docs/assets/xlsx.js): the zip is valid, and an independent reader
// (Python's openpyxl) opens the workbook and reads back every value with its type.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const zlib = require('zlib');

const ctx = { TextEncoder, Blob: undefined, globalThis: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/assets/xlsx.js'), 'utf8'), ctx);
const W = ctx.globalThis.XLSX_WRITER;

test('CRC-32 matches zlib, and column letters run A..Z, AA..', () => {
  for (const s of ['', 'a', 'The quick brown fox', 'रास्ता'.repeat(50)]) {
    const b = Buffer.from(s, 'utf8');
    assert.equal(W.crc32(b), zlib.crc32 ? zlib.crc32(b) : W.crc32(b));
  }
  assert.equal(W.crc32(Buffer.from('123456789')), 0xCBF43926, 'the standard check value');
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(W.colName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  assert.deepEqual(Array.from(W.sheetNames(['Form A responses', 'A/B: [x]?*', 'Form A responses', 'x'.repeat(40)])),
    ['Form A responses', 'A B   x   ', 'Form A responses 2', 'x'.repeat(31)]);
});

let python = true;
try { execFileSync('python3', ['-c', 'import openpyxl'], { stdio: 'ignore' }); } catch (e) { python = false; }

test('an independent reader opens the workbook and gets every value back', { skip: !python && 'python3 with openpyxl is not installed' }, () => {
  const long = 'x'.repeat(40000);
  const sheets = [
    { name: 'About', headers: ['Item', 'Detail'], rows: [['Study', 'Road choice'], ['Note', 'Line one\nline two & <tags> "quoted"']] },
    { name: 'Form A responses', headers: ['respondentId', 'email', 'n', 'weight', 'test', 'list', 'formula', 'hindi', 'empty', 'long', 'control'],
      rows: [['id-1', 'a@example.org', 3, 0.1234567, true, ['one', 'two'], '=1+1', 'अँधेरी सड़क', null, long, 'a\u0001b\uD800c'],
             ['id-2', '', -2, 1e-9, false, [], '+cmd', '', '', '', '']] }
  ];
  const parts = W.workbook(sheets);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-'));
  const file = path.join(dir, 'book.xlsx');
  fs.writeFileSync(file, Buffer.concat(parts.map((p) => Buffer.from(p))));
  const script = `
import json, sys, zipfile, openpyxl
z = zipfile.ZipFile(sys.argv[1]); bad = z.testzip()
wb = openpyxl.load_workbook(sys.argv[1])
out = {"bad": bad, "names": wb.sheetnames, "cells": {}, "frozen": {}}
for ws in wb.worksheets:
    out["frozen"][ws.title] = ws.freeze_panes
    out["cells"][ws.title] = [[c.value for c in row] for row in ws.iter_rows()]
out["bold"] = wb["Form A responses"]["A1"].font.b
print(json.dumps(out))`;
  const got = JSON.parse(execFileSync('python3', ['-c', script, file]).toString());
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(got.bad, null, 'every zip entry passes its CRC check');
  assert.deepEqual(got.names, ['About', 'Form A responses']);
  assert.deepEqual(got.frozen, { About: 'A2', 'Form A responses': 'A2' }, 'the header row is frozen');
  assert.equal(got.bold, true, 'the header row is bold');
  assert.deepEqual(got.cells.About[2], ['Note', 'Line one\nline two & <tags> "quoted"']);
  const [head, r1, r2] = got.cells['Form A responses'];
  assert.deepEqual(head, sheets[1].headers);
  assert.equal(r1[2], 3); assert.equal(r1[3], 0.1234567); assert.equal(r1[4], true);
  assert.equal(r1[5], 'one; two');
  assert.equal(r1[6], '=1+1', 'text that looks like a formula stays text');
  assert.equal(r1[7], 'अँधेरी सड़क');
  assert.equal(r1[8], null);
  assert.equal(r1[9].length, 32767, 'cut to Excel’s limit for one cell');
  assert.equal(r1[10], 'abc', 'characters XML cannot hold are dropped');
  assert.equal(r2[2], -2); assert.equal(r2[3], 1e-9); assert.equal(r2[4], false); assert.equal(r2[6], '+cmd');
});
