'use strict';
/**
 * store-github.js: keeps the study's data in a private GitHub repository.
 *
 *   responses/A/<id>.json   one file per Form A response, created once and never overwritten
 *   responses/B/<id>.json   one file per Form B response
 *   state.json              codebook, coding, Form A open or closed, the Form B freeze and its history
 *
 * Every write is one commit through the GitHub contents API, so the repository history is a
 * dated record of every response. Reading every response is one download of the repository as
 * a .tar.gz archive, so the cost does not grow with the number of responses.
 * The token never leaves the server: it is read from Vercel's environment (api/index.js).
 */
const zlib = require('zlib');

const STATE_PATH = 'state.json';

class StoreError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function githubStore(opts) {
  const repo = opts.repo, base = (opts.apiBase || 'https://api.github.com') + '/repos/' + repo;
  const doFetch = opts.fetch || fetch;
  const pause = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const headers = {
    Authorization: 'Bearer ' + opts.token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'thesisresearch-survey'
  };

  /** One API call. Retries rate limits (403/429 with a retry hint) and brief server errors; returns { status, body }. */
  async function call(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(base + path, { method, headers: body ? { ...headers, 'Content-Type': 'application/json' } : headers, body: body ? JSON.stringify(body) : undefined });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
      const limited = res.status === 429 || (res.status === 403 && (res.headers.get('retry-after') || /rate limit/i.test(text)));
      if ((limited || res.status >= 500) && attempt < 3) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || 600 * (attempt + 1);
        await pause(Math.min(wait, 5000));
        continue;
      }
      if (res.status === 401) throw new StoreError('GitHub refused the token (GITHUB_TOKEN in Vercel). It may be wrong or expired.', 'auth');
      return { status: res.status, body: json, text };
    }
  }

  function fail(what, r) {
    return new StoreError(what + ' failed: GitHub answered ' + r.status + ((r.body && r.body.message) ? ' (' + r.body.message + ')' : '') + '.', 'github');
  }

  /** After a 404: is it a missing file in a repository the token can reach, or is the repository itself out of reach? */
  async function checkRepo() {
    const r = await call('GET', '');
    if (r.status === 404 || r.status === 403) throw new StoreError('The data repository ' + repo + ' was not found, or the token cannot reach it. Give the token access to that repository with Contents: read and write.', 'repo');
    if (r.status !== 200) throw fail('Opening the data repository', r);
  }

  function encodePath(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  function b64(obj) { return Buffer.from(JSON.stringify(obj, null, 1), 'utf8').toString('base64'); }

  async function getFile(path) {
    const r = await call('GET', '/contents/' + encodePath(path));
    if (r.status === 404) { await checkRepo(); return null; }
    if (r.status !== 200 || !r.body || r.body.type !== 'file') throw fail('Reading ' + path, r);
    let content = r.body.encoding === 'base64' ? Buffer.from(r.body.content, 'base64').toString('utf8') : null;
    if (content === null) {
      // files over 1 MB come without inline content; fetch the raw bytes instead
      const raw = await doFetch(base + '/contents/' + encodePath(path), { headers: { ...headers, Accept: 'application/vnd.github.raw' } });
      if (!raw.ok) throw fail('Reading ' + path, { status: raw.status, body: null });
      content = await raw.text();
    }
    return { content, sha: r.body.sha };
  }

  /** Creates a file (no sha) or replaces one (sha). Returns 'created', 'updated', 'exists' or 'conflict'. */
  async function putFile(path, obj, sha, message) {
    for (let attempt = 0; ; attempt++) {
      const r = await call('PUT', '/contents/' + encodePath(path), { message, content: b64(obj), ...(sha ? { sha } : {}) });
      if (r.status === 201) return 'created';
      if (r.status === 200) return 'updated';
      if (r.status === 422 && /sha/i.test(r.text)) return sha ? 'conflict' : 'exists';
      if (r.status === 409) {
        if (sha) return 'conflict';
        // another commit landed at the same moment (two respondents submitting together): try again
        if (attempt < 5) { await pause(250 + Math.floor(Math.random() * 750)); continue; }
      }
      if (r.status === 404) await checkRepo();
      throw fail('Saving ' + path, r);
    }
  }

  async function deleteFile(path, message) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const f = await getFile(path);
      if (!f) return false;
      const r = await call('DELETE', '/contents/' + encodePath(path), { message, sha: f.sha });
      if (r.status === 200) return true;
      if (r.status !== 409) throw fail('Deleting ' + path, r);
      await pause(250 + Math.floor(Math.random() * 750));
    }
    throw new StoreError('Deleting ' + path + ' kept clashing with other changes. Try again.', 'github');
  }

  return {
    kind: 'github',
    repo,

    async readState() {
      const f = await getFile(STATE_PATH);
      return f ? { state: JSON.parse(f.content), version: f.sha } : { state: null, version: null };
    },

    async writeState(state, version, message) {
      const out = await putFile(STATE_PATH, state, version, message);
      if (out === 'conflict' || out === 'exists') throw new StoreError('The settings were changed somewhere else at the same moment. Reload and try again.', 'conflict');
    },

    async addResponse(form, record) {
      const out = await putFile('responses/' + form + '/' + record.id + '.json', record, null, 'Form ' + form + ' response ' + record.id.slice(0, 8));
      return out === 'exists' ? 'duplicate' : 'created';
    },

    async readAll() {
      const r = await doFetch(base + '/tarball', { headers, redirect: 'follow' });
      if (r.status === 401) throw new StoreError('GitHub refused the token (GITHUB_TOKEN in Vercel). It may be wrong or expired.', 'auth');
      if (r.status === 404) {
        // an empty repository has no archive yet
        const meta = await call('GET', '');
        if (meta.status === 200) return { formA: [], formB: [], state: null };
        await checkRepo();
      }
      if (!r.ok) throw fail('Downloading the data', { status: r.status, body: null });
      const files = untar(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())));
      const out = { formA: [], formB: [], state: null };
      Object.keys(files).forEach((full) => {
        const p = full.split('/').slice(1).join('/');        // drop the archive's top folder (owner-repo-commit)
        const m = /^responses\/([AB])\/[^/]+\.json$/.exec(p);
        if (m) out[m[1] === 'A' ? 'formA' : 'formB'].push(JSON.parse(files[full].toString('utf8')));
        else if (p === STATE_PATH) out.state = JSON.parse(files[full].toString('utf8'));
      });
      return out;
    },

    async removeResponses(list) {
      let n = 0;
      for (const x of list) if (await deleteFile('responses/' + x.form + '/' + x.id + '.json', 'Withdraw Form ' + x.form + ' response ' + x.id.slice(0, 8))) n++;
      return n;
    }
  };
}

