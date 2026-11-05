/*
 * charts.js: the three analytics charts. Single series, one hue (--data) on
 * the main data element, faint grid, values also listed in the tables beside
 * each chart. Every mark has a hover/focus tooltip.
 */
(function () {
  'use strict';
  var h = window.Survey.h, NS = 'http://www.w3.org/2000/svg';

  var tip = null;
  function tooltip() {
    if (!tip) { tip = h('div', { class: 'tooltip hidden', role: 'status' }); document.body.appendChild(tip); }
    return tip;
  }
  function showTip(evt, value, label) {
    var t = tooltip();
    t.textContent = '';
    t.appendChild(h('strong', { text: value }));
    t.appendChild(h('span', { text: label }));
    t.classList.remove('hidden');
    var x = evt.clientX, y = evt.clientY;
    if (x === undefined || (x === 0 && y === 0)) { var r = evt.target.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    t.style.left = Math.max(8, Math.min(window.innerWidth - 290, x + 12)) + 'px';
    t.style.top = (y + 14) + 'px';
  }
  function hideTip() { if (tip) tip.classList.add('hidden'); }

  function s(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') el.textContent = attrs[k]; else el.setAttribute(k, attrs[k]); });
    return el;
  }
  function niceStep(max, ticks) {
    var raw = max / ticks, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  /** Drawing width in SVG units close to the rendered width, so 12px text stays about 12px on a phone and on a desktop. */
  function chartWidth() { return Math.max(320, Math.min(1060, (window.innerWidth || 1060) - 120)); }
  function bindTip(el, value, label) {
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', label + ': ' + value);
    el.addEventListener('pointermove', function (e) { showTip(e, value, label); });
    el.addEventListener('pointerleave', hideTip);
    el.addEventListener('focus', function (e) { showTip(e, value, label); });
    el.addEventListener('blur', hideTip);
  }

  /**
   * Dot-and-interval chart of weights (or standardised scores), one row per item, in rank order.
   * rows: [{rank, label, value, lo, hi, valueText, rangeText}], domain: [min, max], fmt: tick formatter
   */
  function dotInterval(rows, domain, fmt) {
    // HTML rows (not SVG) so long parameter names wrap instead of being cut off
    var pos = function (v) { return (100 * (v - domain[0]) / (domain[1] - domain[0])).toFixed(3) + '%'; };
    var step = niceStep(domain[1] - domain[0], 5), ticks = [];
    for (var t = Math.ceil(domain[0] / step - 1e-9) * step; t <= domain[1] + 1e-12; t += step) ticks.push(t);
    function gridFor(track) {
      ticks.forEach(function (tk) { track.appendChild(h('span', { class: 'di-grid', style: 'left:' + pos(tk) })); });
      if (domain[0] < 0) track.appendChild(h('span', { class: 'di-grid di-zero', style: 'left:' + pos(0) }));
    }
    var wrap = h('div', { class: 'di', role: 'img', 'aria-label': 'Ranking with 95% intervals; the values are in the table below' });
    rows.forEach(function (r) {
      var track = h('div', { class: 'di-track' });
      gridFor(track);
      if (r.lo !== null && r.lo !== undefined) {
        var lo = Math.max(domain[0], r.lo), hi = Math.min(domain[1], r.hi);
        track.appendChild(h('span', { class: 'di-whisker', style: 'left:' + pos(lo) + ';width:calc(' + pos(hi) + ' - ' + pos(lo) + ')' }));
      }
      track.appendChild(h('span', { class: 'di-dot', style: 'left:' + pos(r.value) }));
      var row = h('div', { class: 'di-row' }, [
        h('div', { class: 'di-label' }, [h('span', { class: 'rk', text: String(r.rank) }), r.label]),
        track,
        h('div', { class: 'di-val', text: r.valueShort || '' })
      ]);
      bindTip(row, r.valueText, r.label + (r.rangeText ? ' · ' + r.rangeText : ''));
      wrap.appendChild(row);
    });
    var axis = h('div', { class: 'di-track di-axis' });
    ticks.forEach(function (tk) { axis.appendChild(h('span', { class: 'di-tick', style: 'left:' + pos(tk), text: fmt(tk) })); });
    wrap.appendChild(h('div', { class: 'di-row', 'aria-hidden': 'true' }, [h('div'), axis, h('div')]));
    return wrap;
  }

  /** Smith's S by rank for the eligible parameters, with the elbow and the chosen cut-off K marked. */
  function salienceCurve(rows, elbowIdx, cutK) {
    var W = chartWidth(), H = 240, left = 48, right = 20, top = 16, bottom = 34;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': "Smith's salience by rank; the values are in the table below" });
    var n = rows.length, maxS = Math.max.apply(null, rows.map(function (r) { return r.smithS; }).concat([0.0001]));
    var step = niceStep(maxS, 4), yMax = Math.ceil(maxS / step - 1e-9) * step;
    var x = function (i) { return left + (n === 1 ? 0.5 : i / (n - 1)) * (W - left - right); };
    var y = function (v) { return top + (1 - v / yMax) * (H - top - bottom); };
    for (var t = 0; t <= yMax + 1e-12; t += step) {
      svg.appendChild(s('line', { x1: left, x2: W - right, y1: y(t), y2: y(t), class: 'grid' }));
      svg.appendChild(s('text', { x: left - 8, y: y(t) + 4, 'text-anchor': 'end', text: t.toFixed(2) }));
    }
    svg.appendChild(s('text', { x: (left + W - right) / 2, y: H - 6, 'text-anchor': 'middle', text: 'Rank among eligible parameters' }));
    if (cutK && cutK < n) {
      var cx = (x(cutK - 1) + x(cutK)) / 2;
      svg.appendChild(s('line', { x1: cx, x2: cx, y1: top, y2: H - bottom, class: 'ref' }));
      svg.appendChild(s('text', { x: cx + 6, y: top + 10, text: 'cut-off K = ' + cutK }));
    }
    var d = rows.map(function (r, i) { return (i ? 'L' : 'M') + x(i) + ' ' + y(r.smithS); }).join(' ');
    svg.appendChild(s('path', { d: d, class: 'line' }));
    rows.forEach(function (r, i) {
      var every = Math.max(1, Math.ceil(n / Math.floor((W - left - right) / 28)));
      if (i % every === 0) svg.appendChild(s('text', { x: x(i), y: H - bottom + 16, 'text-anchor': 'middle', text: String(i + 1) }));
      var hit = s('circle', { cx: x(i), cy: y(r.smithS), r: 12, class: 'hit' });
      svg.appendChild(hit);
      svg.appendChild(s('circle', { cx: x(i), cy: y(r.smithS), r: i === elbowIdx ? 6 : 4, class: 'mark ring' }));
      bindTip(hit, 'S = ' + r.smithS.toFixed(3), (i + 1) + '. ' + r.label + ' · listed by ' + r.freq + (i === elbowIdx ? ' · elbow' : ''));
    });
    if (elbowIdx !== null && elbowIdx !== undefined && rows[elbowIdx]) {
      svg.appendChild(s('text', { x: x(elbowIdx) + 10, y: y(rows[elbowIdx].smithS) - 10, class: 'lbl', text: 'elbow' }));
    }
    return svg;
  }

  /**
   * Cumulative number of distinct codes against respondents. sat: the primary saturation
   * result; when reached, respondent sat.point is marked and the confirming run is shaded.
   */
  function saturationCurve(cumulative, sat) {
    var W = chartWidth(), H = 220, left = 48, right = 20, top = 16, bottom = 34, n = cumulative.length;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': 'Distinct codes as respondents accumulate' });
    var maxY = Math.max.apply(null, cumulative.concat([1])), step = niceStep(maxY, 4), yMax = Math.ceil(maxY / step - 1e-9) * step;
    var x = function (i) { return left + (n <= 1 ? 0 : (i - 1) / (n - 1)) * (W - left - right); };
    var y = function (v) { return top + (1 - v / yMax) * (H - top - bottom); };
    for (var t = 0; t <= yMax + 1e-12; t += step) {
      svg.appendChild(s('line', { x1: left, x2: W - right, y1: y(t), y2: y(t), class: 'grid' }));
      svg.appendChild(s('text', { x: left - 8, y: y(t) + 4, 'text-anchor': 'end', text: String(Math.round(t)) }));
    }
    svg.appendChild(s('text', { x: (left + W - right) / 2, y: H - 6, 'text-anchor': 'middle', text: 'Respondents, in the order received' }));
    // drawn in ink: on the Form A tab the one hue belongs to the salience curve
    var d = cumulative.map(function (c, i) { return (i ? 'L' : 'M') + x(i + 1) + ' ' + y(c); }).join(' ');
    svg.appendChild(s('path', { d: d, class: 'line ink' }));
    if (sat && sat.reached && sat.point >= 1) {
      var p = sat.point;
      svg.appendChild(s('line', { x1: x(p), x2: x(p), y1: top, y2: H - bottom, class: 'ref' }));
      svg.appendChild(s('circle', { cx: x(p), cy: y(cumulative[p - 1]), r: 5, class: 'mark ink ring' }));
      var anchorEnd = x(p) > W - 220;
      svg.appendChild(s('text', { x: x(p) + (anchorEnd ? -8 : 8), y: top + 10, 'text-anchor': anchorEnd ? 'end' : 'start',
        text: 'saturation at ' + p + ', confirmed by ' + sat.confirmedBy }));
    }
    var hit = s('rect', { x: left, y: top, width: W - left - right, height: H - top - bottom, class: 'hit' });
    var cross = s('line', { y1: top, y2: H - bottom, class: 'ref', visibility: 'hidden' });
    svg.appendChild(cross);
    svg.appendChild(hit);
    hit.addEventListener('pointermove', function (e) {
      var r = svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * W;
      var i = Math.max(1, Math.min(n, Math.round((px - left) / (W - left - right) * (n - 1)) + 1));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      showTip(e, cumulative[i - 1] + ' distinct codes', 'after respondent ' + i);
    });
    hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hideTip(); });
    return svg;
  }

  window.Charts = { dotInterval: dotInterval, salienceCurve: salienceCurve, saturationCurve: saturationCurve };
})();
