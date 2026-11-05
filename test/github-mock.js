'use strict';
/**
 * A stand-in for the parts of the GitHub REST API that backend/store-github.js uses: repository
 * metadata, the contents API (get, create, update, delete) and the tarball download (a redirect,
 * then the archive). Each repository is a real git repository in a temporary folder, every write
 * is a commit, and archives are made by `git archive`, the tool GitHub uses for them. Status codes
 * and messages follow GitHub's documented behaviour (401 bad token, 404 missing, 409 sha mismatch
 * or a concurrent commit, 422 sha not supplied for an existing file).
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ENV = { ...process.env, GIT_AUTHOR_NAME: 'mock', GIT_AUTHOR_EMAIL: 'mock@example.org', GIT_COMMITTER_NAME: 'mock', GIT_COMMITTER_EMAIL: 'mock@example.org' };

function startGithubMock(opts) {
  const token = (opts && opts.token) || 'good-token';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'github-mock-'));
  const repos = {};
  const git = (dir, args) => execFileSync('git', args, { cwd: dir, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });

  function createRepo(name, withReadme) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    git(dir, ['init', '-q', '-b', 'main']);
    const r = { name, dir, commits: 0, faults: { put409: 0 }, requests: [] };
    if (withReadme) { fs.writeFileSync(path.join(dir, 'README.md'), '# data\n'); commit(r, 'Initial commit'); }
    repos[name] = r;
    return r;
  }
  function commit(r, message) { git(r.dir, ['add', '-A']); git(r.dir, ['commit', '-q', '--allow-empty', '-m', message]); r.commits++; }
  function blobSha(file) { return git(path.dirname(file), ['hash-object', file]).toString().trim(); }

  function reply(res, status, obj, extra) {
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, extra || {}));
    res.end(obj === undefined ? '' : JSON.stringify(obj));
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const code = /^\/codeload\/([^/]+)\/([0-9a-f]+)$/.exec(url.pathname);
      if (code) {
        const r = repos[code[1]];
        // a long top folder, so that paths pass 100 bytes and git writes pax headers
        const tgz = git(r.dir, ['archive', '--format=tar.gz', '--prefix=divyanshwins-' + r.name + '-' + code[2] + '-padding-to-pass-one-hundred-bytes/', code[2]]);
        res.writeHead(200, { 'Content-Type': 'application/x-gzip' });
        return res.end(tgz);
      }
      const m = /^\/repos\/o\/([^/]+)(\/.*)?$/.exec(url.pathname);
      if (!m) return reply(res, 404, { message: 'Not Found' });
      if (req.headers.authorization !== 'Bearer ' + token) return reply(res, 401, { message: 'Bad credentials' });
      const r = repos[m[1]];
      if (!r) return reply(res, 404, { message: 'Not Found' });
      const rest = m[2] || '';
      r.requests.push(req.method + ' ' + rest);
      if (rest === '' && req.method === 'GET') return reply(res, 200, { full_name: 'o/' + r.name, private: true, size: r.commits ? 1 : 0 });
      if (rest === '/tarball' && req.method === 'GET') {
        if (!r.commits) return reply(res, 404, { message: 'Not Found' });
        const head = git(r.dir, ['rev-parse', 'HEAD']).toString().trim();
        res.writeHead(302, { Location: 'http://127.0.0.1:' + server.address().port + '/codeload/' + r.name + '/' + head });
        return res.end();
      }
      const c = /^\/contents\/(.+)$/.exec(rest);
      if (!c) return reply(res, 404, { message: 'Not Found' });
      const rel = decodeURIComponent(c[1]), file = path.join(r.dir, rel);
      const exists = r.commits > 0 && fs.existsSync(file);
      const input = body ? JSON.parse(body) : {};
      if (req.method === 'GET') {
        if (!r.commits) return reply(res, 404, { message: 'This repository is empty.' });
        if (!exists) return reply(res, 404, { message: 'Not Found' });
        const b64 = fs.readFileSync(file).toString('base64').replace(/.{60}/g, '$&\n');
        return reply(res, 200, { type: 'file', encoding: 'base64', path: rel, content: b64, sha: blobSha(file) });
      }
      if (req.method === 'PUT') {
        if (exists) {
          if (!input.sha) return reply(res, 422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
          const current = blobSha(file);
          if (input.sha !== current) return reply(res, 409, { message: rel + ' does not match ' + current });
        } else if (r.faults.put409 > 0) {
          r.faults.put409--;
          return reply(res, 409, { message: 'is at 1111111 but expected 2222222' });
        }
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(input.content, 'base64'));
        commit(r, input.message || 'update');
        return reply(res, exists ? 200 : 201, { content: { path: rel, sha: blobSha(file) } });
      }
      if (req.method === 'DELETE') {
        if (!exists) return reply(res, 404, { message: 'Not Found' });
        if (input.sha !== blobSha(file)) return reply(res, 409, { message: rel + ' does not match' });
        fs.unlinkSync(file);
        commit(r, input.message || 'delete');
        return reply(res, 200, { commit: {} });
      }
      return reply(res, 405, { message: 'Method not allowed' });
    });
  });

  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    base: 'http://127.0.0.1:' + server.address().port,
    token,
    repos,
    createRepo,
    close: () => new Promise((done) => server.close(() => { fs.rmSync(root, { recursive: true, force: true }); done(); }))
  })));
}

module.exports = { startGithubMock };
