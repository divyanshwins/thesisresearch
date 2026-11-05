/* form-a.js: starts Form A (elicitation) once the backend confirms it is open. */
(function () {
  'use strict';
  var h = window.Survey.h, root = document.getElementById('app'), Q = window.QUESTIONS.formA;
  var testMode = /[?&]test=1(&|$)/.test(location.search);

  function message(title, text, retry) {
    root.textContent = '';
    root.appendChild(h('div', { class: 'sheet' }, [h('div', { class: 'end' }, [h('h1', { text: title }), h('p', { text: text }),
      retry ? h('button', { class: 'btn primary', type: 'button', text: 'Try again', onclick: start }) : null])]));
  }

  function start() {
    message('Loading', 'One moment…');
    window.API.get('config').then(function (cfg) {
      if (!cfg.formAOpen) { message('This survey is closed', 'Thank you for your interest.'); return; }
      window.Survey.run({
        formId: 'A', formVersion: 'A-2.0', title: Q.title, root: root, pages: Q.pages, debrief: Q.debrief,
        action: 'submitA', draftKey: 'draft-A2' + (testMode ? '-test' : ''), testMode: testMode
      });
    }).catch(function (err) { message('The survey could not load', err.message, true); });
  }
  start();
})();
