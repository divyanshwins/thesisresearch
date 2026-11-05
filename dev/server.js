'use strict';
/**
 * Local preview: serves the website in docs/ and runs the real backend
 * (backend/Code.gs + Engine.gs) through dev/gas-mock.js at /api.
 * Data is kept in dev/data/store.json (git-ignored). Researcher key: dev-key
 *
 *   npm run dev            -> http://localhost:8787
 *   PORT=9000 npm run dev  -> another port
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createBackend } = require('./gas-mock');

const PORT = Number(process.env.PORT) || 8787;
const DOCS = path.join(__dirname, '..', 'docs');
const STORE = process.env.STORE || path.join(__dirname, 'data', 'store.json');

const backend = createBackend(STORE);
const props = backend.ctx.PropertiesService.getScriptProperties();
if (!props.getProperty('RESEARCHER_KEY')) props.setProperty('RESEARCHER_KEY', 'dev-key');
backend.ctx.setup();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    if (req.method === 'GET') {
      const out = backend.ctx.doGet({ parameter: Object.fromEntries(url.searchParams) });
      return send(res, 200, out.getContent(), 'application/json');
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        const out = backend.ctx.doPost({ postData: { contents: body, type: req.headers['content-type'] } });
        send(res, 200, out.getContent(), 'application/json');
      });
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
  console.log(`Local preview: http://localhost:${PORT}  (researcher key: ${props.getProperty('RESEARCHER_KEY')})`);
  console.log(`Data file: ${STORE}`);
});
