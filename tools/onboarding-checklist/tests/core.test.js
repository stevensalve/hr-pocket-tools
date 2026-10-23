'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ck = require('../js/core.js');

const JOIN = '2026-11-16'; // a Monday
const plan = (extra) => ck.createPlan(Object.assign({ template: 'onboarding', anchor: JOIN, person: 'Ravi Kumar' }, extra));
const byTitle = (p, part) => p.tasks.find((x) => x.title.includes(part));

test('templates are well formed', () => {
  Object.values(ck.TEMPLATES).forEach((tpl) => {
    assert.ok(tpl.tasks.length >= 10);
    tpl.tasks.forEach((x) => assert.ok(x.phase && x.title && x.owner && Number.isInteger(x.offset)));
  });
  assert.equal(ck.TEMPLATES.onboarding.anchorLabel, 'Date of joining');
});

test('adjustWeekend', () => {
  assert.equal(ck.adjustWeekend('2026-11-14', 'prev'), '2026-11-13'); // Sat -> Fri
  assert.equal(ck.adjustWeekend('2026-11-15', 'prev'), '2026-11-13'); // Sun -> Fri
  assert.equal(ck.adjustWeekend('2026-11-14', 'next'), '2026-11-16'); // Sat -> Mon
  assert.equal(ck.adjustWeekend('2026-11-15', 'next'), '2026-11-16'); // Sun -> Mon
  assert.equal(ck.adjustWeekend('2026-11-14', 'none'), '2026-11-14');
  assert.equal(ck.adjustWeekend('2026-11-17', 'next'), '2026-11-17');
});

test('createPlan: due dates from offsets, weekends moved by direction', () => {
  const p = plan();
  assert.equal(p.tasks.length, ck.TEMPLATES.onboarding.tasks.length);
  assert.equal(byTitle(p, 'Welcome, office tour').due, '2026-11-16');
  assert.equal(byTitle(p, 'Send welcome mail').due, '2026-11-09', '7 days before is a Monday');
  assert.equal(byTitle(p, 'Collect identity').due, '2026-11-11');
  assert.equal(byTitle(p, 'Arrange desk').due, '2026-11-13', '3 days before is a Friday');
  assert.equal(byTitle(p, 'Tell the team').due, '2026-11-13', '2 days before is Saturday -> Friday');
  assert.equal(byTitle(p, 'Check-in call').due, '2026-11-23');
  assert.equal(byTitle(p, 'Probation review').due, '2027-02-15', '90 days after, a Sunday, moves to Monday');
  const noShift = plan({ weekends: 'none' });
  assert.equal(byTitle(noShift, 'Tell the team').due, '2026-11-14');
  assert.ok(p.tasks.every((x) => !x.done && x.id > 0));
});

test('createPlan: exit template and validation', () => {
  const p = ck.createPlan({ template: 'exit', anchor: '2026-12-31', person: 'Asha' });
  assert.equal(p.anchorLabel, 'Last working day');
  assert.equal(byTitle(p, 'Disable accounts').due, '2026-12-31');
  assert.ok(byTitle(p, 'Acknowledge resignation').due < '2026-12-31');
  assert.throws(() => ck.createPlan({ template: 'x', anchor: JOIN, person: 'A' }), /Unknown checklist/);
  assert.throws(() => ck.createPlan({ template: 'exit', anchor: JOIN, person: '  ' }), /employee name/);
  assert.throws(() => ck.createPlan({ template: 'exit', anchor: '16/11/2026', person: 'A' }), /look like/);
});

test('toggle, update, add, remove (immutably)', () => {
  const p = plan();
  const t1 = ck.toggle(p, 1);
  assert.equal(t1.tasks[0].done, true);
  assert.equal(p.tasks[0].done, false);
  assert.equal(ck.toggle(t1, 1).tasks[0].done, false);
  assert.throws(() => ck.toggle(p, 999), /No such task/);
  const u = ck.updateTask(p, 2, { title: ' New title ', owner: ' Legal ', due: '2026-12-01', note: 'n' });
  assert.deepEqual([u.tasks[1].title, u.tasks[1].owner, u.tasks[1].due, u.tasks[1].note], ['New title', 'Legal', '2026-12-01', 'n']);
  assert.throws(() => ck.updateTask(p, 2, { title: ' ' }), /needs a title/);
  assert.throws(() => ck.updateTask(p, 2, { due: '2026-02-30' }), /does not exist/);
  assert.equal(ck.updateTask(p, 2, { due: '' }).tasks[1].due, '');
  assert.equal(ck.updateTask(p, 2, { owner: ' ' }).tasks[1].owner, 'Unassigned');
  const a = ck.addTask(p, { title: 'Order business cards', owner: 'Admin', due: '2026-11-20' });
  assert.equal(a.tasks.length, p.tasks.length + 1);
  assert.equal(a.tasks[a.tasks.length - 1].phase, 'Extra');
  assert.throws(() => ck.addTask(p, { title: '' }), /needs a title/);
  assert.equal(ck.removeTask(a, a.tasks[a.tasks.length - 1].id).tasks.length, p.tasks.length);
  assert.throws(() => ck.removeTask(p, 999), /No such task/);
  let big = p;
  while (big.tasks.length < 100) big = ck.addTask(big, { title: 'x' });
  assert.throws(() => ck.addTask(big, { title: 'y' }), /Up to 100/);
});

