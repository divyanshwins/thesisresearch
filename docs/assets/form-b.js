/*
 * form-b.js: Form B (best-worst ranking). Loads the frozen item list and
 * design from the backend, randomises set order and item order for each
 * respondent, and records which items were shown in which position.
 */
(function () {
  'use strict';
  var h = window.Survey.h, shuffle = window.Survey.seededShuffle, root = document.getElementById('app'), Q = window.QUESTIONS.formB;
  var testMode = /[?&]test=1(&|$)/.test(location.search);

  function message(title, text, retry) {
    root.textContent = '';
    root.appendChild(h('div', { class: 'sheet' }, [h('div', { class: 'end' }, [h('h1', { text: title }), h('p', { text: text }),
      retry ? h('button', { class: 'btn primary', type: 'button', text: 'Try again', onclick: start }) : null])]));
  }

  function record(state, key) {
    state.extra.bws = state.extra.bws || {};
    return state.extra.bws[key] || (state.extra.bws[key] = { best: null, worst: null, skipped: false });
  }

  function answered(state, key) {
    var r = record(state, key);
    return r.skipped || (r.best !== null && r.worst !== null);
  }

  /**
   * One best-worst set. items: [{label, description}], shown: indices into items in display order.
   * Layout: a Most button, the item, a Least button on one row. Both buttons look the same
   * when chosen; their column and label say which is which, so neither choice carries a colour.
   */
  function bwsQuestion(key, items, shown, stem, counter) {
    return {
      type: 'custom', id: key,
      isAnswered: function (state) { return answered(state, key); },
      validate: function (state) {
        var r = record(state, key);
        if (answered(state, key)) return null;
        if (r.best === null && r.worst === null) return 'Choose one item as Most and one as Least, or use “Skip this set”.';
        return r.best === null ? 'Now choose the one that matters most.' : 'Now choose the one that matters least.';
      },
      render: function (box, ctx) {
        var rec = record(ctx.state, key), rows = [];
        var group = h('div', { class: 'bws', role: 'group', 'aria-labelledby': 'stem-' + key });
        if (counter) box.appendChild(h('p', { class: 'setcount', text: counter }));
        box.appendChild(h('p', { class: 'prompt bws-stem', id: 'stem-' + key }, ctx.rich(stem)));
        group.appendChild(h('div', { class: 'bws-head', 'aria-hidden': 'true' }, [h('span', { text: 'Most' }), h('span'), h('span', { text: 'Least' })]));
        function paint() {
          rows.forEach(function (r) {
            r.most.setAttribute('aria-pressed', String(rec.best === r.item));
            r.least.setAttribute('aria-pressed', String(rec.worst === r.item));
            r.row.classList.toggle('is-picked', rec.best === r.item || rec.worst === r.item);
          });
        }
        shown.forEach(function (item) {
          var it = items[item];
          var most = h('button', { type: 'button', class: 'pick', 'aria-pressed': 'false', 'aria-label': 'Most: ' + it.label, text: 'Most' });
          var least = h('button', { type: 'button', class: 'pick', 'aria-pressed': 'false', 'aria-label': 'Least: ' + it.label, text: 'Least' });
          most.addEventListener('click', function () { rec.best = item; if (rec.worst === item) rec.worst = null; rec.skipped = false; paint(); ctx.clearNotice(); ctx.save(); });
          least.addEventListener('click', function () { rec.worst = item; if (rec.best === item) rec.best = null; rec.skipped = false; paint(); ctx.clearNotice(); ctx.save(); });
          var row = h('div', { class: 'bws-row' }, [most, h('div', { class: 'bws-item' }, [
            h('div', { class: 'label', text: it.label }), it.description ? h('div', { class: 'desc', text: it.description }) : null]), least]);
          rows.push({ item: item, most: most, least: least, row: row });
          group.appendChild(row);
        });
        box.appendChild(group);
        box.appendChild(h('button', { type: 'button', class: 'linkbtn', text: 'Skip this set', onclick: function () {
          rec.best = null; rec.worst = null; rec.skipped = true; ctx.save(); ctx.next();
        } }));
        paint();
      }
    };
  }

  function start() {
    message('Loading', 'One moment…');
    window.API.get('config').then(function (cfg) {
      var fb = cfg.formB;
      if (!fb || !fb.open) { message('This survey is not open yet', 'Please check back later. Thank you for your interest.'); return; }
      var n = fb.sets.length;
      window.Survey.run({
        formId: 'B', formVersion: 'B-2.0', title: Q.title, root: root, action: 'submitB', testMode: testMode,
        draftKey: 'draft-B2-v' + fb.designVersion + (testMode ? '-test' : ''),
        onReady: function (state) {
          if (!state.extra.setOrder || state.extra.setOrder.length !== n) {
            state.extra.setOrder = shuffle(fb.sets.map(function (_, i) { return i; }), state.respondentId + 'sets');
            state.extra.itemOrder = fb.sets.map(function (set, i) { return shuffle(set, state.respondentId + 'set' + i); });
            state.extra.practiceOrder = shuffle([0, 1, 2, 3], state.respondentId + 'practice');
          }
        },
        pages: function (state) {
          var intro = Q.instructions.map(function (t) { return t.replace('{n}', String(n)); });
          var pages = [Q.consent, Q.eligibility, { id: 'practice', title: 'How this works', questions: [
            { type: 'info', paragraphs: intro },
            bwsQuestion('practice', Q.practice.items, state.extra.practiceOrder, Q.practice.stem, 'Example, not counted')
          ] }];
          state.extra.setOrder.forEach(function (s, k) {
            pages.push({ id: 'set' + s, title: 'Set ' + (k + 1) + ' of ' + n, questions: [
              bwsQuestion('set' + s, fb.items, state.extra.itemOrder[s], Q.stem, null)
            ] });
          });
          pages.push(Q.travel, Q.debrief);
          return pages;
        },
        buildPayload: function (state) {
          var sameA = !!window.API.store.get('submitted-A' + (testMode ? '-test' : ''));
          return {
            designVersion: fb.designVersion,
            sameDeviceFormA: sameA,
            bws: state.extra.setOrder.map(function (s) {
              var r = record(state, 'set' + s), ok = !r.skipped && r.best !== null && r.worst !== null;
              return { set: s, shown: state.extra.itemOrder[s], best: ok ? r.best : null, worst: ok ? r.worst : null, ms: ('set' + s) in state.pageTimes ? state.pageTimes['set' + s] : null };
            })
          };
        }
      });
    }).catch(function (err) { message('The survey could not load', err.message, true); });
  }
  start();
})();
