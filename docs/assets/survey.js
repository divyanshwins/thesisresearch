/*
 * survey.js: a small survey runner shared by Form A and Form B.
 * Pages, branching (showIf), required and soft-prompted questions, ending
 * screens for ineligible answers, per-page timing, a local draft so a
 * reload does not lose answers, and submission to the backend.
 * All respondent text is inserted with textContent, never as HTML.
 */
(function () {
  'use strict';

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  /** Wording text with **bold** spans, built as text nodes and <strong> elements (never parsed as HTML). */
  function rich(text) {
    return String(text).split('**').map(function (part, i) { return i % 2 ? h('strong', { text: part }) : document.createTextNode(part); });
  }

  function seededShuffle(arr, seedStr) {
    var s = 0;
    for (var i = 0; i < seedStr.length; i++) s = (Math.imul(31, s) + seedStr.charCodeAt(i)) >>> 0;
    function rand() { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(rand() * (j + 1)); var tmp = a[j]; a[j] = a[k]; a[k] = tmp; }
    return a;
  }

  /** The study's own details from config.js, as one line for the consent page; null if none is filled in. */
  function studyLine() {
    var st = (window.APP_CONFIG && window.APP_CONFIG.study) || {};
    var parts = [];
    if (st.researcher || st.institution) parts.push('Study by ' + [st.researcher, st.institution].filter(Boolean).join(', ') + '.');
    if (st.contact) parts.push('Questions about the study: ' + st.contact + '.');
    if (st.ethicsRef) parts.push('Ethics approval: ' + st.ethicsRef + '.');
    return parts.length ? parts.join(' ') : null;
  }
  function missingStudyInfo() {
    var st = (window.APP_CONFIG && window.APP_CONFIG.study) || {};
    return ['researcher', 'institution', 'contact', 'ethicsRef'].filter(function (k) { return !st[k]; });
  }

  // Five boxes are shown and a new one opens when the last is filled, up to ten.
  // The box count is a cue to how many answers are expected (Keusch 2014); it is the same for every respondent.
  var MIN_BOXES = 5, MAX_BOXES = 10;

  /**
   * opts: { formId, root, title, pages, action, draftKey, testMode, debrief,
   *         buildPayload(state) -> extra payload fields, onReady(state) }
   */
  function run(opts) {
    var store = window.API.store, preview = !!window.API.preview;
    // a preview keeps its own draft and never marks the device as having taken part
    var draftKey = (opts.draftKey || ('draft-' + opts.formId)) + (preview ? '-preview' : '');
    var state = store.get(draftKey), resumed = !!state;
    if (!state || !state.respondentId || state.answers === undefined) {
      resumed = false;
      state = { respondentId: window.API.uuid(), startedAt: new Date().toISOString(), answers: {}, pageTimes: {}, history: [], pageIndex: 0, perms: {}, extra: {} };
    }
    // a test run marks the device under its own key, so a real respondent on a phone used for a demo is not flagged as a repeat
    var doneKey = 'submitted-' + opts.formId + (opts.testMode ? '-test' : '');
    state.sameDeviceRepeat = !preview && !!store.get(doneKey);
    if (opts.onReady) opts.onReady(state);

    var root = opts.root, enteredAt = 0, softShownFor = null, honeypot = '';
    var pages = typeof opts.pages === 'function' ? opts.pages(state) : opts.pages;

    function save() { store.set(draftKey, state); }
    function visible(i) { var p = pages[i]; return !p.showIf || p.showIf(state.answers, state); }
    function nextVisible(i) { for (var j = i + 1; j < pages.length; j++) if (visible(j)) return j; return -1; }
    function visibleCount() { var n = 0; for (var i = 0; i < pages.length; i++) if (visible(i)) n++; return n; }
    function visibleIndex(i) { var n = 0; for (var j = 0; j < i; j++) if (visible(j)) n++; return n; }

    function leavePage() {
      var p = pages[state.pageIndex];
      var dt = Math.max(0, Math.round(performance.now() - enteredAt));
      state.pageTimes[p.id] = (state.pageTimes[p.id] || 0) + dt;
    }

    function isEmpty(q) {
      var a = state.answers[q.id];
      if (q.type === 'single') return a === undefined || a === null;
      if (q.type === 'multi') return !a || !a.length;
      if (q.type === 'text') return !a || !String(a).trim();
      if (q.type === 'freelist') return !state.answers[q.nothingId] && !(a || []).some(function (x) { return x && x.trim(); });
      if (q.type === 'custom') return !q.isAnswered(state);
      return false;
    }

    /** The shell: a bar with the study's name, an optional progress line, then the page on one sheet. */
    function frame(children, progress, firstPage) {
      root.textContent = '';
      var bar = h('header', { class: 'bar' }, [h('div', { class: 'bar-in' }, [
        h('span', { class: 'mark', 'aria-hidden': 'true' }),
        h('span', { class: 'bar-title', text: opts.title }),
        preview || opts.testMode ? h('span', { class: 'bar-tags' }, [
          preview ? h('span', { class: 'tag-test', text: 'Preview' }) : null,
          opts.testMode ? h('span', { class: 'tag-test', text: 'Test' }) : null
        ]) : null
      ])]);
      root.appendChild(bar);
      var track = h('div', { class: 'progress', 'aria-hidden': 'true' }, [h('span', { style: 'width:' + (progress === undefined ? 100 : progress) + '%' })]);
      root.appendChild(track);
      var sheet = h('div', { class: 'sheet' });
      if (preview && firstPage) {
        sheet.appendChild(h('div', { class: 'notice-test', text: 'Preview: nothing you enter here is saved or sent.' +
          (opts.formId === 'B' ? ' The items are placeholders that show the format; the real items come from Form A.' : '') }));
      }
      if (opts.testMode && firstPage) {
        if (!preview) sheet.appendChild(h('div', { class: 'notice-test', text: 'Test mode: this response is saved as a test and left out of the results.' }));
        var miss = missingStudyInfo();
        if (miss.length) sheet.appendChild(h('div', { class: 'notice-test', text: 'Before launch, fill in study.' + miss.join(', study.') + ' in assets/config.js. The consent page must name the researcher, a contact and the ethics approval.' }));
      }
      children.forEach(function (c) { sheet.appendChild(c); });
      root.appendChild(sheet);
      window.scrollTo(0, 0);
    }

    function renderQuestion(q) {
      var box;
      var errId = 'err-' + (q.id || Math.random().toString(36).slice(2));
      if (q.type === 'info') {
        var info = h('div', { class: 'q info' }, q.paragraphs.map(function (t) { return h('p', {}, rich(t)); }));
        var line = q.studyInfo ? studyLine() : null;
        if (line) info.appendChild(h('p', { class: 'study', text: line }));
        return info;
      }
      if (q.type === 'single' || q.type === 'multi') {
        var opts2 = q.options.slice();
        if (q.randomize) {
          var key = q.randomize;
          if (!state.perms[key]) {
            var free = opts2.filter(function (o) { return !o.fixed; }).map(function (o) { return o.v; });
            state.perms[key] = seededShuffle(free, state.respondentId + key);
          }
          var order = state.perms[key];
          opts2 = order.map(function (v) { return opts2.filter(function (o) { return o.v === v; })[0]; }).filter(Boolean)
            .concat(opts2.filter(function (o) { return o.fixed; }));
        }
        box = h('fieldset', { class: 'q', 'aria-describedby': errId });
        box.appendChild(h('legend', { class: 'prompt' }, rich(q.prompt)));
        if (q.help) box.appendChild(h('div', { class: 'help', text: q.help }));
        var optsWrap = h('div', { class: 'opts' });
        box.appendChild(optsWrap);
        opts2.forEach(function (o) {
          var inputType = q.type === 'single' ? 'radio' : 'checkbox';
          var cur = state.answers[q.id];
          var checked = q.type === 'single' ? cur === o.v : (cur || []).indexOf(o.v) >= 0;
          var input = h('input', { type: inputType, name: q.id, value: o.v, checked: checked });
          var otherInput = null;
          input.addEventListener('change', function () {
            if (q.type === 'single') state.answers[q.id] = o.v;
            else {
              var arr = (state.answers[q.id] || []).filter(function (x) { return x !== o.v; });
              if (input.checked) arr.push(o.v);
              state.answers[q.id] = arr;
              if (otherInput) otherInput.classList.toggle('hidden', !input.checked);
            }
            clearNotice(box); save();
          });
          optsWrap.appendChild(h('label', { class: 'opt' }, [input, h('span', { text: o.label })]));
          if (o.other) {
            otherInput = h('input', { type: 'text', class: 'other-input' + (checked ? '' : ' hidden'), maxlength: 200, 'aria-label': o.label + ': please describe', value: state.answers[o.other] || '' });
            otherInput.addEventListener('input', function () { state.answers[o.other] = otherInput.value; save(); });
            optsWrap.appendChild(otherInput);
          }
        });
      } else if (q.type === 'text') {
        box = h('div', { class: 'q' });
        var id = 'f-' + q.id;
        box.appendChild(h('label', { class: 'prompt', for: id }, rich(q.prompt).concat([q.optionalLabel ? h('span', { class: 'tag', text: ' Optional' }) : null])));
        var field = q.long ? h('textarea', { id: id, maxlength: 2000, rows: 4 }) : h('input', { type: 'text', id: id, maxlength: 200 });
        field.value = state.answers[q.id] || '';
        field.addEventListener('input', function () { state.answers[q.id] = field.value; save(); });
        box.appendChild(field);
      } else if (q.type === 'freelist') {
        box = h('fieldset', { class: 'q freelist', 'aria-describedby': errId });
        box.appendChild(h('legend', { class: 'prompt' }, rich(q.prompt)));
        if (q.help) box.appendChild(h('div', { class: 'help', text: q.help }));
        // an ordered list: the position of each entry is part of the data (Smith's salience)
        var listWrap = h('ol', { class: 'boxes' });
        box.appendChild(listWrap);
        var values = (state.answers[q.id] || []).slice();
        var inputs = [];
        function addBox(i) {
          var inp = h('input', { type: 'text', maxlength: 200, 'aria-label': 'Item ' + (i + 1), autocomplete: 'off', value: values[i] || '' });
          inp.addEventListener('input', function () {
            var arr = state.answers[q.id] || [];
            while (arr.length <= i) arr.push('');
            arr[i] = inp.value;
            state.answers[q.id] = arr;
            if (inp.value.trim() && i === inputs.length - 1 && inputs.length < MAX_BOXES) addBox(inputs.length);
            clearNotice(box); save();
          });
          inputs.push(inp);
          listWrap.appendChild(h('li', { class: 'box' }, [inp]));
        }
        var filled = 0;
        values.forEach(function (v, i) { if (v && v.trim()) filled = i + 1; });
        var startBoxes = Math.min(MAX_BOXES, Math.max(MIN_BOXES, filled + 1));
        for (var b = 0; b < startBoxes; b++) addBox(b);
        var nothing = h('input', { type: 'checkbox', checked: !!state.answers[q.nothingId] });
        function applyNothing() {
          inputs.forEach(function (inp) { inp.disabled = nothing.checked; if (nothing.checked) inp.value = ''; });
          if (nothing.checked) state.answers[q.id] = [];
        }
        nothing.addEventListener('change', function () { state.answers[q.nothingId] = nothing.checked; applyNothing(); clearNotice(box); save(); });
        box.appendChild(h('label', { class: 'opt opt-nothing' }, [nothing, h('span', { text: q.nothingLabel })]));
        applyNothing();
      } else if (q.type === 'custom') {
        box = h('div', { class: 'q', 'aria-describedby': errId });
        q.render(box, { state: state, save: save, rich: rich, next: function () { go(+1, true); }, clearNotice: function () { clearNotice(box); } });
      }
      box.appendChild(h('div', { id: errId, class: 'slot', 'aria-live': 'polite' }));
      box._q = q;
      return box;
    }

    function clearNotice(box) { var s = box.querySelector('.slot'); if (s) s.textContent = ''; }
    function showNotice(box, cls, text) { var s = box.querySelector('.slot'); s.textContent = ''; s.appendChild(h('div', { class: 'notice ' + cls, text: text })); }

    var qBoxes = [];
    function renderPage() {
      var p = pages[state.pageIndex];
      softShownFor = null;
      var heading = h('h1', { tabindex: '-1', text: p.title });
      var kids = [heading];
      if (state.pageIndex === 0 && state.sameDeviceRepeat) kids.push(h('div', { class: 'notice soft', text: 'This survey seems to have been completed on this device before. If you are a different person using the same device, you are welcome to continue.' }));
      if (resumed) { kids.push(h('div', { class: 'notice soft', text: 'Welcome back. Your earlier answers were kept on this device, and you are continuing where you left off.' })); resumed = false; }
      if (p.intro) kids.push(h('p', { class: 'intro' }, rich(p.intro)));
      qBoxes = p.questions.map(function (q) { return renderQuestion(q); });
      kids = kids.concat(qBoxes);
      if (state.pageIndex === 0) {
        // honeypot for bots: hidden from people and screen readers
        var hp = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', style: 'position:absolute;left:-10000px;width:1px;height:1px;opacity:0' });
        hp.addEventListener('input', function () { honeypot = hp.value; });
        kids.push(hp);
      }
      if (p.note) kids.push(h('p', { class: 'page-note', text: p.note }));
      // On the first page Back leaves the survey for the page the respondent came from.
      // A page marked lockBack has none: going back there would let earlier, unprimed answers be revised.
      var atStart = state.history.length === 0;
      var canBack = atStart || !p.lockBack;
      var isLast = nextVisible(state.pageIndex) === -1;
      var nav = h('div', { class: 'nav' }, [
        h('button', { class: 'btn primary', type: 'button', text: isLast ? 'Submit' : 'Next', onclick: function () { go(+1); } }),
        canBack ? h('button', { class: 'btn secondary', type: 'button', text: 'Back', onclick: function () { if (atStart) leave(); else go(-1); } }) : null
      ]);
      kids.push(nav);
      frame(kids, Math.round(100 * visibleIndex(state.pageIndex) / visibleCount()), state.pageIndex === 0);
      heading.focus({ preventScroll: true });
      enteredAt = performance.now();
    }

    /** Leaves the survey from its first page: back in the browser, or to the study's home page when there is no earlier page. */
    function leave() {
      leavePage(); save();
      if (window.history.length > 1) window.history.back();
      else window.location.href = 'index.html';
    }

    /**
     * The screen for an answer that ends the survey (no consent, not eligible). Nothing is kept
     * on the device, as the text says; Back restores the answers still held in memory, so a
     * mis-tap can be corrected.
     */
    function endScreen(text) {
      store.remove(draftKey);
      frame([h('div', { class: 'end' }, [h('h1', { text: 'Thank you' }), h('p', { text: text }),
        h('div', { class: 'nav nav-start' }, [h('button', { class: 'btn secondary', type: 'button', text: 'Back', onclick: function () { save(); renderPage(); } })])])]);
    }

    function go(dir, fromSkip) {
      if (dir < 0) {
        leavePage();
        state.pageIndex = state.history.pop();
        save(); renderPage(); return;
      }
      var blocked = false, softNeeded = false;
      for (var i = 0; i < qBoxes.length; i++) {
        var box = qBoxes[i], q = box._q;
        if (!q || q.type === 'info') continue;
        if (q.type === 'single' && state.answers[q.id] !== undefined) {
          var chosen = q.options.filter(function (o) { return o.v === state.answers[q.id]; })[0];
          if (chosen && chosen.end) { leavePage(); endScreen(q.endText || 'Thank you.'); return; }
        }
        if (q.type === 'custom' && !fromSkip) {
          var err = q.validate(state);
          if (err) { showNotice(box, 'error', err); blocked = true; continue; }
        }
        if (q.required && isEmpty(q)) { showNotice(box, 'error', 'Please answer this question to continue.'); blocked = true; continue; }
        // one gentle reminder per page for an empty question (a soft prompt, not a forced answer)
        if (!q.required && !q.quiet && q.type !== 'custom' && isEmpty(q) && softShownFor !== state.pageIndex) {
          showNotice(box, 'soft', 'You have not answered this question. You can answer it now, or press Next again to continue.');
          softNeeded = true;
        }
      }
      if (blocked) return;
      if (softNeeded) { softShownFor = state.pageIndex; return; }
      leavePage();
      var nxt = nextVisible(state.pageIndex);
      if (nxt === -1) { save(); submit(); return; }
      state.history.push(state.pageIndex);
      state.pageIndex = nxt;
      save(); renderPage();
    }

    function cleanAnswers() {
      var a = {};
      Object.keys(state.answers).forEach(function (k) {
        var v = state.answers[k];
        if (Array.isArray(v)) a[k] = v.map(function (x) { return typeof x === 'string' ? x.trim() : x; }).filter(function (x) { return x !== ''; });
        else if (typeof v === 'string') a[k] = v.trim();
        else a[k] = v;
      });
      return a;
    }

    function submit() {
      var payload = {
        formVersion: opts.formVersion, test: !!opts.testMode, respondentId: state.respondentId, startedAt: state.startedAt,
        pageTimes: state.pageTimes, sameDeviceRepeat: state.sameDeviceRepeat, answers: cleanAnswers(), hp: honeypot
      };
      var extra = opts.buildPayload ? opts.buildPayload(state) : {};
      Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
      function thanks() {
        var support = window.APP_CONFIG && window.APP_CONFIG.supportText;
        frame([h('div', { class: 'end' }, [
          h('h1', { text: 'Thank you' }),
          // the closing line says the answers were saved, which a preview must not claim
          preview ? h('div', { class: 'notice-test', text: 'Preview: your answers were not sent or saved anywhere.' }) : h('p', { text: window.QUESTIONS.closing }),
          opts.debrief ? h('p', { text: opts.debrief }) : null,
          support ? h('p', { class: 'muted', text: support }) : null
        ])]);
      }
      if (preview) { store.remove(draftKey); thanks(); return; }
      frame([h('div', { class: 'end' }, [h('h1', { text: 'Sending your answers' }), h('p', { class: 'muted', text: 'One moment…' })])]);
      window.API.post({ action: opts.action, payload: payload }).then(function () {
        store.set(doneKey, true);
        store.remove(draftKey);
        thanks();
      }).catch(function (err) {
        frame([h('div', { class: 'end' }, [
          h('h1', { text: 'Your answers were not sent' }),
          h('p', { text: err.message }),
          h('p', { class: 'muted', text: 'Your answers are kept on this device. Check your connection and try again.' }),
          h('div', { class: 'nav' }, [
            h('button', { class: 'btn primary', type: 'button', text: 'Try again', onclick: submit }),
            h('button', { class: 'btn secondary', type: 'button', text: 'Back to the last page', onclick: function () { renderPage(); } })
          ])
        ])]);
      });
    }

    if (state.pageIndex >= pages.length || !visible(state.pageIndex)) { state.pageIndex = 0; state.history = []; }
    resumed = resumed && state.pageIndex > 0;
    renderPage();
    return { state: state };
  }

  window.Survey = { run: run, h: h, rich: rich, seededShuffle: seededShuffle };
})();
