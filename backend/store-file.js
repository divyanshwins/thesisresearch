'use strict';
/**
 * store-file.js: the same storage interface as store-github.js, kept in memory and, if a file
 * name is given, in one JSON file. Used by the local preview server (npm run dev) and the tests.
 */
const fs = require('fs');
const path = require('path');
const { StoreError } = require('./store-github');

function fileStore(file) {
  let data = { responses: { A: {}, B: {} }, state: null, version: 0 };
  if (file && fs.existsSync(file)) {
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (loaded && loaded.responses && loaded.responses.A) data = loaded;   // files from the old Google stand-in are ignored
  }
  const copy = (x) => (x === null || x === undefined ? null : JSON.parse(JSON.stringify(x)));
  const save = () => { if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); } };
  return {
    kind: 'file',
    data,
    async readState() { return { state: copy(data.state), version: data.version }; },
    async writeState(state, version) {
      if (version !== data.version) throw new StoreError('The settings were changed somewhere else at the same moment. Reload and try again.', 'conflict');
      data.state = copy(state); data.version++; save();
    },
    async addResponse(form, record) {
      if (data.responses[form][record.id]) return 'duplicate';
      data.responses[form][record.id] = copy(record); save();
      return 'created';
    },
    async readAll() {
      return { formA: Object.values(data.responses.A).map(copy), formB: Object.values(data.responses.B).map(copy), state: copy(data.state) };
    },
    async removeResponses(list) {
      let n = 0;
      list.forEach((x) => { if (data.responses[x.form][x.id]) { delete data.responses[x.form][x.id]; n++; } });
      save();
      return n;
    }
  };
}

module.exports = { fileStore };
