'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lv = require('../js/core.js');

const HOL = { '2026-11-09': 'Govardhan Puja' }; // a Monday
const opts = { holidays: HOL, weekend: [0, 6] };

test('parseHolidays: ISO and DD/MM/YYYY, comments, errors', () => {
  const r = lv.parseHolidays('# list\n2026-11-08 Diwali\n25/12/2026 Christmas\n\nnonsense\n2026-02-30 Bad');
  assert.deepEqual(r.map, { '2026-11-08': 'Diwali', '2026-12-25': 'Christmas' });
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Line 5/);
  assert.deepEqual(lv.parseHolidays('').map, {});
});

test('parseRoster and parseEntitlements', () => {
  const r = lv.parseRoster('Asha, Engineering\nRavi,Engineering\nMeera\nasha, Sales\n# c');
  assert.deepEqual(r.people, [
    { name: 'Asha', team: 'Engineering' },
    { name: 'Ravi', team: 'Engineering' },
    { name: 'Meera', team: 'Everyone' },
  ]);
  assert.match(r.errors[0], /listed twice/);
  const e = lv.parseEntitlements('Casual Leave, 12\nEarned Leave,15.5\nbad line');
  assert.deepEqual(e.map, { 'Casual Leave': 12, 'Earned Leave': 15.5 });
  assert.equal(e.errors.length, 1);
});

test('isWorkingDay: weekends and holidays; custom weekend', () => {
  assert.equal(lv.isWorkingDay('2026-11-06', opts), true); // Fri
  assert.equal(lv.isWorkingDay('2026-11-07', opts), false); // Sat
  assert.equal(lv.isWorkingDay('2026-11-08', opts), false); // Sun
  assert.equal(lv.isWorkingDay('2026-11-09', opts), false); // holiday
  assert.equal(lv.isWorkingDay('2026-11-07', { weekend: [0] }), true);
  assert.equal(lv.isWorkingDay('2026-11-07'), false);
});

test('leaveDays counts working days only, with half days', () => {
  assert.equal(lv.leaveDays('2026-11-05', '2026-11-05', opts), 1);
  assert.equal(lv.leaveDays('2026-11-05', '2026-11-12', opts), 5, 'Thu, Fri, Tue, Wed, Thu (Sat-Sun and the Monday holiday skipped)');
  assert.equal(lv.leaveDays('2026-11-05', '2026-11-12', Object.assign({ halfStart: true }, opts)), 4.5);
  assert.equal(lv.leaveDays('2026-11-05', '2026-11-12', Object.assign({ halfStart: true, halfEnd: true }, opts)), 4);
  assert.equal(
    lv.leaveDays('2026-11-05', '2026-11-05', Object.assign({ halfStart: true, halfEnd: true }, opts)),
    0.5,
    'a one-day leave is half only once',
  );
  assert.equal(lv.leaveDays('2026-11-07', '2026-11-08', opts), 0);
  assert.equal(
    lv.leaveDays('2026-11-07', '2026-11-12', Object.assign({ halfStart: true }, opts)),
    3,
    'half day on a weekend start changes nothing',
  );
  assert.throws(() => lv.leaveDays('2026-11-05', '2026-11-01', opts), /before the start/);
  assert.throws(() => lv.leaveDays('2026-01-01', '2028-01-01', opts), /one year/);
});

test('entriesFromRows: flexible headers, date formats, errors', () => {
  const r = lv.entriesFromRows([
    ['Name', 'Leave Type', 'From', 'To'],
    ['Asha', 'Casual Leave', '05/11/2026', '06/11/2026'],
    ['Ravi', '', '2026-11-12', ''],
    ['', 'x', '2026-11-12', '2026-11-12'],
    ['Meera', 'Sick', '2026-11-12', '2026-11-10'],
  ]);
  assert.equal(r.entries.length, 2);
  assert.deepEqual(r.entries[0], {
    employee: 'Asha',
    type: 'Casual Leave',
    start: '2026-11-05',
    end: '2026-11-06',
    halfStart: false,
    halfEnd: false,
  });
  assert.equal(r.entries[1].type, 'Leave');
  assert.equal(r.entries[1].end, '2026-11-12', 'blank end means a single day');
  assert.equal(r.errors.length, 2);
  assert.match(lv.entriesFromRows([['a', 'b']]).errors[0], /Missing column/);
  assert.match(lv.entriesFromRows([]).errors[0], /empty/);
});

test('daysInYear clips leaves that cross the year end', () => {
  const e = { employee: 'A', type: 'x', start: '2026-12-29', end: '2027-01-05', halfStart: false, halfEnd: false };
  assert.equal(lv.daysInYear(e, 2026, { weekend: [0, 6] }), 3); // Tue 29, Wed 30, Thu 31
  assert.equal(lv.daysInYear(e, 2027, { weekend: [0, 6] }), 3); // Fri 1, Mon 4, Tue 5
  assert.equal(lv.daysInYear(e, 2025, {}), 0);
});

