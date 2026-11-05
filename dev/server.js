'use strict';
/**
 * Local preview: serves the website in docs/ with the same security headers as Vercel
 * (from vercel.json) and runs the real backend (backend/app.js) at /api, with the data in
 * a local file instead of the GitHub data repository.
 * Data is kept in dev/data/local.json (git-ignored). Researcher key: dev-key
 *
 *   npm run dev            -> http://localhost:8787
 *   PORT=9000 npm run dev  -> another port
 *   MISSING=storage npm run dev  -> how the site looks before storage is connected
 *   TRUSTED=1 npm run dev        -> analytics opens with no key, as at the private Vercel address
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../backend/app');
const { fileStore } = require('../backend/store-file');

const PORT = Number(process.env.PORT) || 8787;
const DOCS = path.join(__dirname, '..', 'docs');
const STORE = process.env.STORE || path.join(__dirname, 'data', 'local.json');
const KEY = 'dev-key';

const TRUSTED = process.env.TRUSTED === '1';
const app = createApp({ store: fileStore(STORE), researcherKey: TRUSTED ? null : KEY, wrongKeyDelay: 0, missing: process.env.MISSING ? process.env.MISSING.split(',') : [],
  researcherUrl: 'http://localhost:' + PORT + '/analytics.html' });
const meta = { trusted: TRUSTED };
const SECURITY = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8')).headers[0].headers.map((x) => [x.key, x.value]));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, body, type) {
  res.writeHead(status, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, SECURITY));
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    const done = (out) => send(res, 200, JSON.stringify(out), 'application/json');
    const fail = (err) => done({ ok: false, error: String(err && err.message ? err.message : err) });
    if (req.method === 'GET') return app.get(Object.fromEntries(url.searchParams), meta).then(done, fail);
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => app.post(body, meta).then(done, fail));
      return;
    }
    return send(res, 405, 'Method not allowed', 'text/plain');
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(DOCS, p));
  if (!file.startsWith(DOCS)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
  });
}).listen(PORT, () => {
  console.log(`Local preview: http://localhost:${PORT}  (${TRUSTED ? 'analytics opens without a key' : 'researcher key: ' + KEY})`);
  console.log(`Data file: ${STORE}`);
});
