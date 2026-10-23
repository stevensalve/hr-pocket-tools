'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const fflate = require('fflate');
const ps = require('../js/core.js');

const CO = { name: 'Acme Technologies', address: '1 Main Road, Pune' };

test('classifyHeaders: identity, earnings, deductions, skipped totals, E:/D: prefixes', () => {
  const c = ps.classifyHeaders([
    'Emp ID',
    'Employee Name',
    'Basic',
    'HRA',
    'Bonus',
    'PF',
    'Professional Tax',
    'TDS',
    'Gross',
    'Net Pay',
    'D: Canteen',
    'E: Shift Allowance',
    'Loan EMI',
    'Remarks',
    '',
  ]);
  assert.equal(c.info.id, 0);
  assert.equal(c.info.name, 1);
  assert.deepEqual(
    c.earnings.map((x) => x.label),
    ['Basic', 'HRA', 'Bonus', 'Shift Allowance'],
  );
  assert.deepEqual(
    c.deductions.map((x) => x.label),
    ['PF', 'Professional Tax', 'TDS', 'Canteen', 'Loan EMI'],
  );
});

test('amountOf', () => {
  assert.equal(ps.amountOf(1500), 1500);
  assert.equal(ps.amountOf('1,500.50'), 1500.5);
  assert.equal(ps.amountOf('Rs. 200'), 200);
  assert.equal(ps.amountOf(''), 0);
  assert.equal(ps.amountOf('-'), 0);
  assert.equal(ps.amountOf('abc'), null);
  assert.equal(ps.amountOf(NaN), null);
});

test('mask keeps the last characters', () => {
  assert.equal(ps.mask('ABCDE1234F'), 'XXXXXX234F');
  assert.equal(ps.mask('123456789012'), 'XXXXXXXX9012');
  assert.equal(ps.mask('1234'), '1234');
  assert.equal(ps.mask(''), '');
});

test('compute: totals, rounding, drops zero lines, words', () => {
  const s = ps.compute({
    emp: { name: 'A' },
    earnings: [
      { label: 'Basic', amount: 40000 },
      { label: 'HRA', amount: 20000.255 },
      { label: 'Zero', amount: 0 },
    ],
    deductions: [{ label: 'PF', amount: 4800 }],
  });
  assert.equal(s.earnings.length, 2);
  assert.equal(s.gross, 60000.26);
  assert.equal(s.totalDeductions, 4800);
  assert.equal(s.net, 55200.26);
  assert.equal(s.netWords, 'Rupees Fifty Five Thousand Two Hundred and Twenty Six Paise Only');
  assert.throws(() => ps.compute({ emp: {}, earnings: [], deductions: [] }), /at least one earning/);
  assert.throws(() => ps.compute({ emp: {}, earnings: [{ label: 'Basic', amount: -5 }], deductions: [] }), /Basic must be a positive/);
  assert.throws(
    () => ps.compute({ emp: {}, earnings: [{ label: 'Basic', amount: 100 }], deductions: [{ label: 'Loan', amount: 500 }] }),
    /more than earnings/,
  );
});

test('rowsToSlips: sample rows, errors by row, skips unreadable rows', () => {
  const ok = ps.rowsToSlips(ps.sampleRows());
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.slips.length, 2);
  const ravi = ok.slips[0];
  assert.equal(ravi.emp.id, 'E001');
  assert.equal(ravi.emp.doj, '2024-04-01');
  assert.equal(ravi.gross, 40000 + 20000 + 33276.92 + 1600);
  assert.equal(ravi.totalDeductions, 4800 + 200 + 6500);
  assert.equal(ravi.earnings.length, 4);
  assert.equal(ok.slips[1].emp.paidDays, '29');
  const bad = ps.rowsToSlips([
    ['Name', 'Basic', 'PF'],
    ['A', '1000', '100'],
    ['', '500', '0'],
    ['B', 'abc', '0'],
    ['C', '100', '500'],
  ]);
  assert.equal(bad.slips.length, 1);
  assert.equal(bad.errors.length, 3);
  assert.match(bad.errors[0], /Row 3: name is empty/);
  assert.match(bad.errors[1], /Row 4 \(B\): Basic is not a number/);
  assert.match(bad.errors[2], /Row 5 \(C\).*more than earnings/);
  assert.match(ps.rowsToSlips([['Basic'], ['1']]).errors[0], /No Name column/);
  assert.match(ps.rowsToSlips([['Name'], ['A']]).errors[0], /No earning columns/);
  assert.match(ps.rowsToSlips([['Name']]).errors[0], /header row/);
  assert.equal(
    ps.rowsToSlips([
      ['Name', 'Basic'],
      ['A', 5],
    ]).slips[0].emp.id,
    'E0001',
  );
});

