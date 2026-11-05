'use strict';
/**
 * api/index.js: the Vercel function at /api. It connects the request handling in
 * backend/app.js to the private data repository on GitHub.
 *
 * Settings, in Vercel → Project → Settings → Environment Variables (never in this repository):
 *   GITHUB_TOKEN    a fine-grained GitHub token with Contents: read and write on the data repository only
 *   RESEARCHER_KEY  the password for the analytics page, at least 16 characters
 *   DATA_REPO       optional: owner/name of the data repository (default below)
 * Until both secrets are set, the forms run as a preview and nothing can be saved.
 */
const { createApp } = require('../backend/app');
const { githubStore } = require('../backend/store-github');

const DEFAULT_DATA_REPO = 'divyanshwins/thesisresearch-data';
const MIN_KEY_LENGTH = 16;
const MAX_BODY_BYTES = 400000;

let app = null;
function getApp() {
  if (app) return app;
  const env = process.env, missing = [];
  if (!env.GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
  if (!env.RESEARCHER_KEY || env.RESEARCHER_KEY.length < MIN_KEY_LENGTH) missing.push('RESEARCHER_KEY (at least ' + MIN_KEY_LENGTH + ' characters)');
  const store = env.GITHUB_TOKEN ? githubStore({ token: env.GITHUB_TOKEN, repo: env.DATA_REPO || DEFAULT_DATA_REPO }) : null;
  app = createApp({ store, researcherKey: missing.length ? null : env.RESEARCHER_KEY, missing });
  return app;
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

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  let out;
  try {
    if (req.method === 'GET') {
      const params = req.query || Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
      out = await getApp().get(params);
    } else if (req.method === 'POST') {
      out = await getApp().post(await bodyText(req));
    } else {
      res.statusCode = 405;
      out = { ok: false, error: 'Method not allowed.' };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  res.end(JSON.stringify(out));
};