test('reschedule moves open tasks only', () => {
  let p = plan();
  p = ck.toggle(p, 1);
  const before = p.tasks.map((x) => x.due);
  const r = ck.reschedule(p, '2026-11-23');
  assert.equal(r.anchor, '2026-11-23');
  assert.equal(r.tasks[0].due, before[0], 'done task keeps its date');
  assert.equal(r.tasks[1].due, '2026-11-18', 'open task moved by 7 days (was 2026-11-11)');
});

test('progress: percent, overdue, due soon, per owner', () => {
  let p = plan();
  const today = '2026-11-16';
  let pr = ck.progress(p, today);
  assert.equal(pr.done, 0);
  assert.ok(pr.overdue >= 5, 'pre-joining tasks are overdue on the joining day');
  assert.ok(pr.dueSoon >= 3);
  assert.ok(pr.byOwner.HR.total > 0);
  p.tasks.forEach((x) => (p = ck.toggle(p, x.id)));
  pr = ck.progress(p, today);
  assert.equal(pr.percent, 100);
  assert.equal(pr.overdue, 0);
  assert.equal(pr.byOwner.HR.overdue, 0);
  assert.equal(ck.progress({ tasks: [] }, today).percent, 0);
});

test('byPhase keeps template order', () => {
  const g = ck.byPhase(plan());
  assert.deepEqual(
    g.map((x) => x.phase),
    ['Before joining', 'Day 1', 'First week', 'First 90 days'],
  );
  assert.equal(
    g.reduce((a, x) => a + x.tasks.length, 0),
    plan().tasks.length,
  );
});

test('toCsv and toMarkdown', () => {
  let p = plan();
  p = ck.updateTask(p, 1, { title: '=Cmd, "x"' });
  p = ck.toggle(p, 2);
  const csv = ck.toCsv(p);
  assert.ok(csv.startsWith('\ufeffPhase,Task,Owner,Due,Done,Note\r\n'));
  assert.match(csv, /"'=Cmd, ""x"""/);
  assert.match(csv, /Yes,/);
  const md = ck.toMarkdown(p, '2026-11-16');
  assert.match(md, /^# New joiner onboarding: Ravi Kumar/);
  assert.match(md, /Date of joining: 16 November 2026 \| Progress: 1\/21 \(5%\)/);
  assert.match(md, /- \[x\] Collect identity/);
  assert.match(md, /## Day 1/);
});

test('toIcs: only open dated tasks, escaped and folded', () => {
  let p = plan();
  p = ck.toggle(p, 1);
  p = ck.updateTask(p, 2, { title: 'Collect docs; ID, proof' + ' x'.repeat(60) });
  p = ck.addTask(p, { title: 'No date task' });
  const ics = ck.toIcs(p, '20261023T090000Z');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, p.tasks.filter((x) => x.due && !x.done).length);
  assert.match(ics, /DTSTART;VALUE=DATE:20261111\r\nDTEND;VALUE=DATE:20261112/);
  assert.match(ics, /Collect docs\\; ID\\, proof/);
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('serialize / parse round-trip and hardening', () => {
  let p = plan();
  p = ck.toggle(ck.updateTask(p, 3, { note: 'called' }), 3);
  const back = ck.parse(ck.serialize(p));
  assert.equal(back.person, 'Ravi Kumar');
  assert.equal(back.tasks.length, p.tasks.length);
  assert.equal(back.tasks[2].done, true);
  assert.equal(back.tasks[2].note, 'called');
  assert.throws(() => ck.parse('x'), /not a saved checklist/);
  assert.throws(() => ck.parse('{"app":"onboarding-checklist","plan":{"type":"nope","tasks":[]}}'), /not a saved checklist/);
  const messy = JSON.stringify({
    app: 'onboarding-checklist',
    plan: {
      type: 'exit',
      person: 'A',
      anchor: '2026-12-31',
      tasks: [
        { title: '', due: '2026-12-01' },
        { title: 'ok', due: 'garbage', owner: 'IT' },
      ],
    },
  });
  const m = ck.parse(messy);
  assert.equal(m.tasks.length, 1);
  assert.equal(m.tasks[0].due, '');
  assert.equal(m.tasks[0].owner, 'IT');
});