test('periodLabel', () => {
  assert.equal(ps.periodLabel('2026-10'), 'October 2026');
  assert.equal(ps.periodLabel('2026-01'), 'January 2026');
  assert.throws(() => ps.periodLabel(''), /Choose the pay month/);
  assert.throws(() => ps.periodLabel('2026-13'), /Choose the pay month/);
});

test('fileNames are safe and unique', () => {
  const slips = [{ emp: { id: 'E1', name: 'A/B' } }, { emp: { id: 'E1', name: 'A/B' } }, { emp: { id: 'E2', name: 'C' } }];
  const n = ps.fileNames(slips, 'October 2026');
  assert.deepEqual(n, ['Payslip_E1_A_B_October 2026.pdf', 'Payslip_E1_A_B_October 2026 (2).pdf', 'Payslip_E2_C_October 2026.pdf']);
});

test('buildPdf: one page; masked by default; unmasked on request', async () => {
  const slip = ps.rowsToSlips([
    ['Name', 'PAN', 'Bank Account', 'Basic'],
    ['Ravi \u0939', 'ABCDE1234F', '123456789012', 50000],
  ]).slips[0];
  const bytes = await ps.buildPdf(PDFLib, slip, CO, 'October 2026');
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
  assert.equal((await PDFLib.PDFDocument.load(bytes)).getPageCount(), 1);
  const open = await ps.buildPdf(PDFLib, slip, CO, 'October 2026', { maskIds: false });
  assert.ok(open.length > 500);
  assert.ok(
    ps.buildPdf(
      PDFLib,
      ps.compute({ emp: { name: 'Only' }, earnings: [{ label: 'Basic', amount: 1 }], deductions: [] }),
      {},
      'October 2026',
    ),
  );
});

test('buildCombinedPdf and buildZip', async () => {
  const slips = ps.rowsToSlips(ps.sampleRows()).slips;
  const doc = await PDFLib.PDFDocument.load(await ps.buildCombinedPdf(PDFLib, slips, CO, 'October 2026'));
  assert.equal(doc.getPageCount(), 2);
  const zip = await ps.buildZip(PDFLib, fflate, slips, CO, 'October 2026');
  const files = fflate.unzipSync(zip);
  assert.deepEqual(Object.keys(files).sort(), ['Payslip_E001_Ravi Kumar_October 2026.pdf', 'Payslip_E002_Meera Shah_October 2026.pdf']);
  Object.values(files).forEach((f) => assert.equal(String.fromCharCode(...f.slice(0, 5)), '%PDF-'));
  await assert.rejects(() => ps.buildZip(PDFLib, fflate, [], CO, 'x'), /at least one/);
  await assert.rejects(() => ps.buildCombinedPdf(PDFLib, [], CO, 'x'), /at least one/);
});

test('long lists of earnings still fit on the page', async () => {
  const earnings = Array.from({ length: 14 }, (_, i) => ({ label: 'Allowance ' + i, amount: 100 + i }));
  const slip = ps.compute({ emp: { name: 'Many' }, earnings: earnings, deductions: [] });
  assert.ok((await ps.buildPdf(PDFLib, slip, CO, 'October 2026')).length > 500);
});

test('too many lines are refused instead of running off the page', () => {
  const many = Array.from({ length: 19 }, (_, i) => ({ label: 'L' + i, amount: 1 }));
  assert.throws(() => ps.compute({ emp: {}, earnings: many, deductions: [] }), /up to 18/);
  assert.ok(ps.compute({ emp: {}, earnings: many.slice(0, 18), deductions: [] }));
});

test('sampleCsv has a BOM and the header', () => {
  assert.ok(ps.sampleCsv().startsWith('\ufeffEmployee ID,Name,Designation'));
});
