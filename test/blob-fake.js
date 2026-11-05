'use strict';
/**
 * A stand-in for the @vercel/blob SDK calls that backend/store-blob.js makes (put, get, head, list,
 * del), with the documented behaviour: put refuses to overwrite unless allowOverwrite, ifMatch must
 * equal the current ETag (BlobPreconditionFailedError otherwise), get returns null when missing,
 * head throws BlobNotFoundError, list pages by limit with a cursor. It counts operations the way
 * Vercel bills them: uploads and listings are advanced operations; a read is a simple operation
 * unless it is served from the cache (useCache left on and the same version read before).
 */
function named(name, message) { const e = new Error(message || name); e.name = name; return e; }

function createBlobFake() {
  const files = new Map();
  const cached = new Set();               // pathname@etag pairs already read through the cache
  const ops = { advanced: 0, simple: 0, cacheHits: 0, deletes: 0 };
  const faults = { rateLimitNextPut: 0 };
  let etagSeq = 0;
  const needAccess = (o) => { if (!o || o.access !== 'private') throw named('BlobError', 'access must be "private"'); };

  const sdk = {
    async put(pathname, body, o) {
      needAccess(o);
      ops.advanced++;
      if (faults.rateLimitNextPut > 0) { faults.rateLimitNextPut--; throw named('BlobServiceRateLimited'); }
      const cur = files.get(pathname);
      if (o.ifMatch !== undefined && (!cur || cur.etag !== o.ifMatch)) throw named('BlobPreconditionFailedError', 'Precondition failed: ETag mismatch.');
      if (cur && !o.allowOverwrite) throw named('BlobError', 'Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.');
      const etag = '"e' + (++etagSeq) + '"';
      files.set(pathname, { body: String(body), etag, contentType: o.contentType, cacheControlMaxAge: o.cacheControlMaxAge });
      return { pathname, url: 'https://store.private.blob.vercel-storage.com/' + pathname };
    },
    async get(pathname, o) {
      needAccess(o);
      const f = files.get(pathname);
      const key = pathname + '@' + (f ? f.etag : '');
      if (o.useCache !== false && f && cached.has(key)) ops.cacheHits++;
      else { ops.simple++; if (f && o.useCache !== false) cached.add(key); }
      if (!f) return null;
      return { statusCode: 200, stream: new Blob([f.body]).stream(), headers: new Headers(), blob: { pathname, etag: f.etag, contentType: 'application/json' } };
    },
    async head(pathname) {
      ops.simple++;
      if (!files.has(pathname)) throw named('BlobNotFoundError', 'The requested blob does not exist');
      return { pathname, etag: files.get(pathname).etag };
    },
    async list(o) {
      ops.advanced++;
      const limit = (o && o.limit) || 1000, start = o && o.cursor ? Number(o.cursor) : 0;
      const names = Array.from(files.keys()).sort();
      const page = names.slice(start, start + limit);
      const hasMore = start + limit < names.length;
      return { blobs: page.map((p) => ({ pathname: p, etag: files.get(p).etag, size: files.get(p).body.length })), hasMore, cursor: hasMore ? String(start + limit) : undefined };
    },
    async del(paths) {
      (Array.isArray(paths) ? paths : [paths]).forEach((p) => { if (files.delete(p)) ops.deletes++; });
    }
  };
  return { sdk, files, ops, faults };
}

module.exports = { createBlobFake };
