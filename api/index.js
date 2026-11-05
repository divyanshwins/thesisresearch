'use strict';
/**
 * api/index.js: the Vercel function at /api. It connects the request handling in
 * backend/app.js to the study's private storage.
 *
 * Storage, chosen from what is connected in Vercel (nothing secret is in this repository):
 *   - a private Vercel Blob store connected to the project (BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN,
 *     both added by Vercel itself when the store is connected), or
 *   - a private GitHub repository, if GITHUB_TOKEN is set (DATA_REPO names it).
 *
 * Who may use the researcher actions (results, coding, freeze, export, withdraw):
 *   - anyone who reaches this function through one of the project's own Vercel addresses (the
 *     branch address, or this deployment's address). Vercel Deployment Protection lets only the
 *     owner's Vercel account open those, and this file checks that the protection is really on;
 *   - or, if RESEARCHER_KEY is set (at least 16 characters), anyone with that key.
 * The public address (the production domain) never gets researcher access without the key.
 */
const { createApp } = require('../backend/app');

const DEFAULT_DATA_REPO = 'divyanshwins/thesisresearch-data';
const MIN_KEY_LENGTH = 16;
const MAX_BODY_BYTES = 400000;
const PROTECTION_RECHECK_MS = 5 * 60 * 1000;

let app = null, protection = { at: 0, on: false };

function privateHosts() {
  return [process.env.VERCEL_BRANCH_URL, process.env.VERCEL_URL].filter(Boolean).map((h) => h.toLowerCase());
}
function publicHosts() {
  return [process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map((h) => h.toLowerCase());
}

function getApp() {
  if (app) return app;
  const env = process.env, missing = [];
  let store = null;
  if (env.GITHUB_TOKEN) {
    store = require('../backend/store-github').githubStore({ token: env.GITHUB_TOKEN, repo: env.DATA_REPO || DEFAULT_DATA_REPO });
  } else if (env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN) {
    store = require('../backend/store-blob').blobStore();
  } else {
    missing.push('a private Vercel Blob store connected to the project');
  }
  const key = env.RESEARCHER_KEY && env.RESEARCHER_KEY.length >= MIN_KEY_LENGTH ? env.RESEARCHER_KEY : null;
  const branch = env.VERCEL_BRANCH_URL;
  app = createApp({ store, researcherKey: key, missing, researcherUrl: branch ? 'https://' + branch + '/analytics.html' : null });
  return app;
}

/**
 * Is Vercel's login protection on for the private address? Asks for it without any credentials:
 * a protected address answers with a redirect to Vercel's sign-in (or 401); an open one answers 200.
 * Fails closed: if the check cannot be made, the address is not trusted.
 */
async function protectionOn() {
  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (!host) return false;
  if (Date.now() - protection.at < PROTECTION_RECHECK_MS) return protection.on;
  let on = false;
  try {
    const r = await fetch('https://' + host + '/api?action=ping', { redirect: 'manual', signal: AbortSignal.timeout(4000) });
    on = r.status === 401 || r.status === 403 || ((r.status === 302 || r.status === 307) && /vercel\.com\/(sso|login)/.test(r.headers.get('location') || ''));
  } catch (e) { on = false; }
  protection = { at: Date.now(), on };
  return on;
}

/**
 * The request is trusted when it arrived on one of the project's private addresses, came from a page
 * on that same address (the Origin header, which a browser always sends with a POST and another site
 * cannot set), and Vercel's login protection is on.
 */
async function trusted(req, isPost) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!host || publicHosts().includes(host) || !privateHosts().includes(host)) return false;
  if (isPost && req.headers.origin !== 'https://' + host) return false;
  return protectionOn();
}

/** The raw request body as text, whether or not Vercel has already parsed it. */
function bodyText(req) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  if (req.body && typeof req.body === 'object') return Promise.resolve(JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY_BYTES) { req.destroy(); reject(new Error('Request too large.')); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  let out;
  try {
    if (req.method === 'GET') {
      const params = req.query || Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
      // the ping is what protectionOn() asks for, so it must not depend on it
      out = await getApp().get(params, params.action === 'config' ? { trusted: await trusted(req, false) } : {});
    } else if (req.method === 'POST') {
      const body = await bodyText(req);
      out = await getApp().post(body, { trusted: await trusted(req, true) });
    } else {
      res.statusCode = 405;
      out = { ok: false, error: 'Method not allowed.' };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  res.end(JSON.stringify(out));
}

module.exports = handler;
module.exports._reset = () => { app = null; protection = { at: 0, on: false }; };
