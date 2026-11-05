/*
 * api.js: talks to the backend at /api on the same site. POST bodies are sent as text/plain.
 */
(function () {
  'use strict';

  var NOT_CONNECTED = 'This copy has no backend address (apiUrl in assets/config.js).';
  function apiUrl() {
    var u = window.APP_CONFIG && window.APP_CONFIG.apiUrl;
    return u && u.indexOf('PASTE_') !== 0 ? u : null;
  }
  function copy(x) { return JSON.parse(JSON.stringify(x)); }

  function parse(res) {
    if (!res.ok) throw new Error('The server answered with status ' + res.status + '.');
    return res.json().then(function (data) {
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Unexpected answer from the server.');
      return data;
    });
  }

  // Both return a promise in every case, so a missing address reaches the page's error message
  // instead of leaving it on "Loading".
  function get(action) {
    if (API.preview && action === 'config') return Promise.resolve(copy(window.PREVIEW_CONFIG));
    if (!apiUrl()) return Promise.reject(new Error(NOT_CONNECTED));
    return fetch(apiUrl() + '?action=' + encodeURIComponent(action), { method: 'GET', redirect: 'follow', cache: 'no-store' }).then(parse).then(function (data) {
      // The backend is deployed but its storage is not set up yet (secrets missing in Vercel):
      // nothing can be saved, so the forms run as the labelled preview. Any other failure is shown as an error.
      if (action === 'config' && data.configured === false) {
        API.connected = false;
        API.missing = data.missing || [];
        if (window.PREVIEW_CONFIG) { API.preview = true; return copy(window.PREVIEW_CONFIG); }
      }
      // how the analytics page lets the researcher in: 'signed-in' (this is the private address),
      // 'key' (a researcher key is set), or 'private-address' (open analytics at researcherUrl)
      if (action === 'config') { API.researcher = data.researcher || null; API.researcherUrl = data.researcherUrl || null; }
      return data;
    });
  }

  function post(body) {
    if (!apiUrl()) return Promise.reject(new Error(NOT_CONNECTED));
    return fetch(apiUrl(), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(parse);
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /** localStorage access that never throws (private windows, blocked storage). */
  var store = {
    get: function (k) { try { var v = localStorage.getItem(k); return v === null ? null : JSON.parse(v); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };

  // ?preview=1 shows the preview on a connected copy, for showing the format to someone.
  var API = {
    get: get, post: post, uuid: uuid, store: store,
    preview: !!window.PREVIEW_CONFIG && (!apiUrl() || /[?&]preview=1(&|$)/.test(location.search)),
    connected: !!apiUrl(),
    missing: []
  };
  window.API = API;
})();
