'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const hc = require('../js/core.js');

const E = (id, dept, joined, left, extra) =>
  Object.assign({ id: id, dept: dept, location: 'Pune', grade: 'L2', gender: 'Unspecified', joined: joined, left: left || '' }, extra);
const emps = [
  E('1', 'Eng', '2020-01-15'),
  E('2', 'Eng', '2021-06-01', '2026-03-31'),
  E('3', 'Eng', '2025-09-10', '2026-02-15'), // first-year leaver
  E('4', 'Sales', '2026-01-05'),
  E('5', 'Sales', '2019-04-01', '2026-01-31'),
  E('6', 'HR', '2026-03-01'),
];

test('rowsToEmployees: header variants, date formats, defaults, row errors', () => {
  const r = hc.rowsToEmployees([
    ['Emp ID', 'Department', 'DOJ', 'LWD', 'Name', 'Email'],
    ['A1', 'Eng', '15/01/2020', '', 'Secret Name', 'x@y.com'],
    ['A2', '', '2021-06-01', '31-03-2026', '', ''],
    ['A3', 'HR', 'garbage', '', '', ''],
    ['A4', 'HR', '2026-05-01', '2026-04-01', '', ''],
    ['A5', 'HR', '2026-05-01', 'soon', '', ''],
  ]);
  assert.equal(r.employees.length, 2);
  assert.deepEqual(r.employees[0], {
    id: 'A1',
    dept: 'Eng',
    location: 'Unspecified',
    grade: 'Unspecified',
    gender: 'Unspecified',
    joined: '2020-01-15',
    left: '',
  });
  assert.equal(r.employees[1].dept, 'Unspecified');
  assert.equal(r.employees[1].left, '2026-03-31');
  assert.equal(r.errors.length, 3);
  assert.match(r.errors.join(' '), /Row 4: joining date/);
  assert.match(r.errors.join(' '), /Row 5: last working day is before/);
  assert.match(r.errors.join(' '), /Row 6: last working day not readable/);
  assert.ok(!JSON.stringify(r.employees).includes('Secret'), 'names are never kept');
  assert.match(hc.rowsToEmployees([['Dept'], ['x']]).errors[0], /No joining date column/);
  assert.match(hc.rowsToEmployees([['DOJ']]).errors[0], /header row/);
});

test('headcountOn: end-of-day count; a leaver is gone from their last working day', () => {
  assert.equal(hc.headcountOn(emps, '2019-12-31'), 1); // only #5 (joined 2019-04-01)
  assert.equal(hc.headcountOn(emps, '2020-01-15'), 2);
  assert.equal(hc.headcountOn(emps, '2026-01-30'), 5, '#5 is still there the day before their last day');
  assert.equal(hc.headcountOn(emps, '2026-01-31'), 4, '#5 left on the 31st, so is not in the 31st closing count');
  assert.equal(hc.headcountOn(emps, '2026-12-31'), 3);
});

test('breakdown: groups, sorted, only active', () => {
  assert.deepEqual(hc.breakdown(emps, '2026-12-31', 'dept'), [
    { label: 'Eng', count: 1 },
    { label: 'HR', count: 1 },
    { label: 'Sales', count: 1 },
  ]);
  assert.deepEqual(
    hc.breakdown(emps, '2026-01-30', 'dept').map((x) => [x.label, x.count]),
    [
      ['Eng', 3],
      ['Sales', 2],
    ],
  );
});

test('monthRange and validation', () => {
  assert.deepEqual(hc.monthRange('2026-02'), ['2026-02-01', '2026-02-28']);
  assert.deepEqual(hc.monthRange('2028-02'), ['2028-02-01', '2028-02-29']);
  assert.throws(() => hc.monthRange('2026-13'), /look like/);
  assert.throws(() => hc.monthlySeries(emps, '2026-05', '2026-01'), /before the start/);
});

test('monthlySeries: opening + joiners - leavers = closing', () => {
  const s = hc.monthlySeries(emps, '2026-01', '2026-04');
  assert.deepEqual(
    s.map((x) => x.month),
    ['2026-01', '2026-02', '2026-03', '2026-04'],
  );
  s.forEach((x) => assert.equal(x.opening + x.joiners - x.leavers, x.closing, x.month));
  assert.deepEqual(s[0], {
    month: '2026-01',
    opening: 4,
    joiners: 1,
    leavers: 1,
    closing: 4,
    attritionPct: Math.round((1 / 4) * 1000) / 10,
  });
  assert.equal(s[1].leavers, 1);
  assert.equal(s[2].joiners, 1);
  assert.equal(s[2].leavers, 1);
  assert.equal(s[3].closing, 3);
  assert.equal(s[3].attritionPct, 0);
});

test('attrition over a period, annualised, first-year share', () => {
  const a = hc.attrition(emps, '2026-01-01', '2026-03-31');
  assert.equal(a.leavers, 3);
  assert.equal(a.joiners, 2);
  assert.equal(a.opening, hc.headcountOn(emps, '2025-12-31'));
  assert.equal(a.closing, hc.headcountOn(emps, '2026-03-31'));
  assert.equal(a.days, 90);
  const avg = (a.opening + a.closing) / 2;
  assert.equal(a.attritionPct, Math.round((3 / avg) * 1000) / 10);
  assert.equal(a.annualisedPct, Math.round((3 / avg) * 100 * (365 / 90) * 10) / 10);
  assert.equal(a.firstYearShare, 33.3);
  assert.throws(() => hc.attrition(emps, '2026-03-31', '2026-01-01'), /before the start/);
  assert.deepEqual(hc.attrition([], '2026-01-01', '2026-01-31').attritionPct, 0);
  assert.equal(hc.attrition(emps, '2026-06-01', '2026-06-30').firstYearShare, 0, 'no leavers -> 0');
});

test('attritionBy: per group, flags small groups, sorted', () => {
  const rows = hc.attritionBy(emps, 'dept', '2026-01-01', '2026-03-31', 5);
  const eng = rows.find((r) => r.label === 'Eng');
  assert.equal(eng.leavers, 2);
  assert.ok(
    rows.every((r) => r.small),
    'all groups here are under 5 people',
  );
  assert.deepEqual(
    rows.map((r) => r.attritionPct),
    rows.map((r) => r.attritionPct).sort((a, b) => b - a),
  );
  assert.equal(hc.attritionBy(emps, 'dept', '2026-01-01', '2026-03-31', 0).filter((r) => r.small).length, 0);
});

test('tenure buckets and average', () => {
  const t = hc.tenure(emps, '2026-12-31');
  assert.equal(
    t.buckets.reduce((a, b) => a + b.count, 0),
    3,
  );
  assert.equal(t.buckets.find((b) => b.label === 'Under 1 year').count, 2, '#4 (Jan 2026) and #6 (Mar 2026)');
  assert.equal(t.buckets.find((b) => b.label === '5 to 10 years').count, 1, '#1 joined Jan 2020');
  assert.ok(t.averageYears > 0);
  assert.equal(hc.tenure([], '2026-01-01').averageYears, 0);
});

test('seriesCsv', () => {
  const csv = hc.seriesCsv(hc.monthlySeries(emps, '2026-01', '2026-02'));
  assert.ok(csv.startsWith('﻿Month,Opening,Joiners,Leavers,Closing,Attrition % (month)\r\n'));
  assert.equal(csv.split('\r\n').length, 3);
});
