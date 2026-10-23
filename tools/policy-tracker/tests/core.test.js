'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pt = require('../js/core.js');

const TODAY = '2026-10-23';
function setup() {
  let s = pt.create();
  s = pt.setPeople(
    s,
    pt.parsePeople('Asha Rao, Engineering, asha@acme.com\nRavi Kumar, Engineering\nMeera Shah, Sales, meera@acme.com\nZoe, Sales').people,
  );
  s = pt.addPolicy(s, 'Code of Conduct', '2026-10-01');
  s = pt.addPolicy(s, 'Data Privacy', '2026-12-01');
  return s;
}
const pid = (s, name) => s.policies.find((p) => p.name === name).id;

test('parsePeople: optional team/email, dedupe, bad e-mail, comments, email in team column', () => {
  const r = pt.parsePeople('# list\nAsha, Eng, asha@x.com\nBob\nasha, Sales\nCy, cy@x.com\nDee, Eng, not-an-email\n\n');
  assert.deepEqual(
    r.people.map((p) => [p.name, p.team, p.email]),
    [
      ['Asha', 'Eng', 'asha@x.com'],
      ['Bob', 'Everyone', ''],
      ['Cy', 'Everyone', 'cy@x.com'],
      ['Dee', 'Eng', ''],
    ],
  );
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /listed twice/);
  assert.match(r.errors[1], /does not look like an e-mail/);
});

test('peopleFromRows: header variants and errors', () => {
  const r = pt.peopleFromRows([
    ['Employee Name', 'Department', 'E-mail'],
    ['Asha', 'Eng', 'a@x.com'],
    ['Bob', '', ''],
  ]);
  assert.deepEqual(
    r.people.map((p) => p.name),
    ['Asha', 'Bob'],
  );
  assert.equal(r.people[0].team, 'Eng');
  assert.match(pt.peopleFromRows([['Team'], ['x']]).errors[0], /No Name column/);
  assert.match(pt.peopleFromRows([['Name']]).errors[0], /header row/);
});

test('policies: add, validate, duplicate, update, remove', () => {
  let s = setup();
  assert.equal(s.policies.length, 2);
  assert.throws(() => pt.addPolicy(s, ' ', ''), /name/);
  assert.throws(() => pt.addPolicy(s, 'data privacy', ''), /already exists/);
  assert.throws(() => pt.addPolicy(s, 'X', '2026-02-30'), /does not exist/);
  s = pt.updatePolicy(s, pid(s, 'Data Privacy'), { due: '2026-11-15', name: 'Data Privacy Policy' });
  assert.equal(s.policies[1].due, '2026-11-15');
  assert.throws(() => pt.updatePolicy(s, 99, {}), /No such policy/);
  assert.throws(() => pt.updatePolicy(s, 1, { name: ' ' }), /name/);
  s = pt.removePolicy(s, 1);
  assert.equal(s.policies.length, 1);
  assert.equal(s.acks[1], undefined);
  let many = pt.create();
  for (let i = 0; i < 30; i++) many = pt.addPolicy(many, 'P' + i, '');
  assert.throws(() => pt.addPolicy(many, 'extra', ''), /Up to 30/);
});

test('setAck / markAll', () => {
  let s = setup();
  const p1 = pid(s, 'Code of Conduct');
  s = pt.setAck(s, p1, 'Asha Rao', '2026-09-20');
  assert.equal(s.acks[p1]['Asha Rao'], '2026-09-20');
  assert.throws(() => pt.setAck(s, p1, 'Nobody', '2026-09-20'), /No such person/);
  assert.throws(() => pt.setAck(s, 99, 'Asha Rao', '2026-09-20'), /No such policy/);
  assert.throws(() => pt.setAck(s, p1, 'Asha Rao', '20/09/2026'), /look like/);
  s = pt.setAck(s, p1, 'Asha Rao', null);
  assert.equal(s.acks[p1]['Asha Rao'], undefined);
  s = pt.markAll(s, p1, '2026-10-02', 'Sales');
  assert.deepEqual(Object.keys(s.acks[p1]).sort(), ['Meera Shah', 'Zoe']);
});

test('importAcks applies records and reports unknowns', () => {
  const s = setup();
  const r = pt.importAcks(s, [
    ['Name', 'Policy', 'Date'],
    ['Asha Rao', 'code of conduct', '15/09/2026'],
    ['Ravi Kumar', 'Data Privacy', ''],
    ['Ghost', 'Data Privacy', ''],
    ['Zoe', 'Nope', ''],
  ]);
  assert.equal(r.applied, 2);
  assert.equal(r.errors.length, 2);
  assert.equal(r.state.acks[pid(s, 'Code of Conduct')]['Asha Rao'], '2026-09-15');
  assert.ok(r.state.acks[pid(s, 'Data Privacy')]['Ravi Kumar'], 'a record without a date still counts as acknowledged');
  assert.match(
    pt.importAcks(s, [
      ['Name', 'Date'],
      ['A', '1'],
    ]).errors[0],
    /Needed columns/,
  );
  assert.match(pt.importAcks(s, [['Name']]).errors[0], /header row/);
});

