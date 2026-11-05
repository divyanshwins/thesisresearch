/*
 * xlsx.js: writes an Excel workbook (.xlsx, Office Open XML) in the browser, one sheet per
 * table, with no outside library. Text is stored as inline strings, so Excel never runs a
 * cell as a formula; numbers and true/false keep their type; the header row is bold and frozen.
 * The workbook is a zip archive of a few XML files, stored without compression.
 */
(function () {
  'use strict';

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /** A zip archive (method 0, stored) of [{ name, data: Uint8Array }], as an array of byte chunks. */
  function zip(files) {
    var enc = new TextEncoder(), out = [], central = [], offset = 0, centralSize = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);       // local file header
      local.setUint16(4, 20, true);               // version needed: 2.0
      local.setUint16(6, 0x0800, true);           // names are UTF-8
      local.setUint16(8, 0, true);                // stored, no compression
      local.setUint16(10, 0, true);               // time 00:00
      local.setUint16(12, 0x21, true);            // date 1980-01-01
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      out.push(new Uint8Array(local.buffer), name, data);
      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);          // central directory header
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, 0, true);
      cd.setUint16(14, 0x21, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint16(30, 0, true);
      cd.setUint16(32, 0, true);
      cd.setUint16(34, 0, true);
      cd.setUint16(36, 0, true);
      cd.setUint32(38, 0, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      centralSize += 46 + name.length;
      offset += 30 + name.length + data.length;
    });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);           // end of central directory
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return out.concat(central, [new Uint8Array(end.buffer)]);
  }

  var MAX_CELL = 32767;                           // Excel's limit on the characters in one cell
  /** Drops what XML cannot hold: control characters, U+FFFE/U+FFFF and unpaired surrogates. */
  function xmlSafe(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { out += s[i] + s[i + 1]; i++; }
        continue;
      }
      if ((c >= 0xDC00 && c <= 0xDFFF) || c === 0xFFFE || c === 0xFFFF || (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D)) continue;
      out += s[i];
    }
    return out;
  }
  function esc(s) {
    return xmlSafe(String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function cell(v, ref, bold) {
    var s = bold ? ' s="1"' : '';
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') return isFinite(v) ? '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>' : '';
    if (typeof v === 'boolean') return '<c r="' + ref + '"' + s + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
    var text = Array.isArray(v) ? v.join('; ') : String(v);
    if (text.length > MAX_CELL) text = text.slice(0, MAX_CELL);
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(text) + '</t></is></c>';
  }
  function sheetXml(headers, rows) {
    var x = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
      '<sheetData>'];
    [headers].concat(rows).forEach(function (row, r) {
      x.push('<row r="' + (r + 1) + '">' + row.map(function (v, c) { return cell(v, colName(c) + (r + 1), r === 0); }).join('') + '</row>');
    });
    x.push('</sheetData></worksheet>');
    return x.join('');
  }
  /** Sheet names: at most 31 characters, none of : \ / ? * [ ], unique. */
  function sheetNames(names) {
    var used = {};
    return names.map(function (n) {
      var base = String(n).replace(/[:\\\/?*\[\]]/g, ' ').slice(0, 31) || 'Sheet', name = base, k = 2;
      while (used[name.toLowerCase()]) { name = base.slice(0, 28) + ' ' + k++; }
      used[name.toLowerCase()] = true;
      return name;
    });
  }

  /** sheets: [{ name, headers: [...], rows: [[...], ...] }] -> a Blob holding the .xlsx file. */
  function workbook(sheets) {
    var enc = new TextEncoder(), names = sheetNames(sheets.map(function (s) { return s.name; }));
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var files = [
      { name: '[Content_Types].xml', text: head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '</Types>' },
      { name: '_rels/.rels', text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', text: head + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', text: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', text: head + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' }
    ].concat(sheets.map(function (s, i) { return { name: 'xl/worksheets/sheet' + (i + 1) + '.xml', text: sheetXml(s.headers, s.rows) }; }));
    var parts = zip(files.map(function (f) { return { name: f.name, data: enc.encode(f.text) }; }));
    return typeof Blob !== 'undefined' ? new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) : parts;
  }

  var root = typeof window !== 'undefined' ? window : globalThis;
  root.XLSX_WRITER = { workbook: workbook, crc32: crc32, colName: colName, sheetNames: sheetNames };
})();
