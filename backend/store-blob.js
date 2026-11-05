'use strict';
/**
 * store-blob.js: keeps the study's data in a private Vercel Blob store connected to the project.
 *
 *   responses/A/<id>.json   one file per Form A response, created once and never overwritten
 *   responses/B/<id>.json   one file per Form B response
 *   state.json              codebook, coding, Form A open or closed, the Form B freeze and its history
 *
 * Credentials: on Vercel the SDK authenticates by itself (a short-lived OIDC token that Vercel
 * issues and rotates, or the store's read-write token that Vercel adds to the project when the
 * store is connected). No secret is in this code, in the repository or in a browser.
 *
 * The free (Hobby) plan allows 2,000 uploads and listings and 10,000 uncached reads a month, and
 * locks the store for 30 days if that is exceeded. So: one listing per analysis, responses (which
 * never change) are read once and kept in memory, the public form settings are read through the
 * cache, and a listing is reused for 20 seconds.
 */
const STATE_PATH = 'state.json';
const LIST_REUSE_MS = 20000;
const { StoreError } = require('./store-github');

function blobStore(opts) {
  const sdk = (opts && opts.sdk) || require('@vercel/blob');
  const pause = (opts && opts.sleep) || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = (opts && opts.now) || Date.now;
  const A = { access: 'private' };
  const records = new Map();             // pathname -> parsed response (responses never change)
  let lastList = null;                   // { at, blobs }
  let noStateUntil = 0;                  // a missing settings file is not cached by Vercel, so remember it here

  function explain(err) {
    const name = err && err.name;
    if (name === 'BlobStoreSuspendedError') return new StoreError('The Vercel Blob store is suspended, most likely because this month’s free allowance ran out. Data is safe; it reopens when the allowance resets.', 'blob');
    if (name === 'BlobStoreNotFoundError' || name === 'BlobAccessError') return new StoreError('The Vercel Blob store is not connected to this project, or this deployment cannot reach it.', 'blob');
    if (name === 'BlobServiceRateLimited') return new StoreError('Vercel Blob is busy (rate limited). Try again in a minute.', 'blob');
    return err instanceof Error ? err : new StoreError(String(err), 'blob');
  }
  async function text(result) { return new Response(result.stream).text(); }
  async function readJson(pathname, fresh) {
    const r = await sdk.get(pathname, fresh ? { ...A, useCache: false } : A);
    if (!r || r.statusCode !== 200) return null;
    return { value: JSON.parse(await text(r)), etag: r.blob.etag };
  }
  async function exists(pathname) {
    try { await sdk.head(pathname); return true; } catch (e) { if (e && e.name === 'BlobNotFoundError') return false; throw explain(e); }
  }
  /** One retry for a busy service or a brief outage; anything else is reported at once. */
  async function retry(fn) {
    try { return await fn(); } catch (e) {
      if (e && (e.name === 'BlobServiceRateLimited' || e.name === 'BlobServiceNotAvailable')) { await pause(1500); return fn(); }
      throw e;
    }
  }
  async function listAll() {
    if (lastList && now() - lastList.at < LIST_REUSE_MS) return lastList.blobs;
    const blobs = [];
    let cursor;
    do {
      const page = await retry(() => sdk.list({ cursor, limit: 1000 }));
      page.blobs.forEach((b) => blobs.push(b));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    lastList = { at: now(), blobs };
    return blobs;
  }
  function forget() { lastList = null; }

  return {
    kind: 'blob',

    /** fresh: false for the public form settings (read through the cache, so a change shows within a minute). */
    async readState(fresh) {
      const cached = fresh === false;
      if (cached && now() < noStateUntil) return { state: null, version: null };
      try {
        const s = await readJson(STATE_PATH, !cached);
        if (!s && cached) noStateUntil = now() + 60000;
        return s ? { state: s.value, version: s.etag } : { state: null, version: null };
      } catch (e) { throw explain(e); }
    },

    async writeState(state, version, message) {
      void message;
      const body = JSON.stringify(state, null, 1);
      try {
        // the first write must create the file; every later one must replace the exact version read
        await sdk.put(STATE_PATH, body, version
          ? { ...A, contentType: 'application/json', allowOverwrite: true, ifMatch: version, cacheControlMaxAge: 60 }
          : { ...A, contentType: 'application/json', allowOverwrite: false, cacheControlMaxAge: 60 });
      } catch (e) {
        if (e && e.name === 'BlobPreconditionFailedError') throw new StoreError('The settings were changed somewhere else at the same moment. Reload and try again.', 'conflict');
        if (!version && await exists(STATE_PATH)) throw new StoreError('The settings were changed somewhere else at the same moment. Reload and try again.', 'conflict');
        throw explain(e);
      }
      noStateUntil = 0;
      forget();
    },

    async addResponse(form, record) {
      const pathname = 'responses/' + form + '/' + record.id + '.json';
      try {
        await retry(() => sdk.put(pathname, JSON.stringify(record, null, 1), { ...A, contentType: 'application/json', allowOverwrite: false }));
      } catch (e) {
        // the same respondent id again (a resubmission after a lost connection): keep the first
        if (await exists(pathname)) return 'duplicate';
        throw explain(e);
      }
      forget();
      return 'created';
    },

    async readAll() {
      try {
        const blobs = await listAll();
        const out = { formA: [], formB: [], state: null };
        const live = new Set();
        for (const b of blobs) {
          const m = /^responses\/([AB])\/[^/]+\.json$/.exec(b.pathname);
          if (!m) continue;
          live.add(b.pathname);
          if (!records.has(b.pathname)) {
            const r = await retry(() => readJson(b.pathname, false));
            if (r) records.set(b.pathname, r.value);
          }
          const rec = records.get(b.pathname);
          if (rec) out[m[1] === 'A' ? 'formA' : 'formB'].push(JSON.parse(JSON.stringify(rec)));
        }
        for (const k of records.keys()) if (!live.has(k)) records.delete(k);
        const s = blobs.some((b) => b.pathname === STATE_PATH) ? await readJson(STATE_PATH, true) : null;
        out.state = s ? s.value : null;
        return out;
      } catch (e) { throw explain(e); }
    },

    async removeResponses(list) {
      const paths = list.map((x) => 'responses/' + x.form + '/' + x.id + '.json');
      try {
        if (paths.length) await sdk.del(paths);
      } catch (e) { throw explain(e); }
      paths.forEach((p) => records.delete(p));
      forget();
      return paths.length;
    }
  };
}

module.exports = { blobStore };