const people = [
  { name: 'Asha', team: 'Eng' },
  { name: 'Ravi', team: 'Eng' },
  { name: 'Meera', team: 'Eng' },
  { name: 'Zoe', team: 'Sales' },
];
const entries = [
  { employee: 'Asha', type: 'Casual Leave', start: '2026-11-05', end: '2026-11-06', halfStart: false, halfEnd: false },
  { employee: 'Ravi', type: 'Casual Leave', start: '2026-11-05', end: '2026-11-05', halfStart: false, halfEnd: false },
  { employee: 'Asha', type: 'Sick Leave', start: '2026-11-12', end: '2026-11-12', halfStart: true, halfEnd: false },
  { employee: 'Visitor', type: 'Mystery', start: '2026-11-12', end: '2026-11-12', halfStart: false, halfEnd: false },
];

test('balances: used, remaining, over-limit, unknown types and people', () => {
  const b = lv.balances(people, entries, { 'Casual Leave': 1, 'Sick Leave': 12 }, 2026, opts);
  const asha = b.find((x) => x.employee === 'Asha');
  assert.deepEqual(
    asha.rows.find((r) => r.type === 'Casual Leave'),
    { type: 'Casual Leave', entitled: 1, used: 2, remaining: -1, over: true },
  );
  assert.equal(asha.rows.find((r) => r.type === 'Sick Leave').used, 0.5);
  assert.equal(asha.totalUsed, 2.5);
  const visitor = b.find((x) => x.employee === 'Visitor');
  assert.equal(visitor.team, 'Not on roster');
  assert.deepEqual(
    visitor.rows.find((r) => r.type === 'Mystery'),
    { type: 'Mystery', entitled: null, used: 1, remaining: null, over: false },
  );
  assert.equal(b.find((x) => x.employee === 'Zoe').totalUsed, 0);
});

test('onLeave and clashes (team share rule, working days only)', () => {
  assert.deepEqual(lv.onLeave(entries, '2026-11-05').sort(), ['Asha', 'Ravi']);
  const c = lv.clashes(people, entries, '2026-11-02', '2026-11-13', 0.5, opts);
  assert.deepEqual(c, [{ date: '2026-11-05', team: 'Eng', away: ['Asha', 'Ravi'], size: 3 }]);
  assert.equal(lv.clashes(people, entries, '2026-11-02', '2026-11-13', 0.9, opts).length, 0);
  assert.deepEqual(
    lv.clashes(
      [{ name: 'Solo', team: 'One' }],
      [{ employee: 'Solo', start: '2026-11-05', end: '2026-11-05' }],
      '2026-11-05',
      '2026-11-05',
      0,
      opts,
    ),
    [],
  );
});

test('overlaps finds same-person overlaps only', () => {
  const o = lv.overlaps([
    ...entries,
    { employee: 'Asha', type: 'Earned Leave', start: '2026-11-06', end: '2026-11-10', halfStart: false, halfEnd: false },
  ]);
  assert.equal(o.length, 1);
  assert.equal(o[0].employee, 'Asha');
  assert.deepEqual(lv.overlaps(entries), []);
});

test('monthGrid codes weekends, holidays, leave and half days', () => {
  const g = lv.monthGrid(people, entries, 2026, 11, opts);
  assert.equal(g.days.length, 30);
  const asha = g.rows.find((r) => r.name === 'Asha').cells;
  assert.equal(asha[4], 'L'); // 5 Nov
  assert.equal(asha[5], 'L'); // 6 Nov
  assert.equal(asha[6], 'W'); // 7 Nov Sat
  assert.equal(asha[8], 'H'); // 9 Nov holiday
  assert.equal(asha[11], 'h'); // 12 Nov half day
  assert.equal(asha[0], 'W', '1 Nov is a Sunday');
  assert.equal(asha[1], '', '2 Nov is a normal working day');
  assert.ok(g.rows.some((r) => r.name === 'Visitor'));
  assert.equal(lv.monthGrid(people, [], 2028, 2, {}).days.length, 29);
});

test('CSV exports: BOM, header, formula safety, working-day counts', () => {
  const b = lv.balances(people, entries, { 'Casual Leave': 12 }, 2026, opts);
  const csv = lv.balancesCsv(b);
  assert.ok(csv.startsWith('﻿Employee,Team,Leave type,Entitled,Used,Remaining\r\n'));
  assert.match(csv, /Asha,Eng,Casual Leave,12,2,10/);
  const ec = lv.entriesCsv([{ employee: '=X', type: 'A', start: '2026-11-05', end: '2026-11-06', halfStart: true, halfEnd: false }], opts);
  assert.match(ec, /'=X,A,2026-11-05,2026-11-06,Yes,,1\.5/);
});