test('summary: percentages, overdue flag, teams, pending list order', () => {
  let s = setup();
  const [cc, dp] = s.policies.map((p) => p.id);
  s = pt.setAck(s, cc, 'Asha Rao', '2026-09-20');
  s = pt.setAck(s, cc, 'Meera Shah', '2026-09-21');
  s = pt.setAck(s, dp, 'Asha Rao', '2026-10-10');
  const r = pt.summary(s, TODAY);
  assert.deepEqual(
    r.policies.map((p) => [p.name, p.acked, p.total, p.percent, p.overdue]),
    [
      ['Code of Conduct', 2, 4, 50, true],
      ['Data Privacy', 1, 4, 25, false],
    ],
  );
  assert.equal(r.policies[0].pendingCount, 2);
  const eng = r.teams.find((t) => t.team === 'Engineering');
  assert.deepEqual([eng.people, eng.acked, eng.possible, eng.percent], [2, 2, 4, 50]);
  assert.equal(r.teams.find((t) => t.team === 'Sales').percent, 25);
  assert.equal(r.pending.length, 3, 'Asha has finished everything');
  assert.equal(r.pending[0].name, 'Ravi Kumar', 'two outstanding, one overdue: first');
  assert.equal(r.pending[0].policies[0].name, 'Code of Conduct', 'overdue first');
  assert.equal(r.pending[0].policies[0].late, true);
  assert.equal(pt.summary(pt.create(), TODAY).policies.length, 0);
  const all = pt.markAll(pt.markAll(s, cc, '2026-10-02'), dp, '2026-10-02');
  assert.equal(pt.summary(all, TODAY).pending.length, 0);
  assert.equal(pt.summary(all, TODAY).policies[0].overdue, false, 'fully acknowledged is never overdue');
});

test('reminders: wording, overdue-only filter, e-mail line', () => {
  let s = setup();
  s = pt.markAll(s, pid(s, 'Code of Conduct'), '2026-10-02', 'Sales');
  const one = pt.reminderFor(
    pt.summary(s, TODAY).pending.find((p) => p.name === 'Asha Rao'),
    'HR Team',
  );
  assert.match(one, /^Hi Asha,/);
  assert.match(one, /- Code of Conduct \(due 1 October 2026, now overdue\)/);
  assert.match(one, /- Data Privacy \(due 1 December 2026\)/);
  assert.match(one, /Thank you,\nHR Team$/);
  const only = pt.remindersText(s, TODAY, { onlyOverdue: true });
  assert.match(only, /To: asha@acme.com/);
  assert.doesNotMatch(only, /Meera/, 'Sales finished the overdue policy');
  const everyone = pt.remindersText(s, TODAY, {});
  assert.match(everyone, /Meera/);
  assert.match(everyone, /----------/);
  const single = pt.reminderFor({ name: 'Zed Q', policies: [{ name: 'P', due: '', late: false }] }, '');
  assert.match(single, /the following policy:/);
  assert.match(single, /Thank you$/);
});

test('matrixCsv', () => {
  let s = setup();
  s = pt.setAck(s, pid(s, 'Code of Conduct'), 'Asha Rao', '2026-09-20');
  const csv = pt.matrixCsv(s);
  assert.ok(csv.startsWith('﻿Name,Team,Email,Code of Conduct (due 2026-10-01),Data Privacy (due 2026-12-01)\r\n'));
  assert.match(csv, /Asha Rao,Engineering,asha@acme\.com,2026-09-20,\r\n/);
});

test('setPeople drops acknowledgements of people no longer listed', () => {
  let s = setup();
  s = pt.setAck(s, pid(s, 'Code of Conduct'), 'Zoe', '2026-09-20');
  s = pt.setPeople(s, pt.parsePeople('Asha Rao, Engineering').people);
  assert.deepEqual(s.acks[pid(s, 'Code of Conduct')], {});
});

test('serialize / parse round-trip and hardening', () => {
  let s = setup();
  s = pt.setAck(s, pid(s, 'Code of Conduct'), 'Asha Rao', '2026-09-20');
  const back = pt.parse(pt.serialize(s));
  assert.equal(back.people.length, 4);
  assert.equal(back.people[0].email, 'asha@acme.com');
  assert.equal(back.policies.length, 2);
  assert.equal(back.acks[back.policies[0].id]['Asha Rao'], '2026-09-20');
  assert.throws(() => pt.parse('nope'), /not a saved tracker/);
  assert.throws(() => pt.parse('{"app":"x"}'), /not a saved tracker/);
  const messy = JSON.stringify({
    app: 'policy-tracker',
    state: {
      people: [{ name: 'A, B', team: 'T' }],
      policies: [
        { id: 5, name: 'P', due: 'garbage' },
        { id: 6, name: 'p' },
        { id: 7, name: '' },
      ],
      acks: { 5: { 'A B': '2026-01-01', Ghost: '2026-01-01' } },
    },
  });
  const m = pt.parse(messy);
  assert.equal(m.policies.length, 1);
  assert.equal(m.policies[0].due, '');
  assert.deepEqual(Object.keys(m.acks[m.policies[0].id]), ['A B']);
});