/**
 * Regular files in a tar archive, by path. Reads ustar headers (with the 155-byte prefix),
 * pax extended headers ('x', which git uses for paths over 100 bytes) and GNU long names ('L').
 */
function untar(buf) {
  const files = {};
  let off = 0, nextPath = null;
  const field = (h, start, len) => { const s = h.subarray(start, start + len); const z = s.indexOf(0); return (z >= 0 ? s.subarray(0, z) : s).toString('utf8'); };
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    const stored = parseInt(field(h, 148, 8).trim(), 8);
    if (sum !== stored) throw new StoreError('The data archive is damaged (bad tar header).', 'github');
    if (h[124] & 0x80) throw new StoreError('A file in the data archive is too large to read.', 'github');
    const size = parseInt(field(h, 124, 12).trim() || '0', 8);
    const type = h[156] === 0 ? '0' : String.fromCharCode(h[156]);
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { nextPath = paxPath(data) || nextPath; continue; }
    if (type === 'L') { nextPath = data.toString('utf8').replace(/\0+$/, ''); continue; }
    if (type === 'g') continue;
    const prefix = field(h, 345, 155), name = field(h, 0, 100);
    const path = nextPath || (prefix ? prefix + '/' + name : name);
    nextPath = null;
    if (type === '0' || type === '7') files[path] = Buffer.from(data);
  }
  return files;
}

/** The "path" record of a pax header ("<length> path=<value>\n", length counted in bytes). */
function paxPath(data) {
  let i = 0, found = null;
  while (i < data.length) {
    const sp = data.indexOf(0x20, i);
    if (sp < 0) break;
    const len = parseInt(data.subarray(i, sp).toString('ascii'), 10);
    if (!(len > 0)) break;
    const rec = data.subarray(sp + 1, i + len - 1).toString('utf8');
    const eq = rec.indexOf('=');
    if (rec.slice(0, eq) === 'path') found = rec.slice(eq + 1);
    i += len;
  }
  return found;
}

module.exports = { githubStore, untar, StoreError };
