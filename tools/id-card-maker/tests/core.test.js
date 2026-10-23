'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const cc = require('../js/core.js');

const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'),
);

test('CR80 card size', () => {
  assert.ok(Math.abs(cc.CARD.long / (72 / 25.4) - 85.6) < 1e-9);
  assert.ok(Math.abs(cc.CARD.short / (72 / 25.4) - 54) < 1e-9);
});

test('rowsToPeople: headers, date formatting, duplicate and missing data', () => {
  const r = cc.rowsToPeople([
    ['Employee Name', 'Emp ID', 'Title', 'Dept', 'Blood', 'Mobile', 'Expiry'],
    ['Ravi Kumar', 'E001', 'Engineer', 'Eng', 'B+', '98765', '2027-03-31'],
    ['Meera', 'e001', '', '', '', '', ''],
    ['', 'E003', '', '', '', '', ''],
    ['Asha', 'E004', '', '', '', '', 'whenever'],
  ]);
  assert.equal(r.people.length, 2);
  assert.deepEqual(r.people[0], {
    name: 'Ravi Kumar',
    id: 'E001',
    designation: 'Engineer',
    department: 'Eng',
    blood: 'B+',
    phone: '98765',
    valid: '31 March 2027',
  });
  assert.equal(r.people[1].valid, 'whenever', 'unreadable dates are kept as typed');
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Row 3: employee ID e001 appears twice/);
  assert.match(r.errors[1], /Row 4: name and employee ID/);
  assert.match(cc.rowsToPeople([['Name'], ['A']]).errors[0], /Employee ID column/);
  assert.match(cc.rowsToPeople([['Name']]).errors[0], /header row/);
});

test('initials', () => {
  assert.equal(cc.initials('Ravi Kumar'), 'RK');
  assert.equal(cc.initials('Madonna'), 'M');
  assert.equal(cc.initials('a b c'), 'AC');
  assert.equal(cc.initials('  '), '?');
});

test('matchPhotos by ID or name, case-insensitive; reports leftovers', () => {
  const people = [
    { id: 'E001', name: 'Ravi Kumar' },
    { id: 'E002', name: 'Meera Shah' },
    { id: 'E003', name: 'Asha' },
  ];
  const m = cc.matchPhotos(people, ['e001.JPG', 'Meera Shah.png', 'random.jpg', 'E001.png']);
  assert.deepEqual(m.matched, { E001: 'e001.JPG', E002: 'Meera Shah.png' });
  assert.deepEqual(m.unmatchedFiles, ['random.jpg', 'E001.png']);
  assert.deepEqual(m.withoutPhoto, ['E003']);
});

test('layout: A4 landscape cards 2 x 5; portrait cards; Letter; gap limits; mirror', () => {
  const a = cc.layout({});
  assert.equal(a.cols, 2);
  assert.equal(a.rows, 5);
  assert.equal(a.perPage, 10);
  const p = cc.layout({ orientation: 'portrait' });
  assert.equal(p.cols, 3);
  assert.equal(p.rows, 3);
  assert.equal(cc.layout({ pageSize: 'letter' }).perPage, 8);
  assert.throws(() => cc.layout({ pageSize: 'x' }), /Unknown page size/);
  // cells stay inside the page and do not overlap
  for (let i = 0; i < a.perPage; i++) {
    const c = a.cell(i, false);
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + a.cardW <= a.pageW + 0.01 && c.y + a.cardH <= a.pageH + 0.01);
  }
  const f0 = a.cell(0, false);
  const f1 = a.cell(1, false);
  assert.ok(f1.x > f0.x);
  assert.equal(a.cell(0, true).x, f1.x, 'back page mirrors columns');
  assert.equal(a.cell(1, true).x, f0.x);
  assert.equal(a.cell(10, false).y, a.cell(0, false).y, 'index wraps to the next sheet');
  assert.ok(cc.layout({ gap: 999 }).perPage >= 1);
});

test('buildPdf: page counts with and without backs', async () => {
  const people = Array.from({ length: 12 }, (_, i) => ({
    name: 'Person ' + i,
    id: 'E' + i,
    designation: 'Role',
    department: 'Dept',
    blood: 'O+',
    phone: '999',
    valid: '31 March 2027',
  }));
  const front = await PDFLib.PDFDocument.load(await cc.buildPdf(PDFLib, people, { company: 'Acme' }));
  assert.equal(front.getPageCount(), 2);
  const both = await PDFLib.PDFDocument.load(
    await cc.buildPdf(PDFLib, people, { company: 'Acme', withBack: true, address: '1 Main Road, Pune' }),
  );
  assert.equal(both.getPageCount(), 4);
  const portrait = await PDFLib.PDFDocument.load(await cc.buildPdf(PDFLib, people, { orientation: 'portrait' }));
  assert.equal(portrait.getPageCount(), 2);
  await assert.rejects(() => cc.buildPdf(PDFLib, [], {}), /at least one employee/);
});

test('buildPdf: photos (clipped), logo, odd text and long names do not crash', async () => {
  const people = [
    {
      name: 'A very long employee name that cannot possibly fit on a card',
      id: 'E1',
      designation: 'x'.repeat(100),
      department: 'हिन्दी',
      blood: '',
      phone: '',
      valid: '',
    },
    { name: 'Second', id: 'E2', designation: '', department: '', blood: '', phone: '', valid: '' },
  ];
  const bytes = await cc.buildPdf(PDFLib, people, {
    company: 'Acme Technologies Private Limited India',
    photos: { E1: { bytes: PNG, type: 'png' } },
    logo: { bytes: PNG, type: 'png' },
    withBack: true,
    accent: '#ff0000',
    cutMarks: false,
  });
  assert.ok(bytes.length > 1000);
  const bad = await cc.buildPdf(PDFLib, people.slice(1), { accent: 'not a colour' });
  assert.ok(bad.length > 500);
});

test('sampleRows parse cleanly', () => {
  const r = cc.rowsToPeople(cc.sampleRows());
  assert.deepEqual(r.errors, []);
  assert.equal(r.people.length, 3);
});
